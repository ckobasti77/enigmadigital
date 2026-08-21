import { action, internalQuery } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import { requireMembership } from "./lib/auth";
import { decryptCredentials } from "./lib/crypto";
import { createUsageTracker } from "./lib/metaRateLimit";
import {
  getMetaGraphVersion,
  buildConversationsUrl,
  buildConversationMessagesUrl,
  extractGraphApiError,
} from "./lib/instagramApi";
import { translateModerationError } from "./lib/igComments";

interface RawParticipant {
  id?: string;
  username?: string;
  name?: string;
  profile_picture_url?: string;
}

interface RawConversation {
  id?: string;
  updated_time?: string;
  unread_count?: number;
  participants?: {
    data?: RawParticipant[];
  };
}

interface RawConversationsResponse {
  data?: RawConversation[];
}

interface RawAttachmentData {
  image_data?: { url?: string };
  video_data?: { url?: string };
  file_url?: string;
  mime_type?: string;
  name?: string;
  type?: string;
  payload?: { url?: string };
}

interface RawReactionData {
  reaction?: string;
  emoji?: string;
  users?: Array<{ id?: string; username?: string }>;
}

interface RawMessage {
  id?: string;
  created_time?: string;
  from?: { id?: string; username?: string };
  to?: { data?: Array<{ id?: string; username?: string }> };
  message?: string;
  text?: string;
  attachments?: { data?: RawAttachmentData[] };
  shares?: { data?: Array<{ link?: string; id?: string }> };
  story?: { id?: string; url?: string };
  reactions?: { data?: RawReactionData[] };
  is_unsupported?: boolean;
}

interface RawMessagesResponse {
  data?: RawMessage[];
}

function parseIsoTimestamp(iso?: string): number {
  if (!iso) return Date.now();
  const parsed = new Date(iso).getTime();
  return Number.isFinite(parsed) ? parsed : Date.now();
}

/**
 * Internal query to resolve membership and credentials for sync action.
 */
export const loadSyncContext = internalQuery({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      workspaceId: v.id("workspaces"),
      igUserId: v.string(),
      encryptedCredentials: v.string(),
    }),
  ),
  handler: async (ctx) => {
    const { workspaceId } = await requireMembership(ctx);

    const igConn = await ctx.db
      .query("connections")
      .withIndex("by_workspace_provider", (q) =>
        q.eq("workspaceId", workspaceId).eq("provider", "meta_ig"),
      )
      .first();

    if (
      igConn === null ||
      igConn.status === "disconnecting" ||
      !igConn.externalId ||
      !igConn.encryptedCredentials
    ) {
      return null;
    }

    return {
      workspaceId,
      igUserId: igConn.externalId,
      encryptedCredentials: igConn.encryptedCredentials,
    };
  },
});

/**
 * Action to sync conversations and messages on-demand from Instagram Graph API.
 * Pulls up to 20 conversations and up to 20 messages per conversation (Graph API limit).
 */
