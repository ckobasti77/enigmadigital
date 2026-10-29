// Preneto iz Devotion apps/web/components/me/my-day/my-day-logic.test.ts (main @ c05c40f), SPAJANJE S19.
import { describe, expect, test } from "vitest";
import type { TaskRowModel } from "..";

import {
  applyHolds,
  buildMyDay,
  holdSectionKey,
  isOptimisticId,
  locateRow,
  type MyDayOverviewData,
  OPTIMISTIC_PREFIX,
  parseGroupMode,
  patchItem,
  plannedOrder,
  progressValueText,
  type RowHold,
  withEntry,
  withEntryOrder,
  withoutEntry,
  withoutHistory,
} from "./my-day-model";

const ZONE = "Europe/Belgrade";
// subota 24.10.2026. 09:30 u Beogradu
const NOW = Date.UTC(2026, 9, 24, 7, 30);
const noon = (day: number) => Date.UTC(2026, 9, day, 10, 0);

function task(id: string, partial: Partial<MyDayOverviewData["tasks"][number]> = {}) {
  return {
    _id: id,
    title: `Zadatak ${id}`,
    taskStatus: "next" as const,
    taskPriority: "medium" as const,
    dueDate: null,
    completedAt: null,
    createdAt: noon(1),
    isCreator: true,
    isAssignee: true,
    workspace: { _id: "s1", name: "Cluck Rush" },
    area: { label: "Sales" },
    ...partial,
  };
}

const OVERVIEW: MyDayOverviewData = {
  tasks: [
    task("t1", { dueDate: noon(24) }),
    task("t2", { workspace: { _id: "s2", name: "Scan Me" } }),
    task("t3", { workspace: { _id: "s2", name: "Scan Me" } }),
    task("t4", { taskStatus: "done", completedAt: Date.UTC(2026, 9, 24, 6, 0), dueDate: noon(24) }),
  ],
  personal: [
    { _id: "p1", title: "Račun", status: "open", priority: null, dueDate: null, completedAt: null, createdAt: noon(2) },
  ],
  entries: [
    { _id: "e2", dayKey: "2026-10-24", refKey: "task:t2", position: 1024 },
    { _id: "e3", dayKey: "2026-10-24", refKey: "task:t3", position: 2048 },
    { _id: "e1", dayKey: "2026-10-24", refKey: "personal:p1", position: 3072 },
  ],
  history: [
    { _id: "h1", dayKey: "2026-10-23", refKey: "task:t2", position: 1024 },
    { _id: "h2", dayKey: "2026-10-22", refKey: "personal:p1", position: 1024 },
  ],
  workspaces: [
    { _id: "s1", name: "Cluck Rush", logoUrl: null },
    { _id: "s2", name: "Scan Me", logoUrl: null },
  ],
  capped: { tasks: false, personal: false, history: false },
};

describe("Moj dan — model (K10)", () => {
  const model = buildMyDay(OVERVIEW, NOW, ZONE);

  test("po startupu: Lično prvo, pa startupi redom iz overview; Završeno danas odvojeno", () => {
    expect(model.byStartup.groups.map((group) => [group.key, group.rows.map((row) => row.key)])).toEqual([
      ["personal", ["personal:p1"]],
      ["s1", ["task:t1"]],
      ["s2", ["task:t2", "task:t3"]],
    ]);
    expect(model.byStartup.doneToday.map((row) => row.key)).toEqual(["task:t4"]);
    expect(model.byStartup.groups[0].workspace).toBeNull();
    expect(model.byStartup.groups[2].workspace?.name).toBe("Scan Me");
  });

  test("redovi nose plan i dozvole; broj redova za granicu Flip-a", () => {
    const planned = model.sections.find((section) => section.id === "planned")!;
    expect(planned.rows.map((row) => [row.key, row.planEntryId])).toEqual([
      ["task:t2", "e2"],
      ["task:t3", "e3"],
      ["personal:p1", "e1"],
    ]);
    expect(planned.rows[0].permissions.due.allowed).toBe(true);
    expect(model.rowCount).toBe(5);
  });

  test("redosled plana kako se vidi u „Planirano“", () => {
    expect(plannedOrder(model)).toEqual(["e2", "e3", "e1"]);
  });

  test("prekidač grupisanja i tekst prstena", () => {
    expect(parseGroupMode("startup")).toBe("startup");
    expect(parseGroupMode("bilo šta")).toBe("time");
    expect(parseGroupMode(null)).toBe("time");
    expect(progressValueText({ done: 1, total: 2 })).toBe("1 od 2 završeno");
    expect(progressValueText({ done: 2, total: 2 })).toBe("Dan je završen.");
    expect(progressValueText({ done: 0, total: 0 })).toBe("0 od 0 završeno");
  });
});

