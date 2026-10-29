// Preneto iz Devotion packages/shared/src/my-day.ts (main @ c05c40f), SPAJANJE S02.
/**
 * „Moj dan" — grupisanje stavki u sekcije, isto na webu i telefonu (P5).
 * Ulaz su obični objekti (bez Convex tipova); izlaz je spreman za render.
 *
 * Pravilo „jednom": svaka stavka dobija TAČNO jednu sekciju — prvu po
 * prednosti (plan K01 §4.2):
 *   završeno → „Završeno danas" (ako je danas, inače se ne prikazuje)
 *   1. rok prošao        → Prekoračeno
 *   2. rok danas         → Danas  (i kad je planirana — rok pobeđuje plan)
 *   3. u planu za danas  → Planirano
 *   4. status „u toku"   → U toku
 *   5. status „čeka"     → Blokirano
 *   6. rok za 1–7 dana   → Uskoro
 *   ostalo otvoreno se ne prikazuje (nudi se u „Isplaniraj dan").
 * Redosled PRIKAZA je drugačiji od prednosti: Uskoro ide pre Blokiranog.
 */
import {
  type DayKey,
  dayDiff,
  dayKeyOf,
  diffDayKeys,
  startOfDay,
} from "./dates";
import {
  compareByDue,
  compareTitle,
  PRIORITY_RANK,
  type TaskPriorityKey,
  type TaskStatusKey,
} from "./task-sort";

export type MyDayItemKind = "task" | "personal";

export type MyDayItem = {
  /** `refKey`: "task:<id>" ili "personal:<id>". */
  key: string;
  kind: MyDayItemKind;
  id: string;
  title: string;
  status: TaskStatusKey;
  priority: TaskPriorityKey | null;
  /** Lokalno podne dana roka. */
  dueDate: number | null;
  completedAt: number | null;
  createdAt: number;
  /** `null` = lično. */
  workspaceId: string | null;
  startupName: string | null;
  areaLabel: string | null;
  isCreator: boolean;
  isAssignee: boolean;
  /** PROSTOR P1: zaključan za gledaoca (nije autor, vlasnik ni admin). */
  lockedForViewer?: boolean;
};

export type MyDayPlanEntry = {
  entryId: string;
  refKey: string;
  dayKey: DayKey;
  position: number;
};

export type MyDayInput = {
  items: ReadonlyArray<MyDayItem>;
  /** Plan za današnji dan (ostali dani se ignorišu). */
  plan: ReadonlyArray<MyDayPlanEntry>;
  /** Plan prethodnih dana (za „Preneto od ranije"). */
  history: ReadonlyArray<MyDayPlanEntry>;
  /** Sat klijenta — upit ga ne čita. */
  now: number;
  zone?: string;
};

export type MyDaySectionId =
  | "overdue"
  | "today"
  | "planned"
  | "inProgress"
  | "soon"
  | "blocked"
  | "doneToday";

export const MY_DAY_SECTION_ORDER: ReadonlyArray<MyDaySectionId> = [
  "overdue",
  "today",
  "planned",
  "inProgress",
  "soon",
  "blocked",
  "doneToday",
];

export const MY_DAY_SECTION_TITLES: Record<MyDaySectionId, string> = {
  overdue: "Prekoračeno",
  today: "Danas",
  planned: "Planirano",
  inProgress: "U toku",
  soon: "Uskoro",
  blocked: "Blokirano",
  doneToday: "Završeno danas",
};

const COLLAPSED_BY_DEFAULT: ReadonlySet<MyDaySectionId> = new Set([
  "blocked",
  "doneToday",
]);

/** Prozor sekcije „Uskoro" i „Preneto od ranije" (dani). */
export const MY_DAY_SOON_DAYS = 7;
export const MY_DAY_CARRY_OVER_DAYS = 7;

