/** Short Serbian relative time for "last sync" / run timestamps. */
export function formatRelativeTime(timestamp: number, now = Date.now()): string {
  const diff = now - timestamp;
  if (diff < 0) return "upravo sada";

  const sec = Math.floor(diff / 1000);
  if (sec < 45) return "upravo sada";

  const min = Math.floor(sec / 60);
  if (min < 60) return `pre ${min} min`;

  const hours = Math.floor(min / 60);
  if (hours < 24) return `pre ${hours} h`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `pre ${days} d`;

  return new Date(timestamp).toLocaleDateString("sr-RS", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * How long ago the screen last got fresher — in seconds while that is still the
 * honest unit.
 *
 * `formatRelativeTime` rounds everything under 45 s to „upravo sada", which is
 * right for a sync that runs every six hours and wrong for one that runs on a
 * webhook: „pre 40 s" is a claim about how live the panel is, and rounding it
 * away throws out exactly the thing F6 was built to show.
 */
export function formatSyncAge(timestamp: number, now = Date.now()): string {
  const diff = now - timestamp;
  if (diff < 0) return "upravo sada";

  const sec = Math.floor(diff / 1000);
  if (sec < 10) return "upravo sada";
  if (sec < 60) return `pre ${sec} s`;

  return formatRelativeTime(timestamp, now);
}

// ── numbers (sr-Latn: "12.345,6") ────────────────────────────────────────────

const LOCALE = "sr-Latn-RS";

const integerFmt = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const decimalFmt = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const percentFmt = new Intl.NumberFormat(LOCALE, {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const signedPercentFmt = new Intl.NumberFormat(LOCALE, {
  style: "percent",
  signDisplay: "exceptZero",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const signedIntegerFmt = new Intl.NumberFormat(LOCALE, {
  signDisplay: "exceptZero",
  maximumFractionDigits: 0,
});
const signedDecimalFmt = new Intl.NumberFormat(LOCALE, {
  signDisplay: "exceptZero",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** Whole number with sr-Latn thousands separators. */
export function formatNumber(value: number): string {
  return integerFmt.format(value);
}

export function formatDecimal(value: number): string {
  return decimalFmt.format(value);
}

/** 0..1 → "43,2%". */
export function formatPercent(rate: number): string {
  return percentFmt.format(rate);
}

/** Relative delta 0.12 → "+12,0%". */
export function formatSignedPercent(delta: number): string {
  return signedPercentFmt.format(delta);
}

/** Percentage-point delta 1.34 → "+1,3 pp". */
export function formatSignedPp(delta: number): string {
  return `${signedDecimalFmt.format(delta)} pp`;
}

// ── dates ("YYYY-MM-DD" keys) ────────────────────────────────────────────────

const shortDateFmt = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "short",
});
const longDateFmt = new Intl.DateTimeFormat(LOCALE, {
  weekday: "short",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const dayMonthFmt = new Intl.DateTimeFormat(LOCALE, {
  day: "2-digit",
  month: "2-digit",
});
const clockFmt = new Intl.DateTimeFormat(LOCALE, {
  hour: "2-digit",
  minute: "2-digit",
});

/** A moment as a wall clock reading in the reader's own time zone — "14:35". */
export function formatClockTime(timestamp: number): string {
  return clockFmt.format(new Date(timestamp));
}

/** Parse a "YYYY-MM-DD" key as a local date (no TZ shift). */
function keyToLocalDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** "2026-08-15" → "15. avg" (axis ticks). */
export function formatShortDate(key: string): string {
  return shortDateFmt.format(keyToLocalDate(key));
}

/** "2026-08-15" → "sub, 15. avgust 2026." (tooltips). */
export function formatLongDate(key: string): string {
  return longDateFmt.format(keyToLocalDate(key));
}

/** "2026-08-01" … "2026-08-15" → "01.08 – 15.08." */
export function formatDateSpan(from: string, to: string): string {
  return `${dayMonthFmt.format(keyToLocalDate(from))} – ${dayMonthFmt.format(keyToLocalDate(to))}`;
}

/**
 * Watch time in minutes → "45 min" / "12,3 h" / "1.234 h". YouTube reports
 * `estimatedMinutesWatched`; hours are the unit people actually read.
 */
export function formatWatchTime(minutes: number): string {
  if (minutes < 60) return `${integerFmt.format(Math.round(minutes))} min`;
  const hours = minutes / 60;
  return hours < 100
    ? `${decimalFmt.format(hours)} h`
    : `${integerFmt.format(Math.round(hours))} h`;
}

/** Whole number with an explicit sign — "+1.234" / "−12" / "0". */
export function formatSignedNumber(value: number): string {
  return signedIntegerFmt.format(value);
}

// ── words ────────────────────────────────────────────────────────────────────

/**
 * Serbian plural agreement — the ONE place the rule lives.
 *
 * The rule is by the last two digits, not by the number: 21 takes the singular
 * („21 objava"), 22–24 the paucal („22 objave"), and 11–14 the plural in spite
 * of ending in 1–4 („12 objava"). A naive `n >= 2 && n <= 4` gets every number
 * above twenty wrong, which is where a content grid spends most of its life.
 *
 *   pluralSr(n, "objava", "objave", "objava")
 *   pluralSr(n, "komentar", "komentara", "komentara")
 */
export function pluralSr(
  count: number,
  one: string,
  few: string,
  many: string,
): string {
  const abs = Math.abs(Math.trunc(count));
  const mod100 = abs % 100;
  const mod10 = abs % 10;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
