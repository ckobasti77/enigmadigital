// Preneto iz Devotion packages/shared/src/calendar.test.ts (main @ c05c40f), SPAJANJE S02.
import { describe, expect, test } from "vitest";

import {
  addMonthsToKey,
  CALENDAR_WEEKDAYS,
  calendarMoveForKey,
  datePickerChips,
  dayAriaLabel,
  dayKeyOfDue,
  dueFromDayKey,
  formatMonthTitle,
  initialMonth,
  monthGrid,
  moveCalendarFocus,
  selectedDatePickerChip,
  shiftMonth,
} from "./calendar";
import { dayKeyOf, noonOfDayKey, startOfDayKey } from "./dates";

const BG = "Europe/Belgrade";
const HOUR = 3_600_000;
const bg = (key: string, hour = 0) => startOfDayKey(key, BG) + hour * HOUR;
/** Lokalno podne u Beogradu u milisekundama, nezavisno od zone mašine. */
const noon = (key: string) => noonOfDayKey(key, BG);

describe("mesečna mreža", () => {
  test("oktobar 2026: 6 nedelja, prva kolona ponedeljak, počinje 28. septembra", () => {
    const grid = monthGrid("2026-10", { todayKey: "2026-10-24", selectedKey: null });
    expect(grid).toHaveLength(6);
    expect(grid.every((week) => week.length === 7)).toBe(true);
    // 1.10.2026. je četvrtak → ponedeljak te nedelje je 28.09.
    expect(grid[0][0].key).toBe("2026-09-28");
    expect(grid[0][3]).toMatchObject({ key: "2026-10-01", day: 1, inMonth: true });
    expect(grid[0][0].inMonth).toBe(false);
    expect(grid[5][6].key).toBe("2026-11-08");
  });

  test("danas, izabran dan i vikend su označeni", () => {
    const grid = monthGrid("2026-10", { todayKey: "2026-10-24", selectedKey: "2026-10-28" });
    const days = grid.flat();
    expect(days.filter((day) => day.isToday).map((day) => day.key)).toEqual(["2026-10-24"]);
    expect(days.filter((day) => day.isSelected).map((day) => day.key)).toEqual(["2026-10-28"]);
    // Kolone 6 i 7 su subota i nedelja.
    expect(grid[3].map((day) => day.isWeekend)).toEqual([false, false, false, false, false, true, true]);
    expect(grid[3][5].key).toBe("2026-10-24");
  });

  test("mesec koji počinje ponedeljkom nema rubnih dana napred (jun 2026)", () => {
    const grid = monthGrid("2026-06", { todayKey: "2026-10-24", selectedKey: null });
    expect(grid[0][0]).toMatchObject({ key: "2026-06-01", inMonth: true });
  });

  test("prestupni februar 2028 ima 29 dana u mreži", () => {
    const days = monthGrid("2028-02", { todayKey: "2028-02-01", selectedKey: null }).flat();
    expect(days.filter((day) => day.inMonth)).toHaveLength(29);
  });

  test("zaglavlje kolona je srpsko, ponedeljak prvi", () => {
    expect(CALENDAR_WEEKDAYS).toEqual(["pon", "uto", "sre", "čet", "pet", "sub", "ned"]);
  });
});

describe("meseci i nazivi", () => {
  test("pomeranje meseca preko godine", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-10", 14)).toBe("2027-12");
  });

  test("isti dan sledećeg meseca se skraćuje na kraj kraćeg meseca", () => {
    expect(addMonthsToKey("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsToKey("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonthsToKey("2026-03-31", -1)).toBe("2026-02-28");
    expect(addMonthsToKey("2026-10-24", 12)).toBe("2027-10-24");
  });

  test("naslov meseca i oznaka dana za čitač ekrana", () => {
    expect(formatMonthTitle("2026-10")).toBe("oktobar 2026");
    expect(formatMonthTitle("2027-01")).toBe("januar 2027");
    expect(dayAriaLabel("2026-10-24", "2026-10-24")).toBe("subota 24. oktobar 2026, danas");
    expect(dayAriaLabel("2026-10-28", "2026-10-24")).toBe("sreda 28. oktobar 2026");
  });

  test("neispravan mesec baca grešku", () => {
    expect(() => formatMonthTitle("2026-13")).toThrow();
    expect(() => monthGrid("2026-1", { todayKey: "2026-10-24", selectedKey: null })).toThrow();
  });
});

