// Preneto iz Devotion apps/web/components/workspace/trash/trash-model.ts (main @ c05c40f), SPAJANJE S21.
/**
 * Korpa (PROSTOR P3, plan K07 §5.4) — čista logika reda: tekst, razlog
 * onemogućenog „Vrati", cilj „Otvori" posle vraćanja. Bez React-a; deli je
 * Tekstovi vremena i podstranica dolaze iz `lib/prostor/trash.ts`.
 */
import { subpagesLabel, trashMetaLabel, type TrashKind } from "..";
import type { FunctionReturnType } from "convex/server";

import type { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export type TrashItem = FunctionReturnType<typeof api.prostor.trash.list>["page"][number];
export type TrashCounts = FunctionReturnType<typeof api.prostor.trash.counts>;
export type RestorableTrashItem = Exclude<TrashItem, { kind: "recovered" }>;
export type RecoveredTrashItem = Extract<TrashItem, { kind: "recovered" }>;

export const RETURNS_TO_AREA_ROOT = "Vraća se na vrh oblasti";
export const FILE_PAGE_IN_TRASH = "Stranica ovog fajla je u Korpi — prvo vrati nju.";
export const NO_RESTORE_RIGHT = "Nemaš pravo da vratiš ovu stavku.";

/** Prazna stanja po segmentu (jedna rečenica, bez obećanja roka). */
export const TRASH_EMPTY_COPY: Record<TrashKind, { title: string; description?: string }> = {
  page: { title: "Korpa je prazna.", description: "Obrisano ovde čeka dok ga neko iz tima ne vrati." },
  idea: { title: "Nema obrisanih ideja." },
  file: { title: "Nema uklonjenih priloga." },
  recovered: { title: "Nema oporavljenih tekstova." },
};

export function trashItemKey(item: TrashItem): string {
  switch (item.kind) {
    case "page":
      return `page:${item.pageId}`;
    case "idea":
      return `idea:${item.ideaId}`;
    case "file":
      return `file:${item.fileId}`;
    case "recovered":
      return `recovered:${item.recoveredId}`;
  }
}

export function trashItemTitle(item: TrashItem): string {
  return item.kind === "file" ? item.name : item.title;
}

/** Gde je stavka bila: „Razvoj › Lansiranje" (stranica), „na stranici „X”" (prilog). */
export function trashItemLocation(item: TrashItem): string | null {
  if (item.kind === "page") {
    return item.parentTitle ? `${item.areaLabel} › ${item.parentTitle}` : item.areaLabel;
  }
  if (item.kind === "file") return `na stranici „${item.pageTitle}”`;
  return null;
}

function textsWord(count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;
  if (last === 1 && lastTwo !== 11) return "tekst";
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return "teksta";
  return "tekstova";
}

/** Meta red: „Sa 3 podstranice · Obrisao/la Ana · pre 2 dana · Vraća se na vrh oblasti". */
export function trashItemMeta(item: TrashItem, now: number, zone?: string): string {
  if (item.kind === "recovered") {
    const count = item.contributions.length;
    const owner = item.owner ? `Sačuvano za ${item.owner.displayName}` : "Sačuvano";
    return `${owner} · ${count} ${textsWord(count)}`;
  }
  const parts: string[] = [];
  if (item.kind === "page" && item.descendantCount > 0) {
    parts.push(`Sa ${subpagesLabel(item.descendantCount)}`);
  }
  parts.push(
    trashMetaLabel(
      { archivedAt: item.archivedAt, archivedByName: item.archivedBy?.displayName ?? null },
      now,
      zone,
    ),
  );
  if (item.kind === "page" && item.parentPageId !== null && !item.parentAvailable) {
    parts.push(RETURNS_TO_AREA_ROOT);
  }
  return parts.join(" · ");
}

/** Zašto „Vrati" ne radi (`null` = radi). Prilog čija je stranica u Korpi ide prvi. */
export function restoreBlockReason(item: RestorableTrashItem): string | null {
  if (item.kind === "file" && !item.pageAvailable) return FILE_PAGE_IN_TRASH;
  if (!item.canRestore) return NO_RESTORE_RIGHT;
  return null;
}

export type TrashRestoreTarget =
  | { kind: "page"; id: Id<"pages"> }
  | { kind: "idea"; id: Id<"ideaNodes"> }
  | { kind: "file"; id: Id<"pageFiles"> };

export function restoreTarget(item: RestorableTrashItem): TrashRestoreTarget {
  if (item.kind === "page") return { kind: "page", id: item.pageId };
  if (item.kind === "idea") return { kind: "idea", id: item.ideaId };
  return { kind: "file", id: item.fileId };
}

/** Kuda vodi „Otvori" u toastu posle vraćanja (ideja: njen detalj na tabli, K16). */
export type TrashOpenTarget = { kind: "page"; pageId: Id<"pages"> } | { kind: "ideas"; ideaId: Id<"ideaNodes"> };

export function openTargetAfterRestore(item: RestorableTrashItem): TrashOpenTarget {
  if (item.kind === "idea") return { kind: "ideas", ideaId: item.ideaId };
  return { kind: "page", pageId: item.pageId };
}

/** Broj na kartici segmenta: „99+" kad je server odsekao brojanje. */
export function trashCountLabel(counter: { count: number; capped: boolean } | undefined): string | null {
  if (!counter || counter.count === 0) return null;
  return counter.capped ? `${counter.count}+` : String(counter.count);
}

/**
 * Posle uklanjanja reda fokus ide na red koji je zauzeo njegovo mesto (ili
 * prethodni, kad je bio poslednji); `null` = lista ostaje prazna.
 */
export function focusKeyAfterRemoval(keys: ReadonlyArray<string>, removedIndex: number): string | null {
  return keys[removedIndex + 1] ?? keys[removedIndex - 1] ?? null;
}
