import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireMembership } from "./lib/auth";
import { providerValidator } from "./lib/providers";

/**
 * ============================================================================
 * INSTAGRAM PERSISTENCE & QUERY LAYER (V8 Runtime)
 * ============================================================================
 *
 * All database writes are batched in atomic Convex mutations. Upsert semantics
 * ensure idempotency:
 *   - `igAccountDaily` upserted by natural key `[workspaceId, date]`
 *   - `igMediaStats` upserted by natural key `[workspaceId, mediaId]`
 *
 * History is preserved: media items update their lifetime totals on each sync
 * with an updated `syncedAt` timestamp.
 * ============================================================================
 */

export const accountDailyRowValidator = v.object({
  date: v.string(),
  followersCount: v.number(),
  reach: v.number(),
  profileViews: v.optional(v.number()),
  totalInteractions: v.optional(v.number()),
  accountsEngaged: v.number(),
});

export const metricRowValidator = v.object({
  date: v.string(),
  metric: v.string(),
  dimensionKeys: v.array(v.string()),
  dimensionValues: v.array(v.string()),
  value: v.optional(v.number()),
  state: v.union(
    v.literal("value"),
    v.literal("suppressed"),
    v.literal("unavailable"),
  ),
  reason: v.optional(v.string()),
  syncedAt: v.number(),
});

export const mediaChildValidator = v.object({
  id: v.string(),
  mediaType: v.string(),
  mediaUrl: v.optional(v.string()),
  thumbnailUrl: v.optional(v.string()),
});

export const mediaRowValidator = v.object({
  mediaId: v.string(),
  mediaType: v.string(),
  caption: v.string(),
  permalink: v.string(),
  publishedAt: v.number(),
  reach: v.number(),
  likes: v.number(),
  comments: v.number(),
  saves: v.number(),
  shares: v.number(),
  views: v.number(),
  reposts: v.optional(v.number()),
  profileVisits: v.optional(v.number()),
  follows: v.optional(v.number()),
  replies: v.optional(v.number()),
  totalInteractions: v.optional(v.number()),
  reelsAvgWatchTimeMs: v.optional(v.number()),
  reelsVideoViewTotalTimeMs: v.optional(v.number()),
  reelsSkipRate: v.optional(v.number()),
  crosspostedViews: v.optional(v.number()),
  facebookViews: v.optional(v.number()),
  metricStates: v.optional(
    v.record(
      v.string(),
      v.object({
        state: v.union(
          v.literal("value"),
          v.literal("suppressed"),
          v.literal("unavailable"),
        ),
        reason: v.optional(v.string()),
      }),
    ),
  ),
  syncedAt: v.number(),
  mediaUrl: v.optional(v.string()),
  thumbnailUrl: v.optional(v.string()),
  children: v.optional(v.array(mediaChildValidator)),
  commentsEnabled: v.optional(v.boolean()),
});

export const mediaBreakdownRowValidator = v.object({
  mediaId: v.string(),
  metric: v.string(),
  dimensionKey: v.string(),
  dimensionValue: v.string(),
  value: v.optional(v.number()),
  state: v.union(
    v.literal("value"),
    v.literal("suppressed"),
    v.literal("unavailable"),
  ),
  reason: v.optional(v.string()),
  syncedAt: v.number(),
});

export const storyRowValidator = v.object({
  storyId: v.string(),
  mediaType: v.string(),
  mediaUrl: v.optional(v.string()),
  thumbnailUrl: v.optional(v.string()),
  permalink: v.optional(v.string()),
  timestamp: v.number(),
  expiresAt: v.number(),
});

// ── Internal Queries & Mutations (for Sync & Token Actions) ──────────────────

/**
 * Look up workspace membership for an authenticated user.
 */
export const getMembership = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(
    v.null(),
    v.object({
      workspaceId: v.id("workspaces"),
      role: v.union(v.literal("owner"), v.literal("client_viewer")),
    }),
  ),
  handler: async (ctx, { userId }) => {
    const membership = await ctx.db
      .query("members")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!membership) return null;
    return { workspaceId: membership.workspaceId, role: membership.role };
  },
});

/**
 * Look up connection for a workspace and provider.
 */
export const getWorkspaceConnection = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    provider: providerValidator,
  },
  handler: async (ctx, { workspaceId, provider }) => {
    return await ctx.db
      .query("connections")
      .withIndex("by_workspace_provider", (q) =>
        q.eq("workspaceId", workspaceId).eq("provider", provider),
      )
      .first();
  },
});

/**
 * Persist a one-time OAuth `state` nonce for the connect flow. Also sweeps
 * stale nonces (>1h) so abandoned attempts never accumulate.
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
      .filter((q) => q.lt(q.field("createdAt"), cutoff))
      .collect();
    for (const row of stale) {
      await ctx.db.delete(row._id);
    }

    await ctx.db.insert("oauthStates", {
      workspaceId,
      userId,
      provider: "meta_ig",
      nonce,
      redirectUri,
      createdAt: Date.now(),
    });
    return null;
  },
});

/**
 * Atomically consume (look up + delete) an OAuth `state` nonce.
 * Returns null when the nonce is unknown — i.e. forged, already used, or swept.
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
    if (row === null) return null;
    await ctx.db.delete(row._id);
    return {
      workspaceId: row.workspaceId,
      redirectUri: row.redirectUri,
      createdAt: row.createdAt,
    };
  },
});

/**
 * Upsert a single daily account snapshot by [workspaceId, date].
 */
export const upsertAccountDaily = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    row: accountDailyRowValidator,
  },
  returns: v.number(),
  handler: async (ctx, { workspaceId, row }) => {
    const existing = await ctx.db
      .query("igAccountDaily")
      .withIndex("by_workspace_date", (q) =>
        q.eq("workspaceId", workspaceId).eq("date", row.date),
      )
      .unique();

    if (existing !== null) {
      await ctx.db.patch(existing._id, {
        followersCount: row.followersCount,
        reach: row.reach,
        ...(row.profileViews !== undefined ? { profileViews: row.profileViews } : {}),
        ...(row.totalInteractions !== undefined
          ? { totalInteractions: row.totalInteractions }
          : {}),
        accountsEngaged: row.accountsEngaged,
      });
    } else {
      await ctx.db.insert("igAccountDaily", {
        workspaceId,
        ...row,
      });
    }
    return 1;
  },
});

/**
 * Upsert a batch of metric rows into igMetricDaily by natural key:
 * [workspaceId, date, metric, dimensionKeys, dimensionValues].
 */
