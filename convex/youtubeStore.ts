import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireMembership } from "./lib/auth";

/**
 * YouTube persistence & query layer (V8 runtime, Y2).
 *
 * The sync action does all the fetching and hands one snapshot to
 * `upsertSnapshot`, which writes it in a single Convex transaction. Upserts key
 * on `[workspaceId, date]` (daily totals), `[workspaceId, videoId]` (videos)
 * and `[workspaceId, date, sourceType]` (traffic sources), so re-running a sync
 * over the same window is idempotent.
 */

const dailyTotalRowValidator = v.object({
  date: v.string(),
  views: v.number(),
  estimatedMinutesWatched: v.number(),
  averageViewDuration: v.number(),
  averageViewPercentage: v.number(),
  subscribersGained: v.number(),
  subscribersLost: v.number(),
  likes: v.number(),
  comments: v.number(),
  shares: v.number(),
});

const videoRowValidator = v.object({
  videoId: v.string(),
  title: v.string(),
  publishedAt: v.number(),
  thumbnailUrl: v.optional(v.string()),
  duration: v.optional(v.string()),
  views: v.number(),
  likes: v.number(),
  comments: v.number(),
  estimatedMinutesWatched: v.optional(v.number()),
  averageViewPercentage: v.optional(v.number()),
});

const trafficSourceRowValidator = v.object({
  date: v.string(),
  sourceType: v.string(),
  views: v.number(),
  estimatedMinutesWatched: v.number(),
});

/**
 * Atomic snapshot upsert called from the sync action. Existing rows are read
 * once per table as a range/prefix scan and matched in memory — a per-row point
 * query would be thousands of index lookups inside one transaction.
 */
export const upsertSnapshot = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    dailyTotals: v.array(dailyTotalRowValidator),
    videos: v.array(videoRowValidator),
    trafficSources: v.array(trafficSourceRowValidator),
  },
  returns: v.number(),
  handler: async (ctx, { workspaceId, dailyTotals, videos, trafficSources }) => {
    // One timestamp for the whole snapshot: every row in it is equally fresh.
    const syncedAt = Date.now();

    // 1. Daily totals — prefetch the covered date range, match by date.
    if (dailyTotals.length > 0) {
      const dates = dailyTotals.map((d) => d.date).sort();
      const existingDaily = await ctx.db
        .query("ytDailyTotals")
        .withIndex("by_workspace_date", (q) =>
          q
            .eq("workspaceId", workspaceId)
            .gte("date", dates[0])
            .lte("date", dates[dates.length - 1]),
        )
        .collect();
      const byDate = new Map(existingDaily.map((r) => [r.date, r]));

      for (const d of dailyTotals) {
        const existing = byDate.get(d.date);
        if (existing !== undefined) {
          await ctx.db.patch(existing._id, { ...d, syncedAt });
        } else {
          await ctx.db.insert("ytDailyTotals", { workspaceId, ...d, syncedAt });
        }
      }
    }

    // 2. Videos — prefetch every video row for the workspace (bounded by the
    //    channel uploads we sync), match by videoId.
    if (videos.length > 0) {
      const existingVideos = await ctx.db
        .query("ytVideoStats")
        .withIndex("by_workspace_video", (q) => q.eq("workspaceId", workspaceId))
        .collect();
      const byVideoId = new Map(existingVideos.map((r) => [r.videoId, r]));

      for (const vid of videos) {
        const existing = byVideoId.get(vid.videoId);
        if (existing !== undefined) {
          // Passing an undefined optional clears it on purpose: a video that
          // dropped out of the Analytics top-100 must not keep a stale figure.
          await ctx.db.patch(existing._id, { ...vid, syncedAt });
        } else {
          await ctx.db.insert("ytVideoStats", { workspaceId, ...vid, syncedAt });
        }
      }
    }

    // 3. Traffic sources — natural key is [date, sourceType]; the index covers
    //    the date prefix, so match the source type in memory.
    if (trafficSources.length > 0) {
      const dates = trafficSources.map((t) => t.date).sort();
      const existingTraffic = await ctx.db
        .query("ytTrafficSources")
        .withIndex("by_workspace_date", (q) =>
          q
            .eq("workspaceId", workspaceId)
            .gte("date", dates[0])
            .lte("date", dates[dates.length - 1]),
        )
        .collect();
      const byDateSource = new Map(
        existingTraffic.map((r) => [`${r.date}|${r.sourceType}`, r]),
      );

      for (const t of trafficSources) {
        const existing = byDateSource.get(`${t.date}|${t.sourceType}`);
        if (existing !== undefined) {
          await ctx.db.patch(existing._id, {
            views: t.views,
            estimatedMinutesWatched: t.estimatedMinutesWatched,
            syncedAt,
          });
        } else {
          await ctx.db.insert("ytTrafficSources", {
            workspaceId,
            ...t,
            syncedAt,
          });
        }
      }
    }

    return dailyTotals.length + videos.length + trafficSources.length;
  },
});

