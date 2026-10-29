// Preneto iz Devotion packages/shared/src/startup-tasks.test.ts (main @ c05c40f), SPAJANJE S02.
import { describe, expect, test } from "vitest";

import {
  applyStartupHolds,
  boardColumns,
  canJoinTask,
  findStartupRow,
  locateStartupRow,
  patchStartupTasks,
  rowFromStartupTask,
  STARTUP_TASK_STATUSES,
  startupHoldSection,
  type StartupRowContext,
  type StartupTaskHold,
  type StartupTaskLike,
} from "./startup-tasks";
import { completionCall, dueCall, PERMISSION_REASONS, priorityCall } from "./task-row";

const STARTUP = { _id: "s1", name: "Cluck Rush", logoUrl: null };

const task = (overrides: Partial<StartupTaskLike> = {}): StartupTaskLike => ({
  _id: "t1",
  areaId: "a-mkt",
  title: "Landing za Q4",
  taskStatus: "next",
  taskPriority: "high",
  dueDate: null,
  createdByProfileId: "ana",
  ...overrides,
});

const context = (overrides: Partial<StartupRowContext> = {}): StartupRowContext => ({
  profileId: "me",
  workspace: STARTUP,
  areaLabels: new Map([["a-mkt", "Marketing"]]),
  assigneeIds: [],
  plannedKeys: new Map(),
  ...overrides,
});

describe("red zadatka u startupu", () => {
  test("osnovna polja, ključ, oblast, plan i koraci", () => {
    const row = rowFromStartupTask(
      task({ checkpointTotal: 5, checkpointCompleted: 2, createdAt: 10 }),
      context({ plannedKeys: new Map([["task:t1", "e1"]]) }),
    );
    expect(row).toMatchObject({
      key: "task:t1",
      kind: "task",
      id: "t1",
      title: "Landing za Q4",
      status: "next",
      priority: "high",
      workspace: STARTUP,
      areaLabel: "Marketing",
      planned: true,
      planEntryId: "e1",
      done: false,
      checkpoints: { done: 2, total: 5 },
      createdAt: 10,
    });
  });

  test("bez statusa = Neplanirano, bez prioriteta = Srednji, nepoznata oblast = null, bez koraka = null", () => {
    const row = rowFromStartupTask(
      task({ taskStatus: null, taskPriority: null, areaId: "a-x", checkpointTotal: 0 }),
      context(),
    );
    expect(row.status).toBe("backlog");
    expect(row.priority).toBe("medium");
    expect(row.areaLabel).toBeNull();
    expect(row.checkpoints).toBeNull();
    expect(row).not.toHaveProperty("createdAt");
  });

  test("firma iz Leadova prelazi u red; zadatak bez firme je nema (SPAJANJE S23)", () => {
    expect(rowFromStartupTask(task({ leadCompanyId: "lc1" }), context()).leadCompanyId).toBe("lc1");
    expect(rowFromStartupTask(task(), context())).not.toHaveProperty("leadCompanyId");
  });

  test("završen zadatak je done", () => {
    expect(rowFromStartupTask(task({ taskStatus: "done" }), context()).done).toBe(true);
  });

  // PROSTOR P1 (namerna promena pravila): ograničenja važe samo za zaključan
  // zadatak; otključan menja svaki član, a „Priključi se" se nudi svakom ko
  // još nije izvršilac.
  test("kreator sme sve, i na zaključanom", () => {
    const row = rowFromStartupTask(task({ createdByProfileId: "me", lockedAt: 1 }), context());
    expect(Object.values(row.permissions).every((perm) => perm.allowed)).toBe(true);
    expect(row.permissions.assignees.selfOnly).toBe(false);
    expect(canJoinTask(row)).toBe(true);
  });

  test("nezaključan zadatak: svaki član sme sve, menadžer i zaključan", () => {
    const member = rowFromStartupTask(task(), context({ assigneeIds: ["ana"] }));
    expect(Object.values(member.permissions).every((perm) => perm.allowed)).toBe(true);
    const manager = rowFromStartupTask(
      task({ lockedAt: 1 }),
      context({ assigneeIds: ["ana"], isManager: true }),
    );
    expect(Object.values(manager.permissions).every((perm) => perm.allowed)).toBe(true);
  });

  test("zaključan: izvršilac menja samo status; rok i prioritet su zaključani sa razlogom", () => {
    const row = rowFromStartupTask(task({ lockedAt: 1 }), context({ assigneeIds: ["ana", "me"] }));
    expect(row.permissions.status.allowed).toBe(true);
    expect(row.permissions.due).toEqual({ allowed: false, reason: PERMISSION_REASONS.due });
    expect(row.permissions.priority).toEqual({ allowed: false, reason: PERMISSION_REASONS.priority });
    expect(completionCall(row, true)).toEqual({ fn: "tasks.updateMetadata", pageId: "t1", status: "done" });
    expect(dueCall(row, 1)).toEqual({ fn: "denied", reason: PERMISSION_REASONS.due });
    expect(priorityCall(row, "low")).toEqual({ fn: "denied", reason: PERMISSION_REASONS.priority });
    expect(canJoinTask(row)).toBe(false);
  });

  test("zaključan, član koji nije ni kreator ni izvršilac: sve zaključano, nudi se „Priključi se\"", () => {
    const row = rowFromStartupTask(task({ lockedAt: 1 }), context({ assigneeIds: ["ana"] }));
    expect(row.permissions.status).toEqual({
      allowed: false,
      reason: PERMISSION_REASONS.lockedStatus,
    });
    expect(completionCall(row, true)).toEqual({
      fn: "denied",
      reason: PERMISSION_REASONS.lockedStatus,
    });
    expect(canJoinTask(row)).toBe(true);
  });

  test("zaključan, izvršioci još nisu učitani: ne-kreator nije izvršilac, osim kad je lista već moja", () => {
    expect(
      rowFromStartupTask(task({ lockedAt: 1 }), context({ assigneeIds: null })).permissions.status
        .allowed,
    ).toBe(false);
    expect(
      rowFromStartupTask(task({ lockedAt: 1 }), context({ assigneeIds: null, assumeAssignee: true }))
        .permissions.status.allowed,
    ).toBe(true);
  });
});

