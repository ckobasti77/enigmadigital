import {
  internalQuery,
  internalMutation,
  internalAction,
} from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { decryptCredentials } from "./lib/crypto";
import {
  getMetaGraphVersion,
  buildPrivateReplyUrl,
  buildSendMessageUrl,
  buildCommentRepliesUrl,
  buildUserProfileUrl,
  extractGraphApiError,
} from "./lib/instagramApi";
import {
  nextRetryDelayMs,
  composeDmMessage,
  isWithinMessagingWindow,
  MESSAGING_WINDOW_EXPIRED_MESSAGE,
} from "./lib/orMessage";
import { followUpDelayMs } from "./lib/orFollowUp";
import { utcDateKey } from "./lib/orMatch";
import {
  buildOutgoingMessage,
  buildFollowPayload,
  MESSAGE_TEXT_MAX,
  TEMPLATE_TEXT_MAX,
  type OutgoingButton,
  type OutgoingQuickReply,
} from "./lib/orButtons";
import {
  extractFollowState,
  isFollowStateFresh,
  FOLLOW_PROMPT_MESSAGE_DEFAULT,
  FOLLOW_PROMPT_BUTTON_LABEL_DEFAULT,
} from "./lib/orFollow";

type SendContextData = {
  status:
    | "pending"
    | "sent"
    | "failed"
    | "skipped_no_match"
    | "skipped_window"
    | "awaiting_follow";
  attempts: number;
  createdAt: number;
  source: "comment" | "dm" | "postback";
  /** "followup" is the delayed second message; it never schedules a third. */
  kind: "primary" | "followup";
  commentId: string;
  /** IGSID to message directly. Set for everything except a private reply. */
  recipientIgsid?: string;
  /** Who this is about, on every path — the follow gate asks about them. */
  commenterIgsid: string;
  /** Button reply that overrides the automation's `dmMessage` for this row. */
  replyMessage?: string;
  /** This row came from a tap on the follow gate — check live, not cached. */
  followRecheck?: boolean;
  workspaceId: Id<"workspaces">;
  automationId: Id<"orAutomations">;
  date: string;
  automation: {
    dmMessage: string;
    linkUrl?: string;
    linkLabel?: string;
    publicReplyEnabled: boolean;
    publicReplyMessage?: string;
    buttons: OutgoingButton[];
    quickReplies: OutgoingQuickReply[];
    requireFollow: boolean;
    followPromptMessage: string;
    followPromptButtonLabel: string;
    followUpEnabled: boolean;
    followUpMessage?: string;
    followUpDelayMinutes?: number;
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
        v.literal("awaiting_follow"),
      ),
      attempts: v.number(),
      createdAt: v.number(),
      source: v.union(
        v.literal("comment"),
        v.literal("dm"),
        v.literal("postback"),
      ),
      kind: v.union(v.literal("primary"), v.literal("followup")),
      commentId: v.string(),
      recipientIgsid: v.optional(v.string()),
      commenterIgsid: v.string(),
      replyMessage: v.optional(v.string()),
      followRecheck: v.optional(v.boolean()),
      workspaceId: v.id("workspaces"),
      automationId: v.id("orAutomations"),
      date: v.string(),
      automation: v.object({
        dmMessage: v.string(),
        linkUrl: v.optional(v.string()),
        linkLabel: v.optional(v.string()),
        publicReplyEnabled: v.boolean(),
        publicReplyMessage: v.optional(v.string()),
        buttons: v.array(
          v.object({
            label: v.string(),
            type: v.union(v.literal("url"), v.literal("postback")),
            url: v.optional(v.string()),
            payload: v.optional(v.string()),
          }),
        ),
        quickReplies: v.array(
          v.object({
            label: v.string(),
            payload: v.optional(v.string()),
          }),
        ),
        requireFollow: v.boolean(),
        followPromptMessage: v.string(),
        followPromptButtonLabel: v.string(),
        followUpEnabled: v.boolean(),
        followUpMessage: v.optional(v.string()),
        followUpDelayMinutes: v.optional(v.number()),
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

    // A row written before DM support carries no source and is a comment.
    const source = log.source ?? "comment";

    return {
      status: log.status,
      attempts: log.attempts,
      createdAt: log.createdAt,
      source,
      // A row written before follow-ups existed answers the trigger itself.
      kind: log.kind ?? "primary",
      commentId: log.commentId,
      // Only a private reply addresses a comment; everything else goes straight
      // to the person's IGSID.
      recipientIgsid: source === "comment" ? undefined : log.commenterId,
      commenterIgsid: log.commenterId,
      replyMessage: log.replyMessage,
      followRecheck: log.followRecheck,
      workspaceId: log.workspaceId,
      automationId: log.automationId,
      date: log.date,
      automation: {
        dmMessage: automation.dmMessage,
        linkUrl: automation.linkUrl,
        linkLabel: automation.linkLabel,
        publicReplyEnabled: automation.publicReplyEnabled,
        publicReplyMessage: automation.publicReplyMessage,
        buttons: (automation.buttons ?? []).map((button) => ({
          label: button.label,
          type: button.type,
          url: button.url,
          payload: button.payload,
        })),
        quickReplies: (automation.quickReplies ?? []).map((quickReply) => ({
          label: quickReply.label,
          payload: quickReply.payload,
        })),
        // Both texts are optional on the row; the gate is switched on with one
        // flag and works out of the box on the defaults.
        requireFollow: automation.requireFollow ?? false,
        followPromptMessage:
          automation.followPromptMessage?.trim() ||
          FOLLOW_PROMPT_MESSAGE_DEFAULT,
        followPromptButtonLabel:
          automation.followPromptButtonLabel?.trim() ||
          FOLLOW_PROMPT_BUTTON_LABEL_DEFAULT,
        followUpEnabled: automation.followUpEnabled ?? false,
        followUpMessage: automation.followUpMessage,
        followUpDelayMinutes: automation.followUpDelayMinutes,
      },
      igUserId: igConn.externalId,
      encryptedCredentials: igConn.encryptedCredentials,
    };
  },
});

