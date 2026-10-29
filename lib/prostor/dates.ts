// Preneto iz Devotion packages/shared/src/dates.ts (main @ c05c40f), SPAJANJE S02.
/**
 * Datumi za oba klijenta (web i telefon): lokalni kalendarski dan (`dayKey`),
 * granice dana, lokalno podne kao kanonska vrednost roka, srpski formati i brzi
 * izbori roka. Ista semantika kao `fromDateInputValue` u
 * `apps/web/lib/workspace.ts`: rok se čuva u LOKALNO PODNE, pa poređenje po danu
 * ne zavisi od sata u kom je rok upisan.
 *
 * Svaka funkcija koja zavisi od kalendara prima opcionu `zone` (IANA, npr.
 * "Europe/Belgrade"):
 *  - bez nje radi se nad lokalnom zonom uređaja kroz obične `Date` metode — to
 *    je put koji aplikacije koriste i koji radi i na Hermes-u;
 *  - sa njom računa se kroz `Intl.DateTimeFormat` — to je put za testove (da
 *    budu isti na svakoj mašini) i za buduće serversko računanje.
 *
 * Imena dana i meseci su iz sopstvenih nizova, ne iz `Intl`, da web i Hermes
 * daju isti tekst. Nedelja počinje ponedeljkom.
 */

export type DayKey = string;

export const DAY_MS = 86_400_000;

export const SR_WEEKDAYS = [
  "ponedeljak",
  "utorak",
  "sreda",
  "četvrtak",
  "petak",
  "subota",
  "nedelja",
] as const;

export const SR_WEEKDAYS_SHORT = [
  "pon",
  "uto",
  "sre",
  "čet",
  "pet",
  "sub",
  "ned",
] as const;

export const SR_MONTHS = [
  "januar",
  "februar",
  "mart",
  "april",
  "maj",
  "jun",
  "jul",
  "avgust",
  "septembar",
  "oktobar",
  "novembar",
  "decembar",
] as const;

export const SR_MONTHS_SHORT = [
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

// --- Kalendar (lokalni ili po zoni) -----------------------------------------

type WallTime = {
  year: number;
  /** 1–12 */
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
};

type Calendar = {
  toWall(ms: number): WallTime;
  fromWall(wall: WallTime): number;
};

const localCalendar: Calendar = {
  toWall(ms) {
    const date = new Date(ms);
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
      second: date.getSeconds(),
      millisecond: date.getMilliseconds(),
    };
  },
  fromWall(wall) {
    return new Date(
      wall.year,
      wall.month - 1,
      wall.day,
      wall.hour,
      wall.minute,
      wall.second,
      wall.millisecond,
    ).getTime();
  },
};

const zonedFormatters = new Map<string, Intl.DateTimeFormat>();

function zonedFormatter(zone: string) {
  let formatter = zonedFormatters.get(zone);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    zonedFormatters.set(zone, formatter);
  }
  return formatter;
}

function zonedCalendar(zone: string): Calendar {
  const formatter = zonedFormatter(zone);
  const toWall = (ms: number): WallTime => {
    const values: Record<string, number> = {};
    for (const part of formatter.formatToParts(new Date(ms))) {
      if (part.type !== "literal") values[part.type] = Number(part.value);
    }
    const millisecond = ((ms % 1000) + 1000) % 1000;
    return {
      year: values.year,
      month: values.month,
      day: values.day,
      // Neki ICU izdanja daju „24" za ponoć i uz h23 — svodi se na 0.
      hour: values.hour === 24 ? 0 : values.hour,
      minute: values.minute,
      second: values.second,
      millisecond,
    };
  };
  /** Pomak zone (ms) u trenutku `ms`: zidni sat kao UTC minus pravi trenutak. */
  const offsetAt = (ms: number) => {
    const wall = toWall(ms);
    const asUtc = Date.UTC(
      wall.year,
      wall.month - 1,
      wall.day,
      wall.hour,
      wall.minute,
      wall.second,
      wall.millisecond,
    );
    return asUtc - ms;
  };
  return {
    toWall,
    fromWall(wall) {
      const guess = Date.UTC(
        wall.year,
        wall.month - 1,
        wall.day,
        wall.hour,
        wall.minute,
        wall.second,
        wall.millisecond,
      );
      // Dve iteracije: prva pogađa pomak, druga ga ispravlja ako je prelaz na
      // letnje/zimsko vreme između pogotka i stvarnog trenutka. Ponoć i podne
      // nikad nisu u „rupi" prelaza za zone koje aplikacija koristi.
      const first = guess - offsetAt(guess);
      const second = guess - offsetAt(first);
      return second;
    },
  };
}

