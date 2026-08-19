import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireMembership } from "./lib/auth";

/**
 * OpenReply persistence & query layer (V8 runtime).
 *
 * All database writes are batched in atomic Convex mutations. Upsert semantics
 * ensure idempotency (natural key `[workspaceId, orCampaignId]` for campaign
 * stats and `[workspaceId, date]` for daily totals).
 */

const campaignRowValidator = v.object({
  orCampaignId: v.string(),
  name: v.string(),
  keyword: v.string(),
  active: v.boolean(),
  dmsSent: v.number(),
  dmsFailed: v.number(),
  linkClicks: v.number(),
  ctr: v.number(),
  syncedAt: v.number(),
});

const dailyTotalRowValidator = v.object({
  date: v.string(),
  dmsSent: v.number(),
  linkClicks: v.number(),
});

const dailyPointValidator = v.object({
  date: v.string(),
  dmsSent: v.number(),
  // The same day split by platform (F5). A row written before Facebook
  // existed has no split, and on that row every DM was an Instagram DM — so
  // the fallback below is a fact, not a guess.
  dmsSentInstagram: v.number(),
  dmsSentFacebook: v.number(),
  linkClicks: v.number(),
});

/**
 * Atomic snapshot upsert called from the "use node" sync action.
 * Writes both campaigns and daily totals in a single Convex transaction.
 */
export const upsertSnapshot = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    campaigns: v.array(campaignRowValidator),
    dailyTotals: v.array(dailyTotalRowValidator),
  },
  returns: v.number(),
  handler: async (ctx, { workspaceId, campaigns, dailyTotals }) => {
    // 1. Upsert campaigns
    for (const c of campaigns) {
      const existing = await ctx.db
        .query("orCampaignStats")
        .withIndex("by_workspace_campaign", (q) =>
          q.eq("workspaceId", workspaceId).eq("orCampaignId", c.orCampaignId),
        )
        .unique();

      if (existing !== null) {
        await ctx.db.patch(existing._id, {
          name: c.name,
          keyword: c.keyword,
          active: c.active,
          dmsSent: c.dmsSent,
          dmsFailed: c.dmsFailed,
          linkClicks: c.linkClicks,
          ctr: c.ctr,
          syncedAt: c.syncedAt,
        });
      } else {
        await ctx.db.insert("orCampaignStats", {
          workspaceId,
          ...c,
        });
      }
    }

    // 2. Upsert daily totals
    for (const d of dailyTotals) {
      const existing = await ctx.db
        .query("orDailyTotals")
        .withIndex("by_workspace_date", (q) =>
          q.eq("workspaceId", workspaceId).eq("date", d.date),
        )
        .unique();

      if (existing !== null) {
        await ctx.db.patch(existing._id, {
          dmsSent: d.dmsSent,
          linkClicks: d.linkClicks,
        });
      } else {
        await ctx.db.insert("orDailyTotals", {
          workspaceId,
          ...d,
        });
      }
    }

    return campaigns.length + dailyTotals.length;
  },
});

// ── Public Queries for /openreply ──────────────────────────────────────────

const campaignViewValidator = v.object({
  _id: v.id("orCampaignStats"),
  orCampaignId: v.string(),
  name: v.string(),
  keyword: v.string(),
  active: v.boolean(),
  dmsSent: v.number(),
  dmsFailed: v.number(),
  linkClicks: v.number(),
  ctr: v.number(),
  syncedAt: v.number(),
});

/** List all campaign stats for the caller's workspace. */
export const campaigns = query({
  args: {},
  returns: v.array(campaignViewValidator),
  handler: async (ctx) => {
    const { workspaceId } = await requireMembership(ctx);
    const rows = await ctx.db
      .query("orCampaignStats")
      .withIndex("by_workspace_campaign", (q) =>
        q.eq("workspaceId", workspaceId),
      )
      .collect();

    return rows.map((r) => ({
      _id: r._id,
      orCampaignId: r.orCampaignId,
      name: r.name,
      keyword: r.keyword,
      active: r.active,
      dmsSent: r.dmsSent,
      dmsFailed: r.dmsFailed,
      linkClicks: r.linkClicks,
      ctr: r.ctr,
      syncedAt: r.syncedAt,
    }));
  },
});

/** Daily totals in [from, to] ascending by date. */
export const daily = query({
  args: { from: v.string(), to: v.string() },
  returns: v.array(dailyPointValidator),
  handler: async (ctx, { from, to }) => {
    const { workspaceId } = await requireMembership(ctx);
    const rows = await ctx.db
      .query("orDailyTotals")
      .withIndex("by_workspace_date", (q) =>
        q.eq("workspaceId", workspaceId).gte("date", from).lte("date", to),
      )
      .collect();

    return rows.map((r) => ({
      date: r.date,
      dmsSent: r.dmsSent,
      dmsSentInstagram: r.dmsSentInstagram ?? r.dmsSent,
      dmsSentFacebook: r.dmsSentFacebook ?? 0,
      linkClicks: r.linkClicks,
    }));
  },
});
