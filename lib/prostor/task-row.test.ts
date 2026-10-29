// Preneto iz Devotion packages/shared/src/task-row.test.ts (main @ c05c40f), SPAJANJE S02.
import { describe, expect, test } from "vitest";

import { noonOfDayKey, startOfDayKey } from "./dates";
import { fromOverview, groupMyDay, myDayRefKey, type MyDayOverviewLike } from "./my-day";
import {
  applyCompletionHolds,
  completionCall,
  dueCall,
  moveInPlan,
  PERMISSION_REASONS,
  planCall,
  PRIORITY_REQUIRED_REASON,
  priorityCall,
  reopenStatus,
  rowFromMyDay,
  rowFromPersonal,
  rowFromTaskItem,
  taskPermissions,
  type CompletionHold,
  type TaskRowModel,
} from "./task-row";

const BG = "Europe/Belgrade";
const TODAY = "2026-10-24";
const NOW = startOfDayKey(TODAY, BG) + 10 * 3_600_000;
const noon = (key: string) => noonOfDayKey(key, BG);

const personalRow = (overrides: Partial<TaskRowModel> = {}): TaskRowModel => ({
  ...rowFromPersonal(
    { _id: "p1", title: "Račun za struju", status: "open", priority: null, dueDate: null },
    new Map(),
  ),
  ...overrides,
});

const taskRow = (
  access: { isCreator: boolean; isAssignee: boolean; lockedForViewer?: boolean },
  overrides: Partial<TaskRowModel> = {},
): TaskRowModel => ({
  ...rowFromTaskItem(
    {
      _id: "t1",
      title: "Ugovor sa dobavljačem",
      taskStatus: "in_progress",
      taskPriority: "high",
      dueDate: noon(TODAY),
      checkpointTotal: 0,
      checkpointCompleted: 0,
      ...access,
      workspace: { _id: "s1", name: "Cluck Rush", logoUrl: null },
      area: { label: "Sales" },
    },
    new Map(),
  ),
  ...overrides,
});

describe("dozvole (ogledalo tasks.updateMetadata)", () => {
  test("lični zadatak i kreator smeju sve", () => {
    for (const input of [
      { kind: "personal" as const, isCreator: false, isAssignee: false },
      { kind: "task" as const, isCreator: true, isAssignee: false },
    ]) {
      const perms = taskPermissions(input);
      expect(Object.values(perms).every((perm) => perm.allowed && perm.reason === null)).toBe(true);
      expect(perms.assignees.selfOnly).toBe(false);
    }
  });

  // PROSTOR P1 (namerna promena pravila): ograničenja važe samo za zaključan
  // zadatak (`lockedForViewer`); otključan menja svaki član.
  test("nezaključan zadatak: svaki član sme sve", () => {
    for (const isAssignee of [true, false]) {
      const perms = taskPermissions({ kind: "task", isCreator: false, isAssignee });
      expect(Object.values(perms).every((perm) => perm.allowed && perm.reason === null)).toBe(true);
      expect(perms.assignees.selfOnly).toBe(false);
    }
  });

  test("zaključan: izvršilac menja samo status; ostalo je onemogućeno sa razlogom", () => {
    const perms = taskPermissions({
      kind: "task",
      isCreator: false,
      isAssignee: true,
      lockedForViewer: true,
    });
    expect(perms.status).toEqual({ allowed: true, reason: null });
    expect(perms.priority).toEqual({ allowed: false, reason: PERMISSION_REASONS.priority });
    expect(perms.due).toEqual({ allowed: false, reason: PERMISSION_REASONS.due });
    expect(perms.instructions.allowed).toBe(false);
    expect(perms.checkpoints.allowed).toBe(false);
    expect(perms.assignees).toEqual({
      allowed: true,
      reason: PERMISSION_REASONS.assignees,
      selfOnly: true,
    });
    expect(perms.plan.allowed).toBe(true);
  });

  test("zaključan tuđi zadatak (nisam ni kreator ni izvršilac): ni status, a plan da", () => {
    const perms = taskPermissions({
      kind: "task",
      isCreator: false,
      isAssignee: false,
      lockedForViewer: true,
    });
    expect(perms.status).toEqual({ allowed: false, reason: PERMISSION_REASONS.lockedStatus });
    expect(perms.plan.allowed).toBe(true);
  });
});

