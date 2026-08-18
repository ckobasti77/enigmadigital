import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { matchKeywords, utcDateKey } from "./lib/orMatch";

/**
 * OpenReply Ingest Mutation.
 * Receives comments dispatched from the Instagram webhook, matches them
 * against active automations, deduplicates, and logs to orDmLogs.
 */
export const ingestComment = internalMutation({
  args: {
    igUserId: v.string(),
    commentId: v.string(),
    mediaId: v.optional(v.string()),
    commenterId: v.string(),
    commenterUsername: v.optional(v.string()),
    text: v.string(),
  },
  returns: v.union(
    v.literal("ignored_no_workspace"),
    v.literal("ignored_engine_off"),
    v.literal("duplicate"),
    v.literal("no_match"),
    v.literal("queued"),
  ),
  handler: async (ctx, args) => {
    // 1. Find the meta_ig connection whose externalId === igUserId
    const igConnections = await ctx.db
      .query("connections")
      .withIndex("by_provider", (q) => q.eq("provider", "meta_ig"))
      .collect();

    const igConn = igConnections.find((c) => c.externalId === args.igUserId);
    if (!igConn) {
      return "ignored_no_workspace";
    }
    const workspaceId = igConn.workspaceId;

    // 2. Look up the openreply connection for that workspace
    const orConn = await ctx.db
      .query("connections")
      .withIndex("by_workspace_provider", (q) =>
        q.eq("workspaceId", workspaceId).eq("provider", "openreply"),
      )
      .first();

    if (orConn === null || orConn.status !== "active") {
      return "ignored_engine_off";
    }

    // 3. Dedup: query orProcessedComments by workspaceId + commentId
    const existing = await ctx.db
      .query("orProcessedComments")
      .withIndex("by_workspace_comment", (q) =>
        q.eq("workspaceId", workspaceId).eq("commentId", args.commentId),
      )
      .first();

    if (existing !== null) {
      return "duplicate";
    }

    const now = Date.now();
    await ctx.db.insert("orProcessedComments", {
      workspaceId,
      commentId: args.commentId,
      processedAt: now,
    });

    // 4. Load active automations for the workspace
    const automations = await ctx.db
      .query("orAutomations")
      .withIndex("by_workspace_active", (q) =>
        q.eq("workspaceId", workspaceId).eq("isActive", true),
      )
      .collect();

    // 5. Pick the first automation that matches BOTH post scope and keywords
    let matchedAutomation: Doc<"orAutomations"> | null = null;
    let matchedKeyword: string | null = null;

    for (const a of automations) {
      const postMatches =
        a.matchAnyPost === true ||
        (a.postId !== undefined &&
          args.mediaId !== undefined &&
          a.postId === args.mediaId);

      if (!postMatches) continue;

      const kw = matchKeywords(args.text, a.keywords, {
        matchAnyWord: a.matchAnyWord,
        wholeWordMatch: a.wholeWordMatch,
      });

      if (kw !== null) {
        matchedAutomation = a;
        matchedKeyword = kw;
        break;
      }
    }

    const date = utcDateKey(now);

    // 6. If none matched: insert an orDmLogs row with status: "skipped_no_match"
    if (matchedAutomation === null || matchedKeyword === null) {
      await ctx.db.insert("orDmLogs", {
        workspaceId,
        commentId: args.commentId,
        mediaId: args.mediaId,
        commenterId: args.commenterId,
        commenterUsername: args.commenterUsername,
        commentText: args.text,
        status: "skipped_no_match",
        attempts: 0,
        date,
        createdAt: now,
      });
      return "no_match";
    }

    // 7. If one matched: insert an orDmLogs row with status: "pending"
    const dmLogId = await ctx.db.insert("orDmLogs", {
      workspaceId,
      automationId: matchedAutomation._id,
      commentId: args.commentId,
      mediaId: args.mediaId,
      commenterId: args.commenterId,
      commenterUsername: args.commenterUsername,
      commentText: args.text,
      matchedKeyword,
      status: "pending",
      attempts: 0,
      date,
      createdAt: now,
    });

    await ctx.scheduler.runAfter(0, internal.orSend.sendDm, { dmLogId });

    return "queued";
  },
});