export type MyDayRow = MyDayItem & {
  planned: boolean;
  planPosition: number | null;
  planEntryId: string | null;
  /** Kalendarski dani do roka; `null` bez roka. */
  dayDiff: number | null;
  /** `null` = stavka danas nema sekciju. */
  section: MyDaySectionId | null;
};

export type MyDaySection = {
  id: MyDaySectionId;
  title: string;
  collapsedByDefault: boolean;
  rows: MyDayRow[];
};

export type MyDayGrouping = {
  /** Svih sedam sekcija u redosledu prikaza (prazne ostaju — UI ih preskače). */
  sections: MyDaySection[];
  /** Prsten: obaveze dana = planirano danas ∪ rok danas. */
  progress: { done: number; total: number };
  counts: Record<MyDaySectionId, number>;
};

// --- refKey -----------------------------------------------------------------

export function myDayRefKey(kind: MyDayItemKind, id: string): string {
  return `${kind}:${id}`;
}

export function parseRefKey(
  key: string,
): { kind: MyDayItemKind; id: string } | null {
  const separator = key.indexOf(":");
  if (separator <= 0) return null;
  const kind = key.slice(0, separator);
  const id = key.slice(separator + 1);
  if ((kind !== "task" && kind !== "personal") || id.length === 0) return null;
  return { kind, id };
}

// --- Ulaz iz `myDay.overview` -----------------------------------------------

type OverviewEntryLike = {
  _id: string;
  dayKey: string;
  refKey: string;
  position: number;
};

/** Strukturni oblik `api.myDay.overview` (plan K01 §2.2), bez Convex importa. */
export type MyDayOverviewLike = {
  tasks: ReadonlyArray<{
    _id: string;
    title: string;
    taskStatus: Exclude<TaskStatusKey, "open"> | null;
    taskPriority: TaskPriorityKey | null;
    dueDate: number | null;
    completedAt: number | null;
    createdAt: number;
    isCreator: boolean;
    isAssignee: boolean;
    lockedForViewer?: boolean;
    workspace: { _id: string; name: string };
    area: { label: string } | null;
  }>;
  personal: ReadonlyArray<{
    _id: string;
    title: string;
    status: "open" | "done";
    priority: TaskPriorityKey | null;
    dueDate: number | null;
    completedAt: number | null;
    createdAt: number;
  }>;
  entries: ReadonlyArray<OverviewEntryLike>;
  history: ReadonlyArray<OverviewEntryLike>;
};

function toPlanEntry(entry: OverviewEntryLike): MyDayPlanEntry {
  return {
    entryId: entry._id,
    refKey: entry.refKey,
    dayKey: entry.dayKey,
    position: entry.position,
  };
}

/** Jedno mapiranje odgovora servera u ulaz za grupisanje — za oba klijenta. */
export function fromOverview(
  overview: MyDayOverviewLike,
  now: number,
  zone?: string,
): MyDayInput {
  const items: MyDayItem[] = [];
  for (const task of overview.tasks) {
    items.push({
      key: myDayRefKey("task", task._id),
      kind: "task",
      id: task._id,
      title: task.title,
      // Zadatak bez statusa (stari zapisi) se ponaša kao backlog.
      status: task.taskStatus ?? "backlog",
      priority: task.taskPriority,
      dueDate: task.dueDate,
      completedAt: task.completedAt,
      createdAt: task.createdAt,
      workspaceId: task.workspace._id,
      startupName: task.workspace.name,
      areaLabel: task.area?.label ?? null,
      isCreator: task.isCreator,
      isAssignee: task.isAssignee,
      lockedForViewer: task.lockedForViewer ?? false,
    });
  }
  for (const task of overview.personal) {
    items.push({
      key: myDayRefKey("personal", task._id),
      kind: "personal",
      id: task._id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate,
      completedAt: task.completedAt,
      createdAt: task.createdAt,
      workspaceId: null,
      startupName: null,
      areaLabel: null,
      isCreator: true,
      isAssignee: true,
    });
  }
  return {
    items,
    plan: overview.entries.map(toPlanEntry),
    history: overview.history.map(toPlanEntry),
    now,
    zone,
  };
}

