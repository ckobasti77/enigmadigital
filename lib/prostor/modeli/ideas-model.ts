// Preneto iz Devotion apps/web/components/workspace/ideas/ideas-model.ts (main @ c05c40f), SPAJANJE S13.
/**
 * Ideje (PROSTOR P6, P16; plan K07 §5.9) — ČISTA logika weba: prikaz koji se
 * pamti lokalno, tabla po fazama, ciljevi prevlačenja po fazi i dozvoli,
 * sortiranje liste, pretraga, optimistički glas i faza, tekstovi. Server
 * odlučuje o dozvolama (`ideas.list` › `permissions`); ovde se samo crta isto.
 */
import {
  IDEA_BOARD_COLUMNS,
  IDEA_STAGE_LABELS,
  IDEA_STAGE_ORDER,
  stageTargets,
  type IdeaStage,
  type IdeaStoredStage,
} from "../idea-stages";
import { formatTrashAge } from "../trash";

import type { Id } from "../../../convex/_generated/dataModel";
import { formatNumber } from "../../format";

// --- Oblik ideje (podskup `ideas.list` › `nodes[number]`) ------------------

export type IdeaPermissions = {
  canEdit: boolean;
  canVote: boolean;
  canSetStage: boolean;
  canConvert: boolean;
  canArchive: boolean;
  canComment: boolean;
};

export type IdeaVote = "up" | "down";

/** Boja ideje na Mapi (`ideas.update` je traži; liste je ne prikazuju). */
export type IdeaColor = "neutral" | "violet" | "blue" | "green" | "amber" | "rose";

export type IdeaModel = {
  _id: Id<"ideaNodes">;
  title: string | null;
  text: string;
  color: IdeaColor;
  createdAt: number;
  /** Prikazana faza (server: pretvorena je uvek „Postalo zadatak"). */
  stage: IdeaStage;
  storedStage: IdeaStoredStage;
  stageChangedAt: number | null;
  convertedPageId: Id<"pages"> | null;
  upvotes: number;
  downvotes: number;
  myVote: IdeaVote | null;
  commentCount: number;
  commentCountCapped: boolean;
  author: { displayName: string; avatarUrl: string | null } | null;
  permissions: IdeaPermissions;
};

// --- Prikaz (Tabla · Lista · Mapa), pamti se lokalno (K07 E15) --------------

export type IdeasViewMode = "tabla" | "lista" | "mapa";

export const IDEAS_VIEW_MODES: ReadonlyArray<{ value: IdeasViewMode; label: string }> = [
  { value: "tabla", label: "Tabla" },
  { value: "lista", label: "Lista" },
  { value: "mapa", label: "Mapa" },
];

export const IDEAS_VIEW_STORAGE_KEY = "enigma:ideje:prikaz";

