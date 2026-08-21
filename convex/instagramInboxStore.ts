import {
  internalMutation,
  mutation,
  query,
} from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id, Doc } from "./_generated/dataModel";
import { requireMembership } from "./lib/auth";
import {
  formatRemainingMessagingWindow,
  getRemainingMessagingWindowMs,
  isWithinMessagingWindow,
} from "./lib/orMessage";
import {
  orPlatformValidator,
  platformProvider,
  resolvePlatform,
  type OrPlatform,
} from "./lib/orPlatform";

// ── Workspace Resolution ─────────────────────────────────────────────────────

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

  const conn = connections.find((c) =>
    platform === "instagram"
      ? c.externalId === accountId || c.externalIdAlt === accountId
      : c.externalId === accountId,
  );
  if (!conn) {
    return null;
  }
  // Disconnecting guard
  if (conn.status === "disconnecting") return null;
  return conn.workspaceId;
}

// ── Queries ──────────────────────────────────────────────────────────────────

/**
 * List conversations for the workspace with filter & search support.
 * Sorted by `updatedAt` (or `lastMessageAt`) descending.
 */
export const listConversations = query({
  args: {
    filter: v.optional(
      v.union(v.literal("all"), v.literal("unread"), v.literal("expiring")),
    ),
    search: v.optional(v.string()),
    platform: v.optional(orPlatformValidator),
  },
  handler: async (ctx, args) => {
    const { workspaceId } = await requireMembership(ctx);
    const targetPlatform = resolvePlatform(args.platform);
    const now = Date.now();

    const rows = await ctx.db
      .query("orConversations")
      .withIndex("by_workspace_updated", (q) =>
        q.eq("workspaceId", workspaceId),
      )
      .order("desc")
      .take(100);

    const platformRows = rows.filter(
      (r) => resolvePlatform(r.platform) === targetPlatform,
    );

    const searchLower = args.search?.trim().toLowerCase() ?? "";

    const mapped = platformRows.map((conv) => {
      const windowRemainingMs = getRemainingMessagingWindowMs(
        conv.lastUserMessageAt,
        now,
        targetPlatform,
      );
      const isWindowOpen = isWithinMessagingWindow(
        conv.lastUserMessageAt,
        now,
        targetPlatform,
      );
      const windowFormatted = formatRemainingMessagingWindow(
        conv.lastUserMessageAt,
        now,
        targetPlatform,
      );

      return {
        _id: conv._id,
        igsid: conv.igsid,
        username: conv.username ?? null,
        name: conv.name ?? null,
        profilePic: conv.profilePic ?? null,
        conversationId: conv.conversationId ?? null,
        lastUserMessageAt: conv.lastUserMessageAt ?? null,
        lastBotMessageAt: conv.lastBotMessageAt ?? null,
        lastMessageText: conv.lastMessageText ?? null,
        lastMessageAt: conv.lastMessageAt ?? conv.updatedAt ?? conv.createdAt,
        unreadCount: conv.unreadCount ?? 0,
        updatedAt: conv.updatedAt ?? conv.createdAt,
        createdAt: conv.createdAt,
        windowRemainingMs,
        isWindowOpen,
        windowFormatted,
      };
    });

    return mapped
      .filter((conv) => {
        // Filter tabs
        if (args.filter === "unread" && conv.unreadCount <= 0) {
          return false;
        }
        if (args.filter === "expiring") {
          // Window is open and has < 4 hours left, or recently expired (< 24h ago)
          const isExpiringSoon =
            conv.isWindowOpen && conv.windowRemainingMs <= 4 * 60 * 60 * 1000;
          const isRecentlyExpired =
            !conv.isWindowOpen && conv.lastUserMessageAt !== null;
          if (!isExpiringSoon && !isRecentlyExpired) {
            return false;
          }
        }

        // Search filter
        if (searchLower.length > 0) {
          const uMatch = conv.username?.toLowerCase().includes(searchLower);
          const nMatch = conv.name?.toLowerCase().includes(searchLower);
          const tMatch = conv.lastMessageText
            ?.toLowerCase()
            .includes(searchLower);
          if (!uMatch && !nMatch && !tMatch) {
            return false;
          }
        }

        return true;
      })
      .slice(0, 50);
  },
});

