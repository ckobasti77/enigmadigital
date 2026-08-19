import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireMembership } from "./lib/auth";

/**
 * ============================================================================
 * FACEBOOK PAGE PERSISTENCE & QUERY LAYER (F5, V8 runtime)
 * ============================================================================
 *
 * Upsert semantics, same as everywhere else in this codebase:
 *   - `fbPageDaily`  upserted by [workspaceId, date]
 *   - `fbPagePosts`  upserted by [workspaceId, postId]
 *
 * History is preserved: a post that leaves the feed keeps its row and its
 * numbers, marked with `deletedAt`.
 * ============================================================================
 */

export const pageDailyRowValidator = v.object({
  date: v.string(),
  impressions: v.number(),
  engagements: v.number(),
  fans: v.number(),
});

export const pagePostRowValidator = v.object({
  postId: v.string(),
  message: v.string(),
  statusType: v.string(),
  permalink: v.string(),
  pictureUrl: v.optional(v.string()),
  publishedAt: v.number(),
  likes: v.number(),
  comments: v.number(),
  shares: v.number(),
  impressions: v.optional(v.number()),
  reach: v.optional(v.number()),
  clicks: v.optional(v.number()),
});

// ── OAuth handshake ──────────────────────────────────────────────────────────

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
      provider: "meta_fb",
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
    if (row === null || row.provider !== "meta_fb") return null;
    await ctx.db.delete(row._id);
    return {
      workspaceId: row.workspaceId,
      redirectUri: row.redirectUri,
      createdAt: row.createdAt,
    };
  },
});

// ── Connection ───────────────────────────────────────────────────────────────

/**
 * Write the Page Access Token, encrypted.
 *
 * `externalIdAlt` holds the Page NAME rather than a second id: Settings has to
 * be able to say *which* Page is connected, and a bare 16-digit id is not an
 * answer anybody can check at a glance.
 */
export const saveConnectedCredentials = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    pageId: v.string(),
    pageName: v.optional(v.string()),
    encryptedCredentials: v.string(),
    /** Only sent right after the OAuth leg; a page switch keeps the old one. */
    encryptedUserCredentials: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
  },
  returns: v.id("connections"),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("connections")
      .withIndex("by_workspace_provider", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("provider", "meta_fb"),
      )
      .first();

    const patch = {
      externalId: args.pageId,
      ...(args.pageName !== undefined
        ? { externalIdAlt: args.pageName }
        : {}),
      encryptedCredentials: args.encryptedCredentials,
      ...(args.encryptedUserCredentials !== undefined
        ? { encryptedUserCredentials: args.encryptedUserCredentials }
        : {}),
      status: "active" as const,
      ...(args.expiresAt !== undefined ? { expiresAt: args.expiresAt } : {}),
    };

    if (existing !== null) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    return await ctx.db.insert("connections", {
      workspaceId: args.workspaceId,
      provider: "meta_fb",
      ...patch,
    });
  },
});

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

export const updateTokenExpiry = internalMutation({
  args: {
    connectionId: v.id("connections"),
    expiresAt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, { connectionId, expiresAt }) => {
    const conn = await ctx.db.get(connectionId);
    if (conn === null) return null;
    await ctx.db.patch(connectionId, {
      status: "active",
      ...(expiresAt !== undefined ? { expiresAt } : {}),
    });
    return null;
  },
});

/** The connected Page's id, for a sync action that already has the row. */
export const getConnection = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  returns: v.union(
    v.null(),
    v.object({
      connectionId: v.id("connections"),
      pageId: v.string(),
      encryptedCredentials: v.string(),
      encryptedUserCredentials: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, { workspaceId }) => {
    const conn = await ctx.db
      .query("connections")
      .withIndex("by_workspace_provider", (q) =>
        q.eq("workspaceId", workspaceId).eq("provider", "meta_fb"),
      )
      .first();
    if (conn === null || !conn.externalId) return null;
    return {
      connectionId: conn._id,
      pageId: conn.externalId,
      encryptedCredentials: conn.encryptedCredentials,
      encryptedUserCredentials: conn.encryptedUserCredentials ?? null,
    };
  },
});

// ── Sync writes ──────────────────────────────────────────────────────────────

export const upsertPageDaily = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    rows: v.array(pageDailyRowValidator),
  },
  returns: v.number(),
  handler: async (ctx, { workspaceId, rows }) => {
    let written = 0;
    for (const row of rows) {
      const existing = await ctx.db
        .query("fbPageDaily")
        .withIndex("by_workspace_date", (q) =>
          q.eq("workspaceId", workspaceId).eq("date", row.date),
        )
        .unique();

      if (existing !== null) {
        await ctx.db.patch(existing._id, {
          impressions: row.impressions,
          engagements: row.engagements,
          fans: row.fans,
        });
      } else {
        await ctx.db.insert("fbPageDaily", { workspaceId, ...row });
      }
      written++;
    }
    return written;
  },
});

