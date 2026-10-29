// Preneto iz Devotion packages/backend/convex/lib/page_kinds.ts (main @ c05c40f), SPAJANJE S02.
export type WorkspacePageKind = "note" | "task" | "file" | "table";

export const PAGE_KIND_KEYS: readonly WorkspacePageKind[] = [
  "note",
  "task",
  "file",
  "table",
] as const;

/**
 * Samo zadatak nosi status, prioritet, rok, instrukcije, izvršioce i
 * checkpointe. Svaka provera „da li ovde smeju task polja” mora ići kroz ovo,
 * a ne kroz poređenje sa `"note"` — inače bi svaka nova vrsta tiho prošla.
 */
export function supportsTaskData(kind: WorkspacePageKind) {
  return kind === "task";
}

/** Vrste čiji je glavni sadržaj rich-text telo stranice. */
export function supportsRichTextBody(kind: WorkspacePageKind) {
  return kind === "note";
}
