// Preneto iz Devotion packages/shared/src/task-row.ts (main @ c05c40f), SPAJANJE S02.
/**
 * Zajednički model reda zadatka (plan K07 §1) — Moj dan, Moji zadaci, panel i
 * liste u startupu, isto na webu i telefonu (E4). ČISTO: bez React-a, bez
 * Convex tipova. Ovde su i pravila „koja radnja se zove za koju vrstu stavke"
 * i dozvole (ogledalo `tasks.updateMetadata`), da oba klijenta ne pogađaju.
 */
import type { MyDayRow } from "./my-day";
import { myDayRefKey } from "./my-day";
import type { TaskPriorityKey, TaskStatusKey } from "./task-sort";

// --- Dozvole ----------------------------------------------------------------

export type Perm = { allowed: boolean; reason: string | null };

export type TaskPermissions = {
  status: Perm;
  priority: Perm;
  due: Perm;
  instructions: Perm;
  checkpoints: Perm;
  /** `selfOnly`: sme samo sebe da doda ili skine. */
  assignees: Perm & { selfOnly: boolean };
  /** Plan dana je lični — uvek dozvoljen. */
  plan: Perm;
};

const LOCKED_REASON =
  "Zadatak je zaključan. Menja ga autor ili vlasnik projekta.";
const LOCKED_STATUS_REASON =
  "Zadatak je zaključan. Status menja izvršilac, autor ili vlasnik projekta.";

/**
 * Razlozi za onemogućen čip (plan K07 §3, E15). PROSTOR P1: radnja je
 * zabranjena samo na zaključanom zadatku, pa svi razlozi govore o tome.
 */
export const PERMISSION_REASONS = {
  locked: LOCKED_REASON,
  lockedStatus: LOCKED_STATUS_REASON,
  status: LOCKED_STATUS_REASON,
  priority: LOCKED_REASON,
  due: LOCKED_REASON,
  instructions: LOCKED_REASON,
  checkpoints: LOCKED_REASON,
  assignees: "Zadatak je zaključan. Sebe možeš da dodaš ili skineš.",
} as const;

const ALLOWED: Perm = { allowed: true, reason: null };
const denied = (reason: string): Perm => ({ allowed: false, reason });

/**
 * Dozvole po pravilima `tasks.updateMetadata` (PROSTOR P1): svaki član menja
 * sve osobine zadatka; na zaključanom zadatku (`lockedForViewer`) izvršilac
 * menja samo status, ostali ništa osim svog učešća. Lični zadatak je ceo
 * vlasnikov.
 */
export function taskPermissions(input: {
  kind: "task" | "personal";
  isCreator: boolean;
  isAssignee: boolean;
  /** Zaključan, a gledalac nije autor, vlasnik startupa ni admin; odsutno = ne. */
  lockedForViewer?: boolean;
}): TaskPermissions {
  if (
    input.kind === "personal" ||
    input.isCreator ||
    input.lockedForViewer !== true
  ) {
    return {
      status: ALLOWED,
      priority: ALLOWED,
      due: ALLOWED,
      instructions: ALLOWED,
      checkpoints: ALLOWED,
      assignees: { ...ALLOWED, selfOnly: false },
      plan: ALLOWED,
    };
  }
  return {
    status: input.isAssignee ? ALLOWED : denied(PERMISSION_REASONS.lockedStatus),
    priority: denied(PERMISSION_REASONS.priority),
    due: denied(PERMISSION_REASONS.due),
    instructions: denied(PERMISSION_REASONS.instructions),
    checkpoints: denied(PERMISSION_REASONS.checkpoints),
    assignees: { allowed: true, reason: PERMISSION_REASONS.assignees, selfOnly: true },
    plan: ALLOWED,
  };
}

// --- Model reda -------------------------------------------------------------

export type WorkspaceMini = { _id: string; name: string; logoUrl: string | null };

export type TaskRowModel = {
  /** `refKey`: "task:<id>" | "personal:<id>". */
  key: string;
  kind: "task" | "personal";
  id: string;
  title: string;
  status: TaskStatusKey;
  priority: TaskPriorityKey | null;
  /** Lokalno podne dana roka. */
  dueDate: number | null;
  /** `null` = „Lično". */
  workspace: WorkspaceMini | null;
  areaLabel: string | null;
  planned: boolean;
  planEntryId: string | null;
  done: boolean;
  checkpoints: { done: number; total: number } | null;
  permissions: TaskPermissions;
  /** Da li sam izvršilac (startup zadatak); `undefined` = ne znamo. */
  isAssignee?: boolean;
  /** Za stabilan redosled pri grupisanju (Moji zadaci); opciono. */
  createdAt?: number;
};

