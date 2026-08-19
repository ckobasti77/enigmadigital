import { internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { matchKeywords, utcDateKey } from "./lib/orMatch";
import { parsePostbackPayload, FOLLOW_PAYLOAD_KEY } from "./lib/orButtons";
import { FOLLOW_PROMPT_BUTTON_LABEL_DEFAULT } from "./lib/orFollow";
import {
  automationHandles,
  orPlatformValidator,
  platformProvider,
  resolvePlatform,
  type OrPlatform,
} from "./lib/orPlatform";

const ingestResultValidator = v.union(
  v.literal("ignored_no_workspace"),
  v.literal("ignored_engine_off"),
  v.literal("duplicate"),
  v.literal("no_match"),
  v.literal("queued"),
);

type WorkspaceLookup =
  | { ok: true; workspaceId: Id<"workspaces"> }
  | { ok: false; reason: "ignored_no_workspace" | "ignored_engine_off" };

/**
 * Map the account id on a webhook to the workspace that owns it.
 *
 * Split out of `resolveEnabledWorkspace` for F4: comment moderation stores
 * every comment regardless of whether the OpenReply engine is running, so the
 * "which workspace" question and the "is the engine on" question stopped being
 * the same question.
 *
 * F5 made it take a platform. `entry.id` is an Instagram professional account
 * id on one webhook and a Page id on the other, and the two live on different
 * `connections` rows — so which row to look in is decided by which webhook
 * called, never by trying both.
 */
async function resolveWorkspace(
  ctx: MutationCtx,
  platform: OrPlatform,
  accountId: string,
): Promise<Id<"workspaces"> | null> {
  const provider = platformProvider(platform);

  const connections = await ctx.db
    .query("connections")
    .withIndex("by_provider", (q) => q.eq("provider", provider))
    .collect();

  // `externalIdAlt` is only ever an account id on Instagram, where the webhook
  // may name either the app-scoped id or the professional one. On Facebook it
  // holds the Page's NAME, so it is deliberately not compared here.
  const conn = connections.find((c) =>
    platform === "instagram"
      ? c.externalId === accountId || c.externalIdAlt === accountId
      : c.externalId === accountId,
  );
  if (!conn) {
    console.warn(
      `OpenReply: nema ${provider} konekcije za nalog`,
      accountId,
    );
    return null;
  }
  return conn.workspaceId;
}

/** Is this workspace's OpenReply engine switched on? */
async function isEngineOn(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
): Promise<boolean> {
  const orConn = await ctx.db
    .query("connections")
    .withIndex("by_workspace_provider", (q) =>
      q.eq("workspaceId", workspaceId).eq("provider", "openreply"),
    )
    .first();

  return orConn !== null && orConn.status === "active";
}

/**
 * Map the account id on a webhook to a workspace whose OpenReply engine is
 * switched on. Shared by both ingest paths — comments and DMs.
 */
async function resolveEnabledWorkspace(
  ctx: MutationCtx,
  platform: OrPlatform,
  accountId: string,
): Promise<WorkspaceLookup> {
  const workspaceId = await resolveWorkspace(ctx, platform, accountId);
  if (workspaceId === null) {
    return { ok: false, reason: "ignored_no_workspace" };
  }
  if (!(await isEngineOn(ctx, workspaceId))) {
    return { ok: false, reason: "ignored_engine_off" };
  }
  return { ok: true, workspaceId };
}

/**
 * Has this comment already been through the engine?
 *
 * The lookup uses the SAME index it always did, `[workspaceId, commentId]`,
 * and compares the platform in code afterwards. Putting the platform in the
 * index would have been tidier and wrong: every row written before F5 has no
 * platform at all, so an indexed `.eq("platform", "instagram")` would miss all
 * of them and a redelivered old webhook would send a second DM.
 *
 * Reading a comment id costs one row either way — ids are unique per platform,
 * so the "scan" is a single document.
 */
async function findProcessedComment(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  platform: OrPlatform,
  commentId: string,
): Promise<Doc<"orProcessedComments"> | null> {
  const rows = await ctx.db
    .query("orProcessedComments")
    .withIndex("by_workspace_comment", (q) =>
      q.eq("workspaceId", workspaceId).eq("commentId", commentId),
    )
    .collect();

  return rows.find((r) => resolvePlatform(r.platform) === platform) ?? null;
}

/** The same trick for an inbound message id (DMs and taps share the table). */
async function findInboundMessage(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  platform: OrPlatform,
  mid: string,
): Promise<Doc<"orInboundMessages"> | null> {
  const rows = await ctx.db
    .query("orInboundMessages")
    .withIndex("by_workspace_mid", (q) =>
      q.eq("workspaceId", workspaceId).eq("mid", mid),
    )
    .collect();

  return rows.find((r) => resolvePlatform(r.platform) === platform) ?? null;
}

/**
 * Record that we just heard from this person. The row is both the consent
 * record and the clock the send path checks: replying is only allowed within
 * 24h of `lastUserMessageAt`. Tapping a button counts exactly like writing.
 *
 * Returns the username we know for them, so a caller that has none can still
 * label the log row.
 */
async function touchConversation(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  platform: OrPlatform,
  igsid: string,
  now: number,
  username?: string,
): Promise<string | undefined> {
  const rows = await ctx.db
    .query("orConversations")
    .withIndex("by_workspace_igsid", (q) =>
      q.eq("workspaceId", workspaceId).eq("igsid", igsid),
    )
    .collect();

  const conversation =
    rows.find((r) => resolvePlatform(r.platform) === platform) ?? null;

  if (conversation === null) {
    await ctx.db.insert("orConversations", {
      workspaceId,
      platform,
      igsid,
      username,
      lastUserMessageAt: now,
      consentAt: now,
      createdAt: now,
    });
    return username;
  }

  await ctx.db.patch(conversation._id, {
    lastUserMessageAt: now,
    consentAt: conversation.consentAt ?? now,
    ...(username !== undefined ? { username } : {}),
  });
  return username ?? conversation.username;
}

/**
 * Find a tapped ice breaker or persistent menu item by its payload, and give
 * back the label the person saw. Undefined when the payload belongs to neither
 * — a message button, or an entry that has since been edited away.
 *
 * One row per workspace holds both lists, so this is a single document read.
 */
async function findProfileEntryLabel(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  payload: string,
): Promise<string | undefined> {
  const row = await ctx.db
    .query("orProfileMenus")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .first();

  if (row === null) {
    return undefined;
  }

  const iceBreaker = row.iceBreakers.find((i) => i.payload === payload);
  if (iceBreaker !== undefined) {
    return iceBreaker.question;
  }
  return row.menuItems.find((m) => m.payload === payload)?.title;
}

/**
 * OpenReply Ingest Mutation.
 * Receives comments dispatched from either webhook, matches them against
 * active automations, deduplicates, and logs to orDmLogs.
 */
export const ingestComment = internalMutation({
  args: {
    platform: orPlatformValidator,
    /** IG professional account id, or Page id — whichever webhook called. */
    accountId: v.string(),
    commentId: v.string(),
    /** Instagram media id, or Facebook post id. */
    mediaId: v.optional(v.string()),
    /** Set on a Facebook reply; Instagram's webhook does not say. */
    parentCommentId: v.optional(v.string()),
    commenterId: v.string(),
    commenterUsername: v.optional(v.string()),
    text: v.string(),
  },
  returns: ingestResultValidator,
  handler: async (ctx, args) => {
    const platform = args.platform;

    // 1. Whose account is this?
    const workspaceId = await resolveWorkspace(ctx, platform, args.accountId);
    if (workspaceId === null) {
      return "ignored_no_workspace";
    }

    // 2. Write the comment down BEFORE asking whether the engine is on.
    //
    // Moderation (F4) is not an automation feature: a workspace that never
    // switched OpenReply on still has people commenting under its posts, and
    // the moderation screen is the whole reason it would open this app. Tying
    // the record to the engine would leave that screen empty for exactly the
    // accounts that need it most.
    //
    // The post id is what ties a comment to something to moderate under; a
    // webhook without one is left to the automation path alone.
    if (args.mediaId !== undefined) {
      if (platform === "facebook") {
        await ctx.runMutation(internal.fbCommentsStore.recordWebhookComment, {
          workspaceId,
          postId: args.mediaId,
          commentId: args.commentId,
          ...(args.parentCommentId !== undefined
            ? { parentCommentId: args.parentCommentId }
            : {}),
          authorId: args.commenterId,
          ...(args.commenterUsername !== undefined
            ? { authorName: args.commenterUsername }
            : {}),
          text: args.text,
        });
      } else {
        await ctx.runMutation(internal.igCommentsStore.recordWebhookComment, {
          workspaceId,
          mediaId: args.mediaId,
          commentId: args.commentId,
          fromId: args.commenterId,
          ...(args.commenterUsername !== undefined
            ? { username: args.commenterUsername }
            : {}),
          text: args.text,
        });
      }
    }

    // 3. From here on it is the engine's business, and it may be switched off.
    if (!(await isEngineOn(ctx, workspaceId))) {
      return "ignored_engine_off";
    }

    // 4. Dedup, per platform: the two sets of ids are minted independently and
    // must never be able to silence each other.
    const existing = await findProcessedComment(
      ctx,
      workspaceId,
      platform,
      args.commentId,
    );

    if (existing !== null) {
      return "duplicate";
    }

    const now = Date.now();
    await ctx.db.insert("orProcessedComments", {
      workspaceId,
      platform,
      commentId: args.commentId,
      processedAt: now,
    });

    // 5. Load active automations for the workspace
    const automations = await ctx.db
      .query("orAutomations")
      .withIndex("by_workspace_active", (q) =>
        q.eq("workspaceId", workspaceId).eq("isActive", true),
      )
      .collect();

    // 6. Pick the first automation that matches platform, post scope AND
    // keywords — in that order. The platform test comes first because it is
    // about whether the automation is eligible at all; a Facebook-only
    // automation that matched an Instagram keyword would otherwise take the
    // event and stop the loop before a real candidate was reached.
    let matchedAutomation: Doc<"orAutomations"> | null = null;
    let matchedKeyword: string | null = null;

    for (const a of automations) {
      if (!automationHandles(a.platform, platform)) continue;

      // undefined === "comment", the pre-DM default.
      if (a.trigger === "dm") continue;

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

    // 7. If none matched: insert an orDmLogs row with status: "skipped_no_match"
    if (matchedAutomation === null || matchedKeyword === null) {
      await ctx.db.insert("orDmLogs", {
        workspaceId,
        platform,
        source: "comment",
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

    // 8. If one matched: insert an orDmLogs row with status: "pending"
    const dmLogId = await ctx.db.insert("orDmLogs", {
      workspaceId,
      platform,
      source: "comment",
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

/**
 * OpenReply Direct Message Ingest Mutation.
 * Receives DMs dispatched from either webhook (entry[].messaging[], not
 * entry[].changes[]), records the conversation that opens the 24h messaging
 * window, matches the text against DM-triggered automations and logs to
 * orDmLogs.
 */
export const ingestDirectMessage = internalMutation({
  args: {
    platform: orPlatformValidator,
    accountId: v.string(),
    mid: v.string(),
    /** IGSID on Instagram, PSID on Facebook — the same thing twice named. */
    igsid: v.string(),
    text: v.string(),
    username: v.optional(v.string()),
  },
  returns: ingestResultValidator,
  handler: async (ctx, args) => {
    const platform = args.platform;

    // 1-2. Resolve the workspace and make sure its engine is on
    const lookup = await resolveEnabledWorkspace(
      ctx,
      platform,
      args.accountId,
    );
    if (!lookup.ok) {
      return lookup.reason;
    }
    const workspaceId = lookup.workspaceId;

    // 3. Dedup: Meta redelivers the same message id until it gets a 200
    const existing = await findInboundMessage(
      ctx,
      workspaceId,
      platform,
      args.mid,
    );

    if (existing !== null) {
      return "duplicate";
    }

    const now = Date.now();
    await ctx.db.insert("orInboundMessages", {
      workspaceId,
      platform,
      mid: args.mid,
      igsid: args.igsid,
      text: args.text,
      receivedAt: now,
    });

    // 4. The conversation row is the consent record and the clock the send
    // path checks: replying is only allowed within 24h of this timestamp.
    await touchConversation(
      ctx,
      workspaceId,
      platform,
      args.igsid,
      now,
      args.username,
    );

    // 5. Only automations that listen to DMs, on this platform
    const automations = await ctx.db
      .query("orAutomations")
      .withIndex("by_workspace_active", (q) =>
        q.eq("workspaceId", workspaceId).eq("isActive", true),
      )
      .collect();

    // 6. Match on keywords alone — a DM has no post behind it, so the
    // automation's post scope (matchAnyPost / postId) is irrelevant here.
    let matchedAutomation: Doc<"orAutomations"> | null = null;
    let matchedKeyword: string | null = null;

    for (const a of automations) {
      if (!automationHandles(a.platform, platform)) continue;

      // undefined === "comment", so pre-DM automations never fire on a message.
      if (a.trigger !== "dm" && a.trigger !== "both") continue;

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

    // 7. Nothing matched — log it so the screen still shows the message
    if (matchedAutomation === null || matchedKeyword === null) {
      await ctx.db.insert("orDmLogs", {
        workspaceId,
        platform,
        source: "dm",
        commentId: args.mid,
        commenterId: args.igsid,
        commenterUsername: args.username,
        commentText: args.text,
        status: "skipped_no_match",
        attempts: 0,
        date,
        createdAt: now,
      });
      return "no_match";
    }

    // 8. Matched — queue the reply
    const dmLogId = await ctx.db.insert("orDmLogs", {
      workspaceId,
      platform,
      source: "dm",
      automationId: matchedAutomation._id,
      commentId: args.mid,
      commenterId: args.igsid,
      commenterUsername: args.username,
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

/**
 * OpenReply Button Tap Ingest Mutation.
 * Handles every way a tap comes back from Meta: a `postback` event for a
 * button template button, an ice breaker or a persistent menu item, and a
 * normal message carrying `quick_reply.payload` for a quick reply. All of them
 * resolve to the same thing — a payload we minted — so all of them land here
 * rather than in the keyword matcher.
 *
 * A tap is a user-initiated interaction: it (re)opens the 24h messaging window,
 * which is exactly what makes the reply sendable.
 */
export const ingestButtonTap = internalMutation({
  args: {
    platform: orPlatformValidator,
    accountId: v.string(),
    mid: v.string(),
    igsid: v.string(),
    payload: v.string(),
    title: v.optional(v.string()),
  },
  returns: ingestResultValidator,
  handler: async (ctx, args) => {
    const platform = args.platform;

    // 1-2. Resolve the workspace and make sure its engine is on
    const lookup = await resolveEnabledWorkspace(
      ctx,
      platform,
      args.accountId,
    );
    if (!lookup.ok) {
      return lookup.reason;
    }
    const workspaceId = lookup.workspaceId;

    // 3. Dedup. A tap carries a message id like any other inbound event and
    // Meta redelivers it until it gets a 200, so it shares the message table.
    const existing = await findInboundMessage(
      ctx,
      workspaceId,
      platform,
      args.mid,
    );

    if (existing !== null) {
      return "duplicate";
    }

    const now = Date.now();
    const title = args.title?.trim() || undefined;

    await ctx.db.insert("orInboundMessages", {
      workspaceId,
      platform,
      mid: args.mid,
      igsid: args.igsid,
      text: title ?? args.payload,
      receivedAt: now,
    });

    const username = await touchConversation(
      ctx,
      workspaceId,
      platform,
      args.igsid,
      now,
    );

    // 4. The tap itself is worth keeping even when nothing answers it — it is
    // the only record that the button was ever pressed.
    await ctx.db.insert("orPostbacks", {
      workspaceId,
      igsid: args.igsid,
      payload: args.payload,
      title,
      receivedAt: now,
    });

    // 5. The payload names its automation, so one get resolves the tap no
    // matter how long the DM sat in the inbox.
    const parsed = parsePostbackPayload(args.payload);
    const automationId =
      parsed === null
        ? null
        : ctx.db.normalizeId("orAutomations", parsed.automationId);
    const automation =
      automationId === null ? null : await ctx.db.get(automationId);

    // A payload from another workspace is somebody else's button, not ours —
    // and so is one belonging to an automation that does not run here. The
    // second test matters after an operator narrows an automation to one
    // platform while its buttons are still sitting in delivered messages on
    // the other.
    const owned =
      automation !== null &&
      automation.workspaceId === workspaceId &&
      automationHandles(automation.platform, platform)
        ? automation
        : null;

    // Pausing an automation has to silence its buttons too, otherwise a DM sent
    // before the pause keeps answering.
    const tapped =
      owned === null || !owned.isActive
        ? undefined
        : [
            ...(owned.buttons ?? []).filter((b) => b.type === "postback"),
            ...(owned.quickReplies ?? []),
          ].find((b) => b.payload === args.payload);

    const replyMessage = tapped?.replyMessage?.trim();

    // 5b. „Zapratio/la sam”. The follow gate's button is built at send time and
    // stored nowhere, so it is recognised by its reserved payload key alone.
    // Answering it means starting the automation's DM over — the send path
    // asks Instagram again (`followRecheck`) and either lets the message
    // through or re-sends the prompt.
    //
    // Deliberately not conditioned on `requireFollow` still being on: someone
    // holding a prompt from before the operator switched the gate off has done
    // what was asked, and gets the message.
    const isFollowTap =
      owned !== null &&
      owned.isActive &&
      tapped === undefined &&
      parsed?.key === FOLLOW_PAYLOAD_KEY;

    // 5c. A tap that is on none of the automation's buttons can still be ours:
    // an ice breaker or a persistent menu item carries the same kind of
    // payload, minted from the automation it points at. Those have no reply
    // text of their own — they START the automation's DM, which is the whole
    // point of an entry point that opens the 24h window on its own.
    const entryLabel =
      owned !== null && owned.isActive && tapped === undefined && !isFollowTap
        ? await findProfileEntryLabel(ctx, workspaceId, args.payload)
        : undefined;

    const answered =
      (replyMessage !== undefined && replyMessage.length > 0) ||
      entryLabel !== undefined ||
      isFollowTap;

    const date = utcDateKey(now);

    // 6. Nothing to answer with — the button was deleted, renamed away or the
    // automation is paused. Log it so the tap still shows on the screen.
    if (owned === null || !answered) {
      await ctx.db.insert("orDmLogs", {
        workspaceId,
        platform,
        source: "postback",
        automationId: owned?._id,
        commentId: args.mid,
        commenterId: args.igsid,
        commenterUsername: username,
        commentText: title ?? args.payload,
        status: "skipped_no_match",
        attempts: 0,
        date,
        createdAt: now,
      });
      return "no_match";
    }

    // 7. Queue the answer. `replyMessage` on the row is what makes the send
    // path use the text written on the tapped button instead of the
    // automation's `dmMessage`; an ice breaker leaves it unset on purpose.
    const dmLogId = await ctx.db.insert("orDmLogs", {
      workspaceId,
      platform,
      source: "postback",
      automationId: owned._id,
      commentId: args.mid,
      commenterId: args.igsid,
      commenterUsername: username,
      // What the person "said" by tapping. There is no keyword behind a tap.
      commentText:
        title ??
        tapped?.label ??
        entryLabel ??
        (isFollowTap
          ? (owned.followPromptButtonLabel?.trim() ||
            FOLLOW_PROMPT_BUTTON_LABEL_DEFAULT)
          : args.payload),
      // Undefined for an ice breaker / menu / follow tap, and that is what
      // makes the send path fall back to the automation's own message, link
      // and buttons.
      replyMessage,
      // Ask Instagram again rather than trusting the cached answer — the tap
      // is the claim that the person just followed.
      followRecheck: isFollowTap ? true : undefined,
      status: "pending",
      attempts: 0,
      date,
      createdAt: now,
    });

    await ctx.scheduler.runAfter(0, internal.orSend.sendDm, { dmLogId });

    return "queued";
  },
});
