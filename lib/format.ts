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