/** Red iz grupisanja Moj dan (`groupMyDay`); startup sa logom iz `overview.startups`. */
export function rowFromMyDay(
  row: MyDayRow,
  workspaces: ReadonlyMap<string, WorkspaceMini>,
): TaskRowModel {
  const workspace =
    row.workspaceId === null
      ? null
      : (workspaces.get(row.workspaceId) ?? {
          _id: row.workspaceId,
          name: row.startupName ?? "Projekat",
          logoUrl: null,
        });
  return {
    key: row.key,
    kind: row.kind,
    id: row.id,
    title: row.title,
    status: row.status,
    priority: row.priority,
    dueDate: row.dueDate,
    workspace,
    areaLabel: row.areaLabel,
    planned: row.planned,
    planEntryId: row.planEntryId,
    done: row.status === "done",
    checkpoints: null,
    permissions: taskPermissions(row),
    ...(row.kind === "task" ? { isAssignee: row.isAssignee } : {}),
  };
}

/** Strukturni oblik stavke `tasks.listEverywhere` / `myDay.overview.tasks`. */
export type TaskItemLike = {
  _id: string;
  title: string;
  taskStatus: Exclude<TaskStatusKey, "open"> | null;
  taskPriority: TaskPriorityKey | null;
  dueDate: number | null;
  checkpointTotal: number;
  checkpointCompleted: number;
  isCreator: boolean;
  isAssignee: boolean;
  /** PROSTOR P1 (server `taskItemValidator`); odsutno = otključan. */
  lockedForViewer?: boolean;
  workspace: WorkspaceMini;
  area: { label: string } | null;
  createdAt?: number;
};

/** Strukturni oblik stavke `personalTasks.list`. */
export type PersonalTaskLike = {
  _id: string;
  title: string;
  status: "open" | "done";
  priority: TaskPriorityKey | null;
  dueDate: number | null;
  createdAt?: number;
};

/** `plannedKeys`: refKey → id stavke plana za danas. */
export function rowFromTaskItem(
  item: TaskItemLike,
  plannedKeys: ReadonlyMap<string, string>,
): TaskRowModel {
  const key = myDayRefKey("task", item._id);
  const status = item.taskStatus ?? "backlog";
  const entryId = plannedKeys.get(key) ?? null;
  return {
    key,
    kind: "task",
    id: item._id,
    title: item.title,
    status,
    priority: item.taskPriority,
    dueDate: item.dueDate,
    workspace: item.workspace,
    areaLabel: item.area?.label ?? null,
    planned: entryId !== null,
    planEntryId: entryId,
    done: status === "done",
    checkpoints:
      item.checkpointTotal > 0
        ? { done: item.checkpointCompleted, total: item.checkpointTotal }
        : null,
    permissions: taskPermissions({
      kind: "task",
      isCreator: item.isCreator,
      isAssignee: item.isAssignee,
      lockedForViewer: item.lockedForViewer,
    }),
    isAssignee: item.isAssignee,
    ...(item.createdAt === undefined ? {} : { createdAt: item.createdAt }),
  };
}

export function rowFromPersonal(
  item: PersonalTaskLike,
  plannedKeys: ReadonlyMap<string, string>,
): TaskRowModel {
  const key = myDayRefKey("personal", item._id);
  const entryId = plannedKeys.get(key) ?? null;
  return {
    key,
    kind: "personal",
    id: item._id,
    title: item.title,
    status: item.status,
    priority: item.priority,
    dueDate: item.dueDate,
    workspace: null,
    areaLabel: null,
    planned: entryId !== null,
    planEntryId: entryId,
    done: item.status === "done",
    checkpoints: null,
    permissions: taskPermissions({ kind: "personal", isCreator: true, isAssignee: true }),
    ...(item.createdAt === undefined ? {} : { createdAt: item.createdAt }),
  };
}

// --- Koja radnja se zove ----------------------------------------------------

type StartupStatus = Exclude<TaskStatusKey, "open">;

/** Opis poziva koji klijent šalje — ime funkcije je ugovor, ne string za UI. */
export type RowCall =
  | { fn: "personalTasks.setStatus"; personalTaskId: string; status: "open" | "done" }
  | {
      fn: "personalTasks.update";
      personalTaskId: string;
      dueDate?: number | null;
      priority?: TaskPriorityKey | null;
    }
  | {
      fn: "tasks.updateMetadata";
      pageId: string;
      status?: StartupStatus;
      dueDate?: number | null;
      priority?: TaskPriorityKey;
    }
  | {
      fn: "myDay.plan";
      ref: { kind: "task"; taskPageId: string } | { kind: "personal"; personalTaskId: string };
    }
  | { fn: "myDay.unplan"; entryId: string }
  | { fn: "denied"; reason: string };

/** Startup zadatak u startupu uvek ima prioritet (server ne prima `null`). */
export const PRIORITY_REQUIRED_REASON = "Zadatak u projektu uvek ima prioritet.";

/**
 * Status na koji se startup zadatak vraća posle „Poništi": prethodni (ako ga
 * znamo), inače „Sledeće" (plan K07 §1).
 */
export function reopenStatus(previous: TaskStatusKey | null | undefined): StartupStatus {
  if (previous === null || previous === undefined || previous === "done" || previous === "open") {
    return "next";
  }
  return previous;
}

