import { action, internalMutation, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";
import { decryptCredentials } from "./lib/crypto";
import {
  lookupThreadsProfile,
  searchThreadsKeyword,
  type RawThreadsKeywordSearchItem,
} from "./lib/threadsApi";
import { sanitizeThreadsError } from "./lib/threadsShared";

/**
 * ============================================================================
 * THREADS SEARCH & PROFILE DISCOVERY MODULE (§6, §8, §2.1, Dodatak A.3)
 * ============================================================================
 *
 * Pravila i ograničenja:
 *   1. Kvote (§6, §8):
 *      - Keyword search: 2.200 upita / 24h (zbirno preko svih aplikacija).
 *        Prazni rezultati se NE broje u Meta kvotu — brojač se uvećava TEK
 *        po odgovoru i samo ako rezultat nije prazan.
 *      - Profile lookup: 1.000 zahteva / 24h.
 *   2. Osakaćen doseg (§2.1):
 *      - Bez App Review-a `threads_keyword_search` pretražuje SAMO sopstvene objave
 *        (`scope: "own_posts_only"`).
 *      - `threads_profile_discovery` vraća samo testne/zvanične naloge
 *        (`scope: "testers_only"`).
 *   3. Tri stanja ishoda (Dodatak A.3):
 *      - "success_with_results": pronađene stavke
 *      - "success_empty": uredan odgovor bez rezultata
 *      - "error" / "unavailable": neuspeh koji se NIKADA ne prikazuje kao prazna pretraga
 * ============================================================================
 */

/**
 * §6: 2.200 upita / 24h po KORISNIKU, **zbirno preko svih aplikacija**.
 *
 * Naš brojač vidi samo naše pozive. Ako isti Threads nalog koristi još neku
 * aplikaciju, ona troši iz istog bazena a nama je nevidljiva — pa je
 * `keywordSearchUsed` uvek DONJA GRANICA stvarne potrošnje, nikada tačan broj.
 * UI to mora reći; „180 / 2200" bez te napomene je tvrdnja koju ne možemo
 * podržati.
 */
export const KEYWORD_SEARCH_24H_LIMIT = 2200;
export const PROFILE_LOOKUP_24H_LIMIT = 1000;

/**
 * Doseg rezultata (§2.1). Tri permisije su osakaćene BEZ App Review-a, i svaka
 * na SVOJ način — ne dele isto ograničenje:
 *
 *   threads_keyword_search     → samo naše sopstvene objave
 *   threads_manage_mentions    → samo mention-i od Threads testera aplikacije
 *   threads_profile_discovery  → samo @meta, @threads, @instagram, @facebook
 *
 * Zato `profile_lookup` NE nosi `testers_only` — to je ograničenje mention-a.
 *
 * VAŽNO: doseg se NE MOŽE pročitati iz API-ja. Meta ne vraća polje koje kaže
 * „ova permisija ima Advanced Access". Zato je vrednost koju ovde vraćamo
 * PRETPOSTAVKA, i tako se i označava (`scopeIsAssumed`). Kada App Review prođe,
 * operater postavlja `THREADS_ADVANCED_ACCESS=1` u Convex env i doseg postaje
 * `full`. Bez toga bismo, dan posle odobrenja, i dalje pisali korisniku da
 * pretraga vidi samo njegove objave — tvrdnja koja je tada netačna.
 */
export const scopeValidator = v.union(
  v.literal("meta_accounts_only"),
  v.literal("own_posts_only"),
  v.literal("testers_only"),
  v.literal("full"),
);

export const searchOutcomeStatusValidator = v.union(
  v.literal("success_with_results"),
  v.literal("success_empty"),
  v.literal("error"),
);

export const profileOutcomeStatusValidator = v.union(
  v.literal("success_with_results"),
  v.literal("success_empty"),
  v.literal("unavailable"),
  v.literal("error"),
);

export type SearchKeywordResult = {
  status: "success_with_results" | "success_empty" | "error";
  scope: "own_posts_only" | "full";
  scopeIsAssumed: boolean;
  quotaUsed?: number;
  quotaTotal?: number;
  items: Array<{
    id: string;
    text?: string;
    username?: string;
    permalink?: string;
    timestamp?: string | number;
    mediaType?: string;
    mediaUrl?: string;
    shortcode?: string;
  }>;
  errorMessage?: string;
};

export type LookupProfileResult = {
  status: "success_with_results" | "success_empty" | "unavailable" | "error";
  scope: "meta_accounts_only" | "full";
  scopeIsAssumed: boolean;
  quotaUsed?: number;
  quotaTotal?: number;
  profile?: {
    id?: string;
    username?: string;
    followerCount?: number;
    likesCount?: number;
    quotesCount?: number;
    repostsCount?: number;
    viewsCount?: number;
    isVerified?: boolean;
  };
  unavailableReason?: string;
  errorMessage?: string;
};

/** `true` samo kada je operater potvrdio odobren App Review. */
function hasAdvancedAccess(): boolean {
  return process.env.THREADS_ADVANCED_ACCESS?.trim() === "1";
}

/** Doseg za keyword search — pretpostavka dok se ne potvrdi Advanced Access. */
function keywordScope(): "own_posts_only" | "full" {
  return hasAdvancedAccess() ? "full" : "own_posts_only";
}

/** Doseg za profile lookup — §2.1, bez review-a samo Metini nalozi. */
function profileScope(): "meta_accounts_only" | "full" {
  return hasAdvancedAccess() ? "full" : "meta_accounts_only";
}

// ── Interne funkcije za kvote ───────────────────────────────────────────────

export const getSearchQuotaInternal = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  returns: v.object({
    keywordSearchUsed: v.number(),
    keywordSearchTotal: v.number(),
    profileLookupUsed: v.number(),
    profileLookupTotal: v.number(),
  }),
  handler: async (ctx, { workspaceId }) => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24h prozor

    const recentUsage = await ctx.db
      .query("threadsSearchUsage")
      .withIndex("by_workspace_time", (q) =>
        q.eq("workspaceId", workspaceId).gt("timestamp", cutoff),
      )
      .collect();

    let keywordSearchUsed = 0;
    let profileLookupUsed = 0;

    for (const row of recentUsage) {
      if (row.countedAgainstQuota) {
        if (row.action === "keyword_search") keywordSearchUsed++;
        if (row.action === "profile_lookup") profileLookupUsed++;
      }
    }

    return {
      keywordSearchUsed,
      keywordSearchTotal: KEYWORD_SEARCH_24H_LIMIT,
      profileLookupUsed,
      profileLookupTotal: PROFILE_LOOKUP_24H_LIMIT,
    };
  },
});

