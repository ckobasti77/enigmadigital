import { internalMutation, internalQuery, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { requireMembership } from "./lib/auth";
import { resolvePlatform } from "./lib/orPlatform";

/**
 * ============================================================================
 * FACEBOOK COMMENT PERSISTENCE & QUERY LAYER (F5, V8 runtime)
 * ============================================================================
 *
 * `fbComments` is upserted by the natural key [workspaceId, commentId] from two
 * directions: the `/facebook/webhook` route, which arrives within seconds of a
 * comment being written, and the 6h sync, which is the only thing that ever
 * sees a comment left before the Page was connected, or an edit, or a hide
 * performed in Meta Business Suite.
 *
 * Nothing is ever deleted. A comment removed from Facebook gets `deletedAt` and
 * stays on the screen, dimmed — the same rule the Instagram side follows, and
 * for the same reason: "this is gone" is information.
 * ============================================================================
 */

export const fbCommentRowValidator = v.object({
  commentId: v.string(),
  parentCommentId: v.optional(v.string()),
  text: v.string(),
  authorName: v.string(),
  authorId: v.optional(v.string()),
  permalink: v.optional(v.string()),
  timestamp: v.number(),
  likeCount: v.optional(v.number()),
  hidden: v.boolean(),
  isOurs: v.boolean(),
  repliedByUs: v.boolean(),
});

export const fbModerationActionValidator = v.union(
  v.literal("reply"),
  v.literal("hide"),
  v.literal("unhide"),
  v.literal("delete"),
  v.literal("like"),
  v.literal("unlike"),
);

/** How many comment rows one screen read walks before it stops. */
const LIST_WINDOW = 500;

// ── Internal helpers ─────────────────────────────────────────────────────────

async function findComment(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
  commentId: string,
): Promise<Doc<"fbComments"> | null> {
  return await ctx.db
    .query("fbComments")
    .withIndex("by_workspace_comment", (q) =>
      q.eq("workspaceId", workspaceId).eq("commentId", commentId),
    )
    .first();
}

/**
 * Mark the parent as answered, so the "Neodgovoreni" filter drops the comment
 * the moment our reply lands rather than at the next sync six hours later.
 */
async function markParentReplied(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  parentCommentId: string,
): Promise<void> {
  const parent = await findComment(ctx, workspaceId, parentCommentId);
  if (parent !== null && !parent.repliedByUs) {
    await ctx.db.patch(parent._id, { repliedByUs: true });
  }
}

// ── Sync writes ──────────────────────────────────────────────────────────────

/**
 * Upsert one post's comments.
 *
 * `complete` is the whole deletion story. Facebook never announces a removed
 * comment, so absence from the answer is the only signal there is — but absence
 * only MEANS something when we know we saw the whole list. When the response
 * carried a `paging.next`, we saw one page of many and a comment missing from
 * it proves nothing, so nothing is marked.
 */
export const upsertCommentBatch = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    postId: v.string(),
    rows: v.array(fbCommentRowValidator),
    complete: v.boolean(),
    syncedAt: v.number(),
  },
  returns: v.number(),
  handler: async (ctx, { workspaceId, postId, rows, complete, syncedAt }) => {
    let written = 0;

    for (const row of rows) {
      const existing = await findComment(ctx, workspaceId, row.commentId);

      if (existing !== null) {
        await ctx.db.patch(existing._id, {
          postId,
          parentCommentId: row.parentCommentId,
          text: row.text,
          // The webhook knows the name too; never overwrite a known one with
          // the empty string a restricted answer can carry.
          authorName: row.authorName || existing.authorName,
          authorId: row.authorId ?? existing.authorId,
          permalink: row.permalink ?? existing.permalink,
          timestamp: row.timestamp || existing.timestamp,
          likeCount: row.likeCount,
          hidden: row.hidden,
          isOurs: row.isOurs,
          // A reply we posted ourselves already flipped this; `false` from a
          // truncated answer must not take it back.
          repliedByUs: row.repliedByUs || existing.repliedByUs,
          syncedAt,
          // Facebook is showing it again, so an earlier "gone" verdict is void.
          deletedAt: undefined,
        });
      } else {
        await ctx.db.insert("fbComments", {
          workspaceId,
          postId,
          ...row,
          syncedAt,
        });
      }
      written++;
    }

    if (!complete) return written;

    const seen = new Set(rows.map((r) => r.commentId));
    const stored = await ctx.db
      .query("fbComments")
      .withIndex("by_workspace_post", (q) =>
        q.eq("workspaceId", workspaceId).eq("postId", postId),
      )
      .collect();

    for (const row of stored) {
      if (row.deletedAt !== undefined) continue;
      if (seen.has(row.commentId)) continue;
      await ctx.db.patch(row._id, { deletedAt: syncedAt });
      written++;
    }

    return written;
  },
});