/**
 * Timestamp of the last message this person sent us, or null when we have
 * never heard from them. Instagram only allows a reply within 24h of it.
 */
export const loadMessagingWindow = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    igsid: v.string(),
  },
  returns: v.union(v.number(), v.null()),
  handler: async (ctx, args) => {
    const conversation = await ctx.db
      .query("orConversations")
      .withIndex("by_workspace_igsid", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("igsid", args.igsid),
      )
      .first();

    return conversation?.lastUserMessageAt ?? null;
  },
});

/**
 * Last answer the follow gate got for this person, when we have one. Null when
 * we have never asked — or when there is no conversation row at all, which is
 * the normal case for a commenter who has never written to the account.
 */
export const loadFollowState = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    igsid: v.string(),
  },
  returns: v.union(
    v.null(),
    v.object({
      followsBusiness: v.optional(v.boolean()),
      followCheckedAt: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    const conversation = await ctx.db
      .query("orConversations")
      .withIndex("by_workspace_igsid", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("igsid", args.igsid),
      )
      .first();

    if (conversation === null) {
      return null;
    }
    return {
      followsBusiness: conversation.followsBusiness,
      followCheckedAt: conversation.followCheckedAt,
    };
  },
});

/**
 * Cache what Instagram just said about this person.
 *
 * Patches an existing conversation and inserts nothing: a row here means
 * consent and an open messaging window, and a commenter who has never written
 * has neither. Their gate answer is simply re-fetched next time.
 */
export const recordFollowState = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    igsid: v.string(),
    followsBusiness: v.boolean(),
    username: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const conversation = await ctx.db
      .query("orConversations")
      .withIndex("by_workspace_igsid", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("igsid", args.igsid),
      )
      .first();

    if (conversation === null) {
      return null;
    }

    await ctx.db.patch(conversation._id, {
      followsBusiness: args.followsBusiness,
      followCheckedAt: Date.now(),
      ...(args.username !== undefined && conversation.username === undefined
        ? { username: args.username }
        : {}),
    });
    return null;
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
      v.literal("awaiting_follow"),
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
      status:
        "sent" | "failed" | "skipped_window" | "pending" | "awaiting_follow";
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

    // Keep both sides of the thread on the conversation row. Only meaningful
    // for a message sent into a thread — a private reply to a comment opens none.
    // The gate's prompt counts: it is a message we put in that thread.
    if (
      (args.status === "sent" || args.status === "awaiting_follow") &&
      (log.source === "dm" || log.source === "postback")
    ) {
      const conversation = await ctx.db
        .query("orConversations")
        .withIndex("by_workspace_igsid", (q) =>
          q.eq("workspaceId", log.workspaceId).eq("igsid", log.commenterId),
        )
        .first();

      if (conversation !== null) {
        await ctx.db.patch(conversation._id, { lastBotMessageAt: Date.now() });
      }
    }

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
 * Does this person follow the account?
 *
 * `null` means Instagram did not say — no conversation to read the profile
 * from, a missing permission, a rate limit. Every caller treats null as "send
 * the real message": a gate that cannot verify must not hold the lead hostage,
 * and the alternative is a "zaprati" prompt that can never be satisfied.
 *
 * A fresh cached answer is reused (lib/orFollow.ts); a tap on the gate button
 * forces the live call, because that tap is the claim that it just changed.
 */