export const upsertMetricBatch = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    rows: v.array(metricRowValidator),
  },
  returns: v.number(),
  handler: async (ctx, { workspaceId, rows }) => {
    let written = 0;
    for (const row of rows) {
      const candidates = await ctx.db
        .query("igMetricDaily")
        .withIndex("by_workspace_date_metric", (q) =>
          q
            .eq("workspaceId", workspaceId)
            .eq("date", row.date)
            .eq("metric", row.metric),
        )
        .collect();

      const existing = candidates.find((c) => {
        if (c.dimensionKeys.length !== row.dimensionKeys.length) return false;
        if (c.dimensionValues.length !== row.dimensionValues.length) return false;
        const keysMatch = c.dimensionKeys.every((k, i) => k === row.dimensionKeys[i]);
        if (!keysMatch) return false;
        return c.dimensionValues.every((v, i) => v === row.dimensionValues[i]);
      });

      if (existing !== undefined) {
        await ctx.db.patch(existing._id, {
          value: row.value,
          state: row.state,
          reason: row.reason,
          syncedAt: row.syncedAt,
        });
      } else {
        await ctx.db.insert("igMetricDaily", {
          workspaceId,
          ...row,
        });
      }
      written++;
    }
    return written;
  },
});

/**
 * Check if a workspace already has completed backfilled historical metrics.
 */
export const hasMetricBackfill = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  returns: v.boolean(),
  handler: async (ctx, { workspaceId }) => {
    const cutoffDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const oldRow = await ctx.db
      .query("igMetricDaily")
      .withIndex("by_workspace_date_metric", (q) =>
        q.eq("workspaceId", workspaceId).lte("date", cutoffDate),
      )
      .first();
    return oldRow !== null;
  },
});

/**
 * Upsert a batch of media stats by [workspaceId, mediaId].
 */
export const upsertMediaBatch = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    rows: v.array(mediaRowValidator),
  },
  returns: v.number(),
  handler: async (ctx, { workspaceId, rows }) => {
    let written = 0;
    for (const row of rows) {
      const existing = await ctx.db
        .query("igMediaStats")
        .withIndex("by_workspace_media", (q) =>
          q.eq("workspaceId", workspaceId).eq("mediaId", row.mediaId),
        )
        .unique();

      if (existing !== null) {
        await ctx.db.patch(existing._id, {
          mediaType: row.mediaType,
          caption: row.caption,
          permalink: row.permalink,
          publishedAt: row.publishedAt,
          reach: row.reach,
          likes: row.likes,
          comments: row.comments,
          saves: row.saves,
          shares: row.shares,
          views: row.views,
          ...(row.reposts !== undefined ? { reposts: row.reposts } : {}),
          ...(row.profileVisits !== undefined ? { profileVisits: row.profileVisits } : {}),
          ...(row.follows !== undefined ? { follows: row.follows } : {}),
          ...(row.replies !== undefined ? { replies: row.replies } : {}),
          ...(row.totalInteractions !== undefined ? { totalInteractions: row.totalInteractions } : {}),
          ...(row.reelsAvgWatchTimeMs !== undefined ? { reelsAvgWatchTimeMs: row.reelsAvgWatchTimeMs } : {}),
          ...(row.reelsVideoViewTotalTimeMs !== undefined ? { reelsVideoViewTotalTimeMs: row.reelsVideoViewTotalTimeMs } : {}),
          ...(row.reelsSkipRate !== undefined ? { reelsSkipRate: row.reelsSkipRate } : {}),
          ...(row.crosspostedViews !== undefined ? { crosspostedViews: row.crosspostedViews } : {}),
          ...(row.facebookViews !== undefined ? { facebookViews: row.facebookViews } : {}),
          ...(row.metricStates ? { metricStates: row.metricStates } : {}),
          syncedAt: row.syncedAt,
          mediaUrl: row.mediaUrl,
          thumbnailUrl: row.thumbnailUrl,
          children: row.children,
          mediaUrlSyncedAt: row.syncedAt,
          // Absent from the answer means "Instagram did not say", which is not
          // the same as "off" — the stored answer stands until it does say.
          ...(row.commentsEnabled !== undefined
            ? { commentsEnabled: row.commentsEnabled }
            : {}),
          // Instagram still lists it, so an earlier "gone" verdict is void.
          deletedAt: undefined,
        });
      } else {
        await ctx.db.insert("igMediaStats", {
          workspaceId,
          ...row,
          mediaUrlSyncedAt: row.syncedAt,
        });
      }
      written++;
    }
    return written;
  },
});

/**
 * Upsert a batch of media breakdown rows into igMediaBreakdowns.
 */
export const upsertMediaBreakdownsBatch = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    rows: v.array(mediaBreakdownRowValidator),
  },
  returns: v.number(),
  handler: async (ctx, { workspaceId, rows }) => {
    let written = 0;
    const grouped = new Map<string, typeof rows>();
    for (const row of rows) {
      const key = `${row.mediaId}::${row.metric}`;
      const list = grouped.get(key) ?? [];
      list.push(row);
      grouped.set(key, list);
    }

    for (const [, groupRows] of grouped) {
      const sample = groupRows[0];
      const existing = await ctx.db
        .query("igMediaBreakdowns")
        .withIndex("by_workspace_media_metric", (q) =>
          q
            .eq("workspaceId", workspaceId)
            .eq("mediaId", sample.mediaId)
            .eq("metric", sample.metric),
        )
        .collect();

      for (const ex of existing) {
        await ctx.db.delete(ex._id);
      }

      for (const row of groupRows) {
        await ctx.db.insert("igMediaBreakdowns", {
          workspaceId,
          ...row,
        });
        written++;
      }
    }
    return written;
  },
});

/**
 * Upsert active stories in igStories, media stats in igMediaStats, and breakdowns in igMediaBreakdowns (G4).
 */
