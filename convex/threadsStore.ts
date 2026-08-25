import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { requireMembership } from "./lib/auth";
import { connectionStatusValidator } from "./lib/providers";
import { beginPurgeRun, clearFinishedRuns } from "./purge";
import { getThreadsAppId, getThreadsAppSecret } from "./lib/threadsApi";
import { checkAndLogMediaType } from "./lib/threadsShared";

/**
 * ============================================================================
 * THREADS PERSISTENCE & QUERY LAYER (V8 runtime)
 * ============================================================================
 *
 * Upravljanje stanjem veze i OAuth handshaking za Threads integraciju.
 * Svi kredencijali se čuvaju šifrovano (AES-256-GCM) preko lib/crypto.ts.
 * ============================================================================
 */

// ── OAuth handshake ──────────────────────────────────────────────────────────

/**
 * Zapisuje jednokratni OAuth `state` nonce za Threads povezivanje.
 * Takođe čisti zastarele nonces (>1h).
 */
export const createOAuthState = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    userId: v.id("users"),
    nonce: v.string(),
    redirectUri: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { workspaceId, userId, nonce, redirectUri }) => {
    const cutoff = Date.now() - 60 * 60 * 1000;
    const stale = await ctx.db
      .query("oauthStates")
      .withIndex("by_createdAt", (q) => q.lt("createdAt", cutoff))
      .collect();
    for (const row of stale) {
      await ctx.db.delete(row._id);
    }

    await ctx.db.insert("oauthStates", {
      workspaceId,
      userId,
      provider: "threads",
      nonce,
      redirectUri,
      createdAt: Date.now(),
    });
    return null;
  },
});

/**
 * Atomski pronalazi i briše OAuth `state` nonce.
 * Vraća null ako nonce ne postoji, već je iskorišćen ili pripada drugom provideru.
 */
export const consumeOAuthState = internalMutation({
  args: { nonce: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      workspaceId: v.id("workspaces"),
      redirectUri: v.string(),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, { nonce }) => {
    const row = await ctx.db
      .query("oauthStates")
      .withIndex("by_nonce", (q) => q.eq("nonce", nonce))
      .first();
    if (row === null || row.provider !== "threads") return null;
    await ctx.db.delete(row._id);
    return {
      workspaceId: row.workspaceId,
      redirectUri: row.redirectUri,
      createdAt: row.createdAt,
    };
  },
});

// ── Konekcija ────────────────────────────────────────────────────────────────

/**
 * Čuva šifrovane kredencijale povezane Threads veze.
 * externalId = Threads user ID
 * accountHandle = @username
 */
export const saveConnectedCredentials = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    userId: v.string(),
    username: v.optional(v.string()),
    encryptedCredentials: v.string(),
    expiresAt: v.optional(v.number()),
  },
  returns: v.id("connections"),
  handler: async (
    ctx,
    { workspaceId, userId, username, encryptedCredentials, expiresAt },
  ) => {
    const existing = await ctx.db
      .query("connections")
      .withIndex("by_workspace_provider", (q) =>
        q.eq("workspaceId", workspaceId).eq("provider", "threads"),
      )
      .first();

    await clearFinishedRuns(ctx, workspaceId, "threads");

    const formattedHandle = username
      ? username.startsWith("@")
        ? username
        : `@${username}`
      : undefined;

    const patch = {
      externalId: userId,
      ...(formattedHandle !== undefined ? { accountHandle: formattedHandle } : {}),
      encryptedCredentials,
      status: "active" as const,
      ...(expiresAt !== undefined ? { expiresAt } : {}),
    };

    if (existing !== null) {
      await ctx.db.patch(existing._id, {
        ...patch,
        // Sveže povezivanje poništava prethodna brisanja (R1/4c)
        generation: (existing.generation ?? 0) + 1,
      });
      return existing._id;
    }

    return await ctx.db.insert("connections", {
      workspaceId,
      provider: "threads",
      ...patch,
      generation: 1,
    });
  },
});

/**
 * Vraća podatke o aktivnoj Threads konekciji za zadati workspace.
 */
