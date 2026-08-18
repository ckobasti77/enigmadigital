/**
 * Pure helpers for OpenReply keyword matching and UTC date formatting.
 * No Convex imports.
 */

const SERBIAN_DIACRITICS: Record<string, string> = {
  č: "c",
  ć: "c",
  š: "s",
  ž: "z",
  đ: "dj",
};

/** "YYYY-MM-DD" in UTC — same convention as every other daily table. */
export function utcDateKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Lowercase, trim, strip Serbian diacritics (č ć š ž đ → c c s z dj). */
export function foldText(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[čćšžđ]/g, (char) => SERBIAN_DIACRITICS[char] ?? char);
}

/** Normalize a user-entered keyword for storage/comparison. */
export function normalizeKeyword(input: string): string {
  return foldText(input);
}

/** Escape special regex characters in a string. */
export function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface MatchOptions {
  matchAnyWord: boolean; // true = ANY keyword matches, false = ALL must match
  wholeWordMatch: boolean;
}

function matchesSingleKeyword(
  foldedText: string,
  keyword: string,
  wholeWordMatch: boolean,
): boolean {
  const foldedKw = foldText(keyword);
  if (foldedKw.length === 0) return false;

  if (!wholeWordMatch) {
    return foldedText.includes(foldedKw);
  }

  const escaped = escapeRegExp(foldedKw);
  const regex = new RegExp(
    `(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`,
    "u",
  );
  return regex.test(foldedText);
}

/**
 * Return the first matching keyword, or null.
 * - Both sides are folded with foldText before comparing.
 * - wholeWordMatch: the keyword must be delimited by a non-letter/digit
 *   boundary on both sides (build the regex from the ESCAPED keyword; do NOT
 *   rely on \b, it misbehaves with non-ASCII).
 * - matchAnyWord === false: every keyword must be present; return the FIRST
 *   keyword when all match, otherwise null.
 * - Empty keyword list → null.
 */
export function matchKeywords(
  text: string,
  keywords: string[],
  options: MatchOptions,
): string | null {
  if (keywords.length === 0) return null;
  const foldedText = foldText(text);
  if (foldedText.length === 0) return null;

  if (options.matchAnyWord) {
    for (const kw of keywords) {
      if (matchesSingleKeyword(foldedText, kw, options.wholeWordMatch)) {
        return kw;
      }
    }
    return null;
  }

  const allMatch = keywords.every((kw) =>
    matchesSingleKeyword(foldedText, kw, options.wholeWordMatch),
  );
  return allMatch ? keywords[0] : null;
}