export const upsertStoriesAndMetrics = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    stories: v.array(storyRowValidator),
    mediaRows: v.array(mediaRowValidator),
    breakdownRows: v.array(mediaBreakdownRowValidator),
    now: v.number(),
  },
  returns: v.object({
    storiesUpserted: v.number(),
    mediaUpserted: v.number(),
    breakdownsUpserted: v.number(),
  }),
  handler: async (ctx, { workspaceId, stories, mediaRows, breakdownRows, now }) => {
    let storiesUpserted = 0;
    for (const story of stories) {
      const existing = await ctx.db
        .query("igStories")
        .withIndex("by_workspace_story", (q) =>
          q.eq("workspaceId", workspaceId).eq("storyId", story.storyId),
        )
        .first();

      if (existing !== null) {
        await ctx.db.patch(existing._id, {
          mediaType: story.mediaType,
          mediaUrl: story.mediaUrl ?? existing.mediaUrl,
          thumbnailUrl: story.thumbnailUrl ?? existing.thumbnailUrl,
          permalink: story.permalink ?? existing.permalink,
          lastPolledAt: now,
          pollCount: existing.pollCount + 1,
        });
      } else {
        await ctx.db.insert("igStories", {
          workspaceId,
          storyId: story.storyId,
          mediaType: story.mediaType,
          mediaUrl: story.mediaUrl,
          thumbnailUrl: story.thumbnailUrl,
          permalink: story.permalink,
          timestamp: story.timestamp,
          expiresAt: story.expiresAt,
          firstSeenAt: now,
          lastPolledAt: now,
          pollCount: 1,
        });
      }
      storiesUpserted++;
    }

    // Upsert media stats for stories in igMediaStats
    let mediaUpserted = 0;
    for (const row of mediaRows) {
      const existing = await ctx.db
        .query("igMediaStats")
        .withIndex("by_workspace_media", (q) =>
          q.eq("workspaceId", workspaceId).eq("mediaId", row.mediaId),
        )
        .first();

      if (existing !== null) {
        await ctx.db.patch(existing._id, {
          mediaType: row.mediaType,
          caption: row.caption,
          permalink: row.permalink,
          publishedAt: row.publishedAt,
          reach: row.reach,
          likes: row.likes,
          comments: row.comments,
          saves: row.saves,
          shares: row.shares,
          views: row.views,
          ...(row.reposts !== undefined ? { reposts: row.reposts } : {}),
          ...(row.profileVisits !== undefined ? { profileVisits: row.profileVisits } : {}),
          ...(row.follows !== undefined ? { follows: row.follows } : {}),
          ...(row.replies !== undefined ? { replies: row.replies } : {}),
          ...(row.totalInteractions !== undefined ? { totalInteractions: row.totalInteractions } : {}),
          ...(row.facebookViews !== undefined ? { facebookViews: row.facebookViews } : {}),
          ...(row.metricStates ? { metricStates: row.metricStates } : {}),
          syncedAt: row.syncedAt,
          mediaUrl: row.mediaUrl,
          thumbnailUrl: row.thumbnailUrl,
          mediaUrlSyncedAt: row.syncedAt,
        });
      } else {
        await ctx.db.insert("igMediaStats", {
          workspaceId,
          ...row,
          mediaUrlSyncedAt: row.syncedAt,
        });
      }
      mediaUpserted++;
    }

    // Upsert media breakdowns in igMediaBreakdowns
    let breakdownsUpserted = 0;
    const grouped = new Map<string, typeof breakdownRows>();
    for (const row of breakdownRows) {
      const key = `${row.mediaId}::${row.metric}`;
      const list = grouped.get(key) ?? [];
      list.push(row);
      grouped.set(key, list);
    }

    for (const [, groupRows] of grouped) {
      const sample = groupRows[0];
      const existing = await ctx.db
        .query("igMediaBreakdowns")
        .withIndex("by_workspace_media_metric", (q) =>
          q
            .eq("workspaceId", workspaceId)
            .eq("mediaId", sample.mediaId)
            .eq("metric", sample.metric),
        )
        .collect();

      for (const ex of existing) {
        await ctx.db.delete(ex._id);
      }

      for (const row of groupRows) {
        await ctx.db.insert("igMediaBreakdowns", {
          workspaceId,
          ...row,
        });
        breakdownsUpserted++;
      }
    }

    return {
      storiesUpserted,
      mediaUpserted,
      breakdownsUpserted,
    };
  },
});

/**
 * Archive expired stories that are no longer active and have passed expiresAt.
 */
export const archiveExpiredStories = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    now: v.number(),
  },
  returns: v.number(),
  handler: async (ctx, { workspaceId, now }) => {
    // Stories whose expiresAt is in the past and archivedAt is not yet set
    const candidates = await ctx.db
      .query("igStories")
      .withIndex("by_workspace_expires", (q) =>
        q.eq("workspaceId", workspaceId).lte("expiresAt", now),
      )
      .collect();

    let archivedCount = 0;
    for (const story of candidates) {
      if (story.archivedAt === undefined) {
        await ctx.db.patch(story._id, { archivedAt: now });
        archivedCount++;
      }
    }
    return archivedCount;
  },
});

/**
 * 13 months in milliseconds (~395 days).
 * Stories older than 13 months are purged from igStories (G4 dopuna).
 */
const THIRTEEN_MONTHS_MS = 13 * 30.5 * 24 * 60 * 60 * 1000;

export const sweepOldArchivedStories = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    now: v.number(),
  },
  returns: v.number(),
  handler: async (ctx, { workspaceId, now }) => {
    const cutoff = now - THIRTEEN_MONTHS_MS;
    const oldStories = await ctx.db
      .query("igStories")
      .withIndex("by_workspace_timestamp", (q) =>
        q.eq("workspaceId", workspaceId).lte("timestamp", cutoff),
      )
      .collect();

    let deleted = 0;
    for (const story of oldStories) {
      if (story.archivedAt !== undefined && story.archivedAt < cutoff) {
        await ctx.db.delete(story._id);
        deleted++;
      }
    }
    return deleted;
  },
});

/**
 * Save newly connected OAuth credentials to connections table.
 */
export const saveConnectedCredentials = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    externalId: v.string(),
    externalIdAlt: v.optional(v.string()),
    encryptedCredentials: v.string(),
    expiresAt: v.number(),
  },
  returns: v.id("connections"),
  handler: async (
    ctx,
    { workspaceId, externalId, externalIdAlt, encryptedCredentials, expiresAt },
  ) => {
    const existing = await ctx.db
      .query("connections")
      .withIndex("by_workspace_provider", (q) =>
        q.eq("workspaceId", workspaceId).eq("provider", "meta_ig"),
      )
      .unique();

    if (existing !== null) {
      await ctx.db.patch(existing._id, {
        encryptedCredentials,
        externalId,
        ...(externalIdAlt !== undefined ? { externalIdAlt } : {}),
        status: "active",
        // A fresh grant invalidates any in-flight purge of the old one (R1/4c).
        generation: (existing.generation ?? 0) + 1,
        expiresAt,
      });
      return existing._id;
    }

    return await ctx.db.insert("connections", {
      workspaceId,
      provider: "meta_ig",
      encryptedCredentials,
      externalId,
      ...(externalIdAlt !== undefined ? { externalIdAlt } : {}),
      status: "active",
      generation: 1,
      expiresAt,
    });
  },
});

/**
 * Update connection after a successful token refresh.
 */
export const updateRefreshedToken = internalMutation({
  args: {
    connectionId: v.id("connections"),
    encryptedCredentials: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, { connectionId, encryptedCredentials, expiresAt }) => {
    const conn = await ctx.db.get(connectionId);
    if (conn === null) return;
    await ctx.db.patch(connectionId, {
      encryptedCredentials,
      expiresAt,
      status: "active",
    });
  },
});

/**
 * Mark a connection as expired (e.g. token refresh failed or token invalid).
 */
export const markConnectionExpired = internalMutation({
  args: {
    connectionId: v.id("connections"),
  },
  handler: async (ctx, { connectionId }) => {
    const conn = await ctx.db.get(connectionId);
    if (conn === null) return;
    await ctx.db.patch(connectionId, {
      status: "expired",
    });
  },
});

// ── Public Queries (For Instagram Screens) ───────────────────────────────────

const dailyViewValidator = v.object({
  date: v.string(),
  followersCount: v.number(),
  reach: v.number(),
  profileViews: v.number(),
  totalInteractions: v.number(),
  accountsEngaged: v.number(),
});

