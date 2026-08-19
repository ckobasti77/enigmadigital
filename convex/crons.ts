import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

// Scheduled syncs (PLAN.md §2/§4). GA4 restates recent data, so 6h is plenty;
// OpenReply is synced hourly for near-real-time DM/click metrics.
const crons = cronJobs();

crons.interval("sync ga4", { hours: 6 }, internal.ga4.syncAllGa4, {});
crons.interval(
  "sync instagram",
  { hours: 6 },
  internal.instagram.syncAllIg,
  {},
);
crons.interval(
  "refresh instagram tokens",
  { hours: 24 },
  internal.instagram.refreshAllTokens,
  {},
);
// The Facebook Page (F5). Same cadence as Instagram for the same two reasons:
// a Page restates its recent insights for a few days, and a Page token has to
// be re-minted from the stored user token before that user token ages out.
crons.interval(
  "sync facebook page",
  { hours: 6 },
  internal.facebook.syncAllFacebook,
  {},
);
crons.interval(
  "refresh facebook tokens",
  { hours: 24 },
  internal.facebook.refreshAllTokens,
  {},
);
// Publishing is scheduled to the minute, so the queue is checked every minute.
// The tick is cheap — one indexed read of what is due, and nothing at all when
// nothing is. It doubles as the recovery path: a post whose direct run never
// happened is still `queued` and still due, so the next tick picks it up.
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
crons.interval(
  "instagram head check",
  { minutes: 2 },
  internal.metaSync.igHeadCheck,
  {},
);
crons.interval(
  "facebook head check",
  { minutes: 2 },
  internal.metaSync.fbHeadCheck,
  {},
);
// Level 3, hourly: the account snapshot and the posts published in the last two
// weeks. Meta does not compute insights in real time, so an hour is not a
// compromise here — it is roughly the resolution the numbers actually have.
crons.interval(
  "meta hourly refresh",
  { hours: 1 },
  internal.metaSync.hourlyRefresh,
  {},
);
// Level 3, daily: which posts has Instagram stopped having? Moved off the
// six-hourly sync in F6 — it costs up to twenty-five probes and answers a
// question whose answer changes about once a month.
crons.interval(
  "instagram deletion check",
  { hours: 24 },
  internal.metaSync.igDeletionCheck,
  {},
);

crons.interval(
  "sync meta ads structure",
  { hours: 3 },
  internal.metaAds.syncAllAdsStructure,
  {},
);
crons.interval(
  "sync meta ads hot insights",
  { minutes: 15 },
  internal.metaAds.syncHotAdsInsights,
  {},
);
crons.interval(
  "sync meta ads all insights",
  { hours: 6 },
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
crons.interval(
  "evaluate ad rules",
  { minutes: 30 },
  internal.rules.evaluateRulesCron,
  {},
);

export default crons;
