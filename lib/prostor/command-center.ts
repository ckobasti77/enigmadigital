// Preneto iz Devotion packages/shared/src/command-center.ts (main @ c05c40f), SPAJANJE S02.
/**
 * Komandni centar 2.0 (PROSTOR P8, P10, K19) — čiste funkcije koje dele web i
 * telefon: izbor „Za tebe", kandidati i ishodi „Sredi rokove", „Poništi",
 * zbir Pulsa nedelje i red Tima. Bez React-a i bez Convex tipova (id-jevi su
 * stringovi; klijent ih kastuje na ivici). Upiti ne čitaju sat — `now` stiže
 * od klijenta.
 */
import {
  addDaysToKey,
  dayDiff,
  dayKeyOf,
  dueShortcutValue,
  startOfDayKey,
  startOfWeekKey,
} from "./dates";
import { isStale } from "./stale";

// --- Tekstovi ------------------------------------------------------------------

/** Greške blokova i „Sredi rokove" — isti tekst na webu i telefonu (DIZAJN-SMIRENJE §5.5). */
export const COMMAND_BLOCK_TEXT = {
  forYouError: "Tvoji zadaci nisu učitani.",
  triageError: "Trijaža tima nije učitana.",
  waitingError: "Ideje koje čekaju tvoj glas nisu učitane.",
  recentError: "Nedavne izmene nisu učitane.",
  pulseError: "Puls nedelje nije učitan.",
  teamError: "Opterećenje tima nije učitano.",
  rescheduleFailed: "Rokovi nisu sređeni.",
  rescheduleUndoFailed: "Rokovi nisu vraćeni.",
} as const;

// --- Brojevi i reči ----------------------------------------------------------

/** Ogledalo `BULK_RESCHEDULE_MAX` u `lib/validators.ts` (backend ne uvozi shared). */
export const BULK_RESCHEDULE_MAX = 50;

/** „1 zadatak", „2 zadatka", „5 zadataka", „11 zadataka", „21 zadatak". */
export function tasksCountLabel(count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;
  const word =
    last === 1 && lastTwo !== 11
      ? "zadatak"
      : last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)
        ? "zadatka"
        : "zadataka";
  return `${count} ${word}`;
}

// --- Za tebe ------------------------------------------------------------------

type ForYouCandidate = {
  dueDate: number | null;
  taskStatus: string | null;
  taskPriority?: string | null;
  taskSortAt?: number;
};

const PRIORITY_WEIGHT: Record<string, number> = { urgent: 3, high: 2, medium: 1, low: 0 };

function priorityWeight(priority: string | null | undefined): number {
  return priority == null ? 1 : (PRIORITY_WEIGHT[priority] ?? 1);
}

/** Grupa „Za tebe": prekoračeno → danas → u toku (redosled prikaza). */
export type ForYouGroup = "overdue" | "today" | "in_progress";

function forYouGroup(task: ForYouCandidate, now: number, zone?: string): ForYouGroup | null {
  if (task.taskStatus === "done") return null;
  if (task.dueDate !== null) {
    const diff = dayDiff(task.dueDate, now, zone);
    if (diff < 0) return "overdue";
    if (diff === 0) return "today";
  }
  return task.taskStatus === "in_progress" ? "in_progress" : null;
}

/**
 * „Za tebe" (P8): moji otvoreni zadaci u startupu — prekoračeno, pa danas, pa
 * u toku. Unutar grupe: najstariji rok prvi, pa prioritet, pa `taskSortAt`.
 * `total` je broj svih koji ispunjavaju uslov (red „Svi moji zadaci" kaže
 * koliko ih ima iza prikazanih).
 */
export function forYouTasks<T extends ForYouCandidate>(
  tasks: ReadonlyArray<T>,
  now: number,
  limit: number,
  zone?: string,
): { items: T[]; total: number } {
  const order: ForYouGroup[] = ["overdue", "today", "in_progress"];
  const grouped = new Map<ForYouGroup, T[]>(order.map((group) => [group, []]));
  for (const task of tasks) {
    const group = forYouGroup(task, now, zone);
    if (group !== null) grouped.get(group)?.push(task);
  }
  const sorted: T[] = [];
  for (const group of order) {
    const items = grouped.get(group) ?? [];
    items.sort((a, b) => {
      if (a.dueDate !== b.dueDate) {
        if (a.dueDate === null) return 1;
        if (b.dueDate === null) return -1;
        return a.dueDate - b.dueDate;
      }
      return (
        priorityWeight(b.taskPriority) - priorityWeight(a.taskPriority) ||
        (a.taskSortAt ?? 0) - (b.taskSortAt ?? 0)
      );
    });
    sorted.push(...items);
  }
  return { items: sorted.slice(0, Math.max(0, limit)), total: sorted.length };
}

// --- Sredi rokove -------------------------------------------------------------

export type RescheduleTarget = "today" | "tomorrow" | "nextWeek" | "none" | "done";

