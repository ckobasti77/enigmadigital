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
  "instagram_business_manage_comments",
  "instagram_business_manage_messages",
  // F3 — publishing. A token issued before this entry existed does NOT carry
  // it, and no refresh adds it: the account has to go through the connect flow
  // again. The publishing screen says so out loud (lib/igPublish.ts).
  "instagram_business_content_publish",
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
    "id,user_id,username,name,profile_picture_url,followers_count,media_count",
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
  url.searchParams.set("fields", MEDIA_LIST_FIELDS);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("access_token", accessToken);
  return url.toString();
}

/**
 * Fields requested for every media item.
 *
 * `thumbnail_url` is returned for VIDEO/REELS only — a still frame. IMAGE and
 * CAROUSEL_ALBUM carry their picture in `media_url` instead, which is why both
 * are asked for. `children` is an edge that exists only on CAROUSEL_ALBUM and
 * holds the individual slides; Instagram simply omits it for everything else.
 */
export const MEDIA_LIST_FIELDS =
  "id,caption,media_type,media_product_type,permalink,media_url,thumbnail_url," +
  "timestamp,like_count,comments_count,is_comment_enabled," +
  "children{id,media_type,media_url,thumbnail_url}";

/**
 * Build endpoint URL for the CHEAPEST possible look at the feed — ids and dates
 * and nothing else (F6, level 2).
 *
 * There is no webhook for a new post. Instagram announces comments, messages
 * and mentions, and stays silent about publishing, so the only way to notice a
 * post is to ask — which makes the cost of asking the whole design problem.
 * This is one call with no insights, no captions and no signed CDN links, run
 * every two minutes; the expensive read only happens when the answer contains
 * an id we have never seen.
 *
 * `timestamp` rides along because it costs nothing and the deletion sweep needs
 * to know how far back the answer reaches.
 */
export function buildMeMediaIdsUrl(
  accessToken: string,
  limit: number = 5,
  version: string = getMetaGraphVersion(),
): string {
  const url = new URL(`${INSTAGRAM_GRAPH_BASE_URL}/${version}/me/media`);
  url.searchParams.set("fields", "id,timestamp");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("access_token", accessToken);
  return url.toString();
}

/**
 * Build endpoint URL for finding a post we published but never got the id of.
 *
 * Instagram answers `POST /media_publish` with the new media id and nowhere
 * else — the container knows it is `PUBLISHED` and does not say what it became.
 * So when that answer is lost, the only way back to the id is to look at the
 * feed and match on what we do know: when we sent it, and what its caption was.
 *
 * Deliberately NOT `MEDIA_LIST_FIELDS` — matching needs three fields, and the
 * full list drags in signed CDN links and carousel children for nothing.
 *
 * Stories are absent from this edge and always will be; a story whose id is
 * lost stays lost, which is why the caller treats "not found" as an ordinary
 * outcome rather than an error.
 */
export function buildRecentMediaMatchUrl(
  accessToken: string,
  limit: number = 10,
  version: string = getMetaGraphVersion(),
): string {
  const url = new URL(`${INSTAGRAM_GRAPH_BASE_URL}/${version}/me/media`);
  url.searchParams.set("fields", "id,caption,timestamp");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("access_token", accessToken);
  return url.toString();
}

/**
 * Build endpoint URL for reading arbitrary fields off a single media node.
 * Used by the /ig-media/ proxy route to pull a FRESH picture URL, because the
 * signed CDN links Instagram hands out expire.
 */
