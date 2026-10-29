// Preneto iz Devotion packages/shared/src/my-day.test.ts (main @ c05c40f), SPAJANJE S02.
import { describe, expect, test } from "vitest";

import { noonOfDayKey, startOfDayKey } from "./dates";
import {
  carryOverCandidates,
  countOpenByStartup,
  fromOverview,
  groupMyDay,
  groupMyDayByStartup,
  myDayRefKey,
  parseRefKey,
  planSuggestions,
  type MyDayInput,
  type MyDayItem,
  type MyDayPlanEntry,
  type MyDaySectionId,
} from "./my-day";

const BG = "Europe/Belgrade";
const HOUR = 3_600_000;
const TODAY = "2026-10-24"; // subota
const at = (key: string, hour: number) => startOfDayKey(key, BG) + hour * HOUR;
const NOW = at(TODAY, 10);
const noon = (key: string) => noonOfDayKey(key, BG);

let counter = 0;
function item(title: string, overrides: Partial<MyDayItem> = {}): MyDayItem {
  counter += 1;
  const kind = overrides.kind ?? "task";
  const id = overrides.id ?? `id${counter}`;
  return {
    key: myDayRefKey(kind, id),
    kind,
    id,
    title,
    status: kind === "personal" ? "open" : "backlog",
    priority: null,
    dueDate: null,
    completedAt: null,
    createdAt: counter,
    workspaceId: kind === "personal" ? null : "s1",
    startupName: kind === "personal" ? null : "Cluck Rush",
    areaLabel: null,
    isCreator: false,
    isAssignee: true,
    ...overrides,
  };
}

function entry(target: MyDayItem, dayKey = TODAY, position = 1024): MyDayPlanEntry {
  return { entryId: `e-${target.key}-${dayKey}`, refKey: target.key, dayKey, position };
}

function input(
  items: MyDayItem[],
  plan: MyDayPlanEntry[] = [],
  history: MyDayPlanEntry[] = [],
  now = NOW,
): MyDayInput {
  return { items, plan, history, now, zone: BG };
}

function sectionOf(result: ReturnType<typeof groupMyDay>, title: string) {
  return result.sections.find((section) => section.rows.some((row) => row.title === title))?.id;
}

function titlesIn(result: ReturnType<typeof groupMyDay>, id: MyDaySectionId) {
  return result.sections.find((section) => section.id === id)!.rows.map((row) => row.title);
}