export const getConnection = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  returns: v.union(
    v.null(),
    v.object({
      connectionId: v.id("connections"),
      userId: v.string(),
      username: v.union(v.string(), v.null()),
      encryptedCredentials: v.string(),
      expiresAt: v.union(v.number(), v.null()),
      status: connectionStatusValidator,
    }),
  ),
  handler: async (ctx, { workspaceId }) => {
    const conn = await ctx.db
      .query("connections")
      .withIndex("by_workspace_provider", (q) =>
        q.eq("workspaceId", workspaceId).eq("provider", "threads"),
      )
      .first();

    if (conn === null || !conn.externalId) return null;

    return {
      connectionId: conn._id,
      userId: conn.externalId,
      username: conn.accountHandle ?? null,
      encryptedCredentials: conn.encryptedCredentials,
      expiresAt: conn.expiresAt ?? null,
      status: conn.status,
    };
  },
});

/**
 * Ažurira datum isteka tokena i opcione nove šifrovane kredencijale nakon uspešnog osvežavanja.
 */
export const updateTokenExpiry = internalMutation({
  args: {
    connectionId: v.id("connections"),
    encryptedCredentials: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, { connectionId, encryptedCredentials, expiresAt }) => {
    const conn = await ctx.db.get(connectionId);
    if (conn === null) return null;
    await ctx.db.patch(connectionId, {
      status: "active",
      ...(encryptedCredentials !== undefined ? { encryptedCredentials } : {}),
      ...(expiresAt !== undefined ? { expiresAt } : {}),
    });
    return null;
  },
});

/**
 * Označava konekciju kao istekla (status = "expired").
 */
export const markConnectionExpired = internalMutation({
  args: { connectionId: v.id("connections") },
  returns: v.null(),
  handler: async (ctx, { connectionId }) => {
    const conn = await ctx.db.get(connectionId);
    if (conn !== null) {
      await ctx.db.patch(connectionId, { status: "expired" });
    }
    return null;
  },
});

/**
 * Označava Threads konekciju kao istekla na osnovu Meta korisničkog identifikatora (externalId).
 * Poziva se iz deauthorize callback endpointa.
 * Red se NE briše (poštuje pravilo za status u schema.ts).
 */
export const markExpiredByExternalId = mutation({
  args: { externalId: v.string() },
  returns: v.null(),
  handler: async (ctx, { externalId }) => {
    const conn = await ctx.db
      .query("connections")
      .withIndex("by_provider", (q) => q.eq("provider", "threads"))
      .filter((q) => q.eq(q.field("externalId"), externalId))
      .first();

    if (conn !== null) {
      await ctx.db.patch(conn._id, { status: "expired" });
    }
    return null;
  },
});

/**
 * Pokreće proces brisanja podataka za Threads nalog na osnovu Meta korisničkog identifikatora (externalId).
 * Poziva se iz data-deletion callback endpointa.
 * Koristi postojeći purge mehanizam (beginPurgeRun) i vraća confirmationCode.
 */
export const triggerDataDeletionByExternalId = mutation({
  args: { externalId: v.string() },
  returns: v.object({
    confirmationCode: v.string(),
  }),
  handler: async (ctx, { externalId }) => {
    const conn = await ctx.db
      .query("connections")
      .withIndex("by_provider", (q) => q.eq("provider", "threads"))
      .filter((q) => q.eq(q.field("externalId"), externalId))
      .first();

    if (conn === null) {
      // Nalog nije pronađen — podaci ne postoje ili su već obrisani
      return { confirmationCode: `del_completed_${Date.now()}` };
    }

    if (conn.status === "disconnecting") {
      // Brisanje je već pokrenuto — pronađi aktivan ili postojeći run
      const existingRun = await ctx.db
        .query("purgeRuns")
        .withIndex("by_workspace_provider", (q) =>
          q.eq("workspaceId", conn.workspaceId).eq("provider", "threads"),
        )
        .first();
      if (existingRun !== null) {
        return { confirmationCode: existingRun._id };
      }
    }

    await clearFinishedRuns(ctx, conn.workspaceId, "threads");
    await ctx.db.patch(conn._id, { status: "disconnecting" });
    const runId = await beginPurgeRun(ctx, {
      workspaceId: conn.workspaceId,
      provider: "threads",
      connectionId: conn._id,
    });

    return { confirmationCode: runId };
  },
});

/**
 * Očitava status zahteva za brisanje podataka na osnovu koda potvrde.
 */
