import {
  internalQuery,
  internalMutation,
  internalAction,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { decryptCredentials } from "./lib/crypto";
import {
  getMetaGraphVersion,
  buildPrivateReplyUrl,
  buildCommentRepliesUrl,
  extractGraphApiError,
} from "./lib/instagramApi";
import { nextRetryDelayMs, composeDmMessage } from "./lib/orMessage";

type SendContextData = {
  status: "pending" | "sent" | "failed" | "skipped_no_match" | "skipped_window";
  attempts: number;
  createdAt: number;
  commentId: string;
  workspaceId: Id<"workspaces">;
  date: string;
  automation: {
    dmMessage: string;
    linkUrl?: string;
    linkLabel?: string;
    publicReplyEnabled: boolean;
    publicReplyMessage?: string;
  };
  igUserId: string;
  encryptedCredentials: string;
} | null;

/**
 * Loads all context needed to execute an Instagram DM send:
 * the log row, its target automation, and the workspace's Instagram credentials.
 */
export const loadSendContext = internalQuery({
  args: {
    dmLogId: v.id("orDmLogs"),
  },
  returns: v.union(
    v.null(),
    v.object({
      status: v.union(
        v.literal("pending"),
        v.literal("sent"),
        v.literal("failed"),
        v.literal("skipped_no_match"),
        v.literal("skipped_window"),
      ),
      attempts: v.number(),
      createdAt: v.number(),
      commentId: v.string(),
      workspaceId: v.id("workspaces"),
      date: v.string(),
      automation: v.object({
        dmMessage: v.string(),
        linkUrl: v.optional(v.string()),
        linkLabel: v.optional(v.string()),
        publicReplyEnabled: v.boolean(),
        publicReplyMessage: v.optional(v.string()),
      }),
      igUserId: v.string(),
      encryptedCredentials: v.string(),
    }),
  ),
  handler: async (ctx, args): Promise<SendContextData> => {
    const log = await ctx.db.get(args.dmLogId);
    if (log === null || log.automationId === undefined) {
      return null;
    }

    const automation = await ctx.db.get(log.automationId);
    if (automation === null) {
      return null;
    }

    const igConn = await ctx.db
      .query("connections")
      .withIndex("by_workspace_provider", (q) =>
        q.eq("workspaceId", log.workspaceId).eq("provider", "meta_ig"),
      )
      .first();

    if (
      igConn === null ||
      igConn.externalId === undefined ||
      igConn.externalId.length === 0
    ) {
      return null;
    }

    return {
      status: log.status,
      attempts: log.attempts,
      createdAt: log.createdAt,
      commentId: log.commentId,
      workspaceId: log.workspaceId,
      date: log.date,
      automation: {
        dmMessage: automation.dmMessage,
        linkUrl: automation.linkUrl,
        linkLabel: automation.linkLabel,
        publicReplyEnabled: automation.publicReplyEnabled,
        publicReplyMessage: automation.publicReplyMessage,
      },
      igUserId: igConn.externalId,
      encryptedCredentials: igConn.encryptedCredentials,
    };
  },
});

/**
 * Updates the DM log row status and schedules rollup recomputations when complete.
 */
export const applyResult = internalMutation({
  args: {
    dmLogId: v.id("orDmLogs"),
    status: v.union(
      v.literal("sent"),
      v.literal("failed"),
      v.literal("skipped_window"),
      v.literal("pending"),
    ),
    attempts: v.number(),
    errorMessage: v.optional(v.string()),
    dmSentAt: v.optional(v.number()),
    publicReplySentAt: v.optional(v.number()),
    publicReplyError: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const log = await ctx.db.get(args.dmLogId);
    if (log === null) {
      return null;
    }

    const patch: {
      status: "sent" | "failed" | "skipped_window" | "pending";
      attempts: number;
      errorMessage?: string;
      dmSentAt?: number;
      publicReplySentAt?: number;
      publicReplyError?: string;
    } = {
      status: args.status,
      attempts: args.attempts,
    };

    if (args.errorMessage !== undefined) {
      patch.errorMessage = args.errorMessage;
    }
    if (args.dmSentAt !== undefined) {
      patch.dmSentAt = args.dmSentAt;
    }
    if (args.publicReplySentAt !== undefined) {
      patch.publicReplySentAt = args.publicReplySentAt;
    }
    if (args.publicReplyError !== undefined) {
      patch.publicReplyError = args.publicReplyError;
    }

    await ctx.db.patch(args.dmLogId, patch);

    if (args.status === "sent" || args.status === "failed") {
      await ctx.runMutation(internal.orRollup.recompute, {
        workspaceId: log.workspaceId,
        date: log.date,
        automationId: log.automationId,
      });
    }

    return null;
  },
});

/**
 * Internal Action: Send Instagram private reply (DM) with retry backoff and
 * optional public comment reply.
 */
export const sendDm = internalAction({
  args: {
    dmLogId: v.id("orDmLogs"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // 1. loadSendContext; null -> return.
    const context: SendContextData = await ctx.runQuery(
      internal.orSend.loadSendContext,
      { dmLogId: args.dmLogId },
    );
    if (context === null) {
      return null;
    }

    // 2. If status !== "pending" -> return (idempotent against double-scheduling).
    if (context.status !== "pending") {
      return null;
    }

    // 3. If Date.now() - createdAt > 7 * 24 * 60 * 60 * 1000 -> applyResult with
    // status "skipped_window", attempts unchanged, errorMessage "Prošlo je više od 7 dana od komentara." -> return.
    if (Date.now() - context.createdAt > 7 * 24 * 60 * 60 * 1000) {
      await ctx.runMutation(internal.orSend.applyResult, {
        dmLogId: args.dmLogId,
        status: "skipped_window",
        attempts: context.attempts,
        errorMessage: "Prošlo je više od 7 dana od komentara.",
      });
      return null;
    }

    // 4. const attempts = ctx.attempts + 1 (the attempt we are about to make).
    const attempts = context.attempts + 1;

    // 5. Decrypt the token with decryptCredentials. On failure -> applyResult
    // "failed" with errorMessage "Neuspela dekripcija Instagram tokena." -> return.
    let token: string;
    try {
      token = await decryptCredentials(context.encryptedCredentials);
    } catch {
      await ctx.runMutation(internal.orSend.applyResult, {
        dmLogId: args.dmLogId,
        status: "failed",
        attempts,
        errorMessage: "Neuspela dekripcija Instagram tokena.",
      });
      return null;
    }

    const version = getMetaGraphVersion();

    const handleDmFailure = async (errorMsg: string) => {
      const truncatedError = errorMsg.slice(0, 300);
      if (attempts >= 3) {
        await ctx.runMutation(internal.orSend.applyResult, {
          dmLogId: args.dmLogId,
          status: "failed",
          attempts,
          errorMessage: truncatedError,
        });
      } else {
        await ctx.runMutation(internal.orSend.applyResult, {
          dmLogId: args.dmLogId,
          status: "pending",
          attempts,
          errorMessage: truncatedError,
        });
        await ctx.scheduler.runAfter(
          nextRetryDelayMs(context.attempts),
          internal.orSend.sendDm,
          { dmLogId: args.dmLogId },
        );
      }
      return null;
    };

    // 6. POST the private reply to buildPrivateReplyUrl(igUserId, version)
    try {
      const privateReplyUrl = buildPrivateReplyUrl(context.igUserId, version);
      const text = composeDmMessage(
        context.automation.dmMessage,
        context.automation.linkUrl,
        context.automation.linkLabel,
      );

      const res = await fetch(privateReplyUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipient: {
            comment_id: context.commentId,
          },
          message: {
            text,
          },
        }),
      });

      // 7. On a non-ok response: read the body text, run it through extractGraphApiError.
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        const extracted = extractGraphApiError(errText);
        return await handleDmFailure(extracted);
      }
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : String(err);
      const extracted = extractGraphApiError(rawMsg);
      return await handleDmFailure(extracted);
    }

    // 8. On success: if publicReplyEnabled and publicReplyMessage is a
    // non-empty string, POST the public reply in its own try/catch and capture
    // either publicReplySentAt: Date.now() or a truncated publicReplyError.
    let publicReplySentAt: number | undefined;
    let publicReplyError: string | undefined;

    if (
      context.automation.publicReplyEnabled &&
      typeof context.automation.publicReplyMessage === "string" &&
      context.automation.publicReplyMessage.trim().length > 0
    ) {
      try {
        const replyUrl = buildCommentRepliesUrl(context.commentId, version);
        const replyRes = await fetch(replyUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: context.automation.publicReplyMessage.trim(),
          }),
        });

        if (replyRes.ok) {
          publicReplySentAt = Date.now();
        } else {
          const errText = await replyRes.text().catch(() => "");
          publicReplyError = extractGraphApiError(errText).slice(0, 300);
        }
      } catch (err) {
        const rawMsg = err instanceof Error ? err.message : String(err);
        publicReplyError = extractGraphApiError(rawMsg).slice(0, 300);
      }
    }

    // 9. applyResult with status "sent", attempts, dmSentAt: Date.now(), plus
    // whichever public-reply field applies.
    await ctx.runMutation(internal.orSend.applyResult, {
      dmLogId: args.dmLogId,
      status: "sent",
      attempts,
      dmSentAt: Date.now(),
      publicReplySentAt,
      publicReplyError,
    });

    return null;
  },
});
