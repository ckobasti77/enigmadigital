import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

// Scheduled syncs (PLAN.md §2/§4). GA4 restates recent data, so 6h is plenty;
// OpenReply is synced hourly for near-real-time DM/click metrics.
const crons = cronJobs();

/**
 * ============================================================================
 * WHY THE META JOBS ARE ON `cron` AND NOT `interval` (P2)
 * ============================================================================
 *
 * `crons.interval` counts from the moment of DEPLOY, and every cadence in this
 * file — 1 min, 2 min, 15 min, 30 min, 1 h, 3 h, 6 h, 24 h — divides evenly
 * into every longer one. So they do not merely overlap occasionally: they land
 * on the SAME INSTANT, forever, by construction. Every six hours all eight Meta
 * jobs fired together — around a hundred and seventy Graph calls in one breath.
 *
 * That single minute pushed the usage percentage past the warning threshold,
 * and the gate then stood the schedulers down for the following hour. The
 * dashboard went stale precisely BECAUSE the previous minute had pulled too
 * hard. Spreading them costs nothing and removes the spike entirely.
 *
 * So each EXPENSIVE Meta job gets its own minute (and, above hourly, its own
 * hour slot): no two of the full passes, the token refreshes, the deletion
 * check or the three ad jobs ever land together. The numbers are arbitrary but
 * FIXED. Cron minutes are UTC; nothing here is tied to a wall-clock hour that a
 * person cares about, so that is fine.
 *
 * The two head checks are the deliberate exception, and they cannot be
 * separated from anything: between them they run on EVERY minute of the hour,
 * so whatever else fires shares its minute with one of them. That is fine and
 * is not what the spike was — a head check is a single call for five ids, so
 * the worst overlap in this file is now one heavy job plus one call, instead of
 * eight heavy jobs at once.
 *
 * The non-Meta jobs (GA4, Google Ads, YouTube, the publish queue, the file
 * sweep) are left on `interval`: they spend a different quota, and lining them
 * up with the Meta ones would only add coupling that does not exist today.
 * ============================================================================
 */

/**
 * "every N minutes, starting at minute `offset`" as a cron string.
 *
 * Written out as a comma list rather than the `*​/N` step form: the list is what
 * Convex's own documentation uses, and this is not the place to find out the
 * hard way that a step is parsed differently by the backend.
 */
function everyNMinutes(step: number, offset: number): string {
  const minutes: number[] = [];
  for (let minute = offset; minute < 60; minute += step) minutes.push(minute);
  return `${minutes.join(",")} * * * *`;
}

