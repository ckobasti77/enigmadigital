// Preneto iz Devotion packages/shared/src/revisions.ts (main @ c05c40f), SPAJANJE S02.
/**
 * Istorija izmena (PROSTOR P2) — tekstovi za listu revizija, isti na webu i
 * telefonu. ČISTO: bez React-a i bez Convex tipova.
 */
import { dayDiff, formatClock, formatDayRelative } from "./dates";

export type RevisionKind = "baseline" | "edit" | "restore";

/** Oznaka vrste revizije; obična izmena nema oznaku. */
export const REVISION_KIND_LABELS: Record<RevisionKind, string> = {
  baseline: "Zatečeno stanje",
  edit: "Izmena",
  restore: "Vraćena verzija",
};

/** Ko se prikazuje kad revizija nema autora (zatečen, nepotpisan tekst). */
export const UNKNOWN_REVISION_AUTHOR = "Raniji tekst tima";

const MINUTE_MS = 60_000;

/** „upravo", „pre 5 min", „danas u 14:05", „juče u 09:10", „12. okt". */
export function formatEditTime(ms: number, nowMs: number, zone?: string): string {
  const diff = nowMs - ms;
  if (diff < MINUTE_MS) return "upravo";
  if (diff < 60 * MINUTE_MS) return `pre ${Math.floor(diff / MINUTE_MS)} min`;
  const days = dayDiff(ms, nowMs, zone);
  if (days === 0) return `danas u ${formatClock(ms, zone)}`;
  if (days === -1) return `juče u ${formatClock(ms, zone)}`;
  return formatDayRelative(ms, nowMs, zone);
}

/** Red liste: „Ana · pre 5 min" i oznaka vrste (`null` za običnu izmenu). */
export function revisionMeta(
  revision: { kind: RevisionKind; authorName: string | null; updatedAt: number },
  nowMs: number,
  zone?: string,
): { title: string; badge: string | null } {
  const author = revision.authorName ?? UNKNOWN_REVISION_AUTHOR;
  return {
    title: `${author} · ${formatEditTime(revision.updatedAt, nowMs, zone)}`,
    badge: revision.kind === "edit" ? null : REVISION_KIND_LABELS[revision.kind],
  };
}

/** HTML tela (Tiptap) u čitljiv tekst — za isečke i poređenje verzija. */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|h[1-6]|blockquote|tr)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
