/**
 * ============================================================================
 * FACEBOOK PAGE GRAPH API MODULE (F5)
 * ============================================================================
 *
 * Single source of truth for every Facebook Page endpoint the command center
 * touches: the Login-for-Business handshake, the Page Access Token, the feed,
 * comments, insights, and the four moderation writes.
 *
 * The version and the error parsers are IMPORTED from `instagramApi.ts` rather
 * than copied: it is the same Meta app behind both, `META_GRAPH_API_VERSION`
 * pins both, and an error body from graph.facebook.com has exactly the shape
 * an error body from graph.instagram.com has.
 *
 * Scopes (all five have to be granted in the app dashboard):
 *   pages_show_list         — read the list of Pages the person administers
 *   pages_read_engagement   — read posts, comments and insights
 *   pages_manage_engagement — reply, hide, delete, like as the Page
 *   pages_messaging         — the private reply and the DM thread
 *   pages_manage_metadata   — subscribe the Page to the webhook
 * ============================================================================
 */

import { getMetaGraphVersion } from "./instagramApi";

export { getMetaGraphVersion };

export const FACEBOOK_GRAPH_BASE_URL = "https://graph.facebook.com";
export const FACEBOOK_WWW_BASE_URL = "https://www.facebook.com";

export const FACEBOOK_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_engagement",
  "pages_messaging",
  "pages_manage_metadata",
] as const;

/**
 * The Meta app id/secret used for the Facebook Login leg.
 *
 * NOT the same pair as `INSTAGRAM_APP_ID`: "Instagram API with Instagram Login"
 * issues its own app id, while Facebook Login for Business runs on the app's
 * own id. The secret IS shared, which is why `META_APP_SECRET` — the one the
 * webhook already verifies signatures with — is the fallback.
 */
export function getFacebookAppId(): string | undefined {
  return process.env.FACEBOOK_APP_ID?.trim() || process.env.META_APP_ID?.trim();
}

export function getFacebookAppSecret(): string | undefined {
  return (
    process.env.FACEBOOK_APP_SECRET?.trim() ||
    process.env.META_APP_SECRET?.trim()
  );
}

// ── OAuth ────────────────────────────────────────────────────────────────────

/** Browser redirect that starts Facebook Login for Business. */
export function buildFacebookAuthorizeUrl({
  clientId,
  redirectUri,
  state,
  version = getMetaGraphVersion(),
}: {
  clientId: string;
  redirectUri: string;
  state: string;
  version?: string;
}): string {
  const url = new URL(`${FACEBOOK_WWW_BASE_URL}/${version}/dialog/oauth`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", FACEBOOK_SCOPES.join(","));
  url.searchParams.set("state", state);
  return url.toString();
}

/** Authorization code → short-lived USER token. */
export function buildFacebookTokenUrl({
  clientId,
  clientSecret,
  redirectUri,
  code,
  version = getMetaGraphVersion(),
}: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
  version?: string;
}): string {
  const url = new URL(
    `${FACEBOOK_GRAPH_BASE_URL}/${version}/oauth/access_token`,
  );
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("client_secret", clientSecret);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("code", code);
  return url.toString();
}

/**
 * Short-lived USER token → long-lived USER token (~60 days).
 *
 * This exchange is what makes the PAGE tokens minted from it long-lived too,
 * so it is never skipped: `/me/accounts` called with a short-lived user token
 * hands back page tokens that die in an hour.
 */
export function buildFacebookLongLivedTokenUrl({
  clientId,
  clientSecret,
  shortLivedToken,
  version = getMetaGraphVersion(),
}: {
  clientId: string;
  clientSecret: string;
  shortLivedToken: string;
  version?: string;
}): string {
  const url = new URL(
    `${FACEBOOK_GRAPH_BASE_URL}/${version}/oauth/access_token`,
  );
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("client_secret", clientSecret);
  url.searchParams.set("fb_exchange_token", shortLivedToken);
  return url.toString();
}

/** Every Page this person administers, each with its own Page Access Token. */
export function buildMeAccountsUrl(
  userToken: string,
  version: string = getMetaGraphVersion(),
): string {
  const url = new URL(`${FACEBOOK_GRAPH_BASE_URL}/${version}/me/accounts`);
  url.searchParams.set("fields", "id,name,access_token,category,link,tasks");
  url.searchParams.set("limit", "100");
  url.searchParams.set("access_token", userToken);
  return url.toString();
}