/**
 * Get daily account stats in [from, to] inclusive date range, ascending.
 */
export const dailyHistory = query({
  args: { from: v.string(), to: v.string() },
  returns: v.array(dailyViewValidator),
  handler: async (ctx, { from, to }) => {
    const { workspaceId } = await requireMembership(ctx);
    const rows = await ctx.db
      .query("igAccountDaily")
      .withIndex("by_workspace_date", (q) =>
        q.eq("workspaceId", workspaceId).gte("date", from).lte("date", to),
      )
      .collect();

    return rows.map((r) => ({
      date: r.date,
      followersCount: r.followersCount,
      reach: r.reach,
      profileViews: r.profileViews ?? 0,
      totalInteractions: r.totalInteractions ?? 0,
      accountsEngaged: r.accountsEngaged,
    }));
  },
});

export const metricPointValidator = v.object({
  date: v.string(),
  dimensionKeys: v.array(v.string()),
  dimensionValues: v.array(v.string()),
  value: v.optional(v.number()),
  state: v.union(
    v.literal("value"),
    v.literal("suppressed"),
    v.literal("unavailable"),
  ),
  reason: v.optional(v.string()),
});

/**
 * Get daily metric series for a specified metric and optional breakdown.
 * Preserves 3 states: "value", "suppressed", "unavailable".
 */
export const metricSeries = query({
  args: {
    metric: v.string(),
    from: v.string(),
    to: v.string(),
    dimensionKey: v.optional(v.string()),
    dimensionValue: v.optional(v.string()),
  },
  returns: v.array(metricPointValidator),
  handler: async (ctx, { metric, from, to, dimensionKey, dimensionValue }) => {
    const { workspaceId } = await requireMembership(ctx);
    const rows = await ctx.db
      .query("igMetricDaily")
      .withIndex("by_workspace_metric_date", (q) =>
        q
          .eq("workspaceId", workspaceId)
          .eq("metric", metric)
          .gte("date", from)
          .lte("date", to),
      )
      .collect();

    const filtered = rows.filter((r) => {
      if (dimensionKey === undefined) {
        // Default to overall totals (dimensionKeys is empty)
        return r.dimensionKeys.length === 0;
      }
      const keyIdx = r.dimensionKeys.indexOf(dimensionKey);
      if (keyIdx === -1) return false;
      if (dimensionValue !== undefined) {
        return r.dimensionValues[keyIdx] === dimensionValue;
      }
      return true;
    });

    return filtered.map((r) => ({
      date: r.date,
      dimensionKeys: r.dimensionKeys,
      dimensionValues: r.dimensionValues,
      value: r.value,
      state: r.state,
      reason: r.reason,
    }));
  },
});

const mediaViewValidator = v.object({
  _id: v.id("igMediaStats"),
  mediaId: v.string(),
  mediaType: v.string(),
  caption: v.string(),
  permalink: v.string(),
  publishedAt: v.number(),
  reach: v.number(),
  likes: v.number(),
  comments: v.number(),
  saves: v.number(),
  shares: v.number(),
  views: v.number(),
  syncedAt: v.number(),
  deletedAt: v.optional(v.number()),
  // Whether Instagram currently accepts comments. Undefined means it has not
  // been asked yet, which the switch on the card shows as its own state rather
  // than pretending commenting is off.
  commentsEnabled: v.optional(v.boolean()),
  // Slide IDENTITY only, no links — enough for the carousel swiper to know how
  // many frames there are and what to ask the proxy for.
  children: v.optional(
    v.array(v.object({ id: v.string(), mediaType: v.string() })),
  ),
});

/**
 * List media stats for the workspace, ordered by publishedAt descending.
 *
 * Picture URLs are deliberately NOT returned: they expire. The grid points its
 * <img> at the /ig-media/<mediaId>[/<childId>] route instead.
 *
 * Deleted posts stay in the list. They are marked, not hidden: the numbers they
 * collected are still true, and an operator needs to see what disappeared.
 */
export const mediaList = query({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.array(mediaViewValidator),
  handler: async (ctx, { limit }) => {
    const { workspaceId } = await requireMembership(ctx);
    const maxItems = limit && limit > 0 ? Math.min(limit, 100) : 50;

    const rows = await ctx.db
      .query("igMediaStats")
      .withIndex("by_workspace_published", (q) =>
        q.eq("workspaceId", workspaceId),
      )
      .order("desc")
      .take(maxItems);

    return rows.map((r) => ({
      _id: r._id,
      mediaId: r.mediaId,
      mediaType: r.mediaType,
      caption: r.caption,
      permalink: r.permalink,
      publishedAt: r.publishedAt,
      reach: r.reach,
      likes: r.likes,
      comments: r.comments,
      saves: r.saves,
      shares: r.shares,
      views: r.views,
      syncedAt: r.syncedAt,
      ...(r.deletedAt !== undefined ? { deletedAt: r.deletedAt } : {}),
      ...(r.commentsEnabled !== undefined
        ? { commentsEnabled: r.commentsEnabled }
        : {}),
      ...(r.children
        ? {
            children: r.children.map((c) => ({
              id: c.id,
              mediaType: c.mediaType,
            })),
          }
        : {}),
    }));
  },
});

export const mediaDetailValidator = v.object({
  media: v.object({
    _id: v.id("igMediaStats"),
    mediaId: v.string(),
    mediaType: v.string(),
    caption: v.string(),
    permalink: v.string(),
    publishedAt: v.number(),
    reach: v.number(),
    likes: v.number(),
    comments: v.number(),
    saves: v.number(),
    shares: v.number(),
    views: v.number(),
    reposts: v.optional(v.number()),
    profileVisits: v.optional(v.number()),
    follows: v.optional(v.number()),
    replies: v.optional(v.number()),
    totalInteractions: v.optional(v.number()),
    reelsAvgWatchTimeMs: v.optional(v.number()),
    reelsVideoViewTotalTimeMs: v.optional(v.number()),
    reelsSkipRate: v.optional(v.number()),
    crosspostedViews: v.optional(v.number()),
    facebookViews: v.optional(v.number()),
    syncedAt: v.number(),
    deletedAt: v.optional(v.number()),
    commentsEnabled: v.optional(v.boolean()),
    children: v.optional(
      v.array(
        v.object({
          id: v.string(),
          mediaType: v.string(),
        }),
      ),
    ),
    metricStates: v.optional(
      v.record(
        v.string(),
        v.object({
          state: v.union(
            v.literal("value"),
            v.literal("suppressed"),
            v.literal("unavailable"),
          ),
          reason: v.optional(v.string()),
        }),
      ),
    ),
  }),
  breakdowns: v.array(
    v.object({
      _id: v.id("igMediaBreakdowns"),
      mediaId: v.string(),
      metric: v.string(),
      dimensionKey: v.string(),
      dimensionValue: v.string(),
      value: v.optional(v.number()),
      state: v.union(
        v.literal("value"),
        v.literal("suppressed"),
        v.literal("unavailable"),
      ),
      reason: v.optional(v.string()),
    }),
  ),
});

