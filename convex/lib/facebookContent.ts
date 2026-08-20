/**
 * ============================================================================
 * FACEBOOK PAGE CONTENT — PURE HELPERS (F5)
 * ============================================================================
 *
 * No database, no fetch. Three jobs: flatten Meta's answers into rows, read
 * the numbers out of an insights response, and turn a refusal into a sentence
 * an operator can act on.
 *
 * The Instagram twin of this file is `lib/igComments.ts`, and the two are
 * deliberately separate rather than one generic module: the two APIs disagree
 * about who wrote a comment (`from.id` here, a bare username there), about what
 * hiding is called (`is_hidden` vs `hide`), and about whether liking exists at
 * all. A shared abstraction would spend most of its lines on the differences.
 * ============================================================================
 */

import { extractGraphApiError, extractGraphApiErrorCode } from "./instagramApi";
import { FB_COMMENT_REPLIES_PAGE } from "./facebookApi";
import type {
  RawFbComment,
  RawFbInsightsResponse,
  RawPagePost,
} from "./facebookApi";

/** How many top-level comments one sync pulls per post, per page. */
export const FB_COMMENTS_PER_POST = 50;

/**
 * The ceiling on one post's comment sync: whichever of the two comes first.
 * When either stops the walk, the post row is stamped (`commentsTruncatedAt`)
 * and the pass declares itself incomplete, which switches the deletion sweep
 * off for that post — a silent cap would read as "we saw everything" (V1).
 */
export const FB_COMMENT_PAGE_LIMIT = 10;
export const FB_COMMENT_TOTAL_LIMIT = 500;

/** How many comment rows go into ONE upsert mutation. */
export const FB_COMMENT_WRITE_CHUNK = 200;

/**
 * Was this comment's reply list cut short? Two signals, because neither alone
 * is trustworthy — nested paging often answers with cursors and no `next`, so
 * a full page counts as "possibly more" as well.
 */
export function fbRepliesTruncated(comment: RawFbComment): boolean {
  const replies = comment.comments;
  if (!replies) return false;
  if (replies.paging?.next !== undefined) return true;
  return (replies.data?.length ?? 0) >= FB_COMMENT_REPLIES_PAGE;
}

/** How many comments on this page came back with their replies cut short. */
export function countFbTruncatedReplies(
  list: RawFbComment[] | undefined,
): number {
  let n = 0;
  for (const comment of list ?? []) {
    if (fbRepliesTruncated(comment)) n++;
  }
  return n;
}

/**
 * How far back the comment sync reaches. Facebook keeps answering for older
 * posts, but a comment on a post from last spring is not what the moderation
 * screen is for, and every post costs a call.
 */
export const FB_COMMENT_SYNC_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** How many posts one sync pulls comments for. */
export const FB_COMMENT_POST_LIMIT = 20;

/** How many posts one sync reads off the feed. */
export const FB_POSTS_PER_SYNC = 30;

/** Facebook rejects a longer comment with a 400. */
export const FB_REPLY_TEXT_MAX = 8000;

/** How many comments one bulk action may carry. */
export const FB_BULK_ACTION_MAX = 50;

// ── Errors ───────────────────────────────────────────────────────────────────

/**
 * Turn a Graph API refusal into a sentence an operator can act on.
 *
 * Meta writes its errors for the developer who made the call, so "(#200) The
 * user hasn't authorized the application to perform this action" lands in front
 * of someone whose actual problem is that a scope is missing from the app.
 * Every case below says what went wrong AND what to do next; anything
 * unrecognised falls through to Meta's own message, which is still more useful
 * to whoever has to report it than the single word "greška".
 */
