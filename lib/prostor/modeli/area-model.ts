// Preneto iz Devotion apps/web/components/workspace/area/area-model.ts (main @ c05c40f), SPAJANJE S10.
/**
 * Čista logika oblasti (PROSTOR P12, plan K07 §5.5): izbor kartice i njeno
 * pamćenje, tekst zaglavlja, čuvanje opisa oblasti (revizija i konflikt),
 * učitavanje zadataka oblasti i stablo Dokumenata. Bez React-a i bez Convex-a.
 * Testovi: `area-model.test.ts`.
 */
import { formatEditTime } from "..";

import {
  AUTOSAVE_MAX_RETRIES,
  AUTOSAVE_RETRY_MS,
  conflictFromError,
  type ConflictInfo,
} from "./page-autosave-model";
import { tasksWord } from "../web/projekat";

import type { AreaTab } from "../rute";
import { isAreaTab } from "../rute";

// --- Kartice ------------------------------------------------------------------

export const AREA_TAB_LABELS: Record<AreaTab, string> = {
  pregled: "Pregled",
  zadaci: "Zadaci",
  dokumenti: "Dokumenti",
  mapa: "Mapa",
};

/** Ključ zapamćene kartice po oblasti (K07 E15). */
export function areaTabStorageKey(areaId: string): string {
  return `devotion:oblast:${areaId}:tab`;
}

type TabStorage = Pick<Storage, "getItem" | "setItem">;

/** Zapamćena kartica; skladište koje ne radi (privatni režim, kvota) = ništa. */
export function readRememberedAreaTab(storage: TabStorage | null | undefined, areaId: string): AreaTab | null {
  if (!storage) return null;
  try {
    const value = storage.getItem(areaTabStorageKey(areaId));
    return isAreaTab(value) ? value : null;
  } catch {
    return null;
  }
}

export function rememberAreaTab(storage: TabStorage | null | undefined, areaId: string, tab: AreaTab): void {
  if (!storage) return;
  try {
    storage.setItem(areaTabStorageKey(areaId), tab);
  } catch {
    // Pamćenje je pogodnost — neuspeh ne sme da obori izbor kartice.
  }
}

/** URL ima prednost, pa zapamćena kartica, pa Pregled (K07 §5.5). */
export function resolveAreaTab(urlTab: AreaTab | undefined, remembered: AreaTab | null): AreaTab {
  return urlTab ?? remembered ?? "pregled";
}

// --- Zaglavlje ----------------------------------------------------------------

export type AreaCount = { count: number; capped: boolean };

/** „12", „99+"; `null` dok se ne zna. */
export function countText(value: AreaCount | null): string | null {
  if (value === null) return null;
  return `${value.count}${value.capped ? "+" : ""}`;
}

/** „1 stranica", „3 stranice", „12 stranica". */
export function pagesWord(count: number): string {
  const absolute = Math.abs(count);
  const lastDigit = absolute % 10;
  const lastTwo = absolute % 100;
  if (lastDigit === 1 && lastTwo !== 11) return "stranica";
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14)) return "stranice";
  return "stranica";
}

/**
 * Meta uz naziv oblasti: „12 stranica · 8 zadataka". Stranice su vrh oblasti
 * (`pages.areaTopLevelCounts`, E14), zadaci su svi zadaci oblasti do granice.
 */