/**
 * Record a comment that arrived on the webhook.
 *
 * Called from `orIngest.ingestComment` BEFORE the OpenReply engine has its say,
 * because moderation is not an automation feature: a Page with the engine
 * switched off still needs to see what people are writing under its posts.
 *
 * Deliberately gentle on an existing row — the sync knows more than the webhook
 * does (hidden state, likes, whether we have replied), and a redelivered
 * webhook must not undo any of it.
 */
export const recordWebhookComment = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    postId: v.string(),
    commentId: v.string(),
    parentCommentId: v.optional(v.string()),
    authorId: v.string(),
    authorName: v.optional(v.string()),
    text: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await findComment(ctx, args.workspaceId, args.commentId);

    if (existing !== null) {
      await ctx.db.patch(existing._id, {
        text: args.text,
        authorId: args.authorId,
        ...(args.authorName ? { authorName: args.authorName } : {}),
        syncedAt: now,
      });
      return null;
    }

    await ctx.db.insert("fbComments", {
      workspaceId: args.workspaceId,
      postId: args.postId,
      commentId: args.commentId,
      ...(args.parentCommentId
        ? { parentCommentId: args.parentCommentId }
        : {}),
      text: args.text,
      authorName: args.authorName ?? "",
      authorId: args.authorId,
      // The webhook carries no timestamp of its own; it fires within seconds.
      timestamp: now,
      hidden: false,
      // The webhook route drops anything sent by the Page itself, so a comment
      // that gets this far was written by somebody else.
      isOurs: false,
      repliedByUs: false,
      syncedAt: now,
    });

    if (args.parentCommentId) {
      // A reply we can see is a reply somebody else wrote; it does not answer
      // anything on our behalf. The parent is only touched so that a thread
      // opened from a reply still finds it.
      const parent = await findComment(
        ctx,
        args.workspaceId,
        args.parentCommentId,
      );
      if (parent !== null) await ctx.db.patch(parent._id, { syncedAt: now });
    }

    return null;
  },
});

// ── Moderation writes ────────────────────────────────────────────────────────

/** Everything an action needs to talk to Facebook on this workspace's behalf. */
export type FbModerationContext = {
  workspaceId: Id<"workspaces">;
  userId: Id<"users">;
  pageId: string;
  encryptedCredentials: string;
} | null;

/**
 * Membership check + credentials, in ONE transaction.
 *
 * Every moderation action starts here, and `requireMembership` throwing is what
 * makes "check membership before calling Facebook" true rather than intended:
 * an action that skipped this step would have no token to call with.
 */
export const loadModerationContext = internalQuery({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      workspaceId: v.id("workspaces"),
      userId: v.id("users"),
      pageId: v.string(),
      encryptedCredentials: v.string(),
    }),
  ),
  handler: async (ctx): Promise<FbModerationContext> => {
    const { workspaceId, userId } = await requireMembership(ctx);

    const conn = await ctx.db
      .query("connections")
      .withIndex("by_workspace_provider", (q) =>
        q.eq("workspaceId", workspaceId).eq("provider", "meta_fb"),
      )
      .first();

    if (
      conn === null ||
      conn.externalId === undefined ||
      conn.externalId.length === 0 ||
      conn.encryptedCredentials.length === 0
    ) {
      return null;
    }

    return {
      workspaceId,
      userId,
      pageId: conn.externalId,
      encryptedCredentials: conn.encryptedCredentials,
    };
  },
});

/**
 * Which automation wrote this comment, if any.
 *
 * Nothing links an automation to the comment id of the public reply it posted —
 * `orSend` stamps `publicReplySentAt` on the log row of the comment it was
 * ANSWERING and never records the id it got back. So the link is made the only
 * way it can be: a reply of ours whose parent is a comment some automation
 * publicly answered is that automation's reply.
 *
 * The platform is compared in code rather than indexed, for the reason spelled
 * out in orIngest.ts: rows written before F5 carry none, and here a missed row
 * would drop the warning off a delete dialog.
 */