/**
 * Get single conversation metadata and window status.
 */
export const getConversation = query({
  args: {
    igsid: v.string(),
    platform: v.optional(orPlatformValidator),
  },
  handler: async (ctx, args) => {
    const { workspaceId } = await requireMembership(ctx);
    const targetPlatform = resolvePlatform(args.platform);
    const now = Date.now();

    const rows = await ctx.db
      .query("orConversations")
      .withIndex("by_workspace_igsid", (q) =>
        q.eq("workspaceId", workspaceId).eq("igsid", args.igsid),
      )
      .collect();

    const conv =
      rows.find((r) => resolvePlatform(r.platform) === targetPlatform) ?? null;

    if (conv === null) {
      return null;
    }

    const windowRemainingMs = getRemainingMessagingWindowMs(
      conv.lastUserMessageAt,
      now,
      targetPlatform,
    );
    const isWindowOpen = isWithinMessagingWindow(
      conv.lastUserMessageAt,
      now,
      targetPlatform,
    );
    const windowFormatted = formatRemainingMessagingWindow(
      conv.lastUserMessageAt,
      now,
      targetPlatform,
    );

    return {
      _id: conv._id,
      igsid: conv.igsid,
      username: conv.username ?? null,
      name: conv.name ?? null,
      profilePic: conv.profilePic ?? null,
      conversationId: conv.conversationId ?? null,
      lastUserMessageAt: conv.lastUserMessageAt ?? null,
      lastBotMessageAt: conv.lastBotMessageAt ?? null,
      lastMessageText: conv.lastMessageText ?? null,
      lastMessageAt: conv.lastMessageAt ?? conv.updatedAt ?? conv.createdAt,
      unreadCount: conv.unreadCount ?? 0,
      updatedAt: conv.updatedAt ?? conv.createdAt,
      createdAt: conv.createdAt,
      windowRemainingMs,
      isWindowOpen,
      windowFormatted,
    };
  },
});

/**
 * List messages inside a conversation (ordered chronologically for display).
 */
