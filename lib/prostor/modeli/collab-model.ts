// Preneto iz Devotion apps/web/components/collab/collab-model.ts (main @ c05c40f), SPAJANJE S11.
/**
 * Čista logika zajedničkih komponenti saradnje (PROSTOR K10, plan K07 §6):
 * prisustvo („<Ime> uređuje"), Istorija izmena (grupisanje po danu, tekst
 * potvrde), komentari (nacrt za izmenu, kandidati za @) i tekst konflikta.
 * Bez React-a i bez Convex klijenta — testira se u `collab-model.test.ts`.
 */
import {
  dayKeyOf,
  filterPeople,
  formatClock,
  formatDateShort,
  formatDayRelative,
  formatEditTime,
  parseCommentSegments,
  type MentionCandidate,
} from "..";

import { isPresenceFresh } from "../../../convex/prostor/lib/pagePresence";

// --- Prisustvo ---------------------------------------------------------------

export type PresenceRow = {
  profileId: string;
  displayName: string;
  avatarUrl: string | null;
  editing: boolean;
  expiresAt: number;
};

/**
 * Ko trenutno uređuje (P23): samo sveži redovi (`expiresAt > now`, TTL računa
 * klijent jer upit ne čita sat) sa `editing: true`, bez duplikata, abecedno.
 */
export function activeEditors<Row extends PresenceRow>(
  rows: ReadonlyArray<Row> | undefined,
  now: number,
): Row[] {
  if (!rows) return [];
  const seen = new Set<string>();
  const result: Row[] = [];
  for (const row of rows) {
    if (!row.editing || !isPresenceFresh(row.expiresAt, now) || seen.has(row.profileId)) continue;
    seen.add(row.profileId);
    result.push(row);
  }
  return result.sort((a, b) => a.displayName.localeCompare(b.displayName, "sr-Latn"));
}

export function firstName(displayName: string): string {
  const trimmed = displayName.trim();
  if (trimmed === "") return "Član tima";
  return trimmed.split(/\s+/)[0];
}

/** „Ana uređuje" · „Ana i Marko uređuju" · „Ana i još 2 uređuju"; prazno = `null`. */
export function presenceLabel(names: ReadonlyArray<string>): string | null {
  if (names.length === 0) return null;
  const first = firstName(names[0]);
  if (names.length === 1) return `${first} uređuje`;
  if (names.length === 2) return `${first} i ${firstName(names[1])} uređuju`;
  return `${first} i još ${names.length - 1} uređuju`;
}

// --- Istorija izmena ----------------------------------------------------------

function capitalize(value: string): string {
  return value.length === 0 ? value : value[0].toLocaleUpperCase("sr-Latn") + value.slice(1);
}

/** „Danas" · „Juče" · „Uto 27. okt" — naslov grupe revizija jednog dana. */
export function revisionDayLabel(ms: number, nowMs: number, zone?: string): string {
  return capitalize(formatDayRelative(ms, nowMs, zone));
}

export type RevisionDayGroup<Revision> = { key: string; label: string; items: Revision[] };

/**
 * Revizije (stižu najnovije prve) u grupe po lokalnom danu, istim redom. Dan
 * revizije je dan njene poslednje izmene (`updatedAt`, spajanje u 10 min).
 */
export function groupRevisionsByDay<Revision extends { updatedAt: number }>(
  revisions: ReadonlyArray<Revision>,
  nowMs: number,
  zone?: string,
): Array<RevisionDayGroup<Revision>> {
  const groups: Array<RevisionDayGroup<Revision>> = [];
  for (const revision of revisions) {
    const key = dayKeyOf(revision.updatedAt, zone);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.items.push(revision);
    } else {
      groups.push({ key, label: revisionDayLabel(revision.updatedAt, nowMs, zone), items: [revision] });
    }
  }
  return groups;
}

/** Trenutak verzije za potvrdu i toast: „danas u 09:30", „juče u 18:05", „sub 24. okt u 09:30". */
export function revisionMoment(ms: number, nowMs: number, zone?: string): string {
  const day = formatDayRelative(ms, nowMs, zone);
  const label = day === "danas" || day === "juče" ? day : formatDateShort(ms, zone);
  return `${label} u ${formatClock(ms, zone)}`;
}

export function restoreConfirmTitle(ms: number, nowMs: number, zone?: string): string {
  return `Vratiti verziju od ${revisionMoment(ms, nowMs, zone)}?`;
}

/** Ishod „Vrati ovu verziju" (K07 R2: `changed: false` kad je verzija ista kao trenutna). */
export function restoreOutcomeMessage(changed: boolean, ms: number, nowMs: number, zone?: string): string {
  return changed
    ? `Vraćena je verzija od ${revisionMoment(ms, nowMs, zone)}.`
    : "Ova verzija je ista kao trenutna.";
}

// --- Konflikt i zaključavanje ---------------------------------------------------

export type ConflictSubject = "page" | "area" | "task";

export const UNKNOWN_EDITOR = "Neko iz tima";