async function resolveAutomationName(
  ctx: QueryCtx,
  row: Doc<"fbComments">,
): Promise<string | null> {
  if (!row.isOurs || row.parentCommentId === undefined) return null;

  const logs = await ctx.db
    .query("orDmLogs")
    .withIndex("by_workspace_comment", (q) =>
      q
        .eq("workspaceId", row.workspaceId)
        .eq("commentId", row.parentCommentId as string),
    )
    .filter((q) => q.neq(q.field("publicReplySentAt"), undefined))
    .collect();

  const log = logs.find((l) => resolvePlatform(l.platform) === "facebook");
  if (log === undefined || log.automationId === undefined) return null;

  const automation = await ctx.db.get(log.automationId);
  return automation?.name ?? null;
}

/** The stored comment, with the automation that wrote it when there is one. */
export const getForModeration = internalQuery({
  args: { workspaceId: v.id("workspaces"), commentId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      postId: v.string(),
      text: v.string(),
      authorName: v.string(),
      hidden: v.boolean(),
      likedByUs: v.optional(v.boolean()),
      isOurs: v.boolean(),
      deletedAt: v.optional(v.number()),
      automationName: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, { workspaceId, commentId }) => {
    const row = await findComment(ctx, workspaceId, commentId);
    if (row === null) return null;

    return {
      postId: row.postId,
      text: row.text,
      authorName: row.authorName,
      hidden: row.hidden,
      ...(row.likedByUs !== undefined ? { likedByUs: row.likedByUs } : {}),
      isOurs: row.isOurs,
      ...(row.deletedAt !== undefined ? { deletedAt: row.deletedAt } : {}),
      automationName: await resolveAutomationName(ctx, row),
    };
  },
});

/** Write the new hidden state back after Facebook accepted it. */
export const applyHidden = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    commentId: v.string(),
    hidden: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, { workspaceId, commentId, hidden }) => {
    const row = await findComment(ctx, workspaceId, commentId);
    if (row !== null) await ctx.db.patch(row._id, { hidden });
    return null;
  },
});

/**
 * Write the Page's own like back after Facebook accepted it.
 *
 * `likeCount` is nudged with it. Facebook's own count is only refreshed by the
 * next sync, and a heart that lights up next to a number that did not move
 * reads as a failed action.
 */
export const applyLiked = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    commentId: v.string(),
    liked: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, { workspaceId, commentId, liked }) => {
    const row = await findComment(ctx, workspaceId, commentId);
    if (row === null) return null;

    const current = row.likeCount ?? 0;
    const wasLiked = row.likedByUs === true;
    const likeCount =
      wasLiked === liked ? current : Math.max(0, current + (liked ? 1 : -1));

    await ctx.db.patch(row._id, { likedByUs: liked, likeCount });
    return null;
  },
});

/**
 * The comment is gone from Facebook. The row stays, marked — a deletion is
 * exactly the event an operator comes back to look for.
 */
export const applyDeleted = internalMutation({
  args: { workspaceId: v.id("workspaces"), commentId: v.string() },
  returns: v.null(),
  handler: async (ctx, { workspaceId, commentId }) => {
    const row = await findComment(ctx, workspaceId, commentId);
    if (row !== null && row.deletedAt === undefined) {
      await ctx.db.patch(row._id, { deletedAt: Date.now() });
    }
    return null;
  },
});

/**
 * Store the reply we just posted, so it appears under its parent immediately
 * instead of at the next sync.
 */
export const insertOurReply = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    postId: v.string(),
    commentId: v.string(),
    parentCommentId: v.string(),
    text: v.string(),
    authorName: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await findComment(ctx, args.workspaceId, args.commentId);

    if (existing === null) {
      await ctx.db.insert("fbComments", {
        workspaceId: args.workspaceId,
        postId: args.postId,
        commentId: args.commentId,
        parentCommentId: args.parentCommentId,
        text: args.text,
        authorName: args.authorName,
        timestamp: now,
        hidden: false,
        isOurs: true,
        repliedByUs: false,
        syncedAt: now,
      });
    }

    await markParentReplied(ctx, args.workspaceId, args.parentCommentId);
    return null;
  },
});

/** Does this post belong to this workspace? Nothing is moderated without it. */
export const ownsPost = internalQuery({
  args: { workspaceId: v.id("workspaces"), postId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { workspaceId, postId }) => {
    const row = await ctx.db
      .query("fbPagePosts")
      .withIndex("by_workspace_post", (q) =>
        q.eq("workspaceId", workspaceId).eq("postId", postId),
      )
      .first();
    return row !== null;
  },
});

/**
 * One row per attempted moderation action, successful or not.
 *
 * Written by the action after Facebook has answered, which is why it takes a
 * status rather than assuming one: the case worth keeping is the reply that
 * never went out.
 */