export function buildMediaFieldsUrl(
  mediaId: string,
  fields: string,
  accessToken: string,
  version: string = getMetaGraphVersion(),
): string {
  const url = new URL(`${INSTAGRAM_GRAPH_BASE_URL}/${version}/${mediaId}`);
  url.searchParams.set("fields", fields);
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

/**
 * Build endpoint URL for sending a private reply message (DM) to a comment.
 */
export function buildPrivateReplyUrl(
  igUserId: string,
  version: string = getMetaGraphVersion(),
): string {
  return `${INSTAGRAM_GRAPH_BASE_URL}/${version}/${igUserId}/messages`;
}

/**
 * Build endpoint URL for sending a direct message to someone who has already
 * written to the account. Same path as the private reply — what differs is the
 * recipient in the body: `id` (IGSID) here, `comment_id` there.
 */
export function buildSendMessageUrl(
  igUserId: string,
  version: string = getMetaGraphVersion(),
): string {
  return `${INSTAGRAM_GRAPH_BASE_URL}/${version}/${igUserId}/messages`;
}

/**
 * Build endpoint URL for the profile of a person we are messaging with, keyed
 * by their IGSID. `is_user_follow_business` is the follow gate's whole answer;
 * `username` rides along because a tap carries no handle of its own.
 *
 * Needs `instagram_business_manage_messages`, and Instagram only answers for
 * someone the account has a conversation with — see lib/orFollow.ts for what
 * happens when it does not answer.
 */
export function buildUserProfileUrl(
  igsid: string,
  version: string = getMetaGraphVersion(),
): string {
  const url = new URL(`${INSTAGRAM_GRAPH_BASE_URL}/${version}/${igsid}`);
  url.searchParams.set("fields", "username,is_user_follow_business");
  return url.toString();
}

/**
 * Build endpoint URL for the account's messenger profile — the one node that
 * holds BOTH the ice breakers and the persistent menu. POST writes a field,
 * GET reads it back (`?fields=ice_breakers`), DELETE takes it away.
 */
export function buildMessengerProfileUrl(
  version: string = getMetaGraphVersion(),
): string {
  return `${INSTAGRAM_GRAPH_BASE_URL}/${version}/me/messenger_profile`;
}

// ── Content Publishing (F3) ──────────────────────────────────────────────────

/**
 * Build endpoint URL for creating a media CONTAINER — step one of two.
 *
 * The container is not a post. It is Instagram's copy of the file, pulled by
 * Instagram itself from the public `image_url` / `video_url` we hand it, and it
 * expires 24 hours later if nothing publishes it.
 */
export function buildMediaContainerUrl(
  igUserId: string,
  version: string = getMetaGraphVersion(),
): string {
  return `${INSTAGRAM_GRAPH_BASE_URL}/${version}/${igUserId}/media`;
}

/**
 * Build endpoint URL for publishing a finished container — step two of two.
 * The body carries `creation_id`, which is the container's `id`.
 */
export function buildMediaPublishUrl(
  igUserId: string,
  version: string = getMetaGraphVersion(),
): string {
  return `${INSTAGRAM_GRAPH_BASE_URL}/${version}/${igUserId}/media_publish`;
}

/**
 * Build endpoint URL for asking whether a container is ready.
 *
 * `status_code` is the machine answer (IN_PROGRESS / FINISHED / ERROR /
 * EXPIRED); `status` is the sentence a human can act on when it is ERROR, and
 * is the only place Instagram says WHY a video was rejected.
 */
export function buildContainerStatusUrl(
  containerId: string,
  accessToken: string,
  version: string = getMetaGraphVersion(),
): string {
  const url = new URL(`${INSTAGRAM_GRAPH_BASE_URL}/${version}/${containerId}`);
  url.searchParams.set("fields", "status_code,status");
  url.searchParams.set("access_token", accessToken);
  return url.toString();
}

/**
 * Build endpoint URL for the rolling 24-hour publishing allowance.
 *
 * `config` holds the ceiling and the window; `quota_usage` holds how much of it
 * is spent. Both are asked for because the ceiling is not a constant we get to
 * assume — Instagram sets it per account.
 */
export function buildPublishingLimitUrl(
  igUserId: string,
  accessToken: string,
  version: string = getMetaGraphVersion(),
): string {
  const url = new URL(
    `${INSTAGRAM_GRAPH_BASE_URL}/${version}/${igUserId}/content_publishing_limit`,
  );
  url.searchParams.set("fields", "config,quota_usage");
  url.searchParams.set("access_token", accessToken);
  return url.toString();
}

/** What `POST /{ig-user-id}/media` and `/media_publish` answer with. */
export interface RawContainerResponse {
  id?: string;
  error?: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
  };
}

/** What `GET /{container-id}?fields=status_code,status` answers with. */
export interface RawContainerStatusResponse {
  id?: string;
  status_code?: string;
  status?: string;
  error?: {
    message: string;
    type: string;
    code: number;
  };
}

/** What `GET /{ig-user-id}/content_publishing_limit` answers with. */
export interface RawPublishingLimitResponse {
  data?: Array<{
    quota_usage?: number;
    config?: {
      quota_total?: number;
      quota_duration?: number;
    };
  }>;
  error?: {
    message: string;
    type: string;
    code: number;
  };
}