export const listMessages = query({
  args: {
    igsid: v.string(),
    platform: v.optional(orPlatformValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { workspaceId } = await requireMembership(ctx);
    const limit = Math.min(args.limit ?? 50, 100);

    const rows = await ctx.db
      .query("igMessages")
      .withIndex("by_workspace_igsid_sent", (q) =>
        q.eq("workspaceId", workspaceId).eq("igsid", args.igsid),
      )
      .order("desc")
      .take(limit);

    // Reversed to chronological order (oldest to newest)
    const messages = [...rows].reverse().map((msg) => ({
      _id: msg._id,
      mid: msg.mid,
      senderId: msg.senderId,
      senderType: msg.senderType,
      isOurs: msg.senderType === "business",
      text: msg.text ?? null,
      attachments: msg.attachments ?? [],
      shares: msg.shares ?? null,
      story: msg.story ?? null,
      reactions: msg.reactions ?? [],
      isUnsupported: msg.isUnsupported ?? false,
      isEcho: msg.isEcho ?? false,
      sentAt: msg.sentAt,
      editedAt: msg.editedAt ?? null,
      status: msg.status ?? "sent",
      errorMessage: msg.errorMessage ?? null,
      replyToMid: msg.replyToMid ?? null,
    }));

    return {
      messages,
      totalCount: rows.length,
      hasOlderMessages: rows.length >= 20,
    };
  },
});

// ── Mutations ────────────────────────────────────────────────────────────────

/**
 * Mark a conversation as seen (resets unreadCount).
 */
export const markSeen = mutation({
  args: {
    igsid: v.string(),
    platform: v.optional(orPlatformValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { workspaceId } = await requireMembership(ctx);
    const targetPlatform = resolvePlatform(args.platform);

    const rows = await ctx.db
      .query("orConversations")
      .withIndex("by_workspace_igsid", (q) =>
        q.eq("workspaceId", workspaceId).eq("igsid", args.igsid),
      )
      .collect();

    const conv =
      rows.find((r) => resolvePlatform(r.platform) === targetPlatform) ?? null;

    if (conv !== null && (conv.unreadCount ?? 0) > 0) {
      await ctx.db.patch(conv._id, { unreadCount: 0 });
    }
    return null;
  },
});

// ── Internal mutations for Ingest & Webhooks ─────────────────────────────────

/**
 * Helper to find conversation row by (workspaceId, platform, igsid).
 */
async function findConversation(
  ctx: MutationCtx | QueryCtx,
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
 * Record an inbound message from user via Webhook.
 */
export const recordInboundMessage = internalMutation({
  args: {
    platform: orPlatformValidator,
    accountId: v.string(),
    igsid: v.string(),
    mid: v.string(),
    text: v.optional(v.string()),
    attachments: v.optional(
      v.array(
        v.object({
          type: v.string(),
          url: v.optional(v.string()),
          title: v.optional(v.string()),
        }),
      ),
    ),
    shares: v.optional(
      v.object({
        link: v.optional(v.string()),
        id: v.optional(v.string()),
      }),
    ),
    story: v.optional(
      v.object({
        id: v.optional(v.string()),
        url: v.optional(v.string()),
      }),
    ),
    isUnsupported: v.optional(v.boolean()),
    sentAt: v.number(),
    username: v.optional(v.string()),
    name: v.optional(v.string()),
    replyToMid: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const platform = resolvePlatform(args.platform);
    const workspaceId = await resolveWorkspace(ctx, platform, args.accountId);
    if (workspaceId === null) {
      return null;
    }

    // Dedup check on mid
    const existingMsg = await ctx.db
      .query("igMessages")
      .withIndex("by_workspace_mid", (q) =>
        q.eq("workspaceId", workspaceId).eq("mid", args.mid),
      )
      .first();

    if (existingMsg !== null) {
      return null;
    }

    await ctx.db.insert("igMessages", {
      workspaceId,
      platform,
      igsid: args.igsid,
      mid: args.mid,
      senderId: args.igsid,
      senderType: "user",
      text: args.text,
      attachments: args.attachments,
      shares: args.shares,
      story: args.story,
      isUnsupported: args.isUnsupported,
      sentAt: args.sentAt,
      status: "delivered",
      replyToMid: args.replyToMid,
    });

    const conv = await findConversation(
      ctx,
      workspaceId,
      platform,
      args.igsid,
    );

    const messagePreview =
      args.text && args.text.trim().length > 0
        ? args.text.trim().slice(0, 100)
        : args.attachments && args.attachments.length > 0
          ? `[${args.attachments[0].type === "image" ? "Slika" : args.attachments[0].type === "video" ? "Video" : "Prilog"}]`
          : args.story
            ? "[Priča]"
            : args.shares
              ? "[Deljena objava]"
              : args.isUnsupported
                ? "[Nepodržan format]"
                : "";

    if (conv === null) {
      await ctx.db.insert("orConversations", {
        workspaceId,
        platform,
        igsid: args.igsid,
        username: args.username,
        name: args.name,
        lastUserMessageAt: args.sentAt,
        lastMessageText: messagePreview,
        lastMessageAt: args.sentAt,
        unreadCount: 1,
        consentAt: args.sentAt,
        updatedAt: args.sentAt,
        createdAt: args.sentAt,
      });
    } else {
      await ctx.db.patch(conv._id, {
        lastUserMessageAt: args.sentAt,
        lastMessageText: messagePreview,
        lastMessageAt: args.sentAt,
        unreadCount: (conv.unreadCount ?? 0) + 1,
        updatedAt: args.sentAt,
        ...(args.username !== undefined ? { username: args.username } : {}),
        ...(args.name !== undefined ? { name: args.name } : {}),
      });
    }

    return null;
  },
});

/**
 * Record an echo message sent by the business from Instagram App or another tool.
 */
export const recordEchoMessage = internalMutation({
  args: {
    platform: orPlatformValidator,
    accountId: v.string(),
    igsid: v.string(),
    mid: v.string(),
    text: v.optional(v.string()),
    attachments: v.optional(
      v.array(
        v.object({
          type: v.string(),
          url: v.optional(v.string()),
          title: v.optional(v.string()),
        }),
      ),
    ),
    sentAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const platform = resolvePlatform(args.platform);
    const workspaceId = await resolveWorkspace(ctx, platform, args.accountId);
    if (workspaceId === null) {
      return null;
    }

    // Dedup check on mid
    const existingMsg = await ctx.db
      .query("igMessages")
      .withIndex("by_workspace_mid", (q) =>
        q.eq("workspaceId", workspaceId).eq("mid", args.mid),
      )
      .first();

    if (existingMsg !== null) {
      return null;
    }

    await ctx.db.insert("igMessages", {
      workspaceId,
      platform,
      igsid: args.igsid,
      mid: args.mid,
      senderId: "business",
      senderType: "business",
      isEcho: true,
      text: args.text,
      attachments: args.attachments,
      sentAt: args.sentAt,
      status: "sent",
    });

    const conv = await findConversation(
      ctx,
      workspaceId,
      platform,
      args.igsid,
    );

    const messagePreview =
      args.text && args.text.trim().length > 0
        ? `Vi: ${args.text.trim().slice(0, 96)}`
        : "Vi: [Prilog]";

    if (conv !== null) {
      await ctx.db.patch(conv._id, {
        lastBotMessageAt: args.sentAt,
        lastMessageText: messagePreview,
        lastMessageAt: args.sentAt,
        updatedAt: args.sentAt,
      });
    }

    return null;
  },
});

/**
 * Record an outgoing message sent directly from our Inbox UI.
 */
export const recordOutgoingMessage = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    platform: orPlatformValidator,
    igsid: v.string(),
    mid: v.string(),
    text: v.optional(v.string()),
    attachments: v.optional(
      v.array(
        v.object({
          type: v.string(),
          url: v.optional(v.string()),
          title: v.optional(v.string()),
        }),
      ),
    ),
    sentAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const platform = resolvePlatform(args.platform);

    // Dedup check
    const existing = await ctx.db
      .query("igMessages")
      .withIndex("by_workspace_mid", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("mid", args.mid),
      )
      .first();

    if (existing !== null) {
      return null;
    }

    await ctx.db.insert("igMessages", {
      workspaceId: args.workspaceId,
      platform,
      igsid: args.igsid,
      mid: args.mid,
      senderId: "business",
      senderType: "business",
      text: args.text,
      attachments: args.attachments,
      sentAt: args.sentAt,
      status: "sent",
    });

    const conv = await findConversation(
      ctx,
      args.workspaceId,
      platform,
      args.igsid,
    );

    const messagePreview =
      args.text && args.text.trim().length > 0
        ? `Vi: ${args.text.trim().slice(0, 96)}`
        : "Vi: [Prilog]";

    if (conv !== null) {
      await ctx.db.patch(conv._id, {
        lastBotMessageAt: args.sentAt,
        lastMessageText: messagePreview,
        lastMessageAt: args.sentAt,
        updatedAt: args.sentAt,
      });
    }

    return null;
  },
});

