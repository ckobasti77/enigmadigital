// Preneto iz Devotion packages/shared/src/stale.test.ts (main @ c05c40f), SPAJANJE S02.
import { describe, expect, test } from "vitest";

import { noonOfDayKey, startOfDayKey } from "./dates";
import { isStale, isStaleTask, splitStale, STALE_AFTER_DAYS } from "./stale";

const BG = "Europe/Belgrade";
const HOUR = 3_600_000;

/** Rok je uvek lokalno podne datog dana. */
const due = (key: string) => noonOfDayKey(key, BG);
/** Lokalno vreme u Beogradu kao trenutak. */
const at = (key: string, hour = 0, minute = 0) =>
  startOfDayKey(key, BG) + hour * HOUR + minute * 60_000;

describe("isStale (Zastarelo)", () => {
  test("granica je 14 dana: 14 unazad nije zastarelo, 15 jeste", () => {
    expect(STALE_AFTER_DAYS).toBe(14);
    const now = at("2026-10-26", 9);
    expect(isStale(due("2026-10-12"), now, BG)).toBe(false); // 14 dana
    expect(isStale(due("2026-10-11"), now, BG)).toBe(true); // 15 dana
    expect(isStale(due("2026-10-13"), now, BG)).toBe(false); // 13 dana
    expect(isStale(due("2026-09-01"), now, BG)).toBe(true);
  });

  test("bez roka, danas i budućnost nikad nisu zastareli", () => {
    const now = at("2026-10-26", 9);
    expect(isStale(null, now, BG)).toBe(false);
    expect(isStale(due("2026-10-26"), now, BG)).toBe(false);
    expect(isStale(due("2026-10-27"), now, BG)).toBe(false);
    expect(isStale(due("2027-01-01"), now, BG)).toBe(false);
  });

  test("ponoć pomera granicu po kalendarskom danu, ne po satima", () => {
    const deadline = due("2026-10-11");
    // Poslednja milisekunda 14. dana: još nije zastarelo.
    expect(isStale(deadline, at("2026-10-26") - 1, BG)).toBe(false);
    // Ponoć: nastupio je 15. dan, iako od roka (podne) nema ni 15 × 24 h.
    expect(isStale(deadline, at("2026-10-26"), BG)).toBe(true);
    expect(isStale(deadline, at("2026-10-25", 23, 59), BG)).toBe(false);
  });

  test("prelaz na zimsko vreme (25. 10. 2026) ne pomera granicu", () => {
    // Od 20. 10. do 3. 11. je 14 kalendarskih dana, ali 14 × 24 h + 1 h.
    const deadline = due("2026-10-20");
    expect(isStale(deadline, at("2026-11-03", 0, 30), BG)).toBe(false);
    expect(isStale(deadline, at("2026-11-04", 0, 30), BG)).toBe(true);
    // Pre prelaza (proleće): 20. 3. → 3. 4. 2026 (prelaz 29. 3.) je 14 dana.
    expect(isStale(due("2026-03-20"), at("2026-04-03", 8), BG)).toBe(false);
    expect(isStale(due("2026-03-20"), at("2026-04-04", 8), BG)).toBe(true);
  });
});

describe("isStaleTask i splitStale", () => {
  const now = at("2026-10-26", 9);
  const old = due("2026-09-30");

  test("završen zadatak nikad nije zastareo, ni sa starim rokom", () => {
    expect(isStaleTask({ dueDate: old, taskStatus: "done" }, now, BG)).toBe(false);
    expect(isStaleTask({ dueDate: old, taskStatus: "in_progress" }, now, BG)).toBe(true);
    // Bez statusa (npr. lični zadatak ili sažetak) računa se samo rok.
    expect(isStaleTask({ dueDate: old }, now, BG)).toBe(true);
    expect(isStaleTask({ dueDate: null, taskStatus: "next" }, now, BG)).toBe(false);
  });

  test("deli na sveže i zastarele i čuva redosled", () => {
    const items = [
      { id: "a", dueDate: due("2026-10-20"), taskStatus: "next" },
      { id: "b", dueDate: old, taskStatus: "blocked" },
      { id: "c", dueDate: null, taskStatus: "backlog" },
      { id: "d", dueDate: due("2026-08-01"), taskStatus: "done" },
      { id: "e", dueDate: due("2026-10-11"), taskStatus: "next" },
    ];
    const { fresh, stale } = splitStale(items, now, BG);
    expect(stale.map((item) => item.id)).toEqual(["b", "e"]);
    expect(fresh.map((item) => item.id)).toEqual(["a", "c", "d"]);
  });

  test("prazna lista daje prazne grupe", () => {
    expect(splitStale([], now, BG)).toEqual({ fresh: [], stale: [] });
  });
});
