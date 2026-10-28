import { NBSP, procenat, procenatSirov, trajanje } from "../convex/lib/formatJezgro";

export { NBSP };

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

  return formatDate(timestamp);
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
const ratioFmt = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
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

/** Odnos dve količine na dve decimale, npr. klikova po poruci: „0,37", „1,43". */
export function formatRatio(value: number): string {
  return ratioFmt.format(value);
}

/** Sažet broj za ose grafikona: 1.234 → "1,2k", 2.500.000 → "2,5M". */
export function formatCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${decimalFmt.format(value / 1_000_000)}M`;
  if (abs >= 1_000) return `${decimalFmt.format(value / 1_000)}k`;
  return integerFmt.format(value);
}

/** 0..1 → „43,2 %“ (tvrdi razmak pre znaka). */
export function formatPercent(rate: number): string {
  return procenat(rate);
}

/** Vrednost koja je već u procentima (0..100) → „45 %“; `decimale` po potrebi. */
export function formatPercentValue(value: number, decimale = 0): string {
  return procenatSirov(value, decimale);
}

/** Relative delta 0.12 → „+12,0 %“. */
export function formatSignedPercent(delta: number): string {
  return procenat(delta, 1, true);
}

/** Percentage-point delta 1.34 → „+1,3 pp“. */
export function formatSignedPp(delta: number): string {
  return `${signedDecimalFmt.format(delta)}${NBSP}pp`;
}

/** Currency formatting with dynamic ISO currency code (e.g. "RSD", "EUR", "USD"). If currencyCode is absent, formats bare number. */
export function formatCurrency(value: number, currencyCode?: string): string {
  if (!currencyCode) {
    return decimalFmt.format(value);
  }
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 2,
  }).format(value);
}

// ── dates ("YYYY-MM-DD" keys) ────────────────────────────────────────────────

const longDateFmt = new Intl.DateTimeFormat(LOCALE, {
  weekday: "short",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const clockFmt = new Intl.DateTimeFormat(LOCALE, {
  hour: "2-digit",
  minute: "2-digit",
});

/** Kratki nazivi meseca — fiksni, da izlaz ne zavisi od ICU podataka. */
export const MESECI_KRATKO = [
  "jan",
  "feb",
  "mar",
  "apr",
  "maj",
  "jun",
  "jul",
  "avg",
  "sep",
  "okt",
  "nov",
  "dec",
] as const;

/** A moment as a wall clock reading in the reader's own time zone — "14:35". */
export function formatClockTime(timestamp: number): string {
  return clockFmt.format(new Date(timestamp));
}

/** Parse a "YYYY-MM-DD" key as a local date (no TZ shift). */
function keyToLocalDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toDate(value: number | string): Date {
  return typeof value === "string" ? keyToLocalDate(value) : new Date(value);
}

/**
 * Datum celim brojevima: „27. 10. 2026.“. Prima ključ „YYYY-MM-DD“ ili
 * trenutak u ms (čitaočeva vremenska zona).
 */
export function formatDate(value: number | string): string {
  const d = toDate(value);
  return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}.`;
}

/** "2026-08-15" → „15. avg“ (osa grafikona). */
export function formatShortDate(key: string): string {
  const d = keyToLocalDate(key);
  return `${d.getDate()}. ${MESECI_KRATKO[d.getMonth()]}`;
}

