/**
 * Pure YouTube Data API quota arithmetic. No Convex imports.
 *
 * The Data API meters every call in "units" against a per-project daily budget
 * — 10 000 by default, reset at midnight Pacific time. Reads are almost free
 * (a page of comments costs 1 unit) but writes are not: posting a public reply
 * or moderating a comment costs 50 each. Ten thousand units is therefore about
 * two hundred automatic replies a day and not one more, which is the whole
 * reason this module exists.
 */

/** Google's default per-project daily allowance for the Data API v3. */
export const QUOTA_DAILY_DEFAULT = 10_000;

/** Published unit costs of the calls the comment engine makes. */
export const QUOTA_COST = {
  /** commentThreads.list — one page of up to 100 comment threads. */
  commentThreadsList: 1,
  /** comments.insert — one public reply. */
  commentsInsert: 50,
  /** comments.setModerationStatus — hold / reject / publish one comment. */
  commentsSetModerationStatus: 50,
} as const;

/**
 * Units the comment engine may never touch.
 *
 * Y2's analytics sync spends the same daily budget, and the analytics are the
 * product: views, watch time, retention, traffic sources. If the comment
 * engine burns all 10 000 units answering people, tomorrow morning's sync
 * cannot run and the dashboard shows stale numbers until the quota resets.
 * Replies matter; the numbers matter more. So the engine works against the
 * budget minus this reserve, and stops there.
 */
export const QUOTA_RESERVE_FOR_SYNC = 2000;

/** The ceiling the comment engine actually works against (8 000 by default). */
export const QUOTA_SOFT_LIMIT = QUOTA_DAILY_DEFAULT - QUOTA_RESERVE_FOR_SYNC;

/** May we still spend `cost` units today without eating into the reserve? */
export function canAfford(used: number, cost: number): boolean {
  return used + cost <= QUOTA_SOFT_LIMIT;
}

/** Units left below the soft limit; never negative. */
export function remainingUnits(used: number): number {
  return Math.max(0, QUOTA_SOFT_LIMIT - used);
}

/** How many more public replies today's remaining budget pays for. */
export function estimatedRepliesLeft(used: number): number {
  return Math.max(
    0,
    Math.floor(remainingUnits(used) / QUOTA_COST.commentsInsert),
  );
}

/** What a log row says when the engine stopped rather than overspend. */
export const QUOTA_EXHAUSTED_MESSAGE =
  "Dnevna YouTube kvota je potrošena — odgovor nije poslat. Automatski odgovori se nastavljaju kada se kvota resetuje.";
