// Preneto iz Devotion packages/shared/src/notes.ts (main @ c05c40f), SPAJANJE S02.
/**
 * Beleške u „Ja" (PROSTOR P7, K18) — filter, raspored sa uvlačenjem, tekstovi i
 * provere unosa, isti na webu i telefonu. ČISTO: bez React-a i bez Convex tipova
 * (id-jevi stižu kao generički `string`). Beleške su privatne po vlasniku — ovde
 * nema pravila pristupa, njih drži server (`thoughts.listMine`).
 */
import { formatNumber } from "../format";
import { dayDiff } from "./dates";
import { formatTrashAge } from "./trash";

/** Server: `MAX_THOUGHT_TEXT` / `MAX_THOUGHT_TITLE` u `thoughts.ts`. */
export const NOTE_TEXT_MAX = 12_000;
export const NOTE_TITLE_MAX = 200;
/** Uvlačenje podbeleški staje na trećem nivou (K07 §5.10). */
export const NOTE_INDENT_MAX = 3;
/** Koliko znakova teksta stane u jedan red naslova/isečka. */
const TITLE_PREVIEW_MAX = 80;
const SNIPPET_MAX = 120;
/** Najbrojniji `numItems` koji server prima za listu (`MAX_NODE_PAGE_SIZE`). */
export const NOTES_PAGE_SIZE = 50;
/** Pretraga ispod ove dužine ne ide serveru (`searchMine` vraća prazno). */
export const NOTE_SEARCH_MIN = 2;
/** Najviše pogodaka pretrage (server: gornja granica `searchMine`). */
export const NOTE_SEARCH_LIMIT = 50;

/** Filter Beleški: sve moje · samo lične · jedan startup. */
export type NoteFilter<Id extends string = string> =
  | { kind: "all" }
  | { kind: "personal" }
  | { kind: "startup"; workspaceId: Id };

export const ALL_NOTES: NoteFilter = { kind: "all" };

/**
 * Argument `startupId` za `thoughts.listMine` / `searchMine`: odsutno = sve,
 * `null` = lične, id = jedan startup.
 */
export function noteScopeArg<Id extends string>(filter: NoteFilter<Id>): { workspaceId?: Id | null } {
  if (filter.kind === "all") return {};
  if (filter.kind === "personal") return { workspaceId: null };
  return { workspaceId: filter.workspaceId };
}

export function noteFilterKey(filter: NoteFilter): string {
  return filter.kind === "startup" ? `startup:${filter.workspaceId}` : filter.kind;
}

export function sameNoteFilter(left: NoteFilter, right: NoteFilter): boolean {
  return noteFilterKey(left) === noteFilterKey(right);
}

/** Startup koji više ne postoji u mojoj listi (napušten) vraća prikaz na „Sve". */
export function resolveNoteFilter<Id extends string>(
  filter: NoteFilter<Id>,
  workspaceIds: ReadonlyArray<string>,
): NoteFilter<Id> {
  if (filter.kind === "startup" && !workspaceIds.includes(filter.workspaceId)) return { kind: "all" };
  return filter;
}

export function noteMatchesFilter(note: { workspaceId: string | null }, filter: NoteFilter): boolean {
  if (filter.kind === "all") return true;
  if (filter.kind === "personal") return note.workspaceId === null;
  return note.workspaceId === filter.workspaceId;
}

export function filterNotes<T extends { workspaceId: string | null }>(
  notes: ReadonlyArray<T>,
  filter: NoteFilter,
): T[] {
  return notes.filter((note) => noteMatchesFilter(note, filter));
}

/** „Mapa" postoji samo po startupu (K07 §5.10): vidljiva kad je izabran jedan. */
export function notesMapStartupId<Id extends string>(filter: NoteFilter<Id>): Id | null {
  return filter.kind === "startup" ? filter.workspaceId : null;
}

export type NoteNode = {
  _id: string;
  workspaceId: string | null;
  title: string | null;
  text: string;
  parentThoughtId: string | null;
  updatedAt: number;
};

export type NoteRow<T> = { note: T; depth: number };

/**
 * Redosled prikaza: koreni kako stižu sa servera (poslednja izmena prvo),
 * podbeleške odmah ispod svog roditelja, uvučene po nivou do `NOTE_INDENT_MAX`.
 * Podbeleška čiji roditelj još nije učitan (paginacija) ili je u drugom opsegu
 * ide kao koren — kad roditelj stigne, premesti se ispod njega. Ciklus u
 * podacima ne obara prikaz (svaka beleška se crta najviše jednom).
 */