describe("model reda", () => {
  const overview: MyDayOverviewLike = {
    tasks: [
      {
        _id: "t1",
        title: "Ugovor",
        taskStatus: "next",
        taskPriority: "urgent",
        dueDate: noon(TODAY),
        completedAt: null,
        createdAt: 1,
        isCreator: false,
        isAssignee: true,
        lockedForViewer: true,
        workspace: { _id: "s1", name: "Cluck Rush" },
        area: { label: "Sales" },
      },
    ],
    personal: [
      {
        _id: "p1",
        title: "Račun",
        status: "open",
        priority: null,
        dueDate: null,
        completedAt: null,
        createdAt: 2,
      },
    ],
    entries: [{ _id: "e1", dayKey: TODAY, refKey: myDayRefKey("personal", "p1"), position: 1024 }],
    history: [],
  };

  test("rowFromMyDay: startup sa logom, „Lično“, plan i dozvole", () => {
    const grouping = groupMyDay(fromOverview(overview, NOW, BG));
    const workspaces = new Map([["s1", { _id: "s1", name: "Cluck Rush", logoUrl: "https://x.test/l.png" }]]);
    const today = grouping.sections.find((section) => section.id === "today")!;
    const planned = grouping.sections.find((section) => section.id === "planned")!;
    const task = rowFromMyDay(today.rows[0], workspaces);
    const personal = rowFromMyDay(planned.rows[0], workspaces);

    expect(task).toMatchObject({
      key: "task:t1",
      kind: "task",
      workspace: { _id: "s1", logoUrl: "https://x.test/l.png" },
      areaLabel: "Sales",
      planned: false,
      planEntryId: null,
      done: false,
      checkpoints: null,
    });
    expect(task.permissions.due.allowed).toBe(false);
    expect(personal).toMatchObject({
      key: "personal:p1",
      workspace: null,
      planned: true,
      planEntryId: "e1",
    });
    expect(personal.permissions.due.allowed).toBe(true);
  });

  test("rowFromMyDay bez startupa u mapi koristi ime iz reda", () => {
    const grouping = groupMyDay(fromOverview(overview, NOW, BG));
    const row = grouping.sections.find((section) => section.id === "today")!.rows[0];
    expect(rowFromMyDay(row, new Map()).workspace).toEqual({ _id: "s1", name: "Cluck Rush", logoUrl: null });
  });

  test("rowFromTaskItem: status bez vrednosti je backlog, koraci, plan iz mape", () => {
    const row = rowFromTaskItem(
      {
        _id: "t9",
        title: "Stari zadatak",
        taskStatus: null,
        taskPriority: null,
        dueDate: null,
        checkpointTotal: 4,
        checkpointCompleted: 1,
        isCreator: true,
        isAssignee: false,
        workspace: { _id: "s2", name: "Scan Me", logoUrl: null },
        area: null,
      },
      new Map([["task:t9", "e9"]]),
    );
    expect(row).toMatchObject({
      status: "backlog",
      checkpoints: { done: 1, total: 4 },
      planned: true,
      planEntryId: "e9",
      areaLabel: null,
    });
  });

  test("rowFromPersonal: završen lični", () => {
    const row = rowFromPersonal(
      { _id: "p2", title: "Teretana", status: "done", priority: "low", dueDate: null },
      new Map(),
    );
    expect(row).toMatchObject({ key: "personal:p2", done: true, planned: false, workspace: null });
  });
});