function calendarFor(zone?: string): Calendar {
  return zone === undefined ? localCalendar : zonedCalendar(zone);
}

// --- dayKey -----------------------------------------------------------------

function pad(value: number, width = 2) {
  return String(value).padStart(width, "0");
}

function formatKey(year: number, month: number, day: number): DayKey {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

function parseKey(key: DayKey) {
  if (!isDayKey(key)) throw new Error(`Neispravan dan: ${key}`);
  return {
    year: Number(key.slice(0, 4)),
    month: Number(key.slice(5, 7)),
    day: Number(key.slice(8, 10)),
  };
}

function keyToUtc(key: DayKey) {
  const { year, month, day } = parseKey(key);
  return Date.UTC(year, month - 1, day);
}

/** `YYYY-MM-DD` koji je stvaran kalendarski datum (bez 2026-02-30). */
export function isDayKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (month < 1 || month > 12 || day < 1) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** Lokalni kalendarski dan trenutka `ms`. */
export function dayKeyOf(ms: number, zone?: string): DayKey {
  const wall = calendarFor(zone).toWall(ms);
  return formatKey(wall.year, wall.month, wall.day);
}

/** Čista kalendarska aritmetika nad ključem — bez zone i bez sata. */
export function addDaysToKey(key: DayKey, days: number): DayKey {
  const date = new Date(keyToUtc(key) + days * DAY_MS);
  return formatKey(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  );
}

/** Broj kalendarskih dana od `from` do `to` (negativno kad je `to` ranije). */
export function diffDayKeys(from: DayKey, to: DayKey): number {
  return Math.round((keyToUtc(to) - keyToUtc(from)) / DAY_MS);
}

/** ISO dan u nedelji: ponedeljak = 1 … nedelja = 7. */
export function isoWeekday(key: DayKey): 1 | 2 | 3 | 4 | 5 | 6 | 7 {
  const sundayBased = new Date(keyToUtc(key)).getUTCDay();
  return (((sundayBased + 6) % 7) + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
}

/** Ponedeljak nedelje kojoj dan pripada. */
export function startOfWeekKey(key: DayKey): DayKey {
  return addDaysToKey(key, -(isoWeekday(key) - 1));
}

// --- Granice dana -----------------------------------------------------------

function wallOfKey(key: DayKey, hour: number): WallTime {
  const { year, month, day } = parseKey(key);
  return { year, month, day, hour, minute: 0, second: 0, millisecond: 0 };
}

/** Prvi trenutak lokalnog dana `key`. */
export function startOfDayKey(key: DayKey, zone?: string): number {
  return calendarFor(zone).fromWall(wallOfKey(key, 0));
}

/** Lokalno podne dana `key` — kanonska vrednost roka. */
export function noonOfDayKey(key: DayKey, zone?: string): number {
  return calendarFor(zone).fromWall(wallOfKey(key, 12));
}

/** Lokalna ponoć dana u kome je `ms` (dan od 23 i 25 sati je tačan). */
export function startOfDay(ms: number, zone?: string): number {
  return startOfDayKey(dayKeyOf(ms, zone), zone);
}

/** Sledeća lokalna ponoć posle `ms` — trenutak preklasifikacije. */
export function nextLocalMidnight(ms: number, zone?: string): number {
  return startOfDayKey(addDaysToKey(dayKeyOf(ms, zone), 1), zone);
}

/** Poslednja milisekunda lokalnog dana u kome je `ms`. */
export function endOfDay(ms: number, zone?: string): number {
  return nextLocalMidnight(ms, zone) - 1;
}

/** Podne istog lokalnog dana — kako se rok normalizuje pre upisa. */
export function noonOf(ms: number, zone?: string): number {
  return noonOfDayKey(dayKeyOf(ms, zone), zone);
}

/**
 * Isti zidni sat `days` kalendarskih dana kasnije (ili ranije). Preko prelaza
 * na letnje vreme pomeraj u ms nije `days × 24 h`, ali sat na zidu ostaje isti.
 */
export function addDays(ms: number, days: number, zone?: string): number {
  const calendar = calendarFor(zone);
  const wall = calendar.toWall(ms);
  const key = addDaysToKey(formatKey(wall.year, wall.month, wall.day), days);
  const { year, month, day } = parseKey(key);
  return calendar.fromWall({ ...wall, year, month, day });
}

/** Razlika u kalendarskim danima između roka i sada (negativno = prošlo). */
export function dayDiff(dueMs: number, nowMs: number, zone?: string): number {
  return diffDayKeys(dayKeyOf(nowMs, zone), dayKeyOf(dueMs, zone));
}

// --- Brzi izbori roka -------------------------------------------------------

export type DueShortcut = "today" | "tomorrow" | "weekend" | "nextWeek";

export const DUE_SHORTCUTS: ReadonlyArray<DueShortcut> = [
  "today",
  "tomorrow",
  "weekend",
  "nextWeek",
];

export const DUE_SHORTCUT_LABELS: Record<DueShortcut, string> = {
  today: "Danas",
  tomorrow: "Sutra",
  weekend: "Vikend",
  nextWeek: "Sledeće nedelje",
};

/**
 * Dan koji brzi izbor znači u trenutku `nowMs`:
 *  - Danas / Sutra — očigledno;
 *  - Vikend — pon–pet: ova subota; subota: danas; nedelja: sledeća subota
 *    (vikend se upravo završava, „za vikend" je sledeći);
 *  - Sledeće nedelje — ponedeljak sledeće nedelje (u nedelju je to sutra).
 */
export function dueShortcutDayKey(
  shortcut: DueShortcut,
  nowMs: number,
  zone?: string,
): DayKey {
  const today = dayKeyOf(nowMs, zone);
  const weekday = isoWeekday(today);
  switch (shortcut) {
    case "today":
      return today;
    case "tomorrow":
      return addDaysToKey(today, 1);
    case "weekend":
      if (weekday <= 5) return addDaysToKey(today, 6 - weekday);
      return weekday === 6 ? today : addDaysToKey(today, 6);
    case "nextWeek":
      return addDaysToKey(today, 8 - weekday);
  }
}

/** Vrednost roka za brzi izbor — lokalno podne tog dana. */
export function dueShortcutValue(
  shortcut: DueShortcut,
  nowMs: number,
  zone?: string,
): number {
  return noonOfDayKey(dueShortcutDayKey(shortcut, nowMs, zone), zone);
}

// --- Srpski formati ---------------------------------------------------------

function wallParts(ms: number, zone?: string) {
  const key = dayKeyOf(ms, zone);
  const { year, month, day } = parseKey(key);
  return { key, year, month, day, weekday: isoWeekday(key) };
}

/** „09:12" — sat i minut (24 h) u lokalnoj zoni ili zadatoj zoni. */
export function formatClock(ms: number, zone?: string): string {
  const { hour, minute } = calendarFor(zone).toWall(ms);
  return `${pad(hour)}:${pad(minute)}`;
}

/** „1 dan", „2 dana", „21 dan" — srpska pluralizacija. */
export function daysWord(count: number): string {
  const absolute = Math.abs(count);
  return absolute % 10 === 1 && absolute % 100 !== 11 ? "dan" : "dana";
}

/** „05.03.2026." — dan i mesec uvek sa dve cifre, tačka na kraju. */
export function formatDateNumeric(ms: number, zone?: string): string {
  const { year, month, day } = wallParts(ms, zone);
  return `${pad(day)}.${pad(month)}.${year}.`;
}

/** „uto 27. okt" */
export function formatDateShort(ms: number, zone?: string): string {
  const { month, day, weekday } = wallParts(ms, zone);
  return `${SR_WEEKDAYS_SHORT[weekday - 1]} ${day}. ${SR_MONTHS_SHORT[month - 1]}`;
}

/** „subota 24. oktobar" — zaglavlje Moj dan. */
export function formatDayHeading(ms: number, zone?: string): string {
  const { month, day, weekday } = wallParts(ms, zone);
  return `${SR_WEEKDAYS[weekday - 1]} ${day}. ${SR_MONTHS[month - 1]}`;
}

/**
 * „danas" / „sutra" / „juče"; u istoj godini „uto 27. okt"; u drugoj
 * godini „27.10.2027.".
 */
export function formatDayRelative(
  ms: number,
  nowMs: number,
  zone?: string,
): string {
  const diff = dayDiff(ms, nowMs, zone);
  if (diff === 0) return "danas";
  if (diff === 1) return "sutra";
  if (diff === -1) return "juče";
  const target = wallParts(ms, zone);
  const now = wallParts(nowMs, zone);
  return target.year === now.year
    ? formatDateShort(ms, zone)
    : formatDateNumeric(ms, zone);
}

export type DueTone = "overdue" | "today" | "soon" | "later" | "none";

export type DueDescription = {
  /** Kratko, za čip: „kasni 3 d", „danas", „sutra", „čet 29. okt". */
  label: string;
  /** Cela rečenica za čitače ekrana — bez skraćenica. */
  ariaLabel: string;
  tone: DueTone;
  /** Kalendarski dani do roka; `null` bez roka. */
  dayDiff: number | null;
};

/** Opis roka za čip i čitač ekrana. Prozor „uskoro" je 1–7 dana. */
export function describeDue(
  dueMs: number | null,
  nowMs: number,
  zone?: string,
): DueDescription {
  if (dueMs === null) {
    return { label: "Bez roka", ariaLabel: "Bez roka", tone: "none", dayDiff: null };
  }
  const diff = dayDiff(dueMs, nowMs, zone);
  if (diff < 0) {
    const late = Math.abs(diff);
    return {
      label: `kasni ${late} d`,
      ariaLabel: `Rok je prošao: kasni ${late} ${daysWord(late)}`,
      tone: "overdue",
      dayDiff: diff,
    };
  }
  if (diff === 0) {
    return { label: "danas", ariaLabel: "Rok je danas", tone: "today", dayDiff: 0 };
  }
  if (diff === 1) {
    return { label: "sutra", ariaLabel: "Rok je sutra", tone: "soon", dayDiff: 1 };
  }
  if (diff <= 7) {
    return {
      label: formatDateShort(dueMs, zone),
      ariaLabel: `Rok: ${formatDayHeading(dueMs, zone)}`,
      tone: "soon",
      dayDiff: diff,
    };
  }
  const sameYear = wallParts(dueMs, zone).year === wallParts(nowMs, zone).year;
  return {
    label: formatDayRelative(dueMs, nowMs, zone),
    ariaLabel: sameYear
      ? `Rok: ${formatDayHeading(dueMs, zone)}`
      : `Rok: ${formatDateNumeric(dueMs, zone)}`,
    tone: "later",
    dayDiff: diff,
  };
}

/**
 * Opis roka za red liste: otvoren zadatak ide kroz `describeDue`; završen
 * prikazuje samo datum bez tona upozorenja — završen zadatak ne „kasni".
 * Isti tekst na webu i telefonu.
 */
export function describeDueForRow(
  dueMs: number | null,
  nowMs: number,
  done: boolean,
  zone?: string,
): DueDescription {
  const due = describeDue(dueMs, nowMs, zone);
  if (!done || dueMs === null || due.tone === "none") return due;
  const date = formatDateShort(dueMs, zone);
  return { label: date, ariaLabel: `Rok je bio ${date}`, tone: "later", dayDiff: due.dayDiff };
}
