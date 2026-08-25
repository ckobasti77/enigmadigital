import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { requireMembership } from "./lib/auth";
import {
  extractSlugFromShortUrl,
  normalizeUrl,
} from "./lib/urlNormalization";
import { shortLinkOrigin } from "./lib/orLink";

/**
 * ============================================================================
 * THREADS FUNNELS & LINK ATTRIBUTION ENGINE (TH10)
 * ============================================================================
 *
 * Spajanje dva nezavisna izvora podataka o klikovima za isti link:
 *   1) `threadsClicks`: klikovi zabeleženi u Threads aplikaciji (Threads API)
 *   2) `siteClicks`: stvarni verifikovani dolasci na naš sajt kroz `/r/` rutu
 *
 * STRIKTNA PRAVILA PROJEKTA (§10.2):
 * - Nikada ne skladištimo odnos, procenat ili razliku u bazu — oba broja se
 *   čuvaju nezavisno, a sve izvedene vrednosti se računaju pri čitanju.
 * - Ako izvor nije sinhronizovan za dati dan, polje je ODSUTNO (`undefined`),
 *   a ne 0. Nula znači „0 klikova“, odsustvo znači „nemamo podatak“.
 * - Nespojeni URL-ovi (linkovi koji nisu objavljeni kao /r/ praćeni linkovi)
 *   se NIKADA tiho ne odbacuju — čuvaju se sa `isMatched: false` i prikazuju
 *   u UI-ju kao vidljiva rupa u atribuciji.
 * - §10.2 (a) `th=threads_stream` je NEPOTVRĐENA heuristika i ne koristi se
 *   kao utvrđen izvor.
 * ============================================================================
 */

// ── Interne funkcije za spajanje i rekalkulaciju atribucije ──────────────────

/**
 * Rekalkuliše spajanje Threads klikova i dolazaka na sajt za zadati radni prostor i datume.
 */
