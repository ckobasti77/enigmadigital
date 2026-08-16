import { dateKeysBetween } from "./date-range";

/** One `ga4Daily` point as returned by `api.analytics.daily`. */
export type DailyPoint = {
  date: string;
  sessions: number;
  activeUsers: number;
  newUsers: number;
  conversions: number;
  engagementRate: number; // 0..1 for that day
};

export type PeriodTotals = {
  sessions: number;
  activeUsers: number;
  conversions: number;
  /** Session-weighted average of the daily rates (0..1); 0 when no sessions. */
  engagementRate: number;
};

export function summarize(rows: DailyPoint[]): PeriodTotals {
  let sessions = 0;
  let activeUsers = 0;
  let conversions = 0;
  let engaged = 0;
  for (const r of rows) {
    sessions += r.sessions;
    activeUsers += r.activeUsers;
    conversions += r.conversions;
    engaged += r.engagementRate * r.sessions;
  }
  return {
    sessions,
    activeUsers,
    conversions,
    engagementRate: sessions > 0 ? engaged / sessions : 0,
  };
}

/** Relative change (e.g. 0.12 = +12 %); null when the baseline is 0. */
export function deltaPct(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current - previous) / previous;
}

/** Absolute change in percentage points for a 0..1 rate (e.g. 1.3 = +1,3 pp). */
export function deltaPp(current: number, previous: number): number {
  return (current - previous) * 100;
}

/** Zero-fill missing days so series are continuous over [from, to]. */
export function fillDays(
  rows: DailyPoint[],
  from: string,
  to: string,
): DailyPoint[] {
  const byDate = new Map(rows.map((r) => [r.date, r]));
  return dateKeysBetween(from, to).map(
    (date) =>
      byDate.get(date) ?? {
        date,
        sessions: 0,
        activeUsers: 0,
        newUsers: 0,
        conversions: 0,
        engagementRate: 0,
      },
  );
}

// ── OpenReply Metrics ──────────────────────────────────────────────────────

export type OrDailyPoint = {
  date: string;
  dmsSent: number;
  linkClicks: number;
};

export type OrPeriodTotals = {
  dmsSent: number;
  linkClicks: number;
  ctr: number; // 0..1 (linkClicks / dmsSent)
};

export function summarizeOr(rows: OrDailyPoint[]): OrPeriodTotals {
  let dmsSent = 0;
  let linkClicks = 0;
  for (const r of rows) {
    dmsSent += r.dmsSent;
    linkClicks += r.linkClicks;
  }
  return {
    dmsSent,
    linkClicks,
    ctr: dmsSent > 0 ? linkClicks / dmsSent : 0,
  };
}

export function fillOrDays(
  rows: OrDailyPoint[],
  from: string,
  to: string,
): OrDailyPoint[] {
  const byDate = new Map(rows.map((r) => [r.date, r]));
  return dateKeysBetween(from, to).map(
    (date) =>
      byDate.get(date) ?? {
        date,
        dmsSent: 0,
        linkClicks: 0,
      },
  );
}