/** Dugmad dijaloga „Sredi rokove", redom (P10). */
export const RESCHEDULE_TARGETS: ReadonlyArray<{ key: RescheduleTarget; label: string }> = [
  { key: "today", label: "Danas" },
  { key: "tomorrow", label: "Sutra" },
  { key: "nextWeek", label: "Sledeće nedelje" },
  { key: "none", label: "Bez roka" },
  { key: "done", label: "Završi" },
];

/** Deo argumenata `tasks.bulkReschedule`: ili novi rok (lokalno podne / `null`), ili „Završi". */
export type RescheduleChange = { dueDate: number | null } | { complete: true };

export function rescheduleChange(
  target: RescheduleTarget,
  now: number,
  zone?: string,
): RescheduleChange {
  switch (target) {
    case "today":
    case "tomorrow":
    case "nextWeek":
      return { dueDate: dueShortcutValue(target, now, zone) };
    case "none":
      return { dueDate: null };
    case "done":
      return { complete: true };
  }
}

type RescheduleCandidateInput = {
  _id: string;
  title: string;
  dueDate: number | null;
  taskStatus: string | null;
};

export type RescheduleCandidate = {
  id: string;
  title: string;
  dueDate: number;
  /** Koliko kalendarskih dana kasni (≥ 1). */
  daysLate: number;
  /** Rok je stariji od 14 dana („Zastarelo"). */
  stale: boolean;
};

/**
 * Lista dijaloga „Sredi rokove": otvoreni zadaci kojima je rok prošao (i
 * zastareli među njima), najstariji rok prvi. Hitno i blokirano bez prošlog
 * roka ovde nemaju šta da traže — rok im se ne „sređuje".
 */
export function rescheduleCandidates(
  tasks: ReadonlyArray<RescheduleCandidateInput>,
  now: number,
  zone?: string,
): RescheduleCandidate[] {
  const result: RescheduleCandidate[] = [];
  for (const task of tasks) {
    if (task.taskStatus === "done" || task.dueDate === null) continue;
    const diff = dayDiff(task.dueDate, now, zone);
    if (diff >= 0) continue;
    result.push({
      id: task._id,
      title: task.title,
      dueDate: task.dueDate,
      daysLate: -diff,
      stale: isStale(task.dueDate, now, zone),
    });
  }
  return result.sort((a, b) => a.dueDate - b.dueDate);
}

/** Izabrani id-jevi za poziv: najviše `BULK_RESCHEDULE_MAX`, redosled liste. */
export function selectionForCall(
  ids: ReadonlyArray<string>,
  max: number = BULK_RESCHEDULE_MAX,
): { ids: string[]; capped: boolean } {
  return { ids: ids.slice(0, max), capped: ids.length > max };
}

/** Red ispod liste dijaloga: koliko je izabrano i da li se obrađuje samo prvih 50. */
export function rescheduleSelectionNote(selected: number, max: number = BULK_RESCHEDULE_MAX): string {
  if (selected === 0) return "Nijedan zadatak nije izabran.";
  if (selected > max) return `Izabrano: ${selected} · obrađuje se prvih ${max}`;
  return `Izabrano: ${selected}`;
}

const TARGET_WORD: Record<RescheduleTarget, string> = {
  today: "danas",
  tomorrow: "sutra",
  nextWeek: "sledeće nedelje",
  none: "bez roka",
  done: "završeno",
};

type SkippedLike = ReadonlyArray<{ reason: string }>;

/** „2 zaključana su preskočena." · „1 je preskočen." (srpski rod i broj). */
export function skippedNote(skipped: SkippedLike): string {
  const count = skipped.length;
  if (count === 0) return "";
  const lastTwo = count % 100;
  const last = count % 10;
  const one = last === 1 && lastTwo !== 11;
  const few = last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14);
  const locked = skipped.every((item) => item.reason === "zakljucan");
  if (locked) {
    if (one) return `${count} zaključan je preskočen.`;
    return few ? `${count} zaključana su preskočena.` : `${count} zaključanih je preskočeno.`;
  }
  if (one) return `${count} je preskočen.`;
  return few ? `${count} su preskočena.` : `${count} je preskočeno.`;
}

/** Poruka posle `bulkReschedule`: „Sređeno: 12 zadataka → sutra. 2 zaključana su preskočena." */
export function rescheduleOutcome(
  target: RescheduleTarget,
  result: { updated: number; unchanged: number; skipped: SkippedLike },
): { message: string; changed: boolean } {
  const note = skippedNote(result.skipped);
  if (result.updated === 0) {
    const same = target === "done" ? "Zadaci su već završeni." : "Zadaci već imaju taj rok.";
    const base = result.unchanged > 0 ? same : "Ništa nije promenjeno.";
    return { message: note ? `${base} ${note}` : base, changed: false };
  }
  const base = `Sređeno: ${tasksCountLabel(result.updated)} → ${TARGET_WORD[target]}.`;
  return { message: note ? `${base} ${note}` : base, changed: true };
}

// --- Poništi ------------------------------------------------------------------

/** Stavka za `tasks.bulkRestoreSchedule`. */
export type UndoItem = {
  taskPageId: string;
  dueDate: number | null;
  taskStatus: string;
  expectedRevision: number;
};

