// Preneto iz Devotion apps/web/components/me/plan-day/plan-day-model.test.ts (main @ c05c40f), SPAJANJE S19.
import { describe, expect, test } from "vitest";

import type { MyDayOverviewData } from "./my-day-model";
import { buildPlanDay, groupSuggestions, MY_DAY_MAX_ENTRIES } from "./plan-day-model";

const ZONE = "Europe/Belgrade";
// subota 24.10.2026. 09:30 u Beogradu
const NOW = Date.UTC(2026, 9, 24, 7, 30);
const noon = (day: number) => Date.UTC(2026, 9, day, 10, 0);

function task(id: string, partial: Partial<MyDayOverviewData["tasks"][number]> = {}) {
  return {
    _id: id,
    title: id,
    taskStatus: "backlog" as const,
    taskPriority: "medium" as const,
    dueDate: null,
    completedAt: null,
    createdAt: noon(1),
    isCreator: true,
    isAssignee: true,
    workspace: { _id: "s1", name: "Cluck Rush" },
    area: null,
    ...partial,
  };
}

const OVERVIEW: MyDayOverviewData = {
  tasks: [
    task("rok", { dueDate: noon(27) }),
    task("hitno", { taskPriority: "urgent" }),
    task("sledece", { taskStatus: "next" }),
    task("preneto", { taskPriority: "high" }),
    task("planirano", { taskPriority: "high" }),
    task("gotovo", { taskStatus: "done", completedAt: noon(20) }),
  ],
  personal: [
    { _id: "licno", title: "licno", status: "open", priority: null, dueDate: null, completedAt: null, createdAt: noon(2) },
  ],
  entries: [{ _id: "e1", dayKey: "2026-10-24", refKey: "task:planirano", position: 1024 }],
  history: [
    { _id: "h1", dayKey: "2026-10-22", refKey: "task:preneto", position: 1024 },
    { _id: "h2", dayKey: "2026-10-23", refKey: "task:gotovo", position: 1024 },
  ],
  workspaces: [{ _id: "s1", name: "Cluck Rush", logoUrl: null }],
  capped: { tasks: false, personal: false, history: false },
};

describe("Isplaniraj dan — model", () => {
  const model = buildPlanDay(OVERVIEW, NOW, ZONE);

  test("preneto od ranije: otvoreno iz prošlih dana sa oznakom dana; završeno ne", () => {
    expect(model.carryOver.map((item) => [item.row.key, item.fromDayKey, item.fromLabel])).toEqual([
      ["task:preneto", "2026-10-22", "čet 22. okt"],
    ]);
  });

  test("predlozi po razlogu, bez planiranog i bez stavke koja je već u „Preneto“", () => {
    expect(model.suggestions.map((item) => [item.row.key, item.reasonLabel])).toEqual([
      ["task:rok", "Rok ove nedelje"],
      ["task:hitno", "Visok prioritet"],
      ["task:sledece", "Sledeće"],
      ["personal:licno", "Lično"],
    ]);
    expect(model.plannedCount).toBe(1);
    expect(model.max).toBe(MY_DAY_MAX_ENTRIES);
  });

  test("grupe predloga zadržavaju redosled i spajaju iste razloge", () => {
    const groups = groupSuggestions([...model.suggestions, { ...model.suggestions[3] }]);
    expect(groups.map((group) => [group.label, group.rows.length])).toEqual([
      ["Rok ove nedelje", 1],
      ["Visok prioritet", 1],
      ["Sledeće", 1],
      ["Lično", 2],
    ]);
  });

  test("prazan dan: nema predloga ni prenetog", () => {
    const empty = buildPlanDay({ ...OVERVIEW, tasks: [], personal: [], entries: [], history: [] }, NOW, ZONE);
    expect(empty).toMatchObject({ carryOver: [], suggestions: [], plannedCount: 0 });
  });
});
