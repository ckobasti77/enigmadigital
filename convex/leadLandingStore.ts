import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireMembership } from "./lib/auth";
import { generateLandingSlug, shortLinkOrigin } from "./lib/orLink";

/**
 * ============================================================================
 * LEAD LANDING STORE (§0, §7, LM7) — Praćenje besplatnih landing stranica
 * ============================================================================
 *
 * Kada Jovan napravi besplatnu stranicu za potencijalnog klijenta (lead) i pošalje
 * link, aplikacija mora precizno da zna DA LI je i KADA klijent otvorio stranicu.
 *
 * NEPREGOVARAČKA PRAVILA (§0, §7, §8):
 * 1. Sirova IP adresa NIKADA ne ulazi u leadSignals ni u leadLandings.
 * 2. Broj otvaranja se NE ČUVA kao polje na firmi/landing-u. Čuvaju se pojedinačni
 *    redovi u leadSignals, a broj se računa dinamički pri čitanju.
 * 3. Nikada ne prikazuj 0 tamo gde vrednost nije poznata — zato hasLanding postoji
 *    odvojeno od openCount.
 * 4. Tri stanja se OBAVEZNO razlikuju u UI:
 *    - Nema stranice (hasLanding: false)
 *    - Stranica napravljena a nije poslata (status: "napravljena", sentAt: undefined)
 *    - Stranica poslata a nije otvorena (status: "poslata", openCount: 0, sentAt definisan)
 * 5. Slug je nepogodljiv (min 10 karaktera iz kriptografskog izvora), nikada ime firme.
 * ============================================================================
 */

const SLUG_ATTEMPTS = 5;

/**
 * Kreira novu praćenu landing stranicu za zadatu firmu.
 *
 * Generiše kriptografski siguran, nepogodljiv slug (min 10 karaktera),
 * upisuje praćeni link u `orTrackedLinks` i vezuje ga za `leadLandings`.
 */
export const createLanding = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    companyId: v.id("leadCompanies"),
    destinationUrl: v.string(),
    label: v.optional(v.string()),
  },
  returns: v.object({
    landingId: v.id("leadLandings"),
    trackedLinkId: v.id("orTrackedLinks"),
    slug: v.string(),
    shortUrl: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const user = await requireMembership(ctx);
    if (user.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "forbidden",
        message: "Nemate pristup ovom radnom prostoru.",
      });
    }

    const company = await ctx.db.get(args.companyId);
    if (!company || company.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "not_found",
        message: "Firma nije pronađena u ovom radnom prostoru.",
      });
    }

    const destinationUrl = args.destinationUrl.trim();
    if (destinationUrl.length === 0) {
      throw new ConvexError({
        code: "invalid_argument",
        message: "Odredišni URL stranice (destinationUrl) ne sme biti prazan.",
      });
    }

    // Generiši nepogodljiv slug (do 5 pokušaja protiv kolizije)
    let slug: string | null = null;
    for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt++) {
      const candidate = generateLandingSlug(12);
      const clash = await ctx.db
        .query("orTrackedLinks")
        .withIndex("by_slug", (q) => q.eq("slug", candidate))
        .first();
      if (clash === null) {
        slug = candidate;
        break;
      }
    }

    if (slug === null) {
      throw new ConvexError({
        code: "slug_generation_failed",
        message: "Nije uspelo generisanje jedinstvenog slug-a nakon 5 pokušaja.",
      });
    }

    const now = Date.now();
    const label = args.label?.trim() || undefined;

    // 1. Upis u orTrackedLinks
    const trackedLinkId = await ctx.db.insert("orTrackedLinks", {
      workspaceId: args.workspaceId,
      channel: "landing",
      slug,
      destinationUrl,
      label,
      createdAt: now,
    });

    // 2. Upis u leadLandings
    const landingId = await ctx.db.insert("leadLandings", {
      workspaceId: args.workspaceId,
      companyId: args.companyId,
      trackedLinkId,
      label,
      createdBy: user.userId,
      createdAt: now,
      status: "napravljena",
    });

    const origin = shortLinkOrigin();
    const shortUrl = origin ? `${origin}/r/${slug}` : undefined;

    return {
      landingId,
      trackedLinkId,
      slug,
      shortUrl,
    };
  },
});