describe("koja radnja se zove za koju vrstu stavke", () => {
  test("završi: lični → personalTasks.setStatus, startup → tasks.updateMetadata done", () => {
    expect(completionCall(personalRow(), true)).toEqual({
      fn: "personalTasks.setStatus",
      personalTaskId: "p1",
      status: "done",
    });
    expect(completionCall(personalRow(), false)).toEqual({
      fn: "personalTasks.setStatus",
      personalTaskId: "p1",
      status: "open",
    });
    const row = taskRow({ isCreator: false, isAssignee: true });
    expect(completionCall(row, true)).toEqual({ fn: "tasks.updateMetadata", pageId: "t1", status: "done" });
  });

  test("vraćanje startup zadatka ide na prethodni status, inače „Sledeće“", () => {
    const row = taskRow({ isCreator: true, isAssignee: false });
    expect(completionCall(row, false, "blocked")).toMatchObject({ status: "blocked" });
    expect(completionCall(row, false, "in_progress")).toMatchObject({ status: "in_progress" });
    expect(completionCall(row, false)).toMatchObject({ status: "next" });
    expect(completionCall(row, false, "done")).toMatchObject({ status: "next" });
    expect(reopenStatus("open")).toBe("next");
    expect(reopenStatus(null)).toBe("next");
    expect(reopenStatus("backlog")).toBe("backlog");
  });

  test("bez dozvole za status (zaključan): odbijeno sa razlogom, bez poziva", () => {
    const row = taskRow({ isCreator: false, isAssignee: false, lockedForViewer: true });
    expect(completionCall(row, true)).toEqual({
      fn: "denied",
      reason: PERMISSION_REASONS.lockedStatus,
    });
    expect(completionCall(taskRow({ isCreator: false, isAssignee: false }), true)).toEqual({
      fn: "tasks.updateMetadata",
      pageId: "t1",
      status: "done",
    });
  });

  test("rok: lični → personalTasks.update, kreator → tasks.updateMetadata, izvršilac odbijen", () => {
    expect(dueCall(personalRow(), noon("2026-10-25"))).toEqual({
      fn: "personalTasks.update",
      personalTaskId: "p1",
      dueDate: noon("2026-10-25"),
    });
    expect(dueCall(taskRow({ isCreator: true, isAssignee: false }), null)).toEqual({
      fn: "tasks.updateMetadata",
      pageId: "t1",
      dueDate: null,
    });
    expect(
      dueCall(taskRow({ isCreator: false, isAssignee: true, lockedForViewer: true }), null),
    ).toEqual({
      fn: "denied",
      reason: PERMISSION_REASONS.due,
    });
  });

  test("prioritet: lični sme bez prioriteta, startup ne", () => {
    expect(priorityCall(personalRow(), null)).toEqual({
      fn: "personalTasks.update",
      personalTaskId: "p1",
      priority: null,
    });
    const creator = taskRow({ isCreator: true, isAssignee: false });
    expect(priorityCall(creator, "urgent")).toEqual({
      fn: "tasks.updateMetadata",
      pageId: "t1",
      priority: "urgent",
    });
    expect(priorityCall(creator, null)).toEqual({ fn: "denied", reason: PRIORITY_REQUIRED_REASON });
    expect(
      priorityCall(taskRow({ isCreator: false, isAssignee: true, lockedForViewer: true }), "low"),
    ).toEqual({
      fn: "denied",
      reason: PERMISSION_REASONS.priority,
    });
  });

  test("plan: dodaj sa referencom po vrsti, ukloni po id-ju stavke", () => {
    expect(planCall(personalRow())).toEqual({
      fn: "myDay.plan",
      ref: { kind: "personal", personalTaskId: "p1" },
    });
    expect(planCall(taskRow({ isCreator: false, isAssignee: false }))).toEqual({
      fn: "myDay.plan",
      ref: { kind: "task", taskPageId: "t1" },
    });
    expect(planCall(personalRow({ planned: true, planEntryId: "e1" }))).toEqual({
      fn: "myDay.unplan",
      entryId: "e1",
    });
  });
});

describe("redosled u planu", () => {
  test("gore, dole, ivice i nepoznata stavka", () => {
    expect(moveInPlan(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveInPlan(["a", "b", "c"], "b", 1)).toEqual(["a", "c", "b"]);
    expect(moveInPlan(["a", "b", "c"], "a", -1)).toBeNull();
    expect(moveInPlan(["a", "b", "c"], "c", 1)).toBeNull();
    expect(moveInPlan(["a", "b"], "x", 1)).toBeNull();
  });
});

describe("zadržavanje reda posle kvačice (E7)", () => {
  type Row = { key: string; done: boolean; title: string };
  type Section = { id: string; rows: Row[] };
  const row = (key: string, done = false): Row => ({ key, done, title: key });

  test("bez zadržavanja: isti redovi", () => {
    const sections: Section[] = [{ id: "today", rows: [row("a")] }];
    const result = applyCompletionHolds(sections, new Map(), new Map());
    expect(result[0]).toBe(sections[0]);
  });

  test("red ostaje na starom mestu kao završen i kad ga server preseli", () => {
    // Server je već prebacio „b" u Završeno danas.
    const sections: Section[] = [
      { id: "today", rows: [row("a"), row("c")] },
      { id: "doneToday", rows: [row("b", true)] },
    ];
    const holds = new Map<string, CompletionHold<Row>>([
      ["b", { section: "today", index: 1, row: row("b"), done: true }],
    ]);
    const result = applyCompletionHolds(sections, holds, new Map());
    expect(result[0].rows.map((item) => [item.key, item.done])).toEqual([
      ["a", false],
      ["b", true],
      ["c", false],
    ]);
    expect(result[1].rows).toEqual([]);
  });

  test("čekanje potvrde: red je završen dok server ne odgovori; indeks van opsega", () => {
    const sections: Section[] = [{ id: "today", rows: [row("a")] }];
    const pending = new Map([["a", true]]);
    expect(applyCompletionHolds(sections, new Map(), pending)[0].rows[0].done).toBe(true);
    const holds = new Map<string, CompletionHold<Row>>([
      ["z", { section: "today", index: 9, row: row("z"), done: true }],
      ["y", { section: "nema", index: 0, row: row("y"), done: true }],
    ]);
    expect(applyCompletionHolds(sections, holds, new Map())[0].rows.map((item) => item.key)).toEqual([
      "a",
      "z",
    ]);
  });
});