export function translateFacebookError(body: unknown): string {
  const raw = extractGraphApiError(body);
  const lower = raw.toLowerCase();
  const code = extractGraphApiErrorCode(body);

  if (code === 190 || lower.includes("access token")) {
    return "Facebook pristup je istekao. Ponovo poveži stranicu u Podešavanjima.";
  }

  if (
    code === 10 ||
    code === 200 ||
    lower.includes("does not have permission") ||
    lower.includes("hasn't authorized") ||
    lower.includes("permissions error")
  ) {
    return "Stranici nedostaje dozvola za ovu radnju. Dodaj pages_manage_engagement i pages_read_engagement u Meta aplikaciji, pa ponovo poveži stranicu.";
  }

  // Throttling. Meta uses several codes for the same thing depending on which
  // ceiling was hit, and the answer is the same in all of them: wait.
  if (code === 4 || code === 17 || code === 32 || code === 613) {
    return "Facebook je privremeno ograničio broj zahteva. Sačekaj nekoliko minuta pa pokušaj ponovo.";
  }

  if (code === 100 && lower.includes("does not exist")) {
    return "Objekat više ne postoji na Facebook-u.";
  }

  if (lower.includes("already liked") || lower.includes("duplicate")) {
    return "Stranica je već lajkovala ovaj sadržaj.";
  }

  return raw;
}

// ── Timestamps ───────────────────────────────────────────────────────────────

