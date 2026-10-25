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
import { QUOTA_COST } from "./lib/ytQuota";
import { CRON_LOCKS, withCronLock } from "./lib/cronLock";
import type { RezultatRezervacije } from "./globalneKvoteStore";

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

/**
 * How many recent videos the per-video fallback walks when the channel-wide
 * sweep is unsupported. Ten pages costs ten units — still nothing against the
 * daily budget — and anything older would be past the 48h cutoff anyway.
 */
const FALLBACK_VIDEO_COUNT = 10;

type PollContext = {
  workspaceId: Id<"workspaces">;
  channelId: string;
  encryptedCredentials: string;
  hasActiveAutomations: boolean;
  /** Newest videos first — the per-video fallback walks these. */
  recentVideoIds: string[];
} | null;

/**
 * Everything the poll needs before it spends a single unit: whose channel,
 * which credentials and whether anything is listening. The budget is not read
 * here: every page is reserved against the shared counter right before it is
 * fetched (`globalneKvoteStore.rezervisi`).
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
      recentVideoIds: v.array(v.string()),
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

    // Only needed if the channel-wide sweep turns out to be unsupported, but
    // it is a single indexed read and the poll cannot go back for it later.
    const recent = await ctx.db
      .query("ytVideoStats")
      .withIndex("by_workspace_published", (q) =>
        q.eq("workspaceId", conn.workspaceId),
      )
      .order("desc")
      .take(FALLBACK_VIDEO_COUNT);

    return {
      workspaceId: conn.workspaceId,
      channelId,
      encryptedCredentials: conn.encryptedCredentials,
      hasActiveAutomations: active !== null,
      recentVideoIds: recent.map((v) => v.videoId),
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

    const { workspaceId, channelId, recentVideoIds } = context;

    // One page costs 1 unit, reserved — this project's share and the shared
    // counter of all projects together — before it is fetched. No budget even
    // to read only happens once the day's replies have eaten the allowance.
    const reserveRead = async (): Promise<boolean> => {
      const rezervacija: RezultatRezervacije = await ctx.runMutation(
        internal.globalneKvoteStore.rezervisi,
        {
          kljuc: "youtube",
          klasa: "odgovori",
          workspaceId,
          trosak: QUOTA_COST.commentThreadsList,
        },
      );
      return rezervacija.ok;
    };
    // The request never reached Google (DNS, TLS, a dropped socket): nothing
    // was metered, so the reserved unit goes back.
    const refundRead = async (): Promise<void> => {
      await ctx.runMutation(internal.globalneKvoteStore.vrati, {
        kljuc: "youtube",
        klasa: "odgovori",
        workspaceId,
        trosak: QUOTA_COST.commentThreadsList,
      });
    };

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

    /**
     * Page through commentThreads for one scope: the whole channel when
     * `videoId` is undefined, a single video otherwise.
     *
     * `unsupported` comes back true only when YouTube rejects the channel-wide
     * parameter outright (400/404). That is not an error to log and forget —
     * it means the cheap sweep will never work on this account, so the caller
     * walks recent videos instead of silently collecting nothing on every run
     * from here on.
     */
    const collect = async (
      videoId?: string,
    ): Promise<{
      comments: IncomingComment[];
      unsupported: boolean;
      outOfBudget: boolean;
    }> => {
      const found: IncomingComment[] = [];
      let pageToken: string | undefined = undefined;
      let reachedBacklog = false;
      let outOfBudget = false;

      for (let page = 0; page < MAX_PAGES; page++) {
        if (!(await reserveRead())) {
          outOfBudget = true;
          break;
        }

        let body: CommentThreadsResponse;
        let res: Response;
        try {
          res = await fetch(
            buildCommentThreadsUrl({
              channelId,
              videoId,
              maxResults: PAGE_SIZE,
              pageToken,
            }),
            { headers: { Authorization: `Bearer ${token}` } },
          );
        } catch (err) {
          await refundRead();
          console.warn(
            "YouTube: commentThreads.list —",
            extractYouTubeApiError(
              err instanceof Error ? err.message : String(err),
            ),
          );
          break;
        }
        // The read is metered whether or not it answers; it was reserved above.
        try {
          if (!res.ok) {
            const text = await res.text().catch(() => "");
            if (
              res.status === 403 &&
              youtubeApiErrorReason(text) === "quotaExceeded"
            ) {
              // The Google Cloud budget behind every project is gone: close
              // the shared counter and wait for the reset (midnight Pacific).
              await ctx.runMutation(
                internal.globalneKvoteStore.zatvoriYoutubeDan,
                {},
              );
              outOfBudget = true;
              break;
            }
            // Only the channel-wide sweep can be unsupported; a per-video
            // request failing the same way is a genuine fault.
            if (
              videoId === undefined &&
              (res.status === 400 || res.status === 404)
            ) {
              console.warn(
                "YouTube: allThreadsRelatedToChannelId nije podržan na ovom nalogu — prelazim na obilazak videa.",
                extractYouTubeApiError(text),
              );
              return { comments: found, unsupported: true, outOfBudget };
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
          found.push(comment);
        }

        // `order=time` is newest first, so once a page runs into the age cutoff
        // every page after it is older still.
        pageToken = body.nextPageToken;
        if (!pageToken || reachedBacklog) break;
      }

      return { comments: found, unsupported: false, outOfBudget };
    };

    const sweep = await collect();
    const comments: IncomingComment[] = [...sweep.comments];

    if (sweep.unsupported && !sweep.outOfBudget) {
      for (const videoId of recentVideoIds) {
        const perVideo = await collect(videoId);
        comments.push(...perVideo.comments);
        if (perVideo.outOfBudget) break;
      }
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
 * Cron fan-out: poll every connected YouTube channel, one project after
 * another (oldest sync first) under one lock. Before each project the shared
 * budget is read: when the whole pool is spent the pass stops, and a project
 * without its share and without room to borrow is skipped while the next one
 * carries on. One channel's failure is logged and stepped over so it cannot
 * block the rest.
 */
export const pollAllYouTubeComments = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await withCronLock(ctx, CRON_LOCKS.ytPoll, async () => {
      const veze = await ctx.runQuery(
        internal.connections.listByProviderRedom,
        { provider: "youtube" },
      );
      for (const { connectionId, workspaceId } of veze) {
        const stanje = await ctx.runQuery(internal.globalneKvoteStore.stanje, {
          kljuc: "youtube",
          klasa: "odgovori",
          workspaceId,
        });
        if (stanje.ukupno + QUOTA_COST.commentThreadsList > stanje.Z) break;
        if (stanje.dostupno < QUOTA_COST.commentThreadsList) continue;
        try {
          await ctx.runAction(internal.ytPoll.pollComments, { connectionId });
        } catch (err) {
          console.warn(
            "YouTube: obilazak komentara nije uspeo —",
            err instanceof Error ? err.message : String(err),
          );
        }
      }
    });
    return null;
  },
});