describe("optimistička slika", () => {
  const items = [task(), task({ _id: "t2", title: "Drugi" })];

  test("menja samo zadati zadatak i samo zadata polja", () => {
    const next = patchStartupTasks(items, "t2", { taskStatus: "done", dueDate: 5 });
    expect(next[0]).toBe(items[0]);
    expect(next[1]).toMatchObject({ _id: "t2", taskStatus: "done", dueDate: 5, taskPriority: "high" });
  });

  test("rok null briše rok; prioritet se menja", () => {
    const withDue = [task({ dueDate: 9 })];
    expect(patchStartupTasks(withDue, "t1", { dueDate: null })[0].dueDate).toBeNull();
    expect(patchStartupTasks(withDue, "t1", { taskPriority: "urgent" })[0]).toMatchObject({ taskPriority: "urgent", dueDate: 9 });
  });

  test("nepoznat zadatak vraća isti niz", () => {
    expect(patchStartupTasks(items, "nema", { taskStatus: "done" })).toBe(items);
  });
});

describe("liste sa zadržavanjem reda", () => {
  const rows = [
    rowFromStartupTask(task({ _id: "a", taskStatus: "backlog" }), context()),
    rowFromStartupTask(task({ _id: "b", taskStatus: "next" }), context()),
    rowFromStartupTask(task({ _id: "c", taskStatus: "next" }), context()),
  ];

  test("tabla: kolona po statusu, redosled statusa i ulaza", () => {
    const columns = boardColumns(rows);
    expect(columns.map((column) => column.id)).toEqual([...STARTUP_TASK_STATUSES]);
    expect(columns[1].rows.map((row) => row.id)).toEqual(["b", "c"]);
    expect(columns[4].rows).toEqual([]);
  });

  test("zadržan red ostaje na mestu kao završen dok ga podaci već sele", () => {
    const before = boardColumns(rows);
    const location = locateStartupRow("board", before, "task:b");
    expect(location).toEqual({ section: "board:next", index: 0 });
    const hold: StartupTaskHold = { section: location!.section, index: location!.index, row: rows[1], done: true };
    // Server je već preselio „b" u Gotovo.
    const moved = boardColumns([rows[0], { ...rows[1], status: "done", done: true }, rows[2]]);
    const held = applyStartupHolds("board", moved, new Map([["task:b", hold]]), new Map());
    expect(held[1].rows.map((row) => [row.id, row.done])).toEqual([
      ["b", true],
      ["c", false],
    ]);
    expect(held[4].rows).toEqual([]);
  });

  test("zadržavanje druge liste se ne primenjuje; „čeka potvrdu\" menja samo done", () => {
    const sections = boardColumns(rows);
    const foreign: StartupTaskHold = { section: "zones:gori", index: 0, row: rows[0], done: true };
    const held = applyStartupHolds("board", sections, new Map([["task:a", foreign]]), new Map([["task:c", true]]));
    expect(held[0].rows.map((row) => row.id)).toEqual(["a"]);
    expect(held[1].rows.find((row) => row.id === "c")?.done).toBe(true);
  });

  test("traženje reda i ključ sekcije", () => {
    const sections = boardColumns(rows);
    expect(findStartupRow(sections, "task:c")?.id).toBe("c");
    expect(findStartupRow(sections, "task:x")).toBeUndefined();
    expect(locateStartupRow("board", sections, "task:x")).toBeNull();
    expect(startupHoldSection("list", "all")).toBe("list:all");
  });
});
