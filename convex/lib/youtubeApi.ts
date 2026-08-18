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