/**
 * When a token dies, and what it may still read.
 *
 * A long-lived Page token normally reports `expires_at: 0` — "never" — while
 * `data_access_expires_at` still counts down to the 90-day data-access window
 * the person has to re-grant. The Settings card shows whichever of the two is
 * a real date, because both of them stop the sync when they pass.
 */
export function buildDebugTokenUrl({
  inputToken,
  appId,
  appSecret,
  version = getMetaGraphVersion(),
}: {
  inputToken: string;
  appId: string;
  appSecret: string;
  version?: string;
}): string {
  const url = new URL(`${FACEBOOK_GRAPH_BASE_URL}/${version}/debug_token`);
  url.searchParams.set("input_token", inputToken);
  url.searchParams.set("access_token", `${appId}|${appSecret}`);
  return url.toString();
}

/** Subscribe the Page to the app's webhook — `feed` and `messages`. */
export function buildSubscribedAppsUrl(
  pageId: string,
  version: string = getMetaGraphVersion(),
): string {
  return `${FACEBOOK_GRAPH_BASE_URL}/${version}/${pageId}/subscribed_apps`;
}

/** The fields subscribed at connect time. Must match the app dashboard. */
export const PAGE_SUBSCRIBED_FIELDS = "feed,messages,messaging_postbacks";

// ── Messaging ────────────────────────────────────────────────────────────────

/**
 * The one send endpoint. Like Instagram, what differs between a private reply
 * to a comment and a message into a thread is the `recipient` in the body:
 * `{comment_id}` there, `{id}` (PSID) here.
 */
export function buildPageMessagesUrl(
  pageId: string,
  version: string = getMetaGraphVersion(),
): string {
  return `${FACEBOOK_GRAPH_BASE_URL}/${version}/${pageId}/messages`;
}

// ── Comments ─────────────────────────────────────────────────────────────────

/**
 * A public reply on Facebook is a comment ON the comment, so the edge is
 * `/comments` — not `/replies`, which is the Instagram spelling of the same
 * idea. That one word is the whole difference in the send path.
 */
export function buildCommentRepliesUrl(
  commentId: string,
  version: string = getMetaGraphVersion(),
): string {
  return `${FACEBOOK_GRAPH_BASE_URL}/${version}/${commentId}/comments`;
}

/**
 * The comment node itself. POST with `is_hidden=true|false` hides or shows it;
 * DELETE removes it. Same address for both, which is why one builder serves
 * both — and note `is_hidden`, where Instagram writes plain `hide`.
 */
export function buildCommentNodeUrl(
  commentId: string,
  version: string = getMetaGraphVersion(),
): string {
  return `${FACEBOOK_GRAPH_BASE_URL}/${version}/${commentId}`;
}

/**
 * Likes on any object — a comment or a post.
 *
 * This is the one capability Facebook has and Instagram simply does not: POST
 * likes the object as the Page, DELETE takes the like back. Instagram exposes
 * no such endpoint at any permission level, which is why the Instagram screens
 * print `like_count` and nothing more.
 */
export function buildLikesUrl(
  objectId: string,
  version: string = getMetaGraphVersion(),
): string {
  return `${FACEBOOK_GRAPH_BASE_URL}/${version}/${objectId}/likes`;
}

/**
 * Fields asked for on every comment.
 *
 * `comments` is nested one level for the same reason Instagram's `replies` is:
 * a post with forty comments would otherwise cost forty extra calls. Facebook
 * allows deeper nesting than Instagram does, but this screen flattens anything
 * below the first reply onto its top-level parent — a three-level thread in a
 * moderation queue is a scrolling problem, not information.
 */
/**
 * How many replies the nested edge returns per comment.
 *
 * A correctness constant, not a tuning knob: `comments` nested inside a comment
 * is a page like any other, and a thread longer than this comes back cut, with
 * its own `paging`. `fbRepliesTruncated` in `lib/facebookContent.ts` is what
 * keeps a live reply past this line from being swept up as deleted (V1).
 */
export const FB_COMMENT_REPLIES_PAGE = 50;

