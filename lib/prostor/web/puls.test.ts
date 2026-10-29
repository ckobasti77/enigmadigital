// Preneto iz Devotion apps/web/lib/puls.test.ts (main @ c05c40f), SPAJANJE S20.
import { describe, expect, test } from "vitest";

import {
  addWeeks,
  formatDaysStanding,
  formatWeekLabel,
  isCurrentWeek,
  localWeekStart,
  normalizeToLocalWeekStart,
  trendDelta,
  trendDirection,
} from "./puls";

function local(year: number, month: number, day: number, hour = 12) {
  return new Date(year, month - 1, day, hour, 0, 0, 0).getTime();
}

describe("granice nedelje", () => {
  test("nedelja počinje u ponedeljak 00:00 lokalno", () => {
    // 29. jul 2026. je sreda → nedelja počinje u ponedeljak 27.
    expect(localWeekStart(local(2026, 7, 29))).toBe(local(2026, 7, 27, 0));
    // Nedelja (dan) pripada nedelji koja je počela prethodnog ponedeljka.
    expect(localWeekStart(local(2026, 8, 2, 23))).toBe(local(2026, 7, 27, 0));
    // Ponedeljak sam sebi je početak.
    expect(localWeekStart(local(2026, 7, 27, 0))).toBe(local(2026, 7, 27, 0));
  });

  test("normalizacija bilo kog trenutka daje njegov ponedeljak", () => {
    expect(normalizeToLocalWeekStart(local(2026, 7, 31, 18))).toBe(
      local(2026, 7, 27, 0),
    );
  });

  test("addWeeks radi u oba smera i preko meseca", () => {
    const start = local(2026, 7, 27, 0);
    expect(addWeeks(start, 1)).toBe(local(2026, 8, 3, 0));
    expect(addWeeks(start, -1)).toBe(local(2026, 7, 20, 0));
    expect(addWeeks(start, -4)).toBe(local(2026, 6, 29, 0));
  });

  test("isCurrentWeek prepoznaje tekuću nedelju", () => {
    const now = local(2026, 7, 29);
    expect(isCurrentWeek(local(2026, 7, 27, 0), now)).toBe(true);
    expect(isCurrentWeek(local(2026, 7, 20, 0), now)).toBe(false);
  });
});

describe("oznaka nedelje", () => {
  function labelFor(weekStart: number) {
    return formatWeekLabel(weekStart, addWeeks(weekStart, 1));
  }

  test("unutar istog meseca spaja dane", () => {
    expect(labelFor(local(2026, 5, 11, 0))).toBe("11–17. maj 2026");
  });

  test("preko meseca ispisuje oba meseca", () => {
    expect(labelFor(local(2026, 4, 27, 0))).toBe("27. apr – 3. maj 2026");
  });

  test("preko godine ispisuje obe godine", () => {
    const label = labelFor(local(2025, 12, 29, 0));
    expect(label).toContain("2025");
    expect(label).toContain("2026");
  });
});

describe("trajanje i trend", () => {
  test("formatDaysStanding koristi srpsku pluralizaciju i nikad ne pokazuje nulu", () => {
    expect(formatDaysStanding(0)).toBe("1 dan");
    expect(formatDaysStanding(86_400_000)).toBe("1 dan");
    expect(formatDaysStanding(2 * 86_400_000)).toBe("2 dana");
    expect(formatDaysStanding(5 * 86_400_000)).toBe("5 dana");
    expect(formatDaysStanding(21 * 86_400_000)).toBe("21 dan");
  });

  test("smer i razlika trenda", () => {
    expect(trendDirection({ current: 5, previous: 3 })).toBe("up");
    expect(trendDirection({ current: 2, previous: 6 })).toBe("down");
    expect(trendDirection({ current: 4, previous: 4 })).toBe("flat");
    expect(trendDelta({ current: 5, previous: 3 })).toBe(2);
    expect(trendDelta({ current: 1, previous: 4 })).toBe(-3);
  });
});

// SPAJANJE S20 (plan S18 §5.2): Europe/Belgrade bez obzira na zonu mašine.
describe("nedelja u Europe/Belgrade", () => {
  const ZONA = "Europe/Belgrade";

  test("početak nedelje je ponedeljak 00:00 po Beogradu (leto, UTC+2)", () => {
    // Sreda 29. jul 2026, 12:00 po Beogradu = 10:00 UTC.
    const sreda = Date.UTC(2026, 6, 29, 10, 0);
    expect(localWeekStart(sreda, ZONA)).toBe(Date.UTC(2026, 6, 26, 22, 0));
  });

  test("addWeeks preko promene vremena 25. 10. 2026 (nedelja od 169 sati)", () => {
    const pre = localWeekStart(Date.UTC(2026, 9, 21, 10, 0), ZONA);
    expect(pre).toBe(Date.UTC(2026, 9, 18, 22, 0)); // pon 19. 10. 00:00 CEST
    const posle = addWeeks(pre, 1, ZONA);
    expect(posle).toBe(Date.UTC(2026, 9, 25, 23, 0)); // pon 26. 10. 00:00 CET
    expect(posle - pre).toBe(7 * 86_400_000 + 3_600_000);
    expect(addWeeks(posle, -1, ZONA)).toBe(pre);
  });

  test("isCurrentWeek i oznaka nedelje po Beogradu", () => {
    const ponedeljak = Date.UTC(2026, 9, 25, 23, 0);
    // Nedelja 1. 11. 2026, 23:30 po Beogradu je još ista nedelja.
    expect(isCurrentWeek(ponedeljak, Date.UTC(2026, 10, 1, 22, 30), ZONA)).toBe(true);
    expect(isCurrentWeek(ponedeljak, Date.UTC(2026, 10, 1, 23, 30), ZONA)).toBe(false);
    expect(formatWeekLabel(ponedeljak, addWeeks(ponedeljak, 1, ZONA), ZONA)).toBe("26. okt – 1. nov 2026");
  });

  test("imena meseci su ista kao u lib/format.ts", async () => {
    const { MESECI_KRATKO } = await import("../../format");
    const { SR_MONTHS_SHORT } = await import("../dates");
    expect([...SR_MONTHS_SHORT]).toEqual([...MESECI_KRATKO]);
  });
});