async function resolveFollowsBusiness(
  ctx: ActionCtx,
  params: {
    workspaceId: Id<"workspaces">;
    igsid: string;
    token: string;
    version: string;
    force: boolean;
  },
): Promise<boolean | null> {
  if (!params.force) {
    // Annotated because this helper is part of the same module the internal
    // API is generated from — inference would go in a circle.
    const cached: {
      followsBusiness?: boolean;
      followCheckedAt?: number;
    } | null = await ctx.runQuery(internal.orSend.loadFollowState, {
      workspaceId: params.workspaceId,
      igsid: params.igsid,
    });
    if (
      cached !== null &&
      cached.followsBusiness !== undefined &&
      isFollowStateFresh(cached.followCheckedAt, Date.now())
    ) {
      return cached.followsBusiness;
    }
  }

  let body: unknown;
  try {
    const res = await fetch(buildUserProfileUrl(params.igsid, params.version), {
      headers: { Authorization: `Bearer ${params.token}` },
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn(
        "OpenReply: provera praćenja nije uspela —",
        extractGraphApiError(errText),
      );
      return null;
    }
    body = (await res.json()) as unknown;
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    console.warn(
      "OpenReply: provera praćenja nije uspela —",
      extractGraphApiError(rawMsg),
    );
    return null;
  }

  const { follows, username } = extractFollowState(body);
  if (follows === null) {
    return null;
  }

  await ctx.runMutation(internal.orSend.recordFollowState, {
    workspaceId: params.workspaceId,
    igsid: params.igsid,
    followsBusiness: follows,
    username,
  });
  return follows;
}

/**
 * Internal Action: Send Instagram private reply (DM) with retry backoff and
 * optional public comment reply.
 */
export const sendDm = internalAction({
  args: {
    dmLogId: v.id("orDmLogs"),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
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

    // 3. Window guard. A private reply to a comment has 7 days from the
    // comment; a DM reply — including the answer to a button tap — has 24h from
    // the user's last message or tap, counted from the conversation row, not
    // from the log. Meta's hard rule.
    const directRecipient =
      context.source === "comment" ? undefined : context.recipientIgsid;

    if (context.source !== "comment") {
      const lastUserMessageAt: number | null =
        directRecipient === undefined
          ? null
          : await ctx.runQuery(internal.orSend.loadMessagingWindow, {
              workspaceId: context.workspaceId,
              igsid: directRecipient,
            });

      if (!isWithinMessagingWindow(lastUserMessageAt, Date.now())) {
        await ctx.runMutation(internal.orSend.applyResult, {
          dmLogId: args.dmLogId,
          status: "skipped_window",
          attempts: context.attempts,
          errorMessage: MESSAGING_WINDOW_EXPIRED_MESSAGE,
        });
        return null;
      }
    } else if (Date.now() - context.createdAt > 7 * 24 * 60 * 60 * 1000) {
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

    // 5b. Swap the automation's raw link for a tracked short link on our own
    // domain, so the click is logged and the UTM tags ride into GA4. Returns
    // null when there is no link or no configured short-link origin — in both
    // cases we fall back to whatever the automation holds.
    let linkUrl = context.automation.linkUrl;
    if (typeof linkUrl === "string" && linkUrl.trim().length > 0) {
      const shortUrl: string | null = await ctx.runMutation(
        internal.orLinks.ensureTrackedLink,
        {
          workspaceId: context.workspaceId,
          automationId: context.automationId,
        },
      );
      if (shortUrl !== null) {
        linkUrl = shortUrl;
      }
    }

    const handleDmFailure = async (errorMsg: string): Promise<null> => {
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

    // The visible half of a comment automation. It belongs to the comment, not
    // to the payload, so it fires whenever a DM actually left — the gate's
    // prompt included, and exactly once either way: the tap that follows is a
    // "postback" row with no comment behind it.
    const postPublicReply = async (): Promise<{
      publicReplySentAt?: number;
      publicReplyError?: string;
    }> => {
      if (
        // A DM-sourced log has a message id where the comment id would be —
        // there is nothing public to reply to.
        context.source !== "comment" ||
        !context.automation.publicReplyEnabled ||
        typeof context.automation.publicReplyMessage !== "string" ||
        context.automation.publicReplyMessage.trim().length === 0
      ) {
        return {};
      }

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
          return { publicReplySentAt: Date.now() };
        }
        const errText = await replyRes.text().catch(() => "");
        return {
          publicReplyError: extractGraphApiError(errText).slice(0, 300),
        };
      } catch (err) {
        const rawMsg = err instanceof Error ? err.message : String(err);
        return { publicReplyError: extractGraphApiError(rawMsg).slice(0, 300) };
      }
    };

    const sendUrl =
      directRecipient !== undefined
        ? buildSendMessageUrl(context.igUserId, version)
        : buildPrivateReplyUrl(context.igUserId, version);
    const recipient =
      directRecipient !== undefined
        ? { id: directRecipient }
        : { comment_id: context.commentId };

    // 5c. The follow gate. Someone who does not follow gets the prompt and one
    // button instead of the payload; the tap comes back as a postback and
    // queues a fresh row (orIngest.ingestButtonTap), which is where
    // `followRecheck` comes from.
    //
    // It guards the automation's own message only. A row carrying a
    // `replyMessage` is the answer to a button tapped inside a conversation
    // that was already let through — gating the middle of a flow would ask
    // someone to follow in order to read the reply to their own tap.
    if (
      context.automation.requireFollow &&
      context.replyMessage === undefined
    ) {
      const follows = await resolveFollowsBusiness(ctx, {
        workspaceId: context.workspaceId,
        igsid: context.commenterIgsid,
        token,
        version,
        force: context.followRecheck === true,
      });

      if (follows === false) {
        try {
          const res = await fetch(sendUrl, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              recipient,
              message: buildOutgoingMessage({
                text: context.automation.followPromptMessage,
                buttons: [
                  {
                    label: context.automation.followPromptButtonLabel,
                    type: "postback",
                    payload: buildFollowPayload(context.automationId),
                  },
                ],
              }),
            }),
          });

          if (!res.ok) {
            const errText = await res.text().catch(() => "");
            return await handleDmFailure(extractGraphApiError(errText));
          }
        } catch (err) {
          const rawMsg = err instanceof Error ? err.message : String(err);
          return await handleDmFailure(extractGraphApiError(rawMsg));
        }

        // Not "sent": the payload never left. The row the tap creates is the
        // one that counts as a delivered DM.
        await ctx.runMutation(internal.orSend.applyResult, {
          dmLogId: args.dmLogId,
          status: "awaiting_follow",
          attempts,
          ...(await postPublicReply()),
        });
        return null;
      }
    }

    // 5d. Answering a tap is the last step of the flow: it sends the reply
    // written on that button and carries no buttons of its own, so tapping can
    // never loop back into the same message.
    const isButtonReply = context.replyMessage !== undefined;
    const buttons = isButtonReply ? [] : context.automation.buttons;
    const quickReplies = isButtonReply ? [] : context.automation.quickReplies;

    // A url button already carries the link, so printing it again right above
    // the button would only repeat it.
    const linkOnButton = buttons.some(
      (button) =>
        button.type === "url" && button.url === context.automation.linkUrl,
    );
    const linkText = linkOnButton ? undefined : linkUrl;

    // A button template's text field is shorter than a plain DM. Measure the
    // link block first and clamp the base message around it, so a message that
    // runs long loses its own tail rather than half of the URL.
    const linkBlock = composeDmMessage(
      "",
      linkText,
      context.automation.linkLabel,
    );
    const baseTextMax = Math.max(
      0,
      (buttons.length > 0 ? TEMPLATE_TEXT_MAX : MESSAGE_TEXT_MAX) -
        linkBlock.length,
    );

    // 6. POST the message. Both paths hit /{igUserId}/messages; what differs
    // is the recipient — the sender's IGSID for a DM reply, the comment id for
    // a private reply.
    try {
      const text = composeDmMessage(
        (context.replyMessage ?? context.automation.dmMessage).slice(
          0,
          baseTextMax,
        ),
        linkText,
        context.automation.linkLabel,
      );

      const res = await fetch(sendUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipient,
          message: buildOutgoingMessage({
            text,
            // A url button pointing at the automation's link gets the tracked
            // short link too, so a tap is counted like any other click.
            buttons: buttons.map((button) =>
              button.type === "url" && button.url === context.automation.linkUrl
                ? { ...button, url: linkUrl }
                : button,
            ),
            quickReplies,
          }),
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

    // 8-9. applyResult with status "sent", attempts, dmSentAt: Date.now(), plus
    // whichever public-reply field applies.
    await ctx.runMutation(internal.orSend.applyResult, {
      dmLogId: args.dmLogId,
      status: "sent",
      attempts,
      dmSentAt: Date.now(),
      ...(await postPublicReply()),
    });

    // 10. The delayed nudge. Scheduled only off a row that actually delivered
    // the automation's own message: a follow-up scheduling another one would
    // never stop, and a row carrying a `replyMessage` is the answer to a tap
    // inside a conversation the opening message already scheduled one for —
    // counting those would send the same nudge once per button tapped.
    // Everything is re-checked in `queueFollowUp`, because hours pass first.
    if (
      context.kind === "primary" &&
      context.replyMessage === undefined &&
      context.automation.followUpEnabled &&
      (context.automation.followUpMessage ?? "").trim().length > 0
    ) {
      await ctx.scheduler.runAfter(
        followUpDelayMs(context.automation.followUpDelayMinutes),
        internal.orSend.queueFollowUp,
        { dmLogId: args.dmLogId },
      );
    }

    return null;
  },
});

