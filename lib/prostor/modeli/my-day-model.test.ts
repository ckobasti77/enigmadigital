// Preneto iz Devotion apps/web/components/me/my-day/my-day-model.test.ts (main @ c05c40f), SPAJANJE S19.
import { describe, expect, test } from "vitest";

import {
  buildMyDay,
  daySummary,
  firstNameOf,
  openByStartup,
  openTodayCount,
  type MyDayOverviewData,
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
    taskPriority: null,
    dueDate: null,
    completedAt: null,
    createdAt: noon(1),
    isCreator: false,
    isAssignee: true,
    workspace: { _id: "s1", name: "Cluck Rush" },
    area: { label: "Sales" },
    ...partial,
  };
}

const OVERVIEW: MyDayOverviewData = {
  tasks: [
    task("t1", { dueDate: noon(22) }),
    task("t2", { dueDate: noon(24), workspace: { _id: "s2", name: "Scan Me" }, area: null }),
    task("t3", { taskStatus: "in_progress" }),
    task("t4", { taskStatus: "done", completedAt: Date.UTC(2026, 9, 24, 6, 0), dueDate: noon(24) }),
    task("t5", { dueDate: noon(28), isAssignee: false }),
  ],
  personal: [
    { _id: "p1", title: "Faktura", status: "open", priority: null, dueDate: noon(23), completedAt: null, createdAt: noon(2) },
  ],
  entries: [],
  history: [],
  workspaces: [
    { _id: "s1", name: "Cluck Rush", logoUrl: "https://example.test/cr.png" },
    { _id: "s2", name: "Scan Me", logoUrl: null },
  ],
  capped: { tasks: false, personal: false, history: false },
};

describe("Moj dan v1 — model", () => {
  const model = buildMyDay(OVERVIEW, NOW, ZONE);
  const section = (id: string) => model.sections.find((entry) => entry.id === id);

  test("sekcije dolaze iz shared grupisanja, redovi nose startup sa logom ili „Lično“", () => {
    expect(section("overdue")?.rows.map((row) => row.key)).toEqual(["task:t1", "personal:p1"]);
    expect(section("overdue")?.rows[1].workspace).toBeNull();
    expect(section("overdue")?.rows[0].workspace).toEqual({
      _id: "s1",
      name: "Cluck Rush",
      logoUrl: "https://example.test/cr.png",
    });
    expect(section("today")?.rows.map((row) => row.key)).toEqual(["task:t2"]);
    expect(section("today")?.rows[0].areaLabel).toBeNull();
    expect(section("inProgress")?.rows.map((row) => row.key)).toEqual(["task:t3"]);
    expect(section("soon")?.rows.map((row) => row.key)).toEqual(["task:t5"]);
    expect(section("doneToday")?.rows[0]).toMatchObject({ key: "task:t4", done: true });
  });

  test("prsten i brojevi", () => {
    expect(model.progress).toEqual({ done: 1, total: 2 });
    expect(openTodayCount(model.counts)).toBe(3);
    expect(model.capped).toBe(false);
    expect(buildMyDay({ ...OVERVIEW, capped: { tasks: true, personal: false, history: false } }, NOW, ZONE).capped).toBe(true);
  });

  test("moji otvoreni po startupu: samo dodeljeni i nezavršeni", () => {
    expect(openByStartup(OVERVIEW, NOW, ZONE)).toEqual({ s1: 2, s2: 1 });
  });

  test("sažetak ispod pozdrava i ime", () => {
    expect(daySummary(model.counts)).toBe("2 kasni, 1 za danas.");
    expect(daySummary({ ...model.counts, overdue: 0, today: 0 })).toBe("Ništa ne gori.");
    expect(firstNameOf("Jovan Milojević")).toBe("Jovan");
    expect(firstNameOf("   ")).toBeNull();
  });
});