/** Tekst dijaloga konflikta (K07 §6.5). */
export function conflictCopy(input: {
  subject: ConflictSubject;
  updaterName: string | null;
  updatedAt: number | null;
  now: number;
}): { title: string; body: string } {
  const title =
    input.subject === "area"
      ? "Neko je u međuvremenu izmenio opis oblasti"
      : input.subject === "task"
        ? "Neko je u međuvremenu izmenio zadatak"
        : "Neko je u međuvremenu izmenio stranicu";
  const name = input.updaterName?.trim() || UNKNOWN_EDITOR;
  const when =
    input.updatedAt !== null && input.updatedAt > 0
      ? ` ${formatEditTime(input.updatedAt, input.now)}`
      : "";
  return { title, body: `${name} je sačuvao/la izmenu${when}. Tvoja verzija još nije sačuvana.` };
}

export const LOCK_NOTICE =
  "Zaključano. Menjaju je autor i vlasnik projekta — ti možeš da komentarišeš.";

/** Isto za zadatak (muški rod); izvršilac na zaključanom zadatku još menja status i korake. */
export const LOCK_NOTICE_TASK =
  "Zaključano. Menjaju ga autor i vlasnik projekta — ti možeš da komentarišeš. Izvršilac menja status i završava korake.";

/** Opis oznake „Zaključano" (tooltip): „Zaključao/la Ana · 24. okt u 09:30". */
export function lockedByLabel(input: {
  lockedByName: string | null;
  lockedAt: number | null;
  now: number;
}): string {
  const who = `Zaključao/la ${input.lockedByName?.trim() || UNKNOWN_EDITOR}`;
  return input.lockedAt === null ? who : `${who} · ${revisionMoment(input.lockedAt, input.now)}`;
}

// --- Komentari -----------------------------------------------------------------

/** Ko se prikazuje kao autor komentara (`legacy_shared` = raniji zajednički tekst). */
export function commentAuthorName(comment: {
  origin: "comment" | "legacy_entry" | "legacy_shared";
  author: { displayName: string } | null;
}): string {
  if (comment.origin === "legacy_shared" || comment.author === null) return "Raniji tekst tima";
  return comment.author.displayName;
}

/** Meta reda komentara: „pre 5 min · izmenjeno · Odbijeno ranije". */
export function commentMeta(
  comment: { createdAt: number; edited: boolean; moderationStatus: "pending" | "approved" | "rejected" },
  now: number,
): string {
  const parts = [formatEditTime(comment.createdAt, now)];
  if (comment.edited) parts.push("izmenjeno");
  if (comment.moderationStatus === "rejected") parts.push("Odbijeno ranije");
  return parts.join(" · ");
}

/**
 * Sačuvan komentar → tekst za polje i spisak pominjanja (izmena u mestu).
 * Obrnuto od `serializeComment`: `@Ime` ostaje u tekstu, a pominjanje se
 * ponovo prepoznaje dok god „@Ime" stoji u polju.
 */
export function commentToDraft(content: string): { text: string; mentions: MentionCandidate[] } {
  let text = "";
  const mentions: MentionCandidate[] = [];
  for (const segment of parseCommentSegments(content)) {
    if (segment.kind === "break") text += "\n";
    else if (segment.kind === "text") text += segment.text;
    else {
      text += segment.label;
      const displayName = segment.label.replace(/^@/, "");
      if (displayName !== "" && !mentions.some((mention) => mention.profileId === segment.profileId)) {
        mentions.push({ profileId: segment.profileId, displayName });
      }
    }
  }
  return { text, mentions };
}

/** Najviše predloga u listi za @. */
export const MENTION_SUGGESTIONS_MAX = 6;

/**
 * Kandidati za @ (bez autora komentara): po rečima upita, bez dijakritika,
 * abecedno, najviše `MENTION_SUGGESTIONS_MAX`.
 */
export function mentionSuggestions<Member extends MentionCandidate>(
  members: ReadonlyArray<Member>,
  query: string,
  selfProfileId: string | null,
): Member[] {
  const others = members.filter(
    (member) => member.profileId !== selfProfileId && member.displayName.trim() !== "",
  );
  return filterPeople(others, query)
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "sr-Latn"))
    .slice(0, MENTION_SUGGESTIONS_MAX);
}

/** Pominjanja koja i dalje stoje u tekstu (obrisano „@Ime" ispada), bez duplikata. */
export function keptMentions<Member extends MentionCandidate>(
  text: string,
  mentions: ReadonlyArray<Member>,
): Member[] {
  const result: Member[] = [];
  for (const mention of mentions) {
    if (result.some((item) => item.profileId === mention.profileId)) continue;
    if (text.includes(`@${mention.displayName}`)) result.push(mention);
  }
  return result;
}

// --- Kompaktni komentari (panel zadatka) -----------------------------------------

/** Koliko poslednjih komentara panel zadatka prikazuje (K07 §5.7). */
export const COMPACT_COMMENTS_VISIBLE = 3;

/**
 * Lista je rastuća (najstariji prvi), pa „poslednja N" su s kraja. `hidden` je
 * koliko ih ostaje iza „Svi komentari".
 */
export function compactComments<Comment>(
  items: ReadonlyArray<Comment>,
  visible: number = COMPACT_COMMENTS_VISIBLE,
): { shown: Comment[]; hidden: number } {
  const keep = Math.max(0, Math.floor(visible));
  const shown = keep === 0 ? [] : items.slice(-keep);
  return { shown, hidden: items.length - shown.length };
}
