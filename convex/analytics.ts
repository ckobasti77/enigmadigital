import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireMembership } from "./lib/auth";
import { getKeyEvents, resolveMetric } from "./lib/ga4Catalog";

/**
 * Public GA4 reads for the Analytics screen (V8 runtime, real-time via
 * `useQuery`). Ranges are inclusive "YYYY-MM-DD" bounds; the client asks for
 * the current and the previous period as two subscriptions and derives
 * totals / deltas in `lib/metrics.ts`, so the same query serves sparklines,
 * the main chart and the KPI tiles.
 *
 * Rules:
 *   - F2: Every report reads its dedicated `reportKey` via index `by_workspace_report_date`.
 *   - F3: Strictly sum only rows where `state === "value"`. Never convert unknown/thresholded to 0 for sum.
 *   - F4: Marker rows are filtered out of dimension groupings and counted for `thresholdedDays`.
 *   - Section 3: Rates are computed on read from numerator and denominator, never stored as daily sums.
 */

const dailyPointValidator = v.object({
  date: v.string(),
  sessions: v.number(),
  activeUsers: v.number(),
  newUsers: v.number(),
  keyEvents: v.number(),
  engagementRate: v.optional(v.number()),
  totalUsers: v.optional(v.number()),
  engagedSessions: v.optional(v.number()),
  screenPageViews: v.optional(v.number()),
  userEngagementDuration: v.optional(v.number()),
  scrolledUsers: v.optional(v.number()),
  avgEngagementDurationPerSession: v.optional(v.number()),
});

/** Daily totals in [from, to], ascending by date. */
export const daily = query({
  args: { from: v.string(), to: v.string() },
  returns: v.array(dailyPointValidator),
  handler: async (ctx, { from, to }) => {
    const { workspaceId } = await requireMembership(ctx);
    const rows = await ctx.db
      .query("ga4Daily")
      .withIndex("by_workspace_date", (q) =>
        q.eq("workspaceId", workspaceId).gte("date", from).lte("date", to),
      )
      .collect();
    return rows.map((r) => {
      const keyEvents = getKeyEvents(r);
      const totalUsers = r.totalUsers;
      const engagedSessions = r.engagedSessions;
      const screenPageViews = r.screenPageViews;
      const userEngagementDuration = r.userEngagementDuration;
      const scrolledUsers = r.scrolledUsers;

      let engagementRate: number | undefined = undefined;
      if (r.engagedSessions !== undefined) {
        engagementRate = r.sessions > 0 ? r.engagedSessions / r.sessions : 0;
      } else if (r.engagementRate !== undefined) {
        engagementRate = r.engagementRate;
      }

      const avgEngagementDurationPerSession =
        r.userEngagementDuration !== undefined
          ? r.sessions > 0
            ? r.userEngagementDuration / r.sessions
            : 0
          : undefined;

      return {
        date: r.date,
        sessions: r.sessions,
        activeUsers: r.activeUsers,
        newUsers: r.newUsers,
        keyEvents,
        engagementRate,
        totalUsers,
        engagedSessions,
        screenPageViews,
        userEngagementDuration,
        scrolledUsers,
        avgEngagementDurationPerSession,
      };
    });
  },
});

const TRAFFIC_TOP_N = 20;

const trafficRowValidator = v.object({
  source: v.string(),
  medium: v.string(),
  campaign: v.string(),
  sessions: v.number(),
  keyEvents: v.number(),
});

/**
 * Traffic breakdown in [from, to] aggregated by (source, medium, campaign):
 * top 20 tuples by sessions, plus totals over ALL tuples so the share bar
 * denominator is the whole period, not just the visible rows.
 */
export const traffic = query({
  args: { from: v.string(), to: v.string() },
  returns: v.object({
    rows: v.array(trafficRowValidator),
    tupleCount: v.number(),
    totalSessions: v.number(),
    totalKeyEvents: v.number(),
  }),
  handler: async (ctx, { from, to }) => {
    const { workspaceId } = await requireMembership(ctx);
    const rows = await ctx.db
      .query("ga4TrafficDaily")
      .withIndex("by_workspace_date_dims", (q) =>
        q.eq("workspaceId", workspaceId).gte("date", from).lte("date", to),
      )
      .collect();

    const byTuple = new Map<
      string,
      {
        source: string;
        medium: string;
        campaign: string;
        sessions: number;
        keyEvents: number;
      }
    >();
    let totalSessions = 0;
    let totalKeyEvents = 0;
    for (const r of rows) {
      const key = `${r.sessionSource} ${r.sessionMedium} ${r.sessionCampaign}`;
      const keyEvents = getKeyEvents(r);
      const agg = byTuple.get(key);
      if (agg) {
        agg.sessions += r.sessions;
        agg.keyEvents += keyEvents;
      } else {
        byTuple.set(key, {
          source: r.sessionSource,
          medium: r.sessionMedium,
          campaign: r.sessionCampaign,
          sessions: r.sessions,
          keyEvents,
        });
      }
      totalSessions += r.sessions;
      totalKeyEvents += keyEvents;
    }

    const top = [...byTuple.values()]
      .sort((a, b) => b.sessions - a.sessions || b.keyEvents - a.keyEvents)
      .slice(0, TRAFFIC_TOP_N);

    return {
      rows: top,
      tupleCount: byTuple.size,
      totalSessions,
      totalKeyEvents,
    };
  },
});

/** Return latest GA4 report metadata for data quality notice. */
export const reportMetaDocValidator = v.union(
  v.null(),
  v.object({
    _id: v.id("ga4ReportMeta"),
    _creationTime: v.number(),
    workspaceId: v.id("workspaces"),
    reportKey: v.string(),
    fetchedAt: v.number(),
    timeZone: v.optional(v.string()),
    currencyCode: v.optional(v.string()),
    emptyReason: v.optional(v.string()),
    subjectToThresholding: v.optional(v.boolean()),
    dataLossFromOtherRow: v.optional(v.boolean()),
    sampled: v.optional(v.boolean()),
    samplesReadCount: v.optional(v.number()),
    samplingSpaceSize: v.optional(v.number()),
  }),
);

export const reportMeta = query({
  args: { reportKey: v.optional(v.string()) },
  returns: reportMetaDocValidator,
  handler: async (ctx, { reportKey = "daily" }) => {
    const { workspaceId } = await requireMembership(ctx);
    return await ctx.db
      .query("ga4ReportMeta")
      .withIndex("by_workspace_report", (q) =>
        q.eq("workspaceId", workspaceId).eq("reportKey", reportKey),
      )
      .unique();
  },
});

const channelRowValidator = v.object({
  channel: v.string(),
  firstUsers: v.optional(v.number()),
  firstNewUsers: v.optional(v.number()),
  firstKeyEvents: v.optional(v.number()),
  sessions: v.optional(v.number()),
  engagedSessions: v.optional(v.number()),
  engagementRate: v.optional(v.number()),
  sessionKeyEvents: v.optional(v.number()),
  state: v.union(
    v.literal("value"),
    v.literal("thresholded"),
    v.literal("unavailable"),
  ),
});

const channelTotalsValidator = v.object({
  firstUsers: v.number(),
  firstNewUsers: v.number(),
  firstKeyEvents: v.number(),
  sessions: v.number(),
  engagedSessions: v.number(),
  engagementRate: v.number(),
  sessionKeyEvents: v.number(),
});