export const getDeletionStatus = query({
  args: { confirmationCode: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      status: v.string(),
      startedAt: v.number(),
      finishedAt: v.union(v.number(), v.null()),
    }),
  ),
  handler: async (ctx, { confirmationCode }) => {
    if (confirmationCode.startsWith("del_completed_")) {
      return {
        status: "done",
        startedAt: Date.now(),
        finishedAt: Date.now(),
      };
    }
    try {
      const run = await ctx.db.get(confirmationCode as Id<"purgeRuns">);
      if (run === null) return null;
      return {
        status: run.status,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt ?? null,
      };
    } catch {
      return null;
    }
  },
});

/**
 * Provera da li su THREADS_APP_ID i THREADS_APP_SECRET podešeni.
 */
export const setupInfo = query({
  args: {},
  returns: v.object({
    isConfigured: v.boolean(),
  }),
  handler: async (ctx) => {
    await requireMembership(ctx);
    const appId = getThreadsAppId();
    const appSecret = getThreadsAppSecret();
    return {
      isConfigured: Boolean(appId && appSecret),
    };
  },
});
// ── Webhooks ─────────────────────────────────────────────────────────────────

/**
 * Interna mutacija za evidentiranje primljenog Threads odgovora (replies webhook događaj).
 *
 * Idempotentnost:
 *   - Oslanja se na `id` kao prirodni ključ (Meta reply ID).
 *   - Kada tabela za Threads odgovore (npr. `threadsReplies`) bude definisana u sledećoj fazi,
 *     ovde se vrši provera postojanja po indeksu `by_reply_id` pre upisa, čime se sprečavaju duplikati
 *     pri ponovljenim isporukama od strane Mete.
 *
 * Bezbednost i privatnost:
 *   - Ne loguje se celokupan payload jer sadrži korisničko ime (`username`) i tekst odgovora (`text`) (PII).
 *   - Tajne i tokeni se nikada ne ispisuju.
 */
