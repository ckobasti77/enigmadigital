/**
 * YouTube API helpers: OAuth token exchange, endpoint bases and error
 * extraction. Pure functions with no Convex imports, so they run in either
 * runtime.
 *
 * Two different Google APIs are involved and they have separate quota models:
 *   - YouTube Analytics API v2 — watch time, retention, traffic sources.
 *     Rate-limited per user rather than metered in units.
 *   - YouTube Data API v3 — video metadata (title, thumbnail, statistics).
 *     Metered in "units", 10 000/day by default. Keep call counts low.
 *
 * Nothing here ever logs or interpolates a token into a message.
 */

/** Google's OAuth 2.0 token endpoint (refresh_token grant). */
export const YOUTUBE_TOKEN_URL = "https://oauth2.googleapis.com/token";

/** YouTube Analytics API v2 — the only endpoint we need. */
export const YOUTUBE_ANALYTICS_REPORTS_URL =
  "https://youtubeanalytics.googleapis.com/v2/reports";

/** YouTube Data API v3 base (channels / playlistItems / videos). */
export const YOUTUBE_DATA_API_BASE_URL = "https://www.googleapis.com/youtube/v3";

export type YouTubeCredentials = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
};

/**
 * Analytics API report shape. Note this is NOT an object keyed by metric name:
 * `rows` are positional arrays and `columnHeaders` tells you what each position
 * means. Always map by header name, never by assumed order.
 */
export type YouTubeAnalyticsReport = {
  columnHeaders?: { name?: string; columnType?: string; dataType?: string }[];
  rows?: (string | number)[][];
};

// ── error handling ───────────────────────────────────────────────────────────

/** Strip anything token-shaped out of an upstream message. */
function redact(message: string): string {
  return message
    .replace(
      /(access_token|refresh_token|client_secret|id_token|code|secret|password)(\s*[=:]\s*)[^\s&",]+/gi,
      "$1$2<redacted>",
    )
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer <redacted>");
}

/**
 * Pull the human-readable message out of a Google API error body. Handles both
 * shapes Google uses: the JSON-API `{ error: { message } }` envelope and the
 * OAuth `{ error, error_description }` one. Falls back to the truncated raw
 * body so an HTML error page still says something useful.
 */
export function extractYouTubeApiError(body: string): string {
  let raw = "";
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: string; errors?: { reason?: string }[] } | string;
      error_description?: string;
    };
    if (typeof parsed.error === "string") {
      // OAuth shape: { error: "invalid_grant", error_description: "..." }
      raw = parsed.error_description
        ? `${parsed.error}: ${parsed.error_description}`
        : parsed.error;
    } else if (parsed.error?.message) {
      raw = parsed.error.message;
      const reason = parsed.error.errors?.[0]?.reason;
      if (reason) raw = `${raw} (${reason})`;
    }
  } catch {
    // not JSON — fall through to the raw body
  }
  if (!raw) raw = body.slice(0, 300);
  if (!raw) raw = "YouTube API zahtev nije uspeo.";
  return redact(raw);
}

/**
 * The machine-readable `reason` on a Google API error, e.g. "quotaExceeded",
 * "forbidden", "authError". Returns null when the body carries no reason.
 */
export function youtubeApiErrorReason(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as {
      error?: { errors?: { reason?: string }[]; status?: string } | string;
    };
    if (typeof parsed.error === "string") return parsed.error;
    return parsed.error?.errors?.[0]?.reason ?? parsed.error?.status ?? null;
  } catch {
    return null;
  }
}

/**
 * True when a YouTube Analytics response means "this channel has no data yet"
 * rather than a real failure.
 *
 * Verified live on 2026-08-18 against a channel created the same day: the
 * Analytics API answers a perfectly valid report request with
 *
 *   HTTP 500 { "error": { "status": "INTERNAL", "code": 500,
 *              "errors": [ { "reason": "backendError", "domain": "global" } ] } }
 *
 * A missing scope would be 403, so this is not an authorisation problem — the
 * analytics backend simply has nothing to aggregate. It persists for days on a
 * new channel, until the first video accumulates watch time. Treating it as an
 * error would mark every sync run failed and paint Sync Health red while
 * nothing is actually broken, so callers skip the report and carry on.
 *
 * Deliberately narrow: any other 500 is still a genuine fault.
 */
export function isAnalyticsNoDataError(status: number, body: string): boolean {
  if (status !== 500) return false;
  const reason = youtubeApiErrorReason(body);
  return reason === "backendError" || reason === "INTERNAL";
}

/**
 * Read the credential blob stored on the connection. Accepts both camelCase
 * and snake_case keys, because the value is pasted in by hand in Settings.
 * Never echoes any part of the secret into the error messages.
 */
