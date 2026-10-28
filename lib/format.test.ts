import { describe, expect, test } from "vitest";

import { procenat, procenatSirov, trajanje } from "../convex/lib/formatJezgro";
import {
  NBSP,
  formatClockTime,
  formatDate,
  formatDateSpan,
  formatDateTime,
  formatDuration,
  formatDurationMs,
  formatMonthShort,
  formatNumber,
  formatPercent,
  formatPercentValue,
  formatRelativeTime,
  formatSeconds,
  formatShortDate,
  formatShortDateAt,
  formatSignedPercent,
  formatSignedPp,
  formatWatchTime,
} from "./format";
import { formatBelgradeShort } from "./belgrade-time";

// Trenuci se prave iz lokalnih delova, da testovi ne zavise od zone mašine.
const OKT_27_1741 = new Date(2026, 9, 27, 17, 41).getTime();

describe("P7: datum i vreme", () => {
  test("datum je „27. 10. 2026.“, iz ključa i iz trenutka", () => {
    expect(formatDate("2026-10-27")).toBe("27. 10. 2026.");
    expect(formatDate(OKT_27_1741)).toBe("27. 10. 2026.");
    expect(formatDate("2026-03-05")).toBe("5. 3. 2026.");
  });

  test("kratko je „27. okt“", () => {
    expect(formatShortDate("2026-10-27")).toBe("27. okt");
    expect(formatShortDateAt(OKT_27_1741)).toBe("27. okt");
    expect(formatMonthShort(OKT_27_1741)).toBe("okt");
    expect(formatShortDate("2026-05-01")).toBe("1. maj");
  });

  test("vreme je „17:41“, datum i vreme „27. 10. 2026. 17:41“", () => {
    expect(formatClockTime(OKT_27_1741)).toBe("17:41");
    expect(formatDateTime(OKT_27_1741)).toBe("27. 10. 2026. 17:41");
  });

  test("raspon: isti mesec, preko meseca i preko godine", () => {
    expect(formatDateSpan("2026-10-01", "2026-10-15")).toBe("1.–15. okt");
    expect(formatDateSpan("2026-09-28", "2026-10-15")).toBe("28. sep – 15. okt");
    expect(formatDateSpan("2025-12-28", "2026-01-03")).toBe(
      "28. dec 2025. – 3. jan 2026.",
    );
    expect(formatDateSpan("2026-10-15", "2026-10-15")).toBe("15. okt");
  });

  test("relativno vreme: posle 7 dana prelazi na datum", () => {
    const sada = OKT_27_1741;
    expect(formatRelativeTime(sada - 3 * 3600_000, sada)).toBe("pre 3 h");
    expect(formatRelativeTime(sada - 6 * 86_400_000, sada)).toBe("pre 6 d");
    const stari = sada - 8 * 86_400_000;
    expect(formatRelativeTime(stari, sada)).toBe(formatDate(stari));
    expect(formatRelativeTime(stari, sada)).toMatch(/^\d{1,2}\. \d{1,2}\. \d{4}\.$/);
  });

  test("beogradsko kratko vreme ide istim stilom", () => {
    // 2026-08-20 18:30 u Beogradu (CEST, UTC+2) = 16:30 UTC.
    expect(formatBelgradeShort(Date.UTC(2026, 7, 20, 16, 30))).toBe(
      "20. avg 18:30",
    );
  });
});

describe("P7: procenat i hiljade", () => {
  test("procenat ima tvrdi razmak", () => {
    expect(formatPercent(0.538)).toBe(`53,8${NBSP}%`);
    expect(formatPercent(0)).toBe(`0,0${NBSP}%`);
    expect(procenat(0.5)).toBe(`50,0${NBSP}%`);
    expect(procenat(0.12345, 2)).toBe(`12,35${NBSP}%`);
    expect(procenatSirov(2.45)).toBe(`2,45${NBSP}%`);
    expect(formatPercentValue(45)).toBe(`45${NBSP}%`);
    expect(formatPercentValue(2.456, 1)).toBe(`2,5${NBSP}%`);
  });

  test("procenat sa znakom i promena u procentnim poenima", () => {
    expect(formatSignedPercent(0.12)).toBe(`+12,0${NBSP}%`);
    expect(formatSignedPercent(0)).toBe(`0,0${NBSP}%`);
    expect(formatSignedPp(1.34)).toBe(`+1,3${NBSP}pp`);
  });

  test("hiljade tačkom", () => {
    expect(formatNumber(12480)).toBe("12.480");
    expect(formatNumber(999)).toBe("999");
    expect(formatNumber(1234567)).toBe("1.234.567");
  });
});

describe("P7: trajanje", () => {
  const s = (n: number, jedinica: string) => `${n}${NBSP}${jedinica}`;

  test("granice 0 / 59 / 60 / 61 / 3.600 / 3.725 s", () => {
    expect(formatDuration(0)).toBe(s(0, "s"));
    expect(formatDuration(42)).toBe(s(42, "s"));
    expect(formatDuration(59)).toBe(s(59, "s"));
    expect(formatDuration(60)).toBe(s(1, "min"));
    expect(formatDuration(61)).toBe(`${s(1, "min")} ${s(1, "s")}`);
    expect(formatDuration(3600)).toBe(s(1, "h"));
    expect(formatDuration(3725)).toBe(`${s(1, "h")} ${s(2, "min")}`);
  });

  test("sekunde se ne pišu od sata naviše, a loš ulaz je 0 s", () => {
    expect(trajanje(3 * 3600 + 59)).toBe(s(3, "h"));
    expect(formatDuration(-5)).toBe(s(0, "s"));
    expect(formatDuration(Number.NaN)).toBe(s(0, "s"));
  });

  test("milisekunde i sekunde idu istim formatom", () => {
    expect(formatDurationMs(84_000)).toBe(`${s(1, "min")} ${s(24, "s")}`);
    expect(formatSeconds(134)).toBe(`${s(2, "min")} ${s(14, "s")}`);
    expect(formatSeconds(0)).toBe(s(0, "s"));
    expect(formatDurationMs(0)).toBe(s(0, "s"));
  });

  test("vreme gledanja", () => {
    expect(formatWatchTime(45)).toBe(`45${NBSP}min`);
    expect(formatWatchTime(738)).toBe(`12,3${NBSP}h`);
  });
});