/**
 * Build endpoint URL for posting a public reply to a comment.
 */
export function buildCommentRepliesUrl(
  commentId: string,
  version: string = getMetaGraphVersion(),
): string {
  return `${INSTAGRAM_GRAPH_BASE_URL}/${version}/${commentId}/replies`;
}

// -- Comment moderation (F4) -------------------------------------------------
//
// Everything below needs `instagram_business_manage_comments`, which is already
// in INSTAGRAM_SCOPES. A token minted before that entry existed does not carry
// it and no refresh adds it -- the account has to be reconnected. That is what
// `translateModerationError` (lib/igComments.ts) says out loud when Instagram
// answers with (#10).
//
// One capability people expect and Instagram does NOT have: liking a comment or
// a post. There is no endpoint for it at any permission level, so `like_count`
// below is a number to read and nothing more.

/**
 * Fields asked for on every comment.
 *
 * `replies` is an edge, and it is nested here rather than fetched per comment
 * because a post with forty comments would otherwise cost forty extra calls.
 * The tree is exactly two levels deep on Instagram -- a reply has no replies of
 * its own -- so one level of nesting is the whole tree.
 */
/**
 * How many replies the nested edge returns per comment.
 *
 * Written out rather than left to Meta's default of 25, because the number is
 * a CORRECTNESS constant and not a tuning knob: `replies` is a page like any
 * other, and a thread longer than this comes back cut with its own `paging`.
 * Whoever reads the answer has to know where the cut is — see
 * `repliesTruncated` in `lib/igComments.ts`, which is what keeps a live reply
 * past this line from being swept up as deleted (V1).
 */
export const COMMENT_REPLIES_PAGE = 50;

export const COMMENT_FIELDS =
  "id,text,timestamp,username,like_count,hidden," +
  `replies.limit(${COMMENT_REPLIES_PAGE})` +
  "{id,text,timestamp,username,like_count,hidden}";

/**
 * Build endpoint URL for listing the comments on one of our own posts.
 *
 * `after` is the cursor out of `paging.cursors.after` of the previous page.
 * Without it this endpoint answers with the newest `limit` comments and nothing
 * else, which on a busy post means the rest are invisible to us forever — and,
 * worse, that we never see the whole list and therefore can never tell that
 * something was deleted.
 */
export function buildMediaCommentsUrl(
  mediaId: string,
  accessToken: string,
  limit: number = 50,
  version: string = getMetaGraphVersion(),
  after?: string,
): string {
  const url = new URL(
    `${INSTAGRAM_GRAPH_BASE_URL}/${version}/${mediaId}/comments`,
  );
  url.searchParams.set("fields", COMMENT_FIELDS);
  url.searchParams.set("limit", String(limit));
  if (after) url.searchParams.set("after", after);
  url.searchParams.set("access_token", accessToken);
  return url.toString();
}

/**
 * Build endpoint URL of a single comment node.
 *
 * POST with `hide=true|false` hides or shows it; DELETE removes it for good.
 * Both are the same address, which is why one builder serves both.
 */
export function buildCommentNodeUrl(
  commentId: string,
  version: string = getMetaGraphVersion(),
): string {
  return `${INSTAGRAM_GRAPH_BASE_URL}/${version}/${commentId}`;
}

/**
 * Build endpoint URL of a single media node, for `comment_enabled=true|false`.
 *
 * Note the singular: the field WRITTEN is `comment_enabled`, while the field
 * READ back off the media is `is_comment_enabled`. Instagram named them
 * differently and getting it wrong fails quietly, so both names are pinned in
 * this file rather than spelled out at the call sites.
 */
export function buildMediaNodeUrl(
  mediaId: string,
  version: string = getMetaGraphVersion(),
): string {
  return `${INSTAGRAM_GRAPH_BASE_URL}/${version}/${mediaId}`;
}

/** One comment as `/{ig-media-id}/comments` returns it. */
export interface RawComment {
  id?: string;
  text?: string;
  timestamp?: string;
  username?: string;
  like_count?: number;
  hidden?: boolean;
  /**
   * The nested page of replies. It carries its OWN `paging` — the edge is
   * paginated exactly like the top-level list — which is the whole reason this
   * field is typed rather than left as `{ data }`.
   */
  replies?: {
    data?: RawComment[];
    paging?: { cursors?: { before?: string; after?: string }; next?: string };
  };
}

