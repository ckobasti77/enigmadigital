import { action, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v, ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { decryptCredentials } from "./lib/crypto";
import {
  buildCommentsDeleteUrl,
  fetchAccessToken,
  parseYouTubeCredentials,
} from "./lib/youtubeApi";
import {
  QUOTA_COST,
  QUOTA_MEDIA_EXHAUSTED_MESSAGE,
  canAffordMedia,
} from "./lib/ytQuota";
import { ytRequest } from "./ytMedia";
import type { MediaContext } from "./ytMedia";

/**
 * Deleting a comment by hand, from the comment log (Y7).
 *
 * This is harsher than the moderation the automations do. `setModerationStatus`
 * hides a comment and YouTube Studio can still show it; `comments.delete`
 * removes it, and nothing brings it back. So it costs the same 50 units but
 * gets a job row, a media-ceiling check, and a caller that had to confirm.
 *
 * The automation-driven version of the same act lives in ytReply.ts, where it
 * runs AFTER the reply — a reply needs its parent comment to still exist.
 */

function invalid(message: string): never {
  throw new ConvexError({ code: "invalid_argument", message });
}

/**
 * The log row this deletion belongs to, once it is confirmed to be the
 * caller's. An id from the client is never trusted to point at a row of this
 * workspace, so the check happens before anything is read off it.
 */
export const loadCommentLog = internalQuery({
  args: { workspaceId: v.id("workspaces"), logId: v.id("ytCommentLogs") },
  returns: v.union(
    v.null(),
    v.object({
      commentId: v.string(),
      videoId: v.string(),
      videoTitle: v.union(v.string(), v.null()),
      deletedAt: v.union(v.number(), v.null()),
    }),
  ),
  handler: async (ctx, { workspaceId, logId }) => {
    const log = await ctx.db.get(logId);
    if (log === null || log.workspaceId !== workspaceId) return null;
    return {
      commentId: log.commentId,
      videoId: log.videoId,
      videoTitle: log.videoTitle ?? null,
      deletedAt: log.deletedAt ?? null,
    };
  },
});

/**
 * Mark a log row as a comment that is gone.
 *
 * The status is left alone: a row that says "replied" earned that, and the
 * reply is part of the history even though the comment it answered no longer
 * exists. `deletedAt` is what the table renders as struck through.
 */
export const markCommentDeleted = internalMutation({
  args: { workspaceId: v.id("workspaces"), logId: v.id("ytCommentLogs") },
  returns: v.null(),
  handler: async (ctx, { workspaceId, logId }) => {
    const log = await ctx.db.get(logId);
    if (log === null || log.workspaceId !== workspaceId) return null;
    await ctx.db.patch(logId, { deletedAt: Date.now() });
    return null;
  },
});

/**
 * Delete one comment from YouTube — 50 units. NEPOVRATNO.
 *
 * `logId` is optional because the comment id is what YouTube needs; the log row
 * only exists when the deletion was started from the log table, and it is used
 * for the job's label and for striking the row through afterwards.
 */
export const deleteComment = action({
  args: {
    commentId: v.string(),
    logId: v.optional(v.id("ytCommentLogs")),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const commentId = args.commentId.trim();
    if (commentId.length === 0) invalid("Nedostaje ID komentara.");

    // Membership is checked inside; null means no active YouTube connection.
    const context: MediaContext = await ctx.runQuery(
      internal.ytMedia.loadMediaContext,
      {},
    );
    if (context === null) {
      invalid("Prvo poveži YouTube nalog u Podešavanjima.");
    }
    const { workspaceId } = context;

    // A log row from another workspace resolves to null and is then simply not
    // touched — the deletion itself still runs on the comment id given.
    const log =
      args.logId === undefined
        ? null
        : await ctx.runQuery(internal.ytComments.loadCommentLog, {
            workspaceId,
            logId: args.logId,
          });
    const logId: Id<"ytCommentLogs"> | null =
      log === null ? null : (args.logId ?? null);

    if (log !== null && log.deletedAt !== null) {
      invalid("Ovaj komentar je već obrisan.");
    }

    const jobId = await ctx.runMutation(internal.ytMedia.startJob, {
      workspaceId,
      kind: "comment_delete" as const,
      ...(log !== null && log.videoId.length > 0
        ? { videoId: log.videoId }
        : {}),
      ...(log !== null && log.videoTitle !== null
        ? { title: log.videoTitle }
        : {}),
    });

    if (!canAffordMedia(context.unitsUsed, QUOTA_COST.commentsDelete)) {
      await ctx.runMutation(internal.ytMedia.finishJob, {
        jobId,
        status: "skipped_quota" as const,
        unitsSpent: 0,
        errorMessage: QUOTA_MEDIA_EXHAUSTED_MESSAGE,
      });
      invalid(QUOTA_MEDIA_EXHAUSTED_MESSAGE);
    }

    let spent = 0;
    const failJob = async (message: string): Promise<never> => {
      await ctx.runMutation(internal.ytMedia.finishJob, {
        jobId,
        status: "failed" as const,
        unitsSpent: spent,
        errorMessage: message,
      });
      invalid(message);
    };

    let token: string;
    try {
      const creds = parseYouTubeCredentials(
        await decryptCredentials(context.encryptedCredentials),
      );
      token = await fetchAccessToken(creds);
    } catch (err) {
      return await failJob(
        err instanceof Error
          ? err.message
          : "Neuspela priprema YouTube kredencijala.",
      );
    }

    const res = await ytRequest(buildCommentsDeleteUrl(commentId), token, {
      method: "DELETE",
    });
    // Metered whether it succeeded or not, so it is booked either way.
    spent = QUOTA_COST.commentsDelete;
    await ctx.runMutation(internal.ytIngest.recordQuotaUsage, {
      workspaceId,
      units: spent,
    });

    // 404 means the comment is already gone — the desired end state, reached
    // by someone else. Recording it as a failure would invite a second try
    // that spends another 50 units on the same nothing.
    if (!res.ok && res.status !== 404) {
      if (res.status === 403) {
        return await failJob(
          "Nalog nema dozvolu da obriše ovaj komentar. Brisati se mogu komentari na sopstvenom kanalu.",
        );
      }
      return await failJob(`Brisanje komentara nije uspelo: ${res.body}`);
    }

    if (logId !== null) {
      await ctx.runMutation(internal.ytComments.markCommentDeleted, {
        workspaceId,
        logId,
      });
    }

    await ctx.runMutation(internal.ytMedia.finishJob, {
      jobId,
      status: "done" as const,
      unitsSpent: spent,
    });
    return null;
  },
});
