import { internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { DataModel, Id, TableNames } from "./_generated/dataModel";
import type { NamedTableInfo, Query } from "convex/server";

/**
 * Erasure of everything this app pulled from YouTube (YA2).
 *
 * The YouTube Developer Policies do not treat disconnecting as "stop syncing":
 * data retrieved from the API has to GO when the authorization does. Deleting
 * the `connections` row alone leaves years of channel statistics, video
 * metadata, comment text and author names sitting in the database with nothing
 * left to authorize them — which is exactly the finding an audit is looking
 * for. So the disconnect schedules this, and this empties every yt* table.
 *
 * It runs in batches on purpose. A Convex mutation is a transaction with a
 * ceiling on how many documents it may touch, and `ytCommentLogs` grows by
 * hundreds of rows a week on an active channel — a single-pass delete would
 * work in testing and fail on the one workspace that actually needs it. Each
 * pass spends a fixed budget and reschedules itself while work remains, so the
 * purge always finishes regardless of how much there is.
 */

/** Documents deleted per pass. Well under the per-mutation ceiling. */
const BATCH = 200;

/**
 * Delete up to `limit` rows matched by an already-scoped query.
 * Returns how many went, so the caller can tell a full pass from a finished one.
 */
async function drain<T extends TableNames>(
  ctx: MutationCtx,
  query: Query<NamedTableInfo<DataModel, T>>,
  limit: number,
): Promise<number> {
  const rows = await query.take(limit);
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
  return rows.length;
}

type PurgeStep = (
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  limit: number,
) => Promise<number>;

/**
 * Every table that holds YouTube-derived data, each read through an index
 * whose first field is `workspaceId` so a purge never scans another workspace.
 *
 * This list is the compliance surface: a new yt* table added later MUST be
 * added here too, or disconnecting silently stops being a deletion.
 */
const PURGE_STEPS: PurgeStep[] = [
  // Analytics (Y2) — channel roll-ups, per-video stats, traffic sources.
  (ctx, ws, limit) =>
    drain(
      ctx,
      ctx.db
        .query("ytDailyTotals")
        .withIndex("by_workspace_date", (q) => q.eq("workspaceId", ws)),
      limit,
    ),
  (ctx, ws, limit) =>
    drain(
      ctx,
      ctx.db
        .query("ytVideoStats")
        .withIndex("by_workspace_video", (q) => q.eq("workspaceId", ws)),
      limit,
    ),
  (ctx, ws, limit) =>
    drain(
      ctx,
      ctx.db
        .query("ytTrafficSources")
        .withIndex("by_workspace_date", (q) => q.eq("workspaceId", ws)),
      limit,
    ),
  // Comment engine (Y4) — the automations, the log of every comment they
  // looked at (author names and comment text included), and the dedup table.
  (ctx, ws, limit) =>
    drain(
      ctx,
      ctx.db
        .query("ytAutomations")
        .withIndex("by_workspace_active", (q) => q.eq("workspaceId", ws)),
      limit,
    ),
  (ctx, ws, limit) =>
    drain(
      ctx,
      ctx.db
        .query("ytCommentLogs")
        .withIndex("by_workspace_created", (q) => q.eq("workspaceId", ws)),
      limit,
    ),
  (ctx, ws, limit) =>
    drain(
      ctx,
      ctx.db
        .query("ytProcessedComments")
        .withIndex("by_workspace_comment", (q) => q.eq("workspaceId", ws)),
      limit,
    ),
  // Quota accounting (Y4/Y6) and the media job log (Y6-Y10).
  (ctx, ws, limit) =>
    drain(
      ctx,
      ctx.db
        .query("ytQuotaUsage")
        .withIndex("by_workspace_date", (q) => q.eq("workspaceId", ws)),
      limit,
    ),
  (ctx, ws, limit) =>
    drain(
      ctx,
      ctx.db
        .query("ytMediaJobs")
        .withIndex("by_workspace_created", (q) => q.eq("workspaceId", ws)),
      limit,
    ),
  // Playlist cache (Y8) — a copy of channel data, so it goes with the rest.
  (ctx, ws, limit) =>
    drain(
      ctx,
      ctx.db
        .query("ytPlaylists")
        .withIndex("by_workspace_playlist", (q) => q.eq("workspaceId", ws)),
      limit,
    ),
];

/**
 * Delete one batch of this workspace's YouTube data, rescheduling while work
 * remains. Returns the number of rows THIS pass removed, not the grand total —
 * the passes are separate transactions and no single one of them knows the sum.
 */
export const purgeYouTubeData = internalMutation({
  args: { workspaceId: v.id("workspaces") },
  returns: v.number(),
  handler: async (ctx, { workspaceId }) => {
    let budget = BATCH;

    for (const step of PURGE_STEPS) {
      if (budget === 0) break;
      budget -= await step(ctx, workspaceId, budget);
    }

    const deleted = BATCH - budget;

    // Spending the whole budget means a table may still have rows. It may also
    // mean the last one emptied exactly on the boundary — then the next pass
    // deletes nothing and stops. One wasted mutation is the cheap side of the
    // trade against leaving data behind.
    if (budget === 0) {
      await ctx.scheduler.runAfter(0, internal.ytPurge.purgeYouTubeData, {
        workspaceId,
      });
    }

    return deleted;
  },
});