export const recordWebhookReply = internalMutation({
  args: {
    id: v.string(),
    accountId: v.optional(v.string()),
    field: v.optional(v.string()),
    username: v.optional(v.string()),
    text: v.optional(v.string()),
    mediaType: v.optional(v.string()),
    permalink: v.optional(v.string()),
    repliedTo: v.optional(v.any()),
    rootPost: v.optional(v.any()),
    shortcode: v.optional(v.string()),
    timestamp: v.optional(v.union(v.string(), v.number())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Bezbedno logovanje: SAMO tehnički metapodaci bez PII (username, text) i bez tajni
    console.log("[Threads webhook reply received]", {
      id: args.id,
      accountId: args.accountId,
      field: args.field,
      mediaType: args.mediaType,
      hasText: Boolean(args.text),
      hasUsername: Boolean(args.username),
    });

    let workspaceId: Id<"workspaces"> | undefined;
    if (args.accountId) {
      const conn = await ctx.db
        .query("connections")
        .withIndex("by_provider", (q) => q.eq("provider", "threads"))
        .filter((q) => q.eq(q.field("externalId"), args.accountId))
        .first();
      workspaceId = conn?.workspaceId;
    }

    const rootPostId =
      typeof args.rootPost === "object" && args.rootPost !== null
        ? typeof args.rootPost.id === "string"
          ? args.rootPost.id
          : undefined
        : typeof args.rootPost === "string"
          ? args.rootPost
          : undefined;

    const repliedToId =
      typeof args.repliedTo === "object" && args.repliedTo !== null
        ? typeof args.repliedTo.id === "string"
          ? args.repliedTo.id
          : undefined
        : typeof args.repliedTo === "string"
          ? args.repliedTo
          : undefined;

    if (!workspaceId && rootPostId) {
      const post = await ctx.db
        .query("threadsPosts")
        .withIndex("by_media", (q) => q.eq("mediaId", rootPostId))
        .first();
      workspaceId = post?.workspaceId;
    }

    if (!workspaceId && repliedToId) {
      const post = await ctx.db
        .query("threadsPosts")
        .withIndex("by_media", (q) => q.eq("mediaId", repliedToId))
        .first();

      if (post) {
        workspaceId = post.workspaceId;
      } else {
        const parentReply = await ctx.db
          .query("threadsReplies")
          .withIndex("by_reply_id", (q) => q.eq("replyId", repliedToId))
          .first();
        workspaceId = parentReply?.workspaceId;
      }
    }

    if (!workspaceId) {
      // Threads JE isporučio odgovor — samo ne umemo da ga pripišemo. Tiho
      // `return null` ovde je bio kvar koji se ne vidi: aplikacija se ponaša
      // kao da ništa nije stiglo, a webhook nema ponovno slanje. Neuspela
      // operacija ne sme da izgleda kao prazan rezultat, pa se propuštanje
      // beleži glasno — i to SAMO tehničkim ID-jevima, bez `username` i
      // `text`, koji su tuđi lični podaci.
      console.warn("[Threads webhook reply DROPPED — nepoznat workspace]", {
        replyId: args.id,
        accountId: args.accountId,
        rootPostId,
        repliedToId,
        razlog:
          "Nijedna threads konekcija, objava ni roditeljski odgovor ne odgovaraju ovim ID-jevima. Najverovatnije objava još nije sinhronizovana.",
      });
      return null;
    }

    const existing = await ctx.db
      .query("threadsReplies")
      .withIndex("by_reply_id", (q) => q.eq("replyId", args.id))
      .first();

    const ts =
      typeof args.timestamp === "string"
        ? Date.parse(args.timestamp) || args.timestamp
        : (args.timestamp ?? Date.now());

    if (existing === null) {
      await ctx.db.insert("threadsReplies", {
        workspaceId,
        replyId: args.id,
        username: args.username,
        text: args.text,
        mediaType: args.mediaType,
        permalink: args.permalink,
        shortcode: args.shortcode,
        rootPostId,
        repliedToId,
        isReply: true,
        source: "webhook",
        timestamp: ts,
        receivedAt: Date.now(),
      });
    } else {
      // Idempotentno ažuriranje: ne prepisujemo naslepo postojeća polja praznim
      await ctx.db.patch(existing._id, {
        ...(args.username ? { username: args.username } : {}),
        ...(args.text ? { text: args.text } : {}),
        ...(args.mediaType ? { mediaType: args.mediaType } : {}),
        ...(args.permalink ? { permalink: args.permalink } : {}),
        ...(args.shortcode ? { shortcode: args.shortcode } : {}),
        ...(rootPostId ? { rootPostId } : {}),
        ...(repliedToId ? { repliedToId } : {}),
        ...(ts ? { timestamp: ts } : {}),
      });
    }

    // Okidanje OpenReply procene pravila za Threads odgovore (TH8)
    await ctx.scheduler.runAfter(
      0,
      internal.threadsAutomations.evaluateReplyTrigger,
      {
        workspaceId,
        replyId: args.id,
      },
    );

    return null;
  },
});




// ── Pomoćne funkcije za konekciju ─────────────────────────────────────────────

/**
 * Ažurira @username (accountHandle) na Threads konekciji.
 */
export const saveAccountHandle = internalMutation({
  args: { connectionId: v.id("connections"), handle: v.string() },
  returns: v.null(),
  handler: async (ctx, { connectionId, handle }) => {
    const conn = await ctx.db.get(connectionId);
    if (conn === null) return null;
    const formatted = handle.startsWith("@") ? handle : `@${handle}`;
    if (conn.accountHandle === formatted) return null;
    await ctx.db.patch(connectionId, { accountHandle: formatted });
    return null;
  },
});

/**
 * Vraća podatke o Threads konekciji po connectionId ili workspaceId.
 */
export const getThreadsConnection = internalQuery({
  args: {
    connectionId: v.optional(v.id("connections")),
    workspaceId: v.optional(v.id("workspaces")),
  },
  returns: v.union(
    v.null(),
    v.object({
      connectionId: v.id("connections"),
      workspaceId: v.id("workspaces"),
      userId: v.string(),
      username: v.union(v.string(), v.null()),
      encryptedCredentials: v.string(),
      expiresAt: v.union(v.number(), v.null()),
      status: connectionStatusValidator,
    }),
  ),
  handler: async (ctx, { connectionId, workspaceId }) => {
    let conn = null;
    if (connectionId) {
      conn = await ctx.db.get(connectionId);
    } else if (workspaceId) {
      conn = await ctx.db
        .query("connections")
        .withIndex("by_workspace_provider", (q) =>
          q.eq("workspaceId", workspaceId).eq("provider", "threads"),
        )
        .first();
    }
    if (conn === null || conn.provider !== "threads" || !conn.externalId) {
      return null;
    }
    return {
      connectionId: conn._id,
      workspaceId: conn.workspaceId,
      userId: conn.externalId,
      username: conn.accountHandle ?? null,
      encryptedCredentials: conn.encryptedCredentials,
      expiresAt: conn.expiresAt ?? null,
      status: conn.status,
    };
  },
});

// ── Validatori za Threads tabele (TH3) ────────────────────────────────────────

export const threadsPostRowValidator = v.object({
  mediaId: v.string(),
  mediaProductType: v.optional(v.string()),
  mediaType: v.string(),
  permalink: v.optional(v.string()),
  ownerId: v.optional(v.string()),
  username: v.optional(v.string()),
  text: v.optional(v.string()),
  timestamp: v.optional(v.string()),
  shortcode: v.optional(v.string()),
  isQuotePost: v.optional(v.boolean()),
  quotedPostId: v.optional(v.string()),
  repostedPostId: v.optional(v.string()),
  pollAttachment: v.optional(v.any()),
  hasReplies: v.optional(v.boolean()),
  rootPostId: v.optional(v.string()),
  repliedToId: v.optional(v.string()),
  isReply: v.optional(v.boolean()),
  isReplyOwnedByMe: v.optional(v.boolean()),
  replyAudience: v.optional(v.string()),
  mediaUrl: v.optional(v.string()),
  thumbnailUrl: v.optional(v.string()),
  children: v.optional(
    v.array(
      v.object({
        id: v.string(),
        mediaType: v.optional(v.string()),
        mediaUrl: v.optional(v.string()),
        thumbnailUrl: v.optional(v.string()),
      }),
    ),
  ),
  altText: v.optional(v.string()),
  linkAttachmentUrl: v.optional(v.string()),
  topicTag: v.optional(v.string()),
  locationId: v.optional(v.string()),
  hideStatus: v.optional(v.string()),
  syncedAt: v.optional(v.number()),
});

export const threadsPostInsightRowValidator = v.object({
  mediaId: v.string(),
  date: v.string(),
  views: v.optional(v.number()),
  likes: v.optional(v.number()),
  replies: v.optional(v.number()),
  reposts: v.optional(v.number()),
  quotes: v.optional(v.number()),
  shares: v.optional(v.number()),
  fetchedAt: v.optional(v.number()),
});

export const threadsAccountDailyRowValidator = v.object({
  date: v.string(),
  views: v.optional(v.number()),
  fetchedAt: v.optional(v.number()),
});

export const threadsAccountTotalsValidator = v.object({
  likes: v.optional(v.number()),
  replies: v.optional(v.number()),
  reposts: v.optional(v.number()),
  quotes: v.optional(v.number()),
  fetchedAt: v.number(),
});

export const threadsClicksByUrlRowValidator = v.object({
  date: v.string(),
  url: v.string(),
  clicks: v.optional(v.number()),
  fetchedAt: v.optional(v.number()),
});

export const threadsFollowerSnapshotRowValidator = v.object({
  date: v.string(),
  takenAt: v.number(),
  followersCount: v.optional(v.number()),
});

export const threadsDemographicsRowValidator = v.object({
  date: v.string(),
  breakdown: v.union(
    v.literal("country"),
    v.literal("city"),
    v.literal("age"),
    v.literal("gender"),
  ),
  key: v.string(),
  value: v.optional(v.number()),
  takenAt: v.number(),
});

export const threadsReplyRowValidator = v.object({
  replyId: v.string(),
  text: v.optional(v.string()),
  username: v.optional(v.string()),
  permalink: v.optional(v.string()),
  timestamp: v.optional(v.union(v.string(), v.number())),
  mediaType: v.optional(v.string()),
  mediaUrl: v.optional(v.string()),
  shortcode: v.optional(v.string()),
  ownerId: v.optional(v.string()),
  rootPostId: v.optional(v.string()),
  repliedToId: v.optional(v.string()),
  isReply: v.optional(v.boolean()),
  isReplyOwnedByMe: v.optional(v.boolean()),
  hasReplies: v.optional(v.boolean()),
  replyAudience: v.optional(v.string()),
  approvalStatus: v.optional(v.string()),
  hideStatus: v.optional(v.string()),
  source: v.string(),
  receivedAt: v.optional(v.number()),
});

// ── Glavna mutacija za perzistenciju (TH3) ────────────────────────────────────

/**
 * Jedna interna mutacija koja prima nizove i upisuje ih u tabele iz TH3,
 * uvek upsertom po prirodnom ključu (nikad slepi `insert`).
 */
export const upsertThreadsData = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    posts: v.optional(v.array(threadsPostRowValidator)),
    postInsights: v.optional(v.array(threadsPostInsightRowValidator)),
    accountDaily: v.optional(v.array(threadsAccountDailyRowValidator)),
    accountTotals: v.optional(threadsAccountTotalsValidator),
    clicksByUrl: v.optional(v.array(threadsClicksByUrlRowValidator)),
    followerSnapshots: v.optional(v.array(threadsFollowerSnapshotRowValidator)),
    demographics: v.optional(v.array(threadsDemographicsRowValidator)),
    replies: v.optional(v.array(threadsReplyRowValidator)),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    let itemsWritten = 0;
    const { workspaceId } = args;
    const now = Date.now();

    // 1. threadsPosts (prirodni ključ: [workspaceId, mediaId])
    if (args.posts && args.posts.length > 0) {
      for (const post of args.posts) {
        checkAndLogMediaType(post.mediaType);
        if (post.children) {
          for (const ch of post.children) {
            checkAndLogMediaType(ch.mediaType);
          }
        }

        const existing = await ctx.db
          .query("threadsPosts")
          .withIndex("by_workspace_media", (q) =>
            q.eq("workspaceId", workspaceId).eq("mediaId", post.mediaId),
          )
          .first();

        if (existing !== null) {
          await ctx.db.patch(existing._id, {
            ...post,
            syncedAt: post.syncedAt ?? now,
          });
        } else {
          await ctx.db.insert("threadsPosts", {
            workspaceId,
            ...post,
            syncedAt: post.syncedAt ?? now,
          });
        }
        itemsWritten++;
      }
    }

    // 2. threadsPostInsights (prirodni ključ: [workspaceId, mediaId, date])
    if (args.postInsights && args.postInsights.length > 0) {
      for (const insight of args.postInsights) {
        const existing = await ctx.db
          .query("threadsPostInsights")
          .withIndex("by_workspace_media_date", (q) =>
            q
              .eq("workspaceId", workspaceId)
              .eq("mediaId", insight.mediaId)
              .eq("date", insight.date),
          )
          .first();

        if (existing !== null) {
          await ctx.db.patch(existing._id, {
            ...insight,
            fetchedAt: insight.fetchedAt ?? now,
          });
        } else {
          await ctx.db.insert("threadsPostInsights", {
            workspaceId,
            ...insight,
            fetchedAt: insight.fetchedAt ?? now,
          });
        }
        itemsWritten++;
      }
    }

    // 3. threadsAccountDaily (prirodni ključ: [workspaceId, date])
    if (args.accountDaily && args.accountDaily.length > 0) {
      for (const daily of args.accountDaily) {
        const existing = await ctx.db
          .query("threadsAccountDaily")
          .withIndex("by_workspace_date", (q) =>
            q.eq("workspaceId", workspaceId).eq("date", daily.date),
          )
          .first();

        if (existing !== null) {
          await ctx.db.patch(existing._id, {
            ...daily,
            fetchedAt: daily.fetchedAt ?? now,
          });
        } else {
          await ctx.db.insert("threadsAccountDaily", {
            workspaceId,
            ...daily,
            fetchedAt: daily.fetchedAt ?? now,
          });
        }
        itemsWritten++;
      }
    }

    // 4. threadsAccountTotals (prirodni ključ: [workspaceId])
    if (args.accountTotals) {
      const existing = await ctx.db
        .query("threadsAccountTotals")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
        .first();

      if (existing !== null) {
        await ctx.db.patch(existing._id, {
          ...args.accountTotals,
        });
      } else {
        await ctx.db.insert("threadsAccountTotals", {
          workspaceId,
          ...args.accountTotals,
        });
      }
      itemsWritten++;
    }

    // 5. threadsClicksByUrl (prirodni ključ: [workspaceId, date, url])
    if (args.clicksByUrl && args.clicksByUrl.length > 0) {
      for (const click of args.clicksByUrl) {
        const existing = await ctx.db
          .query("threadsClicksByUrl")
          .withIndex("by_workspace_date_url", (q) =>
            q
              .eq("workspaceId", workspaceId)
              .eq("date", click.date)
              .eq("url", click.url),
          )
          .first();

        if (existing !== null) {
          await ctx.db.patch(existing._id, {
            ...click,
            fetchedAt: click.fetchedAt ?? now,
          });
        } else {
          await ctx.db.insert("threadsClicksByUrl", {
            workspaceId,
            ...click,
            fetchedAt: click.fetchedAt ?? now,
          });
        }
        itemsWritten++;
      }

      const clickDates = Array.from(new Set(args.clicksByUrl.map((c) => c.date)));
      await ctx.scheduler.runAfter(
        0,
        internal.threadsFunnels.recomputeAttributionForDates,
        { workspaceId, dates: clickDates },
      );
    }


    // 6. threadsFollowerSnapshots (prirodni ključ: [workspaceId, date] — tačno jedan red po danu)
    if (args.followerSnapshots && args.followerSnapshots.length > 0) {
      for (const snapshot of args.followerSnapshots) {
        const existing = await ctx.db
          .query("threadsFollowerSnapshots")
          .withIndex("by_workspace_date", (q) =>
            q.eq("workspaceId", workspaceId).eq("date", snapshot.date),
          )
          .first();

        if (existing !== null) {
          await ctx.db.patch(existing._id, {
            takenAt: snapshot.takenAt,
            ...(snapshot.followersCount !== undefined
              ? { followersCount: snapshot.followersCount }
              : {}),
          });
        } else {
          await ctx.db.insert("threadsFollowerSnapshots", {
            workspaceId,
            date: snapshot.date,
            takenAt: snapshot.takenAt,
            ...(snapshot.followersCount !== undefined
              ? { followersCount: snapshot.followersCount }
              : {}),
          });
        }
        itemsWritten++;
      }
    }

    // 7. threadsDemographics (prirodni ključ: [workspaceId, date, breakdown, key])
    if (args.demographics && args.demographics.length > 0) {
      for (const demo of args.demographics) {
        const existing = await ctx.db
          .query("threadsDemographics")
          .withIndex("by_workspace_date_breakdown_key", (q) =>
            q
              .eq("workspaceId", workspaceId)
              .eq("date", demo.date)
              .eq("breakdown", demo.breakdown)
              .eq("key", demo.key),
          )
          .first();

        if (existing !== null) {
          await ctx.db.patch(existing._id, {
            ...(demo.value !== undefined ? { value: demo.value } : {}),
            takenAt: demo.takenAt,
          });
        } else {
          await ctx.db.insert("threadsDemographics", {
            workspaceId,
            ...demo,
          });
        }
        itemsWritten++;
      }
    }

    // 8. threadsReplies (prirodni ključ: [workspaceId, replyId])
    if (args.replies && args.replies.length > 0) {
      for (const reply of args.replies) {
        checkAndLogMediaType(reply.mediaType);

        const existing = await ctx.db
          .query("threadsReplies")
          .withIndex("by_workspace_reply", (q) =>
            q.eq("workspaceId", workspaceId).eq("replyId", reply.replyId),
          )
          .first();

        if (existing !== null) {
          await ctx.db.patch(existing._id, {
            ...reply,
            receivedAt: reply.receivedAt ?? now,
          });
        } else {
          await ctx.db.insert("threadsReplies", {
            workspaceId,
            ...reply,
            receivedAt: reply.receivedAt ?? now,
          });
        }
        itemsWritten++;
      }
    }

    return itemsWritten;
  },
});

