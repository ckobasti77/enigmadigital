// Preneto iz Devotion packages/shared/src/dates.test.ts (main @ c05c40f), SPAJANJE S02.
import { describe, expect, test } from "vitest";

import {
  addDays,
  addDaysToKey,
  dayDiff,
  dayKeyOf,
  describeDue,
  describeDueForRow,
  diffDayKeys,
  DUE_SHORTCUT_LABELS,
  dueShortcutDayKey,
  dueShortcutValue,
  endOfDay,
  formatDateNumeric,
  formatDateShort,
  formatDayHeading,
  formatDayRelative,
  isDayKey,
  isoWeekday,
  nextLocalMidnight,
  noonOf,
  noonOfDayKey,
  startOfDay,
  startOfDayKey,
  startOfWeekKey,
} from "./dates";

// Sve sa eksplicitnom zonom — rezultat je isti na svakoj mašini. Lokalni put
// (bez zone) proverava se posebnim testom konzistentnosti na dnu.
const BG = "Europe/Belgrade";
const HOUR = 3_600_000;

/** Lokalno vreme u Beogradu kao trenutak. */
function bg(key: string, hour = 0, minute = 0) {
  return startOfDayKey(key, BG) + hour * HOUR + minute * 60_000;
}

describe("dayKey i ponoć", () => {
  test("poslednja milisekunda dana i ponoć pripadaju različitim danima", () => {
    // 24.10.2026. je još letnje vreme (UTC+2): ponoć 25.10. je 22:00Z.
    expect(dayKeyOf(Date.UTC(2026, 9, 24, 21, 59, 59, 999), BG)).toBe("2026-10-24");
    expect(dayKeyOf(Date.UTC(2026, 9, 24, 22, 0, 0, 0), BG)).toBe("2026-10-25");
    // 25.10. posle prelaza je zimsko vreme (UTC+1): ponoć 26.10. je 23:00Z.
    expect(dayKeyOf(Date.UTC(2026, 9, 25, 22, 59, 59, 999), BG)).toBe("2026-10-25");
    expect(dayKeyOf(Date.UTC(2026, 9, 25, 23, 0, 0, 0), BG)).toBe("2026-10-26");
  });

  test("granice dana: početak, kraj i sledeća ponoć", () => {
    const now = Date.UTC(2026, 9, 24, 8, 0); // 10:00 u Beogradu
    expect(startOfDay(now, BG)).toBe(Date.UTC(2026, 9, 23, 22, 0));
    expect(nextLocalMidnight(now, BG)).toBe(Date.UTC(2026, 9, 24, 22, 0));
    expect(endOfDay(now, BG)).toBe(Date.UTC(2026, 9, 24, 22, 0) - 1);
  });

  test("DST kraj marta: 29.03.2026. ima 23 sata", () => {
    expect(startOfDayKey("2026-03-29", BG)).toBe(Date.UTC(2026, 2, 28, 23, 0));
    expect(startOfDayKey("2026-03-30", BG)).toBe(Date.UTC(2026, 2, 29, 22, 0));
    expect(startOfDayKey("2026-03-30", BG) - startOfDayKey("2026-03-29", BG)).toBe(
      23 * HOUR,
    );
    expect(startOfDay(Date.UTC(2026, 2, 29, 12, 0), BG)).toBe(
      Date.UTC(2026, 2, 28, 23, 0),
    );
  });

  test("DST kraj oktobra: 25.10.2026. ima 25 sati", () => {
    expect(startOfDayKey("2026-10-25", BG)).toBe(Date.UTC(2026, 9, 24, 22, 0));
    expect(startOfDayKey("2026-10-26", BG)).toBe(Date.UTC(2026, 9, 25, 23, 0));
    expect(startOfDayKey("2026-10-26", BG) - startOfDayKey("2026-10-25", BG)).toBe(
      25 * HOUR,
    );
  });

  test("druga zona radi isto (New York, kraj DST 1.11.2026.)", () => {
    const NY = "America/New_York";
    expect(startOfDayKey("2026-11-01", NY)).toBe(Date.UTC(2026, 10, 1, 4, 0));
    expect(startOfDayKey("2026-11-02", NY)).toBe(Date.UTC(2026, 10, 2, 5, 0));
    expect(noonOfDayKey("2026-11-01", NY)).toBe(Date.UTC(2026, 10, 1, 17, 0));
    // Isti trenutak je u Beogradu već sledeći dan.
    expect(dayKeyOf(Date.UTC(2026, 9, 24, 23, 0), NY)).toBe("2026-10-24");
    expect(dayKeyOf(Date.UTC(2026, 9, 24, 23, 0), BG)).toBe("2026-10-25");
  });
});