/**
 * Acquisition breakdown by channel comparing first touch and session touch (A3/A4).
 * Reads `acq_channel_first` and `acq_channel_session` using index `by_workspace_report_date`.
 */
export const acquisitionByChannel = query({
  args: { from: v.string(), to: v.string() },
  returns: v.object({
    rows: v.array(channelRowValidator),
    totals: channelTotalsValidator,
    thresholdedDays: v.number(),
    reportMetaFirst: reportMetaDocValidator,
    reportMetaSession: reportMetaDocValidator,
  }),
  handler: async (ctx, { from, to }) => {
    const { workspaceId } = await requireMembership(ctx);

    const [firstRows, sessionRows, reportMetaFirst, reportMetaSession] =
      await Promise.all([
        ctx.db
          .query("ga4MetricDaily")
          .withIndex("by_workspace_report_date", (q) =>
            q
              .eq("workspaceId", workspaceId)
              .eq("reportKey", "acq_channel_first")
              .gte("date", from)
              .lte("date", to),
          )
          .collect(),
        ctx.db
          .query("ga4MetricDaily")
          .withIndex("by_workspace_report_date", (q) =>
            q
              .eq("workspaceId", workspaceId)
              .eq("reportKey", "acq_channel_session")
              .gte("date", from)
              .lte("date", to),
          )
          .collect(),
        ctx.db
          .query("ga4ReportMeta")
          .withIndex("by_workspace_report", (q) =>
            q
              .eq("workspaceId", workspaceId)
              .eq("reportKey", "acq_channel_first"),
          )
          .unique(),
        ctx.db
          .query("ga4ReportMeta")
          .withIndex("by_workspace_report", (q) =>
            q
              .eq("workspaceId", workspaceId)
              .eq("reportKey", "acq_channel_session"),
          )
          .unique(),
      ]);

    type ChannelAgg = {
      channel: string;
      firstUsers?: number;
      firstNewUsers?: number;
      firstKeyEvents?: number;
      sessions?: number;
      engagedSessions?: number;
      sessionKeyEvents?: number;
      state: "value" | "thresholded" | "unavailable";
    };

    const byChannel = new Map<string, ChannelAgg>();
    const thresholdedDates = new Set<string>();

    for (const r of firstRows) {
      if (r.state === "thresholded") {
        thresholdedDates.add(r.date);
        continue;
      }
      if (r.dimensionValues.length === 0) continue;
      const channel = r.dimensionValues[0] || "(not set)";
      let agg = byChannel.get(channel);
      if (!agg) {
        agg = { channel, state: "value" };
        byChannel.set(channel, agg);
      }

      if (r.state === "value" && r.value !== undefined) {
        if (r.metric === "totalUsers") {
          agg.firstUsers = (agg.firstUsers ?? 0) + r.value;
        } else if (r.metric === "newUsers") {
          agg.firstNewUsers = (agg.firstNewUsers ?? 0) + r.value;
        } else if (r.metric === "keyEvents") {
          agg.firstKeyEvents = (agg.firstKeyEvents ?? 0) + r.value;
        }
      }
    }

    for (const r of sessionRows) {
      if (r.state === "thresholded") {
        thresholdedDates.add(r.date);
        continue;
      }
      if (r.dimensionValues.length === 0) continue;
      const channel = r.dimensionValues[0] || "(not set)";
      let agg = byChannel.get(channel);
      if (!agg) {
        agg = { channel, state: "value" };
        byChannel.set(channel, agg);
      }

      if (r.state === "value" && r.value !== undefined) {
        if (r.metric === "sessions") {
          agg.sessions = (agg.sessions ?? 0) + r.value;
        } else if (r.metric === "engagedSessions") {
          agg.engagedSessions = (agg.engagedSessions ?? 0) + r.value;
        } else if (r.metric === "keyEvents") {
          agg.sessionKeyEvents = (agg.sessionKeyEvents ?? 0) + r.value;
        }
      }
    }

    let totFirstUsers = 0;
    let totFirstNewUsers = 0;
    let totFirstKeyEvents = 0;
    let totSessions = 0;
    let totEngagedSessions = 0;
    let totSessionKeyEvents = 0;

    const channelRows = Array.from(byChannel.values()).map((agg) => {
      const engagementRate =
        agg.sessions !== undefined &&
        agg.sessions > 0 &&
        agg.engagedSessions !== undefined
          ? agg.engagedSessions / agg.sessions
          : undefined;

      if (agg.firstUsers !== undefined) totFirstUsers += agg.firstUsers;
      if (agg.firstNewUsers !== undefined) totFirstNewUsers += agg.firstNewUsers;
      if (agg.firstKeyEvents !== undefined) totFirstKeyEvents += agg.firstKeyEvents;
      if (agg.sessions !== undefined) totSessions += agg.sessions;
      if (agg.engagedSessions !== undefined)
        totEngagedSessions += agg.engagedSessions;
      if (agg.sessionKeyEvents !== undefined)
        totSessionKeyEvents += agg.sessionKeyEvents;

      return {
        channel: agg.channel,
        firstUsers: agg.firstUsers,
        firstNewUsers: agg.firstNewUsers,
        firstKeyEvents: agg.firstKeyEvents,
        sessions: agg.sessions,
        engagedSessions: agg.engagedSessions,
        engagementRate,
        sessionKeyEvents: agg.sessionKeyEvents,
        state: agg.state,
      };
    });

    // Sort descending by max of firstUsers / sessions
    channelRows.sort((a, b) => {
      const maxA = Math.max(a.firstUsers ?? 0, a.sessions ?? 0);
      const maxB = Math.max(b.firstUsers ?? 0, b.sessions ?? 0);
      return maxB - maxA;
    });

    const totEngagementRate =
      totSessions > 0 ? totEngagedSessions / totSessions : 0;

    return {
      rows: channelRows,
      totals: {
        firstUsers: totFirstUsers,
        firstNewUsers: totFirstNewUsers,
        firstKeyEvents: totFirstKeyEvents,
        sessions: totSessions,
        engagedSessions: totEngagedSessions,
        engagementRate: totEngagementRate,
        sessionKeyEvents: totSessionKeyEvents,
      },
      thresholdedDays: thresholdedDates.size,
      reportMetaFirst,
      reportMetaSession,
    };
  },
});

const sourceAcqRowValidator = v.object({
  source: v.string(),
  medium: v.string(),
  primaryValue: v.number(),
  secondaryValue: v.number(),
  keyEvents: v.number(),
  engagementRate: v.optional(v.number()),
});

/**
 * Acquisition breakdown by source/medium for either "first" or "session" touch (A3/A4).
 * Reads `acq_source_first` or `acq_source_session` via `by_workspace_report_date`.
 */