/** What `GET /{ig-media-id}/comments` answers with. */
export interface RawCommentsResponse {
  data?: RawComment[];
  paging?: {
    cursors?: { before?: string; after?: string };
    next?: string;
  };
  error?: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
  };
}

/** What a moderation write answers with. */
export interface RawModerationResponse {
  id?: string;
  success?: boolean;
  error?: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
  };
}

/** Numeric `error.code` out of a Graph API response, in either shape. */
export function extractGraphApiErrorCode(body: unknown): number | undefined {
  let parsed: unknown = body;
  if (typeof body === "string") {
    try {
      parsed = JSON.parse(body);
    } catch {
      return undefined;
    }
  }
  if (typeof parsed !== "object" || parsed === null) return undefined;
  const code = (parsed as { error?: { code?: unknown } }).error?.code;
  return typeof code === "number" ? code : undefined;
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
  user_id?: string | number;
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

export interface RawMediaChild {
  id?: string;
  media_type?: string;
  media_url?: string;
  thumbnail_url?: string;
}

export interface RawMediaItem {
  id: string;
  caption?: string;
  media_type?: string; // "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM"
  media_product_type?: string; // "FEED" | "REELS" | "STORY"
  permalink?: string;
  media_url?: string; // picture for IMAGE / CAROUSEL_ALBUM, video file for VIDEO
  thumbnail_url?: string; // still frame, VIDEO / REELS only
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
  is_comment_enabled?: boolean; // false once commenting is switched off
  children?: { data?: RawMediaChild[] };
}

/** Response shape of a single-media read (`/{mediaId}?fields=…`). */
export interface RawMediaFieldsResponse extends Partial<RawMediaItem> {
  error?: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
  };
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
  let raw = "";
  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body) as {
        error?: { message?: string };
        error_message?: string;
      };
      if (parsed.error?.message) raw = parsed.error.message;
      else if (parsed.error_message) raw = parsed.error_message;
      else raw = body.slice(0, 300);
    } catch {
      raw = body.slice(0, 300);
    }
  } else if (typeof body === "object" && body !== null) {
    const errObj = body as {
      error?: { message?: string };
      error_message?: string;
      message?: string;
    };
    if (errObj.error?.message) raw = errObj.error.message;
    else if (errObj.error_message) raw = errObj.error_message;
    else if (errObj.message) raw = errObj.message;
  }
  if (!raw) raw = "Meta Graph API request failed.";
  return raw
    .replace(
      /(access_token|client_secret|code|secret|password)(\s*[=:]\s*)[^\s&]+/gi,
      "$1$2<redacted>",
    )
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer <redacted>");
}

// ── Media Picture Helpers ────────────────────────────────────────────────────

/** Carousel slide as it is stored on `igMediaStats.children`. */
export interface StoredMediaChild {
  id: string;
  mediaType: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
}

/**
 * Flatten the `children` edge into the stored shape. Returns undefined when the
 * media is not a carousel, so nothing is written for ordinary posts.
 */
export function normalizeMediaChildren(
  children?: { data?: RawMediaChild[] },
): StoredMediaChild[] | undefined {
  const list = children?.data;
  if (!Array.isArray(list) || list.length === 0) return undefined;

  const out: StoredMediaChild[] = [];
  for (const child of list) {
    if (!child?.id) continue;
    out.push({
      id: String(child.id),
      mediaType: child.media_type ?? "IMAGE",
      ...(child.media_url ? { mediaUrl: child.media_url } : {}),
      ...(child.thumbnail_url ? { thumbnailUrl: child.thumbnail_url } : {}),
    });
  }
  return out.length > 0 ? out : undefined;
}

/**
 * One row of `igMediaStats` as the sync builds it, before it is handed to the
 * upsert. Structural twin of `mediaRowValidator` in `convex/instagramStore.ts`.
 */
export interface StoredMediaRow {
  mediaId: string;
  mediaType: string;
  caption: string;
  permalink: string;
  publishedAt: number;
  reach: number;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
  views: number;
  syncedAt: number;
  mediaUrl?: string;
  thumbnailUrl?: string;
  children?: StoredMediaChild[];
  commentsEnabled?: boolean;
}

