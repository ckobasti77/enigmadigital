import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

// Scheduled syncs (PLAN.md §2/§4). GA4 restates recent data, so 6h is plenty;
// OpenReply is synced hourly for near-real-time DM/click metrics.
const crons = cronJobs();

crons.interval("sync ga4", { hours: 6 }, internal.ga4.syncAllGa4, {});
crons.interval(
  "sync openreply",
  { hours: 1 },
  internal.openreply.syncAllOpenReply,
  {},
);

export default crons;