export const acquisitionBySource = query({
  args: {
    from: v.string(),
    to: v.string(),
    scope: v.union(v.literal("first"), v.literal("session")),
  },
  returns: v.object({
    scope: v.union(v.literal("first"), v.literal("session")),
    rows: v.array(sourceAcqRowValidator),
    pairCount: v.number(),
    totalPrimary: v.number(),
    totalSecondary: v.number(),
    totalKeyEvents: v.number(),
    thresholdedDays: v.number(),
    reportMeta: reportMetaDocValidator,
  }),
  handler: async (ctx, { from, to, scope }) => {
    const { workspaceId } = await requireMembership(ctx);

    const reportKey =
      scope === "first" ? "acq_source_first" : "acq_source_session";

    const [rows, reportMeta] = await Promise.all([
      ctx.db
        .query("ga4MetricDaily")
        .withIndex("by_workspace_report_date", (q) =>
          q
            .eq("workspaceId", workspaceId)
            .eq("reportKey", reportKey)
            .gte("date", from)
            .lte("date", to),
        )
        .collect(),
      ctx.db
        .query("ga4ReportMeta")
        .withIndex("by_workspace_report", (q) =>
          q.eq("workspaceId", workspaceId).eq("reportKey", reportKey),
        )
        .unique(),
    ]);

    type SourceAgg = {
      source: string;
      medium: string;
      primary: number;
      secondary: number;
      keyEvents: number;
    };

    const byPair = new Map<string, SourceAgg>();
    const thresholdedDates = new Set<string>();
    let totalPrimary = 0;
    let totalSecondary = 0;
    let totalKeyEvents = 0;

    for (const r of rows) {
      if (r.state !== "value" || r.value === undefined) {
        if (r.state === "thresholded") {
          thresholdedDates.add(r.date);
        }
        continue;
      }
      if (r.dimensionValues.length < 2) continue;

      const source = r.dimensionValues[0] || "(not set)";
      const medium = r.dimensionValues[1] || "(not set)";
      const key = `${source}|${medium}`;
      let agg = byPair.get(key);
      if (!agg) {
        agg = { source, medium, primary: 0, secondary: 0, keyEvents: 0 };
        byPair.set(key, agg);
      }

      const val = r.state === "value" ? (r.value ?? 0) : 0;
      if (scope === "first") {
        if (r.metric === "newUsers") {
          agg.primary += val;
          totalPrimary += val;
        } else if (r.metric === "totalUsers") {
          agg.secondary += val;
          totalSecondary += val;
        } else if (r.metric === "keyEvents") {
          agg.keyEvents += val;
          totalKeyEvents += val;
        }
      } else {
        if (r.metric === "sessions") {
          agg.primary += val;
          totalPrimary += val;
        } else if (r.metric === "engagedSessions") {
          agg.secondary += val;
          totalSecondary += val;
        } else if (r.metric === "keyEvents") {
          agg.keyEvents += val;
          totalKeyEvents += val;
        }
      }
    }

    const allPairs = Array.from(byPair.values()).map((agg) => {
      const engagementRate =
        scope === "session" && agg.primary > 0
          ? agg.secondary / agg.primary
          : undefined;

      return {
        source: agg.source,
        medium: agg.medium,
        primaryValue: agg.primary,
        secondaryValue: agg.secondary,
        keyEvents: agg.keyEvents,
        engagementRate,
      };
    });

    allPairs.sort(
      (a, b) => b.primaryValue - a.primaryValue || b.keyEvents - a.keyEvents,
    );
    const top20 = allPairs.slice(0, 20);

    return {
      scope,
      rows: top20,
      pairCount: byPair.size,
      totalPrimary,
      totalSecondary,
      totalKeyEvents,
      thresholdedDays: thresholdedDates.size,
      reportMeta,
    };
  },
});

// ── 5 NEW GA4 REPORTS (A4 §5.3) ─────────────────────────────────────────────

const contentPageRowValidator = v.object({
  pagePath: v.string(),
  screenPageViews: v.number(),
  totalUsers: v.number(),
  avgEngagementDuration: v.number(),
  keyEvents: v.number(),
});

const contentPagesTotalsValidator = v.object({
  screenPageViews: v.number(),
  totalUsers: v.number(),
  avgEngagementDuration: v.number(),
  keyEvents: v.number(),
});

/**
 * Content breakdown by pagePath: top 20 by screenPageViews + remainder + totals.
 */
export const contentPages = query({
  args: { from: v.string(), to: v.string() },
  returns: v.object({
    rows: v.array(contentPageRowValidator),
    totals: contentPagesTotalsValidator,
    pageCount: v.number(),
    thresholdedDays: v.number(),
    reportMeta: reportMetaDocValidator,
  }),
  handler: async (ctx, { from, to }) => {
    const { workspaceId } = await requireMembership(ctx);

    const [rows, reportMeta] = await Promise.all([
      ctx.db
        .query("ga4MetricDaily")
        .withIndex("by_workspace_report_date", (q) =>
          q
            .eq("workspaceId", workspaceId)
            .eq("reportKey", "content_pages")
            .gte("date", from)
            .lte("date", to),
        )
        .collect(),
      ctx.db
        .query("ga4ReportMeta")
        .withIndex("by_workspace_report", (q) =>
          q.eq("workspaceId", workspaceId).eq("reportKey", "content_pages"),
        )
        .unique(),
    ]);

    type PageAgg = {
      pagePath: string;
      screenPageViews: number;
      totalUsers: number;
      userEngagementDuration: number;
      keyEvents: number;
    };

    const byPath = new Map<string, PageAgg>();
    const thresholdedDates = new Set<string>();
    let totalViews = 0;
    let totalUsers = 0;
    let totalDuration = 0;
    let totalKeyEvents = 0;

    for (const r of rows) {
      if (r.state === "thresholded") {
        thresholdedDates.add(r.date);
        continue;
      }
      if (r.dimensionValues.length === 0) continue;
      const pagePath = r.dimensionValues[0] || "/";
      let agg = byPath.get(pagePath);
      if (!agg) {
        agg = {
          pagePath,
          screenPageViews: 0,
          totalUsers: 0,
          userEngagementDuration: 0,
          keyEvents: 0,
        };
        byPath.set(pagePath, agg);
      }

      if (r.state === "value" && r.value !== undefined) {
        if (r.metric === "screenPageViews") {
          agg.screenPageViews += r.value;
          totalViews += r.value;
        } else if (r.metric === "totalUsers") {
          agg.totalUsers += r.value;
          totalUsers += r.value;
        } else if (r.metric === "userEngagementDuration") {
          agg.userEngagementDuration += r.value;
          totalDuration += r.value;
        } else if (r.metric === "keyEvents") {
          agg.keyEvents += r.value;
          totalKeyEvents += r.value;
        }
      }
    }

    const allPages = Array.from(byPath.values()).map((agg) => ({
      pagePath: agg.pagePath,
      screenPageViews: agg.screenPageViews,
      totalUsers: agg.totalUsers,
      avgEngagementDuration:
        agg.totalUsers > 0 ? agg.userEngagementDuration / agg.totalUsers : 0,
      keyEvents: agg.keyEvents,
    }));

    allPages.sort(
      (a, b) =>
        b.screenPageViews - a.screenPageViews || b.totalUsers - a.totalUsers,
    );
    const top20 = allPages.slice(0, 20);

    const totalAvgDuration = totalUsers > 0 ? totalDuration / totalUsers : 0;

    return {
      rows: top20,
      totals: {
        screenPageViews: totalViews,
        totalUsers,
        avgEngagementDuration: totalAvgDuration,
        keyEvents: totalKeyEvents,
      },
      pageCount: byPath.size,
      thresholdedDays: thresholdedDates.size,
      reportMeta,
    };
  },
});

const landingPageRowValidator = v.object({
  landingPage: v.string(),
  sessions: v.number(),
  engagedSessions: v.number(),
  engagementRate: v.number(),
  bounceRate: v.number(),
  keyEvents: v.number(),
});

const landingPagesTotalsValidator = v.object({
  sessions: v.number(),
  engagedSessions: v.number(),
  engagementRate: v.number(),
  bounceRate: v.number(),
  keyEvents: v.number(),
});