// --- Klasifikacija ----------------------------------------------------------

type Context = {
  todayKey: DayKey;
  dayStart: number;
  planByRef: Map<string, MyDayPlanEntry>;
  now: number;
  zone?: string;
};

function contextOf(input: MyDayInput): Context {
  const todayKey = dayKeyOf(input.now, input.zone);
  const planByRef = new Map<string, MyDayPlanEntry>();
  for (const entry of input.plan) {
    if (entry.dayKey !== todayKey) continue;
    if (!planByRef.has(entry.refKey)) planByRef.set(entry.refKey, entry);
  }
  return {
    todayKey,
    dayStart: startOfDay(input.now, input.zone),
    planByRef,
    now: input.now,
    zone: input.zone,
  };
}

function classify(
  item: MyDayItem,
  planned: boolean,
  diff: number | null,
  dayStart: number,
): MyDaySectionId | null {
  if (item.status === "done") {
    return item.completedAt !== null && item.completedAt >= dayStart
      ? "doneToday"
      : null;
  }
  if (diff !== null && diff < 0) return "overdue";
  if (diff === 0) return "today";
  if (planned) return "planned";
  if (item.status === "in_progress") return "inProgress";
  if (item.status === "blocked") return "blocked";
  if (diff !== null && diff >= 1 && diff <= MY_DAY_SOON_DAYS) return "soon";
  return null;
}

function toRow(item: MyDayItem, context: Context): MyDayRow {
  const entry = context.planByRef.get(item.key) ?? null;
  const diff =
    item.dueDate === null ? null : dayDiff(item.dueDate, context.now, context.zone);
  return {
    ...item,
    planned: entry !== null,
    planPosition: entry?.position ?? null,
    planEntryId: entry?.entryId ?? null,
    dayDiff: diff,
    section: classify(item, entry !== null, diff, context.dayStart),
  };
}

/** Stavke bez duplikata po `key` (prva pobeđuje), kao redovi. */
function rowsOf(input: MyDayInput, context: Context): MyDayRow[] {
  const seen = new Set<string>();
  const rows: MyDayRow[] = [];
  for (const item of input.items) {
    if (seen.has(item.key)) continue;
    seen.add(item.key);
    rows.push(toRow(item, context));
  }
  return rows;
}

// --- Redosled unutar sekcije ------------------------------------------------

function priorityRank(row: MyDayRow) {
  return PRIORITY_RANK[row.priority ?? "medium"];
}

function compareCreated(a: MyDayRow, b: MyDayRow) {
  return a.createdAt - b.createdAt || compareTitle(a, b);
}

function comparePlanPosition(a: MyDayRow, b: MyDayRow) {
  if (a.planPosition === b.planPosition) return 0;
  if (a.planPosition === null) return 1;
  if (b.planPosition === null) return -1;
  return a.planPosition - b.planPosition;
}

const SECTION_COMPARATORS: Record<
  MyDaySectionId,
  (a: MyDayRow, b: MyDayRow) => number
> = {
  // Najdublje prekoračeno prvo.
  overdue: (a, b) =>
    (a.dueDate ?? 0) - (b.dueDate ?? 0) ||
    priorityRank(a) - priorityRank(b) ||
    compareCreated(a, b),
  today: (a, b) =>
    priorityRank(a) - priorityRank(b) ||
    comparePlanPosition(a, b) ||
    compareCreated(a, b),
  // Korisnikov redosled.
  planned: (a, b) => comparePlanPosition(a, b) || compareCreated(a, b),
  inProgress: compareByDue,
  soon: compareByDue,
  blocked: compareByDue,
  doneToday: (a, b) =>
    (b.completedAt ?? 0) - (a.completedAt ?? 0) || compareCreated(a, b),
};

function sectionRank(section: MyDaySectionId) {
  return MY_DAY_SECTION_ORDER.indexOf(section);
}

