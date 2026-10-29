// Preneto iz Devotion apps/web/components/me/tasks/my-tasks-model.test.ts (main @ c05c40f), SPAJANJE S16.
import { describe, expect, test } from "vitest";
import { EMPTY_TASK_FILTERS, noonOfDayKey, startOfDayKey, type TaskItemLike } from "..";

import {
  buildMyTasks,
  buildTaskRows,
  enterKey,
  findRow,
  locateTaskRow,
  patchPersonalItems,
  patchTaskItems,
  plannedKeysOf,
  taskHoldSection,
  type MyTasksSource,
  type TaskRowHold,
} from "./my-tasks-model";

const BG = "Europe/Belgrade";
const NOW = startOfDayKey("2026-10-24", BG) + 9 * 3_600_000;
const due = (key: string) => noonOfDayKey(key, BG);
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
  tasks: [item("t1", "Ugovor", { dueDate: due("2026-10-22") }), item("t2", "Landing", { checkpointTotal: 4, checkpointCompleted: 1 })],
  personal: [
    { _id: "p1", title: "Struja", status: "open", priority: null, dueDate: due("2026-10-24"), createdAt: 2 },
    { _id: "p2", title: "Računovođa", status: "done", priority: null, dueDate: null, createdAt: 3 },
  ],
  entries: [{ _id: "e1", refKey: "personal:p1" }],
  capped: false,
};

describe("redovi i plan", () => {
  test("startup i lični zadaci u istom modelu, plan iz stavki za danas", () => {
    const rows = buildTaskRows(SOURCE);
    expect(rows.map((row) => row.key)).toEqual(["task:t1", "task:t2", "personal:p1", "personal:p2"]);
    expect(rows.find((row) => row.id === "p1")).toMatchObject({ planned: true, planEntryId: "e1", workspace: null });
    expect(rows.find((row) => row.id === "t2")?.checkpoints).toEqual({ done: 1, total: 4 });
    expect(plannedKeysOf(SOURCE.entries).get("personal:p1")).toBe("e1");
  });
});

describe("model prikaza", () => {
  const rows = buildTaskRows(SOURCE);

  test("grupe po startupu; završeni sakriveni; brojevi i prazno/bez rezultata", () => {
    const model = buildMyTasks(rows, EMPTY_TASK_FILTERS, "startup", NOW, { zone: BG, startupOrder: ["s1"] });
    expect(model.groups.map((group) => group.title)).toEqual(["Lično", "Cluck Rush"]);
    expect(model.groups[0].rows.map((row) => row.id)).toEqual(["p1"]);
    expect(model.openCount).toBe(3);
    expect(model.visibleCount).toBe(3);
    expect(model.hasAny).toBe(true);
    // Napomena o odsečenju broji učitane zadatke (pre filtera), ne vidljive.
    expect(model.loadedCount).toBe(4);
    const none = buildMyTasks(rows, { ...EMPTY_TASK_FILTERS, query: "nema" }, "startup", NOW, { zone: BG });
    expect(none.visibleCount).toBe(0);
    expect(none.hasAny).toBe(true);
    expect(buildMyTasks([], EMPTY_TASK_FILTERS, "due", NOW).hasAny).toBe(false);
  });

  test("zadržan red ostaje na svom mestu i kad bi ga filter već sklonio (E7)", () => {
    const struja = rows.find((row) => row.id === "p1")!;
    // Server je već javio „završeno": bez zadržavanja red bi nestao zajedno sa grupom „Lično".
    const afterServer = rows.map((row) => (row.id === "p1" ? { ...row, done: true, status: "done" as const } : row));
    const holds = new Map<string, TaskRowHold>([
      [struja.key, { section: taskHoldSection("startup", "licno"), index: 0, row: struja, done: true }],
    ]);
    const model = buildMyTasks(afterServer, EMPTY_TASK_FILTERS, "startup", NOW, { zone: BG, holds });
    expect(model.groups[0]).toMatchObject({ key: "licno", title: "Lično" });
    expect(model.groups[0].rows).toHaveLength(1);
    expect(model.groups[0].rows[0]).toMatchObject({ id: "p1", done: true });
    // Posle otpuštanja (bez zadržavanja) grupa nestaje.
    expect(buildMyTasks(afterServer, EMPTY_TASK_FILTERS, "startup", NOW, { zone: BG }).groups.map((group) => group.key)).toEqual(["s1"]);
  });

  test("zadržavanje važi samo za grupisanje u kome je kliknuto", () => {
    const struja = rows.find((row) => row.id === "p1")!;
    const holds = new Map<string, TaskRowHold>([
      [struja.key, { section: taskHoldSection("due", "today"), index: 0, row: struja, done: true }],
    ]);
    const model = buildMyTasks(rows, EMPTY_TASK_FILTERS, "startup", NOW, { zone: BG, holds });
    expect(model.groups[0].rows[0].done).toBe(false);
  });

  test("lociranje i nalaženje reda", () => {
    const model = buildMyTasks(rows, EMPTY_TASK_FILTERS, "due", NOW, { zone: BG });
    expect(model.groups.map((group) => group.key)).toEqual(["overdue", "today", "none"]);
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
});

describe("optimistička slika", () => {
  test("startup zadatak: rok, prioritet i status; ostali i nepoznat id netaknuti", () => {
    const value = { items: SOURCE.tasks, capped: false };
    const next = patchTaskItems(value, "t1", { dueDate: null, taskPriority: "urgent", taskStatus: "done" });
    expect(next.items[0]).toMatchObject({ dueDate: null, taskPriority: "urgent", taskStatus: "done" });
    expect(next.items[1]).toBe(value.items[1]);
    expect(patchTaskItems(value, "nema", { dueDate: 1 })).toBe(value);
    // Polje koje nije zadato se ne dira.
    expect(patchTaskItems(value, "t1", { taskPriority: "low" }).items[0].dueDate).toBe(due("2026-10-22"));
  });

  test("lični zadatak: status, prioritet (i bez prioriteta), rok", () => {
    const value = { items: SOURCE.personal, capped: false };
    const next = patchPersonalItems(value, "p1", { status: "done", priority: null, dueDate: due("2026-10-30") });
    expect(next.items[0]).toMatchObject({ status: "done", priority: null, dueDate: due("2026-10-30") });
    expect(patchPersonalItems(value, "nema", { status: "done" })).toBe(value);
  });
});