export const logModeration = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    userId: v.id("users"),
    action: fbModerationActionValidator,
    commentId: v.optional(v.string()),
    postId: v.optional(v.string()),
    text: v.optional(v.string()),
    authorName: v.optional(v.string()),
    status: v.union(v.literal("done"), v.literal("failed")),
    errorMessage: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("fbModerationLogs", {
      ...args,
      createdAt: Date.now(),
    });
    return null;
  },
});

// ── Public queries ───────────────────────────────────────────────────────────

const fbReplyViewValidator = v.object({
  _id: v.id("fbComments"),
  commentId: v.string(),
  text: v.string(),
  authorName: v.string(),
  permalink: v.optional(v.string()),
  timestamp: v.number(),
  likeCount: v.optional(v.number()),
  likedByUs: v.optional(v.boolean()),
  hidden: v.boolean(),
  isOurs: v.boolean(),
  deletedAt: v.optional(v.number()),
  automationName: v.optional(v.string()),
});

const fbThreadViewValidator = v.object({
  _id: v.id("fbComments"),
  commentId: v.string(),
  postId: v.string(),
  text: v.string(),
  authorName: v.string(),
  permalink: v.optional(v.string()),
  timestamp: v.number(),
  likeCount: v.optional(v.number()),
  likedByUs: v.optional(v.boolean()),
  hidden: v.boolean(),
  isOurs: v.boolean(),
  repliedByUs: v.boolean(),
  deletedAt: v.optional(v.number()),
  automationName: v.optional(v.string()),
  post: v.union(
    v.null(),
    v.object({
      message: v.string(),
      permalink: v.string(),
      statusType: v.string(),
      publishedAt: v.number(),
    }),
  ),
  replies: v.array(fbReplyViewValidator),
});

export const fbCommentFilterValidator = v.union(
  v.literal("all"),
  v.literal("unanswered"),
  v.literal("hidden"),
  v.literal("deleted"),
);

type FbCommentFilter = "all" | "unanswered" | "hidden" | "deleted";

/**
 * Does this comment belong in the chosen filter?
 *
 * "Neodgovoreni" is the default the screen opens on, so its definition is the
 * one that matters: somebody else's comment, still on Facebook, not hidden, and
 * nothing of ours under it. A hidden comment is deliberately NOT unanswered —
 * hiding it was the answer.
 */
function matchesFilter(
  row: Doc<"fbComments">,
  filter: FbCommentFilter,
): boolean {
  switch (filter) {
    case "unanswered":
      return (
        !row.isOurs &&
        !row.repliedByUs &&
        !row.hidden &&
        row.deletedAt === undefined
      );
    case "hidden":
      return row.hidden && row.deletedAt === undefined;
    case "deleted":
      return row.deletedAt !== undefined;
    case "all":
      return true;
  }
}

function matchesSearch(text: string, author: string, needle: string): boolean {
  if (needle.length === 0) return true;
  return (
    text.toLowerCase().includes(needle) || author.toLowerCase().includes(needle)
  );
}

/**
 * Threads for the moderation screen, newest first.
 *
 * A thread is a top-level comment plus its replies. The filter and the search
 * are applied to the top-level comment, with one exception: a search also keeps
 * a thread whose REPLY matches, because looking for a phrase you remember
 * writing should find the conversation it is in.
 */
