import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

// Scheduled syncs (PLAN.md §2/§4). GA4 restates recent data, so 6h is plenty;
// each run re-fetches the last 3 days plus any gaps.
const crons = cronJobs();

crons.interval("sync ga4", { hours: 6 }, internal.ga4.syncAllGa4, {});

export default crons;