export const syncConversations = action({
  args: {},
  returns: v.object({
    syncedConversations: v.number(),
    syncedMessages: v.number(),
  }),
  handler: async (ctx) => {
    const syncContext = await ctx.runQuery(
      internal.instagramInbox.loadSyncContext,
      {},
    );

    if (syncContext === null) {
      throw new ConvexError({
        code: "invalid",
        message: "Instagram nalog nije povezan.",
      });
    }

    const { workspaceId, igUserId, encryptedCredentials } = syncContext;

    let token: string;
    try {
      token = await decryptCredentials(encryptedCredentials);
    } catch {
      throw new ConvexError({
        code: "invalid",
        message: "Neuspela dekripcija Instagram tokena.",
      });
    }

    const version = getMetaGraphVersion();
    const tracker = createUsageTracker();
    let conversationCount = 0;
    let messageCount = 0;

    try {
      // 1. Fetch conversations
      const convUrl = new URL(
        buildConversationsUrl(igUserId, version, 20),
      );
      convUrl.searchParams.set("access_token", token);

      const convRes = await tracker.fetch(convUrl.toString());
      if (!convRes.ok) {
        const errText = await convRes.text().catch(() => "");
        throw new ConvexError({
          code: "invalid",
          message: translateModerationError(errText),
        });
      }

      const convData =
        ((await convRes.json().catch(() => ({}))) as RawConversationsResponse)
          .data ?? [];

      for (const conv of convData) {
        if (!conv.id) continue;
        conversationCount++;

        // Find participant who is NOT the connected account
        const participants = conv.participants?.data ?? [];
        const otherParticipant =
          participants.find((p) => p.id !== igUserId) ??
          participants[0];
        const igsid = otherParticipant?.id;
        if (!igsid) continue;

        const updatedTime = parseIsoTimestamp(conv.updated_time);

        await ctx.runMutation(
          internal.instagramInboxStore.upsertConversationFromSync,
          {
            workspaceId,
            platform: "instagram",
            igsid,
            conversationId: conv.id,
            username: otherParticipant.username,
            name: otherParticipant.name,
            profilePic: otherParticipant.profile_picture_url,
            unreadCount: conv.unread_count,
            updatedAt: updatedTime,
          },
        );

        // 2. Fetch up to 20 messages for this conversation (Graph API max limit)
        try {
          const msgUrl = new URL(
            buildConversationMessagesUrl(conv.id, version, 20),
          );
          msgUrl.searchParams.set("access_token", token);

          const msgRes = await tracker.fetch(msgUrl.toString());
          if (msgRes.ok) {
            const msgData =
              ((await msgRes.json().catch(() => ({}))) as RawMessagesResponse)
                .data ?? [];

            for (const msg of msgData) {
              if (!msg.id) continue;
              messageCount++;

              const isFromMe = msg.from?.id === igUserId;
              const senderId = msg.from?.id ?? (isFromMe ? "business" : igsid);
              const senderType = isFromMe ? "business" : "user";
              const sentAt = parseIsoTimestamp(msg.created_time);
              const text = msg.message ?? msg.text;

              // Format attachments
              const attachments = (msg.attachments?.data ?? []).flatMap(
                (att) => {
                  const url =
                    att.image_data?.url ??
                    att.video_data?.url ??
                    att.file_url ??
                    att.payload?.url;
                  const type =
                    att.type ?? (att.image_data ? "image" : "file");
                  if (!url && type !== "like_heart") return [];
                  return [{ type, url, title: att.name }];
                },
              );

              // Format reactions
              const reactions = (msg.reactions?.data ?? []).flatMap((r) => {
                const emoji = r.reaction ?? r.emoji;
                if (!emoji) return [];
                const users = r.users ?? [];
                return users.map((u) => ({
                  emoji,
                  actorId: u.id ?? "",
                  isOurs: u.id === igUserId,
                }));
              });

              // Format shares
              const share = msg.shares?.data?.[0];
              const shares = share ? { link: share.link, id: share.id } : undefined;

              await ctx.runMutation(
                internal.instagramInboxStore.upsertMessageFromSync,
                {
                  workspaceId,
                  platform: "instagram",
                  igsid,
                  conversationId: conv.id,
                  mid: msg.id,
                  senderId,
                  senderType,
                  text,
                  attachments: attachments.length > 0 ? attachments : undefined,
                  shares,
                  story: msg.story,
                  reactions: reactions.length > 0 ? reactions : undefined,
                  isUnsupported: msg.is_unsupported === true,
                  sentAt,
                },
              );
            }
          }
        } catch {
          // Catch per conversation
        }
      }
    } catch (err) {
      if (err instanceof ConvexError) throw err;
      const raw = err instanceof Error ? err.message : String(err);
      throw new ConvexError({
        code: "invalid",
        message: extractGraphApiError(raw).slice(0, 300),
      });
    } finally {
      await tracker.flush(ctx, workspaceId);
    }

    return {
      syncedConversations: conversationCount,
      syncedMessages: messageCount,
    };
  },
});