function compareRows(a: MyDayRow, b: MyDayRow) {
  if (a.section !== b.section) {
    if (a.section === null) return 1;
    if (b.section === null) return -1;
    return sectionRank(a.section) - sectionRank(b.section);
  }
  return a.section === null ? compareByDue(a, b) : SECTION_COMPARATORS[a.section](a, b);
}

// --- Javno API --------------------------------------------------------------

/** Sekcije „po vremenu" (podrazumevani prikaz) + prsten napretka. */
export function groupMyDay(input: MyDayInput): MyDayGrouping {
  const context = contextOf(input);
  const rows = rowsOf(input, context);

  const sections = MY_DAY_SECTION_ORDER.map<MyDaySection>((id) => ({
    id,
    title: MY_DAY_SECTION_TITLES[id],
    collapsedByDefault: COLLAPSED_BY_DEFAULT.has(id),
    rows: rows
      .filter((row) => row.section === id)
      .sort(SECTION_COMPARATORS[id]),
  }));

  const counts = Object.fromEntries(
    sections.map((section) => [section.id, section.rows.length]),
  ) as Record<MyDaySectionId, number>;

  // Obaveza dana: planirano danas ili rok danas — otvoreno ili završeno danas.
  // Završeno pre danas se ne broji (nema sekciju).
  const commitments = rows.filter(
    (row) => row.section !== null && (row.planned || row.dayDiff === 0),
  );
  const done = commitments.filter((row) => row.section === "doneToday").length;

  return {
    sections,
    progress: { done, total: commitments.length },
    counts,
  };
}

export type MyDayStartupGroup = {
  /** `null` = Lično. */
  workspaceId: string | null;
  title: string;
  rows: MyDayRow[];
};

/**
 * Isti skup stavki kao `groupMyDay`, grupisan po startupu: „Lično" prvo, pa
 * startupi po `startupOrder` (id-jevi; ostali abecedno). Unutar grupe redosled
 * sekcija pa redosled sekcije. „Završeno danas" ide odvojeno.
 */
export function groupMyDayByStartup(
  input: MyDayInput,
  startupOrder: ReadonlyArray<string> = [],
): { groups: MyDayStartupGroup[]; doneToday: MyDayRow[] } {
  const context = contextOf(input);
  const rows = rowsOf(input, context);
  const visible = rows.filter(
    (row) => row.section !== null && row.section !== "doneToday",
  );

  const byStartup = new Map<string | null, MyDayStartupGroup>();
  for (const row of visible) {
    const group = byStartup.get(row.workspaceId) ?? {
      workspaceId: row.workspaceId,
      title: row.workspaceId === null ? "Lično" : row.startupName ?? "Projekat",
      rows: [],
    };
    group.rows.push(row);
    byStartup.set(row.workspaceId, group);
  }

  const orderIndex = (workspaceId: string) => {
    const index = startupOrder.indexOf(workspaceId);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };
  const groups = [...byStartup.values()].sort((a, b) => {
    if (a.workspaceId === null) return -1;
    if (b.workspaceId === null) return 1;
    return (
      orderIndex(a.workspaceId) - orderIndex(b.workspaceId) ||
      compareTitle(a, b)
    );
  });
  for (const group of groups) group.rows.sort(compareRows);

  return {
    groups,
    doneToday: rows
      .filter((row) => row.section === "doneToday")
      .sort(SECTION_COMPARATORS.doneToday),
  };
}

export type PlanSuggestionReason = "dueThisWeek" | "priority" | "next" | "personal";

export const PLAN_SUGGESTION_LABELS: Record<PlanSuggestionReason, string> = {
  dueThisWeek: "Rok ove nedelje",
  priority: "Visok prioritet",
  next: "Sledeće",
  personal: "Lično",
};

const REASON_RANK: Record<PlanSuggestionReason, number> = {
  dueThisWeek: 0,
  priority: 1,
  next: 2,
  personal: 3,
};

