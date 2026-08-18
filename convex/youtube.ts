import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { decryptCredentials } from "./lib/crypto";
import { runSync } from "./lib/runSync";
import {
  YOUTUBE_ANALYTICS_REPORTS_URL,
  YOUTUBE_DATA_API_BASE_URL,
  extractYouTubeApiError,
  fetchAccessToken,
  parseYouTubeCredentials,
  youtubeApiErrorReason,
  type YouTubeAnalyticsReport,
} from "./lib/youtubeApi";

/**
 * YouTube sync (Y2). Pulls a 90-day channel snapshot into `ytDailyTotals`,
 * `ytVideoStats` and `ytTrafficSources`.
 *
 * Runs in the default V8 runtime, not `"use node"`: everything here is `fetch`
 * plus `decryptCredentials`, which is Web Crypto and works in both runtimes.
 *
 * Per run:
 *   a) OAuth refresh → access token
 *   b) Analytics API: day-level channel totals
 *   c) Analytics API: day × traffic-source breakdown
 *   d) Data API: uploads playlist → video IDs → video metadata (4 units total)
 *   e) Analytics API: per-video watch time, merged onto (d)
 *   f) one `upsertSnapshot` mutation
 *
 * All of it runs inside `runSync`, so a revoked token or exhausted quota lands
 * as a clean `syncRuns` error row instead of an unhandled crash.
 */

const WINDOW_DAYS = 90;
const VIDEO_PAGE_SIZE = 50; // playlistItems / videos.list max per call
const MAX_VIDEO_PAGES = 2; // → at most 100 videos per sync
const VIDEO_ANALYTICS_LIMIT = 100;

// ── date helpers (UTC) ───────────────────────────────────────────────────────

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** The reporting window as "YYYY-MM-DD": 90 days back through today. */
function reportWindow(): { startDate: string; endDate: string } {
  const now = Date.now();
  return {
    startDate: isoDay(now - (WINDOW_DAYS - 1) * 86_400_000),
    endDate: isoDay(now),
  };
}

/** YouTube statistics arrive as strings, and can be missing entirely. */
function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

// ── HTTP plumbing ────────────────────────────────────────────────────────────

/** Authenticated GET against either YouTube API, with quota-aware errors. */
async function ytGet<T>(url: string, token: string, api: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // The Data API's daily unit budget (10 000 by default) is spent. It resets
    // at midnight Pacific time; nothing to do but wait for the next cron run.
    if (res.status === 403 && youtubeApiErrorReason(body) === "quotaExceeded") {
      throw new Error(
        "YouTube API dnevna kvota je potrošena. Podaci će se osvežiti kada se kvota resetuje (ponoć po pacifičkom vremenu).",
      );
    }
    throw new Error(`${api} ${res.status}: ${extractYouTubeApiError(body)}`);
  }

  return (await res.json()) as T;
}

/**
 * Turn a positional Analytics report into name-keyed rows. `columnHeaders` is
 * the only reliable way to know what each cell means — the API does not
 * guarantee the order matches the requested `metrics` string.
 */
function mapReport(
  report: YouTubeAnalyticsReport,
): Record<string, string | number>[] {
  const headers = (report.columnHeaders ?? []).map((h) => h.name ?? "");
  // A report with no data omits `rows` entirely; that is zero rows, not an error.
  return (report.rows ?? []).map((row) => {
    const mapped: Record<string, string | number> = {};
    headers.forEach((name, i) => {
      if (name) mapped[name] = row[i];
    });
    return mapped;
  });
}

/**
 * Build an Analytics API report URL.
 *
 * `ids=channel==MINE` reports on the channel that OWNS the refresh token — it
 * cannot report on an arbitrary channel ID. If the connected Google account is
 * not the channel owner (or manages several channels), this returns that
 * account's own channel, not `conn.externalId`.
 */
function analyticsUrl(params: {
  startDate: string;
  endDate: string;
  metrics: string;
  dimensions: string;
  sort?: string;
  maxResults?: number;
}): string {
  const url = new URL(YOUTUBE_ANALYTICS_REPORTS_URL);
  url.searchParams.set("ids", "channel==MINE");
  url.searchParams.set("startDate", params.startDate);
  url.searchParams.set("endDate", params.endDate);
  url.searchParams.set("metrics", params.metrics);
  url.searchParams.set("dimensions", params.dimensions);
  if (params.sort) url.searchParams.set("sort", params.sort);
  if (params.maxResults !== undefined) {
    url.searchParams.set("maxResults", String(params.maxResults));
  }
  return url.toString();
}

