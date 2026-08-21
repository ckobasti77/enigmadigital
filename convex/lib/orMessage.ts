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

// ── UTF-8 Byte Measurement (Instagram 1000 bytes limit) ──────────────────────

/**
 * Calculate the exact UTF-8 byte length of a string.
 *
 * Instagram's limit on text messages is 1000 BYTES (not characters).
 * Serbian diacritics (č, ć, š, ž, đ) take 2 bytes each, while emojis take 4 bytes.
 */
export function getUtf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/**
 * Check if a text message is within Instagram's 1000 bytes limit.
 */
export function isWithinUtf8ByteLimit(
  text: string,
  maxBytes: number = 1000,
): boolean {
  return getUtf8ByteLength(text) <= maxBytes;
}

/**
 * Remaining time in the 24-hour messaging window (in milliseconds).
 * Returns 0 if expired or not active.
 */
export function getRemainingMessagingWindowMs(
  lastUserMessageAt: number | null | undefined,
  now: number = Date.now(),
  platform: OrPlatform = "instagram",
): number {
  if (typeof lastUserMessageAt !== "number") return 0;
  const elapsed = now - lastUserMessageAt;
  const total = MESSAGING_WINDOW_MS[platform];
  return Math.max(0, total - elapsed);
}

/**
 * Formats remaining window duration into a Serbian string.
 * e.g. "23 č 45 min", "45 min", "Istekao prozor"
 */
export function formatRemainingMessagingWindow(
  lastUserMessageAt: number | null | undefined,
  now: number = Date.now(),
  platform: OrPlatform = "instagram",
): string {
  const remaining = getRemainingMessagingWindowMs(
    lastUserMessageAt,
    now,
    platform,
  );
  if (remaining <= 0) {
    return "Istekao prozor";
  }
  const hours = Math.floor(remaining / (60 * 60 * 1000));
  const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
  if (hours > 0) {
    return `${hours} č ${minutes} min`;
  }
  return `${minutes} min`;
}

/**
 * HUMAN_AGENT 7-day window (pending Meta App Review approval).
 */
export const HUMAN_AGENT_WINDOW_MS: Record<OrPlatform, number> = {
  instagram: 7 * 24 * 60 * 60 * 1000,
  facebook: 7 * 24 * 60 * 60 * 1000,
};