crons.interval("sync ga4", { hours: 6 }, internal.ga4.syncAllGa4, {});
// Level 3, six-hourly: the full Instagram pass, the most expensive in the app.
crons.cron(
  "sync instagram",
  "5 0,6,12,18 * * *",
  internal.instagram.syncAllIg,
  {},
);
crons.cron(
  "refresh instagram tokens",
  "10 3 * * *",
  internal.instagram.refreshAllTokens,
  {},
);
// Daily cron (G1): sync all 12 Instagram day metrics & breakdowns (05:45 UTC).
// Non-conflicting minute and hour slot separated from other Meta jobs.
crons.cron(
  "sync daily instagram metrics",
  "45 5 * * *",
  internal.instagram.syncAllIgMetrics,
  {},
);
// Daily cron (G2): sync Instagram audience demographics (04:55 UTC).
// Non-conflicting minute and hour slot separated from other Meta jobs.
crons.cron(
  "sync instagram demographics",
  "55 4 * * *",
  internal.instagram.syncAllIgDemographics,
  {},
);
// 30-minute cron (G4): poll active Instagram stories and their navigation funnels.
// Offset at minutes :13 and :43 to avoid collision with :20 (hourly refresh),
// :05 (6h sync), :35 (FB sync), :10/:40 (token refresh), :45/:55 (daily metrics/demographics).
crons.cron(
  "poll instagram stories",
  everyNMinutes(30, 13),
  internal.instagram.pollAllIgStories,
  {},
);
// The Facebook Page (F5). Same cadence as Instagram for the same two reasons:
// a Page restates its recent insights for a few days, and a Page token has to
// be re-minted from the stored user token before that user token ages out.
// Offset by an hour from Instagram's so the two never spend together.
crons.cron(
  "sync facebook page",
  "35 1,7,13,19 * * *",
  internal.facebook.syncAllFacebook,
  {},
);
crons.cron(
  "refresh facebook tokens",
  "40 3 * * *",
  internal.facebook.refreshAllTokens,
  {},
);
crons.cron(
  "refresh threads tokens",
  "25 3 * * *",
  internal.threads.refreshAllThreadsTokens,
  {},
);
// Publishing is scheduled to the minute, so the queue is checked every minute.
// The tick is cheap — one indexed read of what is due, and nothing at all when
// nothing is. It doubles as the recovery path: a post whose direct run never
// happened is still `queued` and still due, so the next tick picks it up.
//
// Stays on `interval`: it reads our own table, and the Meta calls it can lead
// to are demand-driven — they happen when an operator scheduled a post, not
// because a clock came round.
crons.interval(
  "publish scheduled instagram posts",
  { minutes: 1 },
  internal.instagramPublishStore.enqueueDueJobs,
  {},
);
// A published post deletes its own files immediately; this takes back the disk
// from everything else. 24 h is also exactly how long an Instagram container
// lives, so nothing that could still be published loses its bytes.
crons.interval(
  "sweep instagram upload files",
  { hours: 1 },
  internal.instagramPublishStore.sweepExpiredUploads,
  {},
);
// ── Meta: the three-level schedule (F6) ─────────────────────────────────────
//
// Level 1 is not here — it is triggered by the webhook, in `http.ts`.
//
// Level 2 is the cheapest poll that can exist: five ids, no numbers, one call.
// It exists because Meta has NO webhook for publishing. A new post can only be
// noticed by asking, and asking cheaply every two minutes costs less in a day
// than a single full sync does.
//
// Instagram takes the even minutes and Facebook the odd ones, so the two never
// ask at the same second.
crons.cron(
  "instagram head check",
  everyNMinutes(2, 0),
  internal.metaSync.igHeadCheck,
  {},
);
crons.cron(
  "facebook head check",
  everyNMinutes(2, 1),
  internal.metaSync.fbHeadCheck,
  {},
);
// Level 3, hourly: the account snapshot and the posts published in the last two
// weeks. Meta does not compute insights in real time, so an hour is not a
// compromise here — it is roughly the resolution the numbers actually have.
crons.cron("meta hourly refresh", "20 * * * *", internal.metaSync.hourlyRefresh, {});
// Level 3, daily: which posts has Instagram stopped having? Moved off the
// six-hourly sync in F6 — it costs up to twenty-five probes and answers a
// question whose answer changes about once a month.
crons.cron(
  "instagram deletion check",
  "15 4 * * *",
  internal.metaSync.igDeletionCheck,
  {},
);

crons.cron(
  "sync meta ads structure",
  "25 1,4,7,10,13,16,19,22 * * *",
  internal.metaAds.syncAllAdsStructure,
  {},
);
crons.cron(
  "sync meta ads hot insights",
  everyNMinutes(15, 7),
  internal.metaAds.syncHotAdsInsights,
  {},
);
crons.cron(
  "sync meta ads all insights",
  "50 2,8,14,20 * * *",
  internal.metaAds.syncAllAdsInsights,
  {},
);
crons.interval(
  "sync google ads",
  { hours: 3 },
  internal.googleAds.syncAllGoogleAds,
  {},
);
// YouTube restates recent analytics for a few days, so match GA4's cadence.
crons.interval("sync youtube", { hours: 6 }, internal.youtube.syncAllYouTube, {});
// YouTube has no webhook for comments — push notifications only fire for a new
// video — so the comment engine has to ask. A page of comments costs 1 quota
// unit, which at this cadence is ~100 units a day against a 10 000 budget.
crons.interval(
  "poll youtube comments",
  { minutes: 15 },
  internal.ytPoll.pollAllYouTubeComments,
  {},
);
// The only thing that makes an erasure something to rely on (P3).
//
// A purge is a chain of self-scheduling mutations, and a chain dies whenever
// one link does — an OCC conflict with the comment poller is enough, and the
// rollback takes the scheduled continuation with it. This is what notices: a
// `purgeRuns` row still claiming to be running whose `updatedAt` stopped moving
// gets a fresh fence token and a new first pass, from the step it had already
// committed. Ten minutes is well past any single pass and far short of anyone
// noticing their data is still there.
//
// On `interval` with the rest of the non-Meta jobs: it spends no provider quota
// at all, and on a deployment with nothing to purge it is one indexed read.
crons.interval(
  "resume stalled purges",
  { minutes: 10 },
  internal.purge.resumeStalled,
  {},
);
// A firing rule PAUSES an ad through the Graph API, so this is a Meta job and
// gets its own minutes like the rest of them.
crons.cron(
  "evaluate ad rules",
  everyNMinutes(30, 11),
  internal.rules.evaluateRulesCron,
  {},
);

export default crons;
