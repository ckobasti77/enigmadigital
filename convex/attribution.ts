import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireMembership } from "./lib/auth";
import { slugify } from "./lib/slug";

/**
 * UTM Attribution & Funnel Query Layer.
 *
 * Joins OpenReply campaign metrics (orCampaignStats) with GA4 traffic breakdown
 * (ga4TrafficDaily) for source="instagram" and medium="openreply-dm" matching on:
 * slugify(orCampaign.name) === sessionCampaign (or slugify(sessionCampaign)).
 *
 * Also computes aggregate totals for Instagram attribution across mediums
 * (openreply-dm, bio, story, and other Instagram traffic).
 */

const campaignFunnelValidator = v.object({
  _id: v.id("orCampaignStats"),
  orCampaignId: v.string(),
  name: v.string(),
  slug: v.string(),
  keyword: v.string(),
  active: v.boolean(),
  dmsSent: v.number(),
  dmsFailed: v.number(),
  linkClicks: v.number(),
  ctr: v.number(),
  ga4Sessions: v.number(),
  ga4Conversions: v.number(),
  hasGa4Data: v.boolean(),
  hasMismatch: v.boolean(),
  clickToSessionRate: v.union(v.number(), v.null()),
  sessionToConvRate: v.union(v.number(), v.null()),
  overallConvRate: v.union(v.number(), v.null()),
  syncedAt: v.number(),
});

const mediumMetricValidator = v.object({
  sessions: v.number(),
  conversions: v.number(),
  conversionRate: v.number(),
});

const openreplyTotalsValidator = v.object({
  dmsSent: v.number(),
  linkClicks: v.number(),
  ctr: v.number(),
  sessions: v.number(),
  conversions: v.number(),
  conversionRate: v.number(),
  clickToSessionRate: v.union(v.number(), v.null()),
});

const unmatchedTrafficValidator = v.object({
  sessionCampaign: v.string(),
  sessions: v.number(),
  conversions: v.number(),
});

const attributionReportValidator = v.object({
  campaigns: v.array(campaignFunnelValidator),
  totals: v.object({
    openreply: openreplyTotalsValidator,
    bio: mediumMetricValidator,
    story: mediumMetricValidator,
    otherInstagram: mediumMetricValidator,
    totalInstagram: mediumMetricValidator,
    openreplyShareOfIgSessions: v.number(),
    openreplyShareOfIgConversions: v.number(),
  }),
  unmatchedGa4: v.array(unmatchedTrafficValidator),
});