describe("optimistička slika (isti ishod kao server)", () => {
  test("rok i prioritet jedne stavke, ostalo netaknuto", () => {
    const next = patchItem(OVERVIEW, { kind: "task", id: "t2" }, { dueDate: noon(25), priority: "urgent" });
    expect(next.tasks[1]).toMatchObject({ dueDate: noon(25), taskPriority: "urgent" });
    expect(next.tasks[0]).toBe(OVERVIEW.tasks[0]);
    const cleared = patchItem(OVERVIEW, { kind: "personal", id: "p1" }, { priority: "high" });
    expect(cleared.personal[0]).toMatchObject({ priority: "high", dueDate: null });
    // `undefined` ne briše vrednost.
    expect(patchItem(OVERVIEW, { kind: "task", id: "t1" }, {}).tasks[0].dueDate).toBe(noon(24));
  });

  test("nova stavka plana ide na kraj (poslednja + 1024), duplikat se ne dodaje", () => {
    const entry = { _id: `${OPTIMISTIC_PREFIX}task:t1`, dayKey: "2026-10-24", refKey: "task:t1", position: 0 };
    const next = withEntry(OVERVIEW, entry);
    expect(next.entries.at(-1)).toEqual({ ...entry, position: 4096 });
    expect(withEntry(next, entry)).toBe(next);
    expect(isOptimisticId(entry._id)).toBe(true);
    expect(isOptimisticId("e1")).toBe(false);
    expect(isOptimisticId(null)).toBe(false);
  });

  test("uklanjanje stavke plana i istorije", () => {
    expect(withoutEntry(OVERVIEW, "e3").entries.map((entry) => entry._id)).toEqual(["e2", "e1"]);
    expect(withoutHistory(OVERVIEW, new Set(["task:t2"])).history.map((entry) => entry._id)).toEqual(["h2"]);
    expect(withoutHistory(OVERVIEW, null).history).toEqual([]);
  });

  test("redosled: zadate stavke dele svoje pozicije, ostale stoje", () => {
    const next = withEntryOrder(OVERVIEW, ["e3", "e2"]);
    expect(next.entries.map((entry) => [entry._id, entry.position])).toEqual([
      ["e3", 1024],
      ["e2", 2048],
      ["e1", 3072],
    ]);
    // Model prati novi redosled.
    expect(plannedOrder(buildMyDay(next, NOW, ZONE))).toEqual(["e3", "e2", "e1"]);
  });
});

describe("zadržavanje reda posle kvačice u oba prikaza", () => {
  const model = buildMyDay(OVERVIEW, NOW, ZONE);
  const rowOf = (key: string): TaskRowModel =>
    model.sections.flatMap((section) => section.rows).find((row) => row.key === key)!;

  test("gde je red sada, po prikazu", () => {
    expect(locateRow(model, "time", "task:t3")).toEqual({ section: "time:planned", index: 1 });
    expect(locateRow(model, "startup", "task:t3")).toEqual({ section: "startup:s2", index: 1 });
    expect(locateRow(model, "startup", "task:t4")).toEqual({ section: "startup:doneToday", index: 0 });
    expect(locateRow(model, "time", "nema")).toBeNull();
    expect(holdSectionKey("time", "today")).toBe("time:today");
  });

  test("red zadržan „po vremenu“ ostaje na mestu kao završen i kad ga podaci presele", () => {
    // Server je već završio t1 (rok danas) — u podacima je u Završeno danas.
    const after = buildMyDay(
      { ...OVERVIEW, tasks: OVERVIEW.tasks.map((item) => (item._id === "t1" ? { ...item, taskStatus: "done" as const, completedAt: NOW } : item)) },
      NOW,
      ZONE,
    );
    const holds = new Map<string, RowHold>([["task:t1", { section: "time:today", index: 0, row: rowOf("task:t1"), done: true }]]);
    const held = applyHolds(after, holds, new Map());
    const today = held.sections.find((section) => section.id === "today")!;
    expect(today.rows.map((row) => [row.key, row.done])).toEqual([["task:t1", true]]);
    expect(held.sections.find((section) => section.id === "doneToday")!.rows.map((row) => row.key)).toEqual(["task:t4"]);
    // U drugom prikazu red vode podaci.
    expect(held.byStartup.doneToday.map((row) => row.key)).toEqual(["task:t1", "task:t4"]);
  });

  test("čekanje potvrde: red je završen u oba prikaza; bez zadržavanja isti model", () => {
    const pending = new Map([["task:t2", true]]);
    const held = applyHolds(model, new Map(), pending);
    expect(held.sections.find((section) => section.id === "planned")!.rows[0]).toMatchObject({ key: "task:t2", done: true });
    expect(held.byStartup.groups[2].rows[0]).toMatchObject({ key: "task:t2", done: true });
    expect(applyHolds(model, new Map(), new Map())).toBe(model);
  });
});
