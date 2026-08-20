import { internalMutation, internalQuery, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { requireMembership } from "./lib/auth";

/**
 * ============================================================================
 * INSTAGRAM COMMENT PERSISTENCE & QUERY LAYER (F4, V8 runtime)
 * ============================================================================
 *
 * `igComments` is upserted by the natural key [workspaceId, commentId] from two
 * directions: the webhook, which arrives within seconds of a comment being
 * written, and the 6h sync, which is the only thing that ever sees a comment
 * left before the account was connected, or an edit, or a hide performed in the
 * Instagram app.
 *
 * Nothing is ever deleted. A comment removed from Instagram gets `deletedAt`
 * and stays on the screen, dimmed — the same rule the posts follow, and for the
 * same reason: "this is gone" is information, and the log that says who removed
 * it would otherwise point at a row that no longer exists.
 * ============================================================================
 */

export const commentRowValidator = v.object({
  commentId: v.string(),
  parentCommentId: v.optional(v.string()),
  text: v.string(),
  username: v.string(),
  timestamp: v.number(),
  likeCount: v.optional(v.number()),
  hidden: v.boolean(),
  isOurs: v.boolean(),
  repliedByUs: v.boolean(),
});

export const moderationActionValidator = v.union(
  v.literal("reply"),
  v.literal("hide"),
  v.literal("unhide"),
  v.literal("delete"),
  v.literal("comments_on"),
  v.literal("comments_off"),
);

/** How many comment rows one screen read walks before it stops. */
const LIST_WINDOW = 500;

/**
 * How many threads one read may return, and therefore the highest number the
 * filter chips are allowed to print (V1).
 *
 * The screen has no "load more". A chip counting the whole 500-row window while
 * the list stops at a hundred was promising two hundred threads that no
 * sequence of clicks could reach, so the counts are capped at what is actually
 * on screen and the chip says "100+" when it hits the ceiling.
 */
const MAX_THREADS = 100;
const MAX_THREADS_CEILING = 200;

// ── Internal helpers ─────────────────────────────────────────────────────────

async function findComment(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
  commentId: string,
): Promise<Doc<"igComments"> | null> {
  return await ctx.db
    .query("igComments")
    .withIndex("by_workspace_comment", (q) =>
      q.eq("workspaceId", workspaceId).eq("commentId", commentId),
    )
    .first();
}

/**
 * Mark the parent as answered. Called after we post a reply, so the
 * "Neodgovoreni" filter drops the comment the moment the reply lands rather
 * than at the next sync six hours later.
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

/** How many stored rows one deletion sweep walks. */
const SWEEP_SCAN_LIMIT = 2000;

/**
 * Upsert one post's comments.
 *
 * `complete` is the whole deletion story. Instagram never announces a removed
 * comment, so absence from the answer is the only signal there is — but absence
 * only MEANS something when we know we saw the whole list. This mirrors the
 * rule the post sync uses in `instagramStore.listDeletionCandidates`, arrived
 * at the same way.
 *
 * Three things have to be true before a missing comment is called deleted, and
 * each of them was a way of marking a live comment as gone before V1:
 *
 *   1. `complete` — the caller walked EVERY page, top level and nested. A
 *      thread's `replies` edge is paginated too, and a reply past that page was
 *      being swept up as deleted the moment the thread outgrew it.
 *   2. `seenIds` — the ids from every page of the walk, not just this batch.
 *      The walk writes in chunks, so the last chunk on its own knows nothing
 *      about the comments the first one carried.
 *   3. `snapshotAt` — the instant the FIRST Graph call went out. Between that
 *      call and this mutation there is a network round trip inside a loop over
 *      twenty posts, and a comment can arrive on the webhook in the middle of
 *      it. Anything we learned about after the snapshot was not in the answer
 *      because it did not exist yet, which is not the same as being gone.
 */
export const upsertCommentBatch = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    mediaId: v.string(),
    rows: v.array(commentRowValidator),
    complete: v.boolean(),
    syncedAt: v.number(),
    /** When the first Graph call of this walk went out. */
    snapshotAt: v.number(),
    /** Every id the walk saw. Defaults to the ids in `rows`. */
    seenIds: v.optional(v.array(v.string())),
    /**
     * What cut the walk short, or `null` to clear an earlier stamp. Left
     * undefined by callers that never attempted full coverage — a single-post
     * refresh must not erase what the full pass recorded.
     */
    truncated: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.number(),
  handler: async (
    ctx,
    {
      workspaceId,
      mediaId,
      rows,
      complete,
      syncedAt,
      snapshotAt,
      seenIds,
      truncated,
    },
  ) => {
    let written = 0;

    for (const row of rows) {
      const existing = await findComment(ctx, workspaceId, row.commentId);

      if (existing !== null) {
        await ctx.db.patch(existing._id, {
          mediaId,
          parentCommentId: row.parentCommentId,
          text: row.text,
          // The webhook knows the handle too; never overwrite a known one with
          // the empty string a partial answer can carry.
          username: row.username || existing.username,
          timestamp: row.timestamp || existing.timestamp,
          likeCount: row.likeCount,
          hidden: row.hidden,
          isOurs: row.isOurs,
          // Instagram only reports replies it still has. A reply we posted
          // ourselves already flipped this, so `false` from a truncated answer
          // must not take it back.
          repliedByUs: row.repliedByUs || existing.repliedByUs,
          syncedAt,
          // Instagram is showing it again, so an earlier "gone" verdict is void.
          deletedAt: undefined,
          // The answer says where this comment sits in the thread, which is
          // exactly what the webhook could not (V1).
          levelUnknown: undefined,
        });
      } else {
        await ctx.db.insert("igComments", {
          workspaceId,
          mediaId,
          ...row,
          syncedAt,
        });
      }
      written++;
    }

    if (truncated !== undefined) {
      await stampTruncation(ctx, workspaceId, mediaId, truncated, syncedAt);
    }

    if (!complete) return written;

    // Everything we hold for this post that Instagram just did not mention.
    const seen = new Set(seenIds ?? rows.map((r) => r.commentId));
    const stored = await ctx.db
      .query("igComments")
      .withIndex("by_workspace_media", (q) =>
        q.eq("workspaceId", workspaceId).eq("mediaId", mediaId),
      )
      .take(SWEEP_SCAN_LIMIT);

    for (const row of stored) {
      if (row.deletedAt !== undefined) continue;
      if (seen.has(row.commentId)) continue;
      // Written or last touched after the snapshot: it reached us by some other
      // road than this answer, and this answer cannot speak about it.
      if (row.syncedAt >= snapshotAt || row.timestamp >= snapshotAt) continue;
      await ctx.db.patch(row._id, { deletedAt: syncedAt });
      written++;
    }

    return written;
  },
});

