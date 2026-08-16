/**
 * Single shared slugify implementation for campaign names and UTM parameters.
 *
 * Rules:
 * 1. Lowercase
 * 2. Transliterate Serbian diacritics:
 *    š -> s, đ -> dj, č -> c, ć -> c, ž -> z (and uppercase variants)
 * 3. Spaces and underscores -> "-"
 * 4. Strip remaining non-alphanumerics except "-"
 * 5. Collapse multiple consecutive hyphens into a single "-"
 * 6. Strip leading and trailing hyphens and dots
 */
export function slugify(input: string): string {
  if (!input) return "";

  const diacriticsMap: Record<string, string> = {
    š: "s",
    đ: "dj",
    č: "c",
    ć: "c",
    ž: "z",
  };

  return input
    .toLowerCase()
    .replace(/[šđčćž]/g, (char) => diacriticsMap[char] ?? char)
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}