export function parseYouTubeCredentials(secretJson: string): YouTubeCredentials {
  let parsed: unknown;
  try {
    parsed = JSON.parse(secretJson);
  } catch {
    throw new Error("YouTube kredencijali nisu validan JSON format.");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("YouTube kredencijali moraju biti JSON objekat.");
  }

  const p = parsed as Record<string, unknown>;
  const clientId = String(p.clientId || p.client_id || "").trim();
  const clientSecret = String(p.clientSecret || p.client_secret || "").trim();
  const refreshToken = String(p.refreshToken || p.refresh_token || "").trim();

  if (!clientId || !clientSecret) {
    throw new Error("Nedostaju OAuth Client ID ili Client Secret.");
  }
  if (!refreshToken) throw new Error("Nedostaje OAuth Refresh Token.");

  return { clientId, clientSecret, refreshToken };
}

// ── Data API: comments (Y4) ────────────────────────────────────────

/**
 * Longest comment YouTube accepts. Anything past this is rejected outright, so
 * the reply engine clamps rather than lets the call fail.
 */
export const COMMENT_TEXT_MAX = 10_000;

/**
 * Every comment thread on the channel, newest first — 1 unit per page.
 *
 * `allThreadsRelatedToChannelId` covers comments on every video plus comments
 * left on the channel itself; `videoId` would need one call per video. Only
 * top-level comments come back, which is exactly the set an automation may
 * answer: our own replies are not top-level and never reappear here.
 *
 * NEVER reach for search.list to find comments — 100 units per call.
 */
export function buildCommentThreadsUrl(params: {
  /** Channel-wide sweep. Ignored when `videoId` is given. */
  channelId: string;
  /**
   * Per-video fallback. `allThreadsRelatedToChannelId` is the cheap path — one
   * request covers every video — but it is not honoured on every account, and
   * when it is rejected the sweep would silently return nothing forever. The
   * caller retries video by video instead; same 1 unit per page, just more
   * pages.
   */
  videoId?: string;
  maxResults: number;
  pageToken?: string;
}): string {
  const url = new URL(`${YOUTUBE_DATA_API_BASE_URL}/commentThreads`);
  url.searchParams.set("part", "snippet");
  if (params.videoId) {
    url.searchParams.set("videoId", params.videoId);
  } else {
    url.searchParams.set("allThreadsRelatedToChannelId", params.channelId);
  }
  url.searchParams.set("order", "time");
  url.searchParams.set("maxResults", String(params.maxResults));
  // Default anyway, but stated: an automation answers what viewers can see.
  url.searchParams.set("moderationStatus", "published");
  if (params.pageToken) url.searchParams.set("pageToken", params.pageToken);
  return url.toString();
}

/**
 * Post a reply to a comment — 50 units. The body carries
 * `snippet.parentId` (the top-level comment) and `snippet.textOriginal`.
 *
 * Needs the `youtube.force-ssl` OAuth scope; a read-only refresh token gets a
 * 403 here even though the analytics sync works fine with it.
 */
export function buildCommentsInsertUrl(): string {
  const url = new URL(`${YOUTUBE_DATA_API_BASE_URL}/comments`);
  url.searchParams.set("part", "snippet");
  return url.toString();
}

/**
 * Hold, reject or publish a comment — 50 units. `banAuthor` is YouTube's
 * "mark as spam / block this person" flag and is only accepted alongside
 * `moderationStatus=rejected`, so callers must not set it otherwise.
 */
export function buildSetModerationStatusUrl(params: {
  commentId: string;
  moderationStatus: "heldForReview" | "rejected" | "published";
  banAuthor?: boolean;
}): string {
  const url = new URL(`${YOUTUBE_DATA_API_BASE_URL}/comments/setModerationStatus`);
  url.searchParams.set("id", params.commentId);
  url.searchParams.set("moderationStatus", params.moderationStatus);
  if (params.banAuthor === true && params.moderationStatus === "rejected") {
    url.searchParams.set("banAuthor", "true");
  }
  return url.toString();
}

// ── OAuth ────────────────────────────────────────────────────────────────────

/**
 * Exchange the stored refresh token for a short-lived access token. Google
 * access tokens live ~1h, which comfortably covers one sync run, so we fetch a
 * fresh one per run instead of persisting it.
 */
export async function fetchAccessToken(
  creds: YouTubeCredentials,
): Promise<string> {
  const res = await fetch(YOUTUBE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      refresh_token: creds.refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });

  const body = await res.text().catch(() => "");

  if (!res.ok) {
    // invalid_grant = consent revoked, credentials rotated, or the token sat
    // unused for 6 months. Only re-connecting the account fixes it.
    if (youtubeApiErrorReason(body) === "invalid_grant") {
      throw new Error(
        "YouTube refresh token više ne važi — ponovo poveži YouTube nalog u Podešavanjima.",
      );
    }
    throw new Error(`YouTube OAuth ${res.status}: ${extractYouTubeApiError(body)}`);
  }

  let token = "";
  try {
    token = String((JSON.parse(body) as { access_token?: string }).access_token ?? "");
  } catch {
    // handled by the emptiness check below
  }
  if (!token) throw new Error("YouTube OAuth nije vratio access token.");
  return token;
}
