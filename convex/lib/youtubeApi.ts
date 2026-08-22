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

// ── Data API: media operations (Y6) ─────────────────────────────────────────

/**
 * Metadata for up to 50 videos in one call — 1 unit. `parts` picks what comes
 * back (`snippet`, `status`, `statistics`, `contentDetails`); each extra part
 * is free, so ask for what the screen shows and no more.
 */
export function buildVideosListUrl(params: {
  ids: string[];
  parts: string[];
}): string {
  const url = new URL(`${YOUTUBE_DATA_API_BASE_URL}/videos`);
  url.searchParams.set("part", params.parts.join(","));
  url.searchParams.set("id", params.ids.join(","));
  return url.toString();
}

/**
 * Edit a video — 50 units, PUT with the full resource.
 *
 * The Data API replaces every part it is given rather than merging, so a
 * `snippet` sent without `categoryId` clears the category. Callers must read
 * the video first (`buildVideosListUrl`) and send the whole part back.
 */
export function buildVideosUpdateUrl(parts: string[]): string {
  const url = new URL(`${YOUTUBE_DATA_API_BASE_URL}/videos`);
  url.searchParams.set("part", parts.join(","));
  return url.toString();
}

/** Delete a video — 50 units, DELETE. There is no undo and no trash. */
export function buildVideosDeleteUrl(videoId: string): string {
  const url = new URL(`${YOUTUBE_DATA_API_BASE_URL}/videos`);
  url.searchParams.set("id", videoId);
  return url.toString();
}

/**
 * Delete a comment — 50 units, DELETE. Harsher than
 * `setModerationStatus=rejected`: rejection hides the comment, this removes it.
 */
export function buildCommentsDeleteUrl(commentId: string): string {
  const url = new URL(`${YOUTUBE_DATA_API_BASE_URL}/comments`);
  url.searchParams.set("id", commentId);
  return url.toString();
}

/** The signed-in channel's own playlists — 1 unit. */
export function buildPlaylistsListUrl(params: {
  mine: true;
  maxResults: number;
}): string {
  const url = new URL(`${YOUTUBE_DATA_API_BASE_URL}/playlists`);
  url.searchParams.set("part", "snippet,contentDetails");
  url.searchParams.set("mine", String(params.mine));
  url.searchParams.set("maxResults", String(params.maxResults));
  return url.toString();
}

/**
 * Put one video into one playlist — 50 units. The body carries
 * `snippet.playlistId` and `snippet.resourceId = { kind: "youtube#video",
 * videoId }`.
 */
export function buildPlaylistItemsInsertUrl(): string {
  const url = new URL(`${YOUTUBE_DATA_API_BASE_URL}/playlistItems`);
  url.searchParams.set("part", "snippet");
  return url.toString();
}

/**
 * The caption tracks on one video — 50 units. Not a cheap read: listing the
 * captions of ten videos costs as much as posting ten replies.
 */
export function buildCaptionsListUrl(videoId: string): string {
  const url = new URL(`${YOUTUBE_DATA_API_BASE_URL}/captions`);
  url.searchParams.set("part", "snippet");
  url.searchParams.set("videoId", videoId);
  return url.toString();
}

/** Remove one caption track — 50 units, DELETE. */
export function buildCaptionsDeleteUrl(captionId: string): string {
  const url = new URL(`${YOUTUBE_DATA_API_BASE_URL}/captions`);
  url.searchParams.set("id", captionId);
  return url.toString();
}

// ── Data API: the upload host ────────────────────────────────────────────────
//
// Every endpoint below sends a FILE, and those do not live on the same host as
// the rest of the Data API. They are served from
// www.googleapis.com/upload/youtube/v3, and posting them to
// www.googleapis.com/youtube/v3 answers 404 — with no hint that the path was
// right and only the host was wrong. It is an easy mistake and a slow one to
// find, which is why these builders exist instead of string concatenation at
// the call site.

/** Media (file-carrying) endpoints of the Data API v3. */
export const YOUTUBE_UPLOAD_API_BASE_URL =
  "https://www.googleapis.com/upload/youtube/v3";

/**
 * Set a custom thumbnail — 50 units. POST the image bytes as the raw body with
 * the image's own Content-Type; this is not a JSON call.
 */
export function buildThumbnailsSetUrl(videoId: string): string {
  const url = new URL(`${YOUTUBE_UPLOAD_API_BASE_URL}/thumbnails/set`);
  url.searchParams.set("videoId", videoId);
  return url.toString();
}

/**
 * How the file reaches Google.
 *
 * `multipart` puts the metadata and the bytes in one request and is what a
 * caption track — tens of kilobytes — wants. `resumable` opens a session with
 * the metadata first and sends the bytes to the URL that comes back; it is the
 * fallback for when multipart is refused, and the only sane path for a video.
 */
export type YouTubeUploadType = "multipart" | "resumable";

/**
 * Add a caption track — 400 units.
 *
 * Multipart here means `multipart/related`: a JSON `snippet` part and the
 * caption file part in one body (lib/ytCaptions.ts builds it). The most
 * expensive single call this app makes.
 */
export function buildCaptionsInsertUrl(uploadType: YouTubeUploadType): string {
  const url = new URL(`${YOUTUBE_UPLOAD_API_BASE_URL}/captions`);
  url.searchParams.set("part", "snippet");
  url.searchParams.set("uploadType", uploadType);
  return url.toString();
}

