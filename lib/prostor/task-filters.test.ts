// Preneto iz Devotion packages/shared/src/task-filters.test.ts (main @ c05c40f), SPAJANJE S02.
import { describe, expect, test } from "vitest";

import { noonOfDayKey, startOfDayKey } from "./dates";
import {
  activeFilterCount,
  applyTaskFilters,
  clearTaskFilters,
  EMPTY_TASK_FILTERS,
  groupTaskRows,
  hasActiveFilters,
  matchesTaskQuery,
  normalizeSearchText,
  openTasksPhrase,
  pageOfGroup,
  rowStartupKey,
  toggleFilterValue,
  type TaskFilters,
} from "./task-filters";
import { rowFromPersonal, rowFromTaskItem, type TaskRowModel } from "./task-row";

const BG = "Europe/Belgrade";
const NOW = startOfDayKey("2026-10-24", BG) + 9.5 * 3_600_000; // subota 09:30
const due = (key: string) => noonOfDayKey(key, BG);

const CR = { _id: "s1", name: "Cluck Rush", logoUrl: null };
const SM = { _id: "s2", name: "Scan Me", logoUrl: null };

function task(
  id: string,
  title: string,
  partial: Partial<Parameters<typeof rowFromTaskItem>[0]> = {},
): TaskRowModel {
  return rowFromTaskItem(
    {
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
    },
    new Map(),
  );
}

function personal(id: string, title: string, partial: Partial<Parameters<typeof rowFromPersonal>[0]> = {}) {
  return rowFromPersonal(
    { _id: id, title, status: "open", priority: null, dueDate: null, createdAt: 1, ...partial },
    new Map(),
  );
}

const ROWS: TaskRowModel[] = [
  task("t1", "Ugovor sa dobavljačem", { dueDate: due("2026-10-22"), taskPriority: "high", taskStatus: "in_progress" }),
  task("t2", "Landing za Q4", { dueDate: due("2026-10-30"), area: { label: "Marketing" } }),
  task("t3", "Faktura za hosting", { workspace: SM, taskStatus: "done", area: null }),
  task("t4", "Prijava na staging", { workspace: SM, taskStatus: "blocked", taskPriority: "urgent", dueDate: due("2026-10-24") }),
  personal("p1", "Platiti račun za struju", { dueDate: due("2026-10-23") }),
  personal("p2", "Poklon za Teodoru Đorđević", { priority: "low" }),
  personal("p3", "Pozvati računovođu", { status: "done", dueDate: due("2026-10-24") }),
];

const keys = (rows: TaskRowModel[]) => rows.map((row) => row.id);
const withFilters = (partial: Partial<TaskFilters>) => applyTaskFilters(ROWS, { ...EMPTY_TASK_FILTERS, ...partial }, NOW, BG);

describe("filteri", () => {
  test(`bez filtera: svi otvoreni, završeni samo uz „Prikaži završene"`, () => {
    expect(keys(withFilters({}))).toEqual(["t1", "t2", "t4", "p1", "p2"]);
    expect(keys(withFilters({ showDone: true }))).toEqual(["t1", "t2", "t3", "t4", "p1", "p2", "p3"]);
  });

  test(`startup, uključujući „Lično"`, () => {
    expect(keys(withFilters({ workspaceIds: ["s2"] }))).toEqual(["t4"]);
    expect(keys(withFilters({ workspaceIds: ["licno"] }))).toEqual(["p1", "p2"]);
    expect(keys(withFilters({ workspaceIds: ["s1", "licno"] }))).toEqual(["t1", "t2", "p1", "p2"]);
    expect(rowStartupKey(ROWS[4])).toBe("licno");
  });

  test(`status (lični „Otvoreno" je svoj status)`, () => {
    expect(keys(withFilters({ statuses: ["in_progress", "blocked"] }))).toEqual(["t1", "t4"]);
    expect(keys(withFilters({ statuses: ["open"] }))).toEqual(["p1", "p2"]);
    // Završen zadatak i uz „Prikaži završene" prolazi samo ako je i status izabran.
    expect(keys(withFilters({ statuses: ["next"], showDone: true }))).toEqual(["t2"]);
  });

  test(`prioritet, uključujući „Bez prioriteta"`, () => {
    expect(keys(withFilters({ priorities: ["urgent", "high"] }))).toEqual(["t1", "t4"]);
    expect(keys(withFilters({ priorities: ["none"] }))).toEqual(["p1"]);
    expect(keys(withFilters({ priorities: ["low", "none"] }))).toEqual(["p1", "p2"]);
  });

  test("rok po kantama (prekoračeno, danas, nedelja, bez roka)", () => {
    expect(keys(withFilters({ due: ["overdue"] }))).toEqual(["t1", "p1"]);
    expect(keys(withFilters({ due: ["today"] }))).toEqual(["t4"]);
    expect(keys(withFilters({ due: ["week"] }))).toEqual(["t2"]);
    expect(keys(withFilters({ due: ["none"] }))).toEqual(["p2"]);
    expect(keys(withFilters({ due: ["today"], showDone: true }))).toEqual(["t4", "p3"]);
  });

  test("kategorije se kombinuju (I), vrednosti u kategoriji (ILI)", () => {
    expect(keys(withFilters({ workspaceIds: ["s1", "s2"], due: ["overdue", "today"] }))).toEqual(["t1", "t4"]);
    expect(keys(withFilters({ workspaceIds: ["licno"], priorities: ["urgent"] }))).toEqual([]);
  });

  test("ulaz se ne menja i redosled se čuva", () => {
    const before = ROWS.map((row) => row.id);
    withFilters({ priorities: ["high"] });
    expect(ROWS.map((row) => row.id)).toEqual(before);
  });
});