/**
 * Fetch detailed metrics, 3-state breakdown, and dimensional rows for a single post.
 */
export const getMediaDetail = query({
  args: {
    mediaId: v.string(),
  },
  returns: v.union(v.null(), mediaDetailValidator),
  handler: async (ctx, { mediaId }) => {
    const { workspaceId } = await requireMembership(ctx);
    const media = await ctx.db
      .query("igMediaStats")
      .withIndex("by_workspace_media", (q) =>
        q.eq("workspaceId", workspaceId).eq("mediaId", mediaId),
      )
      .first();

    if (media === null) return null;

    const breakdowns = await ctx.db
      .query("igMediaBreakdowns")
      .withIndex("by_workspace_media", (q) =>
        q.eq("workspaceId", workspaceId).eq("mediaId", mediaId),
      )
      .collect();

    return {
      media: {
        _id: media._id,
        mediaId: media.mediaId,
        mediaType: media.mediaType,
        caption: media.caption,
        permalink: media.permalink,
        publishedAt: media.publishedAt,
        reach: media.reach,
        likes: media.likes,
        comments: media.comments,
        saves: media.saves,
        shares: media.shares,
        views: media.views,
        ...(media.reposts !== undefined ? { reposts: media.reposts } : {}),
        ...(media.profileVisits !== undefined
          ? { profileVisits: media.profileVisits }
          : {}),
        ...(media.follows !== undefined ? { follows: media.follows } : {}),
        ...(media.replies !== undefined ? { replies: media.replies } : {}),
        ...(media.totalInteractions !== undefined
          ? { totalInteractions: media.totalInteractions }
          : {}),
        ...(media.reelsAvgWatchTimeMs !== undefined
          ? { reelsAvgWatchTimeMs: media.reelsAvgWatchTimeMs }
          : {}),
        ...(media.reelsVideoViewTotalTimeMs !== undefined
          ? { reelsVideoViewTotalTimeMs: media.reelsVideoViewTotalTimeMs }
          : {}),
        ...(media.reelsSkipRate !== undefined
          ? { reelsSkipRate: media.reelsSkipRate }
          : {}),
        ...(media.crosspostedViews !== undefined
          ? { crosspostedViews: media.crosspostedViews }
          : {}),
        ...(media.facebookViews !== undefined
          ? { facebookViews: media.facebookViews }
          : {}),
        syncedAt: media.syncedAt,
        ...(media.deletedAt !== undefined
          ? { deletedAt: media.deletedAt }
          : {}),
        ...(media.commentsEnabled !== undefined
          ? { commentsEnabled: media.commentsEnabled }
          : {}),
        ...(media.children
          ? {
              children: media.children.map((c) => ({
                id: c.id,
                mediaType: c.mediaType,
              })),
            }
          : {}),
        ...(media.metricStates ? { metricStates: media.metricStates } : {}),
      },
      breakdowns: breakdowns.map((b) => ({
        _id: b._id,
        mediaId: b.mediaId,
        metric: b.metric,
        dimensionKey: b.dimensionKey,
        dimensionValue: b.dimensionValue,
        ...(b.value !== undefined ? { value: b.value } : {}),
        state: b.state,
        ...(b.reason !== undefined ? { reason: b.reason } : {}),
      })),
    };
  },
});

/** How many stored rows one candidate query walks to fill its batch. */
const DELETION_SCAN_LIMIT = 400;

/**
 * Posts that MIGHT have been deleted, for the sweep to verify one by one.
 *
 * A row qualifies on one count: Instagram did not name it in the listing the
 * sweep just read (`seenIds`), and we do not already hold a verdict on it.
 *
 * It used to qualify on a second count as well — `publishedAt` newer than the
 * oldest post in that listing — on the theory that anything older merely fell
 * off the end of the page. That reasoning has a hole with a guarantee attached
 * (V1): when the deleted post was the OLDEST the account had, every post still
 * listed is newer than it, so the window's floor sits above it and it can never
 * become a candidate. The one post the sweep could not find was the one it was
 * most likely to be asked about.
 *
 * Dropping the window makes every stored post a suspect, which is more than one
 * pass can afford to probe — so they are worked through in rounds instead of
 * being excluded. `by_workspace_deletion_checked` hands back the least recently
 * checked first (a row that has never been checked carries no value at all and
 * sorts ahead of every timestamp), and the sweep stamps everything it looks at.
 * Over a few passes every post gets its turn.
 */
export const listDeletionCandidates = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    /** Ids Instagram just listed — alive, and not worth a probe. */
    seenIds: v.array(v.string()),
    limit: v.number(),
  },
  returns: v.array(v.object({ _id: v.id("igMediaStats"), mediaId: v.string() })),
  handler: async (ctx, { workspaceId, seenIds, limit }) => {
    const seen = new Set(seenIds);
    const wanted = Math.max(0, limit);
    if (wanted === 0) return [];

    const out: { _id: Id<"igMediaStats">; mediaId: string }[] = [];

    // Bounded on both ends: at most `limit` candidates, and at most
    // DELETION_SCAN_LIMIT rows walked looking for them. `deletedAt` is pinned to
    // `undefined` in the index (R1/5b), so a post already known gone is never
    // walked — before this, rows marked deleted before the index existed carried
    // no `deletionCheckedAt`, sorted first, and 400+ of them filled the scan
    // budget with rows the sweep only skipped, so no live post was ever probed
    // and deletion detection stopped without a sound.
    const rows = await ctx.db
      .query("igMediaStats")
      .withIndex("by_workspace_deleted_checked", (q) =>
        q.eq("workspaceId", workspaceId).eq("deletedAt", undefined),
      )
      .order("asc")
      .take(DELETION_SCAN_LIMIT);

    for (const row of rows) {
      if (out.length >= wanted) break;
      if (seen.has(row.mediaId)) continue;
      out.push({ _id: row._id, mediaId: row.mediaId });
    }

    return out;
  },
});

/**
 * Move everything this pass looked at to the back of the rotation.
 *
 * Both halves matter: the suspects that were probed, and the posts the listing
 * itself vouched for. A post that is never stamped stays at the front of
 * `by_workspace_deletion_checked` forever and crowds out the ones behind it.
 */
export const stampDeletionChecked = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    /** Rows probed by id. */
    ids: v.array(v.id("igMediaStats")),
    /** Rows vouched for by the listing, known only by their media id. */
    mediaIds: v.array(v.string()),
    at: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, { workspaceId, ids, mediaIds, at }) => {
    for (const id of ids) {
      const row = await ctx.db.get(id);
      if (row === null || row.workspaceId !== workspaceId) continue;
      await ctx.db.patch(id, { deletionCheckedAt: at });
    }

    for (const mediaId of mediaIds) {
      const row = await ctx.db
        .query("igMediaStats")
        .withIndex("by_workspace_media", (q) =>
          q.eq("workspaceId", workspaceId).eq("mediaId", mediaId),
        )
        .first();
      if (row === null) continue;
      await ctx.db.patch(row._id, { deletionCheckedAt: at });
    }

    return null;
  },
});