/**
 * Record or update a reaction on a message.
 */
export const recordReaction = internalMutation({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    platform: v.optional(orPlatformValidator),
    accountId: v.optional(v.string()),
    igsid: v.string(),
    mid: v.string(),
    emoji: v.optional(v.string()),
    action: v.union(v.literal("react"), v.literal("unreact")),
    actorId: v.string(),
    isOurs: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    let workspaceId = args.workspaceId;
    if (!workspaceId && args.accountId) {
      workspaceId = (await resolveWorkspace(
        ctx,
        resolvePlatform(args.platform),
        args.accountId,
      )) ?? undefined;
    }
    if (!workspaceId) return null;

    const message = await ctx.db
      .query("igMessages")
      .withIndex("by_workspace_mid", (q) =>
        q.eq("workspaceId", workspaceId).eq("mid", args.mid),
      )
      .first();

    if (message === null) {
      return null;
    }

    let reactions = message.reactions ?? [];

    if (args.action === "unreact") {
      reactions = reactions.filter((r) => r.actorId !== args.actorId);
    } else if (args.emoji) {
      // Remove any existing reaction from this actor and add new
      reactions = reactions.filter((r) => r.actorId !== args.actorId);
      reactions.push({
        emoji: args.emoji,
        actorId: args.actorId,
        isOurs: args.isOurs,
      });
    }

    await ctx.db.patch(message._id, { reactions });
    return null;
  },
});