export const FB_COMMENT_FIELDS =
  "id,message,created_time,like_count,is_hidden,permalink_url," +
  `from{id,name},comments.limit(${FB_COMMENT_REPLIES_PAGE})` +
  "{id,message,created_time,like_count," +
  "is_hidden,permalink_url,from{id,name}}";

/**
 * `after` is the cursor out of `paging.cursors.after` of the previous page.
 * Without it this endpoint answers with the newest `limit` comments only, so
 * the rest stay invisible — and a list we never saw whole can never prove that
 * something was deleted.
 */
export function buildPostCommentsUrl(
  postId: string,
  accessToken: string,
  limit: number = 50,
  version: string = getMetaGraphVersion(),
  after?: string,
): string {
  const url = new URL(
    `${FACEBOOK_GRAPH_BASE_URL}/${version}/${postId}/comments`,
  );
  url.searchParams.set("fields", FB_COMMENT_FIELDS);
  url.searchParams.set("filter", "toplevel");
  url.searchParams.set("order", "reverse_chronological");
  url.searchParams.set("limit", String(limit));
  if (after) url.searchParams.set("after", after);
  url.searchParams.set("access_token", accessToken);
  return url.toString();
}

// ── Page content ─────────────────────────────────────────────────────────────

/**
 * Fields asked for on every Page post.
 *
 * `comments.summary(true)` and `likes.summary(true)` are asked for with
 * `limit(0)`: the summary carries `total_count`, and without the limit Meta
 * ships the first 25 of each alongside it for nothing.
 */
export const PAGE_POST_FIELDS =
  "id,message,story,created_time,permalink_url,full_picture,status_type," +
  "comments.summary(true).limit(0),likes.summary(true).limit(0),shares";

export function buildPagePostsUrl(
  pageId: string,
  accessToken: string,
  limit: number = 30,
  version: string = getMetaGraphVersion(),
): string {
  const url = new URL(`${FACEBOOK_GRAPH_BASE_URL}/${version}/${pageId}/posts`);
  url.searchParams.set("fields", PAGE_POST_FIELDS);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("access_token", accessToken);
  return url.toString();
}

/**
 * The cheapest look at the feed — ids and dates only (F6, level 2).
 *
 * A Page webhook does announce a new post (`feed` with `item: "post"`), unlike
 * Instagram, but it announces it as an id with no numbers attached and only for
 * posts published through the API. This poll is what makes "a post appeared in
 * the panel" true for a post typed straight into Facebook, too.
 */
export function buildPagePostIdsUrl(
  pageId: string,
  accessToken: string,
  limit: number = 5,
  version: string = getMetaGraphVersion(),
): string {
  const url = new URL(`${FACEBOOK_GRAPH_BASE_URL}/${version}/${pageId}/posts`);
  url.searchParams.set("fields", "id,created_time");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("access_token", accessToken);
  return url.toString();
}

/** One post node, with the same fields the feed listing asks for. */
export function buildPostNodeUrl(
  postId: string,
  accessToken: string,
  version: string = getMetaGraphVersion(),
): string {
  const url = new URL(`${FACEBOOK_GRAPH_BASE_URL}/${version}/${postId}`);
  url.searchParams.set("fields", PAGE_POST_FIELDS);
  url.searchParams.set("access_token", accessToken);
  return url.toString();
}

/** The Page node — name and fan count for the Settings card and the KPIs. */
export function buildPageNodeUrl(
  pageId: string,
  accessToken: string,
  version: string = getMetaGraphVersion(),
): string {
  const url = new URL(`${FACEBOOK_GRAPH_BASE_URL}/${version}/${pageId}`);
  url.searchParams.set("fields", "id,name,link,fan_count,followers_count");
  url.searchParams.set("access_token", accessToken);
  return url.toString();
}

/**
 * Daily Page insights over a date window.
 *
 * The metric list is a parameter and not a constant baked into the URL because
 * Meta answers an unknown or retired metric by REFUSING THE WHOLE REQUEST — one
 * deprecated name and all three numbers are gone. The sync therefore asks for
 * everything once and, if that is refused, asks again for the core two.
 */
export const PAGE_INSIGHT_METRICS = [
  "page_impressions",
  "page_post_engagements",
  "page_fans",
] as const;