export const listThreads = query({
  args: {
    filter: v.optional(fbCommentFilterValidator),
    search: v.optional(v.string()),
    postId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(fbThreadViewValidator),
  handler: async (ctx, { filter = "unanswered", search, postId, limit }) => {
    const { workspaceId } = await requireMembership(ctx);
    const maxThreads = limit && limit > 0 ? Math.min(limit, 200) : 100;
    const needle = (search ?? "").trim().toLowerCase();

    const window = postId
      ? await ctx.db
          .query("fbComments")
          .withIndex("by_workspace_post", (q) =>
            q.eq("workspaceId", workspaceId).eq("postId", postId),
          )
          .collect()
      : await ctx.db
          .query("fbComments")
          .withIndex("by_workspace_timestamp", (q) =>
            q.eq("workspaceId", workspaceId),
          )
          .order("desc")
          .take(LIST_WINDOW);

    const parents: Doc<"fbComments">[] = [];
    const repliesByParent = new Map<string, Doc<"fbComments">[]>();

    for (const row of window) {
      if (row.parentCommentId === undefined) {
        parents.push(row);
        continue;
      }
      const list = repliesByParent.get(row.parentCommentId);
      if (list) list.push(row);
      else repliesByParent.set(row.parentCommentId, [row]);
    }

    // A reply is always newer than the comment it answers, so a busy Page can
    // push a parent out of the window while its reply is still inside it.
    // Those parents are fetched one by one rather than dropped — a thread that
    // vanished because somebody answered it would be the opposite of useful.
    const known = new Set(parents.map((p) => p.commentId));
    for (const parentCommentId of repliesByParent.keys()) {
      if (known.has(parentCommentId)) continue;
      const parent = await findComment(ctx, workspaceId, parentCommentId);
      if (parent !== null) {
        parents.push(parent);
        known.add(parent.commentId);
      }
    }

    parents.sort((a, b) => b.timestamp - a.timestamp);

    const out = [];
    for (const parent of parents) {
      if (out.length >= maxThreads) break;
      if (!matchesFilter(parent, filter)) continue;

      const replies = (repliesByParent.get(parent.commentId) ?? []).sort(
        (a, b) => a.timestamp - b.timestamp,
      );

      const hit =
        matchesSearch(parent.text, parent.authorName, needle) ||
        replies.some((r) => matchesSearch(r.text, r.authorName, needle));
      if (!hit) continue;

      const post = await ctx.db
        .query("fbPagePosts")
        .withIndex("by_workspace_post", (q) =>
          q.eq("workspaceId", workspaceId).eq("postId", parent.postId),
        )
        .first();

      const parentAutomation = await resolveAutomationName(ctx, parent);

      const replyViews = [];
      for (const reply of replies) {
        const automationName = await resolveAutomationName(ctx, reply);
        replyViews.push({
          _id: reply._id,
          commentId: reply.commentId,
          text: reply.text,
          authorName: reply.authorName,
          ...(reply.permalink !== undefined
            ? { permalink: reply.permalink }
            : {}),
          timestamp: reply.timestamp,
          ...(reply.likeCount !== undefined
            ? { likeCount: reply.likeCount }
            : {}),
          ...(reply.likedByUs !== undefined
            ? { likedByUs: reply.likedByUs }
            : {}),
          hidden: reply.hidden,
          isOurs: reply.isOurs,
          ...(reply.deletedAt !== undefined
            ? { deletedAt: reply.deletedAt }
            : {}),
          ...(automationName !== null ? { automationName } : {}),
        });
      }

      out.push({
        _id: parent._id,
        commentId: parent.commentId,
        postId: parent.postId,
        text: parent.text,
        authorName: parent.authorName,
        ...(parent.permalink !== undefined
          ? { permalink: parent.permalink }
          : {}),
        timestamp: parent.timestamp,
        ...(parent.likeCount !== undefined
          ? { likeCount: parent.likeCount }
          : {}),
        ...(parent.likedByUs !== undefined
          ? { likedByUs: parent.likedByUs }
          : {}),
        hidden: parent.hidden,
        isOurs: parent.isOurs,
        repliedByUs: parent.repliedByUs,
        ...(parent.deletedAt !== undefined
          ? { deletedAt: parent.deletedAt }
          : {}),
        ...(parentAutomation !== null
          ? { automationName: parentAutomation }
          : {}),
        post:
          post === null
            ? null
            : {
                message: post.message,
                permalink: post.permalink,
                statusType: post.statusType,
                publishedAt: post.publishedAt,
              },
        replies: replyViews,
      });
    }

    return out;
  },
});

/**
 * How many comments sit behind each filter — the numbers on the filter chips.
 *
 * Counted over the same window `listThreads` reads, so a chip never promises a
 * thread the list cannot show.
 */
export const filterCounts = query({
  args: {},
  returns: v.object({
    all: v.number(),
    unanswered: v.number(),
    hidden: v.number(),
    deleted: v.number(),
  }),
  handler: async (ctx) => {
    const { workspaceId } = await requireMembership(ctx);

    const window = await ctx.db
      .query("fbComments")
      .withIndex("by_workspace_timestamp", (q) =>
        q.eq("workspaceId", workspaceId),
      )
      .order("desc")
      .take(LIST_WINDOW);

    const counts = { all: 0, unanswered: 0, hidden: 0, deleted: 0 };
    for (const row of window) {
      if (row.parentCommentId !== undefined) continue;
      counts.all++;
      if (matchesFilter(row, "unanswered")) counts.unanswered++;
      if (matchesFilter(row, "hidden")) counts.hidden++;
      if (matchesFilter(row, "deleted")) counts.deleted++;
    }
    return counts;
  },
});