describe("tastatura", () => {
  test("tasteri se mapiraju na pomeraje", () => {
    expect(calendarMoveForKey("ArrowLeft")).toBe("prevDay");
    expect(calendarMoveForKey("ArrowRight")).toBe("nextDay");
    expect(calendarMoveForKey("ArrowUp")).toBe("prevWeek");
    expect(calendarMoveForKey("ArrowDown")).toBe("nextWeek");
    expect(calendarMoveForKey("PageUp")).toBe("prevMonth");
    expect(calendarMoveForKey("PageDown")).toBe("nextMonth");
    expect(calendarMoveForKey("PageUp", true)).toBe("prevYear");
    expect(calendarMoveForKey("PageDown", true)).toBe("nextYear");
    expect(calendarMoveForKey("Home")).toBe("weekStart");
    expect(calendarMoveForKey("End")).toBe("weekEnd");
    expect(calendarMoveForKey("Enter")).toBeNull();
    expect(calendarMoveForKey("a")).toBeNull();
  });

  test("pomeraji fokusa: dan, nedelja, mesec, godina, početak i kraj nedelje", () => {
    expect(moveCalendarFocus("2026-10-31", "nextDay")).toBe("2026-11-01");
    expect(moveCalendarFocus("2026-10-01", "prevDay")).toBe("2026-09-30");
    expect(moveCalendarFocus("2026-10-28", "nextWeek")).toBe("2026-11-04");
    expect(moveCalendarFocus("2026-10-03", "prevWeek")).toBe("2026-09-26");
    expect(moveCalendarFocus("2026-10-31", "nextMonth")).toBe("2026-11-30");
    expect(moveCalendarFocus("2026-03-31", "prevMonth")).toBe("2026-02-28");
    expect(moveCalendarFocus("2028-02-29", "nextYear")).toBe("2029-02-28");
    // 24.10.2026. je subota: nedelja počinje 19.10. (pon), završava 25.10. (ned).
    expect(moveCalendarFocus("2026-10-24", "weekStart")).toBe("2026-10-19");
    expect(moveCalendarFocus("2026-10-24", "weekEnd")).toBe("2026-10-25");
    expect(moveCalendarFocus("2026-10-19", "weekStart")).toBe("2026-10-19");
  });
});

describe("čipovi i vrednost → lokalno podne", () => {
  test("subota 24.10.: Danas = Vikend (subota), Sutra nedelja, Sledeće nedelje ponedeljak", () => {
    const chips = datePickerChips(bg("2026-10-24", 9), { zone: BG });
    expect(chips.map((chip) => chip.label)).toEqual(["Danas", "Sutra", "Vikend", "Sledeće nedelje", "Bez roka"]);
    expect(chips.map((chip) => chip.dayKey)).toEqual(["2026-10-24", "2026-10-25", "2026-10-24", "2026-10-26", null]);
    expect(chips[4].value).toBeNull();
  });

  test("vrednost svakog čipa je tačno lokalno podne svog dana", () => {
    for (const chip of datePickerChips(bg("2026-10-21", 23), { zone: BG })) {
      if (chip.value === null) continue;
      expect(chip.value).toBe(noon(chip.dayKey!));
      // Podne u Beogradu je 10:00 ili 11:00 UTC (leto/zima) — nikad drugi dan.
      expect(dayKeyOf(chip.value, BG)).toBe(chip.dayKey);
    }
  });

  test("podne preko kraja letnjeg vremena (nedelja 25.10. ima 25 sati)", () => {
    // Sreda 21.10.: Vikend je subota 24.10., Sledeće nedelje ponedeljak 26.10. (zimsko vreme).
    const chips = datePickerChips(bg("2026-10-21", 10), { zone: BG });
    const nextWeek = chips.find((chip) => chip.id === "nextWeek")!;
    expect(nextWeek.dayKey).toBe("2026-10-26");
    expect(new Date(nextWeek.value!).toISOString()).toBe("2026-10-26T11:00:00.000Z");
    const weekend = chips.find((chip) => chip.id === "weekend")!;
    expect(new Date(weekend.value!).toISOString()).toBe("2026-10-24T10:00:00.000Z");
  });

  test(`bez „Bez roka" kad brisanje nije dozvoljeno`, () => {
    expect(datePickerChips(bg("2026-10-24"), { zone: BG, allowClear: false }).map((chip) => chip.id)).toEqual([
      "today",
      "tomorrow",
      "weekend",
      "nextWeek",
    ]);
  });

  test("dan iz mreže → lokalno podne; neispravan dan baca grešku", () => {
    expect(dueFromDayKey("2026-10-28", BG)).toBe(noon("2026-10-28"));
    expect(new Date(dueFromDayKey("2026-03-29", BG)).toISOString()).toBe("2026-03-29T10:00:00.000Z");
    expect(() => dueFromDayKey("2026-02-30", BG)).toThrow();
    expect(dayKeyOfDue(noon("2026-10-28"), BG)).toBe("2026-10-28");
    expect(dayKeyOfDue(null, BG)).toBeNull();
  });

  test("izabran čip: prvi po danu; vrednost koja nije podne poredi se po danu", () => {
    const now = bg("2026-10-24", 9);
    expect(selectedDatePickerChip(null, now, BG)).toBe("none");
    // Subota: Danas i Vikend su isti dan → kvačica samo na prvom.
    expect(selectedDatePickerChip(noon("2026-10-24"), now, BG)).toBe("today");
    expect(selectedDatePickerChip(bg("2026-10-25", 18), now, BG)).toBe("tomorrow");
    expect(selectedDatePickerChip(noon("2026-10-28"), now, BG)).toBeNull();
  });

  test("početni mesec: izabranog dana, inače današnji", () => {
    expect(initialMonth(noon("2026-12-03"), bg("2026-10-24"), BG)).toBe("2026-12");
    expect(initialMonth(null, bg("2026-10-24"), BG)).toBe("2026-10");
  });
});