/**
 * Landing pages breakdown by landingPage: top 20 by sessions + remainder + totals.
 */
export const landingPages = query({
  args: { from: v.string(), to: v.string() },
  returns: v.object({
    rows: v.array(landingPageRowValidator),
    totals: landingPagesTotalsValidator,
    pageCount: v.number(),
    thresholdedDays: v.number(),
    reportMeta: reportMetaDocValidator,
  }),
  handler: async (ctx, { from, to }) => {
    const { workspaceId } = await requireMembership(ctx);

    const [rows, reportMeta] = await Promise.all([
      ctx.db
        .query("ga4MetricDaily")
        .withIndex("by_workspace_report_date", (q) =>
          q
            .eq("workspaceId", workspaceId)
            .eq("reportKey", "content_landing")
            .gte("date", from)
            .lte("date", to),
        )
        .collect(),
      ctx.db
        .query("ga4ReportMeta")
        .withIndex("by_workspace_report", (q) =>
          q.eq("workspaceId", workspaceId).eq("reportKey", "content_landing"),
        )
        .unique(),
    ]);

    type LandingAgg = {
      landingPage: string;
      sessions: number;
      engagedSessions: number;
      keyEvents: number;
    };

    const byPage = new Map<string, LandingAgg>();
    const thresholdedDates = new Set<string>();
    let totalSessions = 0;
    let totalEngaged = 0;
    let totalKeyEvents = 0;

    for (const r of rows) {
      if (r.state === "thresholded") {
        thresholdedDates.add(r.date);
        continue;
      }
      if (r.dimensionValues.length === 0) continue;
      const landingPage = r.dimensionValues[0] || "/";
      let agg = byPage.get(landingPage);
      if (!agg) {
        agg = { landingPage, sessions: 0, engagedSessions: 0, keyEvents: 0 };
        byPage.set(landingPage, agg);
      }

      if (r.state === "value" && r.value !== undefined) {
        if (r.metric === "sessions") {
          agg.sessions += r.value;
          totalSessions += r.value;
        } else if (r.metric === "engagedSessions") {
          agg.engagedSessions += r.value;
          totalEngaged += r.value;
        } else if (r.metric === "keyEvents") {
          agg.keyEvents += r.value;
          totalKeyEvents += r.value;
        }
      }
    }

    const allPages = Array.from(byPage.values()).map((agg) => {
      const engagementRate =
        agg.sessions > 0 ? agg.engagedSessions / agg.sessions : 0;
      return {
        landingPage: agg.landingPage,
        sessions: agg.sessions,
        engagedSessions: agg.engagedSessions,
        engagementRate,
        bounceRate: 1 - engagementRate,
        keyEvents: agg.keyEvents,
      };
    });

    allPages.sort(
      (a, b) => b.sessions - a.sessions || b.keyEvents - a.keyEvents,
    );
    const top20 = allPages.slice(0, 20);

    const totalEngagementRate =
      totalSessions > 0 ? totalEngaged / totalSessions : 0;

    return {
      rows: top20,
      totals: {
        sessions: totalSessions,
        engagedSessions: totalEngaged,
        engagementRate: totalEngagementRate,
        bounceRate: 1 - totalEngagementRate,
        keyEvents: totalKeyEvents,
      },
      pageCount: byPage.size,
      thresholdedDays: thresholdedDates.size,
      reportMeta,
    };
  },
});

const eventRowValidator = v.object({
  eventName: v.string(),
  eventCount: v.number(),
  totalUsers: v.number(),
  eventValue: v.number(),
  eventsPerUser: v.number(),
  isKeyEvent: v.boolean(),
});

const eventTotalsValidator = v.object({
  eventCount: v.number(),
  totalUsers: v.number(),
  eventValue: v.number(),
  eventsPerUser: v.number(),
});

/**
 * Events breakdown by eventName: top 20 by eventCount + remainder + totals.
 */
export const eventsByName = query({
  args: { from: v.string(), to: v.string() },
  returns: v.object({
    rows: v.array(eventRowValidator),
    totals: eventTotalsValidator,
    eventTypesCount: v.number(),
    thresholdedDays: v.number(),
    reportMeta: reportMetaDocValidator,
  }),
  handler: async (ctx, { from, to }) => {
    const { workspaceId } = await requireMembership(ctx);

    const [rows, reportMeta, config] = await Promise.all([
      ctx.db
        .query("ga4MetricDaily")
        .withIndex("by_workspace_report_date", (q) =>
          q
            .eq("workspaceId", workspaceId)
            .eq("reportKey", "events_by_name")
            .gte("date", from)
            .lte("date", to),
        )
        .collect(),
      ctx.db
        .query("ga4ReportMeta")
        .withIndex("by_workspace_report", (q) =>
          q.eq("workspaceId", workspaceId).eq("reportKey", "events_by_name"),
        )
        .unique(),
      ctx.db
        .query("ga4Config")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
        .unique(),
    ]);

    const keyEventsSet = new Set(
      (config?.keyEvents ?? []).map((k) => k.eventName),
    );

    type EventAgg = {
      eventName: string;
      eventCount: number;
      totalUsers: number;
      eventValue: number;
    };

    const byName = new Map<string, EventAgg>();
    const thresholdedDates = new Set<string>();
    let totalCount = 0;
    let totalUsers = 0;
    let totalValue = 0;

    for (const r of rows) {
      if (r.state === "thresholded") {
        thresholdedDates.add(r.date);
        continue;
      }
      if (r.dimensionValues.length === 0) continue;
      const eventName = r.dimensionValues[0] || "(not set)";
      let agg = byName.get(eventName);
      if (!agg) {
        agg = {
          eventName,
          eventCount: 0,
          totalUsers: 0,
          eventValue: 0,
        };
        byName.set(eventName, agg);
      }

      if (r.state === "value" && r.value !== undefined) {
        if (r.metric === "eventCount") {
          agg.eventCount += r.value;
          totalCount += r.value;
        } else if (r.metric === "totalUsers") {
          agg.totalUsers += r.value;
          totalUsers += r.value;
        } else if (r.metric === "eventValue") {
          agg.eventValue += r.value;
          totalValue += r.value;
        }
      }
    }

    const allEvents = Array.from(byName.values()).map((agg) => ({
      eventName: agg.eventName,
      eventCount: agg.eventCount,
      totalUsers: agg.totalUsers,
      eventValue: agg.eventValue,
      eventsPerUser: agg.totalUsers > 0 ? agg.eventCount / agg.totalUsers : 0,
      isKeyEvent: keyEventsSet.has(agg.eventName),
    }));

    allEvents.sort(
      (a, b) => b.eventCount - a.eventCount || b.totalUsers - a.totalUsers,
    );
    const top20 = allEvents.slice(0, 20);

    const totalEventsPerUser = totalUsers > 0 ? totalCount / totalUsers : 0;

    return {
      rows: top20,
      totals: {
        eventCount: totalCount,
        totalUsers,
        eventValue: totalValue,
        eventsPerUser: totalEventsPerUser,
      },
      eventTypesCount: byName.size,
      thresholdedDays: thresholdedDates.size,
      reportMeta,
    };
  },
});

const audienceDeviceSeriesPointValidator = v.object({
  date: v.string(),
  desktop: v.number(),
  mobile: v.number(),
  tablet: v.number(),
});

