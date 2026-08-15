import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  format,
  isValid,
  parseISO,
  subDays,
} from "date-fns";

/**
 * Shared date-range model (used by every screen). Dates are "YYYY-MM-DD"
 * strings — the same keys the sync writes — so ranges compare lexicographically.
 *
 * URL shape: `?range=7d|28d|90d` (default 28d, not written) or
 * `?from=YYYY-MM-DD&to=YYYY-MM-DD` for a custom span. Presets end today
 * (local date, inclusive). The comparison period is the equal-length span
 * immediately before `from`.
 */

export const RANGE_PRESETS = ["7d", "28d", "90d"] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];
export const DEFAULT_PRESET: RangePreset = "28d";

export const PRESET_DAYS: Record<RangePreset, number> = {
  "7d": 7,
  "28d": 28,
  "90d": 90,
};

export type DateRange = {
  preset: RangePreset | "custom";
  from: string;
  to: string;
  prevFrom: string;
  prevTo: string;
  /** Length of the period in days (inclusive). */
  days: number;
};

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function toDateKey(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export function parseDateKey(key: string): Date | null {
  if (!DATE_KEY.test(key)) return null;
  const d = parseISO(key);
  return isValid(d) ? d : null;
}

function isPreset(value: string | null): value is RangePreset {
  return value !== null && (RANGE_PRESETS as readonly string[]).includes(value);
}

function buildRange(
  preset: DateRange["preset"],
  fromDate: Date,
  toDate: Date,
): DateRange {
  const days = differenceInCalendarDays(toDate, fromDate) + 1;
  const prevTo = subDays(fromDate, 1);
  const prevFrom = subDays(prevTo, days - 1);
  return {
    preset,
    from: toDateKey(fromDate),
    to: toDateKey(toDate),
    prevFrom: toDateKey(prevFrom),
    prevTo: toDateKey(prevTo),
    days,
  };
}

export function presetRange(preset: RangePreset, today: Date): DateRange {
  const days = PRESET_DAYS[preset];
  return buildRange(preset, subDays(today, days - 1), today);
}

/** Resolve the URL params to a range; anything invalid falls back to 28d. */
export function parseRangeParams(
  params: URLSearchParams,
  today: Date,
): DateRange {
  const range = params.get("range");
  if (isPreset(range)) return presetRange(range, today);

  const from = params.get("from");
  const to = params.get("to");
  if (from && to) {
    const fromDate = parseDateKey(from);
    const toDate = parseDateKey(to);
    if (fromDate && toDate && fromDate <= toDate) {
      return buildRange("custom", fromDate, toDate);
    }
  }
  return presetRange(DEFAULT_PRESET, today);
}

/** Write the range back to URL params (default preset writes nothing). */
export function applyRangeParams(
  params: URLSearchParams,
  next: { preset: RangePreset } | { from: string; to: string },
): URLSearchParams {
  const out = new URLSearchParams(params);
  out.delete("range");
  out.delete("from");
  out.delete("to");
  if ("preset" in next) {
    if (next.preset !== DEFAULT_PRESET) out.set("range", next.preset);
  } else {
    out.set("from", next.from);
    out.set("to", next.to);
  }
  return out;
}

/** Every date key in [from, to], ascending. */
export function dateKeysBetween(from: string, to: string): string[] {
  const a = parseDateKey(from);
  const b = parseDateKey(to);
  if (!a || !b || a > b) return [];
  return eachDayOfInterval({ start: a, end: b }).map(toDateKey);
}

export function shiftDateKey(key: string, days: number): string {
  const d = parseDateKey(key);
  return d ? toDateKey(addDays(d, days)) : key;
}
