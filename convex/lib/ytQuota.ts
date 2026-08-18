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

/** Published unit costs of the calls this module's callers make. */
export const QUOTA_COST = {
  /** commentThreads.list — one page of up to 100 comment threads. */
  commentThreadsList: 1,
  /** comments.insert — one public reply. */
  commentsInsert: 50,
  /** comments.setModerationStatus — hold / reject / publish one comment. */
  commentsSetModerationStatus: 50,
  /** comments.delete — remove one comment for good. */
  commentsDelete: 50,
  /** videos.list — metadata for up to 50 ids in one call. */
  videosList: 1,
  /** videos.update — title, description, tags, category, privacy. */
  videosUpdate: 50,
  /** videos.delete — take the video off the channel. */
  videosDelete: 50,
  /** thumbnails.set — one custom thumbnail. */
  thumbnailsSet: 50,
  /** captions.list — the caption tracks on one video. */
  captionsList: 50,
  /** captions.insert — one new caption track. The single most expensive
   * call this app makes: eight of them are a whole media day. */
  captionsInsert: 400,
  /** captions.update — replace an existing track's file or name. */
  captionsUpdate: 450,
  /** captions.delete — remove one caption track. */
  captionsDelete: 50,
  /** playlists.list — the channel's own playlists. */
  playlistsList: 1,
  /** playlistItems.insert — put one video into one playlist. */
  playlistItemsInsert: 50,
} as const;

/**
 * How many videos may be uploaded in a day.
 *
 * `videos.insert` is metered separately by Google and does NOT come out of the
 * 10 000-unit daily budget, so it gets its own counter (`ytQuotaUsage.
 * uploadsUsed`) rather than a place in `QUOTA_COST`. The cap here is ours, not
 * Google's: a runaway retry loop that re-uploads the same file is the failure
 * mode worth stopping, and no one publishes a hundred videos in a day by hand.
 */
export const VIDEO_UPLOAD_DAILY_LIMIT = 100;

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

// ── media operations: a second, lower ceiling (Y6) ───────────────────────────

/**
 * Why there are two classes of spending.
 *
 * Captions cost 400 units apiece. Ten caption tracks is 4 000 units — half the
 * daily budget — and an afternoon spent on subtitles would otherwise leave the
 * comment engine without a single unit, so people who wrote under the videos
 * get no answer at all. One person's editing session must not silence the
 * channel.
 *
 * So media operations (upload metadata, thumbnails, captions, playlists,
 * deleting comments by hand) work against their own lower ceiling and stop
 * there, while the comment engine keeps the full `QUOTA_SOFT_LIMIT`. The
 * reserve below is the part media may never touch.
 */
export const QUOTA_COMMENTS_MIN_RESERVE = 2000;

/** The ceiling media operations work against (6 000 by default). */
export const QUOTA_MEDIA_LIMIT = QUOTA_SOFT_LIMIT - QUOTA_COMMENTS_MIN_RESERVE;

/**
 * May a media operation still spend `cost` units today?
 *
 * Note this reads the SAME `used` counter as `canAfford` — one budget, two
 * ceilings. Media stops 2 000 units earlier; replies do not.
 */
export function canAffordMedia(used: number, cost: number): boolean {
  return used + cost <= QUOTA_MEDIA_LIMIT;
}

/** Units left below the media ceiling; never negative. */
export function remainingMediaUnits(used: number): number {
  return Math.max(0, QUOTA_MEDIA_LIMIT - used);
}

/** What a media job row says when it was refused rather than overspend. */
export const QUOTA_MEDIA_EXHAUSTED_MESSAGE =
  "Dnevna kvota za izmene je potrošena. Odgovori na komentare i dalje rade. Pokušaj ponovo sutra.";