/** Stavke „Poništi" iz odgovora `bulkReschedule.updated` (prethodno stanje + nova revizija). */
export function undoItemsFrom(
  updated: ReadonlyArray<{
    taskPageId: string;
    previous: { dueDate: number | null; taskStatus: string };
    revision: number;
  }>,
): UndoItem[] {
  return updated.map((item) => ({
    taskPageId: item.taskPageId,
    dueDate: item.previous.dueDate,
    taskStatus: item.previous.taskStatus,
    expectedRevision: item.revision,
  }));
}

/**
 * Ulančano „Poništi" (K06-3): kad jedno poništavanje promeni reviziju zadatka,
 * starije još živo „Poništi" mora da očekuje novu — inače bi ga server
 * preskočio kao „u međuvremenu menjan".
 */
export function withNewRevisions(
  items: ReadonlyArray<UndoItem>,
  revisions: ReadonlyArray<{ taskPageId: string; revision: number }>,
): UndoItem[] {
  if (revisions.length === 0) return [...items];
  const byId = new Map(revisions.map((entry) => [entry.taskPageId, entry.revision] as const));
  return items.map((item) => {
    const revision = byId.get(item.taskPageId);
    return revision === undefined ? item : { ...item, expectedRevision: revision };
  });
}

/** „Vraćeno 10 zadataka." · „Vraćeno 9 · 1 je u međuvremenu menjan." */
export function undoOutcome(result: {
  restored: number;
  unchanged: number;
  skipped: SkippedLike;
}): string {
  const changed = result.skipped.filter((item) => item.reason === "izmenjen").length;
  const other = result.skipped.length - changed;
  const parts: string[] = [];
  if (result.restored > 0) parts.push(`Vraćeno ${tasksCountLabel(result.restored)}`);
  if (changed > 0) {
    const lastTwo = changed % 100;
    const last = changed % 10;
    const phrase =
      last === 1 && lastTwo !== 11
        ? "je u međuvremenu menjan"
        : last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)
          ? "su u međuvremenu menjana"
          : "je u međuvremenu menjano";
    parts.push(`${changed} ${phrase}`);
  }
  if (other > 0) parts.push(`${other} nije vraćeno`);
  if (parts.length === 0) {
    return result.unchanged > 0 ? "Zadaci su već vraćeni." : "Ništa nije vraćeno.";
  }
  return `${parts.join(" · ")}.`;
}

// --- Puls nedelje -------------------------------------------------------------

/**
 * Korak „sada" za karticu Pulsa (K23). `now` iz `useToday` se menja pri svakom
 * povratku u aplikaciju posle 60 s, a svaka nova vrednost je NOVA pretplata na
 * težak `puls.getWeekly`. Kartici (prekoračeno i „zapelo" se računaju u danima)
 * je dovoljan korak od 15 min; sve zone imaju pomak deljiv sa 15 min, pa
 * zaokružen trenutak nikad ne pređe u prethodni lokalni dan.
 */
export const PULSE_NOW_STEP_MS = 15 * 60_000;

/** `now` zaokružen naniže na `PULSE_NOW_STEP_MS` — stabilan argument pretplate. */
export function pulseCardNow(now: number): number {
  return Math.floor(now / PULSE_NOW_STEP_MS) * PULSE_NOW_STEP_MS;
}

/** Granice tekuće nedelje (ponedeljak 00:00 lokalno) za `puls.getWeekly`. */
export function currentWeekBounds(
  now: number,
  zone?: string,
): { prevWeekStart: number; weekStart: number; weekEnd: number; now: number } {
  const monday = startOfWeekKey(dayKeyOf(now, zone));
  return {
    prevWeekStart: startOfDayKey(addDaysToKey(monday, -7), zone),
    weekStart: startOfDayKey(monday, zone),
    weekEnd: startOfDayKey(addDaysToKey(monday, 7), zone),
    now,
  };
}

export type WeekPulseFact = {
  key: "completed" | "created" | "stuck";
  label: string;
  value: number;
};

/** Kartica Pulsa nedelje: Završeno · Novo · Zapelo (iz `puls.getWeekly.summary`). */
export function weekPulseFacts(summary: {
  completed: { current: number };
  created: { current: number };
  stuck: { current: number };
}): WeekPulseFact[] {
  return [
    { key: "completed", label: "Završeno", value: summary.completed.current },
    { key: "created", label: "Novo", value: summary.created.current },
    { key: "stuck", label: "Zapelo", value: summary.stuck.current },
  ];
}

// --- Tim ----------------------------------------------------------------------

/** Red Tima: „6 otvoreno · 2 kasni" (bez otvorenih: „Nema otvorenih"). */
export function teamWorkloadLabel(entry: { open: number; overdue: number }): string {
  if (entry.open === 0) return "Nema otvorenih";
  return entry.overdue > 0
    ? `${entry.open} otvoreno · ${entry.overdue} kasni`
    : `${entry.open} otvoreno`;
}