/**
 * Record on the POST that its comment read was cut short — or that it was not.
 *
 * On the post rather than in a log line because the question it answers is
 * asked about a post: "why has this one never reported a deleted comment".
 */
async function stampTruncation(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  mediaId: string,
  reason: string | null,
  at: number,
): Promise<void> {
  const media = await ctx.db
    .query("igMediaStats")
    .withIndex("by_workspace_media", (q) =>
      q.eq("workspaceId", workspaceId).eq("mediaId", mediaId),
    )
    .first();
  if (media === null) return;

  if (reason === null) {
    if (media.commentsTruncatedAt === undefined) return;
    await ctx.db.patch(media._id, {
      commentsTruncatedAt: undefined,
      commentsTruncatedReason: undefined,
    });
    return;
  }

  await ctx.db.patch(media._id, {
    commentsTruncatedAt: at,
    commentsTruncatedReason: reason,
  });
}

/**
 * Record a comment that arrived on the webhook.
 *
 * Called from `orIngest.ingestComment` BEFORE the OpenReply engine has its say,
 * because moderation is not an automation feature: a workspace with the engine
 * switched off still needs to see what people are writing under its posts.
 *
 * Deliberately gentle on an existing row — the sync knows more than the webhook
 * does (hidden state, likes, whether we have replied), and a redelivered
 * webhook must not undo any of it.
 */
