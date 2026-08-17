import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import { requireMembership } from "./lib/auth";

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
  profileViews: v.number(),
  accountsEngaged: v.number(),
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
  syncedAt: v.number(),
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
        profileViews: row.profileViews,
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
          syncedAt: row.syncedAt,
        });
      } else {
        await ctx.db.insert("igMediaStats", {
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
 * Save newly connected OAuth credentials to connections table.
 */
export const saveConnectedCredentials = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    externalId: v.string(),
    encryptedCredentials: v.string(),
    expiresAt: v.number(),
  },
  returns: v.id("connections"),
  handler: async (
    ctx,
    { workspaceId, externalId, encryptedCredentials, expiresAt },
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
        status: "active",
        expiresAt,
      });
      return existing._id;
    }

    return await ctx.db.insert("connections", {
      workspaceId,
      provider: "meta_ig",
      encryptedCredentials,
      externalId,
      status: "active",
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
      profileViews: r.profileViews,
      accountsEngaged: r.accountsEngaged,
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
});

/**
 * List media stats for the workspace, ordered by publishedAt descending.
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
    }));
  },
});