export function areaHeaderMeta(pages: AreaCount | null, tasks: AreaCount | null): string | null {
  const parts: string[] = [];
  if (pages !== null) parts.push(`${countText(pages)} ${pagesWord(pages.count)}`);
  if (tasks !== null) parts.push(`${countText(tasks)} ${tasksWord(tasks.count)}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Najduži naziv oblasti (`startups.updateArea`, `cleanRequiredText`). */
export const AREA_LABEL_MAX = 100;

export function validateAreaLabel(
  value: string,
): { ok: true; label: string } | { ok: false; message: string } {
  const label = value.trim();
  if (!label) return { ok: false, message: "Naziv ne može biti prazan." };
  if (label.length > AREA_LABEL_MAX) {
    return { ok: false, message: `Naziv može imati najviše ${AREA_LABEL_MAX} znakova.` };
  }
  return { ok: true, label };
}

// --- Opis oblasti: čuvanje ------------------------------------------------------

/** Najduži opis oblasti (`areasV2.updateAreaBody`). */
export const AREA_BODY_MAX = 20_000;

/** Pauza posle kucanja pre čuvanja (K07 §5.5: „1 s posle kucanja"). */
export const AREA_BODY_DELAY_MS = 1_000;

export type AreaBodyServer = { areaId: string; content: string; revision: number };

/**
 * Nacrt opisa. `base`/`baseRevision` su verzija sa servera od koje je nacrt
 * krenuo (`expectedRevision` pri čuvanju); `inFlight` je tekst koji se upravo
 * čuva; `failures` broji neuspehe zaredom (posle tri staje sa ponovnim pokušajem).
 */
export type AreaBodyDraft = {
  areaId: string;
  base: string;
  baseRevision: number;
  value: string;
  inFlight: string | null;
  failed: boolean;
  failures: number;
  conflict: ConflictInfo | null;
};

export type AreaBodyStatus = "saved" | "dirty" | "saving" | "error" | "conflict";

export type AreaBodySubmission = { value: string; expectedRevision: number };

export function createAreaBodyDraft(server: AreaBodyServer): AreaBodyDraft {
  return {
    areaId: server.areaId,
    base: server.content,
    baseRevision: server.revision,
    value: server.content,
    inFlight: null,
    failed: false,
    failures: 0,
    conflict: null,
  };
}

export function areaBodyStatus(draft: AreaBodyDraft): AreaBodyStatus {
  if (draft.conflict !== null) return "conflict";
  if (draft.inFlight !== null) return "saving";
  if (draft.value === draft.base) return "saved";
  return draft.failed ? "error" : "dirty";
}

/**
 * Nova verzija sa servera zamenjuje polje samo kad lokalno ništa ne čeka;
 * dok se kuca, osnova ostaje revizija od koje je korisnik krenuo (pa tuđa
 * izmena u međuvremenu daje konflikt, a ne tiho prepisivanje).
 */
export function areaBodyFromServer(draft: AreaBodyDraft, server: AreaBodyServer): AreaBodyDraft {
  if (draft.areaId !== server.areaId) return createAreaBodyDraft(server);
  if (areaBodyStatus(draft) !== "saved") return draft;
  if (server.revision < draft.baseRevision) return draft;
  if (server.revision === draft.baseRevision && server.content === draft.base) return draft;
  return { ...draft, base: server.content, baseRevision: server.revision, value: server.content, failures: 0, failed: false };
}

export function areaBodyEdit(draft: AreaBodyDraft, value: string): AreaBodyDraft {
  return { ...draft, value, failed: false };
}

/** Počinje čuvanje ako ima šta (nema konflikta, ništa ne čeka odgovor). */
export function areaBodyStartSave(draft: AreaBodyDraft): {
  draft: AreaBodyDraft;
  submission: AreaBodySubmission | null;
} {
  if (draft.conflict !== null || draft.inFlight !== null || draft.value === draft.base) {
    return { draft, submission: null };
  }
  return {
    draft: { ...draft, inFlight: draft.value },
    submission: { value: draft.value, expectedRevision: draft.baseRevision },
  };
}

export function areaBodySaveSucceeded(
  draft: AreaBodyDraft,
  submission: AreaBodySubmission,
  revision: number,
): AreaBodyDraft {
  return { ...draft, base: submission.value, baseRevision: revision, inFlight: null, failed: false, failures: 0 };
}

/** Konflikt revizije zaustavlja čuvanje (dijalog odlučuje); druga greška vodi u ponovni pokušaj. */
export function areaBodySaveFailed(draft: AreaBodyDraft, error: unknown): AreaBodyDraft {
  const conflict = conflictFromError(error);
  if (conflict !== null) return { ...draft, inFlight: null, conflict };
  return { ...draft, inFlight: null, failed: true, failures: draft.failures + 1 };
}

/** „Učitaj najnoviju": nacrt se odbacuje i polje dobija verziju sa servera. */
export function areaBodyLoadLatest(draft: AreaBodyDraft, latest: AreaBodyServer): AreaBodyDraft {
  return createAreaBodyDraft({ ...latest, areaId: draft.areaId });
}

/**
 * „Prepiši": tvoj tekst ide preko tuđe verzije (ona ostaje u Istoriji izmena).
 * Šalje se i kad je jednak staroj osnovi — server tada ne pravi novu reviziju.
 * Osnova postaje tuđa revizija: ponovni pokušaj posle prolazne greške ne sme
 * opet da padne u isti konflikt.
 */
export function areaBodyOverwrite(
  draft: AreaBodyDraft,
  latestRevision: number,
): { draft: AreaBodyDraft; submission: AreaBodySubmission } {
  const expectedRevision = Math.max(draft.conflict?.currentRevision ?? latestRevision, latestRevision);
  return {
    draft: { ...draft, baseRevision: expectedRevision, conflict: null, inFlight: draft.value, failed: false, failures: 0 },
    submission: { value: draft.value, expectedRevision },
  };
}

/** Kada kreće sledeće čuvanje: `dirty` posle pauze, greška posle 5 s (najviše tri puta). */
export function areaBodySaveDelay(status: AreaBodyStatus, failures: number, immediate: boolean): number | null {
  if (status === "dirty") return immediate ? 0 : AREA_BODY_DELAY_MS;
  if (status === "error") {
    if (immediate) return 0;
    return failures >= AUTOSAVE_MAX_RETRIES ? null : AUTOSAVE_RETRY_MS;
  }
  return null;
}

/** Ponovni pokušaji su potrošeni: traka „Nije sačuvano." + „Pokušaj ponovo". */
export function areaBodyRetriesExhausted(draft: AreaBodyDraft): boolean {
  return areaBodyStatus(draft) === "error" && draft.failures >= AUTOSAVE_MAX_RETRIES;
}

/** Tekst stanja ispod polja (K07 §5.5). */
export function areaBodyStateText(input: {
  status: AreaBodyStatus;
  exhausted: boolean;
  editorName: string | null;
  updatedAt: number | null;
  now: number;
}): string {
  switch (input.status) {
    case "saving":
      return "Čuvam…";
    case "dirty":
      return "Izmene čekaju";
    case "error":
      return input.exhausted ? "Nije sačuvano." : "Nije sačuvano — pokušavam ponovo.";
    case "conflict":
      return "Nije sačuvano zbog izmene tima.";
    case "saved": {
      if (input.updatedAt === null) return "";
      const who = input.editorName?.trim() || "Član tima";
      return `Sačuvano · ${who} · ${formatEditTime(input.updatedAt, input.now)}`;
    }
  }
}

// --- Zadaci oblasti -------------------------------------------------------------

/** Zadataka po strani `tasks.listForArea` (server prima najviše 50). */
export const AREA_TASKS_PAGE = 50;

/**
 * `tasks.listForArea` filtrira status POSLE čitanja strane, pa strana može biti
 * kraća od tražene (K07 R6): učitava se dalje dok se ne skupi traženo ili dok
 * server ne kaže da je kraj. Kraća strana nije znak kraja.
 */
export function shouldLoadMoreAreaTasks(input: {
  status: "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";
  loaded: number;
  wanted: number;
}): boolean {
  return input.status === "CanLoadMore" && input.loaded < input.wanted;
}

/** Broj zadataka oblasti za zaglavlje: prva strana bez filtera, „50+" kad ima još. */
export function areaTaskCount(input: {
  status: "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";
  loaded: number;
}): AreaCount | null {
  if (input.status === "LoadingFirstPage") return null;
  return { count: input.loaded, capped: input.status !== "Exhausted" };
}

// --- Dokumenti: stablo ----------------------------------------------------------

/** Stranica u Dokumentima — oblik `pages.listChildren` koji tabela koristi. */
export type DocumentPage = {
  _id: string;
  title: string;
  kind: "note" | "task" | "file" | "table";
  parentPageId: string | null;
  createdByProfileId: string;
  updatedByProfileId: string;
  updatedAt: number;
  lockedAt?: number | null;
};

/** Jedan nivo stabla (koren ili deca razvijene stranice). */
export type DocumentLevel =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; pages: ReadonlyArray<DocumentPage>; hasMore: boolean };

export type DocumentTreeRow<Page extends DocumentPage = DocumentPage> =
  | {
      type: "page";
      key: string;
      page: Page;
      depth: number;
      /** `null` dok se ne zna (broj dece još stiže). */
      hasChildren: boolean | null;
      /** Strelica postoji: ima (ili možda ima) decu i nije najdublji nivo. */
      expandable: boolean;
      expanded: boolean;
    }
  | { type: "loading"; key: string; depth: number; parentId: string | null }
  | { type: "error"; key: string; depth: number; parentId: string | null }
  | { type: "more"; key: string; depth: number; parentId: string | null };

/** Ključ korena u mapi nivoa. */
export const ROOT_LEVEL = "root";

/** Najdublji nivo koji Dokumenti razvijaju u mestu (dalje vodi stranica). */
export const DOCUMENT_TREE_MAX_DEPTH = 6;

/**
 * Ravna lista redova tabele iz nivoa koji su učitani: stranica, pa (kad je
 * razvijena) njena deca uvučena za jedan nivo, sa redom „Učitavam…",
 * „Nije učitano" ili „Učitaj još" gde treba.
 */
export function flattenDocumentTree<Page extends DocumentPage>(input: {
  levels: ReadonlyMap<string, DocumentLevel>;
  expanded: ReadonlySet<string>;
  childCounts: ReadonlyMap<string, number>;
}): DocumentTreeRow<Page>[] {
  const rows: DocumentTreeRow<Page>[] = [];
  const visit = (parentId: string | null, depth: number) => {
    const key = parentId ?? ROOT_LEVEL;
    const level = input.levels.get(key) ?? { status: "loading" as const };
    if (level.status === "loading") {
      rows.push({ type: "loading", key: `loading:${key}`, depth, parentId });
      return;
    }
    if (level.status === "error") {
      rows.push({ type: "error", key: `error:${key}`, depth, parentId });
      return;
    }
    for (const page of level.pages as ReadonlyArray<Page>) {
      const count = input.childCounts.get(page._id);
      const canExpand = depth < DOCUMENT_TREE_MAX_DEPTH;
      const expandable = canExpand && count !== 0;
      const expanded = expandable && input.expanded.has(page._id);
      rows.push({
        type: "page",
        key: page._id,
        page,
        depth,
        hasChildren: count === undefined ? null : count > 0,
        expandable,
        expanded,
      });
      if (expanded) visit(page._id, depth + 1);
    }
    if (level.hasMore) rows.push({ type: "more", key: `more:${key}`, depth, parentId });
  };
  visit(null, 0);
  return rows;
}

/**
 * Ciljevi za „Ugnezdi u…": učitane stranice iste oblasti osim same stranice,
 * njenog trenutnog roditelja i njenih (učitanih) potomaka. Server i dalje
 * proverava ciklus i dubinu.
 */
export function nestingCandidates<Page extends DocumentPage>(
  page: Page,
  rows: ReadonlyArray<DocumentTreeRow<Page>>,
  max = 30,
): Page[] {
  const byParent = new Map<string, string[]>();
  for (const row of rows) {
    if (row.type !== "page" || row.page.parentPageId === null) continue;
    const list = byParent.get(row.page.parentPageId) ?? [];
    list.push(row.page._id);
    byParent.set(row.page.parentPageId, list);
  }
  const excluded = new Set<string>([page._id]);
  const stack = [page._id];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    for (const child of byParent.get(current) ?? []) {
      if (excluded.has(child)) continue;
      excluded.add(child);
      stack.push(child);
    }
  }
  if (page.parentPageId !== null) excluded.add(page.parentPageId);
  const result: Page[] = [];
  for (const row of rows) {
    if (row.type !== "page" || excluded.has(row.page._id)) continue;
    result.push(row.page);
    if (result.length >= max) break;
  }
  return result;
}

/** Da li je `ancestorId` predak stranice `pageId` po učitanim redovima (prevlačenje u sopstvenu granu). */
export function isLoadedDescendant(
  rows: ReadonlyArray<DocumentTreeRow>,
  ancestorId: string,
  pageId: string,
): boolean {
  const parentOf = new Map<string, string | null>();
  for (const row of rows) if (row.type === "page") parentOf.set(row.page._id, row.page.parentPageId);
  let current = parentOf.get(pageId) ?? null;
  const seen = new Set<string>();
  while (current !== null && !seen.has(current)) {
    if (current === ancestorId) return true;
    seen.add(current);
    current = parentOf.get(current) ?? null;
  }
  return false;
}

/** „Ana · pre 5 min" — red Nedavnih izmena i kolona „Ko" + „Poslednja izmena". */
export function editMeta(editorName: string | null, updatedAt: number, now: number): string {
  return `${editorName?.trim() || "Član tima"} · ${formatEditTime(updatedAt, now)}`;
}

/** Toast posle ugnežđavanja (K07 §7): „„X” je ugnežđeno u „Y”." */
export function nestedMessage(childTitle: string, parentTitle: string): string {
  return `„${childTitle.trim() || "Bez naslova"}” je ugnežđeno u „${parentTitle.trim() || "Bez naslova"}”.`;
}