const audienceDeviceRowValidator = v.object({
  deviceCategory: v.string(),
  sessions: v.number(),
  engagedSessions: v.number(),
  totalUsers: v.number(),
  keyEvents: v.number(),
  engagementRate: v.number(),
});

const audienceDeviceTotalsValidator = v.object({
  sessions: v.number(),
  engagedSessions: v.number(),
  totalUsers: v.number(),
  keyEvents: v.number(),
  engagementRate: v.number(),
});

/**
 * Audience device breakdown: daily stacked area series + per-device totals.
 */
export const audienceDevice = query({
  args: { from: v.string(), to: v.string() },
  returns: v.object({
    series: v.array(audienceDeviceSeriesPointValidator),
    rows: v.array(audienceDeviceRowValidator),
    totals: audienceDeviceTotalsValidator,
    thresholdedDays: v.number(),
    reportMeta: reportMetaDocValidator,
  }),
  handler: async (ctx, { from, to }) => {
    const { workspaceId } = await requireMembership(ctx);

    const [rows, reportMeta] = await Promise.all([
      ctx.db
        .query("ga4MetricDaily")
        .withIndex("by_workspace_report_date", (q) =>
          q
            .eq("workspaceId", workspaceId)
            .eq("reportKey", "audience_device")
            .gte("date", from)
            .lte("date", to),
        )
        .collect(),
      ctx.db
        .query("ga4ReportMeta")
        .withIndex("by_workspace_report", (q) =>
          q.eq("workspaceId", workspaceId).eq("reportKey", "audience_device"),
        )
        .unique(),
    ]);

    type DeviceAgg = {
      deviceCategory: string;
      sessions: number;
      engagedSessions: number;
      totalUsers: number;
      keyEvents: number;
    };

    const byDevice = new Map<string, DeviceAgg>();
    const byDateDevice = new Map<string, { desktop: number; mobile: number; tablet: number }>();
    const thresholdedDates = new Set<string>();

    let totalSessions = 0;
    let totalEngaged = 0;
    let totalUsers = 0;
    let totalKeyEvents = 0;

    for (const r of rows) {
      if (r.state === "thresholded") {
        thresholdedDates.add(r.date);
        continue;
      }
      if (r.dimensionValues.length === 0) continue;
      const device = (r.dimensionValues[0] || "other").toLowerCase();
      let agg = byDevice.get(device);
      if (!agg) {
        agg = {
          deviceCategory: device,
          sessions: 0,
          engagedSessions: 0,
          totalUsers: 0,
          keyEvents: 0,
        };
        byDevice.set(device, agg);
      }

      let dateObj = byDateDevice.get(r.date);
      if (!dateObj) {
        dateObj = { desktop: 0, mobile: 0, tablet: 0 };
        byDateDevice.set(r.date, dateObj);
      }

      if (r.state === "value" && r.value !== undefined) {
        if (r.metric === "sessions") {
          agg.sessions += r.value;
          totalSessions += r.value;
          if (device === "desktop") dateObj.desktop += r.value;
          else if (device === "mobile") dateObj.mobile += r.value;
          else if (device === "tablet") dateObj.tablet += r.value;
        } else if (r.metric === "engagedSessions") {
          agg.engagedSessions += r.value;
          totalEngaged += r.value;
        } else if (r.metric === "totalUsers") {
          agg.totalUsers += r.value;
          totalUsers += r.value;
        } else if (r.metric === "keyEvents") {
          agg.keyEvents += r.value;
          totalKeyEvents += r.value;
        }
      }
    }

    // Build ordered date series for stacked area chart
    const series = Array.from(byDateDevice.entries())
      .map(([date, d]) => ({
        date,
        desktop: d.desktop,
        mobile: d.mobile,
        tablet: d.tablet,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const categoryOrder = ["desktop", "mobile", "tablet"];
    const deviceRows = categoryOrder.map((cat) => {
      const agg = byDevice.get(cat) ?? {
        deviceCategory: cat,
        sessions: 0,
        engagedSessions: 0,
        totalUsers: 0,
        keyEvents: 0,
      };
      return {
        deviceCategory: cat,
        sessions: agg.sessions,
        engagedSessions: agg.engagedSessions,
        totalUsers: agg.totalUsers,
        keyEvents: agg.keyEvents,
        engagementRate:
          agg.sessions > 0 ? agg.engagedSessions / agg.sessions : 0,
      };
    });

    const totEngagementRate =
      totalSessions > 0 ? totalEngaged / totalSessions : 0;

    return {
      series,
      rows: deviceRows,
      totals: {
        sessions: totalSessions,
        engagedSessions: totalEngaged,
        totalUsers,
        keyEvents: totalKeyEvents,
        engagementRate: totEngagementRate,
      },
      thresholdedDays: thresholdedDates.size,
      reportMeta,
    };
  },
});

const audienceGeoRowValidator = v.object({
  name: v.string(),
  totalUsers: v.number(),
  sessions: v.number(),
  keyEvents: v.number(),
});

const audienceGeoTotalsValidator = v.object({
  totalUsers: v.number(),
  sessions: v.number(),
  keyEvents: v.number(),
});

/**
 * Audience geography breakdown: top 10 countries or cities with horizontal rank.
 */
export const audienceGeo = query({
  args: {
    from: v.string(),
    to: v.string(),
    level: v.union(v.literal("country"), v.literal("city")),
  },
  returns: v.object({
    level: v.union(v.literal("country"), v.literal("city")),
    rows: v.array(audienceGeoRowValidator),
    totals: audienceGeoTotalsValidator,
    itemCount: v.number(),
    thresholdedDays: v.number(),
    reportMeta: reportMetaDocValidator,
  }),
  handler: async (ctx, { from, to, level }) => {
    const { workspaceId } = await requireMembership(ctx);

    const [rows, reportMeta] = await Promise.all([
      ctx.db
        .query("ga4MetricDaily")
        .withIndex("by_workspace_report_date", (q) =>
          q
            .eq("workspaceId", workspaceId)
            .eq("reportKey", "audience_geo")
            .gte("date", from)
            .lte("date", to),
        )
        .collect(),
      ctx.db
        .query("ga4ReportMeta")
        .withIndex("by_workspace_report", (q) =>
          q.eq("workspaceId", workspaceId).eq("reportKey", "audience_geo"),
        )
        .unique(),
    ]);

    type GeoAgg = {
      name: string;
      totalUsers: number;
      sessions: number;
      keyEvents: number;
    };

    const byName = new Map<string, GeoAgg>();
    const thresholdedDates = new Set<string>();

    let grandUsers = 0;
    let grandSessions = 0;
    let grandKeyEvents = 0;

    for (const r of rows) {
      if (r.state === "thresholded") {
        thresholdedDates.add(r.date);
        continue;
      }
      if (r.dimensionValues.length === 0) continue;

      const country = r.dimensionValues[0] || "(not set)";
      const city = r.dimensionValues[1] || "(not set)";
      const name = level === "country" ? country : city === "(not set)" ? `${city} (${country})` : city;

      let agg = byName.get(name);
      if (!agg) {
        agg = { name, totalUsers: 0, sessions: 0, keyEvents: 0 };
        byName.set(name, agg);
      }

      if (r.state === "value" && r.value !== undefined) {
        if (r.metric === "totalUsers") {
          agg.totalUsers += r.value;
          grandUsers += r.value;
        } else if (r.metric === "sessions") {
          agg.sessions += r.value;
          grandSessions += r.value;
        } else if (r.metric === "keyEvents") {
          agg.keyEvents += r.value;
          grandKeyEvents += r.value;
        }
      }
    }

    const allItems = Array.from(byName.values());
    allItems.sort((a, b) => b.totalUsers - a.totalUsers || b.sessions - a.sessions);
    const top10 = allItems.slice(0, 10);

    return {
      level,
      rows: top10,
      totals: {
        totalUsers: grandUsers,
        sessions: grandSessions,
        keyEvents: grandKeyEvents,
      },
      itemCount: byName.size,
      thresholdedDays: thresholdedDates.size,
      reportMeta,
    };
  },
});

const timeCellValidator = v.object({
  sessions: v.number(),
  totalUsers: v.number(),
  hasData: v.boolean(),
});

const timeOfDayTotalsValidator = v.object({
  totalSessions: v.number(),
  totalUsers: v.number(),
  maxCellSessions: v.number(),
});

/**
 * Time of day breakdown: 7 x 24 heatmap matrix (dayOfWeek x hour).
 * dayOfWeek is derived from `date` in property timezone (0=Sunday, 1=Monday ... 6=Saturday).
 */
export const timeOfDay = query({
  args: { from: v.string(), to: v.string() },
  returns: v.object({
    matrix: v.array(v.array(timeCellValidator)), // 7 days x 24 hours
    totals: timeOfDayTotalsValidator,
    thresholdedDays: v.number(),
    timeZone: v.string(),
    reportMeta: reportMetaDocValidator,
  }),
  handler: async (ctx, { from, to }) => {
    const { workspaceId } = await requireMembership(ctx);

    const [rows, reportMeta] = await Promise.all([
      ctx.db
        .query("ga4MetricDaily")
        .withIndex("by_workspace_report_date", (q) =>
          q
            .eq("workspaceId", workspaceId)
            .eq("reportKey", "time_hour")
            .gte("date", from)
            .lte("date", to),
        )
        .collect(),
      ctx.db
        .query("ga4ReportMeta")
        .withIndex("by_workspace_report", (q) =>
          q.eq("workspaceId", workspaceId).eq("reportKey", "time_hour"),
        )
        .unique(),
    ]);

    const timeZone = reportMeta?.timeZone ?? "UTC";

    // Initialize 7 x 24 matrix
    const matrix: Array<Array<{ sessions: number; totalUsers: number; hasData: boolean }>> =
      Array.from({ length: 7 }, () =>
        Array.from({ length: 24 }, () => ({
          sessions: 0,
          totalUsers: 0,
          hasData: false,
        })),
      );

    const thresholdedDates = new Set<string>();
    let totalSessions = 0;
    let totalUsers = 0;
    let maxCellSessions = 0;

    for (const r of rows) {
      if (r.state === "thresholded") {
        thresholdedDates.add(r.date);
        continue;
      }
      if (r.dimensionValues.length === 0) continue;

      const hour = parseInt(r.dimensionValues[0] || "0", 10);
      if (hour < 0 || hour > 23) continue;

      // Derive dayOfWeek (0=Sun, 1=Mon, ..., 6=Sat) from ISO date string
      const [year, month, day] = r.date.split("-").map(Number);
      const dayOfWeek = new Date(
        Date.UTC(year, month - 1, day, 12, 0, 0),
      ).getUTCDay();

      const cell = matrix[dayOfWeek][hour];
      cell.hasData = true;

      if (r.state === "value" && r.value !== undefined) {
        if (r.metric === "sessions") {
          cell.sessions += r.value;
          totalSessions += r.value;
          if (cell.sessions > maxCellSessions) {
            maxCellSessions = cell.sessions;
          }
        } else if (r.metric === "totalUsers") {
          cell.totalUsers += r.value;
          totalUsers += r.value;
        }
      }
    }

    return {
      matrix,
      totals: {
        totalSessions,
        totalUsers,
        maxCellSessions,
      },
      thresholdedDays: thresholdedDates.size,
      timeZone,
      reportMeta,
    };
  },
});

// ── REALTIME & COHORTS QUERIES (A5 §5.1 / §5.2) ─────────────────────────────

const realtimeByMinuteValidator = v.object({
  minutesAgo: v.number(),
  activeUsers: v.number(),
});

const realtimeItemValidator = v.object({
  key: v.string(),
  value: v.number(),
});

/**
 * Returns latest realtime snapshot for the workspace (last 30 minutes).
 */
export const realtimeSnapshot = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      fetchedAt: v.number(),
      activeUsers: v.optional(v.number()),
      byMinute: v.array(realtimeByMinuteValidator),
      byScreen: v.array(realtimeItemValidator),
      byCountry: v.array(realtimeItemValidator),
      byDevice: v.array(realtimeItemValidator),
      byEvent: v.array(realtimeItemValidator),
      state: v.union(v.literal("value"), v.literal("unavailable")),
      error: v.optional(v.string()),
      ageSeconds: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const { workspaceId } = await requireMembership(ctx);

    const doc = await ctx.db
      .query("ga4Realtime")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .unique();

    if (!doc) return null;

    const ageSeconds = Math.max(0, Math.floor((Date.now() - doc.fetchedAt) / 1000));

    return {
      fetchedAt: doc.fetchedAt,
      activeUsers: doc.activeUsers,
      byMinute: doc.byMinute,
      byScreen: doc.byScreen,
      byCountry: doc.byCountry,
      byDevice: doc.byDevice,
      byEvent: doc.byEvent,
      state: doc.state,
      error: doc.error,
      ageSeconds,
    };
  },
});

