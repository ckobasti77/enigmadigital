// Preneto iz Devotion packages/shared/src/my-tasks.ts (main @ c05c40f), SPAJANJE S02.
/**
 * Moji zadaci (plan K07 §1.3) — od odgovora `tasks.listEverywhere` +
 * `personalTasks.list` + plana dana do grupa za prikaz. ČISTO: bez React-a i
 * bez Convex tipova. K11 je ovo držao u web `my-tasks-model.ts`; K13 ga
 * preseljava ovamo da ga telefon uvozi (E4) — web fajl izvozi ista imena.
 */
import { applyTaskFilters, groupTaskRows, type TaskFilters } from "./task-filters";
import {
  applyCompletionHolds,
  rowFromPersonal,
  rowFromTaskItem,
  type CompletionHold,
  type PersonalTaskLike,
  type TaskItemLike,
  type TaskRowModel,
} from "./task-row";
import type { TaskGroupBy } from "./task-sort";

/** Grupa prikazuje do 100 redova, ostalo kroz „Prikaži još N" (E12). */
export const TASKS_GROUP_PAGE = 100;

/** Upiti: startup zadaci do 200, lični do 300 (plan K07 §1.3). */
export const TASKS_EVERYWHERE_LIMIT = 200;
export const PERSONAL_TASKS_LIMIT = 300;

export type MyTasksSource = {
  tasks: ReadonlyArray<TaskItemLike>;
  personal: ReadonlyArray<PersonalTaskLike>;
  /** Stavke plana za danas (refKey → id stavke). */
  entries: ReadonlyArray<{ _id: string; refKey: string }>;
  capped: boolean;
};

export type MyTasksGroup = { key: string; title: string; rows: TaskRowModel[] };

export type MyTasksModel = {
  groups: MyTasksGroup[];
  /** Otvoreni zadaci (za podnaslov: svi otvoreni, pre filtera). */
  openCount: number;
  /** Redova posle filtera (0 uz postojeće zadatke = „bez rezultata"). */
  visibleCount: number;
  /** Ima li uopšte zadataka (pre filtera) — razlikuje prazno od „bez rezultata". */
  hasAny: boolean;
  /** Koliko je zadataka učitano (pre filtera) — broj u napomeni o odsečenju. */
  loadedCount: number;
  capped: boolean;
};

export function plannedKeysOf(entries: ReadonlyArray<{ _id: string; refKey: string }>): Map<string, string> {
  return new Map(entries.map((entry) => [entry.refKey, entry._id] as const));
}

/** Svi redovi (startup + lični) kao zajednički model reda. */
export function buildTaskRows(source: MyTasksSource): TaskRowModel[] {
  const planned = plannedKeysOf(source.entries);
  return [
    ...source.tasks.map((item) => rowFromTaskItem(item, planned)),
    ...source.personal.map((item) => rowFromPersonal(item, planned)),
  ];
}

export type TaskRowHold = CompletionHold<TaskRowModel>;

export function taskHoldSection(groupBy: TaskGroupBy, groupKey: string): string {
  return `${groupBy}:${groupKey}`;
}

/**
 * Model prikaza: filteri → grupe → zadržani redovi (E7: posle kvačice red
 * ostaje na mestu dok se kvačica ne smiri, pa ga filteri presele ili sklone).
 */