// ── Scheduling support (F6) ──────────────────────────────────────────────────

/**
 * Which workspace owns the account a webhook just named.
 *
 * `externalIdAlt` is compared too because the Instagram webhook may name either
 * the app-scoped user id or the professional account id, and the connect flow
 * stores both — the same rule `orIngest.resolveWorkspace` follows.
 */
export const resolveConnectionByAccount = internalQuery({
  args: { accountId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      connectionId: v.id("connections"),
      workspaceId: v.id("workspaces"),
    }),
  ),
  handler: async (ctx, { accountId }) => {
    const rows = await ctx.db
      .query("connections")
      .withIndex("by_provider", (q) => q.eq("provider", "meta_ig"))
      .collect();

    const conn = rows.find(
      (c) => c.externalId === accountId || c.externalIdAlt === accountId,
    );
    if (!conn) return null;
    return { connectionId: conn._id, workspaceId: conn.workspaceId };
  },
});

/**
 * Cache our own @handle on the connection.
 *
 * Written by whichever pass last asked `/me`. The event-driven refresh reads it
 * instead of asking again — one call saved on every comment that arrives.
 */
export const saveAccountHandle = internalMutation({
  args: { connectionId: v.id("connections"), handle: v.string() },
  returns: v.null(),
  handler: async (ctx, { connectionId, handle }) => {
    const conn = await ctx.db.get(connectionId);
    if (conn === null) return null;
    if (conn.accountHandle === handle) return null;
    await ctx.db.patch(connectionId, { accountHandle: handle });
    return null;
  },
});

/**
 * Of the ids Instagram just listed, which have we never seen?
 *
 * This is the whole of the two-minute head check: five ids in, and normally an
 * empty array out — at which point the pass is over and nothing is written.
 */
export const findUnknownMediaIds = internalQuery({
  args: { workspaceId: v.id("workspaces"), mediaIds: v.array(v.string()) },
  returns: v.array(v.string()),
  handler: async (ctx, { workspaceId, mediaIds }) => {
    const unknown: string[] = [];
    for (const mediaId of mediaIds) {
      const existing = await ctx.db
        .query("igMediaStats")
        .withIndex("by_workspace_media", (q) =>
          q.eq("workspaceId", workspaceId).eq("mediaId", mediaId),
        )
        .unique();
      if (existing === null) unknown.push(mediaId);
    }
    return unknown;
  },
});

/**
 * The posts worth an hourly insights read: recent, and still on Instagram.
 *
 * Newest first and capped, because reach on a two-week-old post moves by single
 * digits a day while reach on this morning's post is the number somebody is
 * actually watching.
 */
export const listRecentMediaIds = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    since: v.number(),
    limit: v.number(),
  },
  returns: v.array(v.string()),
  handler: async (ctx, { workspaceId, since, limit }) => {
    const rows = await ctx.db
      .query("igMediaStats")
      .withIndex("by_workspace_published", (q) =>
        q.eq("workspaceId", workspaceId).gte("publishedAt", since),
      )
      .order("desc")
      .take(Math.max(0, limit));

    return rows.filter((r) => r.deletedAt === undefined).map((r) => r.mediaId);
  },
});

// ── Picture Proxy Support (/ig-media/ route in http.ts) ──────────────────────

/**
 * Everything the public /ig-media/ route needs in one read: the stored picture
 * URLs plus the encrypted token it would use to fetch a fresh one.
 *
 * Looked up by `mediaId` alone — the route carries no workspace, and a media ID
 * belongs to exactly one Instagram account anyway. Internal, so the encrypted
 * credentials never leave the backend.
 */
export const getMediaForProxy = internalQuery({
  args: { mediaId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("igMediaStats"),
      // The public route has no session to read a workspace from, and it needs
      // one to claim its refresh against the same ledger everything else uses.
      workspaceId: v.id("workspaces"),
      mediaType: v.string(),
      mediaUrl: v.optional(v.string()),
      thumbnailUrl: v.optional(v.string()),
      children: v.optional(v.array(mediaChildValidator)),
      urlSyncedAt: v.number(),
      deletedAt: v.optional(v.number()),
      encryptedCredentials: v.optional(v.string()),
      // When the proxy last FAILED to refresh, and the backoff it earned (R1/2a).
      mediaUrlAttemptedAt: v.optional(v.number()),
      mediaUrlBackoffMs: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, { mediaId }) => {
    const row = await ctx.db
      .query("igMediaStats")
      .withIndex("by_media", (q) => q.eq("mediaId", mediaId))
      .first();
    if (row === null) return null;

    const connection = await ctx.db
      .query("connections")
      .withIndex("by_workspace_provider", (q) =>
        q.eq("workspaceId", row.workspaceId).eq("provider", "meta_ig"),
      )
      .unique();

    return {
      _id: row._id,
      workspaceId: row.workspaceId,
      mediaType: row.mediaType,
      mediaUrl: row.mediaUrl,
      thumbnailUrl: row.thumbnailUrl,
      children: row.children,
      // Rows written before this field existed fall back to the stats sync
      // timestamp, which is when their URLs were fetched too.
      urlSyncedAt: row.mediaUrlSyncedAt ?? row.syncedAt,
      deletedAt: row.deletedAt,
      encryptedCredentials: connection?.encryptedCredentials,
      mediaUrlAttemptedAt: row.mediaUrlAttemptedAt,
      mediaUrlBackoffMs: row.mediaUrlBackoffMs,
    };
  },
});

/**
 * Store freshly fetched picture URLs. Only the URL fields move — stats and
 * `syncedAt` stay whatever the last real sync left behind.
 */
export const saveMediaUrls = internalMutation({
  args: {
    id: v.id("igMediaStats"),
    mediaUrl: v.optional(v.string()),
    thumbnailUrl: v.optional(v.string()),
    children: v.optional(v.array(mediaChildValidator)),
  },
  returns: v.null(),
  handler: async (ctx, { id, mediaUrl, thumbnailUrl, children }) => {
    const row = await ctx.db.get(id);
    if (row === null) return null;

    await ctx.db.patch(id, {
      mediaUrl,
      thumbnailUrl,
      // A non-carousel answers without `children`; keep whatever we had rather
      // than dropping slides on a partial read.
      ...(children !== undefined ? { children } : {}),
      mediaUrlSyncedAt: Date.now(),
      deletedAt: undefined,
      // A success clears the failure backoff (R1/2a).
      mediaUrlAttemptedAt: undefined,
      mediaUrlBackoffMs: undefined,
    });
    return null;
  },
});