/** The subset that has survived every Graph version so far. */
export const PAGE_INSIGHT_METRICS_CORE = [
  "page_impressions",
  "page_post_engagements",
] as const;

export function buildPageInsightsUrl({
  pageId,
  accessToken,
  since,
  until,
  metrics = PAGE_INSIGHT_METRICS,
  version = getMetaGraphVersion(),
}: {
  pageId: string;
  accessToken: string;
  /** Unix SECONDS, which is what this endpoint takes — not milliseconds. */
  since: number;
  until: number;
  metrics?: readonly string[];
  version?: string;
}): string {
  const url = new URL(
    `${FACEBOOK_GRAPH_BASE_URL}/${version}/${pageId}/insights`,
  );
  url.searchParams.set("metric", metrics.join(","));
  url.searchParams.set("period", "day");
  url.searchParams.set("since", String(since));
  url.searchParams.set("until", String(until));
  url.searchParams.set("access_token", accessToken);
  return url.toString();
}

/** Lifetime insights of one post. Same all-or-nothing rule as the Page ones. */
export const POST_INSIGHT_METRICS = [
  "post_impressions",
  "post_impressions_unique",
  "post_clicks",
] as const;

export const POST_INSIGHT_METRICS_CORE = ["post_impressions"] as const;

export function buildPostInsightsUrl(
  postId: string,
  accessToken: string,
  metrics: readonly string[] = POST_INSIGHT_METRICS,
  version: string = getMetaGraphVersion(),
): string {
  const url = new URL(
    `${FACEBOOK_GRAPH_BASE_URL}/${version}/${postId}/insights`,
  );
  url.searchParams.set("metric", metrics.join(","));
  url.searchParams.set("access_token", accessToken);
  return url.toString();
}

// ── Response shapes ──────────────────────────────────────────────────────────

export interface RawGraphError {
  message: string;
  type: string;
  code: number;
  error_subcode?: number;
}

export interface RawFacebookTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: RawGraphError;
}

export interface RawPageAccount {
  id?: string;
  name?: string;
  access_token?: string;
  category?: string;
  link?: string;
  tasks?: string[];
}

export interface RawPageAccountsResponse {
  data?: RawPageAccount[];
  paging?: { next?: string };
  error?: RawGraphError;
}

export interface RawDebugTokenResponse {
  data?: {
    app_id?: string;
    is_valid?: boolean;
    expires_at?: number; // unix seconds; 0 means "does not expire"
    data_access_expires_at?: number;
    scopes?: string[];
    profile_id?: string;
  };
  error?: RawGraphError;
}

export interface RawPageNode {
  id?: string;
  name?: string;
  link?: string;
  fan_count?: number;
  followers_count?: number;
  error?: RawGraphError;
}

export interface RawPagePost {
  id?: string;
  message?: string;
  story?: string;
  created_time?: string;
  permalink_url?: string;
  full_picture?: string;
  status_type?: string;
  comments?: { summary?: { total_count?: number } };
  likes?: { summary?: { total_count?: number } };
  shares?: { count?: number };
}

export interface RawPagePostsResponse {
  data?: RawPagePost[];
  paging?: { cursors?: { after?: string }; next?: string };
  error?: RawGraphError;
}

export interface RawFbComment {
  id?: string;
  message?: string;
  created_time?: string;
  like_count?: number;
  is_hidden?: boolean;
  permalink_url?: string;
  from?: { id?: string; name?: string };
  /** The nested page of replies — paginated exactly like the top-level list. */
  comments?: {
    data?: RawFbComment[];
    paging?: { cursors?: { before?: string; after?: string }; next?: string };
  };
}

export interface RawFbCommentsResponse {
  data?: RawFbComment[];
  paging?: { cursors?: { after?: string }; next?: string };
  error?: RawGraphError;
}

export interface RawFbInsightsResponse {
  data?: Array<{
    name?: string;
    period?: string;
    values?: Array<{ value?: unknown; end_time?: string }>;
  }>;
  error?: RawGraphError;
}

/** What a moderation write answers with. */
export interface RawFbWriteResponse {
  id?: string;
  success?: boolean;
  error?: RawGraphError;
}
