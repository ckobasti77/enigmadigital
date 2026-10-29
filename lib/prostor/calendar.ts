// Preneto iz Devotion packages/shared/src/calendar.ts (main @ c05c40f), SPAJANJE S02.
/**
 * Birač datuma (P9, plan K07 §1.4) — čista logika za oba klijenta: mesečna
 * mreža (nedelja počinje ponedeljkom), srpski nazivi, kretanje tastaturom i
 * čipovi brzog izbora. Vrednost roka je uvek LOKALNO PODNE izabranog dana
 * (`noonOfDayKey`), ista semantika kao `fromDateInputValue` na webu. ČISTO:
 * bez React-a i bez platformskih API-ja.
 */
import {
  addDaysToKey,
  dayKeyOf,
  DUE_SHORTCUT_LABELS,
  DUE_SHORTCUTS,
  dueShortcutDayKey,
  isDayKey,
  isoWeekday,
  noonOfDayKey,
  SR_MONTHS,
  SR_WEEKDAYS,
  SR_WEEKDAYS_SHORT,
  startOfWeekKey,
  type DayKey,
  type DueShortcut,
} from "./dates";

/** `YYYY-MM` — mesec koji mreža prikazuje. */
export type MonthKey = string;

/** Zaglavlje kolona mreže: „pon uto sre čet pet sub ned". */
export const CALENDAR_WEEKDAYS: ReadonlyArray<string> = SR_WEEKDAYS_SHORT;

/** Mreža uvek ima 6 nedelja, da visina popovera ne skače pri promeni meseca. */
export const CALENDAR_WEEKS = 6;

function pad(value: number, width = 2) {
  return String(value).padStart(width, "0");
}

function parseMonth(month: MonthKey) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error(`Neispravan mesec: ${month}`);
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7));
  if (index < 1 || index > 12) throw new Error(`Neispravan mesec: ${month}`);
  return { year, month: index };
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Mesec kome dan pripada. */
export function monthKeyOf(key: DayKey): MonthKey {
  return key.slice(0, 7);
}

/** Pomeri mesec za `delta` (prelazi godinu). */
export function shiftMonth(month: MonthKey, delta: number): MonthKey {
  const { year, month: index } = parseMonth(month);
  const total = year * 12 + (index - 1) + delta;
  return `${pad(Math.floor(total / 12), 4)}-${pad((total % 12) + 1)}`;
}

/**
 * Isti dan `delta` meseci kasnije; dan se skraćuje na kraj kraćeg meseca
 * (31. januar + 1 → 28./29. februar).
 */
export function addMonthsToKey(key: DayKey, delta: number): DayKey {
  const target = shiftMonth(monthKeyOf(key), delta);
  const { year, month } = parseMonth(target);
  const day = Math.min(Number(key.slice(8, 10)), daysInMonth(year, month));
  return `${target}-${pad(day)}`;
}

/** „oktobar 2026" */
export function formatMonthTitle(month: MonthKey): string {
  const { year, month: index } = parseMonth(month);
  return `${SR_MONTHS[index - 1]} ${year}`;
}

/** „subota 24. oktobar 2026" (+ „, danas") — oznaka dana za čitač ekrana. */
export function dayAriaLabel(key: DayKey, todayKey: DayKey): string {
  const weekday = isoWeekday(key);
  const month = Number(key.slice(5, 7));
  const day = Number(key.slice(8, 10));
  const label = `${SR_WEEKDAYS[weekday - 1]} ${day}. ${SR_MONTHS[month - 1]} ${key.slice(0, 4)}`;
  return key === todayKey ? `${label}, danas` : label;
}

export type CalendarDay = {
  key: DayKey;
  /** Dan u mesecu (1–31). */
  day: number;
  /** Pripada prikazanom mesecu (ostali su prigušeni rubni dani). */
  inMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  /** Subota ili nedelja. */
  isWeekend: boolean;
};

/**
 * Mreža meseca: 6 nedelja × 7 dana, prva kolona je ponedeljak. Počinje
 * ponedeljkom nedelje u kojoj je prvi dan meseca.
 */
export function monthGrid(
  month: MonthKey,
  options: { todayKey: DayKey; selectedKey: DayKey | null },
): CalendarDay[][] {
  parseMonth(month);
  let key = startOfWeekKey(`${month}-01`);
  const weeks: CalendarDay[][] = [];
  for (let week = 0; week < CALENDAR_WEEKS; week += 1) {
    const days: CalendarDay[] = [];
    for (let column = 0; column < 7; column += 1) {
      days.push({
        key,
        day: Number(key.slice(8, 10)),
        inMonth: monthKeyOf(key) === month,
        isToday: key === options.todayKey,
        isSelected: key === options.selectedKey,
        isWeekend: column >= 5,
      });
      key = addDaysToKey(key, 1);
    }
    weeks.push(days);
  }
  return weeks;
}

