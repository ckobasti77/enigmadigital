import {
  extractGraphApiError,
  extractGraphApiErrorCode,
  type RawComment,
} from "./instagramApi";

/**
 * ============================================================================
 * INSTAGRAM COMMENT MODERATION — PURE HELPERS (F4)
 * ============================================================================
 *
 * No database, no fetch. Two jobs: turn Meta's refusals into sentences an
 * operator can act on, and flatten the comments edge into rows.
 * ============================================================================
 */

/** How many top-level comments one sync pulls per post. */
export const COMMENTS_PER_MEDIA = 50;

/**
 * How far back the comment sync reaches. Instagram keeps answering for older
 * posts, but a comment on a post from last spring is not what this screen is
 * for, and every post costs a call.
 */
export const COMMENT_SYNC_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** Instagram rejects anything longer, and says so with a 400. */
export const REPLY_TEXT_MAX = 2200;

/** How many comments one bulk action may carry. */
export const BULK_ACTION_MAX = 50;

/**
 * Turn a Graph API refusal into a sentence an operator can act on.
 *
 * Meta writes its errors for the developer who made the call, not for the
 * person who pressed the button, so "(#10) Application does not have permission
 * for this action" lands in front of someone whose actual problem is that the
 * Instagram account has to be reconnected. Every case below says what went
 * wrong AND what to do next.
 *
 * Anything unrecognised falls through to Meta's own message rather than to a
 * generic apology: an error we have never seen before is still more useful to
 * whoever has to report it than the single word "greška".
 */
export function translateModerationError(body: unknown): string {
  const raw = extractGraphApiError(body);
  const lower = raw.toLowerCase();
  const code = extractGraphApiErrorCode(body);

  if (
    code === 10 ||
    lower.includes("does not have permission") ||
    lower.includes("instagram_business_manage_comments")
  ) {
    return "Nalogu nedostaje dozvola za moderaciju komentara. Ponovo poveži Instagram nalog u Podešavanjima.";
  }

  if (code === 190 || lower.includes("access token")) {
    return "Instagram pristup je istekao. Ponovo poveži nalog u Podešavanjima.";
  }

  if (
    code === 200 ||
    lower.includes("permissions error") ||
    lower.includes("missing permissions")
  ) {
    return "Instagram je odbio radnju zbog dozvola naloga. Ponovo poveži Instagram nalog u Podešavanjima.";
  }

  // Throttling. Meta uses several codes for the same thing depending on which
  // ceiling was hit, and the answer is the same in all of them: wait.
  if (code === 4 || code === 17 || code === 32 || code === 613) {
    return "Instagram je privremeno ograničio broj zahteva. Sačekaj nekoliko minuta pa pokušaj ponovo.";
  }

  if (code === 100 && lower.includes("does not exist")) {
    return "Komentar više ne postoji na Instagramu.";
  }

  if (code === 24 || lower.includes("comment is not allowed")) {
    return "Instagram nije prihvatio ovaj tekst odgovora. Skrati ga ili izbaci ponovljene znakove.";
  }

  if (lower.includes("media is not available")) {
    return "Objava više nije dostupna na Instagramu.";
  }

  return raw;
}

/** A comment flattened out of the edge, ready for the database. */
export interface NormalizedComment {
  commentId: string;
  parentCommentId?: string;
  text: string;
  username: string;
  timestamp: number;
  likeCount?: number;
  hidden: boolean;
  isOurs: boolean;
  repliedByUs: boolean;
}

/** Instagram sends ISO 8601; an unparsable value must not become NaN. */
function parseCommentTimestamp(value: string | undefined): number {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Flatten a page of comments and their replies into rows.
 *
 * `ourUsername` is how a comment of ours is recognised. The comments edge does
 * not say who wrote what beyond a handle — `from` belongs to the older
 * Facebook-login API and is simply absent here — so the handle is all there is
 * to compare against. A top-level comment counts as answered when at least one
 * of its replies is ours.
 */
export function normalizeComments(
  list: RawComment[] | undefined,
  ourUsername: string | undefined,
): NormalizedComment[] {
  const ours = (ourUsername ?? "").trim().toLowerCase();
  const isOurs = (username: string | undefined): boolean =>
    ours.length > 0 && (username ?? "").trim().toLowerCase() === ours;

  const out: NormalizedComment[] = [];

  for (const comment of list ?? []) {
    if (!comment?.id) continue;

    const replies = comment.replies?.data ?? [];

    out.push({
      commentId: String(comment.id),
      text: comment.text ?? "",
      username: comment.username ?? "",
      timestamp: parseCommentTimestamp(comment.timestamp),
      ...(typeof comment.like_count === "number"
        ? { likeCount: comment.like_count }
        : {}),
      hidden: comment.hidden === true,
      isOurs: isOurs(comment.username),
      repliedByUs: replies.some((r) => isOurs(r.username)),
    });

    for (const reply of replies) {
      if (!reply?.id) continue;
      out.push({
        commentId: String(reply.id),
        parentCommentId: String(comment.id),
        text: reply.text ?? "",
        username: reply.username ?? "",
        timestamp: parseCommentTimestamp(reply.timestamp),
        ...(typeof reply.like_count === "number"
          ? { likeCount: reply.like_count }
          : {}),
        hidden: reply.hidden === true,
        isOurs: isOurs(reply.username),
        // A reply is the leaf of the tree; nothing hangs off it.
        repliedByUs: false,
      });
    }
  }

  return out;
}
