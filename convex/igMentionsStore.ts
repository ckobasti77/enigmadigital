import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { requireMembership } from "./lib/auth";

/**
 * ============================================================================
 * INSTAGRAM MENTIONS PERSISTENCE & QUERY LAYER (G5, V8 runtime)
 * ============================================================================
 *
 * `igMentions` stores @mentions in comments and post captions discovered via
 * the `mentions` webhook field or the `/me/tags` edge (tagged media).
 *
 * Rule: Comments discovered through Mentions API cannot be hidden or deleted
 * by the mentioned account (Instagram limitation). Only public replies can be
 * sent via `POST /{ig-user-id}/mentions`.
 * ============================================================================
 */

const MAX_MENTIONS = 100;
const MAX_MENTIONS_SCAN = 500;

export const mentionViewValidator = v.object({
  _id: v.id("igMentions"),
  kind: v.union(v.literal("comment"), v.literal("caption")),
  commentId: v.optional(v.string()),
  mediaId: v.string(),
  text: v.string(),
  authorUsername: v.optional(v.string()),
  permalink: v.optional(v.string()),
  timestamp: v.number(),
  repliedAt: v.optional(v.number()),
  replyText: v.optional(v.string()),
  contextState: v.union(
    v.literal("value"),
    v.literal("suppressed"),
    v.literal("unavailable"),
  ),
  contextReason: v.optional(v.string()),
  syncedAt: v.number(),
});

// ── Webhook & Sync Ingest Mutations ──────────────────────────────────────────

/**
 * Record an incoming mention from the webhook.
 * Deduplicates idempotently: same comment_id / media_id will not produce duplicate rows.
 * Respects connection `disconnecting` fence (R1).
 */
export const recordWebhookMention = internalMutation({
  args: {
    accountId: v.string(),
    commentId: v.optional(v.string()),
    mediaId: v.string(),
    text: v.string(),
  },
  returns: v.union(
    v.null(),
    v.object({
      mentionId: v.id("igMentions"),
      workspaceId: v.id("workspaces"),
      igUserId: v.string(),
      kind: v.union(v.literal("comment"), v.literal("caption")),
      commentId: v.optional(v.string()),
      mediaId: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    // 1. Resolve workspace connection
    const connections = await ctx.db
      .query("connections")
      .withIndex("by_provider", (q) => q.eq("provider", "meta_ig"))
      .collect();

    const conn = connections.find(
      (c) =>
        c.externalId === args.accountId || c.externalIdAlt === args.accountId,
    );

    if (!conn || conn.status === "disconnecting") {
      return null;
    }

    const workspaceId = conn.workspaceId;
    const kind: "comment" | "caption" = args.commentId ? "comment" : "caption";
    const now = Date.now();

    // 2. Dedup
    if (args.commentId) {
      const existing = await ctx.db
        .query("igMentions")
        .withIndex("by_workspace_comment", (q) =>
          q.eq("workspaceId", workspaceId).eq("commentId", args.commentId),
        )
        .first();
      if (existing !== null) return null;
    } else {
      const existingMedia = await ctx.db
        .query("igMentions")
        .withIndex("by_workspace_media", (q) =>
          q.eq("workspaceId", workspaceId).eq("mediaId", args.mediaId),
        )
        .collect();
      const duplicate = existingMedia.some((m) => m.kind === "caption");
      if (duplicate) return null;
    }

    // 3. Insert initial mention row
    const mentionId = await ctx.db.insert("igMentions", {
      workspaceId,
      kind,
      commentId: args.commentId,
      mediaId: args.mediaId,
      text: args.text,
      timestamp: now,
      contextState: "value",
      syncedAt: now,
    });

    return {
      mentionId,
      workspaceId,
      igUserId: conn.externalId ?? args.accountId,
      kind,
      commentId: args.commentId,
      mediaId: args.mediaId,
    };
  },
});

/**
 * Update mention row with context fetched asynchronously via Graph API.
 */
export const updateMentionContext = internalMutation({
  args: {
    mentionId: v.id("igMentions"),
    authorUsername: v.optional(v.string()),
    permalink: v.optional(v.string()),
    timestamp: v.optional(v.number()),
    contextState: v.union(
      v.literal("value"),
      v.literal("suppressed"),
      v.literal("unavailable"),
    ),
    contextReason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.mentionId);
    if (row === null) return null;

    await ctx.db.patch(args.mentionId, {
      ...(args.authorUsername !== undefined
        ? { authorUsername: args.authorUsername }
        : {}),
      ...(args.permalink !== undefined ? { permalink: args.permalink } : {}),
      ...(args.timestamp !== undefined ? { timestamp: args.timestamp } : {}),
      contextState: args.contextState,
      ...(args.contextReason !== undefined
        ? { contextReason: args.contextReason }
        : {}),
      syncedAt: Date.now(),
    });

    return null;
  },
});

export const tagItemValidator = v.object({
  mediaId: v.string(),
  caption: v.optional(v.string()),
  permalink: v.optional(v.string()),
  username: v.optional(v.string()),
  timestamp: v.number(),
});

/**
 * Upsert tagged media items pulled during 6-hour sync.
 */
export const upsertTagsBatch = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    tags: v.array(tagItemValidator),
    syncedAt: v.number(),
  },
  returns: v.number(),
  handler: async (ctx, { workspaceId, tags, syncedAt }) => {
    let written = 0;
    for (const tag of tags) {
      const existingMedia = await ctx.db
        .query("igMentions")
        .withIndex("by_workspace_media", (q) =>
          q.eq("workspaceId", workspaceId).eq("mediaId", tag.mediaId),
        )
        .collect();

      const existingCaption = existingMedia.find((m) => m.kind === "caption");

      if (existingCaption) {
        await ctx.db.patch(existingCaption._id, {
          ...(tag.caption && !existingCaption.text ? { text: tag.caption } : {}),
          ...(tag.permalink ? { permalink: tag.permalink } : {}),
          ...(tag.username ? { authorUsername: tag.username } : {}),
          syncedAt,
        });
      } else {
        await ctx.db.insert("igMentions", {
          workspaceId,
          kind: "caption",
          mediaId: tag.mediaId,
          text: tag.caption ?? "",
          authorUsername: tag.username,
          permalink: tag.permalink,
          timestamp: tag.timestamp > 0 ? tag.timestamp : syncedAt,
          contextState: "value",
          syncedAt,
        });
        written++;
      }
    }
    return written;
  },
});