export function buildMyTasks(
  rows: ReadonlyArray<TaskRowModel>,
  filters: TaskFilters,
  groupBy: TaskGroupBy,
  now: number,
  options: {
    zone?: string;
    startupOrder?: ReadonlyArray<string>;
    capped?: boolean;
    holds?: ReadonlyMap<string, TaskRowHold>;
    pending?: ReadonlyMap<string, boolean>;
  } = {},
): MyTasksModel {
  const holds = new Map(
    [...(options.holds ?? new Map<string, TaskRowHold>())].filter(([, hold]) => hold.section.startsWith(`${groupBy}:`)),
  );
  // Zadržan red ulazi u grupisanje kakav je bio pri kliku, da njegova grupa
  // postoji i kad bi je filter (npr. završeni sakriveni) već ispraznio.
  const filtered = [
    ...applyTaskFilters(
      rows.filter((row) => !holds.has(row.key)),
      filters,
      now,
      options.zone,
    ),
    ...[...holds.values()].map((hold) => hold.row),
  ];
  const grouped = groupTaskRows(filtered, groupBy, now, { zone: options.zone, startupOrder: options.startupOrder });
  const sections = applyCompletionHolds(
    grouped.map((group) => ({ id: taskHoldSection(groupBy, group.key), title: group.title, rows: group.items })),
    holds,
    options.pending ?? new Map(),
  );
  const prefix = `${groupBy}:`.length;
  const groups = sections
    .map((section) => ({ key: section.id.slice(prefix), title: section.title, rows: section.rows }))
    .filter((group) => group.rows.length > 0);
  return {
    groups,
    openCount: rows.filter((row) => !row.done).length,
    visibleCount: groups.reduce((sum, group) => sum + group.rows.length, 0),
    hasAny: rows.length > 0,
    loadedCount: rows.length,
    capped: options.capped ?? false,
  };
}

/** Gde je red sada (za zadržavanje na istom mestu). */
export function locateTaskRow(
  model: MyTasksModel,
  groupBy: TaskGroupBy,
  key: string,
): { section: string; index: number } | null {
  for (const group of model.groups) {
    const index = group.rows.findIndex((row) => row.key === key);
    if (index !== -1) return { section: taskHoldSection(groupBy, group.key), index };
  }
  return null;
}

export function findRow(model: MyTasksModel | null, key: string): TaskRowModel | undefined {
  if (!model) return undefined;
  for (const group of model.groups) {
    const row = group.rows.find((candidate) => candidate.key === key);
    if (row) return row;
  }
  return undefined;
}

/** Ključ ulaza liste: filteri i grupisanje, ali NE pretraga (kucanje menja listu bez animacije). */
export function enterKey(status: string, filters: TaskFilters, groupBy: TaskGroupBy): string {
  return [
    status,
    groupBy,
    filters.showDone ? "done" : "open",
    filters.workspaceIds.join(","),
    filters.statuses.join(","),
    filters.priorities.join(","),
    filters.due.join(","),
  ].join("|");
}

// --- Optimistička slika (red odmah doputuje na novo mesto) -------------------

export type TaskItemPatch = {
  taskStatus?: TaskItemLike["taskStatus"];
  taskPriority?: TaskItemLike["taskPriority"];
  dueDate?: number | null;
};

/** Izmena jednog startup zadatka u odgovoru `tasks.listEverywhere`. */
export function patchTaskItems<T extends { items: ReadonlyArray<TaskItemLike> }>(
  value: T,
  pageId: string,
  patch: TaskItemPatch,
): T {
  if (!value.items.some((item) => item._id === pageId)) return value;
  return {
    ...value,
    items: value.items.map((item) =>
      item._id === pageId
        ? {
            ...item,
            ...(patch.taskStatus === undefined ? {} : { taskStatus: patch.taskStatus }),
            ...(patch.taskPriority === undefined ? {} : { taskPriority: patch.taskPriority }),
            ...(patch.dueDate === undefined ? {} : { dueDate: patch.dueDate }),
          }
        : item,
    ),
  };
}

export type PersonalPatch = {
  status?: "open" | "done";
  priority?: PersonalTaskLike["priority"];
  dueDate?: number | null;
};

/** Izmena jednog ličnog zadatka u odgovoru `personalTasks.list`. */
export function patchPersonalItems<T extends { items: ReadonlyArray<PersonalTaskLike> }>(
  value: T,
  personalTaskId: string,
  patch: PersonalPatch,
): T {
  if (!value.items.some((item) => item._id === personalTaskId)) return value;
  return {
    ...value,
    items: value.items.map((item) =>
      item._id === personalTaskId
        ? {
            ...item,
            ...(patch.status === undefined ? {} : { status: patch.status }),
            ...(patch.priority === undefined ? {} : { priority: patch.priority }),
            ...(patch.dueDate === undefined ? {} : { dueDate: patch.dueDate }),
          }
        : item,
    ),
  };
}
