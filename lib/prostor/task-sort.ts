// Preneto iz Devotion packages/shared/src/task-sort.ts (main @ c05c40f), SPAJANJE S02.
/**
 * Redosled i grupisanje zadataka — ISTO na webu i telefonu (Moj dan, Moji
 * zadaci, liste u startupu). Redosled po roku je isti kao `compareFallback` u
 * `apps/web/lib/deadline.ts`: rok rastuće (bez roka na kraju), pa prioritet
 * (bez prioriteta = srednji); sledeći ključ je ovde `createdAt` (stariji prvi)
 * pa naslov, da redosled bude potpuno određen.
 */
import { dayDiff } from "./dates";

export type TaskPriorityKey = "low" | "medium" | "high" | "urgent";

/** Statusi zadatka u startupu + `open` za lični zadatak. */
export type TaskStatusKey =
  | "backlog"
  | "next"
  | "in_progress"
  | "blocked"
  | "done"
  | "open";

export const PRIORITY_RANK: Record<TaskPriorityKey, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export const STATUS_RANK: Record<TaskStatusKey, number> = {
  in_progress: 0,
  next: 1,
  open: 1,
  blocked: 2,
  backlog: 3,
  done: 4,
};

export const PRIORITY_LABELS: Record<TaskPriorityKey, string> = {
  urgent: "Hitno",
  high: "Visok",
  medium: "Srednji",
  low: "Nizak",
};

export const STATUS_LABELS: Record<TaskStatusKey, string> = {
  in_progress: "U toku",
  next: "Sledeće",
  open: "Otvoreno",
  blocked: "Čeka",
  backlog: "Neplanirano",
  done: "Gotovo",
};

export type SortableTaskLike = {
  dueDate: number | null;
  priority: TaskPriorityKey | null;
  status: TaskStatusKey;
  createdAt: number;
  title: string;
};

function priorityRank(priority: TaskPriorityKey | null) {
  return PRIORITY_RANK[priority ?? "medium"];
}

function compareDueOnly(a: SortableTaskLike, b: SortableTaskLike) {
  if (a.dueDate === b.dueDate) return 0;
  if (a.dueDate === null) return 1;
  if (b.dueDate === null) return -1;
  return a.dueDate - b.dueDate;
}

/** Naslovi po srpskoj azbuci latinice, bez obzira na velika/mala slova. */
export function compareTitle(a: { title: string }, b: { title: string }) {
  return a.title.localeCompare(b.title, "sr-Latn", { sensitivity: "base" });
}

function compareTail(a: SortableTaskLike, b: SortableTaskLike) {
  if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
  return compareTitle(a, b);
}

/** Rok rastuće (bez roka na kraju) → prioritet → `createdAt` → naslov. */
export function compareByDue(a: SortableTaskLike, b: SortableTaskLike) {
  const byDue = compareDueOnly(a, b);
  if (byDue !== 0) return byDue;
  const byPriority = priorityRank(a.priority) - priorityRank(b.priority);
  if (byPriority !== 0) return byPriority;
  return compareTail(a, b);
}

/** Prioritet (hitno prvo) → rok → `createdAt` → naslov. */
export function compareByPriority(a: SortableTaskLike, b: SortableTaskLike) {
  const byPriority = priorityRank(a.priority) - priorityRank(b.priority);
  if (byPriority !== 0) return byPriority;
  const byDue = compareDueOnly(a, b);
  if (byDue !== 0) return byDue;
  return compareTail(a, b);
}

/** Status (u toku prvo, gotovo zadnje) → rok → prioritet → ostalo. */
export function compareByStatus(a: SortableTaskLike, b: SortableTaskLike) {
  const byStatus = STATUS_RANK[a.status] - STATUS_RANK[b.status];
  if (byStatus !== 0) return byStatus;
  return compareByDue(a, b);
}

export type TaskSortKey = "due" | "priority" | "status" | "title";

const COMPARATORS: Record<
  TaskSortKey,
  (a: SortableTaskLike, b: SortableTaskLike) => number
> = {
  due: compareByDue,
  priority: compareByPriority,
  status: compareByStatus,
  title: (a, b) => compareTitle(a, b) || compareByDue(a, b),
};

