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
  /** The same day split by platform (F5); the two always sum to `dmsSent`. */
  dmsSentInstagram: number;
  dmsSentFacebook: number;
  linkClicks: number;
};

export type OrPeriodTotals = {
  dmsSent: number;
  dmsSentInstagram: number;
  dmsSentFacebook: number;
  linkClicks: number;
  ctr: number; // 0..1 (linkClicks / dmsSent)
};

export function summarizeOr(rows: OrDailyPoint[]): OrPeriodTotals {
  let dmsSent = 0;
  let dmsSentInstagram = 0;
  let dmsSentFacebook = 0;
  let linkClicks = 0;
  for (const r of rows) {
    dmsSent += r.dmsSent;
    dmsSentInstagram += r.dmsSentInstagram;
    dmsSentFacebook += r.dmsSentFacebook;
    linkClicks += r.linkClicks;
  }
  return {
    dmsSent,
    dmsSentInstagram,
    dmsSentFacebook,
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
        dmsSentInstagram: 0,
        dmsSentFacebook: 0,
        linkClicks: 0,
      },
  );
}

// ── Facebook Page Metrics (F5) ─────────────────────────────────────────────

export type FbDailyPoint = {
  date: string;
  impressions: number;
  engagements: number;
  /** Page likes, as a level rather than a flow — see `summarizeFb`. */
  fans: number;
};

export type FbPeriodTotals = {
  impressions: number;
  engagements: number;
  /** The LAST day's count, not a sum. Adding fans day by day counts nothing. */
  fans: number;
};

export function summarizeFb(rows: FbDailyPoint[]): FbPeriodTotals {
  let impressions = 0;
  let engagements = 0;
  let fans = 0;
  for (const r of rows) {
    impressions += r.impressions;
    engagements += r.engagements;
    // The newest non-zero reading wins. Rows arrive ascending, and a zero is
    // "Facebook did not report that day", not "the Page lost every fan".
    if (r.fans > 0) fans = r.fans;
  }
  return { impressions, engagements, fans };
}

export function fillFbDays(
  rows: FbDailyPoint[],
  from: string,
  to: string,
): FbDailyPoint[] {
  const byDate = new Map(rows.map((r) => [r.date, r]));
  // Fans carry forward across a gap for the same reason the summary skips a
  // zero: a missing day is a missing reading, and drawing it as a cliff down
  // to nothing would invent an event that did not happen.
  let lastFans = 0;
  return dateKeysBetween(from, to).map((date) => {
    const row = byDate.get(date);
    if (row !== undefined && row.fans > 0) lastFans = row.fans;
    return {
      date,
      impressions: row?.impressions ?? 0,
      engagements: row?.engagements ?? 0,
      fans: row?.fans && row.fans > 0 ? row.fans : lastFans,
    };
  });
}

// ── Instagram Metrics ──────────────────────────────────────────────────────

export type IgDailyPoint = {
  date: string;
  followersCount: number;
  reach: number;
  profileViews: number;
  accountsEngaged: number;
};

export type IgPeriodTotals = {
  followersCount: number;
  reach: number;
  profileViews: number;
  accountsEngaged: number;
};

export function summarizeIg(rows: IgDailyPoint[]): IgPeriodTotals {
  let reach = 0;
  let profileViews = 0;
  let accountsEngaged = 0;
  let followersCount = 0;

  if (rows.length > 0) {
    const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
    followersCount = sorted[sorted.length - 1].followersCount;
    for (const r of sorted) {
      reach += r.reach;
      profileViews += r.profileViews;
      accountsEngaged += r.accountsEngaged;
    }
  }

  return {
    followersCount,
    reach,
    profileViews,
    accountsEngaged,
  };
}

export function fillIgDays(
  rows: IgDailyPoint[],
  from: string,
  to: string,
): IgDailyPoint[] {
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const dates = dateKeysBetween(from, to);

  // Track last known follower count for continuous step chart/sparkline
  let lastKnownFollowers = 0;
  for (const r of rows) {
    if (r.followersCount > 0) {
      lastKnownFollowers = r.followersCount;
      break;
    }
  }

  return dates.map((date) => {
    const existing = byDate.get(date);
    if (existing) {
      if (existing.followersCount > 0) {
        lastKnownFollowers = existing.followersCount;
      }
      return existing;
    }
    return {
      date,
      followersCount: lastKnownFollowers,
      reach: 0,
      profileViews: 0,
      accountsEngaged: 0,
    };
  });
}


// ── YouTube Metrics ────────────────────────────────────────────────────────

/** One `ytDailyTotals` row as returned by `api.youtubeStore.dailyTotals`. */
export type YtDailyPoint = {
  date: string;
  views: number;
  estimatedMinutesWatched: number;
  averageViewDuration: number; // seconds
  averageViewPercentage: number; // 0..100 for that day
  subscribersGained: number;
  subscribersLost: number;
  likes: number;
  comments: number;
  shares: number;
};

export type YtPeriodTotals = {
  views: number;
  estimatedMinutesWatched: number;
  /** Gained minus lost over the period — can legitimately be negative. */
  netSubscribers: number;
  subscribersGained: number;
  subscribersLost: number;
  /** View-weighted average of the daily rates (0..1); 0 when no views. */
  averageViewPercentage: number;
  /** Likes + comments + shares. */
  engagements: number;
};

export function summarizeYt(rows: YtDailyPoint[]): YtPeriodTotals {
  let views = 0;
  let estimatedMinutesWatched = 0;
  let subscribersGained = 0;
  let subscribersLost = 0;
  let engagements = 0;
  let weightedPercentage = 0;

  for (const r of rows) {
    views += r.views;
    estimatedMinutesWatched += r.estimatedMinutesWatched;
    subscribersGained += r.subscribersGained;
    subscribersLost += r.subscribersLost;
    engagements += r.likes + r.comments + r.shares;
    // The API reports 0..100; weight by views so low-traffic days don't
    // distort the period average.
    weightedPercentage += r.averageViewPercentage * r.views;
  }

  return {
    views,
    estimatedMinutesWatched,
    netSubscribers: subscribersGained - subscribersLost,
    subscribersGained,
    subscribersLost,
    averageViewPercentage: views > 0 ? weightedPercentage / views / 100 : 0,
    engagements,
  };
}

export function fillYtDays(
  rows: YtDailyPoint[],
  from: string,
  to: string,
): YtDailyPoint[] {
  const byDate = new Map(rows.map((r) => [r.date, r]));
  return dateKeysBetween(from, to).map(
    (date) =>
      byDate.get(date) ?? {
        date,
        views: 0,
        estimatedMinutesWatched: 0,
        averageViewDuration: 0,
        averageViewPercentage: 0,
        subscribersGained: 0,
        subscribersLost: 0,
        likes: 0,
        comments: 0,
        shares: 0,
      },
  );
}
