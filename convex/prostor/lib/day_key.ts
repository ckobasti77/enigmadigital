// Preneto iz Devotion packages/backend/convex/lib/day_key.ts (main @ c05c40f), SPAJANJE S02.
/**
 * Kalendarski ključ dana `YYYY-MM-DD` (lokalni dan uređaja) bez čitanja sata.
 *
 * Ogledalo `isDayKey` / `addDaysToKey` iz `packages/shared/src/dates.ts`:
 * backend ne uvozi `@devotion/shared`, pa paritet čuva
 * `day-key-parity.test.ts`. Aritmetika ide kroz `Date.UTC`, pa zona i prelaz
 * na letnje vreme ne utiču na rezultat.
 */

const DAY_MS = 86_400_000;

function parse(key: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  const day = Number(key.slice(8, 10));
  if (month < 1 || month > 12 || day < 1) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return Date.UTC(year, month - 1, day);
}

function format(utcMs: number) {
  const date = new Date(utcMs);
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isDayKey(value: string) {
  return parse(value) !== null;
}

/** Stvaran kalendarski dan u obliku `YYYY-MM-DD`, inače „Neispravan dan.". */
export function assertDayKey(value: string) {
  if (parse(value) === null) throw new Error("Neispravan dan.");
  return value;
}

/** `key` pomeren za `days` kalendarskih dana (negativno = unazad). */
export function shiftDayKey(key: string, days: number) {
  const utc = parse(key);
  if (utc === null) throw new Error("Neispravan dan.");
  return format(utc + days * DAY_MS);
}
