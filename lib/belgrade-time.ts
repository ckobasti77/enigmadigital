/**
 * Scheduling in the operator's own zone (F3).
 *
 * A scheduled post is stored as a timestamp in milliseconds and nothing else —
 * a string like "2026-08-20 18:30" is not a moment in time until somebody says
 * in which zone, and the cron that picks the job up is not in a position to
 * ask. The picker, on the other hand, has to speak local time: nobody schedules
 * a post for 16:30 UTC.
 *
 * Europe/Belgrade is pinned rather than taken from the browser. This is one
 * agency posting for Serbian accounts, and "18:30" on the screen has to mean
 * 18:30 in Belgrade whether the laptop is in Novi Sad or in an airport lounge.
 *
 * No dependency: `Intl` already knows every zone and its DST history, so the
 * conversion is arithmetic on what it reports rather than a table we maintain.
 */

export const SCHEDULE_TIME_ZONE = "Europe/Belgrade";
export const SCHEDULE_TIME_ZONE_LABEL = "po beogradskom vremenu";

/** en-CA gives ISO-shaped parts, which is the only reason it is used here. */
const partsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: SCHEDULE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const readableFormatter = new Intl.DateTimeFormat("sr-Latn-RS", {
  timeZone: SCHEDULE_TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

const shortFormatter = new Intl.DateTimeFormat("sr-Latn-RS", {
  timeZone: SCHEDULE_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

type WallClock = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function wallClockAt(instant: number): WallClock {
  const parts = partsFormatter.formatToParts(new Date(instant));
  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  const hour = read("hour");
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    // Some engines render midnight as 24 in a 23-hour clock.
    hour: hour === 24 ? 0 : hour,
    minute: read("minute"),
    second: read("second"),
  };
}

/** How far the zone's clock is ahead of UTC at that instant, in ms. */
function zoneOffsetMs(instant: number): number {
  const wall = wallClockAt(instant);
  return (
    Date.UTC(
      wall.year,
      wall.month - 1,
      wall.day,
      wall.hour,
      wall.minute,
      wall.second,
    ) - instant
  );
}

/**
 * "2026-08-20" + "18:30" as read in Belgrade → epoch milliseconds.
 *
 * Two passes, because the offset depends on the instant and the instant
 * depends on the offset. The first pass guesses with the offset at the naive
 * UTC reading, the second corrects it — which settles every case except the
 * hour that does not exist on the spring-forward night, where any answer is a
 * choice rather than a fact.
 */
export function belgradeToEpoch(
  dateKey: string,
  timeKey: string,
): number | null {
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey.trim());
  const time = /^(\d{1,2}):(\d{2})$/.exec(timeKey.trim());
  if (!date || !time) return null;

  const hour = Number(time[1]);
  const minute = Number(time[2]);
  if (hour > 23 || minute > 59) return null;

  const naive = Date.UTC(
    Number(date[1]),
    Number(date[2]) - 1,
    Number(date[3]),
    hour,
    minute,
  );
  if (!Number.isFinite(naive)) return null;

  const firstPass = naive - zoneOffsetMs(naive);
  return naive - zoneOffsetMs(firstPass);
}

/** Epoch → the two values the `date` and `time` inputs want. */
export function belgradeInputsFor(instant: number): {
  date: string;
  time: string;
} {
  const wall = wallClockAt(instant);
  const pad = (value: number) => String(value).padStart(2, "0");
  return {
    date: `${wall.year}-${pad(wall.month)}-${pad(wall.day)}`,
    time: `${pad(wall.hour)}:${pad(wall.minute)}`,
  };
}

/** "sre, 20. avgust u 18:30" — how a scheduled moment is read out loud. */
export function formatBelgrade(instant: number): string {
  return readableFormatter.format(new Date(instant));
}

/** "20.08. 18:30" — for a table cell, where the long form does not fit. */
export function formatBelgradeShort(instant: number): string {
  return shortFormatter.format(new Date(instant));
}
