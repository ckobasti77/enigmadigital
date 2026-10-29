// Preneto iz Devotion packages/shared/src/startup-tasks.ts (main @ c05c40f), SPAJANJE S02.
/**
 * Zadaci u startupu (K17, plan K07 §2) — Komandni centar, Moji zadaci u
 * startupu i tabla dobijaju ISTI red kao lični nivo (`TaskRowModel`), pa
 * dozvole, radnje i zadržavanje posle kvačice rade isto. ČISTO: bez React-a i
 * bez Convex tipova; telefon (K18) uvozi isto (E4).
 */
import { myDayRefKey } from "./my-day";
import {
  applyCompletionHolds,
  taskPermissions,
  type CompletionHold,
  type WorkspaceMini,
  type TaskRowModel,
} from "./task-row";
import type { TaskPriorityKey, TaskStatusKey } from "./task-sort";

export type StartupTaskStatus = Exclude<TaskStatusKey, "open">;

/** Statusi table, redom kolona (isti redosled kao do sada na webu). */
export const STARTUP_TASK_STATUSES: ReadonlyArray<StartupTaskStatus> = [
  "backlog",
  "next",
  "in_progress",
  "blocked",
  "done",
];

/** Strukturni oblik `pageSummaryValidator` koji red koristi (`tasks.commandCenter`, `tasks.listForStartup`). */
export type StartupTaskLike = {
  _id: string;
  areaId: string;
  title: string;
  taskStatus: StartupTaskStatus | null;
  taskPriority: TaskPriorityKey | null;
  dueDate: number | null;
  createdByProfileId: string;
  /** PROSTOR P1: `pageSummaryValidator.lockedAt`; odsutno = otključan. */
  lockedAt?: number | null;
  checkpointTotal?: number;
  checkpointCompleted?: number;
  createdAt?: number;
};

export type StartupRowContext = {
  profileId: string;
  workspace: WorkspaceMini;
  /** Oblast po id-ju (`startup.areas`); nepoznata oblast = `null`. */
  areaLabels: ReadonlyMap<string, string>;
  /** Izvršioci zadatka (`taskAssignees.listForTasks`); `null` = ne znamo još. */
  assigneeIds: ReadonlyArray<string> | null;
  /**
   * Lista je već filtrirana na mene (Moji zadaci u startupu): izvršilac sam
   * i kad spisak izvršilaca nije učitan.
   */
  assumeAssignee?: boolean;
  /** Plan za danas: refKey → id stavke plana. */
  plannedKeys: ReadonlyMap<string, string>;
  /** Vlasnik startupa ili admin — menja i zaključane zadatke (P1). */
  isManager?: boolean;
};

/**
 * Red zadatka u startupu. Dozvole su ogledalo `tasks.updateMetadata` (PROSTOR
 * P1): svaki član menja sve; zaključan zadatak menjaju autor i menadžer, a
 * izvršilac još i status (razlozi E15). Dok se izvršioci ne učitaju, ne-kreator
 * nije izvršilac — server je ionako izvor istine.
 */
export function rowFromStartupTask(task: StartupTaskLike, context: StartupRowContext): TaskRowModel {
  const key = myDayRefKey("task", task._id);
  const status = task.taskStatus ?? "backlog";
  const entryId = context.plannedKeys.get(key) ?? null;
  const isCreator = task.createdByProfileId === context.profileId;
  const isAssignee =
    context.assumeAssignee === true || (context.assigneeIds ?? []).includes(context.profileId);
  const lockedForViewer =
    task.lockedAt !== undefined &&
    task.lockedAt !== null &&
    !isCreator &&
    context.isManager !== true;
  const total = task.checkpointTotal ?? 0;
  return {
    key,
    kind: "task",
    id: task._id,
    title: task.title,
    status,
    // Zadatak u startupu uvek ima prioritet; stari zapis bez njega je „Srednji" (kao do sada).
    priority: task.taskPriority ?? "medium",
    dueDate: task.dueDate,
    workspace: context.workspace,
    areaLabel: context.areaLabels.get(task.areaId) ?? null,
    planned: entryId !== null,
    planEntryId: entryId,
    done: status === "done",
    checkpoints: total > 0 ? { done: task.checkpointCompleted ?? 0, total } : null,
    permissions: taskPermissions({ kind: "task", isCreator, isAssignee, lockedForViewer }),
    isAssignee,
    ...(task.createdAt === undefined ? {} : { createdAt: task.createdAt }),
  };
}

