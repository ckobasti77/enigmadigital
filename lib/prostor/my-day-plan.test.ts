// Preneto iz Devotion packages/shared/src/my-day-plan.test.ts (main @ c05c40f), SPAJANJE S02.
import { describe, expect, test } from "vitest";

import {
  buildPlanDay,
  groupSuggestions,
  isOptimisticId,
  MY_DAY_MAX_ENTRIES,
  OPTIMISTIC_PREFIX,
  patchItem,
  PLAN_SUGGESTIONS_LIMIT,
  type PlanDayOverviewLike,
  withEntry,
  withEntryOrder,
  withoutEntry,
  withoutHistory,
} from "./my-day-plan";

const ZONE = "Europe/Belgrade";
// subota 24.10.2026. 09:30 u Beogradu
const NOW = Date.UTC(2026, 9, 24, 7, 30);
const noon = (day: number) => Date.UTC(2026, 9, day, 10, 0);

type Task = PlanDayOverviewLike["tasks"][number];

function task(id: string, partial: Partial<Task> = {}): Task {
  return {
    _id: id,
    title: id,
    taskStatus: "backlog",
    taskPriority: "medium",
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

const OVERVIEW: PlanDayOverviewLike = {
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
  workspaces: [{ _id: "s1", name: "Cluck Rush", logoUrl: "https://example.test/cr.png" }],
};

describe("Isplaniraj dan (shared, web i telefon)", () => {
  const model = buildPlanDay(OVERVIEW, NOW, ZONE);

  test("preneto od ranije: otvoreno iz prošlih dana sa oznakom dana i logom startupa", () => {
    expect(model.carryOver.map((item) => [item.row.key, item.fromDayKey, item.fromLabel])).toEqual([
      ["task:preneto", "2026-10-22", "čet 22. okt"],
    ]);
    expect(model.carryOver[0].row.workspace?.logoUrl).toBe("https://example.test/cr.png");
  });

  test("predlozi po razlogu, bez planiranog, završenog i stavke iz „Preneto“", () => {
    expect(model.suggestions.map((item) => [item.row.key, item.reason, item.reasonLabel])).toEqual([
      ["task:rok", "dueThisWeek", "Rok ove nedelje"],
      ["task:hitno", "priority", "Visok prioritet"],
      ["task:sledece", "next", "Sledeće"],
      ["personal:licno", "personal", "Lično"],
    ]);
    expect(model.plannedCount).toBe(1);
    expect(model.max).toBe(MY_DAY_MAX_ENTRIES);
  });

  test("najviše 30 predloga i kad „Preneto“ uzme deo izvora", () => {
    const many = Array.from({ length: 40 }, (_, index) => task(`h${index}`, { taskPriority: "high" }));
    const big = buildPlanDay(
      {
        ...OVERVIEW,
        tasks: many,
        personal: [],
        entries: [],
        history: [{ _id: "x", dayKey: "2026-10-23", refKey: "task:h0", position: 1 }],
      },
      NOW,
      ZONE,
    );
    expect(big.carryOver.map((item) => item.row.key)).toEqual(["task:h0"]);
    expect(big.suggestions).toHaveLength(PLAN_SUGGESTIONS_LIMIT);
    expect(big.suggestions.some((item) => item.row.key === "task:h0")).toBe(false);
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

describe("optimistička slika (isti ishod kao server)", () => {
  test("rok i prioritet jedne stavke; ostale netaknute, izvor se ne menja", () => {
    const next = patchItem(OVERVIEW, { kind: "task", id: "rok" }, { dueDate: noon(25), priority: "urgent" });
    expect(next.tasks[0]).toMatchObject({ dueDate: noon(25), taskPriority: "urgent" });
    expect(next.tasks[1]).toBe(OVERVIEW.tasks[1]);
    expect(OVERVIEW.tasks[0].dueDate).toBe(noon(27));
    const personal = patchItem(OVERVIEW, { kind: "personal", id: "licno" }, { dueDate: null, priority: "high" });
    expect(personal.personal[0]).toMatchObject({ dueDate: null, priority: "high" });
    expect(patchItem(OVERVIEW, { kind: "task", id: "rok" }, {}).tasks[0].dueDate).toBe(noon(27));
  });

  test("nova stavka plana ide na kraj (+1024), duplikat se ne dodaje", () => {
    const entry = { _id: `${OPTIMISTIC_PREFIX}task:rok`, dayKey: "2026-10-24", refKey: "task:rok", position: 0 };
    const next = withEntry(OVERVIEW, entry);
    expect(next.entries.map((item) => [item._id, item.position])).toEqual([
      ["e1", 1024],
      [`${OPTIMISTIC_PREFIX}task:rok`, 2048],
    ]);
    expect(withEntry(next, entry)).toBe(next);
    expect(isOptimisticId(entry._id)).toBe(true);
    expect(isOptimisticId("e1")).toBe(false);
    expect(isOptimisticId(null)).toBe(false);
  });

  test("uklanjanje stavke, redosled deli postojeće pozicije, istorija", () => {
    expect(withoutEntry(OVERVIEW, "e1").entries).toEqual([]);
    const three = {
      ...OVERVIEW,
      entries: [
        { _id: "a", dayKey: "2026-10-24", refKey: "task:rok", position: 100 },
        { _id: "b", dayKey: "2026-10-24", refKey: "task:hitno", position: 200 },
        { _id: "c", dayKey: "2026-10-24", refKey: "task:sledece", position: 300 },
      ],
    };
    expect(withEntryOrder(three, ["b", "a"]).entries.map((item) => [item._id, item.position])).toEqual([
      ["b", 100],
      ["a", 200],
      ["c", 300],
    ]);
    expect(withoutHistory(OVERVIEW, new Set(["task:preneto"])).history.map((item) => item.refKey)).toEqual([
      "task:gotovo",
    ]);
    expect(withoutHistory(OVERVIEW, null).history).toEqual([]);
  });
});