/**
 * Fold one media node and its insights into the stored row.
 *
 * Shared by the six-hourly full pass and the event-driven single-post refresh
 * (F6): both read the same fields off the same endpoint, and two copies of this
 * mapping would drift the moment one of them learned about a new field.
 */
export function toStoredMediaRow(
  item: RawMediaItem,
  insight: { reach: number; saves: number; shares: number; views: number },
  syncedAt: number,
): StoredMediaRow {
  const rawPublished = item.timestamp
    ? new Date(item.timestamp).getTime()
    : syncedAt;
  const publishedAt = Number.isFinite(rawPublished) ? rawPublished : syncedAt;

  // Carousel slides; undefined for every other media type.
  const children = normalizeMediaChildren(item.children);

  const isReels =
    item.media_product_type?.toUpperCase() === "REELS" ||
    item.media_type?.toUpperCase() === "REELS";

  return {
    mediaId: String(item.id),
    mediaType: isReels ? "REELS" : item.media_type || "IMAGE",
    caption: item.caption ?? "",
    permalink: item.permalink ?? "",
    publishedAt,
    reach: insight.reach,
    likes: Number(item.like_count) || 0,
    comments: Number(item.comments_count) || 0,
    saves: insight.saves,
    shares: insight.shares,
    views: insight.views,
    syncedAt,
    // Signed CDN links — stored so the /ig-media/ proxy has a starting point,
    // never rendered straight from the database.
    ...(item.media_url ? { mediaUrl: item.media_url } : {}),
    ...(item.thumbnail_url ? { thumbnailUrl: item.thumbnail_url } : {}),
    ...(children ? { children } : {}),
    // Only when Instagram actually said so; see the upsert.
    ...(typeof item.is_comment_enabled === "boolean"
      ? { commentsEnabled: item.is_comment_enabled }
      : {}),
  };
}

/**
 * Pick the URL that actually renders as a picture.
 *
 * For video the still frame lives on `thumbnail_url` (`media_url` is the mp4);
 * everywhere else the picture is `media_url`. A carousel parent occasionally
 * comes back without its own `media_url`, so the first slide is the last resort.
 */
export function pickDisplayUrl(
  mediaType: string,
  mediaUrl?: string,
  thumbnailUrl?: string,
  children?: StoredMediaChild[],
): string | undefined {
  const upper = (mediaType || "").toUpperCase();
  const isVideo = upper === "VIDEO" || upper === "REELS";

  const primary = isVideo
    ? (thumbnailUrl ?? mediaUrl)
    : (mediaUrl ?? thumbnailUrl);
  if (primary) return primary;

  for (const child of children ?? []) {
    const childUrl = pickDisplayUrl(
      child.mediaType,
      child.mediaUrl,
      child.thumbnailUrl,
    );
    if (childUrl) return childUrl;
  }
  return undefined;
}

/**
 * Graph API error codes that are about the CALLER, never about the object.
 *
 * Every one of them can be answered for an object that is perfectly alive, so
 * seeing one ends the question: nothing may be marked deleted off it.
 *
 *   1, 2      unknown / temporary Meta-side failure
 *   4, 17, 32, 613, 341  the four throttling ceilings
 *   10, 200, 299         permission missing from the token
 *   102, 190, 463, 467   session expired, token invalid or revoked
 *   3, 12                method unsupported or deprecated
 */
const CALLER_ERROR_CODES: ReadonlySet<number> = new Set([
  1, 2, 3, 4, 10, 12, 17, 32, 102, 190, 200, 299, 341, 463, 467, 613,
]);

/**
 * What a Graph API failure says about the OBJECT that was asked for.
 *
 *   "gone"      — the object is definitively not there.
 *   "ambiguous" — it may be gone, or the token may simply no longer be allowed
 *                 to see it. NOT enough on its own to write `deletedAt`; the
 *                 caller has to corroborate (see below).
 *   "other"     — the failure is about the request or the token, and says
 *                 nothing at all about the object.
 */
export type MissingObjectVerdict = "gone" | "ambiguous" | "other";