const cohortPointValidator = v.object({
  nth: v.number(),
  activeUsers: v.optional(v.number()),
  retention: v.optional(v.number()),
  state: v.union(
    v.literal("value"),
    v.literal("thresholded"),
    v.literal("unavailable"),
  ),
});

const cohortGroupValidator = v.object({
  cohortName: v.string(),
  cohortStartDate: v.string(),
  totalUsers: v.optional(v.number()),
  points: v.array(cohortPointValidator),
});

/**
 * Returns weekly cohort retention breakdown.
 * Retention is dynamically calculated on read (cohortActiveUsers / cohortTotalUsers).
 * Never saved, unavailable if either numerator/denominator is missing/unavailable.
 */
export const cohortRetention = query({
  args: {
    granularity: v.optional(v.string()),
  },
  returns: v.object({
    granularity: v.string(),
    cohorts: v.array(cohortGroupValidator),
    thresholdedCount: v.number(),
  }),
  handler: async (ctx, { granularity = "WEEKLY" }) => {
    const { workspaceId } = await requireMembership(ctx);

    const rows = await ctx.db
      .query("ga4Cohorts")
      .withIndex("by_workspace_granularity", (q) =>
        q.eq("workspaceId", workspaceId).eq("granularity", granularity),
      )
      .collect();

    // Group rows by cohortName
    const byCohort = new Map<
      string,
      {
        cohortName: string;
        cohortStartDate: string;
        totalUsers?: number;
        pointsMap: Map<
          number,
          {
            nth: number;
            activeUsers?: number;
            state: "value" | "thresholded" | "unavailable";
          }
        >;
      }
    >();

    let thresholdedCount = 0;

    for (const r of rows) {
      if (r.state === "thresholded") thresholdedCount++;

      let group = byCohort.get(r.cohortName);
      if (!group) {
        group = {
          cohortName: r.cohortName,
          cohortStartDate: r.cohortStartDate,
          totalUsers: r.cohortTotalUsers,
          pointsMap: new Map(),
        };
        byCohort.set(r.cohortName, group);
      }

      if (r.cohortTotalUsers !== undefined && group.totalUsers === undefined) {
        group.totalUsers = r.cohortTotalUsers;
      }

      group.pointsMap.set(r.nth, {
        nth: r.nth,
        activeUsers: r.cohortActiveUsers,
        state: r.state,
      });
    }

    // Sort cohorts chronologically ascending (older cohorts first, up to recent)
    const sortedCohorts = Array.from(byCohort.values()).sort((a, b) =>
      a.cohortStartDate.localeCompare(b.cohortStartDate),
    );

    const cohortsResult = sortedCohorts.map((c) => {
      const points: Array<{
        nth: number;
        activeUsers?: number;
        retention?: number;
        state: "value" | "thresholded" | "unavailable";
      }> = [];

      const total = c.totalUsers;

      // Iterate nth from 0 to 11
      for (let nth = 0; nth < 12; nth++) {
        const p = c.pointsMap.get(nth);
        if (!p) continue;

        let retention: number | undefined = undefined;
        if (
          p.state === "value" &&
          p.activeUsers !== undefined &&
          total !== undefined &&
          total > 0
        ) {
          retention = p.activeUsers / total;
        }

        points.push({
          nth: p.nth,
          activeUsers: p.activeUsers,
          retention,
          state: p.state,
        });
      }

      // Sort points by nth ascending
      points.sort((a, b) => a.nth - b.nth);

      return {
        cohortName: c.cohortName,
        cohortStartDate: c.cohortStartDate,
        totalUsers: c.totalUsers,
        points,
      };
    });

    return {
      granularity,
      cohorts: cohortsResult,
      thresholdedCount,
    };
  },
});

