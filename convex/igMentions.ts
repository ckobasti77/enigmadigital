import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v, ConvexError } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { decryptCredentials } from "./lib/crypto";
import {
  allowsBackground,
  createUsageTracker,
  readGate,
} from "./lib/metaRateLimit";
import {
  buildMentionedCommentContextUrl,
  buildMentionedMediaContextUrl,
  buildMentionReplyUrl,
  extractGraphApiError,
  extractGraphApiErrorCode,
  getMetaGraphVersion,
  type RawMentionedCommentResponse,
  type RawMentionedMediaResponse,
} from "./lib/instagramApi";
import {
  REPLY_TEXT_MAX,
  translateModerationError,
} from "./lib/igComments";
import type { ModerationContext } from "./igCommentsStore";

/**
 * ============================================================================
 * INSTAGRAM MENTIONS ACTIONS (G5, Node/V8 runtime)
 * ============================================================================
 *
 * 1. fetchMentionContext: Asynchronous context fetch scheduled by the webhook.
 *    Reads mentioned comment/media metadata through tracker.fetch.
 * 2. replyToMention: Posts a public reply to a mention (comment or caption)
 *    via POST /{ig-user-id}/mentions.
 * ============================================================================
 */

function invalid(message: string): never {
  throw new ConvexError({ code: "invalid", message });
}

function isPrivateAccountError(status: number, body: unknown): boolean {
  const code = extractGraphApiErrorCode(body);
  const msg = extractGraphApiError(body).toLowerCase();
  return (
    code === 10 ||
    code === 100 ||
    code === 200 ||
    msg.includes("private") ||
    msg.includes("privacy") ||
    msg.includes("unsupported get request") ||
    msg.includes("permission") ||
    msg.includes("cannot be loaded") ||
    msg.includes("not found")
  );
}

/**
 * Scheduled action: fetch context of a mentioned comment or caption.
 */
export const fetchMentionContext = internalAction({
  args: {
    mentionId: v.id("igMentions"),
    workspaceId: v.id("workspaces"),
    igUserId: v.string(),
    kind: v.union(v.literal("comment"), v.literal("caption")),
    commentId: v.optional(v.string()),
    mediaId: v.string(),
  },
  handler: async (ctx, args) => {
    const conn: Doc<"connections"> | null = await ctx.runQuery(
      internal.instagramStore.getWorkspaceConnection,
      {
        workspaceId: args.workspaceId,
        provider: "meta_ig",
      },
    );

    if (conn === null || !conn.encryptedCredentials) return;

    const gate = await readGate(ctx, args.workspaceId);
    if (!allowsBackground(gate)) return;

    let token: string;
    try {
      token = await decryptCredentials(conn.encryptedCredentials);
    } catch {
      return;
    }

    const version = getMetaGraphVersion();
    const tracker = createUsageTracker();

    try {
      if (args.kind === "comment" && args.commentId) {
        const url = buildMentionedCommentContextUrl(
          args.igUserId,
          args.commentId,
          token,
          version,
        );
        const res = await tracker.fetch(url);
        const raw = await res.text().catch(() => "");

        if (res.ok) {
          try {
            const data = JSON.parse(raw) as RawMentionedCommentResponse;
            const mc = data.mentioned_comment;
            const authorUsername = mc?.username;
            const permalink = mc?.media?.permalink;
            const timestamp = mc?.timestamp
              ? new Date(mc.timestamp).getTime()
              : undefined;

            await ctx.runMutation(
              internal.igMentionsStore.updateMentionContext,
              {
                mentionId: args.mentionId,
                authorUsername,
                permalink,
                timestamp:
                  timestamp && Number.isFinite(timestamp) ? timestamp : undefined,
                contextState: "value",
              },
            );
          } catch {
            await ctx.runMutation(
              internal.igMentionsStore.updateMentionContext,
              {
                mentionId: args.mentionId,
                contextState: "unavailable",
                contextReason: "Greška pri obradi odgovora.",
              },
            );
          }
        } else {
          const isPrivate = isPrivateAccountError(res.status, raw);
          await ctx.runMutation(
            internal.igMentionsStore.updateMentionContext,
            {
              mentionId: args.mentionId,
              contextState: isPrivate ? "suppressed" : "unavailable",
              contextReason: isPrivate
                ? "Izvorna objava je sa privatnog naloga."
                : "Kontekst spominjanja trenutno nije dostupan.",
            },
          );
        }
      } else {
        const url = buildMentionedMediaContextUrl(
          args.igUserId,
          args.mediaId,
          token,
          version,
        );
        const res = await tracker.fetch(url);
        const raw = await res.text().catch(() => "");

        if (res.ok) {
          try {
            const data = JSON.parse(raw) as RawMentionedMediaResponse;
            const mm = data.mentioned_media;
            const authorUsername = mm?.username;
            const permalink = mm?.permalink;
            const timestamp = mm?.timestamp
              ? new Date(mm.timestamp).getTime()
              : undefined;

            await ctx.runMutation(
              internal.igMentionsStore.updateMentionContext,
              {
                mentionId: args.mentionId,
                authorUsername,
                permalink,
                timestamp:
                  timestamp && Number.isFinite(timestamp) ? timestamp : undefined,
                contextState: "value",
              },
            );
          } catch {
            await ctx.runMutation(
              internal.igMentionsStore.updateMentionContext,
              {
                mentionId: args.mentionId,
                contextState: "unavailable",
                contextReason: "Greška pri obradi odgovora.",
              },
            );
          }
        } else {
          const isPrivate = isPrivateAccountError(res.status, raw);
          await ctx.runMutation(
            internal.igMentionsStore.updateMentionContext,
            {
              mentionId: args.mentionId,
              contextState: isPrivate ? "suppressed" : "unavailable",
              contextReason: isPrivate
                ? "Izvorna objava je sa privatnog naloga."
                : "Kontekst spominjanja trenutno nije dostupan.",
            },
          );
        }
      }
    } catch {
      await ctx.runMutation(internal.igMentionsStore.updateMentionContext, {
        mentionId: args.mentionId,
        contextState: "unavailable",
        contextReason: "Instagram nije odgovorio na zahtev za kontekst.",
      });
    } finally {
      await tracker.flush(ctx, args.workspaceId);
    }
  },
});

