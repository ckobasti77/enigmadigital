import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { decryptCredentials } from "./lib/crypto";
import { nextRetryDelayMs } from "./lib/orMessage";
import {
  COMMENT_TEXT_MAX,
  buildCommentsDeleteUrl,
  buildCommentsInsertUrl,
  buildSetModerationStatusUrl,
  extractYouTubeApiError,
  fetchAccessToken,
  parseYouTubeCredentials,
  youtubeApiErrorReason,
} from "./lib/youtubeApi";
import {
  QUOTA_COST,
  QUOTA_EXHAUSTED_MESSAGE,
  canAfford,
  remainingUnits,
} from "./lib/ytQuota";

/**
 * YouTube reply / moderation engine (Y4) — the cousin of orSend.ts.
 *
 * Same shape: load one row's whole context in a single query, act once, write
 * the outcome back through `applyResult`, retry with the shared backoff. What
 * differs is the act. YouTube has no direct messages, so the automation's
 * message goes out as a PUBLIC reply on the comment, and the other half of the
 * job is moderating that comment.
 *
 * With both switched on, the reply is the retried main action and moderation
 * rides along once after it lands — the same division orSend makes between the
 * DM it retries and the public reply it attempts once. Re-posting a reply that
 * already went out would leave two identical comments under the video;
 * moderation is idempotent, so it is safe as the main action when an
 * automation only moderates.
 *
 * Every call here costs 50 quota units, so a retry re-checks the budget before
 * spending again, and a `quotaExceeded` from YouTube closes the engine for the
 * rest of the day instead of making the same doomed call for every queued row.
 *
 * Runs in the default V8 runtime: `fetch` plus `decryptCredentials` (Web
 * Crypto) work there, and nothing here needs Node.
 */

const MAX_ATTEMPTS = 3;

const statusValidator = v.union(
  v.literal("pending"),
  v.literal("replied"),
  v.literal("moderated"),
  v.literal("failed"),
  v.literal("skipped_no_match"),
  v.literal("skipped_quota"),
  v.literal("deleted"),
);

const moderationStatusValidator = v.union(
  v.literal("heldForReview"),
  v.literal("rejected"),
  v.literal("published"),
);

type LogStatus =
  | "pending"
  | "replied"
  | "moderated"
  | "failed"
  | "skipped_no_match"
  | "skipped_quota"
  | "deleted";

type ReplyContext = {
  status: LogStatus;
  attempts: number;
  workspaceId: Id<"workspaces">;
  commentId: string;
  automation: {
    isActive: boolean;
    replyEnabled: boolean;
    replyMessage?: string;
    moderationEnabled: boolean;
    moderationStatus?: "heldForReview" | "rejected" | "published";
    markAsSpam?: boolean;
    deleteEnabled?: boolean;
  } | null;
  encryptedCredentials: string;
} | null;

/**
 * Everything one send needs, in a single transaction: the log row, its
 * automation, and the workspace's YouTube credentials. A connection that is
 * missing or no longer active means the engine is off — nothing goes out.
 */
export const loadReplyContext = internalQuery({
  args: { commentLogId: v.id("ytCommentLogs") },
  returns: v.union(
    v.null(),
    v.object({
      status: statusValidator,
      attempts: v.number(),
      workspaceId: v.id("workspaces"),
      commentId: v.string(),
      automation: v.union(
        v.null(),
        v.object({
          isActive: v.boolean(),
          replyEnabled: v.boolean(),
          replyMessage: v.optional(v.string()),
          moderationEnabled: v.boolean(),
          moderationStatus: v.optional(moderationStatusValidator),
          markAsSpam: v.optional(v.boolean()),
          deleteEnabled: v.optional(v.boolean()),
        }),
      ),
      encryptedCredentials: v.string(),
    }),
  ),
  handler: async (ctx, { commentLogId }) => {
    const log = await ctx.db.get(commentLogId);
    if (log === null || log.automationId === undefined) return null;

    const conn = await ctx.db
      .query("connections")
      .withIndex("by_workspace_provider", (q) =>
        q.eq("workspaceId", log.workspaceId).eq("provider", "youtube"),
      )
      .first();
    if (conn === null || conn.status !== "active") return null;

    const automation = await ctx.db.get(log.automationId);

    return {
      status: log.status,
      attempts: log.attempts,
      workspaceId: log.workspaceId,
      commentId: log.commentId,
      automation:
        automation === null
          ? null
          : {
              isActive: automation.isActive,
              replyEnabled: automation.replyEnabled,
              replyMessage: automation.replyMessage,
              moderationEnabled: automation.moderationEnabled,
              moderationStatus: automation.moderationStatus,
              markAsSpam: automation.markAsSpam,
              deleteEnabled: automation.deleteEnabled,
            },
      encryptedCredentials: conn.encryptedCredentials,
    };
  },
});