describe("lokalno podne", () => {
  test("rok je lokalno podne: zima UTC+1, leto UTC+2, oba DST dana", () => {
    expect(noonOfDayKey("2026-01-15", BG)).toBe(Date.UTC(2026, 0, 15, 11, 0));
    expect(noonOfDayKey("2026-07-15", BG)).toBe(Date.UTC(2026, 6, 15, 10, 0));
    expect(noonOfDayKey("2026-03-29", BG)).toBe(Date.UTC(2026, 2, 29, 10, 0));
    expect(noonOfDayKey("2026-10-25", BG)).toBe(Date.UTC(2026, 9, 25, 11, 0));
  });

  test("noonOf normalizuje bilo koji trenutak dana na podne istog dana", () => {
    expect(noonOf(bg("2026-10-24", 0, 1), BG)).toBe(noonOfDayKey("2026-10-24", BG));
    expect(noonOf(bg("2026-10-24", 23, 59), BG)).toBe(noonOfDayKey("2026-10-24", BG));
  });

  test("addDays čuva zidni sat preko prelaza vremena", () => {
    const saturday10 = bg("2026-10-24", 10);
    const sunday10 = addDays(saturday10, 1, BG);
    expect(dayKeyOf(sunday10, BG)).toBe("2026-10-25");
    expect(sunday10 - saturday10).toBe(25 * HOUR);
    expect(addDays(sunday10, -1, BG)).toBe(saturday10);
  });
});