// ── GOOGLE ADS PERFORMANCE QUERY (A6 §5.3 / A7 F2-F4) ─────────────────────────

const adsRowValidator = v.object({
  campaign: v.string(),
  keyword: v.optional(v.string()),
  cost: v.number(),
  clicks: v.number(),
  impressions: v.optional(v.number()),
  sessions: v.number(),
  engagedSessions: v.optional(v.number()),
  keyEvents: v.number(),
  costPerClick: v.optional(v.number()),
  costPerKeyEvent: v.optional(v.number()),
  sessionsPerClick: v.optional(v.number()),
});

const adsTotalsValidator = v.object({
  cost: v.number(),
  clicks: v.number(),
  impressions: v.optional(v.number()),
  sessions: v.number(),
  engagedSessions: v.optional(v.number()),
  keyEvents: v.number(),
  costPerClick: v.optional(v.number()),
  costPerKeyEvent: v.optional(v.number()),
  sessionsPerClick: v.optional(v.number()),
});

const adsDailyPointValidator = v.object({
  date: v.string(),
  cost: v.number(),
  clicks: v.number(),
  impressions: v.optional(v.number()),
  sessions: v.number(),
  engagedSessions: v.optional(v.number()),
  keyEvents: v.number(),
  state: v.union(
    v.literal("value"),
    v.literal("thresholded"),
    v.literal("unavailable"),
  ),
});

/**
 * Returns Google Ads performance combined with onsite GA4 behavior.
 * Supports campaign-level or keyword-level aggregation.
 * All derived ratios (costPerClick, costPerKeyEvent, sessionsPerClick) computed on read.
 * F2: Removes constant state field from campaign row.
 * F3: Currency falls back in order ga4Config -> ga4ReportMeta -> undefined.
 * F4: If thresholded days exist, derived ratios are undefined ("unavailable").
 * 4.4b: Returns accurate adsLinkStatus based on googleAdsLinks in ga4Config.
 */
