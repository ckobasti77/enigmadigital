import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

/**
 * GA4 persistence layer (V8 runtime). The "use node" `syncGa4` action fetches
 * from the Data API and hands rows to these upserts; keeping the DB writes in a
 * plain (non-node) module means each upsert runs in a real Convex transaction.
 *
 * Upsert semantics (PLAN.md §3): natural key is [workspaceId, date] for daily
 * totals and [workspaceId, date, source, medium, campaign] for the traffic
 * breakdown. Every run re-fetches the last 3 days (GA4 restates recent data),
 * so an existing row is patched in place rather than duplicated.
 */

const dailyRowValidator = v.object({
  date: v.string(),
  sessions: v.number(),
  activeUsers: v.number(),
  newUsers: v.number(),
  conversions: v.number(),
  engagementRate: v.number(),
});

const trafficRowValidator = v.object({
  date: v.string(),
  sessionSource: v.string(),
  sessionMedium: v.string(),
  sessionCampaign: v.string(),
  sessions: v.number(),
  conversions: v.number(),
});

/**
 * Dates already present in `ga4Daily` for this workspace on/after `since`.
 * The action diffs this set against the target window to decide which days
 * still need a first-time fetch (backfill / gap fill).
 */
export const dailyDates = internalQuery({
  args: { workspaceId: v.id("workspaces"), since: v.string() },
  returns: v.array(v.string()),
  handler: async (ctx, { workspaceId, since }) => {
    const rows = await ctx.db
      .query("ga4Daily")
      .withIndex("by_workspace_date", (q) =>
        q.eq("workspaceId", workspaceId).gte("date", since),
      )
      .collect();
    return rows.map((r) => r.date);
  },
});

/** Upsert daily totals by [workspaceId, date]. Returns rows written. */
export const upsertDaily = internalMutation({
  args: { workspaceId: v.id("workspaces"), rows: v.array(dailyRowValidator) },
  returns: v.number(),
  handler: async (ctx, { workspaceId, rows }) => {
    for (const row of rows) {
      const existing = await ctx.db
        .query("ga4Daily")
        .withIndex("by_workspace_date", (q) =>
          q.eq("workspaceId", workspaceId).eq("date", row.date),
        )
        .unique();
      if (existing !== null) {
        await ctx.db.patch(existing._id, row);
      } else {
        await ctx.db.insert("ga4Daily", { workspaceId, ...row });
      }
    }
    return rows.length;
  },
});

/**
 * Upsert traffic breakdown by the full dimension tuple. Called in chunks from
 * the action so a large backfill stays inside per-transaction write limits.
 */
export const upsertTraffic = internalMutation({
  args: { workspaceId: v.id("workspaces"), rows: v.array(trafficRowValidator) },
  returns: v.number(),
  handler: async (ctx, { workspaceId, rows }) => {
    for (const row of rows) {
      const existing = await ctx.db
        .query("ga4TrafficDaily")
        .withIndex("by_workspace_date_dims", (q) =>
          q
            .eq("workspaceId", workspaceId)
            .eq("date", row.date)
            .eq("sessionSource", row.sessionSource)
            .eq("sessionMedium", row.sessionMedium)
            .eq("sessionCampaign", row.sessionCampaign),
        )
        .unique();
      if (existing !== null) {
        await ctx.db.patch(existing._id, {
          sessions: row.sessions,
          conversions: row.conversions,
        });
      } else {
        await ctx.db.insert("ga4TrafficDaily", { workspaceId, ...row });
      }
    }
    return rows.length;
  },
});