describe("kalendarska aritmetika", () => {
  test("addDaysToKey preko meseca, godine i prestupnog dana", () => {
    expect(addDaysToKey("2026-10-24", 1)).toBe("2026-10-25");
    expect(addDaysToKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysToKey("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDaysToKey("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDaysToKey("2026-11-03", -7)).toBe("2026-10-27");
  });

  test("diffDayKeys i dayDiff po kalendarskim danima, i preko DST-a", () => {
    expect(diffDayKeys("2026-10-24", "2026-10-31")).toBe(7);
    expect(diffDayKeys("2026-10-31", "2026-10-24")).toBe(-7);
    expect(dayDiff(noonOfDayKey("2026-03-30", BG), bg("2026-03-29", 0, 30), BG)).toBe(1);
    expect(dayDiff(noonOfDayKey("2026-10-26", BG), bg("2026-10-25", 0, 30), BG)).toBe(1);
    // Rok danas ne postaje „kasni" posle podneva.
    expect(dayDiff(noonOfDayKey("2026-10-24", BG), bg("2026-10-24", 23, 59), BG)).toBe(0);
  });

  test("nedelja počinje ponedeljkom", () => {
    expect(isoWeekday("2026-10-26")).toBe(1);
    expect(isoWeekday("2026-10-24")).toBe(6);
    expect(isoWeekday("2026-10-25")).toBe(7);
    expect(startOfWeekKey("2026-10-25")).toBe("2026-10-19");
    expect(startOfWeekKey("2026-10-26")).toBe("2026-10-26");
  });

  test("isDayKey odbija nepostojeće datume i loš oblik", () => {
    expect(isDayKey("2026-10-24")).toBe(true);
    expect(isDayKey("2028-02-29")).toBe(true);
    expect(isDayKey("2026-02-29")).toBe(false);
    expect(isDayKey("2026-02-30")).toBe(false);
    expect(isDayKey("2026-13-01")).toBe(false);
    expect(isDayKey("26-10-24")).toBe(false);
    expect(isDayKey("2026-10-24T00:00")).toBe(false);
  });
});

describe("brzi izbori roka", () => {
  const at = (key: string) => bg(key, 10);

  test("oznake", () => {
    expect(DUE_SHORTCUT_LABELS).toEqual({
      today: "Danas",
      tomorrow: "Sutra",
      weekend: "Vikend",
      nextWeek: "Sledeće nedelje",
    });
  });

  test("Danas i Sutra (i preko DST ponoći)", () => {
    expect(dueShortcutDayKey("today", at("2026-10-24"), BG)).toBe("2026-10-24");
    expect(dueShortcutDayKey("tomorrow", at("2026-10-24"), BG)).toBe("2026-10-25");
    expect(dueShortcutDayKey("tomorrow", bg("2026-10-24", 23, 59), BG)).toBe(
      "2026-10-25",
    );
  });

  test("Vikend: sreda i petak → ova subota, subota → danas, nedelja → sledeća subota", () => {
    expect(dueShortcutDayKey("weekend", at("2026-10-21"), BG)).toBe("2026-10-24");
    expect(dueShortcutDayKey("weekend", at("2026-10-23"), BG)).toBe("2026-10-24");
    expect(dueShortcutDayKey("weekend", at("2026-10-24"), BG)).toBe("2026-10-24");
    expect(dueShortcutDayKey("weekend", at("2026-10-25"), BG)).toBe("2026-10-31");
    expect(dueShortcutDayKey("weekend", at("2026-10-26"), BG)).toBe("2026-10-31");
  });

  test("Sledeće nedelje = ponedeljak sledeće nedelje", () => {
    expect(dueShortcutDayKey("nextWeek", at("2026-10-23"), BG)).toBe("2026-10-26");
    expect(dueShortcutDayKey("nextWeek", at("2026-10-24"), BG)).toBe("2026-10-26");
    expect(dueShortcutDayKey("nextWeek", at("2026-10-25"), BG)).toBe("2026-10-26");
    expect(dueShortcutDayKey("nextWeek", at("2026-10-26"), BG)).toBe("2026-11-02");
  });

  test("vrednost brzog izbora je lokalno podne", () => {
    expect(dueShortcutValue("weekend", at("2026-10-25"), BG)).toBe(
      noonOfDayKey("2026-10-31", BG),
    );
    // Sutra posle prelaza: podne je po zimskom vremenu.
    expect(dueShortcutValue("tomorrow", at("2026-10-24"), BG)).toBe(
      Date.UTC(2026, 9, 25, 11, 0),
    );
  });
});

describe("srpski formati", () => {
  const now = bg("2026-10-24", 10);
  const noon = (key: string) => noonOfDayKey(key, BG);

  test("numerički: dve cifre i tačka na kraju", () => {
    expect(formatDateNumeric(noon("2026-10-27"), BG)).toBe("27.10.2026.");
    expect(formatDateNumeric(noon("2026-03-05"), BG)).toBe("05.03.2026.");
  });

  test("kratki: dan u nedelji, dan, mesec", () => {
    expect(formatDateShort(noon("2026-10-26"), BG)).toBe("pon 26. okt");
    expect(formatDateShort(noon("2026-10-27"), BG)).toBe("uto 27. okt");
    expect(formatDateShort(noon("2026-10-29"), BG)).toBe("čet 29. okt");
    expect(formatDateShort(noon("2026-08-02"), BG)).toBe("ned 2. avg");
  });

  test("zaglavlje dana", () => {
    expect(formatDayHeading(now, BG)).toBe("subota 24. oktobar");
    expect(formatDayHeading(noon("2026-03-30"), BG)).toBe("ponedeljak 30. mart");
  });

  test("relativno: danas, sutra, juče, ista i druga godina", () => {
    expect(formatDayRelative(noon("2026-10-24"), now, BG)).toBe("danas");
    expect(formatDayRelative(noon("2026-10-25"), now, BG)).toBe("sutra");
    expect(formatDayRelative(noon("2026-10-23"), now, BG)).toBe("juče");
    expect(formatDayRelative(noon("2026-10-27"), now, BG)).toBe("uto 27. okt");
    expect(formatDayRelative(noon("2026-01-02"), now, BG)).toBe("pet 2. jan");
    expect(formatDayRelative(noon("2027-10-27"), now, BG)).toBe("27.10.2027.");
  });

  test("relativno tik pred ponoć prelaza", () => {
    expect(formatDayRelative(noon("2026-10-25"), bg("2026-10-24", 23, 59), BG)).toBe(
      "sutra",
    );
  });
});

describe("opis roka", () => {
  const now = bg("2026-10-24", 10);
  const noon = (key: string) => noonOfDayKey(key, BG);

  test("red: završen zadatak pokazuje samo datum, bez „kasni“", () => {
    const late = noon("2026-10-21");
    expect(describeDueForRow(late, now, false, BG).tone).toBe("overdue");
    expect(describeDueForRow(late, now, true, BG)).toMatchObject({
      label: formatDateShort(late, BG),
      tone: "later",
    });
    expect(describeDueForRow(null, now, true, BG).tone).toBe("none");
  });

  test("bez roka", () => {
    expect(describeDue(null, now, BG)).toEqual({
      label: "Bez roka",
      ariaLabel: "Bez roka",
      tone: "none",
      dayDiff: null,
    });
  });

  test("prekoračeno sa srpskom pluralizacijom", () => {
    expect(describeDue(noon("2026-10-21"), now, BG)).toEqual({
      label: "kasni 3 d",
      ariaLabel: "Rok je prošao: kasni 3 dana",
      tone: "overdue",
      dayDiff: -3,
    });
    expect(describeDue(noon("2026-10-23"), now, BG).ariaLabel).toBe(
      "Rok je prošao: kasni 1 dan",
    );
  });

  test("danas, sutra, uskoro, kasnije", () => {
    expect(describeDue(noon("2026-10-24"), now, BG)).toMatchObject({
      label: "danas",
      ariaLabel: "Rok je danas",
      tone: "today",
    });
    expect(describeDue(noon("2026-10-25"), now, BG)).toMatchObject({
      label: "sutra",
      tone: "soon",
    });
    expect(describeDue(noon("2026-10-28"), now, BG)).toEqual({
      label: "sre 28. okt",
      ariaLabel: "Rok: sreda 28. oktobar",
      tone: "soon",
      dayDiff: 4,
    });
    expect(describeDue(noon("2026-10-31"), now, BG).tone).toBe("soon");
    expect(describeDue(noon("2026-11-01"), now, BG)).toMatchObject({
      label: "ned 1. nov",
      tone: "later",
      dayDiff: 8,
    });
    expect(describeDue(noon("2027-01-04"), now, BG)).toMatchObject({
      label: "04.01.2027.",
      ariaLabel: "Rok: 04.01.2027.",
      tone: "later",
    });
  });
});

describe("lokalni put = Intl put za zonu ove mašine", () => {
  test("isti dan, ponoć i podne za niz trenutaka (i oko DST-a)", () => {
    const machineZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const instants = [
      Date.UTC(2026, 0, 1, 0, 0),
      Date.UTC(2026, 2, 28, 23, 30),
      Date.UTC(2026, 2, 29, 1, 30),
      Date.UTC(2026, 5, 15, 12, 0),
      Date.UTC(2026, 9, 24, 21, 59, 59, 999),
      Date.UTC(2026, 9, 25, 0, 30),
      Date.UTC(2026, 9, 25, 1, 30),
      Date.UTC(2026, 10, 1, 6, 0),
      Date.UTC(2026, 11, 31, 23, 59),
      Date.UTC(2028, 1, 29, 12, 0),
    ];
    for (const ms of instants) {
      expect(dayKeyOf(ms)).toBe(dayKeyOf(ms, machineZone));
      expect(startOfDay(ms)).toBe(startOfDay(ms, machineZone));
      expect(noonOf(ms)).toBe(noonOf(ms, machineZone));
    }
  });
});