export const adsPerformance = query({
  args: {
    from: v.string(),
    to: v.string(),
    level: v.union(v.literal("campaign"), v.literal("keyword")),
  },
  returns: v.object({
    level: v.union(v.literal("campaign"), v.literal("keyword")),
    rows: v.array(adsRowValidator),
    totals: adsTotalsValidator,
    dailySeries: v.array(adsDailyPointValidator),
    itemCount: v.number(),
    thresholdedDays: v.number(),
    currencyCode: v.optional(v.string()),
    availability: v.union(
      v.literal("available"),
      v.literal("blocked"),
      v.literal("unknown"),
    ),
    adsLinkStatus: v.union(
      v.literal("available"),
      v.literal("unlinked"),
      v.literal("linked_pending_data"),
      v.literal("unknown"),
    ),
    reportMeta: reportMetaDocValidator,
  }),
  handler: async (ctx, { from, to, level }) => {
    const { workspaceId } = await requireMembership(ctx);
    const reportKey = level === "campaign" ? "ads_campaign" : "ads_keyword";

    const [rows, reportMeta, dailyMeta, catalog, config] = await Promise.all([
      ctx.db
        .query("ga4MetricDaily")
        .withIndex("by_workspace_report_date", (q) =>
          q
            .eq("workspaceId", workspaceId)
            .eq("reportKey", reportKey)
            .gte("date", from)
            .lte("date", to),
        )
        .collect(),
      ctx.db
        .query("ga4ReportMeta")
        .withIndex("by_workspace_report", (q) =>
          q.eq("workspaceId", workspaceId).eq("reportKey", reportKey),
        )
        .unique(),
      ctx.db
        .query("ga4ReportMeta")
        .withIndex("by_workspace_report", (q) =>
          q.eq("workspaceId", workspaceId).eq("reportKey", "daily"),
        )
        .unique(),
      ctx.db
        .query("ga4Catalog")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
        .unique(),
      ctx.db
        .query("ga4Config")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
        .unique(),
    ]);

    const resolvedCost = resolveMetric("advertiserAdCost", catalog?.metrics);
    const availability = resolvedCost.availability;

    // F3: Resolve currency in order ga4Config -> ga4ReportMeta -> undefined
    const currencyCode =
      config?.currencyCode ??
      reportMeta?.currencyCode ??
      dailyMeta?.currencyCode ??
      undefined;

    // 4.4b: Resolve Google Ads link status
    const hasAdsLinks = (config?.googleAdsLinks?.length ?? 0) > 0;
    let adsLinkStatus: "available" | "unlinked" | "linked_pending_data" | "unknown" =
      "unknown";
    if (availability === "available") {
      adsLinkStatus = "available";
    } else if (!hasAdsLinks) {
      adsLinkStatus = "unlinked";
    } else {
      adsLinkStatus = "linked_pending_data";
    }

    type EntityAgg = {
      campaign: string;
      keyword?: string;
      cost: number;
      clicks: number;
      impressions: number;
      sessions: number;
      engagedSessions: number;
      keyEvents: number;
    };

    type DailyAgg = {
      date: string;
      cost: number;
      clicks: number;
      impressions: number;
      sessions: number;
      engagedSessions: number;
      keyEvents: number;
      state: "value" | "thresholded" | "unavailable";
    };

    const byEntity = new Map<string, EntityAgg>();
    const byDate = new Map<string, DailyAgg>();
    const thresholdedDates = new Set<string>();

    let totCost = 0;
    let totClicks = 0;
    let totImpressions = 0;
    let totSessions = 0;
    let totEngagedSessions = 0;
    let totKeyEvents = 0;

    for (const r of rows) {
      // F2: Count thresholded marker rows before skipping
      if (r.state === "thresholded") {
        thresholdedDates.add(r.date);
      }

      // Track by date
      let daily = byDate.get(r.date);
      if (!daily) {
        daily = {
          date: r.date,
          cost: 0,
          clicks: 0,
          impressions: 0,
          sessions: 0,
          engagedSessions: 0,
          keyEvents: 0,
          state: r.state,
        };
        byDate.set(r.date, daily);
      }

      if (r.state === "value" && r.value !== undefined) {
        if (r.metric === "advertiserAdCost") {
          daily.cost += r.value;
          totCost += r.value;
        } else if (r.metric === "advertiserAdClicks") {
          daily.clicks += r.value;
          totClicks += r.value;
        } else if (r.metric === "advertiserAdImpressions") {
          daily.impressions += r.value;
          totImpressions += r.value;
        } else if (r.metric === "sessions") {
          daily.sessions += r.value;
          totSessions += r.value;
        } else if (r.metric === "engagedSessions") {
          daily.engagedSessions += r.value;
          totEngagedSessions += r.value;
        } else if (r.metric === "keyEvents") {
          daily.keyEvents += r.value;
          totKeyEvents += r.value;
        }
      }

      // Track by entity (campaign / keyword)
      if (r.dimensionValues.length === 0) continue;
      const campaign = r.dimensionValues[0] || "(not set)";
      const keyword =
        level === "keyword"
          ? r.dimensionValues[1] || "(not set)"
          : undefined;
      const entityKey =
        level === "keyword" ? `${campaign}\u0000${keyword}` : campaign;

      let agg = byEntity.get(entityKey);
      if (!agg) {
        agg = {
          campaign,
          keyword,
          cost: 0,
          clicks: 0,
          impressions: 0,
          sessions: 0,
          engagedSessions: 0,
          keyEvents: 0,
        };
        byEntity.set(entityKey, agg);
      }

      if (r.state === "value" && r.value !== undefined) {
        if (r.metric === "advertiserAdCost") {
          agg.cost += r.value;
        } else if (r.metric === "advertiserAdClicks") {
          agg.clicks += r.value;
        } else if (r.metric === "advertiserAdImpressions") {
          agg.impressions += r.value;
        } else if (r.metric === "sessions") {
          agg.sessions += r.value;
        } else if (r.metric === "engagedSessions") {
          agg.engagedSessions += r.value;
        } else if (r.metric === "keyEvents") {
          agg.keyEvents += r.value;
        }
      }
    }

    const hasThresholdedDays = thresholdedDates.size > 0;

    // F4: If there are thresholded days, derived ratios cannot be computed reliably
    const allRows = Array.from(byEntity.values()).map((agg) => {
      const costPerClick =
        !hasThresholdedDays && agg.clicks > 0 ? agg.cost / agg.clicks : undefined;
      const costPerKeyEvent =
        !hasThresholdedDays && agg.keyEvents > 0
          ? agg.cost / agg.keyEvents
          : undefined;
      const sessionsPerClick =
        !hasThresholdedDays && agg.clicks > 0
          ? agg.sessions / agg.clicks
          : undefined;

      return {
        campaign: agg.campaign,
        keyword: agg.keyword,
        cost: agg.cost,
        clicks: agg.clicks,
        impressions: level === "campaign" ? agg.impressions : undefined,
        sessions: agg.sessions,
        engagedSessions:
          level === "campaign" ? agg.engagedSessions : undefined,
        keyEvents: agg.keyEvents,
        costPerClick,
        costPerKeyEvent,
        sessionsPerClick,
      };
    });

    // Sort descending by cost, then clicks, then sessions
    allRows.sort(
      (a, b) =>
        b.cost - a.cost || b.clicks - a.clicks || b.sessions - a.sessions,
    );
    const top20 = allRows.slice(0, 20);

    const sortedDaily = Array.from(byDate.values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    );

    const totCostPerClick =
      !hasThresholdedDays && totClicks > 0 ? totCost / totClicks : undefined;
    const totCostPerKeyEvent =
      !hasThresholdedDays && totKeyEvents > 0
        ? totCost / totKeyEvents
        : undefined;
    const totSessionsPerClick =
      !hasThresholdedDays && totClicks > 0
        ? totSessions / totClicks
        : undefined;

    return {
      level,
      rows: top20,
      totals: {
        cost: totCost,
        clicks: totClicks,
        impressions: level === "campaign" ? totImpressions : undefined,
        sessions: totSessions,
        engagedSessions:
          level === "campaign" ? totEngagedSessions : undefined,
        keyEvents: totKeyEvents,
        costPerClick: totCostPerClick,
        costPerKeyEvent: totCostPerKeyEvent,
        sessionsPerClick: totSessionsPerClick,
      },
      dailySeries: sortedDaily,
      itemCount: byEntity.size,
      thresholdedDays: thresholdedDates.size,
      currencyCode,
      availability,
      adsLinkStatus,
      reportMeta,
    };
  },
});

// ── GA4 PROPERTY CONFIGURATION QUERY (A7 §4.5) ──────────────────────────────

export const ga4Configuration = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("ga4Config"),
      _creationTime: v.number(),
      workspaceId: v.id("workspaces"),
      propertyId: v.string(),
      fetchedAt: v.number(),
      displayName: v.optional(v.string()),
      timeZone: v.optional(v.string()),
      currencyCode: v.optional(v.string()),
      industryCategory: v.optional(v.string()),
      serviceLevel: v.optional(v.string()),
      createTime: v.optional(v.string()),
      eventDataRetention: v.optional(v.string()),
      resetUserDataOnNewActivity: v.optional(v.boolean()),
      keyEvents: v.optional(
        v.array(
          v.object({
            eventName: v.string(),
            countingMethod: v.optional(v.string()),
            custom: v.optional(v.boolean()),
            createTime: v.optional(v.string()),
          }),
        ),
      ),
      customDimensions: v.optional(
        v.array(
          v.object({
            parameterName: v.string(),
            displayName: v.string(),
            description: v.optional(v.string()),
            scope: v.optional(v.string()),
          }),
        ),
      ),
      customMetrics: v.optional(
        v.array(
          v.object({
            parameterName: v.string(),
            displayName: v.string(),
            description: v.optional(v.string()),
            scope: v.optional(v.string()),
          }),
        ),
      ),
      dataStreams: v.optional(
        v.array(
          v.object({
            displayName: v.string(),
            type: v.optional(v.string()),
            measurementId: v.optional(v.string()),
            defaultUri: v.optional(v.string()),
          }),
        ),
      ),
      googleAdsLinks: v.optional(
        v.array(
          v.object({
            customerId: v.string(),
            adsPersonalizationEnabled: v.optional(v.boolean()),
            createTime: v.optional(v.string()),
          }),
        ),
      ),
      errors: v.optional(
        v.array(
          v.object({
            resource: v.string(),
            reason: v.string(),
          }),
        ),
      ),
      ageSeconds: v.number(),
      ageHours: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const { workspaceId } = await requireMembership(ctx);

    const config = await ctx.db
      .query("ga4Config")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .unique();

    if (!config) return null;

    const now = Date.now();
    const ageSeconds = Math.max(0, Math.floor((now - config.fetchedAt) / 1000));
    const ageHours = Math.max(0, Math.floor(ageSeconds / 3600));

    return {
      ...config,
      ageSeconds,
      ageHours,
    };
  },
});


