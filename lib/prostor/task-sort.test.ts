// Preneto iz Devotion packages/shared/src/task-sort.test.ts (main @ c05c40f), SPAJANJE S02.
import { describe, expect, test } from "vitest";

import { noonOfDayKey, startOfDayKey } from "./dates";
import {
  compareByDue,
  dueBucket,
  groupTasks,
  sortTasks,
  type GroupableTask,
} from "./task-sort";

const BG = "Europe/Belgrade";
const NOW = startOfDayKey("2026-10-24", BG) + 10 * 3_600_000;
const noon = (key: string) => noonOfDayKey(key, BG);

function task(
  title: string,
  overrides: Partial<GroupableTask> = {},
): GroupableTask {
  return {
    title,
    dueDate: null,
    priority: null,
    status: "backlog",
    createdAt: 1_000,
    workspaceId: "s1",
    startupName: "Cluck Rush",
    ...overrides,
  };
}

const titles = (items: ReadonlyArray<{ title: string }>) =>
  items.map((item) => item.title);

describe("sortiranje", () => {
  test("po roku: raniji prvi, bez roka na kraju, pa prioritet, createdAt, naslov", () => {
    const items = [
      task("bez roka"),
      task("kasnije", { dueDate: noon("2026-10-30") }),
      task("ranije srednji", { dueDate: noon("2026-10-25") }),
      task("ranije hitno", { dueDate: noon("2026-10-25"), priority: "urgent" }),
      task("ranije bez prioriteta stariji", { dueDate: noon("2026-10-25"), createdAt: 500 }),
    ];
    expect(titles(sortTasks(items, "due"))).toEqual([
      "ranije hitno",
      "ranije bez prioriteta stariji",
      "ranije srednji",
      "kasnije",
      "bez roka",
    ]);
  });

  test("bez prioriteta se ponaša kao srednji", () => {
    expect(
      compareByDue(task("isti", { priority: "medium" }), task("isti", { priority: null })),
    ).toBe(0);
    const none = task("bez", { priority: null });
    expect(titles(sortTasks([task("nizak", { priority: "low" }), none, task("visok", { priority: "high" })], "priority"))).toEqual([
      "visok",
      "bez",
      "nizak",
    ]);
  });

  test("po statusu: u toku, sledeće/otvoreno, čeka, backlog, gotovo", () => {
    const items = [
      task("gotovo", { status: "done" }),
      task("backlog"),
      task("čeka", { status: "blocked" }),
      task("lično", { status: "open", createdAt: 2_000 }),
      task("sledeće", { status: "next" }),
      task("u toku", { status: "in_progress" }),
    ];
    expect(titles(sortTasks(items, "status"))).toEqual([
      "u toku",
      "sledeće",
      "lično",
      "čeka",
      "backlog",
      "gotovo",
    ]);
  });

  test("po naslovu: srpski redosled, bez obzira na velika slova", () => {
    const items = [task("Čaj"), task("cvet"), task("Ćup"), task("ananas")];
    expect(titles(sortTasks(items, "title"))).toEqual(["ananas", "cvet", "Čaj", "Ćup"]);
  });

  test("ne menja ulaz i čuva redosled jednakih", () => {
    const a = task("isti");
    const b = task("isti");
    const items = [b, a];
    const sorted = sortTasks(items, "due");
    expect(sorted[0]).toBe(b);
    expect(sorted[1]).toBe(a);
    expect(items).toEqual([b, a]);
    expect(sorted).not.toBe(items);
  });
});

describe("kanta roka", () => {
  test("granice: prošlo, danas, sutra, 2–7 dana, kasnije, bez roka", () => {
    expect(dueBucket(null, NOW, BG)).toBe("none");
    expect(dueBucket(noon("2026-10-23"), NOW, BG)).toBe("overdue");
    expect(dueBucket(noon("2026-10-24"), NOW, BG)).toBe("today");
    expect(dueBucket(noon("2026-10-25"), NOW, BG)).toBe("tomorrow");
    expect(dueBucket(noon("2026-10-26"), NOW, BG)).toBe("week");
    expect(dueBucket(noon("2026-10-31"), NOW, BG)).toBe("week");
    expect(dueBucket(noon("2026-11-01"), NOW, BG)).toBe("later");
  });
});

describe("grupisanje", () => {
  const items = [
    task("A", { workspaceId: "s2", startupName: "Scan Me", dueDate: noon("2026-10-30") }),
    task("B", { workspaceId: null, startupName: null, status: "open", priority: "high" }),
    task("C", { workspaceId: "s1", dueDate: noon("2026-10-20"), status: "in_progress" }),
    task("D", { workspaceId: "s3", startupName: "Beauty Masterclass", status: "done" }),
  ];

  test("po startupu: Lično prvo, pa zadat redosled, pa ostali abecedno", () => {
    const groups = groupTasks(items, "startup", NOW, { zone: BG, startupOrder: ["s2"] });
    expect(groups.map((group) => [group.key, group.title])).toEqual([
      ["licno", "Lično"],
      ["s2", "Scan Me"],
      ["s3", "Beauty Masterclass"],
      ["s1", "Cluck Rush"],
    ]);
  });

  test("po roku, statusu i prioritetu, bez praznih grupa", () => {
    expect(groupTasks(items, "due", NOW, { zone: BG }).map((group) => group.title)).toEqual([
      "Prekoračeno",
      "Narednih 7 dana",
      "Bez roka",
    ]);
    expect(groupTasks(items, "status", NOW, { zone: BG }).map((group) => group.title)).toEqual([
      "U toku",
      "Otvoreno",
      "Neplanirano",
      "Gotovo",
    ]);
    expect(groupTasks(items, "priority", NOW, { zone: BG }).map((group) => group.title)).toEqual([
      "Visok",
      "Bez prioriteta",
    ]);
  });

  test("unutar grupe redosled po roku", () => {
    const [group] = groupTasks(
      [
        task("bez roka"),
        task("rano", { dueDate: noon("2026-10-25") }),
      ],
      "startup",
      NOW,
      { zone: BG },
    );
    expect(titles(group.items)).toEqual(["rano", "bez roka"]);
  });
});
