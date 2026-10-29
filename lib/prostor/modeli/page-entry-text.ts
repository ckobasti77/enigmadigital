// Preneto iz Devotion apps/web/components/workspace/page-entry-text.ts (main @ c05c40f), SPAJANJE S10.
export function pageEntryDisplayText(content: string) {
  return content
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li(?:\s[^>]*)?>/gi, "• ")
    .replace(/<\/(?:p|div|li|blockquote|h[1-6])>/gi, "\n")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/?[a-z][^>]*>/gi, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:39|x27);/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