/**
 * Replace an existing caption track's file — 450 units, PUT.
 *
 * `parts` matters more than it looks. `captions.update` replaces every part it
 * is given, exactly like `videos.update`: sending `part=snippet` with a snippet
 * we did not read back first would wipe the track's name and its draft flag.
 * Replacing only the file is therefore sent as `part=id` with a body of just
 * `{ id }` — the documented minimal form — which leaves the metadata alone and
 * costs no extra read.
 */
export function buildCaptionsUpdateUrl(params: {
  parts: string[];
  uploadType: YouTubeUploadType;
}): string {
  const url = new URL(`${YOUTUBE_UPLOAD_API_BASE_URL}/captions`);
  url.searchParams.set("part", params.parts.join(","));
  url.searchParams.set("uploadType", params.uploadType);
  return url.toString();
}

/**
 * Open a resumable video upload. The POST here carries only the metadata and
 * answers with a `Location` header; the bytes then go to that URL.
 *
 * The bytes never pass through Convex — a few hundred megabytes will not fit
 * in an action's time or memory — so the browser sends them straight to
 * Google with a token from `ytAuth.issueUploadToken`.
 */
export function buildResumableUploadInitUrl(): string {
  const url = new URL(`${YOUTUBE_UPLOAD_API_BASE_URL}/videos`);
  url.searchParams.set("uploadType", "resumable");
  url.searchParams.set("part", "snippet,status");
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

/**
 * Read the YouTube OAuth App credentials from environment variables.
 */
export function getYouTubeClientId(): string | undefined {
  return process.env.YOUTUBE_CLIENT_ID?.trim();
}

export function getYouTubeClientSecret(): string | undefined {
  return process.env.YOUTUBE_CLIENT_SECRET?.trim();
}

export const YOUTUBE_OAUTH_AUTH_URL =
  "https://accounts.google.com/o/oauth2/v2/auth";

export const YOUTUBE_DEFAULT_REDIRECT_URI =
  "https://digital.enigmait.rs/api/auth/callback/youtube";

export const YOUTUBE_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/youtube.force-ssl",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
  "https://www.googleapis.com/auth/adwords",
] as const;

/**
 * Compose the Google OAuth 2.0 authorization URL for YouTube.
 */
export function buildYouTubeAuthorizeUrl({
  clientId,
  redirectUri = YOUTUBE_DEFAULT_REDIRECT_URI,
  state,
}: {
  clientId: string;
  redirectUri?: string;
  state: string;
}): string {
  const url = new URL(YOUTUBE_OAUTH_AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", YOUTUBE_OAUTH_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  return url.toString();
}

export type RawGoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

/**
 * Exchange an OAuth authorization code for Google access and refresh tokens.
 * A missing refresh_token is treated as a hard failure because offline
 * background syncing requires it.
 */
export async function exchangeCodeForTokens({
  clientId,
  clientSecret,
  redirectUri,
  code,
}: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
}): Promise<{ accessToken: string; refreshToken: string; expiresIn?: number }> {
  const tokenParams = new URLSearchParams();
  tokenParams.set("code", code);
  tokenParams.set("client_id", clientId);
  tokenParams.set("client_secret", clientSecret);
  tokenParams.set("redirect_uri", redirectUri);
  tokenParams.set("grant_type", "authorization_code");

  const res = await fetch(YOUTUBE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: tokenParams.toString(),
  });

  const body = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(
      `Google OAuth razmena koda nije uspela (${res.status}): ${extractYouTubeApiError(body)}`,
    );
  }

  let data: RawGoogleTokenResponse;
  try {
    data = JSON.parse(body) as RawGoogleTokenResponse;
  } catch {
    throw new Error("Google OAuth odgovor nije validan JSON.");
  }

  if (!data.access_token) {
    throw new Error("Google OAuth nije vratio access token.");
  }

  if (!data.refresh_token) {
    throw new Error(
      "Google OAuth nije vratio refresh token. Ponovo pokrenite povezivanje i potvrdite pristup.",
    );
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

export type YouTubeChannelProfile = {
  channelId: string;
  title: string;
};

/**
 * Fetch the authenticated user's YouTube channel ID and title.
 */
export async function fetchMyChannelProfile(
  accessToken: string,
): Promise<YouTubeChannelProfile> {
  const url = new URL(`${YOUTUBE_DATA_API_BASE_URL}/channels`);
  url.searchParams.set("part", "id,snippet");
  url.searchParams.set("mine", "true");

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const body = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(
      `Dohvatanje YouTube kanala nije uspelo (${res.status}): ${extractYouTubeApiError(body)}`,
    );
  }

  let data: {
    items?: Array<{
      id?: string;
      snippet?: {
        title?: string;
      };
    }>;
  };
  try {
    data = JSON.parse(body);
  } catch {
    throw new Error("Odgovor YouTube API-ja za kanal nije validan JSON.");
  }

  const item = data.items?.[0];
  if (!item || !item.id) {
    throw new Error(
      "Nije pronađen YouTube kanal povezan sa ovim Google nalogom.",
    );
  }

  const channelId = item.id;
  const title = item.snippet?.title?.trim() || channelId;

  return { channelId, title };
}