// ── Public queries for /youtube (Y3) ────────────────────────────────────────

const dailyPointValidator = v.object({
  date: v.string(),
  views: v.number(),
  estimatedMinutesWatched: v.number(),
  averageViewDuration: v.number(),
  averageViewPercentage: v.number(),
  subscribersGained: v.number(),
  subscribersLost: v.number(),
  likes: v.number(),
  comments: v.number(),
  shares: v.number(),
  syncedAt: v.number(),
});

/** Channel daily totals in [from, to], ascending by date. */
export const dailyTotals = query({
  args: { from: v.string(), to: v.string() },
  returns: v.array(dailyPointValidator),
  handler: async (ctx, { from, to }) => {
    const { workspaceId } = await requireMembership(ctx);
    const rows = await ctx.db
      .query("ytDailyTotals")
      .withIndex("by_workspace_date", (q) =>
        q.eq("workspaceId", workspaceId).gte("date", from).lte("date", to),
      )
      .collect();

    return rows.map((r) => ({
      date: r.date,
      views: r.views,
      estimatedMinutesWatched: r.estimatedMinutesWatched,
      averageViewDuration: r.averageViewDuration,
      averageViewPercentage: r.averageViewPercentage,
      subscribersGained: r.subscribersGained,
      subscribersLost: r.subscribersLost,
      likes: r.likes,
      comments: r.comments,
      shares: r.shares,
      syncedAt: r.syncedAt,
    }));
  },
});

const videoViewValidator = v.object({
  _id: v.id("ytVideoStats"),
  videoId: v.string(),
  title: v.string(),
  publishedAt: v.number(),
  thumbnailUrl: v.optional(v.string()),
  duration: v.optional(v.string()),
  views: v.number(),
  likes: v.number(),
  comments: v.number(),
  estimatedMinutesWatched: v.optional(v.number()),
  averageViewPercentage: v.optional(v.number()),
  syncedAt: v.number(),
});

const DEFAULT_VIDEO_LIMIT = 25;
const MAX_VIDEO_LIMIT = 100;

/** Newest videos first. `limit` defaults to 25 and is clamped to 100. */
export const videos = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(videoViewValidator),
  handler: async (ctx, { limit }) => {
    const { workspaceId } = await requireMembership(ctx);
    const take = Math.min(
      Math.max(1, Math.floor(limit ?? DEFAULT_VIDEO_LIMIT)),
      MAX_VIDEO_LIMIT,
    );
    const rows = await ctx.db
      .query("ytVideoStats")
      .withIndex("by_workspace_published", (q) =>
        q.eq("workspaceId", workspaceId),
      )
      .order("desc")
      .take(take);

    return rows.map((r) => ({
      _id: r._id,
      videoId: r.videoId,
      title: r.title,
      publishedAt: r.publishedAt,
      thumbnailUrl: r.thumbnailUrl,
      duration: r.duration,
      views: r.views,
      likes: r.likes,
      comments: r.comments,
      estimatedMinutesWatched: r.estimatedMinutesWatched,
      averageViewPercentage: r.averageViewPercentage,
      syncedAt: r.syncedAt,
    }));
  },
});

const trafficSourceViewValidator = v.object({
  sourceType: v.string(),
  views: v.number(),
  estimatedMinutesWatched: v.number(),
});

/**
 * Traffic sources aggregated over the whole [from, to] range — the per-day rows
 * summed per `sourceType`, biggest first. The dashboard wants the share of
 * views per source, not a daily series.
 */
export const trafficSources = query({
  args: { from: v.string(), to: v.string() },
  returns: v.array(trafficSourceViewValidator),
  handler: async (ctx, { from, to }) => {
    const { workspaceId } = await requireMembership(ctx);
    const rows = await ctx.db
      .query("ytTrafficSources")
      .withIndex("by_workspace_date", (q) =>
        q.eq("workspaceId", workspaceId).gte("date", from).lte("date", to),
      )
      .collect();

    const totals = new Map<
      string,
      { views: number; estimatedMinutesWatched: number }
    >();
    for (const r of rows) {
      const acc = totals.get(r.sourceType);
      if (acc === undefined) {
        totals.set(r.sourceType, {
          views: r.views,
          estimatedMinutesWatched: r.estimatedMinutesWatched,
        });
      } else {
        acc.views += r.views;
        acc.estimatedMinutesWatched += r.estimatedMinutesWatched;
      }
    }

    return [...totals.entries()]
      .map(([sourceType, t]) => ({ sourceType, ...t }))
      .sort((a, b) => b.views - a.views);
  },
});