/**
 * Record message edit from webhook.
 */
export const recordMessageEdit = internalMutation({
  args: {
    platform: orPlatformValidator,
    accountId: v.string(),
    mid: v.string(),
    text: v.string(),
    editedAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const platform = resolvePlatform(args.platform);
    const workspaceId = await resolveWorkspace(ctx, platform, args.accountId);
    if (workspaceId === null) {
      return null;
    }

    const message = await ctx.db
      .query("igMessages")
      .withIndex("by_workspace_mid", (q) =>
        q.eq("workspaceId", workspaceId).eq("mid", args.mid),
      )
      .first();

    if (message !== null) {
      await ctx.db.patch(message._id, {
        text: args.text,
        editedAt: args.editedAt,
      });
    }
    return null;
  },
});

/**
 * Upsert conversation data during full/delta Graph API sync.
 */
export const upsertConversationFromSync = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    platform: orPlatformValidator,
    igsid: v.string(),
    conversationId: v.optional(v.string()),
    username: v.optional(v.string()),
    name: v.optional(v.string()),
    profilePic: v.optional(v.string()),
    unreadCount: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const platform = resolvePlatform(args.platform);
    const conv = await findConversation(
      ctx,
      args.workspaceId,
      platform,
      args.igsid,
    );

    const now = Date.now();
    const updated = args.updatedAt ?? now;

    if (conv === null) {
      await ctx.db.insert("orConversations", {
        workspaceId: args.workspaceId,
        platform,
        igsid: args.igsid,
        conversationId: args.conversationId,
        username: args.username,
        name: args.name,
        profilePic: args.profilePic,
        unreadCount: args.unreadCount ?? 0,
        updatedAt: updated,
        createdAt: now,
      });
    } else {
      await ctx.db.patch(conv._id, {
        ...(args.conversationId !== undefined
          ? { conversationId: args.conversationId }
          : {}),
        ...(args.username !== undefined ? { username: args.username } : {}),
        ...(args.name !== undefined ? { name: args.name } : {}),
        ...(args.profilePic !== undefined
          ? { profilePic: args.profilePic }
          : {}),
        ...(args.unreadCount !== undefined
          ? { unreadCount: args.unreadCount }
          : {}),
        ...(args.updatedAt !== undefined ? { updatedAt: args.updatedAt } : {}),
      });
    }

    return null;
  },
});

/**
 * Upsert message row during full/delta Graph API sync.
 */
export const upsertMessageFromSync = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    platform: orPlatformValidator,
    igsid: v.string(),
    conversationId: v.optional(v.string()),
    mid: v.string(),
    senderId: v.string(),
    senderType: v.union(v.literal("user"), v.literal("business")),
    text: v.optional(v.string()),
    attachments: v.optional(
      v.array(
        v.object({
          type: v.string(),
          url: v.optional(v.string()),
          title: v.optional(v.string()),
        }),
      ),
    ),
    shares: v.optional(
      v.object({
        link: v.optional(v.string()),
        id: v.optional(v.string()),
      }),
    ),
    story: v.optional(
      v.object({
        id: v.optional(v.string()),
        url: v.optional(v.string()),
      }),
    ),
    reactions: v.optional(
      v.array(
        v.object({
          emoji: v.string(),
          actorId: v.string(),
          isOurs: v.boolean(),
        }),
      ),
    ),
    isUnsupported: v.optional(v.boolean()),
    sentAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const platform = resolvePlatform(args.platform);

    const existing = await ctx.db
      .query("igMessages")
      .withIndex("by_workspace_mid", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("mid", args.mid),
      )
      .first();

    if (existing === null) {
      await ctx.db.insert("igMessages", {
        workspaceId: args.workspaceId,
        platform,
        igsid: args.igsid,
        conversationId: args.conversationId,
        mid: args.mid,
        senderId: args.senderId,
        senderType: args.senderType,
        text: args.text,
        attachments: args.attachments,
        shares: args.shares,
        story: args.story,
        reactions: args.reactions,
        isUnsupported: args.isUnsupported,
        sentAt: args.sentAt,
        status: "delivered",
      });
    }

    return null;
  },
});
