import {
  action,
  internalQuery,
  internalMutation,
  internalAction,
} from "./_generated/server";
import type { ActionCtx, QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { api, internal } from "./_generated/api";
import { v, ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireMembership } from "./lib/auth";
import { decryptCredentials } from "./lib/crypto";
import { createUsageTracker, type UsageTracker } from "./lib/metaRateLimit";
import {
  getMetaGraphVersion,
  buildPrivateReplyUrl,
  buildSendMessageUrl,
  buildCommentRepliesUrl,
  buildUserProfileUrl,
  extractGraphApiError,
} from "./lib/instagramApi";
import {
  buildPageMessagesUrl,
  buildCommentRepliesUrl as buildPageCommentRepliesUrl,
} from "./lib/facebookApi";
import {
  orPlatformValidator,
  platformProvider,
  resolvePlatform,
  type OrPlatform,
} from "./lib/orPlatform";
import {
  nextRetryDelayMs,
  composeDmMessage,
  isWithinMessagingWindow,
  isWithinPrivateReplyWindow,
  isWithinUtf8ByteLimit,
  MESSAGING_WINDOW_EXPIRED_MESSAGE,
  PRIVATE_REPLY_WINDOW_EXPIRED_MESSAGE,
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
  /** Which Meta platform this row belongs to. Undefined on the row = Instagram. */
  platform: OrPlatform;
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
  /** IG professional account id, or Page id — whichever platform this is. */
  accountId: string;
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
      platform: orPlatformValidator,
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
      accountId: v.string(),
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

    // The token to send with is the one belonging to THIS row's platform —
    // never "the Instagram one, and Facebook if that is missing". A Page token
    // used against graph.instagram.com does not fail loudly, it fails with an
    // error message about a node that does not exist.
    const platform = resolvePlatform(log.platform);

    const conn = await ctx.db
      .query("connections")
      .withIndex("by_workspace_provider", (q) =>
        q
          .eq("workspaceId", log.workspaceId)
          .eq("provider", platformProvider(platform)),
      )
      .first();

    if (
      conn === null ||
      conn.externalId === undefined ||
      conn.externalId.length === 0
    ) {
      return null;
    }

    // A row written before DM support carries no source and is a comment.
    const source = log.source ?? "comment";

    return {
      platform,
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
      accountId: conn.externalId,
      encryptedCredentials: conn.encryptedCredentials,
    };
  },
});

/**
 * The conversation row for one person on one platform.
 *
 * The index is still `[workspaceId, igsid]` and the platform is compared
 * afterwards, for the same reason the dedup lookups in orIngest.ts do it that
 * way: every row written before F5 carries no platform, and an indexed
 * equality test would silently stop finding any of them — which here would
 * read as "this person never wrote to us" and close a window that is open.
 */
async function findConversation(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
  platform: OrPlatform,
  igsid: string,
): Promise<Doc<"orConversations"> | null> {
  const rows = await ctx.db
    .query("orConversations")
    .withIndex("by_workspace_igsid", (q) =>
      q.eq("workspaceId", workspaceId).eq("igsid", igsid),
    )
    .collect();

  return rows.find((r) => resolvePlatform(r.platform) === platform) ?? null;
}

/**
 * Timestamp of the last message this person sent us, or null when we have
 * never heard from them. Meta only allows a reply within 24h of it.
 */