export function arrangeNotes<T extends NoteNode>(notes: ReadonlyArray<T>): NoteRow<T>[] {
  const ids = new Set(notes.map((note) => note._id));
  const children = new Map<string, T[]>();
  const roots: T[] = [];
  for (const note of notes) {
    const parent = note.parentThoughtId;
    if (parent !== null && parent !== note._id && ids.has(parent)) {
      const siblings = children.get(parent);
      if (siblings) siblings.push(note);
      else children.set(parent, [note]);
    } else {
      roots.push(note);
    }
  }
  const rows: NoteRow<T>[] = [];
  const seen = new Set<string>();
  const visit = (note: T, level: number) => {
    if (seen.has(note._id)) return;
    seen.add(note._id);
    rows.push({ note, depth: Math.min(level, NOTE_INDENT_MAX) });
    for (const child of children.get(note._id) ?? []) visit(child, level + 1);
  };
  for (const root of roots) visit(root, 0);
  // Ciklus bez korena: ostatak se crta ravno, da nijedna beleška ne nestane.
  for (const note of notes) visit(note, 0);
  return rows;
}

/** Naslov reda: naslov, a bez njega prvi neprazan red teksta (skraćen). */
export function noteDisplayTitle(note: { title: string | null; text: string }): string {
  const explicit = note.title?.trim();
  const source =
    explicit ||
    note.text
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .find((line) => line.length > 0) ||
    "Bez naslova";
  return source.length > TITLE_PREVIEW_MAX ? `${source.slice(0, TITLE_PREVIEW_MAX - 1).trimEnd()}…` : source;
}

/**
 * Isečak ispod naslova. Prvi red teksta koji je već u naslovu (server pravi
 * naslov iz prvog reda, a bez naslova ga prikazuje `noteDisplayTitle`) se
 * preskače — isečak nikad ne ponavlja naslov.
 */
export function notePreview(note: { title: string | null; text: string }): string | null {
  const lines = note.text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const title = note.title?.trim() ?? "";
  const firstIsTitle = title.length === 0 || lines[0] === title || noteDisplayTitle(note) === lines[0];
  const rest = firstIsTitle ? lines.slice(1) : lines;
  const joined = rest.join(" ");
  if (joined.length === 0) return null;
  return joined.length > SNIPPET_MAX ? `${joined.slice(0, SNIPPET_MAX - 1).trimEnd()}…` : joined;
}

/** „upravo" · „pre 5 min" · „pre 2 h" · „juče" · „pre 3 dana" · „12. okt". */
export function formatNoteAge(ms: number, nowMs: number, zone?: string): string {
  const diff = nowMs - ms;
  const hour = 3_600_000;
  if (diff >= hour && diff < 6 * hour && dayDiff(ms, nowMs, zone) === 0) {
    return `pre ${Math.floor(diff / hour)} h`;
  }
  // Ostalo: „upravo", „pre N min", „danas u 14:05", „juče", „pre N dana", pa datum.
  return formatTrashAge(ms, nowMs, zone);
}

export function noteScopeLabel(note: { workspace: { name: string } | null }): string {
  return note.workspace === null ? "Lično" : note.workspace.name;
}

/** Meta red: „Cluck Rush · pre 2 h" / „Lično · pre 3 dana". */
export function noteMetaLabel(
  note: { workspace: { name: string } | null; updatedAt: number },
  nowMs: number,
  zone?: string,
): string {
  return `${noteScopeLabel(note)} · ${formatNoteAge(note.updatedAt, nowMs, zone)}`;
}

/** Prazno stanje liste (K07 §5.10). `startupName` je ime izabranog startupa. */
export function notesEmptyText(
  filter: NoteFilter,
  options: { searching: boolean; startupName?: string | null },
): { title: string; description: string | null } {
  if (options.searching) {
    return { title: "Nema beležaka za ovu pretragu.", description: "Probaj drugu reč ili obriši pretragu." };
  }
  if (filter.kind === "personal") return { title: "Nema ličnih beležaka.", description: "Zapiši belešku gore." };
  if (filter.kind === "startup") {
    return {
      title: "Nema beležaka u ovom projektu.",
      description: options.startupName
        ? `Zapiši belešku gore i izaberi ${options.startupName}.`
        : "Zapiši belešku gore i izaberi ovaj projekat.",
    };
  }
  return { title: "Još nema beležaka.", description: "Zapiši prvu belešku gore." };
}

export type NoteTextCheck = { ok: true; text: string } | { ok: false; reason: string | null };

/** Prazan tekst = dugme onemogućeno (bez poruke); predug = poruka. */
export function cleanNoteText(raw: string): NoteTextCheck {
  const text = raw.trim();
  if (text.length === 0) return { ok: false, reason: null };
  if (text.length > NOTE_TEXT_MAX) {
    return { ok: false, reason: `Beleška može imati najviše ${formatNumber(NOTE_TEXT_MAX)} znakova.` };
  }
  return { ok: true, text };
}

export type NoteEditPatch = { title?: string; text?: string };

