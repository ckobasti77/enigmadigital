// Preneto iz Devotion apps/web/components/workspace/page/page-document-model.ts (main @ c05c40f), SPAJANJE S10.
/**
 * Čista logika stranice kao dokumenta tima (PROSTOR P13, plan K07 §5.6): šta
 * gledalac sme (iz `permissions` servera — klijent ne računa „autor" sam, K07
 * R16), meta tekstovi i stavke menija „…". Testovi: `page-document-model.test.ts`.
 */
import { formatEditTime } from "..";

import { pageKindMeta, type PageKind } from "../web/vrste-stranica";

export type DocumentPermissions = {
  canEdit: boolean;
  canMove: boolean;
  canDetach: boolean;
  canArchive: boolean;
  canLock: boolean;
  canUnlock: boolean;
  canComment: boolean;
  canRestoreRevision: boolean;
  isLocked: boolean;
};

/** Otključana · zaključana a smeš (autor, vlasnik, admin) · zaključana i samo čitaš. */
export type LockView = "unlocked" | "locked-editable" | "locked-readonly";

export function lockView(permissions: Pick<DocumentPermissions, "isLocked" | "canEdit">): LockView {
  if (!permissions.isLocked) return "unlocked";
  return permissions.canEdit ? "locked-editable" : "locked-readonly";
}

/**
 * Šta dokument nudi: editor i naslov svakom ko sme da menja (svaki član na
 * otključanoj, P1), komentar uvek (R12), nova podstranica = spisak dece (R6).
 */
export function documentAccess(permissions: DocumentPermissions) {
  return {
    editable: permissions.canEdit,
    canComment: permissions.canComment,
    canCreateChild: permissions.canEdit,
    lock: lockView(permissions),
  };
}

/** Bočna kolona: „Marko · pre 5 min". */
export function lastEditLabel(editorName: string | null, updatedAt: number, now: number): string {
  return `${editorName?.trim() || "Član tima"} · ${formatEditTime(updatedAt, now)}`;
}

/** Meta red ispod naslova (uske širine): „Ana Petrović · izmenio/la Marko pre 5 min". */
export function documentMetaLine(input: {
  authorName: string | null;
  editorName: string | null;
  updatedAt: number;
  now: number;
}): string {
  const author = input.authorName?.trim() || "Autor nepoznat";
  const editor = input.editorName?.trim() || "član tima";
  return `${author} · izmenio/la ${editor} ${formatEditTime(input.updatedAt, input.now)}`;
}

/** Red podstranice: „Beleška · Ana · pre 2 dana". */
export function subpageMeta(
  input: { kind: PageKind; editorName: string | null; updatedAt: number },
  now: number,
): string {
  const parts: string[] = [pageKindMeta(input.kind).label];
  if (input.editorName?.trim()) parts.push(input.editorName.trim());
  parts.push(formatEditTime(input.updatedAt, now));
  return parts.join(" · ");
}

/** Broj uz „Komentari" / „Podstranice": „4", „20+", ili ništa dok se ne zna. */
export function countLabel(value: { count: number; capped: boolean } | null): string | null {
  if (value === null) return null;
  return `${value.count}${value.capped ? "+" : ""}`;
}

export type PageMenuKey =
  | "comments"
  | "history"
  | "lock"
  | "unlock"
  | "map"
  | "move"
  | "detach"
  | "discussion"
  | "archive";

/**
 * Stavke menija „…" redom (K07 §5.6). Komentari i Istorija su u meniju i kad
 * na širem ekranu imaju svoja dugmad (na 390 dugmadi nema).
 */
export function pageMenuKeys(
  permissions: DocumentPermissions,
  context: { hasChildren: boolean; otherAreas: number },
): PageMenuKey[] {
  const keys: PageMenuKey[] = ["comments", "history"];
  if (permissions.canLock) keys.push("lock");
  if (permissions.canUnlock) keys.push("unlock");
  if (context.hasChildren) keys.push("map");
  if (permissions.canMove && context.otherAreas > 0) keys.push("move");
  if (permissions.canDetach) keys.push("detach");
  keys.push("discussion");
  if (permissions.canArchive) keys.push("archive");
  return keys;
}

/** Toast posle brisanja: „„Plan” je u Korpi." (uz „Poništi"). */
export function trashedMessage(title: string): string {
  return `„${title.trim() || "Bez naslova"}” je u Korpi.`;
}

/** Zašto „Vrati ovu verziju" trenutno ne radi (`null` = radi). */
export function restoreBlockedReason(input: {
  canRestoreRevision: boolean;
  saveState: "saved" | "saving" | "dirty" | "error" | "conflict" | "invalid";
  /** Zadatak je muškog roda: „Zadatak je zaključan." */
  subject?: "page" | "task";
}): string | null {
  if (!input.canRestoreRevision) return input.subject === "task" ? "Zadatak je zaključan." : "Stranica je zaključana.";
  if (input.saveState !== "saved") return "Sačekaj da se tvoje izmene sačuvaju.";
  return null;
}
