/**
 * Pure helpers for OpenReply message formatting and retry delays.
 * No Convex imports.
 */

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

// ── Instagram's 24h messaging window ─────────────────────────────────────────
/**
 * How long after someone writes to us — or taps a button, which counts the
 * same — Instagram still lets us reply. Meta's hard rule; a message sent
 * outside it is rejected, so we never send one.
 */
export const MESSAGING_WINDOW_MS = 24 * 60 * 60 * 1000;

/** What a log row says when the window closed before the message went out. */
export const MESSAGING_WINDOW_EXPIRED_MESSAGE =
  "Prozor od 24 sata od poslednje poruke korisnika je istekao.";

/**
 * True when we may still reply. `orConversations.lastUserMessageAt` is the
 * authoritative clock; no row at all (a commenter who never wrote) is a closed
 * window, not an open one.
 */
export function isWithinMessagingWindow(
  lastUserMessageAt: number | null | undefined,
  now: number,
): boolean {
  return (
    typeof lastUserMessageAt === "number" &&
    now - lastUserMessageAt <= MESSAGING_WINDOW_MS
  );
}