export const recordSearchUsageInternal = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    action: v.union(
      v.literal("keyword_search"),
      v.literal("profile_lookup"),
    ),
    resultCount: v.number(),
    countedAgainstQuota: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.insert("threadsSearchUsage", {
      workspaceId: args.workspaceId,
      action: args.action,
      timestamp: now,
      resultCount: args.resultCount,
      countedAgainstQuota: args.countedAgainstQuota,
    });

    // Ažuriramo i threadsQuota snapshot tabelu
    const cutoff = now - 24 * 60 * 60 * 1000;
    const recentUsage = await ctx.db
      .query("threadsSearchUsage")
      .withIndex("by_workspace_time", (q) =>
        q.eq("workspaceId", args.workspaceId).gt("timestamp", cutoff),
      )
      .collect();

    let keywordSearchUsed = 0;
    let profileLookupUsed = 0;

    for (const row of recentUsage) {
      if (row.countedAgainstQuota) {
        if (row.action === "keyword_search") keywordSearchUsed++;
        if (row.action === "profile_lookup") profileLookupUsed++;
      }
    }

    const existingQuota = await ctx.db
      .query("threadsQuota")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .first();

    if (existingQuota !== null) {
      await ctx.db.patch(existingQuota._id, {
        keywordSearchUsed,
        keywordSearchTotal: KEYWORD_SEARCH_24H_LIMIT,
        profileLookupUsed,
        profileLookupTotal: PROFILE_LOOKUP_24H_LIMIT,
        fetchedAt: now,
      });
    } else {
      await ctx.db.insert("threadsQuota", {
        workspaceId: args.workspaceId,
        keywordSearchUsed,
        keywordSearchTotal: KEYWORD_SEARCH_24H_LIMIT,
        profileLookupUsed,
        profileLookupTotal: PROFILE_LOOKUP_24H_LIMIT,
        fetchedAt: now,
      });
    }

    return null;
  },
});

// ── Javni upit za prikaz kvota u UI-ju ───────────────────────────────────────

