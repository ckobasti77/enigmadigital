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