/**
 * Označava landing stranicu kao poslatu klijentu.
 *
 * Postavlja `sentAt` i opcioni `sentVia` (kanal slanja: npr. "viber", "whatsapp", "telefon").
 * Ako je `sentAt` već postavljen, zahteva izričitu potvrdu kroz `overwrite: true`.
 */
export const markLandingSent = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    landingId: v.id("leadLandings"),
    sentAt: v.optional(v.number()),
    sentVia: v.optional(v.string()),
    overwrite: v.optional(v.boolean()),
  },
  returns: v.object({
    success: v.boolean(),
    sentAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const user = await requireMembership(ctx);
    if (user.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "forbidden",
        message: "Nemate pristup ovom radnom prostoru.",
      });
    }

    const landing = await ctx.db.get(args.landingId);
    if (!landing || landing.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "not_found",
        message: "Landing stranica nije pronađena u ovom radnom prostoru.",
      });
    }

    // Zaštita od tihog prepisivanja postojećeg datuma slanja
    if (landing.sentAt !== undefined && !args.overwrite) {
      throw new ConvexError({
        code: "already_sent",
        message:
          "Landing stranica je već označena kao poslata. Za izmenu vremena slanja prosledite overwrite: true.",
      });
    }

    const sentAt = args.sentAt ?? Date.now();
    const sentVia = args.sentVia?.trim() || landing.sentVia;

    await ctx.db.patch(args.landingId, {
      sentAt,
      ...(sentVia ? { sentVia } : {}),
      status: "poslata",
    });

    return {
      success: true,
      sentAt,
    };
  },
});

/**
 * Arhivira landing stranicu koja više nije u aktivnoj upotrebi.
 */
export const archiveLanding = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    landingId: v.id("leadLandings"),
  },
  returns: v.object({
    success: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const user = await requireMembership(ctx);
    if (user.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "forbidden",
        message: "Nemate pristup ovom radnom prostoru.",
      });
    }

    const landing = await ctx.db.get(args.landingId);
    if (!landing || landing.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "not_found",
        message: "Landing stranica nije pronađena u ovom radnom prostoru.",
      });
    }

    await ctx.db.patch(args.landingId, {
      status: "arhivirana",
    });

    return { success: true };
  },
});

/**
 * Vraća listu svih kreiranih landing stranica za jednu firmu sa detaljima linka.
 */
export const listLandingsForCompany = query({
  args: {
    workspaceId: v.id("workspaces"),
    companyId: v.id("leadCompanies"),
  },
  returns: v.array(
    v.object({
      landingId: v.id("leadLandings"),
      companyId: v.id("leadCompanies"),
      trackedLinkId: v.id("orTrackedLinks"),
      label: v.optional(v.string()),
      status: v.union(
        v.literal("napravljena"),
        v.literal("poslata"),
        v.literal("arhivirana"),
      ),
      createdAt: v.number(),
      sentAt: v.optional(v.number()),
      sentVia: v.optional(v.string()),
      slug: v.string(),
      destinationUrl: v.string(),
      shortUrl: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await requireMembership(ctx);
    if (user.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "forbidden",
        message: "Nemate pristup ovom radnom prostoru.",
      });
    }

    const landings = await ctx.db
      .query("leadLandings")
      .withIndex("by_workspace_company", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("companyId", args.companyId),
      )
      .collect();

    const origin = shortLinkOrigin();

    const results = await Promise.all(
      landings.map(async (landing) => {
        const trackedLink = await ctx.db.get(landing.trackedLinkId);
        const slug = trackedLink?.slug ?? "";
        return {
          landingId: landing._id,
          companyId: landing.companyId,
          trackedLinkId: landing.trackedLinkId,
          label: landing.label,
          status: landing.status,
          createdAt: landing.createdAt,
          sentAt: landing.sentAt,
          sentVia: landing.sentVia,
          slug,
          destinationUrl: trackedLink?.destinationUrl ?? "",
          shortUrl: slug && origin ? `${origin}/r/${slug}` : undefined,
        };
      }),
    );

    return results;
  },
});

/**
 * Glavni query za praćenje statusa landing stranica za firmu (§7).
 *
 * Strogo razlikuje tri stanja:
 * 1. Nema stranice (hasLanding: false, landings: [])
 * 2. Stranica postoji, nije poslata (status: "napravljena", sentAt: undefined)
 * 3. Stranica poslata a nije otvorena (status: "poslata", openCount: 0, sentAt postavljen)
 *
 * Broj otvaranja se NIKADA ne čuva kao broj u bazi — računa se dinamički iz
 * pojedinačnih signala u `leadSignals` tabele.
 */