/**
 * Public action: reply to a mention.
 * POST /{ig-user-id}/mentions
 */
export const replyToMention = action({
  args: {
    mentionId: v.id("igMentions"),
    message: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const message = args.message.trim();
    if (message.length === 0) invalid("Odgovor ne može biti prazan.");
    if (message.length > REPLY_TEXT_MAX) {
      invalid(`Odgovor može imati najviše ${REPLY_TEXT_MAX} znakova.`);
    }

    const context: ModerationContext = await ctx.runQuery(
      internal.igCommentsStore.loadModerationContext,
      {},
    );
    if (context === null) {
      invalid(
        "Instagram nalog nije povezan. Poveži ga u Podešavanjima pa pokušaj ponovo.",
      );
    }

    let token: string;
    try {
      token = await decryptCredentials(context.encryptedCredentials);
    } catch {
      invalid(
        "Instagram kredencijali se ne mogu pročitati. Ponovo poveži nalog.",
      );
    }

    const mention = await ctx.runQuery(
      internal.igMentionsStore.getMentionForReply,
      {
        workspaceId: context.workspaceId,
        mentionId: args.mentionId,
      },
    );

    if (mention === null) {
      invalid("Spominjanje nije pronađeno.");
    }

    const version = getMetaGraphVersion();
    const tracker = createUsageTracker();
    const url = buildMentionReplyUrl(context.igUserId, version);

    const params = new URLSearchParams();
    params.set("access_token", token);
    params.set("message", message);
    if (mention.kind === "comment" && mention.commentId) {
      params.set("comment_id", mention.commentId);
    } else {
      params.set("media_id", mention.mediaId);
    }

    let res: Response;
    try {
      res = await tracker.fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
    } catch {
      await tracker.flush(ctx, context.workspaceId);
      invalid(
        "Instagram nije odgovorio. Proveri vezu i pokušaj ponovo za koji trenutak.",
      );
    }

    await tracker.flush(ctx, context.workspaceId);

    const raw = await res.text().catch(() => "");
    const ok = res.ok;
    const errorMessage = ok ? undefined : translateModerationError(raw);

    // Log to igModerationLogs
    await ctx.runMutation(internal.igCommentsStore.logModeration, {
      workspaceId: context.workspaceId,
      userId: context.userId,
      action: "reply",
      commentId: mention.commentId,
      mediaId: mention.mediaId,
      text: message,
      username: mention.authorUsername,
      status: ok ? "done" : "failed",
      ...(errorMessage ? { errorMessage } : {}),
    });

    if (!ok) {
      invalid(errorMessage ?? "Slanje odgovora na spominjanje nije uspelo.");
    }

    // Record reply timestamp and text on the mention row
    await ctx.runMutation(internal.igMentionsStore.recordMentionReply, {
      workspaceId: context.workspaceId,
      mentionId: args.mentionId,
      replyText: message,
    });

    return null;
  },
});