export const recomputeAttributionForDates = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    dates: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { workspaceId, dates }) => {
    const now = Date.now();
    const origin = shortLinkOrigin() ?? "";

    // 1. Učitaj sve praćene linkove za ovaj workspace
    const trackedLinks = await ctx.db
      .query("orTrackedLinks")
      .withIndex("by_workspace_destination", (q) => q.eq("workspaceId", workspaceId))
      .collect();

    // Mapiranja za brzo pronalaženje
    const bySlug = new Map<string, Doc<"orTrackedLinks">>();
    const byNormalizedDest = new Map<string, Doc<"orTrackedLinks">>();
    const byNormalizedShort = new Map<string, Doc<"orTrackedLinks">>();

    for (const tl of trackedLinks) {
      if (tl.slug) {
        bySlug.set(tl.slug.toLowerCase(), tl);
        if (origin) {
          const shortUrl = `${origin}/r/${tl.slug}`;
          byNormalizedShort.set(normalizeUrl(shortUrl), tl);
        }
      }
      if (tl.destinationUrl) {
        byNormalizedDest.set(normalizeUrl(tl.destinationUrl), tl);
      }
    }

    const uniqueDates = Array.from(new Set(dates));

    for (const date of uniqueDates) {
      // 2. Učitaj sve Threads klikove po URL-u za dati dan
      const threadsClicksRows = await ctx.db
        .query("threadsClicksByUrl")
        .withIndex("by_workspace_date", (q) =>
          q.eq("workspaceId", workspaceId).eq("date", date),
        )
        .collect();

      const hasThreadsSyncForDate = threadsClicksRows.length > 0;
      const matchedTrackedLinkIdsForDate = new Set<string>();

      // 3. Spajanje Threads URL-ova sa orTrackedLinks
      for (const row of threadsClicksRows) {
        const rawUrl = row.url;
        const normalized = normalizeUrl(rawUrl);
        const slug = extractSlugFromShortUrl(rawUrl);

        let matchedTrackedLink: Doc<"orTrackedLinks"> | undefined;

        if (slug && bySlug.has(slug)) {
          matchedTrackedLink = bySlug.get(slug);
        } else if (byNormalizedShort.has(normalized)) {
          matchedTrackedLink = byNormalizedShort.get(normalized);
        } else if (byNormalizedDest.has(normalized)) {
          matchedTrackedLink = byNormalizedDest.get(normalized);
        }

        if (matchedTrackedLink) {
          matchedTrackedLinkIdsForDate.add(matchedTrackedLink._id);

          // Izbroj stvarne dolaske na sajt iz orLinkClicks za ovaj link i dan
          const siteClicksRows = await ctx.db
            .query("orLinkClicks")
            .withIndex("by_workspace_date", (q) =>
              q.eq("workspaceId", workspaceId).eq("date", date),
            )
            .filter((q) => q.eq(q.field("trackedLinkId"), matchedTrackedLink!._id))
            .collect();

          const siteClicks = siteClicksRows.length;

          // Proveri da li već postoji zapis u threadsLinkAttribution
          const existing = await ctx.db
            .query("threadsLinkAttribution")
            .withIndex("by_workspace_link_date", (q) =>
              q
                .eq("workspaceId", workspaceId)
                .eq("trackedLinkId", matchedTrackedLink!._id)
                .eq("date", date),
            )
            .first();

          if (existing !== null) {
            await ctx.db.patch(existing._id, {
              rawUrl,
              normalizedUrl: normalized,
              destinationUrl: matchedTrackedLink.destinationUrl,
              label: matchedTrackedLink.label,
              threadsClicks: row.clicks,
              siteClicks,
              isMatched: true,
              updatedAt: now,
            });
          } else {
            await ctx.db.insert("threadsLinkAttribution", {
              workspaceId,
              date,
              trackedLinkId: matchedTrackedLink._id,
              rawUrl,
              normalizedUrl: normalized,
              destinationUrl: matchedTrackedLink.destinationUrl,
              label: matchedTrackedLink.label,
              threadsClicks: row.clicks,
              siteClicks,
              isMatched: true,
              updatedAt: now,
            });
          }
        } else {
          // Nespojeni URL — registruje se kao rupa u atribuciji
          const existing = await ctx.db
            .query("threadsLinkAttribution")
            .withIndex("by_workspace_url_date", (q) =>
              q
                .eq("workspaceId", workspaceId)
                .eq("normalizedUrl", normalized)
                .eq("date", date),
            )
            .first();

          if (existing !== null) {
            await ctx.db.patch(existing._id, {
              rawUrl,
              threadsClicks: row.clicks,
              isMatched: false,
              updatedAt: now,
            });
          } else {
            await ctx.db.insert("threadsLinkAttribution", {
              workspaceId,
              date,
              rawUrl,
              normalizedUrl: normalized,
              threadsClicks: row.clicks,
              // siteClicks ostaje ODSUTAN (undefined) jer ne znamo koji je sajt link
              isMatched: false,
              updatedAt: now,
            });
          }
        }
      }

      // 4. Proveri praćene linkove kanala "threads" koji možda imaju orLinkClicks
      // ali ih Threads API nije vratio u clicksByUrl za taj dan
      for (const tl of trackedLinks) {
        if (tl.channel !== "threads" && tl.channel !== undefined) continue;
        if (matchedTrackedLinkIdsForDate.has(tl._id)) continue;

        const siteClicksRows = await ctx.db
          .query("orLinkClicks")
          .withIndex("by_workspace_date", (q) =>
            q.eq("workspaceId", workspaceId).eq("date", date),
          )
          .filter((q) => q.eq(q.field("trackedLinkId"), tl._id))
          .collect();

        if (siteClicksRows.length === 0 && !hasThreadsSyncForDate) {
          continue;
        }

        const rawUrl = origin ? `${origin}/r/${tl.slug}` : tl.destinationUrl;
        const normalized = normalizeUrl(rawUrl);

        // Ako Threads jeste sinhronizovan za taj dan a nema ovog URL-a, Threads klikova je 0.
        // Ako Threads NIJE sinhronizovan za taj dan, polje je ODSUTNO (undefined).
        const threadsClicks = hasThreadsSyncForDate ? 0 : undefined;
        const siteClicks = siteClicksRows.length > 0 ? siteClicksRows.length : 0;

        const existing = await ctx.db
          .query("threadsLinkAttribution")
          .withIndex("by_workspace_link_date", (q) =>
            q
              .eq("workspaceId", workspaceId)
              .eq("trackedLinkId", tl._id)
              .eq("date", date),
          )
          .first();

        if (existing !== null) {
          await ctx.db.patch(existing._id, {
            rawUrl,
            normalizedUrl: normalized,
            destinationUrl: tl.destinationUrl,
            label: tl.label,
            ...(threadsClicks !== undefined ? { threadsClicks } : {}),
            siteClicks,
            isMatched: true,
            updatedAt: now,
          });
        } else {
          await ctx.db.insert("threadsLinkAttribution", {
            workspaceId,
            date,
            trackedLinkId: tl._id,
            rawUrl,
            normalizedUrl: normalized,
            destinationUrl: tl.destinationUrl,
            label: tl.label,
            ...(threadsClicks !== undefined ? { threadsClicks } : {}),
            siteClicks,
            isMatched: true,
            updatedAt: now,
          });
        }
      }
    }

    return null;
  },
});