describe("sekcije Moj dan", () => {
  test("svaka sekcija dobija svoju stavku, ostalo se ne prikazuje", () => {
    const planned = item("planirano");
    const result = groupMyDay(
      input(
        [
          item("prekoračeno", { dueDate: noon("2026-10-22") }),
          item("danas", { dueDate: noon(TODAY) }),
          planned,
          item("u toku", { status: "in_progress" }),
          item("uskoro", { dueDate: noon("2026-10-27") }),
          item("blokirano", { status: "blocked" }),
          item("završeno danas", { status: "done", completedAt: at(TODAY, 9) }),
          item("završeno juče", { status: "done", completedAt: at("2026-10-23", 18) }),
          item("bez roka"),
          item("daleko", { dueDate: noon("2026-11-05") }),
        ],
        [entry(planned)],
      ),
    );
    expect(result.sections.map((section) => [section.id, section.title, section.rows.map((r) => r.title)])).toEqual([
      ["overdue", "Prekoračeno", ["prekoračeno"]],
      ["today", "Danas", ["danas"]],
      ["planned", "Planirano", ["planirano"]],
      ["inProgress", "U toku", ["u toku"]],
      ["soon", "Uskoro", ["uskoro"]],
      ["blocked", "Blokirano", ["blokirano"]],
      ["doneToday", "Završeno danas", ["završeno danas"]],
    ]);
    expect(result.sections.filter((s) => s.collapsedByDefault).map((s) => s.id)).toEqual([
      "blocked",
      "doneToday",
    ]);
    expect(result.counts.soon).toBe(1);
  });

  test("jednom: stavka koja ispunjava više uslova je u tačno jednoj sekciji", () => {
    const many = item("sve odjednom", {
      dueDate: noon("2026-10-20"),
      status: "in_progress",
    });
    const duplicate = { ...many }; // isti key dva puta u ulazu
    const result = groupMyDay(input([many, duplicate], [entry(many)]));
    const occurrences = result.sections.flatMap((s) => s.rows).filter((r) => r.key === many.key);
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].section).toBe("overdue");
    expect(occurrences[0].planned).toBe(true);
  });

  test("rok danas pobeđuje plan, a stavka nosi oznaku planned", () => {
    const both = item("plan i rok", { dueDate: noon(TODAY) });
    const result = groupMyDay(input([both], [entry(both)]));
    const row = result.sections.find((s) => s.id === "today")!.rows[0];
    expect(row.title).toBe("plan i rok");
    expect(row.planned).toBe(true);
    expect(titlesIn(result, "planned")).toEqual([]);
  });

  test("prednosti: plan > u toku > blokirano > uskoro, prekoračeno > blokirano", () => {
    const plannedInProgress = item("planirano u toku", { status: "in_progress" });
    const result = groupMyDay(
      input(
        [
          plannedInProgress,
          item("u toku uskoro", { status: "in_progress", dueDate: noon("2026-10-26") }),
          item("blokirano uskoro", { status: "blocked", dueDate: noon("2026-10-27") }),
          item("blokirano prekoračeno", { status: "blocked", dueDate: noon("2026-10-21") }),
        ],
        [entry(plannedInProgress)],
      ),
    );
    expect(sectionOf(result, "planirano u toku")).toBe("planned");
    expect(sectionOf(result, "u toku uskoro")).toBe("inProgress");
    expect(sectionOf(result, "blokirano uskoro")).toBe("blocked");
    expect(sectionOf(result, "blokirano prekoračeno")).toBe("overdue");
  });

  test("lični zadaci prate iste rokove i plan", () => {
    const personal = item("kupi poklon", { kind: "personal", dueDate: noon(TODAY) });
    const result = groupMyDay(input([personal, item("lično bez roka", { kind: "personal" })]));
    expect(titlesIn(result, "today")).toEqual(["kupi poklon"]);
    expect(result.sections.flatMap((s) => s.rows)).toHaveLength(1);
  });

  test("granica „Uskoro” je 7 dana", () => {
    const result = groupMyDay(
      input([
        item("7 dana", { dueDate: noon("2026-10-31") }),
        item("8 dana", { dueDate: noon("2026-11-01") }),
      ]),
    );
    expect(titlesIn(result, "soon")).toEqual(["7 dana"]);
  });

  test("ponoć: posle ponoći jučerašnje završeno nije „danas”, a rok postaje prekoračen", () => {
    const doneLate = item("završeno u 23:59", { status: "done", completedAt: at(TODAY, 23) + 59 * 60_000 });
    const dueToday = item("rok subota", { dueDate: noon(TODAY) });
    const before = groupMyDay(input([doneLate, dueToday], [], [], at(TODAY, 23) + 59 * 60_000));
    expect(titlesIn(before, "doneToday")).toEqual(["završeno u 23:59"]);
    expect(titlesIn(before, "today")).toEqual(["rok subota"]);
    // Nedelja 25.10. (dan prelaza vremena), pola sata posle ponoći.
    const after = groupMyDay(input([doneLate, dueToday], [], [], at("2026-10-25", 0) + 30 * 60_000));
    expect(titlesIn(after, "doneToday")).toEqual([]);
    expect(titlesIn(after, "overdue")).toEqual(["rok subota"]);
  });

  test("plan drugog dana se ignoriše", () => {
    const tomorrowOnly = item("plan za sutra");
    const result = groupMyDay(input([tomorrowOnly], [entry(tomorrowOnly, "2026-10-25")]));
    expect(result.sections.flatMap((s) => s.rows)).toHaveLength(0);
  });
});