/**
 * Classify a Graph API failure. Status first, then `code`, then
 * `error_subcode`; the message is only ever a confirmation of the last resort.
 *
 * THE EXACT SHAPES COVERED, so the next person does not have to guess:
 *
 * 1. Deleted media or comment — the canonical one, and the reason this
 *    function exists. HTTP 400:
 *      {"error":{"message":"Unsupported get request. Object with ID '17900…'
 *        does not exist, cannot be loaded due to missing permissions, or does
 *        not support this operation.","type":"IGApiException","code":100,
 *        "error_subcode":33,"fbtrace_id":"A…"}}
 *    Note the message contains BOTH "does not exist" AND "missing permissions".
 *    Any heuristic that requires the first and forbids the second can never
 *    fire — which is exactly the bug this replaces. And subcode 33 is not
 *    always sent: the same body turns up with `code:100` alone.
 *    -> "ambiguous", because that one sentence is Meta's answer for a deleted
 *       object AND for an object the token lost the right to read.
 *
 * 2. Alias gone (mostly Facebook nodes). HTTP 400:
 *      {"error":{"message":"(#803) Some of the aliases you requested do not
 *        exist: 12345","type":"OAuthException","code":803}}
 *    -> "gone". This wording has no permission reading.
 *
 * 3. HTTP 404 / 410 with any body, including a non-JSON one.
 *    -> "gone".
 *
 * 4. Token revoked. HTTP 400:
 *      {"error":{"message":"Error validating access token: The user has not
 *        authorized application …","type":"OAuthException","code":190,
 *        "error_subcode":458}}
 *    -> "other". Every object looks missing to a dead token.
 *
 * 5. Scope missing. HTTP 403 or 400:
 *      {"error":{"message":"(#10) Application does not have permission for
 *        this action","type":"OAuthException","code":10}}
 *    -> "other".
 *
 * 6. Throttled. HTTP 400:
 *      {"error":{"message":"(#4) Application request limit reached",
 *        "code":4}}
 *    -> "other".
 *
 * 7. Anything unparsable, or an error object with no numeric code.
 *    -> "other". A body we cannot read is not evidence of anything.
 */
export function classifyMissingObject(
  status: number,
  body: string,
): MissingObjectVerdict {
  // 1. The status line. A Graph 404/410 is unambiguous and needs no body.
  if (status === 404 || status === 410) return "gone";

  let err: RawMediaFieldsResponse["error"] | undefined;
  try {
    err = (JSON.parse(body) as RawMediaFieldsResponse).error;
  } catch {
    err = undefined;
  }
  if (!err) return "other";

  const code = typeof err.code === "number" ? err.code : undefined;
  const subcode =
    typeof err.error_subcode === "number" ? err.error_subcode : undefined;

  // 2. `error.code` — the caller's own problems win outright.
  if (code !== undefined && CALLER_ERROR_CODES.has(code)) return "other";
  if (code === 803) return "gone";

  if (code === 100) {
    // 3. `error.error_subcode` — 33 is "object not found", and it is
    // OVERLOADED: Meta sends it both for a deleted object and for one the
    // token may no longer read. Hence "ambiguous", never "gone".
    if (subcode === 33) return "ambiguous";
    // Other subcodes of 100 are argument errors (unknown field, bad metric).
    if (subcode !== undefined) return "other";
    // 4. The message, last and only as confirmation of a bare code 100.
    const message = (err.message ?? "").toLowerCase();
    if (
      message.includes("does not exist") ||
      message.includes("cannot be loaded")
    ) {
      return "ambiguous";
    }
    return "other";
  }

  return "other";
}

/**
 * Might this failure mean the object is gone?
 *
 * For callers that do NOT write a deletion verdict and only need to know
 * whether to bother logging or to hand the question to the pass that owns it.
 * Anything that WRITES `deletedAt` must call `classifyMissingObject` and treat
 * "ambiguous" as "ask something else first".
 */
export function isMissingObjectError(status: number, body: string): boolean {
  return classifyMissingObject(status, body) !== "other";
}

/**
 * Pick the picture URL of ONE carousel slide. Unlike `pickDisplayUrl` it never
 * falls back to the parent or to a sibling slide: the caller asked for a
 * specific slide, and quietly answering with a different picture would make a
 * swiper show the same frame twice.
 */
export function pickChildDisplayUrl(
  children: StoredMediaChild[] | undefined,
  childId: string,
): string | undefined {
  const child = (children ?? []).find((c) => c.id === childId);
  if (!child) return undefined;
  return pickDisplayUrl(child.mediaType, child.mediaUrl, child.thumbnailUrl);
}
