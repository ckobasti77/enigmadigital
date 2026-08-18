import { internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { decryptCredentials } from "./lib/crypto";
import {
  buildCommentThreadsUrl,
  extractYouTubeApiError,
  fetchAccessToken,
  parseYouTubeCredentials,
  youtubeApiErrorReason,
} from "./lib/youtubeApi";
import { readUnitsUsed } from "./ytIngest";
import { QUOTA_COST, canAfford } from "./lib/ytQuota";

/**
 * YouTube comment poller (Y4).
 *
 * Instagram pushes comments at us through a webhook; YouTube does not. Its
 * push notifications only fire for a NEW VIDEO, never for a comment, so the
 * only way to hear about one is to ask. This action asks — every few minutes,
 * one page at a time — and hands whatever is new to `ytIngest.ingestComment`.
 *
 * Reading is the cheap half: `commentThreads.list` costs 1 unit per page of up
 * to 100 comments. Answering is the expensive half, at 50 units a reply, and
 * that budget is guarded in ytQuota.ts / ytIngest.ts rather than here.
 *
 * Deliberately NOT wrapped in `runSync`: those rows are the Sync Health widget
 * for the 6-hourly analytics sync, and a poll every 15 minutes would bury it.
 * What the poller does is visible in `ytCommentLogs`; what breaks its
 * credentials shows up on the analytics sync, which uses the same ones.
 */

// One page is 100 comments; two is more than any channel of ours produces in
// a poll interval, and each page is another unit off the daily budget.
const MAX_PAGES = 2;
const PAGE_SIZE = 100;

/**
 * How far back a comment may be and still get an automatic answer.
 *
 * Two jobs. It keeps the first poll after switching the engine on from
 * answering years of backlog in one burst, and it keeps the engine from
 * replying to something nobody has looked at in days, which reads as a bot
 * rather than as attention.
 */
const COMMENT_MAX_AGE_MS = 48 * 60 * 60 * 1000;

type PollContext = {
  workspaceId: Id<"workspaces">;
  channelId: string;
  encryptedCredentials: string;
  hasActiveAutomations: boolean;
  unitsUsed: number;
} | null;

/**
 * Everything the poll needs before it spends a single unit: whose channel,
 * which credentials, whether anything is listening, and what today's budget
 * looks like.
 */
export const loadPollContext = internalQuery({
  args: { connectionId: v.id("connections") },
  returns: v.union(
    v.null(),
    v.object({
      workspaceId: v.id("workspaces"),
      channelId: v.string(),
      encryptedCredentials: v.string(),
      hasActiveAutomations: v.boolean(),
      unitsUsed: v.number(),
    }),
  ),
  handler: async (ctx, { connectionId }) => {
    const conn = await ctx.db.get(connectionId);
    if (conn === null || conn.provider !== "youtube") return null;
    if (conn.status !== "active") return null;

    const channelId = (conn.externalId ?? "").trim();
    if (channelId.length === 0) return null;

    const active = await ctx.db
      .query("ytAutomations")
      .withIndex("by_workspace_active", (q) =>
        q.eq("workspaceId", conn.workspaceId).eq("isActive", true),
      )
      .first();

    return {
      workspaceId: conn.workspaceId,
      channelId,
      encryptedCredentials: conn.encryptedCredentials,
      hasActiveAutomations: active !== null,
      unitsUsed: await readUnitsUsed(ctx, conn.workspaceId),
    };
  },
});

// ── commentThreads.list response ─────────────────────────────────────────────

type CommentThreadsResponse = {
  items?: {
    snippet?: {
      videoId?: string;
      topLevelComment?: {
        id?: string;
        snippet?: {
          textOriginal?: string;
          textDisplay?: string;
          authorDisplayName?: string;
          authorChannelId?: { value?: string };
          publishedAt?: string;
        };
      };
    };
  }[];
  nextPageToken?: string;
};

type IncomingComment = {
  commentId: string;
  videoId: string;
  authorName?: string;
  authorChannelId?: string;
  text: string;
  publishedAt: number;
};

/** Flatten one page into the fields the ingest mutation takes. */
function readPage(page: CommentThreadsResponse): IncomingComment[] {
  const out: IncomingComment[] = [];
  for (const item of page.items ?? []) {
    const top = item.snippet?.topLevelComment;
    const snippet = top?.snippet;
    const commentId = top?.id;
    if (!commentId || !snippet) continue;

    // `textOriginal` is the raw text; `textDisplay` carries YouTube's HTML.
    // Match against the raw text — the display form would put markup between
    // a keyword and its word boundary.
    const text = snippet.textOriginal ?? snippet.textDisplay ?? "";
    if (text.trim().length === 0) continue;

    out.push({
      commentId,
      // Absent on a comment left on the channel itself rather than a video.
      videoId: item.snippet?.videoId ?? "",
      authorName: snippet.authorDisplayName,
      authorChannelId: snippet.authorChannelId?.value,
      text,
      publishedAt: Date.parse(snippet.publishedAt ?? "") || 0,
    });
  }
  return out;
}

export const pollComments = internalAction({
  args: { connectionId: v.id("connections") },
  returns: v.null(),
  handler: async (ctx, { connectionId }): Promise<null> => {
    const context: PollContext = await ctx.runQuery(
      internal.ytPoll.loadPollContext,
      { connectionId },
    );
    if (context === null) return null;

    // Nothing is listening — do not spend a unit finding that out again.
    if (!context.hasActiveAutomations) return null;

    // No budget even to read. Reading is 1 unit, so this only trips once the
    // day's replies have already eaten the allowance.
    if (!canAfford(context.unitsUsed, QUOTA_COST.commentThreadsList)) {
      return null;
    }

    const { workspaceId, channelId } = context;

    let token: string;
    try {
      const creds = parseYouTubeCredentials(
        await decryptCredentials(context.encryptedCredentials),
      );
      token = await fetchAccessToken(creds);
    } catch (err) {
      console.warn(
        "YouTube: komentari nisu povučeni —",
        err instanceof Error ? err.message : String(err),
      );
      return null;
    }

    const cutoff = Date.now() - COMMENT_MAX_AGE_MS;
    const comments: IncomingComment[] = [];
    let unitsSpent = 0;
    let pageToken: string | undefined = undefined;
    let reachedBacklog = false;

    for (let page = 0; page < MAX_PAGES; page++) {
      if (
        !canAfford(
          context.unitsUsed + unitsSpent,
          QUOTA_COST.commentThreadsList,
        )
      ) {
        break;
      }

      let body: CommentThreadsResponse;
      try {
        const res = await fetch(
          buildCommentThreadsUrl({
            channelId,
            maxResults: PAGE_SIZE,
            pageToken,
          }),
          { headers: { Authorization: `Bearer ${token}` } },
        );
        // The read is metered whether or not it answers, so book it either way.
        unitsSpent += QUOTA_COST.commentThreadsList;

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          if (
            res.status === 403 &&
            youtubeApiErrorReason(text) === "quotaExceeded"
          ) {
            // Nothing to do but wait for the reset (midnight Pacific).
            break;
          }
          console.warn(
            "YouTube: commentThreads.list —",
            extractYouTubeApiError(text),
          );
          break;
        }
        body = (await res.json()) as CommentThreadsResponse;
      } catch (err) {
        console.warn(
          "YouTube: commentThreads.list —",
          extractYouTubeApiError(
            err instanceof Error ? err.message : String(err),
          ),
        );
        break;
      }

      for (const comment of readPage(body)) {
        // Our own replies are not top-level comments and never come back here,
        // but a comment the channel itself left is — and answering ourselves
        // is the one loop this engine must not close.
        if (comment.authorChannelId === channelId) continue;
        if (comment.publishedAt < cutoff) {
          reachedBacklog = true;
          continue;
        }
        comments.push(comment);
      }

      // `order=time` is newest first, so once a page runs into the age cutoff
      // every page after it is older still.
      pageToken = body.nextPageToken;
      if (!pageToken || reachedBacklog) break;
    }

    // Book the reads before ingesting, so the affordability check each match
    // makes is against a budget that already includes them.
    if (unitsSpent > 0) {
      await ctx.runMutation(internal.ytIngest.recordQuotaUsage, {
        workspaceId,
        units: unitsSpent,
      });
    }

    // Oldest first: people get answered in the order they wrote, and if the
    // budget runs out mid-run it runs out on the newest comments.
    comments.sort((a, b) => a.publishedAt - b.publishedAt);

    for (const comment of comments) {
      const result: string = await ctx.runMutation(
        internal.ytIngest.ingestComment,
        {
          workspaceId,
          commentId: comment.commentId,
          videoId: comment.videoId,
          authorName: comment.authorName,
          authorChannelId: comment.authorChannelId,
          text: comment.text,
        },
      );

      // The budget is gone. Every remaining match would log the same refusal,
      // so stop and leave them unprocessed — the next run picks them up if the
      // quota has reset by then.
      if (result === "skipped_quota" || result === "ignored_engine_off") break;
    }

    return null;
  },
});

/**
 * Cron fan-out: poll every connected YouTube channel. One channel's failure is
 * logged and stepped over so it cannot block the rest.
 */
export const pollAllYouTubeComments = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const connectionIds = await ctx.runQuery(
      internal.connections.listByProvider,
      { provider: "youtube" },
    );
    for (const connectionId of connectionIds) {
      try {
        await ctx.runAction(internal.ytPoll.pollComments, { connectionId });
      } catch (err) {
        console.warn(
          "YouTube: obilazak komentara nije uspeo —",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
    return null;
  },
});