/** Write one send's outcome back onto the log row. */
export const applyResult = internalMutation({
  args: {
    commentLogId: v.id("ytCommentLogs"),
    status: statusValidator,
    attempts: v.number(),
    errorMessage: v.optional(v.string()),
    repliedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const log = await ctx.db.get(args.commentLogId);
    if (log === null) return null;

    await ctx.db.patch(args.commentLogId, {
      status: args.status,
      attempts: args.attempts,
      ...(args.errorMessage !== undefined
        ? { errorMessage: args.errorMessage }
        : {}),
      ...(args.repliedAt !== undefined ? { repliedAt: args.repliedAt } : {}),
      ...(args.deletedAt !== undefined ? { deletedAt: args.deletedAt } : {}),
    });
    return null;
  },
});

type PostOutcome =
  | { ok: true }
  | { ok: false; error: string; quotaExceeded: boolean };

/**
 * One authorised call to a YouTube endpoint; never logs the token.
 *
 * `okStatuses` lets a caller declare a failure it considers done: a DELETE
 * answering 404 means the comment is already gone, which is the outcome that
 * was asked for.
 */
async function ytCall(
  url: string,
  token: string,
  init?: { method?: string; body?: unknown; okStatuses?: number[] },
): Promise<PostOutcome> {
  const body = init?.body;
  try {
    const res = await fetch(url, {
      method: init?.method ?? "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (res.ok || (init?.okStatuses ?? []).includes(res.status)) {
      return { ok: true };
    }

    const text = await res.text().catch(() => "");
    return {
      ok: false,
      error: extractYouTubeApiError(text),
      quotaExceeded:
        res.status === 403 && youtubeApiErrorReason(text) === "quotaExceeded",
    };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: extractYouTubeApiError(raw),
      quotaExceeded: false,
    };
  }
}