export const getSearchQuotaInfo = query({
  args: {},
  returns: v.object({
    keywordSearch: v.object({
      used: v.number(),
      total: v.number(),
    }),
    profileLookup: v.object({
      used: v.number(),
      total: v.number(),
    }),
  }),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new ConvexError({ code: "unauthorized" });
    }
    const membership = await ctx.db
      .query("members")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (membership === null) {
      throw new ConvexError({ code: "forbidden" });
    }
    const workspaceId = membership.workspaceId;
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;

    const recentUsage = await ctx.db
      .query("threadsSearchUsage")
      .withIndex("by_workspace_time", (q) =>
        q.eq("workspaceId", workspaceId).gt("timestamp", cutoff),
      )
      .collect();

    let keywordSearchUsed = 0;
    let profileLookupUsed = 0;

    for (const row of recentUsage) {
      if (row.countedAgainstQuota) {
        if (row.action === "keyword_search") keywordSearchUsed++;
        if (row.action === "profile_lookup") profileLookupUsed++;
      }
    }

    return {
      keywordSearch: {
        used: keywordSearchUsed,
        total: KEYWORD_SEARCH_24H_LIMIT,
      },
      profileLookup: {
        used: profileLookupUsed,
        total: PROFILE_LOOKUP_24H_LIMIT,
      },
    };
  },
});

// ── Javna akcija: Pretraga po ključnoj reči ─────────────────────────────────

export const searchKeyword = action({
  args: {
    q: v.string(),
    searchType: v.optional(v.union(v.literal("TOP"), v.literal("RECENT"))),
    searchMode: v.optional(v.union(v.literal("KEYWORD"), v.literal("TAG"))),
    mediaType: v.optional(v.string()),
    authorUsername: v.optional(v.string()),
    since: v.optional(v.number()),
    until: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    status: searchOutcomeStatusValidator,
    scope: scopeValidator,
    scopeIsAssumed: v.boolean(),
    quotaUsed: v.optional(v.number()),
    quotaTotal: v.optional(v.number()),
    items: v.array(
      v.object({
        id: v.string(),
        text: v.optional(v.string()),
        username: v.optional(v.string()),
        permalink: v.optional(v.string()),
        timestamp: v.optional(v.union(v.string(), v.number())),
        mediaType: v.optional(v.string()),
        mediaUrl: v.optional(v.string()),
        shortcode: v.optional(v.string()),
      }),
    ),
    errorMessage: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<SearchKeywordResult> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return {
        status: "error",
        scope: keywordScope(),
        scopeIsAssumed: !hasAdvancedAccess(),
        items: [],
        errorMessage: "Niste prijavljeni.",
      };
    }

    const member: {
      workspaceId: Id<"workspaces">;
      role: "owner" | "client_viewer";
    } | null = await ctx.runQuery(internal.instagramStore.getMembership, {
      userId,
    });

    if (member === null) {
      return {
        status: "error",
        scope: keywordScope(),
        scopeIsAssumed: !hasAdvancedAccess(),
        items: [],
        errorMessage: "Niste član aktivnog radnog prostora.",
      };
    }

    const workspaceId = member.workspaceId;

    const connection = await ctx.runQuery(
      internal.threadsPublishStore.getConnectionForWorkspace,
      { workspaceId },
    );

    if (!connection || connection.status !== "active") {
      return {
        status: "error",
        scope: keywordScope(),
        scopeIsAssumed: !hasAdvancedAccess(),
        items: [],
        errorMessage: "Threads nalog nije povezan ili nije aktivan.",
      };
    }

    let token: string;
    try {
      token = await decryptCredentials(connection.encryptedCredentials);
    } catch (err) {
      return {
        status: "error",
        scope: keywordScope(),
        scopeIsAssumed: !hasAdvancedAccess(),
        items: [],
        errorMessage: `Greška pri dešifrovanju kredencijala: ${sanitizeThreadsError(err)}`,
      };
    }

    // 1. Provera kvote (2.200 / 24h)
    let quota: {
      keywordSearchUsed: number;
      keywordSearchTotal: number;
      profileLookupUsed: number;
      profileLookupTotal: number;
    };
    try {
      quota = await ctx.runQuery(internal.threadsSearch.getSearchQuotaInternal, {
        workspaceId,
      });
    } catch (err) {
      // Ako ne možemo da utvrdimo stanje kvote, prekidamo — ne nagađamo.
      return {
        status: "error",
        scope: keywordScope(),
        scopeIsAssumed: !hasAdvancedAccess(),
        items: [],
        errorMessage: `Ne mogu da utvrdim stanje kvote pretrage: ${sanitizeThreadsError(err)}`,
      };
    }

    if (quota.keywordSearchUsed >= quota.keywordSearchTotal) {
      return {
        status: "error",
        scope: keywordScope(),
        scopeIsAssumed: !hasAdvancedAccess(),
        quotaUsed: quota.keywordSearchUsed,
        quotaTotal: quota.keywordSearchTotal,
        items: [],
        errorMessage: `Threads 24h kvota pretrage po ključnoj reči je popunjena (${quota.keywordSearchUsed}/${quota.keywordSearchTotal}).`,
      };
    }

    // 2. Poziv Threads API-ja
    try {
      const resp = await searchThreadsKeyword({
        accessToken: token,
        q: args.q,
        searchType: args.searchType,
        searchMode: args.searchMode,
        mediaType: args.mediaType,
        authorUsername: args.authorUsername,
        since: args.since,
        until: args.until,
        limit: args.limit,
      });

      const rawItems: RawThreadsKeywordSearchItem[] = resp.data ?? [];
      const formattedItems = rawItems.map((item) => ({
        id: item.id,
        text: item.text,
        username: item.username,
        permalink: item.permalink,
        timestamp: item.timestamp,
        mediaType: item.media_type,
        mediaUrl: item.media_url,
        shortcode: item.shortcode,
      }));

      const hasResults = formattedItems.length > 0;

      // 3. Evidencija kvote:
      // Prazni rezultati se kod keyword search-a NE broje (§6).
      // Zato brojač uvećavamo TEK po odgovoru i samo kad je rezultat neprazan.
      await ctx.runMutation(internal.threadsSearch.recordSearchUsageInternal, {
        workspaceId,
        action: "keyword_search",
        resultCount: formattedItems.length,
        countedAgainstQuota: hasResults,
      });

      const newUsed = hasResults
        ? quota.keywordSearchUsed + 1
        : quota.keywordSearchUsed;

      if (hasResults) {
        return {
          status: "success_with_results",
          scope: keywordScope(),
        scopeIsAssumed: !hasAdvancedAccess(),
          quotaUsed: newUsed,
          quotaTotal: quota.keywordSearchTotal,
          items: formattedItems,
        };
      } else {
        return {
          status: "success_empty",
          scope: keywordScope(),
        scopeIsAssumed: !hasAdvancedAccess(),
          quotaUsed: newUsed,
          quotaTotal: quota.keywordSearchTotal,
          items: [],
        };
      }
    } catch (err) {
      // Neuspeh se ne broji u kvotu i ne sme da izgleda kao prazna pretraga (A.3)
      return {
        status: "error",
        scope: keywordScope(),
        scopeIsAssumed: !hasAdvancedAccess(),
        quotaUsed: quota.keywordSearchUsed,
        quotaTotal: quota.keywordSearchTotal,
        items: [],
        errorMessage: sanitizeThreadsError(err),
      };
    }
  },
});

