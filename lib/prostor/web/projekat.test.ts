// Preneto iz Devotion apps/web/lib/workspace.test.ts (main @ c05c40f), SPAJANJE S08.
import { describe, expect, test } from "vitest";

import { formatShortDate, tasksWord } from "./projekat";

describe("pluralizacija zadataka", () => {
  test("poštuje srpska pravila za jedinicu i male brojeve", () => {
    expect(tasksWord(1)).toBe("zadatak");
    expect(tasksWord(21)).toBe("zadatak");
    expect(tasksWord(2)).toBe("zadatka");
    expect(tasksWord(4)).toBe("zadatka");
    expect(tasksWord(23)).toBe("zadatka");
    expect(tasksWord(5)).toBe("zadataka");
    expect(tasksWord(11)).toBe("zadataka");
    expect(tasksWord(12)).toBe("zadataka");
    expect(tasksWord(14)).toBe("zadataka");
    expect(tasksWord(0)).toBe("zadataka");
  });
});

describe("kratak datum roka", () => {
  test("bez roka → „Bez roka”", () => {
    expect(formatShortDate()).toBe("Bez roka");
    expect(formatShortDate(null)).toBe("Bez roka");
    expect(formatShortDate(0)).toBe("Bez roka");
  });

  test("izlaz je isti kao raniji Intl sr-Latn-RS za svaki mesec", () => {
    const stari = new Intl.DateTimeFormat("sr-Latn-RS", { day: "numeric", month: "short" });
    for (let mesec = 0; mesec < 12; mesec += 1) {
      for (const dan of [1, 9, 15, 28]) {
        const trenutak = new Date(2026, mesec, dan, 12).getTime();
        expect(formatShortDate(trenutak)).toBe(stari.format(new Date(trenutak)));
      }
    }
    expect(formatShortDate(new Date(2026, 7, 15, 12).getTime())).toBe("15. avg");
  });
});