export const recordWebhookComment = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    mediaId: v.string(),
    commentId: v.string(),
    parentCommentId: v.optional(v.string()),
    /**
     * The webhook carried nothing usable about the thread level (V1). The row
     * is stored anyway — it is a real comment somebody wrote — but the panel
     * offers no "Odgovori" button on it, because `POST /{reply-id}/replies` is
     * refused by Instagram and a button that always fails is worse than none.
     */
    levelUnknown: v.optional(v.boolean()),
    fromId: v.string(),
    username: v.optional(v.string()),
    text: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await findComment(ctx, args.workspaceId, args.commentId);

    if (existing !== null) {
      await ctx.db.patch(existing._id, {
        text: args.text,
        fromId: args.fromId,
        ...(args.username ? { username: args.username } : {}),
        // A redelivery that DOES name the parent settles a level an earlier
        // one left open; one that does not must never unsettle it.
        ...(args.parentCommentId
          ? { parentCommentId: args.parentCommentId, levelUnknown: undefined }
          : {}),
        syncedAt: now,
      });
      return null;
    }

    await ctx.db.insert("igComments", {
      workspaceId: args.workspaceId,
      mediaId: args.mediaId,
      commentId: args.commentId,
      ...(args.parentCommentId
        ? { parentCommentId: args.parentCommentId }
        : {}),
      ...(args.parentCommentId === undefined && args.levelUnknown
        ? { levelUnknown: true }
        : {}),
      text: args.text,
      username: args.username ?? "",
      fromId: args.fromId,
      // The webhook carries no timestamp of its own; it fires within seconds.
      timestamp: now,
      hidden: false,
      // The webhook route drops anything sent by the account itself, so a
      // comment that gets this far was written by somebody else.
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

/** Everything an action needs to talk to Instagram on this workspace's behalf. */
export type ModerationContext = {
  workspaceId: Id<"workspaces">;
  userId: Id<"users">;
  igUserId: string;
  encryptedCredentials: string;
} | null;

/**
 * Membership check + credentials, in ONE transaction.
 *
 * Every moderation action starts here, and `requireMembership` throwing is what
 * makes "check membership before calling Instagram" true rather than intended:
 * an action that skipped this step would have no token to call with.
 */
export const loadModerationContext = internalQuery({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      workspaceId: v.id("workspaces"),
      userId: v.id("users"),
      igUserId: v.string(),
      encryptedCredentials: v.string(),
    }),
  ),
  handler: async (ctx): Promise<ModerationContext> => {
    const { workspaceId, userId } = await requireMembership(ctx);

    const conn = await ctx.db
      .query("connections")
      .withIndex("by_workspace_provider", (q) =>
        q.eq("workspaceId", workspaceId).eq("provider", "meta_ig"),
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
      igUserId: conn.externalId,
      encryptedCredentials: conn.encryptedCredentials,
    };
  },
});

/**
 * The stored comment, with the automation that wrote it when there is one.
 *
 * A comment we posted ourselves is the one case where deleting deserves a
 * second thought: it may be an automation's public reply, and removing it
 * silently breaks a flow somebody set up on purpose. The name travels back with
 * the row so both the confirmation dialog and the log can say which one.
 */