export function isIdeasViewMode(value: unknown): value is IdeasViewMode {
  return value === "tabla" || value === "lista" || value === "mapa";
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

/** Zapamćen prikaz; bez njega (ili kad skladište baca) Tabla. */
export function readIdeasViewMode(storage: StorageLike | null | undefined): IdeasViewMode {
  try {
    const value = storage?.getItem(IDEAS_VIEW_STORAGE_KEY);
    return isIdeasViewMode(value) ? value : "tabla";
  } catch {
    return "tabla";
  }
}

/** Upis izbora; skladište koje baca (privatni režim, kvota) se ćutke preskače. */
export function writeIdeasViewMode(storage: StorageLike | null | undefined, mode: IdeasViewMode): void {
  try {
    storage?.setItem(IDEAS_VIEW_STORAGE_KEY, mode);
  } catch {
    // Izbor važi do osvežavanja.
  }
}

// --- Tabla i prevlačenje ----------------------------------------------------

/**
 * Kolone u koje se ideja sme prevući (K07 §5.9): samo kome je dozvoljeno
 * menjanje faze (autor ili vlasnik projekta — `permissions.canSetStage`),
 * i samo u faze iz `stageTargets` (bez trenutne; „Postalo zadatak" nikad nije
 * cilj, a pretvorena ideja nema cilj). Ostalima nijedna kolona nije cilj.
 */
export function ideaDropTargets(idea: {
  stage: IdeaStage;
  permissions: Pick<IdeaPermissions, "canSetStage">;
}): IdeaStoredStage[] {
  if (!idea.permissions.canSetStage) return [];
  return stageTargets(idea.stage);
}

export function canDropIdeaOn(
  idea: { stage: IdeaStage; permissions: Pick<IdeaPermissions, "canSetStage"> },
  column: IdeaStage,
): column is IdeaStoredStage {
  return (ideaDropTargets(idea) as IdeaStage[]).includes(column);
}

export type IdeaBoardColumn<T> = { stage: IdeaStage; label: string; ideas: T[] };

/** Kad je ideja poslednji put stigla u svoju kolonu (pomerena ide na vrh). */
function arrivedAt(idea: { stageChangedAt: number | null; createdAt: number }) {
  return idea.stageChangedAt ?? idea.createdAt;
}

/**
 * Kolone table redom (Predlog · Razmatra se · Odobreno · Postalo zadatak) i
 * skupljena „Odbijeno" posebno. U koloni najnovije stigla prva.
 */
export function buildIdeaBoard<T extends Pick<IdeaModel, "stage" | "stageChangedAt" | "createdAt">>(
  ideas: ReadonlyArray<T>,
): { columns: IdeaBoardColumn<T>[]; rejected: IdeaBoardColumn<T> } {
  const sorted = [...ideas].sort(
    (first, second) => arrivedAt(second) - arrivedAt(first) || second.createdAt - first.createdAt,
  );
  const of = (stage: IdeaStage): IdeaBoardColumn<T> => ({
    stage,
    label: IDEA_STAGE_LABELS[stage],
    ideas: sorted.filter((idea) => idea.stage === stage),
  });
  return { columns: IDEA_BOARD_COLUMNS.map(of), rejected: of("odbijeno") };
}

/**
 * Tastatura na tabli: strelice levo/desno menjaju kolonu (isti red, ili
 * poslednji kad je kolona kraća), gore/dole idu kroz kartice kolone; prazne
 * kolone se preskaču. `null` = nema kuda.
 */
export function boardFocusMove(
  counts: ReadonlyArray<number>,
  from: { column: number; index: number },
  key: "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown",
): { column: number; index: number } | null {
  if (key === "ArrowUp" || key === "ArrowDown") {
    const index = from.index + (key === "ArrowDown" ? 1 : -1);
    return index >= 0 && index < (counts[from.column] ?? 0) ? { column: from.column, index } : null;
  }
  const step = key === "ArrowRight" ? 1 : -1;
  for (let column = from.column + step; column >= 0 && column < counts.length; column += step) {
    const count = counts[column] ?? 0;
    if (count > 0) return { column, index: Math.min(from.index, count - 1) };
  }
  return null;
}

// --- Lista ------------------------------------------------------------------

export type IdeaSortKey = "ideja" | "autor" | "glasovi" | "faza" | "komentari" | "starost";
export type IdeaSort = { key: IdeaSortKey; direction: "asc" | "desc" };

/** Podrazumevano najnovije prvo (K07 §5.9). */
export const DEFAULT_IDEA_SORT: IdeaSort = { key: "starost", direction: "asc" };

export const IDEA_LIST_COLUMNS: ReadonlyArray<{ key: IdeaSortKey; label: string }> = [
  { key: "ideja", label: "Ideja" },
  { key: "autor", label: "Autor" },
  { key: "glasovi", label: "Glasovi" },
  { key: "faza", label: "Faza" },
  { key: "komentari", label: "Komentari" },
  { key: "starost", label: "Starost" },
];

// Poređenje za sortiranje (ne prikaz broja ili datuma), zato ostaje ovde, a ne u `lib/format`.
const collator = new Intl.Collator("sr-Latn", { sensitivity: "base" });

export function ideaTitle(idea: Pick<IdeaModel, "title" | "text">): string {
  const title = idea.title?.trim();
  if (title) return title;
  const text = idea.text.trim();
  return text ? text.slice(0, 80) : "Bez naslova";
}

/**
 * Sortiranje liste. „Starost" rastuće = najmlađa prva (najnovije); glasovi =
 * razlika Za − Protiv, pa broj Za; jednako → najnovije prvo.
 */
export function sortIdeas<T extends IdeaModel>(ideas: ReadonlyArray<T>, sort: IdeaSort): T[] {
  const sign = sort.direction === "asc" ? 1 : -1;
  const compare = (first: T, second: T): number => {
    switch (sort.key) {
      case "ideja":
        return collator.compare(ideaTitle(first), ideaTitle(second));
      case "autor":
        return collator.compare(first.author?.displayName ?? "", second.author?.displayName ?? "");
      case "glasovi":
        return first.upvotes - first.downvotes - (second.upvotes - second.downvotes) || first.upvotes - second.upvotes;
      case "faza":
        return IDEA_STAGE_ORDER.indexOf(first.stage) - IDEA_STAGE_ORDER.indexOf(second.stage);
      case "komentari":
        return first.commentCount - second.commentCount;
      case "starost":
        return second.createdAt - first.createdAt;
    }
  };
  return [...ideas].sort((first, second) => sign * compare(first, second) || second.createdAt - first.createdAt);
}

/** Klik na zaglavlje: ista kolona menja smer, nova kreće od svog prirodnog smera. */
export function nextIdeaSort(current: IdeaSort, key: IdeaSortKey): IdeaSort {
  if (current.key === key) return { key, direction: current.direction === "asc" ? "desc" : "asc" };
  // Tekst A→Š; brojevi i faza od najvećeg; starost od najnovijeg.
  const natural: IdeaSort["direction"] = key === "ideja" || key === "autor" || key === "starost" ? "asc" : "desc";
  return { key, direction: key === "faza" ? "asc" : natural };
}

/** `aria-sort` zaglavlja kolone. */
export function ariaSortOf(sort: IdeaSort, key: IdeaSortKey): "ascending" | "descending" | "none" {
  if (sort.key !== key) return "none";
  return sort.direction === "asc" ? "ascending" : "descending";
}

// --- Pretraga ---------------------------------------------------------------

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "dj")
    .replace(/Đ/g, "Dj")
    .toLowerCase();
}

