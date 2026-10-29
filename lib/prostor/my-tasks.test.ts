// Preneto iz Devotion packages/shared/src/my-tasks.test.ts (main @ c05c40f), SPAJANJE S02.
import { describe, expect, test } from "vitest";

import { noonOfDayKey, startOfDayKey } from "./dates";
import {
  buildMyTasks,
  buildTaskRows,
  enterKey,
  findRow,
  locateTaskRow,
  patchPersonalItems,
  patchTaskItems,
  taskHoldSection,
  type MyTasksSource,
  type TaskRowHold,
} from "./my-tasks";
import { EMPTY_TASK_FILTERS } from "./task-filters";
import type { TaskItemLike } from "./task-row";

// K13 je model Mojih zadataka preselio iz web `my-tasks-model.ts` u shared da ga
// telefon uvozi; web test (`my-tasks-model.test.ts`) ostaje i prolazi kroz
// re-export. Ovde je provera da shared izvoz radi sam, bez weba.

const ZONE = "Europe/Belgrade";
const NOW = startOfDayKey("2026-10-24", ZONE) + 9 * 3_600_000;
const due = (key: string) => noonOfDayKey(key, ZONE);
const CR = { _id: "s1", name: "Cluck Rush", logoUrl: null };

function item(id: string, title: string, partial: Partial<TaskItemLike> = {}): TaskItemLike {
  return {
    _id: id,
    title,
    taskStatus: "next",
    taskPriority: "medium",
    dueDate: null,
    checkpointTotal: 0,
    checkpointCompleted: 0,
    isCreator: true,
    isAssignee: true,
    workspace: CR,
    area: { label: "Sales" },
    createdAt: 1,
    ...partial,
  };
}

const SOURCE: MyTasksSource = {
  tasks: [item("t1", "Ugovor", { dueDate: due("2026-10-22") }), item("t2", "Landing")],
  personal: [{ _id: "p1", title: "Struja", status: "open", priority: null, dueDate: due("2026-10-24"), createdAt: 2 }],
  entries: [{ _id: "e1", refKey: "personal:p1" }],
  capped: false,
};

describe("model Mojih zadataka (shared)", () => {
  const rows = buildTaskRows(SOURCE);

  test("redovi i plan: startup i lični zadaci, plan iz stavki za danas", () => {
    expect(rows.map((row) => row.key)).toEqual(["task:t1", "task:t2", "personal:p1"]);
    expect(rows.find((row) => row.id === "p1")).toMatchObject({ planned: true, planEntryId: "e1", workspace: null });
  });

  test("grupisanje po startupu: Lično prvo, pa startupi", () => {
    const model = buildMyTasks(rows, EMPTY_TASK_FILTERS, "startup", NOW, { zone: ZONE, startupOrder: ["s1"] });
    expect(model.groups.map((group) => group.title)).toEqual(["Lično", "Cluck Rush"]);
    expect(model).toMatchObject({ openCount: 3, visibleCount: 3, hasAny: true, loadedCount: 3, capped: false });
  });

  test("zadržan red ostaje u svojoj grupi kad bi ga filter već sklonio", () => {
    const struja = rows.find((row) => row.id === "p1")!;
    const afterServer = rows.map((row) => (row.id === "p1" ? { ...row, done: true, status: "done" as const } : row));
    const holds = new Map<string, TaskRowHold>([
      [struja.key, { section: taskHoldSection("startup", "licno"), index: 0, row: struja, done: true }],
    ]);
    const held = buildMyTasks(afterServer, EMPTY_TASK_FILTERS, "startup", NOW, { zone: ZONE, holds });
    expect(held.groups[0]).toMatchObject({ key: "licno" });
    expect(buildMyTasks(afterServer, EMPTY_TASK_FILTERS, "startup", NOW, { zone: ZONE }).groups.map((g) => g.key)).toEqual(["s1"]);
  });

  test("lociranje i nalaženje reda", () => {
    const model = buildMyTasks(rows, EMPTY_TASK_FILTERS, "due", NOW, { zone: ZONE });
    expect(locateTaskRow(model, "due", "personal:p1")).toEqual({ section: "due:today", index: 0 });
    expect(locateTaskRow(model, "due", "nema")).toBeNull();
    expect(findRow(model, "task:t2")?.title).toBe("Landing");
    expect(findRow(null, "task:t2")).toBeUndefined();
  });

  test("ključ ulaza liste: filteri i grupisanje da, pretraga ne", () => {
    const base = enterKey("ready", EMPTY_TASK_FILTERS, "startup");
    expect(enterKey("ready", { ...EMPTY_TASK_FILTERS, query: "ugovor" }, "startup")).toBe(base);
    expect(enterKey("ready", { ...EMPTY_TASK_FILTERS, due: ["today"] }, "startup")).not.toBe(base);
    expect(enterKey("ready", EMPTY_TASK_FILTERS, "due")).not.toBe(base);
    expect(enterKey("ready", { ...EMPTY_TASK_FILTERS, showDone: true }, "startup")).not.toBe(base);
  });

  test("optimistička slika: samo zadati zadatak i samo zadata polja", () => {
    const tasks = { items: SOURCE.tasks, capped: false };
    const next = patchTaskItems(tasks, "t1", { dueDate: null, taskPriority: "urgent" });
    expect(next.items[0]).toMatchObject({ dueDate: null, taskPriority: "urgent", taskStatus: "next" });
    expect(next.items[1]).toBe(tasks.items[1]);
    expect(patchTaskItems(tasks, "nema", { dueDate: 1 })).toBe(tasks);

    const personal = { items: SOURCE.personal, capped: false };
    expect(patchPersonalItems(personal, "p1", { status: "done" }).items[0]).toMatchObject({ status: "done", priority: null });
    expect(patchPersonalItems(personal, "nema", { status: "done" })).toBe(personal);
  });
});