/** Nova sortirana lista; ulaz se ne menja, jednaki ostaju u ulaznom redu. */
export function sortTasks<T extends SortableTaskLike>(
  items: ReadonlyArray<T>,
  key: TaskSortKey,
): T[] {
  const compare = COMPARATORS[key];
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => compare(a.item, b.item) || a.index - b.index)
    .map(({ item }) => item);
}

// --- Grupisanje -------------------------------------------------------------

export type DueBucket =
  | "overdue"
  | "today"
  | "tomorrow"
  | "week"
  | "later"
  | "none";

export const DUE_BUCKET_ORDER: ReadonlyArray<DueBucket> = [
  "overdue",
  "today",
  "tomorrow",
  "week",
  "later",
  "none",
];

export const DUE_BUCKET_LABELS: Record<DueBucket, string> = {
  overdue: "Prekoračeno",
  today: "Danas",
  tomorrow: "Sutra",
  week: "Narednih 7 dana",
  later: "Kasnije",
  none: "Bez roka",
};

/** Kanta roka po kalendarskim danima; „nedelja" je 2–7 dana unapred. */
export function dueBucket(
  dueMs: number | null,
  nowMs: number,
  zone?: string,
): DueBucket {
  if (dueMs === null) return "none";
  const diff = dayDiff(dueMs, nowMs, zone);
  if (diff < 0) return "overdue";
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff <= 7) return "week";
  return "later";
}

export type TaskGroupBy = "startup" | "due" | "status" | "priority";

export type GroupableTask = SortableTaskLike & {
  /** `null` = lični zadatak. */
  workspaceId: string | null;
  startupName: string | null;
};

export type TaskGroup<T> = { key: string; title: string; items: T[] };

/** Ključ grupe za lične zadatke kod grupisanja po startupu. */
export const PERSONAL_GROUP_KEY = "licno";

const STATUS_GROUP_ORDER: ReadonlyArray<TaskStatusKey> = [
  "in_progress",
  "next",
  "open",
  "blocked",
  "backlog",
  "done",
];

const PRIORITY_GROUP_ORDER: ReadonlyArray<TaskPriorityKey | "none"> = [
  "urgent",
  "high",
  "medium",
  "low",
  "none",
];

/**
 * Grupe u stalnom redosledu, bez praznih; unutar grupe `compareByDue`.
 * Po startupu: „Lično" prvo, pa startupi po `startupOrder` (id-jevi), a oni
 * kojih nema u spisku abecedno po imenu.
 */
export function groupTasks<T extends GroupableTask>(
  items: ReadonlyArray<T>,
  by: TaskGroupBy,
  nowMs: number,
  options: { zone?: string; startupOrder?: ReadonlyArray<string> } = {},
): TaskGroup<T>[] {
  const buckets = new Map<string, TaskGroup<T>>();
  const add = (key: string, title: string, item: T) => {
    const group = buckets.get(key) ?? { key, title, items: [] };
    group.items.push(item);
    buckets.set(key, group);
  };

  for (const item of items) {
    if (by === "startup") {
      if (item.workspaceId === null) add(PERSONAL_GROUP_KEY, "Lično", item);
      else add(item.workspaceId, item.startupName ?? "Projekat", item);
    } else if (by === "due") {
      const bucket = dueBucket(item.dueDate, nowMs, options.zone);
      add(bucket, DUE_BUCKET_LABELS[bucket], item);
    } else if (by === "status") {
      add(item.status, STATUS_LABELS[item.status], item);
    } else {
      const key = item.priority ?? "none";
      add(key, item.priority ? PRIORITY_LABELS[item.priority] : "Bez prioriteta", item);
    }
  }

  let order: string[];
  if (by === "startup") {
    const known = options.startupOrder ?? [];
    const rest = [...buckets.values()]
      .filter((group) => group.key !== PERSONAL_GROUP_KEY && !known.includes(group.key))
      .sort((a, b) => compareTitle({ title: a.title }, { title: b.title }))
      .map((group) => group.key);
    order = [PERSONAL_GROUP_KEY, ...known, ...rest];
  } else if (by === "due") {
    order = [...DUE_BUCKET_ORDER];
  } else if (by === "status") {
    order = [...STATUS_GROUP_ORDER];
  } else {
    order = [...PRIORITY_GROUP_ORDER];
  }

  const result: TaskGroup<T>[] = [];
  for (const key of order) {
    const group = buckets.get(key);
    if (group === undefined) continue;
    result.push({ ...group, items: sortTasks(group.items, "due") });
  }
  return result;
}
