// Preneto iz Devotion packages/shared/src/task-filters.ts (main @ c05c40f), SPAJANJE S02.
/**
 * Moji zadaci (plan K07 §1.3) — filteri, pretraga i grupisanje nad zajedničkim
 * modelom reda (`TaskRowModel`), isto na webu i telefonu (E4). ČISTO: bez
 * React-a i bez Convex tipova. Filter po startupu je na klijentu (jedan upit
 * za sve startupe).
 */
import type { TaskRowModel } from "./task-row";
import {
  dueBucket,
  groupTasks,
  PERSONAL_GROUP_KEY,
  type DueBucket,
  type TaskGroup,
  type TaskGroupBy,
  type TaskPriorityKey,
  type TaskStatusKey,
} from "./task-sort";

/** Vrednost filtera startupa za lične zadatke. */
export const PERSONAL_FILTER_KEY = PERSONAL_GROUP_KEY;

export type TaskFilters = {
  /** Id-jevi startupa i/ili `"licno"`; prazno = svi. */
  workspaceIds: string[];
  /** Prazno = svi statusi. */
  statuses: TaskStatusKey[];
  /** `"none"` = bez prioriteta; prazno = svi. */
  priorities: Array<TaskPriorityKey | "none">;
  /** Kante roka iz `dueBucket`; prazno = svi rokovi. */
  due: DueBucket[];
  /** Završeni se vide samo uz ovaj prekidač. */
  showDone: boolean;
  query: string;
};

export const EMPTY_TASK_FILTERS: TaskFilters = {
  workspaceIds: [],
  statuses: [],
  priorities: [],
  due: [],
  showDone: false,
  query: "",
};

/** Statusi koje filter nudi (završene pokazuje „Prikaži završene"). */
export const TASK_FILTER_STATUSES: ReadonlyArray<TaskStatusKey> = [
  "in_progress",
  "next",
  "open",
  "blocked",
  "backlog",
];

export const TASK_FILTER_PRIORITIES: ReadonlyArray<TaskPriorityKey | "none"> = [
  "urgent",
  "high",
  "medium",
  "low",
  "none",
];

export const TASK_FILTER_DUE: ReadonlyArray<DueBucket> = [
  "overdue",
  "today",
  "tomorrow",
  "week",
  "later",
  "none",
];

export const TASK_GROUP_BY_OPTIONS: ReadonlyArray<{ value: TaskGroupBy; label: string }> = [
  { value: "startup", label: "Projekat" },
  { value: "due", label: "Rok" },
  { value: "status", label: "Status" },
  { value: "priority", label: "Prioritet" },
];

/**
 * Tekst za pretragu: mala slova, bez dijakritika (č ć → c, š → s, ž → z,
 * đ → dj i d), višestruki razmaci sabijeni. „đ" se ne razlaže kroz NFD, pa
 * ga mapiramo ručno; „dj" i „d" oba pogađaju.
 */
