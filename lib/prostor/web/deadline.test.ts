// Preneto iz Devotion apps/web/lib/deadline.test.ts (main @ c05c40f), SPAJANJE S12.
import { describe, expect, test } from "vitest";

import {
  bucketTasksByZone,
  classifyDeadline,
  classifyTriageZone,
  compareInZone,
  countOverdue,
  daysWord,
  deadlineAriaLabel,
  deadlineLabel,
  dueDayDiff,
  nextLocalMidnight,
  startOfLocalDay,
} from "./deadline";
import type { TaskPriority, TaskStatus } from "./projekat";

/** Rokovi se u aplikaciji upisuju u lokalno podne, kao `fromDateInputValue`. */
function localNoon(year: number, month: number, day: number) {
  return new Date(year, month - 1, day, 12, 0, 0, 0).getTime();
}

function localTime(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes = 0,
) {
  return new Date(year, month - 1, day, hours, minutes, 0, 0).getTime();
}

function task(overrides: {
  dueDate?: number | null;
  taskStatus?: TaskStatus | null;
  taskPriority?: TaskPriority | null;
  taskSortAt?: number;
}) {
  return {
    dueDate: overrides.dueDate ?? null,
    taskStatus: overrides.taskStatus ?? "backlog",
    taskPriority: overrides.taskPriority ?? "medium",
    ...(overrides.taskSortAt === undefined
      ? {}
      : { taskSortAt: overrides.taskSortAt }),
  };
}

describe("granice dana", () => {
  test("startOfLocalDay vraća lokalnu ponoć istog dana", () => {
    expect(startOfLocalDay(localTime(2026, 7, 29, 23, 59))).toBe(
      localTime(2026, 7, 29, 0, 0),
    );
  });

  test("dueDayDiff meri kalendarske dane, ne protekle sate", () => {
    // Rok danas u podne, a sada je isti dan uveče → još nije prošao.
    expect(dueDayDiff(localNoon(2026, 7, 29), localTime(2026, 7, 29, 23, 59))).toBe(0);
    // Rok juče u podne, a sada je danas rano ujutru → kasni jedan dan.
    expect(dueDayDiff(localNoon(2026, 7, 28), localTime(2026, 7, 29, 0, 1))).toBe(-1);
    expect(dueDayDiff(localNoon(2026, 8, 5), localNoon(2026, 7, 29))).toBe(7);
    expect(dueDayDiff(localNoon(2026, 8, 6), localNoon(2026, 7, 29))).toBe(8);
  });

  test("nextLocalMidnight je ponoć sledećeg dana", () => {
    expect(nextLocalMidnight(localTime(2026, 7, 29, 15, 30))).toBe(
      localTime(2026, 7, 30, 0, 0),
    );
  });
});

describe("klasifikacija roka", () => {
  const now = localTime(2026, 7, 29, 10, 0);

  test("zadatak sa današnjim rokom nije prekoračen ni u 23:59", () => {
    const late = localTime(2026, 7, 29, 23, 59);
    expect(
      classifyDeadline({ dueDate: localNoon(2026, 7, 29), taskStatus: "next", now: late })
        .urgency,
    ).toBe("today");
  });

  test("prepoznaje sve nivoe hitnosti", () => {
    const cases: Array<[number | null, string]> = [
      [localNoon(2026, 7, 26), "overdue"],
      [localNoon(2026, 7, 29), "today"],
      [localNoon(2026, 7, 30), "tomorrow"],
      [localNoon(2026, 8, 3), "week"],
      [localNoon(2026, 8, 5), "week"],
      [localNoon(2026, 8, 6), "later"],
      [null, "none"],
    ];
    for (const [dueDate, expected] of cases) {
      expect(
        classifyDeadline({ dueDate, taskStatus: "in_progress", now }).urgency,
      ).toBe(expected);
    }
  });

  test("završen zadatak nikad nije hitan", () => {
    expect(
      classifyDeadline({
        dueDate: localNoon(2026, 7, 1),
        taskStatus: "done",
        now,
      }).urgency,
    ).toBe("done");
  });
});