// ── Kvote (Resurs 10, TH3) ───────────────────────────────────────────────────

/**
 * Upisuje podatke o kvotama u tabelu `threadsQuota` (prirodni ključ: [workspaceId]).
 */
export const recordThreadsQuota = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    postsUsed: v.optional(v.number()),
    postsTotal: v.optional(v.number()),
    repliesUsed: v.optional(v.number()),
    repliesTotal: v.optional(v.number()),
    deleteUsed: v.optional(v.number()),
    deleteTotal: v.optional(v.number()),
    locationSearchUsed: v.optional(v.number()),
    locationSearchTotal: v.optional(v.number()),
    keywordSearchUsed: v.optional(v.number()),
    keywordSearchTotal: v.optional(v.number()),
    profileLookupUsed: v.optional(v.number()),
    profileLookupTotal: v.optional(v.number()),
    quotaDurationSeconds: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { workspaceId, ...quotaFields } = args;
    const existing = await ctx.db
      .query("threadsQuota")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .first();

    const now = Date.now();
    if (existing !== null) {
      await ctx.db.patch(existing._id, {
        ...quotaFields,
        fetchedAt: now,
      });
    } else {
      await ctx.db.insert("threadsQuota", {
        workspaceId,
        ...quotaFields,
        fetchedAt: now,
      });
    }
    return null;
  },
});