/**
 * Queue the follow-up for a DM that went out `followUpDelayMinutes` ago.
 *
 * Everything is re-read here rather than carried over from the send: hours
 * have passed, and in that time the automation may have been edited, paused or
 * deleted, and the 24h messaging window may have closed. Each of those is a
 * silent no-op — except the closed window, which is worth a log row: "sent
 * nothing because Instagram no longer allows it" is the one outcome the
 * operator has to be able to see.
 */
export const queueFollowUp = internalMutation({
  args: {
    dmLogId: v.id("orDmLogs"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const log = await ctx.db.get(args.dmLogId);
    if (log === null || log.automationId === undefined) {
      return null;
    }

    const automation = await ctx.db.get(log.automationId);
    if (
      automation === null ||
      !automation.isActive ||
      automation.followUpEnabled !== true
    ) {
      return null;
    }

    const followUpMessage = automation.followUpMessage?.trim();
    if (followUpMessage === undefined || followUpMessage.length === 0) {
      return null;
    }

    const now = Date.now();

    const conversation = await ctx.db
      .query("orConversations")
      .withIndex("by_workspace_igsid", (q) =>
        q.eq("workspaceId", log.workspaceId).eq("igsid", log.commenterId),
      )
      .first();

    const row = {
      workspaceId: log.workspaceId,
      automationId: log.automationId,
      // A follow-up goes into the thread the first message opened, so it is
      // addressed like a DM reply — never as a private reply to the comment,
      // which is a one-shot the follow-up is not entitled to.
      source: "dm" as const,
      kind: "followup" as const,
      // It has no inbound event of its own, so it borrows the original's ids
      // and text: the two rows read as one conversation.
      commentId: log.commentId,
      mediaId: log.mediaId,
      commenterId: log.commenterId,
      commenterUsername: log.commenterUsername,
      commentText: log.commentText,
      // The text this row sends instead of the automation's `dmMessage` — the
      // same mechanism a button reply uses, which is also what keeps buttons,
      // quick replies and the follow gate out of a follow-up.
      replyMessage: followUpMessage,
      attempts: 0,
      date: utcDateKey(now),
      createdAt: now,
    };

    // The clock runs from the person's last message, not from ours, so even a
    // delay well inside 23h can land outside the window.
    if (!isWithinMessagingWindow(conversation?.lastUserMessageAt, now)) {
      await ctx.db.insert("orDmLogs", {
        ...row,
        status: "skipped_window",
        errorMessage: MESSAGING_WINDOW_EXPIRED_MESSAGE,
      });
      return null;
    }

    const dmLogId = await ctx.db.insert("orDmLogs", {
      ...row,
      status: "pending",
    });

    await ctx.scheduler.runAfter(0, internal.orSend.sendDm, { dmLogId });
    return null;
  },
});
