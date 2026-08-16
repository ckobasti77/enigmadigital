/**
 * ============================================================================
 * INSTAGRAM GRAPH API MODULE
 * ============================================================================
 *
 * Single source of truth for all Meta Graph API and Instagram Login endpoint paths,
 * query parameters, metric definitions, and response parsing helpers.
 *
 * Used by "Instagram API with Instagram Login" (business login flow on instagram.com).
 * Scopes: instagram_business_basic, instagram_business_manage_insights
 *
 * Versioning:
 *   Default Graph API version is "v25.0", overridable via META_GRAPH_API_VERSION.
 * ============================================================================
 */

export const DEFAULT_GRAPH_VERSION = "v25.0";
export const INSTAGRAM_OAUTH_AUTHORIZE_URL =
  "https://api.instagram.com/oauth/authorize";
export const INSTAGRAM_OAUTH_TOKEN_URL =
  "https://api.instagram.com/oauth/access_token";
export const INSTAGRAM_GRAPH_BASE_URL = "https://graph.instagram.com";

export const INSTAGRAM_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_insights",
] as const;

export function getMetaGraphVersion(): string {
  const envVersion = process.env.META_GRAPH_API_VERSION?.trim();
  if (envVersion && /^v\d+\.\d+$/.test(envVersion)) {
    return envVersion;
  }
  return DEFAULT_GRAPH_VERSION;
}

// ── URL Builders ─────────────────────────────────────────────────────────────

export interface InstagramAuthorizeParams {
  clientId: string;
  redirectUri: string;
  state?: string;
  forceAuthentication?: boolean;
}

/**
 * Build the browser redirect URL for the "Instagram API with Instagram Login" flow.
 */
export function buildInstagramAuthorizeUrl({
  clientId,
  redirectUri,
  state,
  forceAuthentication = false,
}: InstagramAuthorizeParams): string {
  const url = new URL(INSTAGRAM_OAUTH_AUTHORIZE_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", INSTAGRAM_SCOPES.join(","));
  url.searchParams.set("enable_fb_login", "0");
  if (forceAuthentication) {
    url.searchParams.set("force_authentication", "1");
  }
  if (state) {
    url.searchParams.set("state", state);
  }
  return url.toString();
}

/**
 * Build endpoint URL for exchanging short-lived token for a long-lived token (60 days).
 */
export function buildLongLivedTokenUrl(
  clientSecret: string,
  accessToken: string,
  version: string = getMetaGraphVersion(),
): string {
  const url = new URL(`${INSTAGRAM_GRAPH_BASE_URL}/${version}/access_token`);
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", clientSecret);
  url.searchParams.set("access_token", accessToken);
  return url.toString();
}

/**
 * Build endpoint URL for refreshing a long-lived token.
 */
export function buildRefreshTokenUrl(
  accessToken: string,
  version: string = getMetaGraphVersion(),
): string {
  const url = new URL(
    `${INSTAGRAM_GRAPH_BASE_URL}/${version}/refresh_access_token`,
  );
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", accessToken);
  return url.toString();
}

/**
 * Build endpoint URL for fetching the Instagram user profile & account followers.
 */
export function buildMeUrl(
  accessToken: string,
  version: string = getMetaGraphVersion(),
): string {
  const url = new URL(`${INSTAGRAM_GRAPH_BASE_URL}/${version}/me`);
  url.searchParams.set(
    "fields",
    "id,username,name,profile_picture_url,followers_count,media_count",
  );
  url.searchParams.set("access_token", accessToken);
  return url.toString();
}

/**
 * Build endpoint URL for fetching daily account-level insights.
 */
export function buildMeInsightsUrl(
  accessToken: string,
  version: string = getMetaGraphVersion(),
): string {
  const url = new URL(`${INSTAGRAM_GRAPH_BASE_URL}/${version}/me/insights`);
  // Account level insights: reach, profile_views, accounts_engaged
  url.searchParams.set("metric", "reach,profile_views,accounts_engaged");
  url.searchParams.set("period", "day");
  url.searchParams.set("metric_type", "total_value");
  url.searchParams.set("access_token", accessToken);
  return url.toString();
}

/**
 * Build endpoint URL for fetching the user's latest media items (up to limit).
 */
export function buildMeMediaUrl(
  accessToken: string,
  limit: number = 30,
  version: string = getMetaGraphVersion(),
): string {
  const url = new URL(`${INSTAGRAM_GRAPH_BASE_URL}/${version}/me/media`);
  url.searchParams.set(
    "fields",
    "id,caption,media_type,media_product_type,permalink,thumbnail_url,timestamp,like_count,comments_count",
  );
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("access_token", accessToken);
  return url.toString();
}

/**
 * Build endpoint URL for fetching per-media insights for a specific media ID.
 */
export function buildMediaInsightsUrl(
  mediaId: string,
  metrics: string[],
  accessToken: string,
  version: string = getMetaGraphVersion(),
): string {
  const url = new URL(
    `${INSTAGRAM_GRAPH_BASE_URL}/${version}/${mediaId}/insights`,
  );
  url.searchParams.set("metric", metrics.join(","));
  url.searchParams.set("access_token", accessToken);
  return url.toString();
}

// ── Metric Matrix Per Media Type ─────────────────────────────────────────────

/**
 * Instagram media types:
 *   IMAGE / CAROUSEL_ALBUM: static posts -> reach, saved, shares, total_interactions (views is 0)
 *   REELS: short-form video -> reach, saved, shares, plays, total_interactions (plays/views)
 *   VIDEO: standard feed video -> reach, saved, shares, views, total_interactions
 */
export function getMetricsForMediaType(
  mediaType: string,
  mediaProductType?: string,
): string[] {
  const upperType = (mediaType || "").toUpperCase();
  const upperProduct = (mediaProductType || "").toUpperCase();

  if (upperProduct === "REELS" || upperType === "REELS") {
    // Reels exposes plays / views, reach, saved, shares, total_interactions
    return ["reach", "saved", "shares", "plays", "total_interactions"];
  }

  if (upperType === "VIDEO") {
    return ["reach", "saved", "shares", "views", "total_interactions"];
  }

  // IMAGE / CAROUSEL_ALBUM / default
  return ["reach", "saved", "shares", "total_interactions"];
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface RawOAuthTokenResponse {
  access_token: string;
  user_id?: string | number;
  permissions?: string[];
  error_type?: string;
  code?: number;
  error_message?: string;
}

export interface RawLongLivedTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in: number; // in seconds (e.g. 5184000 = 60 days)
  error?: {
    message: string;
    type: string;
    code: number;
  };
}

export interface RawUserProfile {
  id: string;
  username?: string;
  name?: string;
  profile_picture_url?: string;
  followers_count?: number;
  media_count?: number;
  error?: {
    message: string;
    type: string;
    code: number;
  };
}

export interface RawInsightValue {
  value?: number;
  end_time?: string;
}

export interface RawInsightEntry {
  name: string;
  period?: string;
  values?: RawInsightValue[];
  total_value?: {
    value?: number;
  };
  title?: string;
  description?: string;
  id?: string;
}

export interface RawInsightsResponse {
  data?: RawInsightEntry[];
  error?: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
  };
}