export const report = query({
  args: {
    from: v.string(),
    to: v.string(),
  },
  returns: attributionReportValidator,
  handler: async (ctx, { from, to }) => {
    const { workspaceId } = await requireMembership(ctx);

    // 1. Fetch OpenReply campaigns for this workspace
    const rawCampaigns = await ctx.db
      .query("orCampaignStats")
      .withIndex("by_workspace_campaign", (q) =>
        q.eq("workspaceId", workspaceId),
      )
      .collect();

    // 2. Fetch GA4 traffic rows in [from, to] date range
    const trafficRows = await ctx.db
      .query("ga4TrafficDaily")
      .withIndex("by_workspace_date_dims", (q) =>
        q.eq("workspaceId", workspaceId).gte("date", from).lte("date", to),
      )
      .collect();

    // 3. Aggregate GA4 rows by source, medium and campaign
    type Agg = { sessions: number; conversions: number };

    const openReplyTrafficBySlug = new Map<string, Agg>();
    const unmatchedMap = new Map<string, Agg>();

    let bioSessions = 0;
    let bioConversions = 0;
    let storySessions = 0;
    let storyConversions = 0;
    let otherIgSessions = 0;
    let otherIgConversions = 0;
    let openReplyTotalSessions = 0;
    let openReplyTotalConversions = 0;

    // Pre-calculate known campaign slugs
    const knownSlugs = new Set<string>();
    for (const c of rawCampaigns) {
      knownSlugs.add(slugify(c.name));
    }

    for (const r of trafficRows) {
      const source = r.sessionSource.trim().toLowerCase();
      const medium = r.sessionMedium.trim().toLowerCase();

      if (source === "instagram") {
        if (medium === "openreply-dm") {
          openReplyTotalSessions += r.sessions;
          openReplyTotalConversions += r.conversions;

          const rawCamp = r.sessionCampaign.trim();
          const slug = slugify(rawCamp);

          // Group by normalized slug
          const existing = openReplyTrafficBySlug.get(slug);
          if (existing) {
            existing.sessions += r.sessions;
            existing.conversions += r.conversions;
          } else {
            openReplyTrafficBySlug.set(slug, {
              sessions: r.sessions,
              conversions: r.conversions,
            });
          }

          if (!knownSlugs.has(slug)) {
            const unmatchedExisting = unmatchedMap.get(rawCamp);
            if (unmatchedExisting) {
              unmatchedExisting.sessions += r.sessions;
              unmatchedExisting.conversions += r.conversions;
            } else {
              unmatchedMap.set(rawCamp, {
                sessions: r.sessions,
                conversions: r.conversions,
              });
            }
          }
        } else if (medium === "bio") {
          bioSessions += r.sessions;
          bioConversions += r.conversions;
        } else if (medium === "story") {
          storySessions += r.sessions;
          storyConversions += r.conversions;
        } else {
          otherIgSessions += r.sessions;
          otherIgConversions += r.conversions;
        }
      }
    }

    // 4. Construct campaign funnel rows
    let totalDmsSent = 0;
    let totalLinkClicks = 0;

    const campaignRows = rawCampaigns.map((c) => {
      totalDmsSent += c.dmsSent;
      totalLinkClicks += c.linkClicks;

      const slug = slugify(c.name);
      const ga4Data = openReplyTrafficBySlug.get(slug);
      const hasGa4Data = ga4Data !== undefined;
      const ga4Sessions = ga4Data?.sessions ?? 0;
      const ga4Conversions = ga4Data?.conversions ?? 0;

      // Data honesty: campaign has OpenReply link clicks, but zero GA4 sessions
      const hasMismatch = c.linkClicks > 0 && ga4Sessions === 0;

      const clickToSessionRate =
        c.linkClicks > 0 && hasGa4Data
          ? ga4Sessions / c.linkClicks
          : null;

      const sessionToConvRate =
        ga4Sessions > 0
          ? ga4Conversions / ga4Sessions
          : null;

      const overallConvRate =
        c.dmsSent > 0 && hasGa4Data
          ? ga4Conversions / c.dmsSent
          : null;

      return {
        _id: c._id,
        orCampaignId: c.orCampaignId,
        name: c.name,
        slug,
        keyword: c.keyword,
        active: c.active,
        dmsSent: c.dmsSent,
        dmsFailed: c.dmsFailed,
        linkClicks: c.linkClicks,
        ctr: c.ctr,
        ga4Sessions,
        ga4Conversions,
        hasGa4Data,
        hasMismatch,
        clickToSessionRate,
        sessionToConvRate,
        overallConvRate,
        syncedAt: c.syncedAt,
      };
    });

    // 5. Total Instagram metrics
    const totalIgSessions =
      openReplyTotalSessions + bioSessions + storySessions + otherIgSessions;
    const totalIgConversions =
      openReplyTotalConversions +
      bioConversions +
      storyConversions +
      otherIgConversions;

    const openreplyShareOfIgSessions =
      totalIgSessions > 0 ? openReplyTotalSessions / totalIgSessions : 0;
    const openreplyShareOfIgConversions =
      totalIgConversions > 0
        ? openReplyTotalConversions / totalIgConversions
        : 0;

    const unmatchedGa4 = Array.from(unmatchedMap.entries()).map(
      ([sessionCampaign, agg]) => ({
        sessionCampaign,
        sessions: agg.sessions,
        conversions: agg.conversions,
      }),
    );

    return {
      campaigns: campaignRows,
      totals: {
        openreply: {
          dmsSent: totalDmsSent,
          linkClicks: totalLinkClicks,
          ctr: totalDmsSent > 0 ? totalLinkClicks / totalDmsSent : 0,
          sessions: openReplyTotalSessions,
          conversions: openReplyTotalConversions,
          conversionRate:
            openReplyTotalSessions > 0
              ? openReplyTotalConversions / openReplyTotalSessions
              : 0,
          clickToSessionRate:
            totalLinkClicks > 0
              ? openReplyTotalSessions / totalLinkClicks
              : null,
        },
        bio: {
          sessions: bioSessions,
          conversions: bioConversions,
          conversionRate:
            bioSessions > 0 ? bioConversions / bioSessions : 0,
        },
        story: {
          sessions: storySessions,
          conversions: storyConversions,
          conversionRate:
            storySessions > 0 ? storyConversions / storySessions : 0,
        },
        otherInstagram: {
          sessions: otherIgSessions,
          conversions: otherIgConversions,
          conversionRate:
            otherIgSessions > 0 ? otherIgConversions / otherIgSessions : 0,
        },
        totalInstagram: {
          sessions: totalIgSessions,
          conversions: totalIgConversions,
          conversionRate:
            totalIgSessions > 0 ? totalIgConversions / totalIgSessions : 0,
        },
        openreplyShareOfIgSessions,
        openreplyShareOfIgConversions,
      },
      unmatchedGa4,
    };
  },
});