// ── Javna akcija: Lookup profila ────────────────────────────────────────────

export const lookupProfile = action({
  args: {
    username: v.string(),
  },
  returns: v.object({
    status: profileOutcomeStatusValidator,
    scope: scopeValidator,
    scopeIsAssumed: v.boolean(),
    quotaUsed: v.optional(v.number()),
    quotaTotal: v.optional(v.number()),
    profile: v.optional(
      v.object({
        id: v.optional(v.string()),
        username: v.optional(v.string()),
        followerCount: v.optional(v.number()),
        likesCount: v.optional(v.number()),
        quotesCount: v.optional(v.number()),
        repostsCount: v.optional(v.number()),
        viewsCount: v.optional(v.number()),
        isVerified: v.optional(v.boolean()),
      }),
    ),
    unavailableReason: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
  }),
  handler: async (ctx, { username }): Promise<LookupProfileResult> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return {
        status: "error",
        scope: profileScope(),
        scopeIsAssumed: !hasAdvancedAccess(),
        errorMessage: "Niste prijavljeni.",
      };
    }

    const member: {
      workspaceId: Id<"workspaces">;
      role: "owner" | "client_viewer";
    } | null = await ctx.runQuery(internal.instagramStore.getMembership, {
      userId,
    });

    if (member === null) {
      return {
        status: "error",
        scope: profileScope(),
        scopeIsAssumed: !hasAdvancedAccess(),
        errorMessage: "Niste član aktivnog radnog prostora.",
      };
    }

    const workspaceId = member.workspaceId;

    const connection = await ctx.runQuery(
      internal.threadsPublishStore.getConnectionForWorkspace,
      { workspaceId },
    );

    if (!connection || connection.status !== "active") {
      return {
        status: "error",
        scope: profileScope(),
        scopeIsAssumed: !hasAdvancedAccess(),
        errorMessage: "Threads nalog nije povezan ili nije aktivan.",
      };
    }

    let token: string;
    try {
      token = await decryptCredentials(connection.encryptedCredentials);
    } catch (err) {
      return {
        status: "error",
        scope: profileScope(),
        scopeIsAssumed: !hasAdvancedAccess(),
        errorMessage: `Greška pri dešifrovanju kredencijala: ${sanitizeThreadsError(err)}`,
      };
    }

    // 1. Provera kvote (1.000 / 24h)
    let quota: {
      keywordSearchUsed: number;
      keywordSearchTotal: number;
      profileLookupUsed: number;
      profileLookupTotal: number;
    };
    try {
      quota = await ctx.runQuery(internal.threadsSearch.getSearchQuotaInternal, {
        workspaceId,
      });
    } catch (err) {
      return {
        status: "error",
        scope: profileScope(),
        scopeIsAssumed: !hasAdvancedAccess(),
        errorMessage: `Ne mogu da utvrdim stanje kvote lookup-a profila: ${sanitizeThreadsError(err)}`,
      };
    }

    if (quota.profileLookupUsed >= quota.profileLookupTotal) {
      return {
        status: "error",
        scope: profileScope(),
        scopeIsAssumed: !hasAdvancedAccess(),
        quotaUsed: quota.profileLookupUsed,
        quotaTotal: quota.profileLookupTotal,
        errorMessage: `Threads 24h kvota za lookup profila je popunjena (${quota.profileLookupUsed}/${quota.profileLookupTotal}).`,
      };
    }

    // 2. Poziv Threads API-ja
    try {
      const resp = await lookupThreadsProfile({
        accessToken: token,
        username,
      });

      // Evidentiramo uspešan zahtev u kvotu
      await ctx.runMutation(internal.threadsSearch.recordSearchUsageInternal, {
        workspaceId,
        action: "profile_lookup",
        resultCount: 1,
        countedAgainstQuota: true,
      });

      const newUsed = quota.profileLookupUsed + 1;

      return {
        status: "success_with_results",
        scope: profileScope(),
        scopeIsAssumed: !hasAdvancedAccess(),
        quotaUsed: newUsed,
        quotaTotal: quota.profileLookupTotal,
        profile: {
          id: resp.id,
          username: resp.username ?? username.replace(/^@/, "").trim(),
          followerCount: resp.follower_count,
          likesCount: resp.likes_count,
          quotesCount: resp.quotes_count,
          repostsCount: resp.reposts_count,
          viewsCount: resp.views_count,
          isVerified: resp.is_verified,
        },
      };
    } catch (err) {
      const sanitized = sanitizeThreadsError(err);
      const lower = sanitized.toLowerCase();

      // Provera uslova iz §6: samo javni profili, 18+, min 100 pratilaca.
      // Profil koji ne zadovoljava te uslove ili bez App Review-a nije na listi testera
      // nije sistemska greška — prikazujemo zašto nije dostupan (stanje "unavailable").
      const isUnavailable =
        lower.includes("100") ||
        lower.includes("follower") ||
        lower.includes("private") ||
        lower.includes("not eligible") ||
        lower.includes("permission") ||
        lower.includes("tester") ||
        lower.includes("restricted") ||
        lower.includes("not found") ||
        lower.includes("does not exist") ||
        lower.includes("insufficient");

      if (isUnavailable) {
        return {
          status: "unavailable",
          scope: profileScope(),
        scopeIsAssumed: !hasAdvancedAccess(),
          quotaUsed: quota.profileLookupUsed,
          quotaTotal: quota.profileLookupTotal,
          unavailableReason:
            "Profil nije dostupan za pretragu. Threads Profile Discovery omogućava pretragu isključivo javnih profila sa 18+ godina i minimum 100 pratilaca (dok traje faza bez odobrenog App Review-a, pretraga je moguća samo za testne i zvanične naloge).",
        };
      }

      return {
        status: "error",
        scope: profileScope(),
        scopeIsAssumed: !hasAdvancedAccess(),
        quotaUsed: quota.profileLookupUsed,
        quotaTotal: quota.profileLookupTotal,
        errorMessage: sanitized,
      };
    }
  },
});