/** The backoff ladder a failing proxy refresh climbs: 1m → 5m → 30m → 6h. */
const MEDIA_URL_BACKOFF_LADDER = [
  60 * 1000,
  5 * 60 * 1000,
  30 * 60 * 1000,
  6 * 60 * 60 * 1000,
] as const;

/**
 * A proxy refresh failed — stamp it and grow the backoff (R1/2a).
 *
 * Before this, a failed refresh only bought the 60 s per-media claim, so while
 * Meta refused, the ceiling was "one call per stored post per minute" — 18 000/h
 * for a 300-post archive, and exactly the regime the attack creates. Now a
 * failure buys MORE silence than a success would spend, climbing the ladder so a
 * post Meta keeps refusing is left alone for up to six hours.
 */
export const recordMediaUrlFailure = internalMutation({
  args: { id: v.id("igMediaStats") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id);
    if (row === null) return null;

    const prev = row.mediaUrlBackoffMs ?? 0;
    const next =
      MEDIA_URL_BACKOFF_LADDER.find((step) => step > prev) ??
      MEDIA_URL_BACKOFF_LADDER[MEDIA_URL_BACKOFF_LADDER.length - 1];

    await ctx.db.patch(id, {
      mediaUrlAttemptedAt: Date.now(),
      mediaUrlBackoffMs: next,
    });
    return null;
  },
});

/**
 * Mark the media as gone. The row itself is kept: the numbers it collected are
 * still history, and the UI wants to show the post as deleted rather than hide it.
 */
export const markMediaDeleted = internalMutation({
  args: { id: v.id("igMediaStats") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id);
    if (row === null) return null;
    if (row.deletedAt === undefined) {
      await ctx.db.patch(id, { deletedAt: Date.now() });
    }
    return null;
  },
});

// ── Instagram Audience Demographics (G2) ────────────────────────────────────

export const demographicRowValidator = v.object({
  metric: v.union(v.literal("follower"), v.literal("engaged")),
  timeframe: v.string(),
  dimensionKeys: v.array(v.string()),
  dimensionValues: v.array(v.string()),
  value: v.optional(v.number()),
  state: v.union(
    v.literal("value"),
    v.literal("suppressed"),
    v.literal("unavailable"),
  ),
  reason: v.optional(v.string()),
  syncedAt: v.number(),
});

/**
 * Upsert a batch of demographic rows into igDemographics.
 */
export const upsertDemographicsBatch = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    rows: v.array(demographicRowValidator),
  },
  returns: v.number(),
  handler: async (ctx, { workspaceId, rows }) => {
    let written = 0;

    const grouped = new Map<string, typeof rows>();
    for (const row of rows) {
      const groupKey = `${row.metric}::${row.timeframe}::${row.dimensionKeys.join(",")}`;
      const list = grouped.get(groupKey) ?? [];
      list.push(row);
      grouped.set(groupKey, list);
    }

    for (const [, groupRows] of grouped) {
      const sample = groupRows[0];
      const existingCandidates = await ctx.db
        .query("igDemographics")
        .withIndex("by_workspace_metric_timeframe", (q) =>
          q
            .eq("workspaceId", workspaceId)
            .eq("metric", sample.metric)
            .eq("timeframe", sample.timeframe),
        )
        .collect();

      const matchingExisting = existingCandidates.filter((c) => {
        if (c.dimensionKeys.length !== sample.dimensionKeys.length) return false;
        return c.dimensionKeys.every((k, i) => k === sample.dimensionKeys[i]);
      });

      if (sample.state !== "value") {
        for (const ex of matchingExisting) {
          await ctx.db.delete(ex._id);
        }
        await ctx.db.insert("igDemographics", {
          workspaceId,
          ...sample,
        });
        written++;
        continue;
      }

      const existingByVals = new Map<string, (typeof matchingExisting)[number]>();
      for (const ex of matchingExisting) {
        if (ex.state !== "value") {
          await ctx.db.delete(ex._id);
          continue;
        }
        const valKey = ex.dimensionValues.join("::");
        existingByVals.set(valKey, ex);
      }

      const incomingValKeys = new Set<string>();
      for (const row of groupRows) {
        const valKey = row.dimensionValues.join("::");
        incomingValKeys.add(valKey);

        const existing = existingByVals.get(valKey);
        if (existing) {
          await ctx.db.patch(existing._id, {
            value: row.value,
            state: row.state,
            reason: row.reason,
            syncedAt: row.syncedAt,
          });
        } else {
          await ctx.db.insert("igDemographics", {
            workspaceId,
            ...row,
          });
        }
        written++;
      }

      for (const [valKey, ex] of existingByVals) {
        if (!incomingValKeys.has(valKey)) {
          await ctx.db.delete(ex._id);
        }
      }
    }

    return written;
  },
});

export const ageGenderPointValidator = v.object({
  age: v.string(),
  gender: v.string(),
  value: v.number(),
});

export const rankingItemValidator = v.object({
  name: v.string(),
  value: v.number(),
});

export const demographicsSummaryValidator = v.object({
  metric: v.union(v.literal("follower"), v.literal("engaged")),
  timeframe: v.string(),
  state: v.union(
    v.literal("value"),
    v.literal("suppressed"),
    v.literal("unavailable"),
    v.literal("empty"),
  ),
  reason: v.optional(v.string()),
  followersCount: v.number(),
  hasConnection: v.boolean(),
  ageGender: v.array(ageGenderPointValidator),
  countries: v.array(rankingItemValidator),
  cities: v.array(rankingItemValidator),
  syncedAt: v.optional(v.number()),
});

/**
 * Public query for audience demographics on /instagram/publika screen.
 */
