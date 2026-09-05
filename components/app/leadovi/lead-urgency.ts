/**
 * Hitnost leada, izvedena PRI ČITANJU iz stanja dodele (§7, §8).
 *
 * Ovde nema upisa i nema slobodnog teksta: svaka funkcija gleda samo
 * `leadAssignments` red (i temperaturu firme) i vraća činjenicu koju ekran
 * sme da oboji. Boja u tabeli nosi tačno tri značenja (§2/O3) —
 * temperatura, hitnost, ishod — i ovaj fajl je jedino mesto koje odlučuje
 * koje od njih red dobija.
 */
import type { Doc } from "@/convex/_generated/dataModel";
import {
  formatClockTime,
  formatDayRelative,
  formatDaysAgo,
  localDayDiff,
  pluralSr,
} from "@/lib/format";

export type LeadRowContact = { value: string; personName?: string };
export type LeadRowPerson = {
  name: string;
  role: string;
  roleConfidence: string;
};
export type LeadRowTouch = { channel: string; note?: string; occurredAt: number };

/**
 * Jedan red tabele, kako ga vraćaju `listByStage` / `listByOwner` /
 * `listOverdue` (§3). Nizovi su uvek prisutni: prazan niz znači „nema u
 * bazi”, a „nije učitano” je `undefined` na nivou celog upita, ne ovde.
 */
export type LeadRowItem = {
  assignment: Doc<"leadAssignments">;
  company: Doc<"leadCompanies"> | null;
  telefoni: LeadRowContact[];
  emailovi: LeadRowContact[];
  osobe: LeadRowPerson[];
  signali: string[];
  poslednjiDodir?: LeadRowTouch;
  isOverdue?: boolean;
  delayMs?: number;
};

type Assignment = Doc<"leadAssignments">;

/** Posle ovoliko dana bez dodira kolona „Poslednji dodir” tiho crveni (§7). */
export const UNTOUCHED_LIMIT_DAYS = 30;

export function isNextActionOverdue(a: Assignment, now: number): boolean {
  return a.nextActionAt !== undefined && a.nextActionAt < now;
}

/** Sastanak danas ili sutra po LOKALNOM danu; termin ranije danas je i dalje „danas”. */
export function isMeetingSoon(a: Assignment, now: number): boolean {
  if (a.meetingAt === undefined) return false;
  const d = localDayDiff(a.meetingAt, now);
  return d === 0 || d === 1;
}

export function isMeetingToday(a: Assignment, now: number): boolean {
  return a.meetingAt !== undefined && localDayDiff(a.meetingAt, now) === 0;
}

/** Sastanak je prošao, a ishod nije zabeležen u trenutku sastanka ili posle njega. */
export function isMeetingUnresolved(a: Assignment, now: number): boolean {
  if (a.meetingAt === undefined || a.meetingAt >= now) return false;
  return !(a.outcomeAt !== undefined && a.outcomeAt >= a.meetingAt);
}

/**
 * Dana bez dodira: od poslednjeg dodira, ili — kad ga nikad nije bilo — od
 * dodele. Lead koji 40 dana stoji u bazi bez ijednog dodira jeste 40 dana bez
 * dodira; nula bi ovde bila laž.
 */
export function daysWithoutTouch(a: Assignment, now: number): number {
  const since = a.lastTouchAt ?? a.createdAt ?? a._creationTime;
  return Math.max(0, localDayDiff(now, since));
}

export function isUntouchedTooLong(a: Assignment, now: number): boolean {
  return daysWithoutTouch(a, now) > UNTOUCHED_LIMIT_DAYS;
}

export type RowEdge = "overdue" | "meeting" | "hot" | "warm" | "cold" | null;

/**
 * Leva ivica reda (§7), po prioritetu: zaostao korak → sastanak danas/sutra →
 * temperatura → ništa. Hitnost se NIKAD ne meša sa temperaturom: zaostao lead
 * je zaostao i kad je „cold”.
 */
export function rowEdge(item: LeadRowItem, now: number): RowEdge {
  if (isNextActionOverdue(item.assignment, now)) return "overdue";
  if (isMeetingSoon(item.assignment, now)) return "meeting";
  const t = item.company?.temperatura;
  if (t === "hot" || t === "warm" || t === "cold") return t;
  return null;
}

export const ROW_EDGE_CLASS: Record<Exclude<RowEdge, null>, string> = {
  overdue: "border-l-danger",
  meeting: "border-l-warning",
  hot: "border-l-temp-hot",
  warm: "border-l-temp-warm",
  cold: "border-l-temp-cold",
};

export type NextUpTone = "danger" | "warning" | "neutral" | "success" | "muted";
export type NextUp = { text: string; tone: NextUpTone };

function dayAndClock(ts: number, now: number): string {
  return `${formatDayRelative(ts, now)} u ${formatClockTime(ts)}`;
}

/**
 * „Šta je sledeće” (§8): jedna rečenica izvedena iz stanja, po prioritetu —
 * zatvoren lead, zaostao korak, prošao sastanak bez ishoda, pa ono što je
 * prvo na redu (sastanak ili korak, šta je ranije), pa „nema plana”.
 */
export function describeNextUp(a: Assignment | null, now: number): NextUp {
  if (!a) {
    return { text: "Lead nema vlasnika ni planiran korak.", tone: "muted" };
  }
  if (a.stage === "dobijen") {
    return { text: "Dobijen — lead je zatvoren kao uspešan.", tone: "success" };
  }
  if (a.stage === "izgubljen") {
    return { text: "Izgubljen — lead je zatvoren.", tone: "muted" };
  }

  if (a.nextActionAt !== undefined && a.nextActionAt < now) {
    const days = localDayDiff(now, a.nextActionAt);
    const koliko =
      days <= 0
        ? `Rok istekao danas u ${formatClockTime(a.nextActionAt)}`
        : `Zaostalo ${days} ${pluralSr(days, "dan", "dana", "dana")}`;
    return {
      text: a.nextActionNote
        ? `${koliko}: „${a.nextActionNote}”`
        : `${koliko} — sledeći korak bez napomene.`,
      tone: "danger",
    };
  }

  if (isMeetingUnresolved(a, now)) {
    return {
      text: `Sastanak je prošao (${formatDaysAgo(a.meetingAt!, now)}), ishod nije zabeležen.`,
      tone: "danger",
    };
  }

  const meeting =
    a.meetingAt !== undefined && a.meetingAt >= now ? a.meetingAt : undefined;
  const step =
    a.nextActionAt !== undefined && a.nextActionAt >= now
      ? a.nextActionAt
      : undefined;

  if (meeting !== undefined && (step === undefined || meeting <= step)) {
    const kad = dayAndClock(meeting, now);
    const soon = localDayDiff(meeting, now) <= 1;
    return {
      text: a.meetingNote
        ? `Sastanak ${kad} — „${a.meetingNote}”`
        : `Sastanak ${kad}.`,
      tone: soon ? "warning" : "neutral",
    };
  }

  if (step !== undefined) {
    const kad = dayAndClock(step, now);
    return {
      text: a.nextActionNote
        ? `Sledeći korak ${kad}: „${a.nextActionNote}”`
        : `Sledeći korak ${kad}.`,
      tone: "neutral",
    };
  }

  return { text: "Nema planiran korak.", tone: "muted" };
}

/** `tel:` prima samo cifre i vodeći plus; razmaci i crte iz tabele bi link pokvarili. */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

export function mailHref(email: string): string {
  return `mailto:${email.trim()}`;
}