// ── Javni upiti za UI ────────────────────────────────────────────────────────

/**
 * Vraća podatke atribucije i levka za Threads linkove za aktivni radni prostor.
 *
 * Vraća odvojeno `threadsClicks` (klik u aplikaciji) i `siteClicks` (dolasci na sajt),
 * kao i broj nespojenih URL-ova.
 * Ako podatak za neki izvor nedostaje, polje je ODSUTNO (ne 0).
 */
export const getThreadsLinkAttributionSummary = query({
  args: {
    dateFrom: v.optional(v.string()),
    dateTo: v.optional(v.string()),
  },
  returns: v.object({
    matchedLinks: v.array(
      v.object({
        trackedLinkId: v.id("orTrackedLinks"),
        slug: v.string(),
        shortUrl: v.string(),
        destinationUrl: v.string(),
        label: v.optional(v.string()),
        threadsClicks: v.optional(v.number()), // Odsutno ako nema sync podataka
        siteClicks: v.optional(v.number()), // Odsutno ako nema podataka o dolascima
        dailyBreakdown: v.array(
          v.object({
            date: v.string(),
            threadsClicks: v.optional(v.number()),
            siteClicks: v.optional(v.number()),
          }),
        ),
      }),
    ),
    unmatchedSummary: v.object({
      unmatchedCount: v.number(),
      unmatchedTotalThreadsClicks: v.optional(v.number()),
      unmatchedUrls: v.array(
        v.object({
          rawUrl: v.string(),
          normalizedUrl: v.string(),
          date: v.string(),
          threadsClicks: v.optional(v.number()),
        }),
      ),
    }),
  }),
  handler: async (ctx, { dateFrom, dateTo }) => {
    const { workspaceId } = await requireMembership(ctx);
    const origin = shortLinkOrigin() ?? "";

    let rowsQuery = ctx.db
      .query("threadsLinkAttribution")
      .withIndex("by_workspace_date", (q) => q.eq("workspaceId", workspaceId));

    const allRows = await rowsQuery.collect();

    const filteredRows = allRows.filter((r) => {
      if (dateFrom && r.date < dateFrom) return false;
      if (dateTo && r.date > dateTo) return false;
      return true;
    });

    // Grupiši spojene linkove po trackedLinkId
    const matchedMap = new Map<
      string,
      {
        trackedLinkId: Id<"orTrackedLinks">;
        slug: string;
        shortUrl: string;
        destinationUrl: string;
        label?: string;
        threadsClicksTotal: number;
        hasThreadsClicks: boolean;
        siteClicksTotal: number;
        hasSiteClicks: boolean;
        daily: Map<
          string,
          { date: string; threadsClicks?: number; siteClicks?: number }
        >;
      }
    >();

    const unmatchedList: Array<{
      rawUrl: string;
      normalizedUrl: string;
      date: string;
      threadsClicks?: number;
    }> = [];

    let unmatchedTotalClicks = 0;
    let hasUnmatchedClicks = false;

    for (const row of filteredRows) {
      if (row.isMatched && row.trackedLinkId) {
        const linkIdStr = row.trackedLinkId as string;
        let entry = matchedMap.get(linkIdStr);

        if (!entry) {
          const trackedLink = await ctx.db.get(row.trackedLinkId);
          const slug = trackedLink?.slug ?? "";
          entry = {
            trackedLinkId: row.trackedLinkId,
            slug,
            shortUrl: origin ? `${origin}/r/${slug}` : row.rawUrl,
            destinationUrl: row.destinationUrl ?? trackedLink?.destinationUrl ?? row.rawUrl,
            label: row.label ?? trackedLink?.label,
            threadsClicksTotal: 0,
            hasThreadsClicks: false,
            siteClicksTotal: 0,
            hasSiteClicks: false,
            daily: new Map(),
          };
          matchedMap.set(linkIdStr, entry);
        }

        if (row.threadsClicks !== undefined) {
          entry.threadsClicksTotal += row.threadsClicks;
          entry.hasThreadsClicks = true;
        }

        if (row.siteClicks !== undefined) {
          entry.siteClicksTotal += row.siteClicks;
          entry.hasSiteClicks = true;
        }

        entry.daily.set(row.date, {
          date: row.date,
          threadsClicks: row.threadsClicks,
          siteClicks: row.siteClicks,
        });
      } else {
        unmatchedList.push({
          rawUrl: row.rawUrl,
          normalizedUrl: row.normalizedUrl,
          date: row.date,
          threadsClicks: row.threadsClicks,
        });

        if (row.threadsClicks !== undefined) {
          unmatchedTotalClicks += row.threadsClicks;
          hasUnmatchedClicks = true;
        }
      }
    }

    const matchedLinks = Array.from(matchedMap.values()).map((e) => {
      const dailyBreakdown = Array.from(e.daily.values()).sort((a, b) =>
        a.date.localeCompare(b.date),
      );

      return {
        trackedLinkId: e.trackedLinkId,
        slug: e.slug,
        shortUrl: e.shortUrl,
        destinationUrl: e.destinationUrl,
        label: e.label,
        threadsClicks: e.hasThreadsClicks ? e.threadsClicksTotal : undefined,
        siteClicks: e.hasSiteClicks ? e.siteClicksTotal : undefined,
        dailyBreakdown,
      };
    });

    const distinctUnmatchedUrls = new Set(unmatchedList.map((u) => u.normalizedUrl));

    return {
      matchedLinks,
      unmatchedSummary: {
        unmatchedCount: distinctUnmatchedUrls.size,
        unmatchedTotalThreadsClicks: hasUnmatchedClicks
          ? unmatchedTotalClicks
          : undefined,
        unmatchedUrls: unmatchedList,
      },
    };
  },
});

/**
 * Vraća listu nespojenih URL-ova za analizu rupa u praćenju linkova.
 */
export const listUnmatchedUrls = query({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id("threadsLinkAttribution"),
      date: v.string(),
      rawUrl: v.string(),
      normalizedUrl: v.string(),
      threadsClicks: v.optional(v.number()),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx, { limit = 50 }) => {
    const { workspaceId } = await requireMembership(ctx);

    const rows = await ctx.db
      .query("threadsLinkAttribution")
      .withIndex("by_workspace_matched", (q) =>
        q.eq("workspaceId", workspaceId).eq("isMatched", false),
      )
      .order("desc")
      .take(limit);

    return rows.map((r) => ({
      _id: r._id,
      date: r.date,
      rawUrl: r.rawUrl,
      normalizedUrl: r.normalizedUrl,
      threadsClicks: r.threadsClicks,
      updatedAt: r.updatedAt,
    }));
  },
});