export const getDemographicsSummary = query({
  args: {
    metric: v.union(v.literal("follower"), v.literal("engaged")),
    timeframe: v.string(),
  },
  returns: demographicsSummaryValidator,
  handler: async (ctx, { metric, timeframe }) => {
    const { workspaceId } = await requireMembership(ctx);

    const connection = await ctx.db
      .query("connections")
      .withIndex("by_workspace_provider", (q) =>
        q.eq("workspaceId", workspaceId).eq("provider", "meta_ig"),
      )
      .unique();

    const hasConnection = connection !== null && connection.status === "active";

    const latestAccount = await ctx.db
      .query("igAccountDaily")
      .withIndex("by_workspace_date", (q) => q.eq("workspaceId", workspaceId))
      .order("desc")
      .first();

    const followersCount = latestAccount?.followersCount ?? 0;

    const rows = await ctx.db
      .query("igDemographics")
      .withIndex("by_workspace_metric_timeframe", (q) =>
        q
          .eq("workspaceId", workspaceId)
          .eq("metric", metric)
          .eq("timeframe", timeframe),
      )
      .collect();

    if (rows.length === 0) {
      return {
        metric,
        timeframe,
        state: "empty" as const,
        reason: undefined,
        followersCount,
        hasConnection,
        ageGender: [],
        countries: [],
        cities: [],
        syncedAt: undefined,
      };
    }

    const suppressedRow = rows.find((r) => r.state === "suppressed");
    if (suppressedRow) {
      return {
        metric,
        timeframe,
        state: "suppressed" as const,
        reason:
          suppressedRow.reason ??
          (metric === "follower"
            ? "Instagram ne isporučuje demografske podatke ispod 100 pratilaca."
            : "Instagram ne isporučuje demografske podatke ispod 100 angažovanja u izabranom periodu."),
        followersCount,
        hasConnection,
        ageGender: [],
        countries: [],
        cities: [],
        syncedAt: suppressedRow.syncedAt,
      };
    }

    const unavailableRow = rows.find((r) => r.state === "unavailable");
    if (unavailableRow) {
      return {
        metric,
        timeframe,
        state: "unavailable" as const,
        reason: unavailableRow.reason ?? "Meta API trenutno nije dostupan.",
        followersCount,
        hasConnection,
        ageGender: [],
        countries: [],
        cities: [],
        syncedAt: unavailableRow.syncedAt,
      };
    }

    const ageGender: { age: string; gender: string; value: number }[] = [];
    const countries: { name: string; value: number }[] = [];
    const cities: { name: string; value: number }[] = [];
    let syncedAt: number | undefined;

    for (const r of rows) {
      if (r.syncedAt && (!syncedAt || r.syncedAt > syncedAt)) {
        syncedAt = r.syncedAt;
      }
      if (r.state !== "value" || typeof r.value !== "number") continue;

      const keys = r.dimensionKeys.join(",");
      if (keys === "age,gender") {
        const age = r.dimensionValues[0] ?? "";
        const gender = r.dimensionValues[1] ?? "";
        if (age && gender) {
          ageGender.push({ age, gender, value: r.value });
        }
      } else if (keys === "country") {
        const country = r.dimensionValues[0] ?? "";
        if (country) {
          countries.push({ name: country, value: r.value });
        }
      } else if (keys === "city") {
        const city = r.dimensionValues[0] ?? "";
        if (city) {
          cities.push({ name: city, value: r.value });
        }
      }
    }

    countries.sort((a, b) => b.value - a.value);
    cities.sort((a, b) => b.value - a.value);

    return {
      metric,
      timeframe,
      state: "value" as const,
      reason: undefined,
      followersCount,
      hasConnection,
      ageGender,
      countries,
      cities,
      syncedAt,
    };
  },
});

export const storyViewValidator = v.object({
  _id: v.id("igStories"),
  storyId: v.string(),
  mediaType: v.string(),
  mediaUrl: v.optional(v.string()),
  thumbnailUrl: v.optional(v.string()),
  permalink: v.optional(v.string()),
  timestamp: v.number(),
  expiresAt: v.number(),
  firstSeenAt: v.number(),
  lastPolledAt: v.number(),
  pollCount: v.number(),
  archivedAt: v.optional(v.number()),
  stats: v.optional(
    v.object({
      reach: v.number(),
      views: v.number(),
      shares: v.number(),
      totalInteractions: v.optional(v.number()),
      reposts: v.optional(v.number()),
      profileVisits: v.optional(v.number()),
      follows: v.optional(v.number()),
      replies: v.optional(v.number()),
      facebookViews: v.optional(v.number()),
      metricStates: v.optional(
        v.record(
          v.string(),
          v.object({
            state: v.union(
              v.literal("value"),
              v.literal("suppressed"),
              v.literal("unavailable"),
            ),
            reason: v.optional(v.string()),
          }),
        ),
      ),
      syncedAt: v.number(),
    }),
  ),
  breakdowns: v.array(
    v.object({
      metric: v.string(),
      dimensionKey: v.string(),
      dimensionValue: v.string(),
      value: v.optional(v.number()),
      state: v.union(
        v.literal("value"),
        v.literal("suppressed"),
        v.literal("unavailable"),
      ),
      reason: v.optional(v.string()),
    }),
  ),
});

export const storiesOverviewValidator = v.object({
  liveStories: v.array(storyViewValidator),
  archivedStories: v.array(storyViewValidator),
  hasConnection: v.boolean(),
});

/**
 * Query active (live) and archived stories with stats and breakdown dimensions for /instagram/stories (G4).
 */
export const getStoriesOverview = query({
  args: {
    now: v.optional(v.number()),
  },
  returns: storiesOverviewValidator,
  handler: async (ctx, { now }) => {
    const { workspaceId } = await requireMembership(ctx);
    const conn = await ctx.db
      .query("connections")
      .withIndex("by_workspace_provider", (q) =>
        q.eq("workspaceId", workspaceId).eq("provider", "meta_ig"),
      )
      .first();
    const hasConnection = conn !== null && conn.status === "active";

    const allStories = await ctx.db
      .query("igStories")
      .withIndex("by_workspace_timestamp", (q) =>
        q.eq("workspaceId", workspaceId),
      )
      .order("desc")
      .take(100);

    const currentTime = now ?? Date.now();
    const liveStories: (typeof storyViewValidator.type)[] = [];
    const archivedStories: (typeof storyViewValidator.type)[] = [];

    for (const story of allStories) {
      const stats = await ctx.db
        .query("igMediaStats")
        .withIndex("by_workspace_media", (q) =>
          q.eq("workspaceId", workspaceId).eq("mediaId", story.storyId),
        )
        .first();

      const breakdowns = await ctx.db
        .query("igMediaBreakdowns")
        .withIndex("by_workspace_media", (q) =>
          q.eq("workspaceId", workspaceId).eq("mediaId", story.storyId),
        )
        .collect();

      const item = {
        _id: story._id,
        storyId: story.storyId,
        mediaType: story.mediaType,
        mediaUrl: story.mediaUrl,
        thumbnailUrl: story.thumbnailUrl,
        permalink: story.permalink,
        timestamp: story.timestamp,
        expiresAt: story.expiresAt,
        firstSeenAt: story.firstSeenAt,
        lastPolledAt: story.lastPolledAt,
        pollCount: story.pollCount,
        archivedAt: story.archivedAt,
        stats: stats
          ? {
              reach: stats.reach,
              views: stats.views,
              shares: stats.shares,
              totalInteractions: stats.totalInteractions,
              reposts: stats.reposts,
              profileVisits: stats.profileVisits,
              follows: stats.follows,
              replies: stats.replies,
              facebookViews: stats.facebookViews,
              metricStates: stats.metricStates,
              syncedAt: stats.syncedAt,
            }
          : undefined,
        breakdowns: breakdowns.map((b) => ({
          metric: b.metric,
          dimensionKey: b.dimensionKey,
          dimensionValue: b.dimensionValue,
          value: b.value,
          state: b.state,
          reason: b.reason,
        })),
      };

      const isLive = story.archivedAt === undefined && story.expiresAt > currentTime;
      if (isLive) {
        liveStories.push(item);
      } else {
        archivedStories.push(item);
      }
    }

    return {
      liveStories,
      archivedStories,
      hasConnection,
    };
  },
});