/**
 * Naslov ili tekst sadrži pojam (bez obzira na velika slova i kvačice). Bez
 * pojma vraća ISTI niz (Mapa ne resinhronizuje čvorove na svaki render).
 */
export function filterIdeas<L extends ReadonlyArray<Pick<IdeaModel, "title" | "text">>>(
  ideas: L,
  query: string,
): L | Array<L[number]> {
  const needle = fold(query.trim());
  if (!needle) return ideas;
  return ideas.filter((idea) => fold(`${idea.title ?? ""}\n${idea.text}`).includes(needle));
}

/** „Za: 3 glasa" / „Protiv: 1 glas" za čitač ekrana. */
export function voteButtonLabel(kind: IdeaVote, count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  const word =
    mod10 === 1 && mod100 !== 11 ? "glas" : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? "glasa" : "glasova";
  return `${kind === "up" ? "Za" : "Protiv"}: ${formatNumber(count)} ${word}`;
}

// --- Optimistički glas i faza -------------------------------------------------

type VoteFields = Pick<IdeaModel, "upvotes" | "downvotes" | "myVote">;

/** Isti glas skida, drugi menja, bez glasa dodaje (kao `ideas.vote`). */
export function applyIdeaVote<T extends VoteFields & { userVote?: IdeaVote | null }>(idea: T, vote: IdeaVote): T {
  const removing = idea.myVote === vote;
  const next: IdeaVote | null = removing ? null : vote;
  let { upvotes, downvotes } = idea;
  if (idea.myVote === "up") upvotes -= 1;
  if (idea.myVote === "down") downvotes -= 1;
  if (next === "up") upvotes += 1;
  if (next === "down") downvotes += 1;
  return { ...idea, upvotes, downvotes, myVote: next, ...("userVote" in idea ? { userVote: next } : {}) };
}

/** Faza posle `ideas.setStage` (optimistički): „Pretvori" prati „Odobreno". */
export function applyIdeaStage<
  T extends Pick<IdeaModel, "stage" | "storedStage" | "stageChangedAt" | "convertedPageId" | "permissions"> & {
    isApproved?: boolean;
  },
>(idea: T, stage: IdeaStoredStage, now: number): T {
  if (idea.convertedPageId !== null) return idea;
  return {
    ...idea,
    stage,
    storedStage: stage,
    stageChangedAt: now,
    ...("isApproved" in idea ? { isApproved: stage === "odobreno" } : {}),
    permissions: {
      ...idea.permissions,
      canConvert: idea.permissions.canSetStage && stage === "odobreno",
    },
  };
}