export const getForModeration = internalQuery({
  args: { workspaceId: v.id("workspaces"), commentId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      mediaId: v.string(),
      text: v.string(),
      username: v.string(),
      hidden: v.boolean(),
      isOurs: v.boolean(),
      deletedAt: v.optional(v.number()),
      automationName: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, { workspaceId, commentId }) => {
    const row = await findComment(ctx, workspaceId, commentId);
    if (row === null) return null;

    return {
      mediaId: row.mediaId,
      text: row.text,
      username: row.username,
      hidden: row.hidden,
      isOurs: row.isOurs,
      ...(row.deletedAt !== undefined ? { deletedAt: row.deletedAt } : {}),
      automationName: await resolveAutomationName(ctx, row),
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
 * Returns null for anything else, including our own replies typed by hand.
 */
async function resolveAutomationName(
  ctx: QueryCtx,
  row: Doc<"igComments">,
): Promise<string | null> {
  if (!row.isOurs || row.parentCommentId === undefined) return null;

  const log = await ctx.db
    .query("orDmLogs")
    .withIndex("by_workspace_comment", (q) =>
      q
        .eq("workspaceId", row.workspaceId)
        .eq("commentId", row.parentCommentId as string),
    )
    .filter((q) => q.neq(q.field("publicReplySentAt"), undefined))
    .first();

  if (log === null || log.automationId === undefined) return null;

  const automation = await ctx.db.get(log.automationId);
  return automation?.name ?? null;
}

/** Write the new hidden state back after Instagram accepted it. */
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
 * The comment is gone from Instagram. The row stays, marked — a deletion is
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
    mediaId: v.string(),
    commentId: v.string(),
    parentCommentId: v.string(),
    text: v.string(),
    username: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await findComment(ctx, args.workspaceId, args.commentId);

    if (existing === null) {
      await ctx.db.insert("igComments", {
        workspaceId: args.workspaceId,
        mediaId: args.mediaId,
        commentId: args.commentId,
        parentCommentId: args.parentCommentId,
        text: args.text,
        username: args.username,
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

/** Mirror the `comment_enabled` switch onto the post row. */
export const applyCommentsEnabled = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    mediaId: v.string(),
    enabled: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, { workspaceId, mediaId, enabled }) => {
    const row = await ctx.db
      .query("igMediaStats")
      .withIndex("by_workspace_media", (q) =>
        q.eq("workspaceId", workspaceId).eq("mediaId", mediaId),
      )
      .first();
    if (row !== null) await ctx.db.patch(row._id, { commentsEnabled: enabled });
    return null;
  },
});

/** Does this post belong to this workspace? Nothing is moderated without it. */
export const ownsMedia = internalQuery({
  args: { workspaceId: v.id("workspaces"), mediaId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { workspaceId, mediaId }) => {
    const row = await ctx.db
      .query("igMediaStats")
      .withIndex("by_workspace_media", (q) =>
        q.eq("workspaceId", workspaceId).eq("mediaId", mediaId),
      )
      .first();
    return row !== null;
  },
});

/**
 * One row per attempted moderation action, successful or not.
 *
 * Written by the action after Instagram has answered, which is why it takes a
 * status rather than assuming one: the case worth keeping is the reply that
 * never went out.
 */
export const logModeration = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    userId: v.id("users"),
    action: moderationActionValidator,
    commentId: v.optional(v.string()),
    mediaId: v.optional(v.string()),
    text: v.optional(v.string()),
    username: v.optional(v.string()),
    status: v.union(v.literal("done"), v.literal("failed")),
    errorMessage: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("igModerationLogs", {
      ...args,
      createdAt: Date.now(),
    });
    return null;
  },
});

// ── Public queries ───────────────────────────────────────────────────────────

const replyViewValidator = v.object({
  _id: v.id("igComments"),
  commentId: v.string(),
  text: v.string(),
  username: v.string(),
  timestamp: v.number(),
  likeCount: v.optional(v.number()),
  hidden: v.boolean(),
  isOurs: v.boolean(),
  deletedAt: v.optional(v.number()),
  /** Set only on a reply an automation posted — the delete dialog warns then. */
  automationName: v.optional(v.string()),
});

const threadViewValidator = v.object({
  _id: v.id("igComments"),
  commentId: v.string(),
  mediaId: v.string(),
  text: v.string(),
  username: v.string(),
  timestamp: v.number(),
  likeCount: v.optional(v.number()),
  hidden: v.boolean(),
  isOurs: v.boolean(),
  repliedByUs: v.boolean(),
  deletedAt: v.optional(v.number()),
  automationName: v.optional(v.string()),
  /** Thread level still unresolved — the reply button stays off (V1). */
  levelUnknown: v.optional(v.boolean()),
  /** Which post this is under; null when the post predates the media sync. */
  media: v.union(
    v.null(),
    v.object({
      caption: v.string(),
      permalink: v.string(),
      mediaType: v.string(),
      publishedAt: v.number(),
    }),
  ),
  replies: v.array(replyViewValidator),
});

export const commentFilterValidator = v.union(
  v.literal("all"),
  v.literal("unanswered"),
  v.literal("hidden"),
  v.literal("deleted"),
);

type CommentFilter = "all" | "unanswered" | "hidden" | "deleted";

/**
 * Does this comment belong in the chosen filter?
 *
 * "Neodgovoreni" is the default the screen opens on, so its definition is the
 * one that matters: somebody else's comment, still on Instagram, not hidden,
 * and nothing of ours under it. A hidden comment is deliberately NOT unanswered
 * — hiding it was the answer.
 */
function matchesFilter(row: Doc<"igComments">, filter: CommentFilter): boolean {
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

function matchesSearch(text: string, username: string, needle: string): boolean {
  if (needle.length === 0) return true;
  return (
    text.toLowerCase().includes(needle) ||
    username.toLowerCase().includes(needle)
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
    filter: v.optional(commentFilterValidator),
    search: v.optional(v.string()),
    mediaId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(threadViewValidator),
  handler: async (ctx, { filter = "unanswered", search, mediaId, limit }) => {
    const { workspaceId } = await requireMembership(ctx);
    const maxThreads =
      limit && limit > 0 ? Math.min(limit, MAX_THREADS_CEILING) : MAX_THREADS;
    const needle = (search ?? "").trim().toLowerCase();

    // One post's comments come off the media index; the whole screen walks the
    // newest slice of the workspace instead. Both are bounded: a viral post
    // holds as many rows as the whole workspace does, and an unbounded walk
    // over it takes the read limit down with it (V1).
    const window = mediaId
      ? await ctx.db
          .query("igComments")
          .withIndex("by_workspace_media", (q) =>
            q.eq("workspaceId", workspaceId).eq("mediaId", mediaId),
          )
          .order("desc")
          .take(LIST_WINDOW)
      : await ctx.db
          .query("igComments")
          .withIndex("by_workspace_timestamp", (q) =>
            q.eq("workspaceId", workspaceId),
          )
          .order("desc")
          .take(LIST_WINDOW);

    const parents: Doc<"igComments">[] = [];
    const repliesByParent = new Map<string, Doc<"igComments">[]>();

    for (const row of window) {
      if (row.parentCommentId === undefined) {
        parents.push(row);
        continue;
      }
      const list = repliesByParent.get(row.parentCommentId);
      if (list) list.push(row);
      else repliesByParent.set(row.parentCommentId, [row]);
    }

    // A reply is always newer than the comment it answers, so a busy account
    // can push a parent out of the window while its reply is still inside it.
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
        matchesSearch(parent.text, parent.username, needle) ||
        replies.some((r) => matchesSearch(r.text, r.username, needle));
      if (!hit) continue;

      const media = await ctx.db
        .query("igMediaStats")
        .withIndex("by_workspace_media", (q) =>
          q.eq("workspaceId", workspaceId).eq("mediaId", parent.mediaId),
        )
        .first();

      // Always null for a top-level comment (an automation only ever posts
      // replies), but the field has to exist for the view type to carry it.
      const parentAutomation = await resolveAutomationName(ctx, parent);

      const replyViews = [];
      for (const reply of replies) {
        const automationName = await resolveAutomationName(ctx, reply);
        replyViews.push({
          _id: reply._id,
          commentId: reply.commentId,
          text: reply.text,
          username: reply.username,
          timestamp: reply.timestamp,
          ...(reply.likeCount !== undefined
            ? { likeCount: reply.likeCount }
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
        mediaId: parent.mediaId,
        text: parent.text,
        username: parent.username,
        timestamp: parent.timestamp,
        ...(parent.likeCount !== undefined
          ? { likeCount: parent.likeCount }
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
        ...(parent.levelUnknown === true ? { levelUnknown: true } : {}),
        media:
          media === null
            ? null
            : {
                caption: media.caption,
                permalink: media.permalink,
                mediaType: media.mediaType,
                publishedAt: media.publishedAt,
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
 * Counted over the same window `listThreads` reads AND capped at the same
 * number of threads it returns, so a chip never promises a thread the list
 * cannot show. `cap` travels back so the screen can print "100+" rather than a
 * flat hundred: the number is a floor, and saying so is the honest version of
 * a screen with no "load more" (V1).
 */
export const filterCounts = query({
  args: {},
  returns: v.object({
    all: v.number(),
    unanswered: v.number(),
    hidden: v.number(),
    deleted: v.number(),
    cap: v.number(),
  }),
  handler: async (ctx) => {
    const { workspaceId } = await requireMembership(ctx);

    const window = await ctx.db
      .query("igComments")
      .withIndex("by_workspace_timestamp", (q) =>
        q.eq("workspaceId", workspaceId),
      )
      .order("desc")
      .take(LIST_WINDOW);

    const counts = { all: 0, unanswered: 0, hidden: 0, deleted: 0 };
    for (const row of window) {
      if (row.parentCommentId !== undefined) continue;
      if (counts.all < MAX_THREADS) counts.all++;
      if (counts.unanswered < MAX_THREADS && matchesFilter(row, "unanswered")) {
        counts.unanswered++;
      }
      if (counts.hidden < MAX_THREADS && matchesFilter(row, "hidden")) {
        counts.hidden++;
      }
      if (counts.deleted < MAX_THREADS && matchesFilter(row, "deleted")) {
        counts.deleted++;
      }
    }
    return { ...counts, cap: MAX_THREADS };
  },
});
