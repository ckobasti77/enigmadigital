// Preneto iz Devotion packages/backend/convex/day-key-parity.test.ts (main @ c05c40f), SPAJANJE S02.
import { describe, expect, it } from "vitest";

// Serverski ključ dana (backend ne uvozi `@devotion/shared`)…
import { assertDayKey, isDayKey, shiftDayKey } from "./lib/day_key";
// …i zajednička funkcija klijenata kojoj mora da bude jednak.
import { addDaysToKey, isDayKey as sharedIsDayKey } from "../../lib/prostor/dates";

/**
 * Straža protiv razilaženja: `lib/day_key.ts` ručno ogleda `addDaysToKey` i
 * `isDayKey` iz `packages/shared/src/dates.ts`. Klijent računa `dayKey`, a
 * server prozor „Preneto od ranije" — ako se aritmetika razilazi, stavka bi
 * ispala iz prozora na jednoj strani.
 */
describe("ključ dana: server = shared", () => {
  it.each([
    ["2026-10-25", -7],
    ["2026-10-25", -1],
    ["2026-10-25", 0],
    ["2026-10-25", 1], // DST kraj oktobra
    ["2026-03-29", 1], // DST kraj marta
    ["2026-03-28", 1],
    ["2026-01-01", -1], // prelaz godine unazad
    ["2025-12-31", 1], // prelaz godine unapred
    ["2026-01-03", -7],
    ["2024-02-28", 1], // prestupna godina
    ["2024-02-29", 1],
    ["2024-03-01", -1],
    ["2023-02-28", 1], // neprestupna
    ["2023-03-01", -1],
    ["2100-02-28", 1], // nije prestupna (deljiva sa 100)
    ["2000-02-28", 1], // prestupna (deljiva sa 400)
    ["2026-12-25", 7],
    ["2026-07-31", 1],
    ["2026-05-01", -1],
    ["2026-10-01", -7],
  ] as const)("shiftDayKey(%s, %i) = addDaysToKey", (key, days) => {
    expect(shiftDayKey(key, days)).toBe(addDaysToKey(key, days));
  });

  it.each([
    "2026-10-25",
    "2024-02-29",
    "2023-02-29",
    "2026-02-30",
    "2026-13-01",
    "2026-00-10",
    "2026-10-00",
    "26-10-2026",
    "2026-1-5",
    "2026-10-25T00:00",
    "",
  ])("isDayKey(%j) je isti na oba mesta", (value) => {
    expect(isDayKey(value)).toBe(sharedIsDayKey(value));
  });

  it("assertDayKey vraća ključ ili baca „Neispravan dan.”", () => {
    expect(assertDayKey("2026-10-25")).toBe("2026-10-25");
    expect(() => assertDayKey("2026-02-30")).toThrow("Neispravan dan.");
    expect(() => shiftDayKey("nije dan", 1)).toThrow("Neispravan dan.");
  });
});