/** Završi (`done = true`) ili vrati u otvoreno. */
export function completionCall(
  row: Pick<TaskRowModel, "kind" | "id" | "permissions">,
  done: boolean,
  previousStatus?: TaskStatusKey | null,
): RowCall {
  if (!row.permissions.status.allowed) {
    return { fn: "denied", reason: row.permissions.status.reason ?? PERMISSION_REASONS.status };
  }
  if (row.kind === "personal") {
    return { fn: "personalTasks.setStatus", personalTaskId: row.id, status: done ? "done" : "open" };
  }
  return {
    fn: "tasks.updateMetadata",
    pageId: row.id,
    status: done ? "done" : reopenStatus(previousStatus),
  };
}

/** Novi rok (`null` briše rok). */
export function dueCall(
  row: Pick<TaskRowModel, "kind" | "id" | "permissions">,
  dueDate: number | null,
): RowCall {
  if (!row.permissions.due.allowed) {
    return { fn: "denied", reason: row.permissions.due.reason ?? PERMISSION_REASONS.due };
  }
  return row.kind === "personal"
    ? { fn: "personalTasks.update", personalTaskId: row.id, dueDate }
    : { fn: "tasks.updateMetadata", pageId: row.id, dueDate };
}

/** Novi prioritet (`null` = bez prioriteta, samo za lični). */
export function priorityCall(
  row: Pick<TaskRowModel, "kind" | "id" | "permissions">,
  priority: TaskPriorityKey | null,
): RowCall {
  if (!row.permissions.priority.allowed) {
    return {
      fn: "denied",
      reason: row.permissions.priority.reason ?? PERMISSION_REASONS.priority,
    };
  }
  if (row.kind === "personal") {
    return { fn: "personalTasks.update", personalTaskId: row.id, priority };
  }
  if (priority === null) return { fn: "denied", reason: PRIORITY_REQUIRED_REASON };
  return { fn: "tasks.updateMetadata", pageId: row.id, priority };
}

/** Dodaj u Moj dan ili ukloni iz njega. */
export function planCall(
  row: Pick<TaskRowModel, "kind" | "id" | "planned" | "planEntryId">,
): RowCall {
  if (row.planned && row.planEntryId !== null) {
    return { fn: "myDay.unplan", entryId: row.planEntryId };
  }
  return {
    fn: "myDay.plan",
    ref:
      row.kind === "task"
        ? { kind: "task", taskPageId: row.id }
        : { kind: "personal", personalTaskId: row.id },
  };
}

// --- Redosled u planu -------------------------------------------------------

/**
 * Pomeri stavku plana za jedno mesto (`-1` gore, `1` dole). Vraća ceo novi
 * redosled id-jeva za `myDay.reorder`, ili `null` kad pomeranje nije moguće.
 */
export function moveInPlan(
  entryIds: ReadonlyArray<string>,
  entryId: string,
  direction: -1 | 1,
): string[] | null {
  const index = entryIds.indexOf(entryId);
  const target = index + direction;
  if (index === -1 || target < 0 || target >= entryIds.length) return null;
  const next = [...entryIds];
  next[index] = next[target];
  next[target] = entryId;
  return next;
}

// --- Zadržavanje reda posle kvačice (E7) ------------------------------------

export type CompletionHold<Row> = {
  /** Sekcija u kojoj je red bio kad je kvačica kliknuta. */
  section: string;
  /** Indeks u toj sekciji. */
  index: number;
  row: Row;
  done: boolean;
};

/**
 * Posle klika na kvačicu red ostaje na svom mestu, kao završen, dok se spring
 * kvačice ne smiri; tek onda ga podaci sa servera presele. `pending` drži
 * željeno stanje dok server ne potvrdi (upit se osveži pre nego što mutacija
 * vrati). Vraća iste objekte kad nema ničega da se primeni.
 */
export function applyCompletionHolds<
  Row extends { key: string; done: boolean },
  Section extends { id: string; rows: Row[] },
>(
  sections: ReadonlyArray<Section>,
  holds: ReadonlyMap<string, CompletionHold<Row>>,
  pending: ReadonlyMap<string, boolean>,
): Section[] {
  if (holds.size === 0 && pending.size === 0) return [...sections];
  const next = sections.map((section) => ({
    ...section,
    rows: section.rows
      .filter((row) => !holds.has(row.key))
      .map((row) =>
        pending.has(row.key) && pending.get(row.key) !== row.done
          ? { ...row, done: pending.get(row.key) === true }
          : row,
      ),
  }));
  const byId = new Map(next.map((section) => [section.id, section] as const));
  const ordered = [...holds.values()].sort((a, b) => a.index - b.index);
  for (const hold of ordered) {
    const target = byId.get(hold.section);
    if (!target) continue;
    const index = Math.min(Math.max(hold.index, 0), target.rows.length);
    target.rows.splice(index, 0, { ...hold.row, done: hold.done });
  }
  return next;
}
