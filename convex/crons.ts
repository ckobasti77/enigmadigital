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
crons.interval(
  "evaluate ad rules",
  { minutes: 30 },
  internal.rules.evaluateRulesCron,
  {},
);

export default crons;