/**
 * „Priključi se" u meniju reda: svaki član sme sebe da doda (tasks.ts), pa se
 * nudi onome ko još nije izvršilac — i na zaključanom zadatku.
 */
export function canJoinTask(
  row: Pick<TaskRowModel, "kind" | "permissions" | "isAssignee">,
): boolean {
  return (
    row.kind === "task" && row.permissions.assignees.allowed && row.isAssignee === false
  );
}

export type StartupTaskPatch = {
  taskStatus?: StartupTaskStatus;
  taskPriority?: TaskPriorityKey;
  dueDate?: number | null;
};

/**
 * Optimistička slika (`tasks.updateMetadata`): isti niz kad zadatka nema, da
 * se pretplata ne „promeni" bez razloga.
 */
export function patchStartupTasks<T extends { _id: string }>(
  items: ReadonlyArray<T>,
  pageId: string,
  patch: StartupTaskPatch,
): ReadonlyArray<T> {
  if (!items.some((item) => item._id === pageId)) return items;
  return items.map((item) =>
    item._id === pageId
      ? {
          ...item,
          ...(patch.taskStatus === undefined ? {} : { taskStatus: patch.taskStatus }),
          ...(patch.taskPriority === undefined ? {} : { taskPriority: patch.taskPriority }),
          ...(patch.dueDate === undefined ? {} : { dueDate: patch.dueDate }),
        }
      : item,
  );
}

// --- Liste sa zadržavanjem reda (E7) ----------------------------------------

export type StartupTaskHold = CompletionHold<TaskRowModel>;

export type StartupTaskSection<Id extends string = string> = { id: Id; rows: TaskRowModel[] };

/** Ključ sekcije zadržavanja: `<lista>:<sekcija>` (npr. `board:done`). */
export function startupHoldSection(list: string, section: string): string {
  return `${list}:${section}`;
}

/**
 * Primeni zadržane redove i „čeka potvrdu" na sekcije jedne liste. Zadržan
 * red ostaje na mestu gde je kliknut dok se kvačica ne smiri, pa ga podaci
 * presele (u „Gotovo", van Komandnog centra…).
 */
export function applyStartupHolds<Id extends string>(
  list: string,
  sections: ReadonlyArray<StartupTaskSection<Id>>,
  holds: ReadonlyMap<string, StartupTaskHold>,
  pending: ReadonlyMap<string, boolean>,
): StartupTaskSection<Id>[] {
  const prefix = `${list}:`;
  const own = new Map([...holds].filter(([, hold]) => hold.section.startsWith(prefix)));
  return applyCompletionHolds(
    sections.map((section) => ({ id: startupHoldSection(list, section.id), rows: section.rows })),
    own,
    pending,
  ).map((section) => ({ id: section.id.slice(prefix.length) as Id, rows: section.rows }));
}

/** Gde je red (sekcija zadržavanja + indeks), ili `null`. */
export function locateStartupRow(
  list: string,
  sections: ReadonlyArray<StartupTaskSection>,
  key: string,
): { section: string; index: number } | null {
  for (const section of sections) {
    const index = section.rows.findIndex((row) => row.key === key);
    if (index !== -1) return { section: startupHoldSection(list, section.id), index };
  }
  return null;
}

export function findStartupRow(sections: ReadonlyArray<StartupTaskSection>, key: string): TaskRowModel | undefined {
  for (const section of sections) {
    const row = section.rows.find((candidate) => candidate.key === key);
    if (row) return row;
  }
  return undefined;
}

/** Tabla: kolona po statusu, redosled unutar kolone kao u ulazu (server). */
export function boardColumns(rows: ReadonlyArray<TaskRowModel>): StartupTaskSection<StartupTaskStatus>[] {
  return STARTUP_TASK_STATUSES.map((status) => ({
    id: status,
    rows: rows.filter((row) => row.status === status),
  }));
}