/** Sekcije koje plan ne pomera — stavke odatle se ne predlažu. */
const NOT_SUGGESTED: ReadonlySet<MyDaySectionId> = new Set([
  "overdue",
  "today",
  "inProgress",
  "blocked",
  "doneToday",
]);

function suggestionReason(row: MyDayRow): PlanSuggestionReason | null {
  if (row.dayDiff !== null && row.dayDiff >= 1 && row.dayDiff <= MY_DAY_SOON_DAYS) {
    return "dueThisWeek";
  }
  if (row.priority === "urgent" || row.priority === "high") return "priority";
  if (row.status === "next") return "next";
  if (row.kind === "personal") return "personal";
  return null;
}

/**
 * Predlozi za „Isplaniraj dan": otvoreno, još nije u planu, i plan bi ga
 * pomerio. Razlog po prednosti: rok ove nedelje → hitno/visok prioritet →
 * status „Sledeće" → otvoren lični.
 */
export function planSuggestions(
  input: MyDayInput,
  limit = 30,
): Array<{ row: MyDayRow; reason: PlanSuggestionReason }> {
  const context = contextOf(input);
  const suggestions: Array<{ row: MyDayRow; reason: PlanSuggestionReason }> = [];
  for (const row of rowsOf(input, context)) {
    if (row.status === "done" || row.planned) continue;
    if (row.status === "in_progress" || row.status === "blocked") continue;
    if (row.section !== null && NOT_SUGGESTED.has(row.section)) continue;
    const reason = suggestionReason(row);
    if (reason !== null) suggestions.push({ row, reason });
  }
  return suggestions
    .sort(
      (a, b) =>
        REASON_RANK[a.reason] - REASON_RANK[b.reason] ||
        compareByDue(a.row, b.row),
    )
    .slice(0, limit);
}

export type CarryOverCandidate = {
  row: MyDayRow;
  /** Dan sa koga se stavka prenosi (najnoviji, ako je bila u više dana). */
  fromDayKey: DayKey;
  entryId: string;
};

/**
 * „Preneto od ranije": stavke iz plana prethodnih 7 dana koje nisu završene,
 * još postoje i nisu već u današnjem planu. Ne prenose se same — korisnik ih
 * vraća u danas ili sklanja.
 */
export function carryOverCandidates(input: MyDayInput): CarryOverCandidate[] {
  const context = contextOf(input);
  const rowByKey = new Map(
    rowsOf(input, context).map((row) => [row.key, row] as const),
  );
  const ordered = [...input.history].sort(
    (a, b) =>
      (a.dayKey < b.dayKey ? 1 : a.dayKey > b.dayKey ? -1 : 0) ||
      a.position - b.position,
  );
  const seen = new Set<string>();
  const result: CarryOverCandidate[] = [];
  for (const entry of ordered) {
    const age = diffDayKeys(entry.dayKey, context.todayKey);
    if (age < 1 || age > MY_DAY_CARRY_OVER_DAYS) continue;
    if (seen.has(entry.refKey)) continue;
    seen.add(entry.refKey);
    if (context.planByRef.has(entry.refKey)) continue;
    const row = rowByKey.get(entry.refKey);
    if (row === undefined || row.status === "done") continue;
    result.push({ row, fromDayKey: entry.dayKey, entryId: entry.entryId });
  }
  return result;
}

/**
 * Broj mojih otvorenih dodeljenih zadataka po startupu (meni „Ja"). Lični
 * zadaci i zadaci gde nisam izvršilac se ne broje.
 */
export function countOpenByStartup(
  items: ReadonlyArray<MyDayItem>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.key)) continue;
    seen.add(item.key);
    if (item.kind !== "task" || !item.isAssignee || item.status === "done") continue;
    if (item.workspaceId === null) continue;
    counts[item.workspaceId] = (counts[item.workspaceId] ?? 0) + 1;
  }
  return counts;
}