/**
 * Upsert a batch of Page posts.
 *
 * `complete` works exactly like the comment batch: only a full, unpaginated
 * answer proves that a post missing from it is gone. Anything less and the
 * absence proves nothing, so nothing is marked.
 */
export const upsertPagePosts = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    rows: v.array(pagePostRowValidator),
    complete: v.boolean(),
    syncedAt: v.number(),
  },
  returns: v.number(),
  handler: async (ctx, { workspaceId, rows, complete, syncedAt }) => {
    let written = 0;

    for (const row of rows) {
      const existing = await ctx.db
        .query("fbPagePosts")
        .withIndex("by_workspace_post", (q) =>
          q.eq("workspaceId", workspaceId).eq("postId", row.postId),
        )
        .unique();

      if (existing !== null) {
        await ctx.db.patch(existing._id, {
          message: row.message,
          statusType: row.statusType,
          permalink: row.permalink,
          pictureUrl: row.pictureUrl,
          publishedAt: row.publishedAt,
          likes: row.likes,
          comments: row.comments,
          shares: row.shares,
          // A failed insights call must not wipe the numbers the last
          // successful one wrote.
          ...(row.impressions !== undefined
            ? { impressions: row.impressions }
            : {}),
          ...(row.reach !== undefined ? { reach: row.reach } : {}),
          ...(row.clicks !== undefined ? { clicks: row.clicks } : {}),
          syncedAt,
          deletedAt: undefined,
        });
      } else {
        await ctx.db.insert("fbPagePosts", {
          workspaceId,
          ...row,
          syncedAt,
        });
      }
      written++;
    }

    if (complete) {
      const seen = new Set(rows.map((r) => r.postId));
      // Only posts inside the window the feed just answered for. An older post
      // is absent because it fell off the end of the page, not because it was
      // taken down — and with no rows at all the answer said nothing about
      // any post, so nothing is marked.
      const oldest = rows.reduce(
        (min, r) => Math.min(min, r.publishedAt),
        Number.POSITIVE_INFINITY,
      );
      const stored = await ctx.db
        .query("fbPagePosts")
        .withIndex("by_workspace_published", (q) =>
          q.eq("workspaceId", workspaceId),
        )
        .order("desc")
        .take(200);

      for (const post of stored) {
        if (post.deletedAt !== undefined) continue;
        if (seen.has(post.postId)) continue;
        if (post.publishedAt < oldest) continue;
        await ctx.db.patch(post._id, { deletedAt: syncedAt });
        written++;
      }
    }

    return written;
  },
});

/** The Page's own like on a post, written back after Facebook accepted it. */
export const applyPostLiked = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    postId: v.string(),
    liked: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, { workspaceId, postId, liked }) => {
    const row = await ctx.db
      .query("fbPagePosts")
      .withIndex("by_workspace_post", (q) =>
        q.eq("workspaceId", workspaceId).eq("postId", postId),
      )
      .first();
    if (row === null) return null;

    const wasLiked = row.likedByUs === true;
    const likes =
      wasLiked === liked ? row.likes : Math.max(0, row.likes + (liked ? 1 : -1));

    await ctx.db.patch(row._id, { likedByUs: liked, likes });
    return null;
  },
});

/** Which posts to pull comments for — newest first, inside the window. */
export const listRecentPostIds = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    since: v.number(),
    limit: v.number(),
  },
  returns: v.array(v.string()),
  handler: async (ctx, { workspaceId, since, limit }) => {
    const rows = await ctx.db
      .query("fbPagePosts")
      .withIndex("by_workspace_published", (q) =>
        q.eq("workspaceId", workspaceId).gte("publishedAt", since),
      )
      .order("desc")
      .take(limit);

    return rows.filter((r) => r.deletedAt === undefined).map((r) => r.postId);
  },
});

// ── Public queries ───────────────────────────────────────────────────────────

const dailyViewValidator = v.object({
  date: v.string(),
  impressions: v.number(),
  engagements: v.number(),
  fans: v.number(),
});

/** Daily Page stats in [from, to] inclusive, ascending. */
export const dailyHistory = query({
  args: { from: v.string(), to: v.string() },
  returns: v.array(dailyViewValidator),
  handler: async (ctx, { from, to }) => {
    const { workspaceId } = await requireMembership(ctx);
    const rows = await ctx.db
      .query("fbPageDaily")
      .withIndex("by_workspace_date", (q) =>
        q.eq("workspaceId", workspaceId).gte("date", from).lte("date", to),
      )
      .collect();

    return rows.map((r) => ({
      date: r.date,
      impressions: r.impressions,
      engagements: r.engagements,
      fans: r.fans,
    }));
  },
});