export const replyToComment = internalAction({
  args: { commentLogId: v.id("ytCommentLogs") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const context: ReplyContext = await ctx.runQuery(
      internal.ytReply.loadReplyContext,
      { commentLogId: args.commentLogId },
    );
    if (context === null) return null;

    // Idempotent against double-scheduling.
    if (context.status !== "pending") return null;

    const { workspaceId, commentId, automation } = context;
    const attempts = context.attempts + 1;

    const finish = async (fields: {
      status: LogStatus;
      errorMessage?: string;
      repliedAt?: number;
      deletedAt?: number;
    }): Promise<null> => {
      await ctx.runMutation(internal.ytReply.applyResult, {
        commentLogId: args.commentLogId,
        attempts,
        ...fields,
      });
      return null;
    };

    const handleFailure = async (errorMsg: string): Promise<null> => {
      const truncated = errorMsg.slice(0, 300);
      if (attempts >= MAX_ATTEMPTS) {
        return await finish({ status: "failed", errorMessage: truncated });
      }
      await finish({ status: "pending", errorMessage: truncated });
      await ctx.scheduler.runAfter(
        nextRetryDelayMs(context.attempts),
        internal.ytReply.replyToComment,
        { commentLogId: args.commentLogId },
      );
      return null;
    };

    // YouTube says the budget is gone, and YouTube is authoritative: our own
    // counter runs on a UTC day while the real quota resets at midnight
    // Pacific. Burn what is left of today's allowance so the rest of the queue
    // stops instead of making the same doomed call fifty times.
    const handleQuotaExceeded = async (): Promise<null> => {
      const unitsUsed: number = await ctx.runQuery(
        internal.ytIngest.loadQuotaUsage,
        { workspaceId },
      );
      await ctx.runMutation(internal.ytIngest.recordQuotaUsage, {
        workspaceId,
        units: remainingUnits(unitsUsed),
      });
      return await finish({
        status: "skipped_quota",
        errorMessage: QUOTA_EXHAUSTED_MESSAGE,
      });
    };

    // Paused or deleted between queueing and sending — in practice only on a
    // retry, where minutes have passed. That is a cancel, not a failure, and
    // saying so beats leaving the row "pending" forever.
    if (automation === null || !automation.isActive) {
      return await finish({
        status: "skipped_no_match",
        errorMessage: "Automatizacija je isključena ili obrisana pre slanja.",
      });
    }

    // What this attempt does. A reply with no text written is not a reply.
    const replyText = (automation.replyMessage ?? "").trim();
    const willReply = automation.replyEnabled && replyText.length > 0;
    const willDelete = automation.deleteEnabled === true;
    // Deleting the comment supersedes moderating it — there is nothing left to
    // hold for review once it is gone, and the 50 units that call costs would
    // buy nothing. ytIngest.automationQuotaCost reserves on the same rule.
    const moderationStatus =
      !willDelete && automation.moderationEnabled
        ? automation.moderationStatus
        : undefined;

    if (!willReply && !willDelete && moderationStatus === undefined) {
      return await finish({
        status: "skipped_no_match",
        errorMessage: "Automatizacija nema uključenu nijednu akciju.",
      });
    }

    // The retried action is whichever runs first: the reply if there is one,
    // otherwise the single side action. Every one of them costs 50.
    const mainCost = willReply
      ? QUOTA_COST.commentsInsert
      : willDelete
        ? QUOTA_COST.commentsDelete
        : QUOTA_COST.commentsSetModerationStatus;

    // Attempt 1 spends what ingest already reserved. A retry is a fresh 50
    // units, so it is checked and booked here before the call goes out.
    if (attempts > 1) {
      const unitsUsed: number = await ctx.runQuery(
        internal.ytIngest.loadQuotaUsage,
        { workspaceId },
      );
      if (!canAfford(unitsUsed, mainCost)) {
        return await finish({
          status: "skipped_quota",
          errorMessage: QUOTA_EXHAUSTED_MESSAGE,
        });
      }
      await ctx.runMutation(internal.ytIngest.recordQuotaUsage, {
        workspaceId,
        units: mainCost,
      });
    }

    let token: string;
    try {
      const creds = parseYouTubeCredentials(
        await decryptCredentials(context.encryptedCredentials),
      );
      token = await fetchAccessToken(creds);
    } catch (err) {
      return await handleFailure(
        err instanceof Error
          ? err.message
          : "Neuspela priprema YouTube kredencijala.",
      );
    }

    // ── main action: the public reply ────────────────────────────────────────
    if (willReply) {
      const result = await ytCall(buildCommentsInsertUrl(), token, {
        body: {
          snippet: {
            parentId: commentId,
            textOriginal: replyText.slice(0, COMMENT_TEXT_MAX),
          },
        },
      });
      if (!result.ok) {
        return result.quotaExceeded
          ? await handleQuotaExceeded()
          : await handleFailure(result.error);
      }
    }

    // ── side action: moderation ──────────────────────────────────────────────
    // Its cost was reserved together with the reply's. When a reply already
    // went out, a failure here is recorded but never retried — the retry would
    // re-post that reply.
    let moderationError: string | undefined;
    if (moderationStatus !== undefined) {
      const result = await ytCall(
        buildSetModerationStatusUrl({
          commentId,
          moderationStatus,
          banAuthor: automation.markAsSpam,
        }),
        token,
      );
      if (!result.ok) {
        if (!willReply) {
          // Nothing irreversible happened before it, so it may retry.
          return result.quotaExceeded
            ? await handleQuotaExceeded()
            : await handleFailure(result.error);
        }
        moderationError = result.error.slice(0, 200);
      }
    }

    // ── side action: deletion (Y7) ───────────────────────────────────────────
    // LAST, and that order is not cosmetic: comments.insert needs the parent
    // comment to exist, so deleting first would leave nothing to reply to.
    // A 404 counts as done — a retry of a delete that did land would see one,
    // and the comment being gone is what was asked for either way.
    let deleted = false;
    let deleteError: string | undefined;
    if (willDelete) {
      const result = await ytCall(buildCommentsDeleteUrl(commentId), token, {
        method: "DELETE",
        okStatuses: [404],
      });
      if (result.ok) {
        deleted = true;
      } else if (!willReply) {
        // The delete was this attempt's main action; nothing irreversible ran
        // before it, so it may retry.
        return result.quotaExceeded
          ? await handleQuotaExceeded()
          : await handleFailure(result.error);
      } else {
        deleteError = result.error.slice(0, 200);
      }
    }

    const sideError =
      moderationError !== undefined
        ? `Odgovor je poslat, moderacija nije: ${moderationError}`
        : deleteError !== undefined
          ? `Odgovor je poslat, komentar nije obrisan: ${deleteError}`
          : undefined;

    const now = Date.now();
    return await finish({
      status: deleted ? "deleted" : willReply ? "replied" : "moderated",
      repliedAt: now,
      ...(deleted ? { deletedAt: now } : {}),
      ...(sideError !== undefined ? { errorMessage: sideError } : {}),
    });
  },
});