// --- Tastatura (plan K07 §6.1) ----------------------------------------------

export type CalendarMove =
  | "prevDay"
  | "nextDay"
  | "prevWeek"
  | "nextWeek"
  | "prevMonth"
  | "nextMonth"
  | "prevYear"
  | "nextYear"
  | "weekStart"
  | "weekEnd";

/**
 * Taster → pomeraj fokusa u mreži (obrazac WAI-ARIA „date picker dialog"):
 * strelice dan/nedelja, PageUp/PageDown mesec (uz Shift godina), Home/End
 * početak i kraj nedelje. Ostali tasteri → `null`.
 */
export function calendarMoveForKey(key: string, shiftKey = false): CalendarMove | null {
  switch (key) {
    case "ArrowLeft":
      return "prevDay";
    case "ArrowRight":
      return "nextDay";
    case "ArrowUp":
      return "prevWeek";
    case "ArrowDown":
      return "nextWeek";
    case "PageUp":
      return shiftKey ? "prevYear" : "prevMonth";
    case "PageDown":
      return shiftKey ? "nextYear" : "nextMonth";
    case "Home":
      return "weekStart";
    case "End":
      return "weekEnd";
    default:
      return null;
  }
}

/** Dan na koji fokus prelazi posle pomeraja. */
export function moveCalendarFocus(key: DayKey, move: CalendarMove): DayKey {
  switch (move) {
    case "prevDay":
      return addDaysToKey(key, -1);
    case "nextDay":
      return addDaysToKey(key, 1);
    case "prevWeek":
      return addDaysToKey(key, -7);
    case "nextWeek":
      return addDaysToKey(key, 7);
    case "prevMonth":
      return addMonthsToKey(key, -1);
    case "nextMonth":
      return addMonthsToKey(key, 1);
    case "prevYear":
      return addMonthsToKey(key, -12);
    case "nextYear":
      return addMonthsToKey(key, 12);
    case "weekStart":
      return startOfWeekKey(key);
    case "weekEnd":
      return addDaysToKey(startOfWeekKey(key), 6);
  }
}

// --- Vrednost i čipovi -------------------------------------------------------

/** Vrednost roka za izabran dan — lokalno podne. */
export function dueFromDayKey(key: DayKey, zone?: string): number {
  if (!isDayKey(key)) throw new Error(`Neispravan dan: ${key}`);
  return noonOfDayKey(key, zone);
}

/** Dan koji vrednost roka predstavlja (`null` bez roka). */
export function dayKeyOfDue(value: number | null, zone?: string): DayKey | null {
  return value === null ? null : dayKeyOf(value, zone);
}

export type DatePickerChipId = DueShortcut | "none";

export type DatePickerChip = {
  id: DatePickerChipId;
  label: string;
  /** Lokalno podne dana čipa; `null` za „Bez roka". */
  value: number | null;
  dayKey: DayKey | null;
};

export const NO_DUE_LABEL = "Bez roka";

/**
 * Čipovi birača: Danas · Sutra · Vikend · Sledeće nedelje · Bez roka.
 * Vrednost je lokalno podne (pravila „Vikend"/„Sledeće nedelje" iz `dates.ts`).
 */
export function datePickerChips(
  nowMs: number,
  options: { zone?: string; allowClear?: boolean } = {},
): DatePickerChip[] {
  const chips: DatePickerChip[] = DUE_SHORTCUTS.map((shortcut) => {
    const dayKey = dueShortcutDayKey(shortcut, nowMs, options.zone);
    return {
      id: shortcut,
      label: DUE_SHORTCUT_LABELS[shortcut],
      value: noonOfDayKey(dayKey, options.zone),
      dayKey,
    };
  });
  if (options.allowClear !== false) {
    chips.push({ id: "none", label: NO_DUE_LABEL, value: null, dayKey: null });
  }
  return chips;
}

/**
 * Koji čip je izabran za vrednost: prvi čiji je dan isti (petkom, subotom i
 * nedeljom dve prečice mogu biti isti dan — kvačica ide samo na prvu).
 * Vrednost koja nije podne poredi se po danu.
 */
export function selectedDatePickerChip(
  value: number | null,
  nowMs: number,
  zone?: string,
): DatePickerChipId | null {
  if (value === null) return "none";
  const key = dayKeyOf(value, zone);
  for (const shortcut of DUE_SHORTCUTS) {
    if (dueShortcutDayKey(shortcut, nowMs, zone) === key) return shortcut;
  }
  return null;
}

/** Mesec koji birač prikazuje pri otvaranju: izabranog dana, inače današnji. */
export function initialMonth(value: number | null, nowMs: number, zone?: string): MonthKey {
  return monthKeyOf(dayKeyOf(value ?? nowMs, zone));
}