describe("redosled u sekcijama", () => {
  test("prekoračeno: najstarije prvo; planirano: po poziciji; danas: po prioritetu; završeno: najnovije prvo", () => {
    const p1 = item("plan drugi");
    const p2 = item("plan prvi");
    const result = groupMyDay(
      input(
        [
          item("kasni 1", { dueDate: noon("2026-10-23") }),
          item("kasni 5", { dueDate: noon("2026-10-19") }),
          p1,
          p2,
          item("danas nizak", { dueDate: noon(TODAY), priority: "low" }),
          item("danas hitno", { dueDate: noon(TODAY), priority: "urgent" }),
          item("rano završeno", { status: "done", completedAt: at(TODAY, 8) }),
          item("kasno završeno", { status: "done", completedAt: at(TODAY, 9) }),
        ],
        [entry(p1, TODAY, 2048), entry(p2, TODAY, 1024)],
      ),
    );
    expect(titlesIn(result, "overdue")).toEqual(["kasni 5", "kasni 1"]);
    expect(titlesIn(result, "planned")).toEqual(["plan prvi", "plan drugi"]);
    expect(titlesIn(result, "today")).toEqual(["danas hitno", "danas nizak"]);
    expect(titlesIn(result, "doneToday")).toEqual(["kasno završeno", "rano završeno"]);
  });
});

describe("prsten napretka", () => {
  test("obaveze = planirano danas ∪ rok danas, svaka jednom", () => {
    const plannedOpen = item("planirano otvoreno");
    const plannedDone = item("planirano završeno", { status: "done", completedAt: at(TODAY, 9) });
    const dueToday = item("rok danas");
    dueToday.dueDate = noon(TODAY);
    const both = item("i plan i rok", { dueDate: noon(TODAY) });
    const doneYesterday = item("planirano, završeno juče", {
      status: "done",
      completedAt: at("2026-10-23", 9),
    });
    const result = groupMyDay(
      input(
        [plannedOpen, plannedDone, dueToday, both, doneYesterday, item("uskoro", { dueDate: noon("2026-10-26") })],
        [entry(plannedOpen), entry(plannedDone), entry(both), entry(doneYesterday)],
      ),
    );
    expect(result.progress).toEqual({ done: 1, total: 4 });
  });

  test("prazan dan: 0/0", () => {
    expect(groupMyDay(input([])).progress).toEqual({ done: 0, total: 0 });
  });
});

describe("po startupu", () => {
  test("Lično prvo, pa zadat redosled; završeno danas odvojeno", () => {
    const result = groupMyDayByStartup(
      input([
        item("A", { workspaceId: "s1", startupName: "Cluck Rush", dueDate: noon(TODAY) }),
        item("B", { workspaceId: "s2", startupName: "Scan Me", status: "in_progress" }),
        item("C", { kind: "personal", dueDate: noon("2026-10-20") }),
        item("D", { workspaceId: "s3", startupName: "Beauty Masterclass", dueDate: noon("2026-10-26") }),
        item("E", { workspaceId: "s1", startupName: "Cluck Rush", dueDate: noon("2026-10-21") }),
        item("F", { status: "done", completedAt: at(TODAY, 9) }),
        item("G bez sekcije", { workspaceId: "s4", startupName: "Nauči AI" }),
      ]),
      ["s2", "s1"],
    );
    expect(result.groups.map((group) => [group.title, group.rows.map((r) => r.title)])).toEqual([
      ["Lično", ["C"]],
      ["Scan Me", ["B"]],
      ["Cluck Rush", ["E", "A"]],
      ["Beauty Masterclass", ["D"]],
    ]);
    expect(result.doneToday.map((row) => row.title)).toEqual(["F"]);
  });
});

describe("Isplaniraj dan — predlozi", () => {
  test("razlozi po prednosti i šta se ne predlaže", () => {
    const planned = item("već planirano", { status: "next" });
    const suggestions = planSuggestions(
      input(
        [
          planned,
          item("rok ove nedelje", { dueDate: noon("2026-10-28") }),
          item("hitno bez roka", { priority: "urgent" }),
          item("sledeće", { status: "next" }),
          item("lično", { kind: "personal" }),
          item("prekoračeno", { dueDate: noon("2026-10-20") }),
          item("rok danas", { dueDate: noon(TODAY) }),
          item("u toku", { status: "in_progress" }),
          item("čeka", { status: "blocked", priority: "high" }),
          item("gotovo", { status: "done", completedAt: at(TODAY, 8) }),
          item("običan backlog"),
        ],
        [entry(planned)],
      ),
    );
    expect(suggestions.map((s) => [s.row.title, s.reason])).toEqual([
      ["rok ove nedelje", "dueThisWeek"],
      ["hitno bez roka", "priority"],
      ["sledeće", "next"],
      ["lično", "personal"],
    ]);
  });

  test("granica broja predloga", () => {
    const many = Array.from({ length: 40 }, (_, index) => item(`lično ${index}`, { kind: "personal" }));
    expect(planSuggestions(input(many))).toHaveLength(30);
    expect(planSuggestions(input(many), 5)).toHaveLength(5);
  });
});