/**
 * Get mention details before sending a reply.
 */
export const getMentionForReply = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    mentionId: v.id("igMentions"),
  },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("igMentions"),
      kind: v.union(v.literal("comment"), v.literal("caption")),
      commentId: v.optional(v.string()),
      mediaId: v.string(),
      text: v.string(),
      authorUsername: v.optional(v.string()),
      repliedAt: v.optional(v.number()),
      replyText: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, { workspaceId, mentionId }) => {
    const row = await ctx.db.get(mentionId);
    if (row === null || row.workspaceId !== workspaceId) return null;
    return {
      _id: row._id,
      kind: row.kind,
      commentId: row.commentId,
      mediaId: row.mediaId,
      text: row.text,
      authorUsername: row.authorUsername,
      repliedAt: row.repliedAt,
      replyText: row.replyText,
    };
  },
});

/**
 * Record that a reply was successfully posted.
 */
export const recordMentionReply = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    mentionId: v.id("igMentions"),
    replyText: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { workspaceId, mentionId, replyText }) => {
    const row = await ctx.db.get(mentionId);
    if (row === null || row.workspaceId !== workspaceId) return null;

    await ctx.db.patch(mentionId, {
      repliedAt: Date.now(),
      replyText,
    });
    return null;
  },
});

// ── Public Queries ───────────────────────────────────────────────────────────

/**
 * List mentions for the moderation screen, newest first.
 */
export const listMentions = query({
  args: {
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(mentionViewValidator),
  handler: async (ctx, { search, limit }) => {
    const { workspaceId } = await requireMembership(ctx);
    const maxMentions =
      limit && limit > 0 ? Math.min(limit, MAX_MENTIONS) : MAX_MENTIONS;
    const needle = (search ?? "").trim().toLowerCase();

    const window = await ctx.db
      .query("igMentions")
      .withIndex("by_workspace_timestamp", (q) =>
        q.eq("workspaceId", workspaceId),
      )
      .order("desc")
      .take(MAX_MENTIONS_SCAN);

    const out: Array<Doc<"igMentions">> = [];
    for (const row of window) {
      if (out.length >= maxMentions) break;
      if (needle.length > 0) {
        const textMatch = row.text.toLowerCase().includes(needle);
        const userMatch = (row.authorUsername ?? "").toLowerCase().includes(needle);
        const replyMatch = (row.replyText ?? "").toLowerCase().includes(needle);
        if (!textMatch && !userMatch && !replyMatch) continue;
      }
      out.push(row);
    }

    return out.map((row) => ({
      _id: row._id,
      kind: row.kind,
      commentId: row.commentId,
      mediaId: row.mediaId,
      text: row.text,
      authorUsername: row.authorUsername,
      permalink: row.permalink,
      timestamp: row.timestamp,
      repliedAt: row.repliedAt,
      replyText: row.replyText,
      contextState: row.contextState,
      contextReason: row.contextReason,
      syncedAt: row.syncedAt,
    }));
  },
});

/**
 * Count total mentions for filter chip.
 */
export const countMentions = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  returns: v.number(),
  handler: async (ctx, { workspaceId }) => {
    const window = await ctx.db
      .query("igMentions")
      .withIndex("by_workspace_timestamp", (q) =>
        q.eq("workspaceId", workspaceId),
      )
      .take(MAX_MENTIONS_SCAN);

    return window.length;
  },
});