// --- Tekstovi -----------------------------------------------------------------

/** „Ana · pre 3 dana" (bez autora „Član tima"). */
export function ideaAuthorLine(idea: Pick<IdeaModel, "author" | "createdAt">, now: number): string {
  return `${idea.author?.displayName ?? "Član tima"} · ${formatTrashAge(idea.createdAt, now)}`;
}

/** „pre 3 dana" za kolonu Starost. */
export function ideaAgeLabel(createdAt: number, now: number): string {
  return formatTrashAge(createdAt, now);
}

/** Broj komentara za karticu i red („20+" kad je server odsekao brojanje). */
export function ideaCommentCount(idea: Pick<IdeaModel, "commentCount" | "commentCountCapped">): string {
  const count = formatNumber(idea.commentCount);
  return idea.commentCountCapped ? `${count}+` : count;
}

/** „1 ideja", „3 ideje", „5 ideja" (11–14 → „ideja"). */
export function ideasCountLabel(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  const word = mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? "ideje" : "ideja";
  return `${formatNumber(count)} ${word}`;
}

/** Najava i toast posle glasa (`aria-live`). */
export function voteMessage(previous: IdeaVote | null, vote: IdeaVote): string {
  return previous === vote ? "Glas je povučen." : "Glas je sačuvan.";
}

/** Toast posle promene faze. */
export function stageChangedMessage(stage: IdeaStoredStage): string {
  return `Ideja je u fazi „${IDEA_STAGE_LABELS[stage]}”.`;
}

/** Toast posle pretvaranja. */
export function convertedMessage(kind: "task" | "note", title: string): string {
  return kind === "task" ? `Ideja je postala zadatak „${title}”.` : `Ideja je postala beleška „${title}”.`;
}

/** Toast posle brisanja. */
export function trashedMessage(title: string): string {
  return `„${title}” je u Korpi.`;
}

/**
 * „Pretvori u zadatak ili belešku" u detalju (K07 §5.9): dugme samo kome je
 * dozvoljeno (`canConvert`). Odgovornom članu van faze „Odobreno" meta kaže
 * kada može; ostali ne vide ni dugme ni objašnjenje (to piše uz Fazu).
 */
export function convertHint(
  idea: Pick<IdeaModel, "stage" | "convertedPageId" | "permissions">,
): { kind: "button" } | { kind: "hint"; text: string } | { kind: "none" } {
  if (idea.convertedPageId !== null) return { kind: "none" };
  if (idea.permissions.canConvert) return { kind: "button" };
  if (idea.permissions.canSetStage && idea.stage !== "odobreno") {
    return { kind: "hint", text: "Pretvara se u fazi „Odobreno”." };
  }
  return { kind: "none" };
}

// --- Izmena teksta u detalju ----------------------------------------------------

export const IDEA_TITLE_MAX = 200;
export const IDEA_TEXT_MAX = 12_000;
/** Čuvanje teksta ideje posle kucanja (K07 §5.9: 1 s i na blur). */
export const IDEA_SAVE_DELAY_MS = 1_000;

/** Greška nacrta pre slanja (server traži naslov i tekst). */
export function ideaDraftError(draft: { title: string; text: string }): string | null {
  if (!draft.title.trim()) return "Naslov ne može biti prazan.";
  if (!draft.text.trim()) return "Tekst ideje ne može biti prazan.";
  if (draft.title.trim().length > IDEA_TITLE_MAX) return `Naslov može imati najviše ${formatNumber(IDEA_TITLE_MAX)} znakova.`;
  if (draft.text.trim().length > IDEA_TEXT_MAX) return `Tekst može imati najviše ${formatNumber(IDEA_TEXT_MAX)} znakova.`;
  return null;
}

/** Nacrt se razlikuje od servera (posle skraćivanja razmaka, kao server). */
export function ideaDraftChanged(
  draft: { title: string; text: string },
  server: Pick<IdeaModel, "title" | "text">,
): boolean {
  return draft.title.trim() !== (server.title ?? "").trim() || draft.text.trim() !== server.text.trim();
}

export type IdeaSaveState = "saved" | "dirty" | "saving" | "error" | "invalid";

