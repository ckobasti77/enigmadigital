/**
 * Pure helpers for OpenReply message formatting and retry delays.
 * No Convex imports.
 */

import type { OrPlatform } from "./orPlatform";

/** Exponential backoff for send retries: 1min, 2min, 4min… capped at 15min. */
export function nextRetryDelayMs(attempts: number): number {
  const safeAttempts = Math.max(0, attempts);
  return Math.min(900_000, 60_000 * Math.pow(2, safeAttempts));
}

/** Build the DM body: base message plus an optional link block. */
export function composeDmMessage(
  dmMessage: string,
  linkUrl?: string,
  linkLabel?: string,
): string {
  const msg = dmMessage.trim();
  const trimmedUrl = linkUrl?.trim();
  if (!trimmedUrl) {
    return msg;
  }

  const trimmedLabel = linkLabel?.trim();
  if (trimmedLabel) {
    return `${msg}\n\n${trimmedLabel}: ${trimmedUrl}`;
  }

  return `${msg}\n\n${trimmedUrl}`;
}

// ── Messaging windows ─────────────────────────────────────────────────────
/**
 * How long after someone writes to us — or taps a button, which counts the
 * same — Meta still lets us reply. Meta's hard rule; a message sent outside it
 * is rejected, so we never send one.
 *
 * Both platforms are 24 hours today. They are written as one constant per
 * platform rather than one shared number because they are two independent
 * policies that merely agree right now — Meta has moved either of them before.
 */
export const MESSAGING_WINDOW_MS: Record<OrPlatform, number> = {
  instagram: 24 * 60 * 60 * 1000,
  facebook: 24 * 60 * 60 * 1000,
};

/**
 * How long after a COMMENT the one allowed private reply may still go out.
 * Seven days on both platforms, and one private reply per comment on both.
 */
export const PRIVATE_REPLY_WINDOW_MS: Record<OrPlatform, number> = {
  instagram: 7 * 24 * 60 * 60 * 1000,
  facebook: 7 * 24 * 60 * 60 * 1000,
};

/** What a log row says when the window closed before the message went out. */
export const MESSAGING_WINDOW_EXPIRED_MESSAGE =
  "Prozor od 24 sata od poslednje poruke korisnika je istekao.";

/** The same, for the seven-day window a comment opens. */
export const PRIVATE_REPLY_WINDOW_EXPIRED_MESSAGE =
  "Prošlo je više od 7 dana od komentara.";

/**
 * True when we may still reply. `orConversations.lastUserMessageAt` is the
 * authoritative clock; no row at all (a commenter who never wrote) is a closed
 * window, not an open one.
 */
export function isWithinMessagingWindow(
  lastUserMessageAt: number | null | undefined,
  now: number,
  platform: OrPlatform = "instagram",
): boolean {
  return (
    typeof lastUserMessageAt === "number" &&
    now - lastUserMessageAt <= MESSAGING_WINDOW_MS[platform]
  );
}

/** True when the comment is still young enough for its one private reply. */
export function isWithinPrivateReplyWindow(
  commentedAt: number,
  now: number,
  platform: OrPlatform = "instagram",
): boolean {
  return now - commentedAt <= PRIVATE_REPLY_WINDOW_MS[platform];
}