export function normalizeSearchText(value: string): string {
  return value
    .toLocaleLowerCase("sr-Latn")
    .replace(/đ/g, "dj")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function searchHaystack(row: TaskRowModel): string {
  const parts = [row.title, row.workspace?.name ?? "Lično", row.areaLabel ?? ""];
  const normalized = normalizeSearchText(parts.join(" "));
  // „đ" → i „dj" i „d", da „Dordevic" i „Djordjevic" oba nađu „Đorđević".
  return normalized.includes("dj") ? `${normalized} ${normalized.replace(/dj/g, "d")}` : normalized;
}

/** Sve reči upita moraju da se nađu (naslov, startup ili oblast). */
export function matchesTaskQuery(row: TaskRowModel, query: string): boolean {
  const terms = normalizeSearchText(query).split(" ").filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = searchHaystack(row);
  return terms.every((term) => haystack.includes(term));
}

/** Ključ startupa reda za filter (`"licno"` za lični zadatak). */
export function rowStartupKey(row: Pick<TaskRowModel, "workspace">): string {
  return row.workspace?._id ?? PERSONAL_FILTER_KEY;
}

/** Primeni filtere; redosled ulaza se čuva (sortira grupisanje). */
export function applyTaskFilters(
  rows: ReadonlyArray<TaskRowModel>,
  filters: TaskFilters,
  nowMs: number,
  zone?: string,
): TaskRowModel[] {
  const workspaces = new Set(filters.workspaceIds);
  const statuses = new Set(filters.statuses);
  const priorities = new Set(filters.priorities);
  const due = new Set(filters.due);
  return rows.filter((row) => {
    if (row.done && !filters.showDone) return false;
    if (workspaces.size > 0 && !workspaces.has(rowStartupKey(row))) return false;
    if (statuses.size > 0 && !statuses.has(row.status)) return false;
    if (priorities.size > 0 && !priorities.has(row.priority ?? "none")) return false;
    if (due.size > 0 && !due.has(dueBucket(row.dueDate, nowMs, zone))) return false;
    return matchesTaskQuery(row, filters.query);
  });
}

/**
 * Broj aktivnih filtera za dugme „Filteri (n)": svaka kategorija sa izborom
 * (startup, status, prioritet, rok) broji se jednom. Pretraga i „Prikaži
 * završene" nisu filteri u tom smislu (imaju svoje kontrole).
 */
export function activeFilterCount(filters: TaskFilters): number {
  return [filters.workspaceIds, filters.statuses, filters.priorities, filters.due].filter(
    (values) => values.length > 0,
  ).length;
}

/** Ima li išta što sužava listu (za prazno stanje „bez rezultata"). */
export function hasActiveFilters(filters: TaskFilters): boolean {
  return activeFilterCount(filters) > 0 || normalizeSearchText(filters.query) !== "";
}

/** „Očisti filtere": kategorije i pretraga; „Prikaži završene" ostaje. */
export function clearTaskFilters(filters: TaskFilters): TaskFilters {
  return { ...EMPTY_TASK_FILTERS, showDone: filters.showDone };
}

/** Uključi ili isključi vrednost u nizu filtera (novi niz, stabilan redosled). */
export function toggleFilterValue<T>(values: ReadonlyArray<T>, value: T): T[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

/**
 * Grupe za prikaz kroz `groupTasks` (isti redosled kao Moj dan i liste u
 * startupu): po startupu „Lično" prvo pa startupi po `startupOrder`, po roku
 * kante redom, po statusu i prioritetu stalan redosled. Unutar grupe po roku.
 */
export function groupTaskRows(
  rows: ReadonlyArray<TaskRowModel>,
  by: TaskGroupBy,
  nowMs: number,
  options: { zone?: string; startupOrder?: ReadonlyArray<string> } = {},
): TaskGroup<TaskRowModel>[] {
  const wrapped = rows.map((row) => ({
    row,
    dueDate: row.dueDate,
    priority: row.priority,
    status: row.status,
    createdAt: row.createdAt ?? 0,
    title: row.title,
    workspaceId: row.workspace?._id ?? null,
    startupName: row.workspace?.name ?? null,
  }));
  return groupTasks(wrapped, by, nowMs, options).map((group) => ({
    key: group.key,
    title: group.title,
    items: group.items.map((item) => item.row),
  }));
}

/** „Prikaži još N": koliko redova grupe se vidi i koliko je preostalo. */
export function pageOfGroup<T>(
  items: ReadonlyArray<T>,
  shown: number,
): { visible: T[]; remaining: number } {
  const visible = items.slice(0, Math.max(0, shown));
  return { visible, remaining: Math.max(0, items.length - visible.length) };
}

/** „1 otvoren", „3 otvorena", „11 otvorenih" (podnaslov Mojih zadataka). */
export function openTasksPhrase(count: number): string {
  const absolute = Math.abs(count);
  const lastDigit = absolute % 10;
  const lastTwo = absolute % 100;
  if (lastDigit === 1 && lastTwo !== 11) return `${count} otvoren`;
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14)) {
    return `${count} otvorena`;
  }
  return `${count} otvorenih`;
}
