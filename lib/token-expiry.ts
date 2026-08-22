/**
 * One source of truth for what a connection's token-expiry means, in words.
 *
 * The Settings cards used to inline this as a ternary, which is how "no expiry"
 * and "expired" drift apart across three cards. The rule is simple and worth
 * stating once: an ABSENT `expiresAt` means the token does not expire — it is
 * NEVER the same statement as "expired". A token only reads as expiring when
 * there is a real date AND it is close. `null` for `now` means the clock has not
 * ticked yet ("još ne znam"), which is also never "expiring".
 */

/** Warn when this little time is left; matches the cards' pre-existing window. */
export const TOKEN_EXPIRY_WARNING_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * What the card says when a token has no clock expiry at all.
 *
 * Phrased as "ne ističe" (does not expire), deliberately NOT "istekao/isteklo"
 * (expired): absence of a date is the opposite of expiry, and the two must never
 * read alike. The test asserts this string carries neither expired word.
 */
export const TOKEN_NEVER_EXPIRES_TEXT =
  "Token ne ističe — Meta ga poništava samo pri promeni lozinke ili povlačenju dozvole.";

export type TokenExpiryKind = "never" | "valid" | "expiring";

export interface TokenExpiryDescription {
  kind: TokenExpiryKind;
  /** Only set for `kind: "never"`; the card renders it verbatim. */
  neverText?: string;
}

/**
 * Describe a token's expiry from its timestamp and the current clock.
 *
 * @param expiresAt ms since epoch, or `null`/`undefined` for "does not expire".
 * @param now       ms since epoch, or `null` before the first clock tick.
 */
export function describeTokenExpiry(
  expiresAt: number | null | undefined,
  now: number | null,
): TokenExpiryDescription {
  if (expiresAt === null || expiresAt === undefined) {
    return { kind: "never", neverText: TOKEN_NEVER_EXPIRES_TEXT };
  }
  if (now !== null && expiresAt - now < TOKEN_EXPIRY_WARNING_MS) {
    return { kind: "expiring" };
  }
  return { kind: "valid" };
}