const postViewValidator = v.object({
  _id: v.id("fbPagePosts"),
  postId: v.string(),
  message: v.string(),
  statusType: v.string(),
  permalink: v.string(),
  pictureUrl: v.optional(v.string()),
  publishedAt: v.number(),
  likes: v.number(),
  comments: v.number(),
  shares: v.number(),
  impressions: v.optional(v.number()),
  reach: v.optional(v.number()),
  clicks: v.optional(v.number()),
  likedByUs: v.optional(v.boolean()),
  deletedAt: v.optional(v.number()),
  syncedAt: v.number(),
});

/**
 * Page posts, newest first.
 *
 * Unlike the Instagram list this one DOES return the picture URL: Facebook's
 * `full_picture` is an ordinary link that keeps working, so there is nothing
 * for a proxy route to refresh.
 *
 * Deleted posts stay in the list. They are marked, not hidden: the numbers they
 * collected are still true, and an operator needs to see what disappeared.
 */
export const postsList = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(postViewValidator),
  handler: async (ctx, { limit }) => {
    const { workspaceId } = await requireMembership(ctx);
    const maxItems = limit && limit > 0 ? Math.min(limit, 100) : 50;

    const rows = await ctx.db
      .query("fbPagePosts")
      .withIndex("by_workspace_published", (q) =>
        q.eq("workspaceId", workspaceId),
      )
      .order("desc")
      .take(maxItems);

    return rows.map((r) => ({
      _id: r._id,
      postId: r.postId,
      message: r.message,
      statusType: r.statusType,
      permalink: r.permalink,
      ...(r.pictureUrl !== undefined ? { pictureUrl: r.pictureUrl } : {}),
      publishedAt: r.publishedAt,
      likes: r.likes,
      comments: r.comments,
      shares: r.shares,
      ...(r.impressions !== undefined ? { impressions: r.impressions } : {}),
      ...(r.reach !== undefined ? { reach: r.reach } : {}),
      ...(r.clicks !== undefined ? { clicks: r.clicks } : {}),
      ...(r.likedByUs !== undefined ? { likedByUs: r.likedByUs } : {}),
      ...(r.deletedAt !== undefined ? { deletedAt: r.deletedAt } : {}),
      syncedAt: r.syncedAt,
    }));
  },
});

/**
 * Everything the Settings card needs to tell the operator what is still
 * missing: the callback URL to paste into the app dashboard, and whether the
 * three deployment variables behind it are set.
 *
 * A query rather than an action, because all four answers change when the
 * environment changes and a card that only learns them on mount would keep
 * showing yesterday's verdict.
 */
export const setupInfo = query({
  args: {},
  returns: v.object({
    webhookUrl: v.union(v.string(), v.null()),
    appConfigured: v.boolean(),
    verifyTokenSet: v.boolean(),
    appSecretSet: v.boolean(),
  }),
  handler: async (ctx) => {
    await requireMembership(ctx);

    const appId =
      process.env.FACEBOOK_APP_ID?.trim() || process.env.META_APP_ID?.trim();
    const appSecret =
      process.env.FACEBOOK_APP_SECRET?.trim() ||
      process.env.META_APP_SECRET?.trim();

    return {
      webhookUrl: process.env.CONVEX_SITE_URL
        ? `${process.env.CONVEX_SITE_URL}/facebook/webhook`
        : null,
      appConfigured: Boolean(appId && appSecret),
      verifyTokenSet: Boolean(process.env.IG_WEBHOOK_VERIFY_TOKEN?.trim()),
      appSecretSet: Boolean(appSecret),
    };
  },
});

/**
 * Who is connected — the one thing every Facebook screen asks before it draws
 * anything. Returns null when no Page is connected, which is the empty state.
 */
export const pageInfo = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      pageId: v.string(),
      pageName: v.union(v.string(), v.null()),
      status: v.union(
        v.literal("active"),
        v.literal("error"),
        v.literal("expired"),
      ),
      expiresAt: v.union(v.number(), v.null()),
      lastSyncAt: v.union(v.number(), v.null()),
    }),
  ),
  handler: async (ctx) => {
    const { workspaceId }: { workspaceId: Id<"workspaces"> } =
      await requireMembership(ctx);

    const conn = await ctx.db
      .query("connections")
      .withIndex("by_workspace_provider", (q) =>
        q.eq("workspaceId", workspaceId).eq("provider", "meta_fb"),
      )
      .first();

    if (conn === null || !conn.externalId) return null;

    return {
      pageId: conn.externalId,
      pageName: conn.externalIdAlt ?? null,
      status: conn.status,
      expiresAt: conn.expiresAt ?? null,
      lastSyncAt: conn.lastSyncAt ?? null,
    };
  },
});