export interface RawMediaItem {
  id: string;
  caption?: string;
  media_type?: string; // "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM"
  media_product_type?: string; // "FEED" | "REELS" | "STORY"
  permalink?: string;
  thumbnail_url?: string;
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
}

export interface RawMediaListResponse {
  data?: RawMediaItem[];
  paging?: {
    cursors?: {
      before?: string;
      after?: string;
    };
    next?: string;
  };
  error?: {
    message: string;
    type: string;
    code: number;
  };
}

// ── Metric Extractors ────────────────────────────────────────────────────────

function extractMetricValue(entry?: RawInsightEntry): number {
  if (!entry) return 0;
  if (
    entry.total_value &&
    typeof entry.total_value.value === "number" &&
    Number.isFinite(entry.total_value.value)
  ) {
    return entry.total_value.value;
  }
  if (Array.isArray(entry.values) && entry.values.length > 0) {
    const latest = entry.values[entry.values.length - 1]?.value;
    if (typeof latest === "number" && Number.isFinite(latest)) {
      return latest;
    }
  }
  return 0;
}

/**
 * Extract daily account snapshot metrics from `/me/insights` response entries.
 */
export function extractAccountInsights(data?: RawInsightEntry[]): {
  reach: number;
  profileViews: number;
  accountsEngaged: number;
} {
  const list = data ?? [];
  const byName = new Map<string, RawInsightEntry>();
  for (const item of list) {
    if (item?.name) byName.set(item.name, item);
  }

  return {
    reach: extractMetricValue(byName.get("reach")),
    profileViews: extractMetricValue(byName.get("profile_views")),
    accountsEngaged: extractMetricValue(byName.get("accounts_engaged")),
  };
}

/**
 * Extract per-media metrics from `/{mediaId}/insights` response entries.
 * Gracefully handles metric differences between REELS and static posts.
 */
export function extractMediaInsights(
  data?: RawInsightEntry[],
  mediaType: string = "IMAGE",
  mediaProductType?: string,
): {
  reach: number;
  saves: number;
  shares: number;
  views: number;
} {
  const list = data ?? [];
  const byName = new Map<string, RawInsightEntry>();
  for (const item of list) {
    if (item?.name) byName.set(item.name, item);
  }

  const reach = extractMetricValue(byName.get("reach"));
  const saves = extractMetricValue(byName.get("saved"));
  const shares = extractMetricValue(byName.get("shares"));

  const upperType = (mediaType || "").toUpperCase();
  const upperProduct = (mediaProductType || "").toUpperCase();
  let views = 0;

  if (upperProduct === "REELS" || upperType === "REELS") {
    // On Reels, plays is the primary metric representing video plays/views
    views =
      extractMetricValue(byName.get("plays")) ||
      extractMetricValue(byName.get("views"));
  } else if (upperType === "VIDEO") {
    views =
      extractMetricValue(byName.get("views")) ||
      extractMetricValue(byName.get("plays"));
  } else {
    // Static IMAGE / CAROUSEL_ALBUM do not have video views
    views = 0;
  }

  return { reach, saves, shares, views };
}

/**
 * Pull human-readable error from Graph API error response without leaking secrets.
 */
export function extractGraphApiError(body: unknown): string {
  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body) as {
        error?: { message?: string };
        error_message?: string;
      };
      if (parsed.error?.message) return parsed.error.message;
      if (parsed.error_message) return parsed.error_message;
    } catch {
      return body.slice(0, 300);
    }
  } else if (typeof body === "object" && body !== null) {
    const errObj = body as {
      error?: { message?: string };
      error_message?: string;
      message?: string;
    };
    if (errObj.error?.message) return errObj.error.message;
    if (errObj.error_message) return errObj.error_message;
    if (errObj.message) return errObj.message;
  }
  return "Meta Graph API request failed.";
}