describe("pretraga", () => {
  test("bez dijakritika i bez obzira na velika slova", () => {
    expect(normalizeSearchText("  Čačak   ŠIŽ đak ")).toBe("cacak siz djak");
    expect(keys(withFilters({ query: "racun" }))).toEqual(["p1"]);
    expect(keys(withFilters({ query: "RAČUN" }))).toEqual(["p1"]);
  });

  test(`đ: i „dj" i „d" pogađaju`, () => {
    const row = ROWS[5];
    expect(matchesTaskQuery(row, "djordjevic")).toBe(true);
    expect(matchesTaskQuery(row, "dordevic")).toBe(true);
    expect(matchesTaskQuery(row, "Đorđević")).toBe(true);
  });

  test("sve reči moraju da se nađu; traži se i startup i oblast", () => {
    expect(keys(withFilters({ query: "landing q4" }))).toEqual(["t2"]);
    expect(keys(withFilters({ query: "landing hosting" }))).toEqual([]);
    expect(keys(withFilters({ query: "scan" }))).toEqual(["t4"]);
    expect(keys(withFilters({ query: "marketing" }))).toEqual(["t2"]);
    expect(keys(withFilters({ query: "lično" }))).toEqual(["p1", "p2"]);
    expect(keys(withFilters({ query: "   " }))).toEqual(["t1", "t2", "t4", "p1", "p2"]);
  });
});

describe("brojač i čišćenje", () => {
  test("svaka kategorija sa izborom broji se jednom; pretraga i završeni ne", () => {
    expect(activeFilterCount(EMPTY_TASK_FILTERS)).toBe(0);
    expect(activeFilterCount({ ...EMPTY_TASK_FILTERS, workspaceIds: ["s1", "s2"], due: ["today"] })).toBe(2);
    expect(activeFilterCount({ ...EMPTY_TASK_FILTERS, query: "x", showDone: true })).toBe(0);
    expect(hasActiveFilters({ ...EMPTY_TASK_FILTERS, query: "x" })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_TASK_FILTERS, query: "  ", showDone: true })).toBe(false);
  });

  test(`„Očisti filtere" briše kategorije i pretragu, a „Prikaži završene" ostaje`, () => {
    const cleared = clearTaskFilters({
      workspaceIds: ["s1"],
      statuses: ["next"],
      priorities: ["none"],
      due: ["overdue"],
      showDone: true,
      query: "ugovor",
    });
    expect(cleared).toEqual({ ...EMPTY_TASK_FILTERS, showDone: true });
  });

  test("uključi/isključi vrednost", () => {
    expect(toggleFilterValue(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleFilterValue(["a", "b"], "a")).toEqual(["b"]);
  });
});

describe("grupisanje", () => {
  const open = withFilters({});

  test("po startupu: Lično prvo, pa startupi po zadatom redosledu", () => {
    const groups = groupTaskRows(open, "startup", NOW, { zone: BG, startupOrder: ["s2", "s1"] });
    expect(groups.map((group) => group.title)).toEqual(["Lično", "Scan Me", "Cluck Rush"]);
    expect(groups.map((group) => group.key)).toEqual(["licno", "s2", "s1"]);
    // Unutar grupe po roku (bez roka na kraju).
    expect(keys(groups[0].items)).toEqual(["p1", "p2"]);
    expect(keys(groups[2].items)).toEqual(["t1", "t2"]);
  });

  test("po roku: kante redom, prazne se preskaču", () => {
    const groups = groupTaskRows(open, "due", NOW, { zone: BG });
    expect(groups.map((group) => group.title)).toEqual(["Prekoračeno", "Danas", "Narednih 7 dana", "Bez roka"]);
    expect(keys(groups[0].items)).toEqual(["t1", "p1"]);
  });

  test("po statusu: u toku prvo, gotovo poslednje", () => {
    const groups = groupTaskRows(withFilters({ showDone: true }), "status", NOW, { zone: BG });
    expect(groups.map((group) => group.title)).toEqual(["U toku", "Sledeće", "Otvoreno", "Čeka", "Gotovo"]);
    expect(keys(groups[4].items)).toEqual(["p3", "t3"]);
  });

  test("po prioritetu: hitno prvo, bez prioriteta poslednje", () => {
    const groups = groupTaskRows(open, "priority", NOW, { zone: BG });
    expect(groups.map((group) => group.title)).toEqual(["Hitno", "Visok", "Srednji", "Nizak", "Bez prioriteta"]);
    expect(keys(groups[4].items)).toEqual(["p1"]);
  });

  test("grupa vraća iste objekte reda (bez kopiranja)", () => {
    const groups = groupTaskRows(open, "startup", NOW, { zone: BG });
    expect(groups.flatMap((group) => group.items).every((row) => open.includes(row))).toBe(true);
  });

  test(`„Prikaži još": vidljivo i preostalo`, () => {
    expect(pageOfGroup([1, 2, 3, 4, 5], 2)).toEqual({ visible: [1, 2], remaining: 3 });
    expect(pageOfGroup([1, 2], 100)).toEqual({ visible: [1, 2], remaining: 0 });
  });

  test("podnaslov: srpska množina", () => {
    expect(openTasksPhrase(1)).toBe("1 otvoren");
    expect(openTasksPhrase(3)).toBe("3 otvorena");
    expect(openTasksPhrase(11)).toBe("11 otvorenih");
    expect(openTasksPhrase(21)).toBe("21 otvoren");
    expect(openTasksPhrase(23)).toBe("23 otvorena");
  });
});