export const loadMessagingWindow = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    platform: orPlatformValidator,
    igsid: v.string(),
  },
  returns: v.union(v.number(), v.null()),
  handler: async (ctx, args) => {
    const conversation = await findConversation(
      ctx,
      args.workspaceId,
      args.platform,
      args.igsid,
    );

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
    // Instagram only — the gate does not exist on Facebook, so there is no
    // platform argument to take here.
    const conversation = await findConversation(
      ctx,
      args.workspaceId,
      "instagram",
      args.igsid,
    );

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
    const conversation = await findConversation(
      ctx,
      args.workspaceId,
      "instagram",
      args.igsid,
    );

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
      const conversation = await findConversation(
        ctx,
        log.workspaceId,
        resolvePlatform(log.platform),
        log.commenterId,
      );

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
  tracker: UsageTracker,
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
    const res = await tracker.fetch(
      buildUserProfileUrl(params.igsid, params.version),
      { headers: { Authorization: `Bearer ${params.token}` } },
    );
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
    // from the log. Meta's hard rule, and one length per platform
    // (lib/orMessage.ts) rather than one number shared by both.
    const directRecipient =
      context.source === "comment" ? undefined : context.recipientIgsid;

    if (context.source !== "comment") {
      const lastUserMessageAt: number | null =
        directRecipient === undefined
          ? null
          : await ctx.runQuery(internal.orSend.loadMessagingWindow, {
              workspaceId: context.workspaceId,
              platform: context.platform,
              igsid: directRecipient,
            });

      if (
        !isWithinMessagingWindow(lastUserMessageAt, Date.now(), context.platform)
      ) {
        await ctx.runMutation(internal.orSend.applyResult, {
          dmLogId: args.dmLogId,
          status: "skipped_window",
          attempts: context.attempts,
          errorMessage: MESSAGING_WINDOW_EXPIRED_MESSAGE,
        });
        return null;
      }
    } else if (
      !isWithinPrivateReplyWindow(
        context.createdAt,
        Date.now(),
        context.platform,
      )
    ) {
      await ctx.runMutation(internal.orSend.applyResult, {
        dmLogId: args.dmLogId,
        status: "skipped_window",
        attempts: context.attempts,
        errorMessage: PRIVATE_REPLY_WINDOW_EXPIRED_MESSAGE,
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

    // Up to four Meta calls leave this action — the follow check, the public
    // reply, and the message itself (twice, if the gate sends its prompt
    // first). All of them count (P2). Flushed at every exit below rather than
    // in a `finally`, because `handleDmFailure` is itself an exit.
    const tracker = createUsageTracker();
    const flush = async (): Promise<void> => {
      await tracker.flush(ctx, context.workspaceId);
    };

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
      await flush();
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
        // Instagram answers a comment on `/replies`, Facebook on `/comments`.
        // Same idea, different edge — the one place the public half differs.
        const replyUrl =
          context.platform === "facebook"
            ? buildPageCommentRepliesUrl(context.commentId, version)
            : buildCommentRepliesUrl(context.commentId, version);
        const replyRes = await tracker.fetch(replyUrl, {
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

    // Both platforms send on the account's own /messages edge, and on both
    // what distinguishes a private reply from a thread message is the
    // `recipient` in the body — a comment id there, a PSID/IGSID here. Only
    // the host differs, which is why this is a two-line branch and the whole
    // message body below is shared.
    const sendUrl =
      context.platform === "facebook"
        ? buildPageMessagesUrl(context.accountId, version)
        : directRecipient !== undefined
          ? buildSendMessageUrl(context.accountId, version)
          : buildPrivateReplyUrl(context.accountId, version);
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
    // Instagram only. `is_user_follow_business` has no Facebook counterpart —
    // a Page cannot ask whether someone likes it — so a gate switched on for
    // an automation that also runs on Facebook simply does not gate there,
    // rather than blocking every Facebook lead behind a question that can
    // never be answered.
    if (
      context.platform === "instagram" &&
      context.automation.requireFollow &&
      context.replyMessage === undefined
    ) {
      const follows = await resolveFollowsBusiness(
        ctx,
        {
          workspaceId: context.workspaceId,
          igsid: context.commenterIgsid,
          token,
          version,
          force: context.followRecheck === true,
        },
        tracker,
      );

      if (follows === false) {
        try {
          const res = await tracker.fetch(sendUrl, {
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
        await flush();
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

    // 6. POST the message. Every path hits /{account-id}/messages; what
    // differs is the recipient — the sender's IGSID/PSID for a DM reply, the
    // comment id for a private reply.
    //
    // 7. A refusal comes back as a sentence rather than a throw, so the caller
    // can decide whether it is the end or whether something simpler is worth
    // trying. `null` means it went out.
    const post = async (
      message: Record<string, unknown>,
    ): Promise<string | null> => {
      try {
        const res = await tracker.fetch(sendUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ recipient, message }),
        });
        if (res.ok) return null;
        const errText = await res.text().catch(() => "");
        return extractGraphApiError(errText);
      } catch (err) {
        const rawMsg = err instanceof Error ? err.message : String(err);
        return extractGraphApiError(rawMsg);
      }
    };

    let failure = await post(
      buildOutgoingMessage({
        text: composeDmMessage(
          (context.replyMessage ?? context.automation.dmMessage).slice(
            0,
            baseTextMax,
          ),
          linkText,
          context.automation.linkLabel,
        ),
        // A url button pointing at the automation's link gets the tracked
        // short link too, so a tap is counted like any other click.
        buttons: buttons.map((button) =>
          button.type === "url" && button.url === context.automation.linkUrl
            ? { ...button, url: linkUrl }
            : button,
        ),
        quickReplies,
      }),
    );

    /** Set when the message went out, but without the buttons it was written with. */
    let degraded: string | undefined;

    // The plain-text fallback.
    //
    // A body carrying a button template is one Meta can refuse where the same
    // words on their own would have gone through — a private reply to a comment
    // is the case this exists for, and the automations most likely to carry
    // buttons are exactly the ones a comment triggers. Without this, the send
    // repeated the identical body three times and ended `failed`: the lead got
    // NOTHING, and the log blamed the network.
    //
    // Only the automation's own message falls back. The follow gate's prompt
    // above deliberately does not: its entire content is a button to press, and
    // a plain-text version asks a question that cannot be answered and strands
    // the row in `awaiting_follow` for good. There, a visible failure is the
    // honest outcome.
    //
    // Not attempted after a throttle — Meta has already said stop, and a second
    // body is a second call into an active block.
    if (
      failure !== null &&
      !tracker.throttled &&
      (buttons.length > 0 || quickReplies.length > 0)
    ) {
      const refusal = failure;
      // With the buttons gone, a link that lived only on one would not be sent
      // at all, so the text carries it whether or not a button did.
      const plainLinkBlock = composeDmMessage(
        "",
        linkUrl,
        context.automation.linkLabel,
      );
      const retry = await post(
        buildOutgoingMessage({
          text: composeDmMessage(
            (context.replyMessage ?? context.automation.dmMessage).slice(
              0,
              Math.max(0, MESSAGE_TEXT_MAX - plainLinkBlock.length),
            ),
            linkUrl,
            context.automation.linkLabel,
          ),
        }),
      );
      if (retry === null) {
        failure = null;
        degraded =
          `Poruka je poslata bez dugmadi — Meta ih na ovom putu nije prihvatila: ${refusal}`.slice(
            0,
            300,
          );
      }
    }

    if (failure !== null) {
      return await handleDmFailure(failure);
    }

    // 8-9. applyResult with status "sent", attempts, dmSentAt: Date.now(), plus
    // whichever public-reply field applies.
    await ctx.runMutation(internal.orSend.applyResult, {
      dmLogId: args.dmLogId,
      status: "sent",
      attempts,
      dmSentAt: Date.now(),
      // "Sent" with a sentence attached is the shape of a message that arrived
      // in a poorer form than it was written in. Saying nothing would leave the
      // operator wondering for weeks why nobody taps the buttons.
      ...(degraded !== undefined ? { errorMessage: degraded } : {}),
      ...(await postPublicReply()),
    });
    await flush();

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
    const platform = resolvePlatform(log.platform);

    const conversation = await findConversation(
      ctx,
      log.workspaceId,
      platform,
      log.commenterId,
    );

    const row = {
      workspaceId: log.workspaceId,
      // The follow-up belongs to the same platform as the message it follows;
      // it goes into that very thread.
      platform,
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

    // Where the 24h clock started.
    //
    // For a DM or a tap it is `lastUserMessageAt`, written by
    // `orIngest.touchConversation`. A COMMENT never goes through there — a
    // comment is not a message — so a comment-triggered automation has no
    // conversation row at all, and reading the window off one that was never
    // written made EVERY follow-up on a comment automation end as
    // `skipped_window`. The feature was mostly built for those automations, and
    // for them it had never once fired.
    //
    // The comment is the interaction that opened the window, and `log.createdAt`
    // is the moment we recorded it — the same instant the 7-day private-reply
    // clock is measured from a few lines up in `sendDm`. That is also what the
    // 23-hour cap on the delay (`lib/orFollowUp.ts`) was always sized against.
    // A later message from the same person still wins, because then the window
    // genuinely restarted.
    const windowStart =
      log.source === "comment"
        ? Math.max(conversation?.lastUserMessageAt ?? 0, log.createdAt)
        : conversation?.lastUserMessageAt;

    // The clock runs from the person's last message, not from ours, so even a
    // delay well inside 23h can land outside the window.
    if (!isWithinMessagingWindow(windowStart, now, platform)) {
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

// ── Human Inbox Sending Layer (G6) ───────────────────────────────────────────

/**
 * Load context for sending a direct inbox message or action from the operator.
 */
export const loadInboxSendContext = internalQuery({
  args: {
    platform: orPlatformValidator,
    igsid: v.string(),
  },
  returns: v.union(
    v.null(),
    v.object({
      workspaceId: v.id("workspaces"),
      accountId: v.string(),
      encryptedCredentials: v.string(),
      lastUserMessageAt: v.union(v.number(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    const { workspaceId } = await requireMembership(ctx);
    const platform = resolvePlatform(args.platform);

    const conn = await ctx.db
      .query("connections")
      .withIndex("by_workspace_provider", (q) =>
        q
          .eq("workspaceId", workspaceId)
          .eq("provider", platformProvider(platform)),
      )
      .first();

    if (
      conn === null ||
      conn.status === "disconnecting" ||
      conn.externalId === undefined ||
      conn.externalId.length === 0
    ) {
      return null;
    }

    const conv = await findConversation(ctx, workspaceId, platform, args.igsid);

    return {
      workspaceId,
      accountId: conn.externalId,
      encryptedCredentials: conn.encryptedCredentials,
      lastUserMessageAt: conv?.lastUserMessageAt ?? null,
    };
  },
});

/**
 * Send a direct message to a user from the Inbox UI.
 * Strictly checks the 24-hour messaging window and UTF-8 byte limits!
 */
export const sendInboxMessage = action({
  args: {
    platform: v.optional(orPlatformValidator),
    igsid: v.string(),
    text: v.optional(v.string()),
    attachment: v.optional(
      v.object({
        type: v.union(
          v.literal("image"),
          v.literal("video"),
          v.literal("audio"),
          v.literal("file"),
          v.literal("like_heart"),
        ),
        url: v.optional(v.string()),
      }),
    ),
    quickReplies: v.optional(
      v.array(
        v.object({
          label: v.string(),
          payload: v.optional(v.string()),
        }),
      ),
    ),
  },
  returns: v.object({
    mid: v.string(),
  }),
  handler: async (ctx, args) => {
    const platform = resolvePlatform(args.platform);
    const context = await ctx.runQuery(internal.orSend.loadInboxSendContext, {
      platform,
      igsid: args.igsid,
    });

    if (context === null) {
      throw new ConvexError({
        code: "invalid",
        message: "Instagram nalog nije povezan ili je u procesu odjavljivanja.",
      });
    }

    // 1. Check 24-hour messaging window from lastUserMessageAt!
    if (
      !isWithinMessagingWindow(
        context.lastUserMessageAt,
        Date.now(),
        platform,
      )
    ) {
      throw new ConvexError({
        code: "window_expired",
        message:
          "Prozor za odgovor je istekao. Instagram dozvoljava odgovor 24 sata od poslednje poruke korisnika.",
      });
    }

    // 2. Validate text bytes (1000 bytes limit)
    const text = args.text?.trim();
    if (text && !isWithinUtf8ByteLimit(text, 1000)) {
      throw new ConvexError({
        code: "invalid",
        message: "Tekst poruke prelazi maksimalnih 1000 bajtova.",
      });
    }

    if (!text && !args.attachment) {
      throw new ConvexError({
        code: "invalid",
        message: "Unesi tekst poruke ili izaberi prilog.",
      });
    }

    // 3. Decrypt token
    let token: string;
    try {
      token = await decryptCredentials(context.encryptedCredentials);
    } catch {
      throw new ConvexError({
        code: "invalid",
        message: "Neuspela dekripcija Instagram tokena.",
      });
    }

    const version = getMetaGraphVersion();
    const sendUrl =
      platform === "facebook"
        ? buildPageMessagesUrl(context.accountId, version)
        : buildSendMessageUrl(context.accountId, version);

    const message = buildOutgoingMessage({
      text,
      attachment: args.attachment,
      quickReplies: args.quickReplies,
    });

    const tracker = createUsageTracker();
    let res: Response;
    try {
      res = await tracker.fetch(sendUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipient: { id: args.igsid },
          message,
        }),
      });
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : String(err);
      throw new ConvexError({
        code: "invalid",
        message: extractGraphApiError(rawMsg).slice(0, 300),
      });
    } finally {
      await tracker.flush(ctx, context.workspaceId);
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new ConvexError({
        code: "invalid",
        message: extractGraphApiError(errText).slice(0, 300),
      });
    }

    const body = (await res.json().catch(() => ({}))) as {
      message_id?: string;
      recipient_id?: string;
    };
    const mid = body.message_id || `mid_${Date.now()}`;

    // Record in database
    await ctx.runMutation(internal.instagramInboxStore.recordOutgoingMessage, {
      workspaceId: context.workspaceId,
      platform,
      igsid: args.igsid,
      mid,
      text,
      attachments: args.attachment
        ? [{ type: args.attachment.type, url: args.attachment.url }]
        : undefined,
      sentAt: Date.now(),
    });

    return { mid };
  },
});

/**
 * Send sender action (typing_on, typing_off, mark_seen) to a conversation.
 * Must be a standalone API call without message payload.
 */
export const sendSenderAction = action({
  args: {
    platform: v.optional(orPlatformValidator),
    igsid: v.string(),
    senderAction: v.union(
      v.literal("typing_on"),
      v.literal("typing_off"),
      v.literal("mark_seen"),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const platform = resolvePlatform(args.platform);
    const context = await ctx.runQuery(internal.orSend.loadInboxSendContext, {
      platform,
      igsid: args.igsid,
    });

    if (context === null) {
      return null;
    }

    let token: string;
    try {
      token = await decryptCredentials(context.encryptedCredentials);
    } catch {
      return null;
    }

    const version = getMetaGraphVersion();
    const sendUrl =
      platform === "facebook"
        ? buildPageMessagesUrl(context.accountId, version)
        : buildSendMessageUrl(context.accountId, version);

    const tracker = createUsageTracker();
    try {
      await tracker.fetch(sendUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipient: { id: args.igsid },
          sender_action: args.senderAction,
        }),
      });
    } catch {
      // Best effort for typing / seen indicators
    } finally {
      await tracker.flush(ctx, context.workspaceId);
    }

    if (args.senderAction === "mark_seen") {
      await ctx.runMutation(api.instagramInboxStore.markSeen, {
        igsid: args.igsid,
        platform,
      });
    }

    return null;
  },
});

/**
 * Send a message reaction (react / unreact) to a specific message ID.
 */
export const sendMessageReaction = action({
  args: {
    platform: v.optional(orPlatformValidator),
    igsid: v.string(),
    mid: v.string(),
    emoji: v.optional(v.string()),
    action: v.union(v.literal("react"), v.literal("unreact")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const platform = resolvePlatform(args.platform);
    const context = await ctx.runQuery(internal.orSend.loadInboxSendContext, {
      platform,
      igsid: args.igsid,
    });

    if (context === null) {
      throw new ConvexError({
        code: "invalid",
        message: "Instagram nalog nije povezan.",
      });
    }

    if (
      !isWithinMessagingWindow(
        context.lastUserMessageAt,
        Date.now(),
        platform,
      )
    ) {
      throw new ConvexError({
        code: "window_expired",
        message:
          "Prozor za odgovor je istekao. Instagram dozvoljava odgovor 24 sata od poslednje poruke korisnika.",
      });
    }

    let token: string;
    try {
      token = await decryptCredentials(context.encryptedCredentials);
    } catch {
      throw new ConvexError({
        code: "invalid",
        message: "Neuspela dekripcija Instagram tokena.",
      });
    }

    const version = getMetaGraphVersion();
    const sendUrl =
      platform === "facebook"
        ? buildPageMessagesUrl(context.accountId, version)
        : buildSendMessageUrl(context.accountId, version);

    const payload: Record<string, unknown> = {
      message_id: args.mid,
      ...(args.action === "react" && args.emoji
        ? { reaction: args.emoji }
        : {}),
    };

    const tracker = createUsageTracker();
    let res: Response;
    try {
      res = await tracker.fetch(sendUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipient: { id: args.igsid },
          sender_action: args.action,
          payload,
        }),
      });
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : String(err);
      throw new ConvexError({
        code: "invalid",
        message: extractGraphApiError(rawMsg).slice(0, 300),
      });
    } finally {
      await tracker.flush(ctx, context.workspaceId);
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new ConvexError({
        code: "invalid",
        message: extractGraphApiError(errText).slice(0, 300),
      });
    }

    await ctx.runMutation(internal.instagramInboxStore.recordReaction, {
      workspaceId: context.workspaceId,
      igsid: args.igsid,
      mid: args.mid,
      emoji: args.emoji,
      action: args.action,
      actorId: context.accountId,
      isOurs: true,
    });

    return null;
  },
});