/**
 * Izmena u mestu: šalju se samo polja koja su se promenila. Prazan naslov se ne
 * šalje (server traži naslov) — vraća poruku umesto da tiho vrati stari. Prazan
 * tekst nije dozvoljen. `patch === null` = ništa za čuvanje.
 */
export function noteEditPatch(
  original: { title: string | null; text: string },
  draft: { title: string; text: string },
):
  | { ok: true; patch: NoteEditPatch | null }
  | { ok: false; reason: string; field: "title" | "text" } {
  const title = draft.title.trim();
  const text = draft.text.trim();
  const originalTitle = original.title?.trim() ?? "";
  if (text.length === 0) return { ok: false, reason: "Beleška ne može biti prazna.", field: "text" };
  if (text.length > NOTE_TEXT_MAX) {
    return { ok: false, reason: `Beleška može imati najviše ${formatNumber(NOTE_TEXT_MAX)} znakova.`, field: "text" };
  }
  if (title.length === 0 && originalTitle.length > 0) {
    return { ok: false, reason: "Naslov ne može biti prazan.", field: "title" };
  }
  if (title.length > NOTE_TITLE_MAX) {
    return { ok: false, reason: `Naslov može imati najviše ${NOTE_TITLE_MAX} znakova.`, field: "title" };
  }
  const patch: NoteEditPatch = {};
  if (title.length > 0 && title !== originalTitle) patch.title = title;
  if (text !== original.text.trim()) patch.text = text;
  // Naslov koji je server izveo iz prvog reda prati tekst: ako ga korisnik nije
  // dirao, a prvi red se promenio, izvodi se nov (lista, pretraga i ideja ne
  // smeju da zadrže stari prvi red).
  if (
    patch.text !== undefined &&
    patch.title === undefined &&
    originalTitle.length > 0 &&
    originalTitle === noteDerivedTitle(original.text)
  ) {
    const next = noteDerivedTitle(text);
    if (next.length > 0 && next !== originalTitle) patch.title = next;
  }
  return { ok: true, patch: Object.keys(patch).length === 0 ? null : patch };
}

/** Naslov koji server izvodi kad ga nema: prvi neprazan red teksta (najviše `NOTE_TITLE_MAX`). */
export function noteDerivedTitle(text: string): string {
  const firstLine = text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return (firstLine ?? "").slice(0, NOTE_TITLE_MAX);
}

/**
 * Telo za prikaz ispod naslova: tekst bez prvog reda kad je taj red već naslov
 * (izveden ili isti kao zadati), da ga detalj ne ponavlja dvaput.
 */
export function noteBodyText(note: { title: string | null; text: string }): string {
  const lines = note.text.split(/\r?\n/u);
  const index = lines.findIndex((line) => line.trim().length > 0);
  if (index === -1) return "";
  const first = lines[index].trim();
  const title = note.title?.trim() ?? "";
  if (title.length === 0 || first === title || first.slice(0, NOTE_TITLE_MAX) === title) {
    return lines.slice(index + 1).join("\n").trim();
  }
  return note.text.trim();
}

/**
 * Početni cilj za „Pošalji u startup": startup same beleške ako je još u
 * listi, inače prvi startup; `null` kad nema nijednog (dugme se ne nudi).
 */
export function defaultSendTarget(
  note: { workspaceId: string | null },
  workspaceIds: ReadonlyArray<string>,
): string | null {
  if (note.workspaceId !== null && workspaceIds.includes(note.workspaceId)) return note.workspaceId;
  return workspaceIds[0] ?? null;
}

export const NOTE_SEND_TITLE = "Pošalji u projekat";
export const NOTE_SEND_HINT =
  "Tim dobija ideju u fazi „Predlog”. Tvoja beleška ostaje privatna.";
export const NOTE_SEND_NO_STARTUP = "Nisi član nijednog projekta.";

/** Toast/traka posle slanja: „Poslato u Ideje startupa Cluck Rush." */
export function sentToStartupMessage(startupName: string): string {
  return `Poslato u Ideje projekta ${startupName}.`;
}

/** Toast/traka posle pravljenja beleške: „Beleška je u Lično." / „…u Cluck Rush." */
export function noteCreatedMessage(startupName: string | null): string {
  return `Beleška je sačuvana u ${startupName ?? "Lično"}.`;
}

export const NOTE_ARCHIVED_MESSAGE = "Beleška je arhivirana.";

/** „1 beleška" · „3 beleške" · „7 beležaka"; `more` dodaje „+" (lista nije do kraja učitana). */
export function notesCountLabel(count: number, more = false): string {
  const lastTwo = count % 100;
  const last = count % 10;
  const noun =
    last === 1 && lastTwo !== 11
      ? "beleška"
      : last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)
        ? "beleške"
        : "beležaka";
  return `${count}${more ? "+" : ""} ${noun}`;
}