/** Trenutak u ms → „15. avg“ (npr. „podaci od 15. avg“). */
export function formatShortDateAt(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getDate()}. ${MESECI_KRATKO[d.getMonth()]}`;
}

/** Trenutak u ms → „okt“. */
export function formatMonthShort(timestamp: number): string {
  return MESECI_KRATKO[new Date(timestamp).getMonth()];
}

/** "2026-08-15" → "sub, 15. avgust 2026." (tooltips). */
export function formatLongDate(key: string): string {
  return longDateFmt.format(keyToLocalDate(key));
}

/** Timestamp in ms → „27. 10. 2026. 14:35“. */
export function formatDateTime(timestamp: number): string {
  return `${formatDate(timestamp)} ${formatClockTime(timestamp)}`;
}

/**
 * Raspon dana: „1.–15. okt“ (isti mesec), „28. sep – 15. okt“ (isti
 * godina), „28. dec 2025. – 3. jan 2026.“ (preko godine).
 */
export function formatDateSpan(from: string, to: string): string {
  const a = keyToLocalDate(from);
  const b = keyToLocalDate(to);
  const ma = MESECI_KRATKO[a.getMonth()];
  const mb = MESECI_KRATKO[b.getMonth()];
  if (a.getFullYear() !== b.getFullYear()) {
    return `${a.getDate()}. ${ma} ${a.getFullYear()}. – ${b.getDate()}. ${mb} ${b.getFullYear()}.`;
  }
  if (a.getMonth() !== b.getMonth()) {
    return `${a.getDate()}. ${ma} – ${b.getDate()}. ${mb}`;
  }
  if (a.getDate() === b.getDate()) return `${a.getDate()}. ${ma}`;
  return `${a.getDate()}.–${b.getDate()}. ${ma}`;
}

/**
 * Watch time in minutes → "45 min" / "12,3 h" / "1.234 h". YouTube reports
 * `estimatedMinutesWatched`; hours are the unit people actually read.
 */
export function formatWatchTime(minutes: number): string {
  if (minutes < 60) return `${integerFmt.format(Math.round(minutes))}${NBSP}min`;
  const hours = minutes / 60;
  return hours < 100
    ? `${decimalFmt.format(hours)}${NBSP}h`
    : `${integerFmt.format(Math.round(hours))}${NBSP}h`;
}

/** Trajanje u sekundama: „42 s“, „1 min 1 s“, „1 h 2 min“, „0 s“. */
export function formatDuration(seconds: number): string {
  return trajanje(seconds);
}

/** Trajanje u milisekundama — isti format kao `formatDuration`. */
export function formatDurationMs(ms: number): string {
  return trajanje(ms / 1000);
}

/** Trajanje u sekundama — isti format kao `formatDuration`. */
export function formatSeconds(sec: number): string {
  return trajanje(sec);
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

// ── relative days (lead CRM) ─────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfLocalDay(timestamp: number): number {
  const d = new Date(timestamp);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Razlika u LOKALNIM danima: 23:50 i 00:10 sutradan su jedan dan razmaka, ne
 * nula. Pozitivno kad je `later` posle `earlier`. Zaokružuje se, ne seče, da
 * prelaz na letnje/zimsko vreme ne pravi „0,96 dana”.
 */
export function localDayDiff(later: number, earlier: number): number {
  return Math.round(
    (startOfLocalDay(later) - startOfLocalDay(earlier)) / DAY_MS,
  );
}

/** „danas” / „juče” / „pre 12 dana” — celi lokalni dani, nikad „pre 0 dana”. */
export function formatDaysAgo(timestamp: number, now = Date.now()): string {
  const days = localDayDiff(now, timestamp);
  if (days <= 0) return "danas";
  if (days === 1) return "juče";
  return `pre ${days} ${pluralSr(days, "dan", "dana", "dana")}`;
}

const DANI_KRATKO = ["ned", "pon", "uto", "sre", "čet", "pet", "sub"] as const;

/** „danas” / „sutra” / „juče” / „pet, 12. sep” — dan u odnosu na sada. */
export function formatDayRelative(timestamp: number, now = Date.now()): string {
  const days = localDayDiff(timestamp, now);
  if (days === 0) return "danas";
  if (days === 1) return "sutra";
  if (days === -1) return "juče";
  return `${DANI_KRATKO[new Date(timestamp).getDay()]}, ${formatShortDateAt(timestamp)}`;
}