/** Facebook sends ISO 8601; an unparsable value must not become NaN. */
export function parseFacebookTime(value: string | undefined): number {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

// ── Posts ────────────────────────────────────────────────────────────────────

/** One Page post flattened out of the feed, ready for the database. */
export interface NormalizedPagePost {
  postId: string;
  message: string;
  /** "photo", "video", "link"… Meta's own word, printed on the type badge. */
  statusType: string;
  permalink: string;
  pictureUrl?: string;
  publishedAt: number;
  likes: number;
  comments: number;
  shares: number;
}

/**
 * Flatten a page of Page posts.
 *
 * `message` is the caption a person wrote; `story` is the sentence Facebook
 * generates for a post nobody captioned ("Enigma It updated their cover
 * photo"). Neither is more correct than the other — what the screen needs is
 * whichever one exists, so the caption falls back to the story.
 */
export function normalizePagePosts(
  list: RawPagePost[] | undefined,
): NormalizedPagePost[] {
  const out: NormalizedPagePost[] = [];

  for (const post of list ?? []) {
    if (!post?.id) continue;
    out.push({
      postId: String(post.id),
      message: post.message ?? post.story ?? "",
      statusType: post.status_type ?? "status",
      permalink: post.permalink_url ?? "",
      ...(post.full_picture ? { pictureUrl: post.full_picture } : {}),
      publishedAt: parseFacebookTime(post.created_time),
      likes: post.likes?.summary?.total_count ?? 0,
      comments: post.comments?.summary?.total_count ?? 0,
      shares: post.shares?.count ?? 0,
    });
  }

  return out;
}

// ── Comments ─────────────────────────────────────────────────────────────────

/** A comment flattened out of the edge, ready for the database. */
export interface NormalizedFbComment {
  commentId: string;
  parentCommentId?: string;
  text: string;
  /** The commenter's display name; Facebook has no @handle here. */
  authorName: string;
  authorId?: string;
  permalink?: string;
  timestamp: number;
  likeCount?: number;
  hidden: boolean;
  isOurs: boolean;
  repliedByUs: boolean;
}

/**
 * Flatten a page of comments and their replies into rows.
 *
 * `pageId` is how a comment of ours is recognised, and it is a genuinely better
 * signal than the Instagram side has: Facebook names the author outright, so a
 * Page whose name someone else happens to share is never mistaken for us.
 *
 * `from` can be absent — Facebook withholds it for a commenter who has not
 * granted the app anything — in which case the comment is somebody else's by
 * definition: our own always carries the Page.
 *
 * A top-level comment counts as answered when at least one of its replies is
 * ours. Replies of replies are flattened onto the top-level parent: Facebook
 * allows the depth, a moderation queue does not benefit from it.
 */
export function normalizeFbComments(
  list: RawFbComment[] | undefined,
  pageId: string,
): NormalizedFbComment[] {
  const ours = (id: string | undefined): boolean =>
    id !== undefined && id === pageId;

  const out: NormalizedFbComment[] = [];

  const flatten = (comment: RawFbComment, parentId: string): void => {
    if (!comment?.id) return;
    out.push({
      commentId: String(comment.id),
      parentCommentId: parentId,
      text: comment.message ?? "",
      authorName: comment.from?.name ?? "",
      ...(comment.from?.id ? { authorId: String(comment.from.id) } : {}),
      ...(comment.permalink_url ? { permalink: comment.permalink_url } : {}),
      timestamp: parseFacebookTime(comment.created_time),
      ...(typeof comment.like_count === "number"
        ? { likeCount: comment.like_count }
        : {}),
      hidden: comment.is_hidden === true,
      isOurs: ours(comment.from?.id),
      // A reply is a leaf here by construction — see the doc comment.
      repliedByUs: false,
    });

    for (const nested of comment.comments?.data ?? []) {
      flatten(nested, parentId);
    }
  };

  for (const comment of list ?? []) {
    if (!comment?.id) continue;

    const replies = comment.comments?.data ?? [];

    out.push({
      commentId: String(comment.id),
      text: comment.message ?? "",
      authorName: comment.from?.name ?? "",
      ...(comment.from?.id ? { authorId: String(comment.from.id) } : {}),
      ...(comment.permalink_url ? { permalink: comment.permalink_url } : {}),
      timestamp: parseFacebookTime(comment.created_time),
      ...(typeof comment.like_count === "number"
        ? { likeCount: comment.like_count }
        : {}),
      hidden: comment.is_hidden === true,
      isOurs: ours(comment.from?.id),
      repliedByUs: replies.some((r) => ours(r.from?.id)),
    });

    for (const reply of replies) {
      flatten(reply, String(comment.id));
    }
  }

  return out;
}

// ── Insights ─────────────────────────────────────────────────────────────────

/** One day of Page-level numbers. */
export interface FbDailyInsight {
  date: string; // "YYYY-MM-DD", UTC
  impressions: number;
  engagements: number;
  fans: number;
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  // Some metrics answer with an object keyed by breakdown; the total is the sum.
  if (value !== null && typeof value === "object") {
    let sum = 0;
    for (const entry of Object.values(value as Record<string, unknown>)) {
      sum += toNumber(entry);
    }
    return sum;
  }
  return 0;
}

/**
 * Turn a daily insights response into one row per day.
 *
 * Meta stamps a daily bucket with `end_time`, which is the MOMENT THE DAY
 * ENDED — so the value at "2026-08-19T07:00:00+0000" describes the 18th, not
 * the 19th. Subtracting a day before taking the date key is what keeps a
 * Facebook row lined up with the GA4 and Instagram rows for the same date.
 */
export function extractPageInsights(
  body: RawFbInsightsResponse | undefined,
): FbDailyInsight[] {
  const byDate = new Map<string, FbDailyInsight>();

  const put = (
    endTime: string | undefined,
    field: keyof Omit<FbDailyInsight, "date">,
    value: unknown,
  ): void => {
    const endMs = parseFacebookTime(endTime);
    if (endMs === 0) return;
    const date = new Date(endMs - 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const row = byDate.get(date) ?? {
      date,
      impressions: 0,
      engagements: 0,
      fans: 0,
    };
    row[field] = toNumber(value);
    byDate.set(date, row);
  };

  for (const metric of body?.data ?? []) {
    const field =
      metric.name === "page_impressions"
        ? "impressions"
        : metric.name === "page_post_engagements"
          ? "engagements"
          : metric.name === "page_fans"
            ? "fans"
            : null;
    if (field === null) continue;

    for (const point of metric.values ?? []) {
      put(point.end_time, field, point.value);
    }
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Lifetime numbers of one post.
 *
 * All three are optional, and a metric Meta did not answer with is LEFT OUT
 * rather than defaulted to zero: the card draws "—" for a number nobody knows
 * and "0" for a number that is genuinely zero, and those are different claims.
 */
export interface FbPostInsight {
  impressions?: number;
  reach?: number;
  clicks?: number;
}

export function extractPostInsights(
  body: RawFbInsightsResponse | undefined,
): FbPostInsight {
  const out: FbPostInsight = {};

  for (const metric of body?.data ?? []) {
    const value = toNumber(metric.values?.[0]?.value);
    if (metric.name === "post_impressions") out.impressions = value;
    else if (metric.name === "post_impressions_unique") out.reach = value;
    else if (metric.name === "post_clicks") out.clicks = value;
  }

  return out;
}
