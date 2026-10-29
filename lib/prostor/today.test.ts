// Preneto iz Devotion packages/shared/src/today.test.ts (main @ c05c40f), SPAJANJE S02.
import { describe, expect, test } from "vitest";

import { msUntilNextDay, nextToday, todayOf } from "./today";

// Spojeni testovi web (`apps/web/lib/today.test.ts`) i telefona
// (`apps/mobile/src/lib/today.test.ts`) — logika je sada samo ovde (K21).
const ZONE = "Europe/Belgrade";
// 24.10.2026. 23:59:30 i 25.10.2026. 00:00:30 u Beogradu (letnje vreme, UTC+2).
const BEFORE_MIDNIGHT = Date.UTC(2026, 9, 24, 21, 59, 30);
const AFTER_MIDNIGHT = Date.UTC(2026, 9, 24, 22, 0, 30);

describe("današnji dan za lični nivo", () => {
  test("dayKey i doneSince su lokalni dan i lokalna ponoć", () => {
    const today = todayOf(BEFORE_MIDNIGHT, ZONE);
    expect(today.dayKey).toBe("2026-10-24");
    expect(today.doneSince).toBe(Date.UTC(2026, 9, 23, 22, 0, 0));
    expect(today.now).toBe(BEFORE_MIDNIGHT);
    // subota 24.10.2026. 09:30 u Beogradu (CEST, UTC+2)
    const morning = Date.UTC(2026, 9, 24, 7, 30);
    expect(todayOf(morning, ZONE)).toEqual({
      now: morning,
      dayKey: "2026-10-24",
      doneSince: Date.UTC(2026, 9, 23, 22, 0),
    });
  });

  test("do ponoći ostaje tačno koliko treba, i preko kraja letnjeg vremena (25 h)", () => {
    expect(msUntilNextDay(BEFORE_MIDNIGHT, ZONE)).toBe(30_000);
    // 25.10.2026. 00:30 CEST → sledeća ponoć je 26.10. 00:00 CET.
    expect(msUntilNextDay(Date.UTC(2026, 9, 24, 22, 30), ZONE)).toBe(24.5 * 3_600_000);
    // Najmanje 1 s, da tajmer ne „vrti".
    expect(msUntilNextDay(Date.UTC(2026, 9, 24, 21, 59, 59, 900), ZONE)).toBe(1_000);
    expect(msUntilNextDay(Date.UTC(2026, 9, 24, 21, 59, 59, 999), ZONE)).toBe(1_000);
  });

  test("isti dan u istom minutu vraća isti objekat (stabilni argumenti upita)", () => {
    const first = todayOf(BEFORE_MIDNIGHT - 20_000, ZONE);
    expect(nextToday(first, BEFORE_MIDNIGHT, ZONE)).toBe(first);
    const morning = todayOf(Date.UTC(2026, 9, 24, 7, 30), ZONE);
    expect(nextToday(morning, morning.now + 10_000, ZONE)).toBe(morning);
  });

  test("posle ponoći ili posle minuta nastaje novi dan, odnosno novo „sada“", () => {
    const first = todayOf(BEFORE_MIDNIGHT, ZONE);
    const afterMidnight = nextToday(first, AFTER_MIDNIGHT, ZONE);
    expect(afterMidnight).not.toBe(first);
    expect(afterMidnight.dayKey).toBe("2026-10-25");
    const earlier = todayOf(BEFORE_MIDNIGHT - 600_000, ZONE);
    const later = nextToday(earlier, BEFORE_MIDNIGHT - 500_000, ZONE);
    expect(later).not.toBe(earlier);
    expect(later.dayKey).toBe("2026-10-24");
    expect(later.now).toBe(BEFORE_MIDNIGHT - 500_000);
    const morning = todayOf(Date.UTC(2026, 9, 24, 7, 30), ZONE);
    const stale = nextToday(morning, morning.now + 61_000, ZONE);
    expect(stale).not.toBe(morning);
    expect(stale.dayKey).toBe(morning.dayKey);
    expect(nextToday(morning, Date.UTC(2026, 9, 24, 22, 0, 5), ZONE).dayKey).toBe("2026-10-25");
  });
});