describe("Preneto od ranije", () => {
  test("nezavršeno iz poslednjih 7 dana, jednom, bez danas planiranog i završenog", () => {
    const twoDays = item("pre dva dana");
    const repeated = item("ponavljano");
    const tooOld = item("pre osam dana");
    const done = item("završeno", { status: "done", completedAt: at("2026-10-23", 9) });
    const plannedToday = item("već vraćeno");
    const result = carryOverCandidates(
      input(
        [twoDays, repeated, tooOld, done, plannedToday],
        [entry(plannedToday)],
        [
          entry(twoDays, "2026-10-22"),
          entry(repeated, "2026-10-21"),
          entry(repeated, "2026-10-23"),
          entry(tooOld, "2026-10-16"),
          entry(done, "2026-10-23"),
          entry(plannedToday, "2026-10-23"),
          { entryId: "x", refKey: "task:obrisan", dayKey: "2026-10-23", position: 1 },
        ],
      ),
    );
    expect(result.map((c) => [c.row.title, c.fromDayKey])).toEqual([
      ["ponavljano", "2026-10-23"],
      ["pre dva dana", "2026-10-22"],
    ]);
    expect(result[0].entryId).toBe(`e-${repeated.key}-2026-10-23`);
  });

  test("granica je tačno 7 dana", () => {
    const seven = item("sedam");
    const result = carryOverCandidates(input([seven], [], [entry(seven, "2026-10-17")]));
    expect(result).toHaveLength(1);
  });
});

describe("pomoćne", () => {
  test("refKey tam i nazad", () => {
    expect(myDayRefKey("task", "abc")).toBe("task:abc");
    expect(parseRefKey("personal:xyz")).toEqual({ kind: "personal", id: "xyz" });
    expect(parseRefKey("idea:1")).toBeNull();
    expect(parseRefKey("task:")).toBeNull();
    expect(parseRefKey("bez")).toBeNull();
  });

  test("broj mojih otvorenih po startupu", () => {
    expect(
      countOpenByStartup([
        item("a", { workspaceId: "s1" }),
        item("b", { workspaceId: "s1", status: "in_progress" }),
        item("c", { workspaceId: "s1", status: "done" }),
        item("d", { workspaceId: "s2", isAssignee: false }),
        item("e", { kind: "personal" }),
        item("f", { workspaceId: "s2" }),
      ]),
    ).toEqual({ s1: 2, s2: 1 });
  });

  test("fromOverview mapira zadatke i lične stavke", () => {
    const mapped = fromOverview(
      {
        tasks: [
          {
            _id: "t1",
            title: "Zadatak",
            taskStatus: null,
            taskPriority: "high",
            dueDate: noon(TODAY),
            completedAt: null,
            createdAt: 1,
            isCreator: true,
            isAssignee: false,
            workspace: { _id: "s1", name: "Cluck Rush" },
            area: { label: "Dev" },
          },
        ],
        personal: [
          {
            _id: "p1",
            title: "Lično",
            status: "open",
            priority: null,
            dueDate: null,
            completedAt: null,
            createdAt: 2,
          },
        ],
        entries: [{ _id: "e1", dayKey: TODAY, refKey: "personal:p1", position: 1024 }],
        history: [],
      },
      NOW,
      BG,
    );
    expect(mapped.items[0]).toMatchObject({
      key: "task:t1",
      status: "backlog",
      startupName: "Cluck Rush",
      areaLabel: "Dev",
      isAssignee: false,
    });
    expect(mapped.items[1]).toMatchObject({ key: "personal:p1", workspaceId: null });
    expect(mapped.plan).toEqual([
      { entryId: "e1", refKey: "personal:p1", dayKey: TODAY, position: 1024 },
    ]);
    expect(groupMyDay(mapped).counts.planned).toBe(1);
  });
});