function dataApiUrl(path: string, params: Record<string, string>): string {
  const url = new URL(`${YOUTUBE_DATA_API_BASE_URL}/${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

// ── Data API response shapes ─────────────────────────────────────────────────

type ChannelsListResponse = {
  items?: {
    contentDetails?: { relatedPlaylists?: { uploads?: string } };
  }[];
};

type PlaylistItemsResponse = {
  items?: { contentDetails?: { videoId?: string } }[];
  nextPageToken?: string;
};

type VideosListResponse = {
  items?: {
    id?: string;
    snippet?: {
      title?: string;
      publishedAt?: string;
      thumbnails?: Record<string, { url?: string } | undefined>;
    };
    statistics?: {
      viewCount?: string;
      likeCount?: string;
      commentCount?: string;
    };
    contentDetails?: { duration?: string };
  }[];
};

/** Best available thumbnail, preferring larger renditions. */
function pickThumbnail(
  thumbnails: Record<string, { url?: string } | undefined> | undefined,
): string | undefined {
  if (!thumbnails) return undefined;
  for (const size of ["maxres", "standard", "high", "medium", "default"]) {
    const url = thumbnails[size]?.url;
    if (url) return url;
  }
  return undefined;
}

// ── sync action ──────────────────────────────────────────────────────────────

export const syncYouTube = internalAction({
  args: { connectionId: v.id("connections") },
  handler: async (ctx, { connectionId }) => {
    const conn = await ctx.runQuery(internal.connections.getForSync, {
      connectionId,
    });
    if (conn === null) throw new Error("YouTube konekcija nije pronađena.");
    if (conn.provider !== "youtube") {
      throw new Error("Konekcija nije YouTube konekcija.");
    }
    const workspaceId = conn.workspaceId;

    await runSync(
      ctx,
      { workspaceId, provider: "youtube", connectionId },
      async () => {
        // a) credentials
        const channelId = (conn.externalId ?? "").trim();
        if (!channelId) throw new Error("Nedostaje YouTube Channel ID.");

        const creds = parseYouTubeCredentials(
          await decryptCredentials(conn.encryptedCredentials),
        );
        const token = await fetchAccessToken(creds);

        const { startDate, endDate } = reportWindow();
        const ANALYTICS = "YouTube Analytics API";
        const DATA = "YouTube Data API";

        // b) channel daily totals
        const dailyReport = await ytGet<YouTubeAnalyticsReport>(
          analyticsUrl({
            startDate,
            endDate,
            metrics:
              "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,subscribersLost,likes,comments,shares",
            dimensions: "day",
            sort: "day",
          }),
          token,
          ANALYTICS,
        );
        const dailyTotals = mapReport(dailyReport)
          .filter((r) => typeof r.day === "string" && r.day !== "")
          .map((r) => ({
            date: String(r.day),
            views: toNumber(r.views),
            estimatedMinutesWatched: toNumber(r.estimatedMinutesWatched),
            averageViewDuration: toNumber(r.averageViewDuration),
            averageViewPercentage: toNumber(r.averageViewPercentage),
            subscribersGained: toNumber(r.subscribersGained),
            subscribersLost: toNumber(r.subscribersLost),
            likes: toNumber(r.likes),
            comments: toNumber(r.comments),
            shares: toNumber(r.shares),
          }));

        // c) traffic sources per day
        const trafficReport = await ytGet<YouTubeAnalyticsReport>(
          analyticsUrl({
            startDate,
            endDate,
            metrics: "views,estimatedMinutesWatched",
            dimensions: "day,insightTrafficSourceType",
          }),
          token,
          ANALYTICS,
        );
        const trafficSources = mapReport(trafficReport)
          .filter(
            (r) =>
              typeof r.day === "string" &&
              r.day !== "" &&
              typeof r.insightTrafficSourceType === "string",
          )
          .map((r) => ({
            date: String(r.day),
            sourceType: String(r.insightTrafficSourceType),
            views: toNumber(r.views),
            estimatedMinutesWatched: toNumber(r.estimatedMinutesWatched),
          }));

        // d) video list via the uploads playlist.
        //    NEVER use search.list here: it costs 100 units per call (vs 1) and
        //    has its own 100-calls/day cap. channels + playlistItems + videos
        //    gets the same data for 4 units.
        const channelsRes = await ytGet<ChannelsListResponse>(
          dataApiUrl("channels", { part: "contentDetails", id: channelId }),
          token,
          DATA,
        );
        const uploadsPlaylistId =
          channelsRes.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
        if (!uploadsPlaylistId) {
          throw new Error(
            "YouTube kanal nije pronađen ili nema uploads plejlistu.",
          );
        }

        const videoIds: string[] = [];
        let pageToken: string | undefined = undefined;
        for (let page = 0; page < MAX_VIDEO_PAGES; page++) {
          const pageRes: PlaylistItemsResponse =
            await ytGet<PlaylistItemsResponse>(
              dataApiUrl("playlistItems", {
                part: "contentDetails",
                playlistId: uploadsPlaylistId,
                maxResults: String(VIDEO_PAGE_SIZE),
                ...(pageToken ? { pageToken } : {}),
              }),
              token,
              DATA,
            );
          for (const item of pageRes.items ?? []) {
            const id = item.contentDetails?.videoId;
            if (id) videoIds.push(id);
          }
          pageToken = pageRes.nextPageToken;
          if (!pageToken) break;
        }

        const videos: {
          videoId: string;
          title: string;
          publishedAt: number;
          thumbnailUrl?: string;
          duration?: string;
          views: number;
          likes: number;
          comments: number;
          estimatedMinutesWatched?: number;
          averageViewPercentage?: number;
        }[] = [];

        for (let i = 0; i < videoIds.length; i += VIDEO_PAGE_SIZE) {
          const batch = videoIds.slice(i, i + VIDEO_PAGE_SIZE);
          const videosRes = await ytGet<VideosListResponse>(
            dataApiUrl("videos", {
              part: "snippet,statistics,contentDetails",
              id: batch.join(","),
            }),
            token,
            DATA,
          );
          for (const item of videosRes.items ?? []) {
            if (!item.id) continue;
            videos.push({
              videoId: item.id,
              title: item.snippet?.title ?? "(bez naslova)",
              publishedAt: Date.parse(item.snippet?.publishedAt ?? "") || 0,
              thumbnailUrl: pickThumbnail(item.snippet?.thumbnails),
              duration: item.contentDetails?.duration,
              // statistics are strings, and likeCount is absent when the
              // creator hides likes.
              views: toNumber(item.statistics?.viewCount),
              likes: toNumber(item.statistics?.likeCount),
              comments: toNumber(item.statistics?.commentCount),
            });
          }
        }

        // e) per-video watch time, merged onto the metadata rows. Videos
        //    outside the top 100 by watch time simply keep these fields unset.
        if (videos.length > 0) {
          const videoReport = await ytGet<YouTubeAnalyticsReport>(
            analyticsUrl({
              startDate,
              endDate,
              metrics: "estimatedMinutesWatched,averageViewPercentage",
              dimensions: "video",
              sort: "-estimatedMinutesWatched",
              maxResults: VIDEO_ANALYTICS_LIMIT,
            }),
            token,
            ANALYTICS,
          );
          const byVideoId = new Map(
            mapReport(videoReport)
              .filter((r) => typeof r.video === "string" && r.video !== "")
              .map((r) => [
                String(r.video),
                {
                  estimatedMinutesWatched: toNumber(r.estimatedMinutesWatched),
                  averageViewPercentage: toNumber(r.averageViewPercentage),
                },
              ]),
          );
          for (const video of videos) {
            const stats = byVideoId.get(video.videoId);
            if (stats) {
              video.estimatedMinutesWatched = stats.estimatedMinutesWatched;
              video.averageViewPercentage = stats.averageViewPercentage;
            }
          }
        }

        // f) one atomic write
        return await ctx.runMutation(internal.youtubeStore.upsertSnapshot, {
          workspaceId,
          dailyTotals,
          videos,
          trafficSources,
        });
      },
    );
  },
});

/**
 * Cron fan-out (every 6h): sync every YouTube connection. Per-connection errors
 * are already recorded on `syncRuns` by `runSync`, so we swallow here to keep
 * one bad connection from blocking the rest.
 */
export const syncAllYouTube = internalAction({
  args: {},
  handler: async (ctx) => {
    const connectionIds = await ctx.runQuery(
      internal.connections.listByProvider,
      { provider: "youtube" },
    );
    for (const connectionId of connectionIds) {
      try {
        await ctx.runAction(internal.youtube.syncYouTube, { connectionId });
      } catch {
        // recorded on syncRuns; continue with the next connection
      }
    }
  },
});
