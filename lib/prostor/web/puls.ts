// Preneto iz Devotion apps/web/lib/puls.ts (main @ c05c40f), SPAJANJE S20.
import {
  addDaysToKey,
  dayKeyOf,
  daysWord,
  SR_MONTHS_SHORT,
  startOfDayKey,
  startOfWeekKey,
} from "../dates";

/**
 * Nedelja teče od ponedeljka 00:00 po lokalnoj zoni korisnika. Granice računa
 * klijent i prosleđuje ih serveru — tako pregled uvek odgovara danu koji
 * korisnik zaista vidi, bez pretpostavki o zoni servera.
 *
 * Svaka funkcija prima opcionu `zone` (kao `lib/prostor/dates.ts`): bez nje
 * lokalna zona uređaja (Europe/Belgrade kod tima), sa njom tačna zona (testovi).
 * Kalendar ide kroz ključeve dana, pa nedelje od 167 i 169 sati (promena
 * vremena) ostaju tačne. Imena meseci su iz sopstvenog niza, ne iz `Intl`.
 */
export function localWeekStart(reference: Date | number = new Date(), zone?: string) {
  const ms = reference instanceof Date ? reference.getTime() : reference;
  return startOfDayKey(startOfWeekKey(dayKeyOf(ms, zone)), zone);
}

export function normalizeToLocalWeekStart(timestamp: number, zone?: string) {
  return localWeekStart(timestamp, zone);
}

/** Pomera nedelju preko kalendarskih dana, pa nedelje sa 23 ili 25 sati ostaju tačne. */
export function addWeeks(weekStart: number, delta: number, zone?: string) {
  return startOfDayKey(addDaysToKey(dayKeyOf(weekStart, zone), delta * 7), zone);
}

export function isCurrentWeek(weekStart: number, now: number = Date.now(), zone?: string) {
  return weekStart === localWeekStart(now, zone);
}

function delovi(ms: number, zone?: string) {
  const key = dayKeyOf(ms, zone);
  return {
    year: Number(key.slice(0, 4)),
    month: SR_MONTHS_SHORT[Number(key.slice(5, 7)) - 1],
    day: Number(key.slice(8, 10)),
  };
}

/** „12–18. maj 2026”, preko meseca „28. apr – 4. maj 2026”. */
export function formatWeekLabel(weekStart: number, weekEnd: number, zone?: string) {
  const start = delovi(weekStart, zone);
  const end = delovi(weekEnd - 1, zone);

  if (start.year !== end.year) {
    return `${start.day}. ${start.month} ${start.year} – ${end.day}. ${end.month} ${end.year}`;
  }
  if (start.month !== end.month) {
    return `${start.day}. ${start.month} – ${end.day}. ${end.month} ${end.year}`;
  }
  return `${start.day}–${end.day}. ${start.month} ${end.year}`;
}

/** „stoji 5 dana” — koliko dugo zadatak nije pomeren. */
export function formatDaysStanding(elapsedMs: number) {
  const days = Math.max(1, Math.floor(elapsedMs / 86_400_000));
  return `${days} ${daysWord(days)}`;
}

export type Trend = { current: number; previous: number };

export type TrendDirection = "up" | "down" | "flat";

export function trendDirection(trend: Trend): TrendDirection {
  if (trend.current > trend.previous) return "up";
  if (trend.current < trend.previous) return "down";
  return "flat";
}

export function trendDelta(trend: Trend) {
  return trend.current - trend.previous;
}