describe("oznake roka", () => {
  const now = localTime(2026, 7, 29, 10, 0);

  function labelFor(dueDate: number | null, taskStatus: TaskStatus | null = "next") {
    return deadlineLabel(classifyDeadline({ dueDate, taskStatus, now }), dueDate);
  }

  test("skraćene oznake se poravnavaju u kolonu", () => {
    expect(labelFor(localNoon(2026, 7, 26))).toBe("kasni 3 d");
    expect(labelFor(localNoon(2026, 7, 28))).toBe("kasni 1 d");
    expect(labelFor(localNoon(2026, 7, 29))).toBe("danas");
    expect(labelFor(localNoon(2026, 7, 30))).toBe("sutra");
    expect(labelFor(localNoon(2026, 8, 1))).toBe("D-3");
    expect(labelFor(null)).toBe("Bez roka");
  });

  test("aria oznake koriste pune reči i srpsku pluralizaciju", () => {
    function ariaFor(dueDate: number | null, taskStatus: TaskStatus | null = "next") {
      return deadlineAriaLabel(
        classifyDeadline({ dueDate, taskStatus, now }),
        dueDate,
      );
    }
    expect(ariaFor(localNoon(2026, 7, 28))).toBe("Rok je prošao: kasni 1 dan");
    expect(ariaFor(localNoon(2026, 7, 27))).toBe("Rok je prošao: kasni 2 dana");
    expect(ariaFor(localNoon(2026, 7, 29))).toBe("Rok je danas");
    expect(ariaFor(localNoon(2026, 7, 30))).toBe("Rok je sutra");
    expect(ariaFor(localNoon(2026, 8, 1))).toBe("Rok je za 3 dana");
    expect(ariaFor(null)).toBe("Bez roka");
    expect(ariaFor(null, "done")).toBe("Završeno");
  });

  test("daysWord poštuje srpsko pravilo za jedinicu", () => {
    expect(daysWord(1)).toBe("dan");
    expect(daysWord(2)).toBe("dana");
    expect(daysWord(5)).toBe("dana");
    expect(daysWord(11)).toBe("dana");
    expect(daysWord(21)).toBe("dan");
  });
});

describe("precedenca trijažnih zona", () => {
  const now = localTime(2026, 7, 29, 10, 0);

  test("zadatak pripada tačno jednoj zoni po tabeli precedence", () => {
    const cases: Array<[ReturnType<typeof task>, string | null]> = [
      [task({ dueDate: localNoon(2026, 7, 26) }), "gori"],
      [task({ dueDate: null, taskPriority: "urgent" }), "gori"],
      [task({ dueDate: localNoon(2026, 12, 1), taskPriority: "urgent" }), "gori"],
      [task({ dueDate: localNoon(2026, 8, 1), taskStatus: "blocked" }), "gori"],
      [task({ dueDate: localNoon(2026, 7, 29), taskStatus: "blocked" }), "gori"],
      [task({ dueDate: localNoon(2026, 7, 29) }), "danas"],
      [task({ dueDate: localNoon(2026, 7, 30) }), "nedelja"],
      [task({ dueDate: localNoon(2026, 8, 5) }), "nedelja"],
      [task({ dueDate: localNoon(2026, 8, 6) }), "kasnije"],
      [task({ dueDate: null }), "kasnije"],
      [task({ dueDate: localNoon(2026, 7, 26), taskStatus: "done" }), null],
      [task({ taskStatus: "done", taskPriority: "urgent" }), null],
    ];
    for (const [candidate, expected] of cases) {
      expect(classifyTriageZone(candidate, now)).toBe(expected);
    }
  });
});

describe("sortiranje i razvrstavanje", () => {
  const now = localTime(2026, 7, 29, 10, 0);

  test("u zoni Gori prvo idu prekoračeni rokovi, pa hitno, pa blokirano", () => {
    const blocked = task({ taskStatus: "blocked", dueDate: null });
    const urgent = task({ taskPriority: "urgent", dueDate: null });
    const lateByOne = task({ dueDate: localNoon(2026, 7, 28) });
    const lateByFive = task({ dueDate: localNoon(2026, 7, 24) });

    const sorted = [blocked, urgent, lateByOne, lateByFive].sort(
      compareInZone("gori", now),
    );

    expect(sorted).toEqual([lateByFive, lateByOne, urgent, blocked]);
  });

  test("ostale zone sortira po roku, pa po prioritetu", () => {
    const later = task({ dueDate: localNoon(2026, 8, 4) });
    const soonHigh = task({ dueDate: localNoon(2026, 8, 1), taskPriority: "high" });
    const soonLow = task({ dueDate: localNoon(2026, 8, 1), taskPriority: "low" });

    expect([later, soonLow, soonHigh].sort(compareInZone("nedelja", now))).toEqual([
      soonHigh,
      soonLow,
      later,
    ]);
  });

  test("bucketTasksByZone razvrstava, sortira i izbacuje završene", () => {
    const overdue = task({ dueDate: localNoon(2026, 7, 20) });
    const today = task({ dueDate: localNoon(2026, 7, 29) });
    const thisWeek = task({ dueDate: localNoon(2026, 8, 2) });
    const noDate = task({ dueDate: null });
    const finished = task({ dueDate: localNoon(2026, 7, 20), taskStatus: "done" });

    const buckets = bucketTasksByZone(
      [noDate, finished, thisWeek, overdue, today],
      now,
    );

    expect(buckets.gori).toEqual([overdue]);
    expect(buckets.danas).toEqual([today]);
    expect(buckets.nedelja).toEqual([thisWeek]);
    expect(buckets.kasnije).toEqual([noDate]);
  });

  test("countOverdue ne računa završene zadatke", () => {
    const tasks = [
      task({ dueDate: localNoon(2026, 7, 20) }),
      task({ dueDate: localNoon(2026, 7, 21) }),
      task({ dueDate: localNoon(2026, 7, 22), taskStatus: "done" }),
      task({ dueDate: localNoon(2026, 7, 29) }),
    ];
    expect(countOverdue(tasks, now)).toBe(2);
  });
});