export const landingStatus = query({
  args: {
    workspaceId: v.id("workspaces"),
    companyId: v.id("leadCompanies"),
  },
  returns: v.object({
    hasLanding: v.boolean(),
    landings: v.array(
      v.object({
        landingId: v.id("leadLandings"),
        label: v.optional(v.string()),
        status: v.union(
          v.literal("napravljena"),
          v.literal("poslata"),
          v.literal("arhivirana"),
        ),
        sentAt: v.optional(v.number()),
        sentVia: v.optional(v.string()),
        // Prazan string bi ovde bio laž: „nema slug" i „slug nije pročitan"
        // nisu ista stvar. Ako je praćeni link nestao, ova polja izostaju i
        // `trackedLinkMissing` kaže zašto.
        slug: v.optional(v.string()),
        destinationUrl: v.optional(v.string()),
        trackedLinkMissing: v.boolean(),
        openCount: v.number(),
        lastOpenedAt: v.optional(v.number()),
        firstOpenedAt: v.optional(v.number()),
        botHitsIgnored: v.number(),
        // Zahtevi koji su izgledali kao čovek, ali su odbijeni zbog satnog
        // limita na `/r/`. Zaseban broj od `botHitsIgnored`.
        overCapIgnored: v.number(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const user = await requireMembership(ctx);
    if (user.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "forbidden",
        message: "Nemate pristup ovom radnom prostoru.",
      });
    }

    const company = await ctx.db.get(args.companyId);
    if (!company || company.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "not_found",
        message: "Firma nije pronađena u ovom radnom prostoru.",
      });
    }

    const landings = await ctx.db
      .query("leadLandings")
      .withIndex("by_workspace_company", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("companyId", args.companyId),
      )
      .collect();

    if (landings.length === 0) {
      return {
        hasLanding: false,
        landings: [],
      };
    }

    // Učitaj sve signale tipa "landing_opened" za ovu firmu
    const signals = await ctx.db
      .query("leadSignals")
      .withIndex("by_workspace_company_kind", (q) =>
        q
          .eq("workspaceId", args.workspaceId)
          .eq("companyId", args.companyId)
          .eq("kind", "landing_opened"),
      )
      .collect();

    const processedLandings = await Promise.all(
      landings.map(async (landing) => {
        const trackedLink = await ctx.db.get(landing.trackedLinkId);
        const trackedLinkMissing = trackedLink === null;

        // Signali se vezuju za landing po NJEGOVOM ID-u (`value`), ne po
        // odredišnom URL-u. URL se može promeniti ili se poklopiti sa drugim
        // landingom; ID ne može.
        const landingSignals = signals
          .filter((s) => s.value === landing._id)
          .sort((a, b) => a.observedAt - b.observedAt);

        const openCount = landingSignals.length;
        const firstOpenedAt =
          landingSignals.length > 0 ? landingSignals[0].observedAt : undefined;
        const lastOpenedAt =
          landingSignals.length > 0
            ? landingSignals[landingSignals.length - 1].observedAt
            : undefined;

        // Odbijeni zahtevi za ovaj link — u jednom čitanju, pa razvrstani.
        // Dva odvojena broja, jer su to dva različita razloga odbacivanja.
        const ignorisani = await ctx.db
          .query("orLinkClicks")
          .withIndex("by_link", (q) => q.eq("trackedLinkId", landing.trackedLinkId))
          .filter((q) =>
            q.or(
              q.eq(q.field("isBot"), true),
              q.eq(q.field("overCap"), true),
            ),
          )
          .collect();

        const botHitsIgnored = ignorisani.filter((c) => c.isBot === true).length;
        const overCapIgnored = ignorisani.filter((c) => c.overCap === true).length;

        return {
          landingId: landing._id,
          label: landing.label,
          status: landing.status,
          sentAt: landing.sentAt,
          sentVia: landing.sentVia,
          slug: trackedLink?.slug,
          destinationUrl: trackedLink?.destinationUrl,
          trackedLinkMissing,
          openCount,
          lastOpenedAt,
          firstOpenedAt,
          botHitsIgnored,
          overCapIgnored,
        };
      }),
    );

    return {
      hasLanding: true,
      landings: processedLandings,
    };
  },
});