/**
 * Nacrt teksta ideje u detalju: čuva se 1 s posle kucanja i na blur kroz
 * `ideas.update` (bez revizije — prethodno stanje ostaje u Istoriji izmena).
 * Verzija sa servera (izmena drugog člana) se prima samo kad ništa ne čeka.
 */
export type IdeaDraft = {
  ideaId: string;
  title: string;
  text: string;
  /** Poslednje što je server potvrdio (ili poslao). */
  base: { title: string; text: string };
  /** Šta je trenutno na putu (`ideas.update`). */
  sending: { title: string; text: string } | null;
  failed: boolean;
};

type IdeaServerText = { _id: string; title: string | null; text: string };

export function createIdeaDraft(server: IdeaServerText): IdeaDraft {
  const base = { title: server.title ?? "", text: server.text };
  return { ideaId: server._id, ...base, base, sending: null, failed: false };
}

export function ideaDraftStatus(draft: IdeaDraft): IdeaSaveState {
  if (draft.sending !== null) return "saving";
  if (!ideaDraftChanged(draft, { title: draft.base.title, text: draft.base.text })) return "saved";
  if (ideaDraftError(draft) !== null) return "invalid";
  return draft.failed ? "error" : "dirty";
}

/**
 * Nova verzija sa servera: druga ideja = nov nacrt. Spaja se po polju: polje
 * koje nisam dirao (isto kao stara osnova) prima tuđu izmenu, a ono koje
 * menjam ostaje moje — tuđa izmena drugog polja se ne gazi pri čuvanju.
 */
export function ideaDraftFromServer(draft: IdeaDraft, server: IdeaServerText): IdeaDraft {
  if (draft.ideaId !== server._id) return createIdeaDraft(server);
  const base = { title: server.title ?? "", text: server.text };
  if (base.title === draft.base.title && base.text === draft.base.text) return draft;
  const untouched = (field: "title" | "text") => draft[field].trim() === draft.base[field].trim();
  return {
    ...draft,
    title: untouched("title") ? base.title : draft.title,
    text: untouched("text") ? base.text : draft.text,
    base,
  };
}

export function ideaDraftEdit(draft: IdeaDraft, patch: Partial<{ title: string; text: string }>): IdeaDraft {
  return { ...draft, ...patch, failed: false };
}

/** Početak čuvanja: `null` kad nema šta (ili ne sme) da se pošalje. */
export function ideaDraftStartSave(draft: IdeaDraft): { draft: IdeaDraft; submission: { title: string; text: string } } | null {
  const status = ideaDraftStatus(draft);
  if (status !== "dirty" && status !== "error") return null;
  const submission = { title: draft.title.trim(), text: draft.text.trim() };
  return { draft: { ...draft, sending: submission, failed: false }, submission };
}

/** Uspeh: potvrđeno postaje osnova; kucanje tokom čuvanja ostaje da čeka. */
export function ideaDraftSaved(draft: IdeaDraft, submission: { title: string; text: string }): IdeaDraft {
  return { ...draft, base: submission, sending: null, failed: false };
}

/**
 * Šta se šalje kad fioka nestane (zatvaranje, druga ideja): i izmena otkucana
 * dok je prethodno čuvanje bilo na putu. Neispravan nacrt se ne šalje (greška
 * je već prikazana u polju).
 */
export function ideaDraftOnLeave(draft: IdeaDraft): { title: string; text: string } | null {
  if (ideaDraftError(draft) !== null) return null;
  const reference = draft.sending ?? draft.base;
  if (!ideaDraftChanged(draft, reference)) return null;
  return { title: draft.title.trim(), text: draft.text.trim() };
}

export function ideaDraftFailed(draft: IdeaDraft): IdeaDraft {
  return { ...draft, sending: null, failed: true };
}

/** Tekst stanja čuvanja u detalju (prazan za „sačuvano"). */
export function ideaSaveStateText(state: IdeaSaveState, error: string | null): string {
  switch (state) {
    case "saving":
      return "Čuvam…";
    case "dirty":
      return "Izmene čekaju…";
    case "error":
      return "Nije sačuvano.";
    case "invalid":
      return error ?? "Nije sačuvano.";
    case "saved":
      return "Sačuvano";
  }
}
