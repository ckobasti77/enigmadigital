import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { providerValidator } from "./lib/providers";
import { requireMembership } from "./lib/auth";

/**
 * ============================================================================
 * META ADS PERSISTENCE & QUERY LAYER (V8 Runtime)
 * ============================================================================
 *
 * All database writes are batched in atomic Convex mutations.
 * Upsert semantics ensure idempotency:
 *   - `adAccounts` upserted by natural key `[workspaceId, externalId]`
 *   - `adCampaigns` upserted by natural key `[workspaceId, externalId]`
 *   - `adSets` upserted by natural key `[workspaceId, externalId]`
 *   - `ads` upserted by natural key `[workspaceId, externalId]`
 *   - `adInsights` upserted by composite key `[adId, date, breakdownHash, hour]`
 *
 * hookRate and holdRate are computed at write time.
 * ============================================================================
 */

export const breakdownValidator = v.object({
  age: v.optional(v.string()),
  gender: v.optional(v.string()),
  placement: v.optional(v.string()),
  platform: v.optional(v.string()),
  device: v.optional(v.string()),
});

export const campaignInputValidator = v.object({
  externalId: v.string(),
  name: v.string(),
  objective: v.optional(v.string()),
  status: v.string(),
  dailyBudget: v.optional(v.number()),
  lifetimeBudget: v.optional(v.number()),
  syncPriority: v.union(v.literal("hot"), v.literal("cold")),
});

export const adSetInputValidator = v.object({
  externalId: v.string(),
  campaignExternalId: v.string(),
  name: v.string(),
  status: v.string(),
  targetingSummary: v.optional(v.string()),
  dailyBudget: v.optional(v.number()),
  lifetimeBudget: v.optional(v.number()),
});

export const adInputValidator = v.object({
  externalId: v.string(),
  adSetExternalId: v.string(),
  name: v.string(),
  status: v.string(),
  creativeId: v.optional(v.string()),
  hookLabel: v.optional(v.string()),
  thumbnailUrl: v.optional(v.string()),
  previewUrl: v.optional(v.string()),
});

export const insightRowInputValidator = v.object({
  adId: v.id("ads"),
  date: v.string(),
  hour: v.optional(v.number()),
  breakdownHash: v.string(),
  breakdown: v.optional(breakdownValidator),
  spend: v.number(),
  impressions: v.number(),
  reach: v.number(),
  frequency: v.number(),
  clicks: v.number(),
  ctr: v.number(),
  uniqueCtr: v.optional(v.number()),
  cpc: v.number(),
  cpm: v.number(),
  cpp: v.optional(v.number()),
  video3s: v.number(),
  thruplay: v.number(),
  videoP25: v.number(),
  videoP50: v.number(),
  videoP75: v.number(),
  videoP95: v.optional(v.number()),
  videoP100: v.number(),
  outboundCtr: v.optional(v.number()),
  results: v.number(),
  costPerResult: v.number(),
  conversionValue: v.number(),
  roas: v.number(),
  qualityRanking: v.optional(v.string()),
  engagementRanking: v.optional(v.string()),
  conversionRanking: v.optional(v.string()),
});

// ── Internal Mutations ───────────────────────────────────────────────────────

/**
 * Upsert or retrieve an adAccount for the given workspace.
 */
export const upsertAdAccount = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    provider: providerValidator,
    externalId: v.string(),
    name: v.string(),
    currency: v.string(),
  },
  returns: v.id("adAccounts"),
  handler: async (ctx, { workspaceId, provider, externalId, name, currency }) => {
    const existing = await ctx.db
      .query("adAccounts")
      .withIndex("by_workspace_external", (q) =>
        q.eq("workspaceId", workspaceId).eq("externalId", externalId),
      )
      .unique();

    const now = Date.now();
    if (existing !== null) {
      await ctx.db.patch(existing._id, {
        name,
        currency,
        provider,
        syncedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("adAccounts", {
      workspaceId,
      provider,
      externalId,
      name,
      currency,
      syncedAt: now,
    });
  },
});

/**
 * Atomically upsert structure: campaigns, adSets, and ads.
 */
export const upsertStructure = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    accountId: v.id("adAccounts"),
    campaigns: v.array(campaignInputValidator),
    adSets: v.array(adSetInputValidator),
    ads: v.array(adInputValidator),
  },
  returns: v.number(),
  handler: async (ctx, { workspaceId, accountId, campaigns, adSets, ads }) => {
    const now = Date.now();
    let written = 0;

    // 1. Upsert Campaigns
    const campaignIdMap = new Map<string, Id<"adCampaigns">>();
    for (const c of campaigns) {
      const existing = await ctx.db
        .query("adCampaigns")
        .withIndex("by_workspace_external", (q) =>
          q.eq("workspaceId", workspaceId).eq("externalId", c.externalId),
        )
        .unique();

      if (existing !== null) {
        await ctx.db.patch(existing._id, {
          accountId,
          name: c.name,
          objective: c.objective,
          status: c.status,
          dailyBudget: c.dailyBudget,
          lifetimeBudget: c.lifetimeBudget,
          syncPriority: c.syncPriority,
          syncedAt: now,
        });
        campaignIdMap.set(c.externalId, existing._id);
      } else {
        const id = await ctx.db.insert("adCampaigns", {
          workspaceId,
          accountId,
          externalId: c.externalId,
          name: c.name,
          objective: c.objective,
          status: c.status,
          dailyBudget: c.dailyBudget,
          lifetimeBudget: c.lifetimeBudget,
          syncPriority: c.syncPriority,
          syncedAt: now,
        });
        campaignIdMap.set(c.externalId, id);
      }
      written++;
    }

    // 2. Upsert AdSets
    const adSetIdMap = new Map<string, Id<"adSets">>();
    for (const s of adSets) {
      // Find parent campaign ID
      let campaignId = campaignIdMap.get(s.campaignExternalId);
      if (!campaignId) {
        const camp = await ctx.db
          .query("adCampaigns")
          .withIndex("by_workspace_external", (q) =>
            q.eq("workspaceId", workspaceId).eq("externalId", s.campaignExternalId),
          )
          .unique();
        if (camp) {
          campaignId = camp._id;
          campaignIdMap.set(s.campaignExternalId, campaignId);
        }
      }

      if (!campaignId) continue;

      const existing = await ctx.db
        .query("adSets")
        .withIndex("by_workspace_external", (q) =>
          q.eq("workspaceId", workspaceId).eq("externalId", s.externalId),
        )
        .unique();

      if (existing !== null) {
        await ctx.db.patch(existing._id, {
          campaignId,
          name: s.name,
          status: s.status,
          targetingSummary: s.targetingSummary,
          dailyBudget: s.dailyBudget,
          lifetimeBudget: s.lifetimeBudget,
          syncedAt: now,
        });
        adSetIdMap.set(s.externalId, existing._id);
      } else {
        const id = await ctx.db.insert("adSets", {
          workspaceId,
          campaignId,
          externalId: s.externalId,
          name: s.name,
          status: s.status,
          targetingSummary: s.targetingSummary,
          dailyBudget: s.dailyBudget,
          lifetimeBudget: s.lifetimeBudget,
          syncedAt: now,
        });
        adSetIdMap.set(s.externalId, id);
      }
      written++;
    }

    // 3. Upsert Ads
    for (const a of ads) {
      let adSetId = adSetIdMap.get(a.adSetExternalId);
      if (!adSetId) {
        const setDoc = await ctx.db
          .query("adSets")
          .withIndex("by_workspace_external", (q) =>
            q.eq("workspaceId", workspaceId).eq("externalId", a.adSetExternalId),
          )
          .unique();
        if (setDoc) {
          adSetId = setDoc._id;
          adSetIdMap.set(a.adSetExternalId, adSetId);
        }
      }

      if (!adSetId) continue;

      const existing = await ctx.db
        .query("ads")
        .withIndex("by_workspace_external", (q) =>
          q.eq("workspaceId", workspaceId).eq("externalId", a.externalId),
        )
        .unique();

      if (existing !== null) {
        await ctx.db.patch(existing._id, {
          adSetId,
          name: a.name,
          status: a.status,
          creativeId: a.creativeId,
          thumbnailUrl: a.thumbnailUrl,
          previewUrl: a.previewUrl,
          syncedAt: now,
        });
      } else {
        await ctx.db.insert("ads", {
          workspaceId,
          adSetId,
          externalId: a.externalId,
          name: a.name,
          status: a.status,
          creativeId: a.creativeId,
          hookLabel: a.hookLabel,
          thumbnailUrl: a.thumbnailUrl,
          previewUrl: a.previewUrl,
          syncedAt: now,
        });
      }
      written++;
    }

    return written;
  },
});

/**
 * Update campaign sync priorities ("hot" vs "cold") based on recent spend.
 */
export const updateCampaignPriorities = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    priorities: v.array(
      v.object({
        externalId: v.string(),
        syncPriority: v.union(v.literal("hot"), v.literal("cold")),
      }),
    ),
  },
  handler: async (ctx, { workspaceId, priorities }) => {
    for (const item of priorities) {
      const camp = await ctx.db
        .query("adCampaigns")
        .withIndex("by_workspace_external", (q) =>
          q.eq("workspaceId", workspaceId).eq("externalId", item.externalId),
        )
        .unique();

      if (camp !== null && camp.syncPriority !== item.syncPriority) {
        await ctx.db.patch(camp._id, {
          syncPriority: item.syncPriority,
        });
      }
    }
  },
});

/**
 * Batch upsert ad insights rows with computed hookRate, holdRate, and ROAS.
 */
export const upsertInsightsBatch = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    rows: v.array(insightRowInputValidator),
  },
  returns: v.number(),
  handler: async (ctx, { workspaceId, rows }) => {
    const now = Date.now();
    let written = 0;

    for (const row of rows) {
      // Compute hookRate: video3s / impressions
      const hookRate =
        row.impressions > 0
          ? Number((row.video3s / row.impressions).toFixed(6))
          : 0;

      // Compute holdRate: thruplay / video3s
      const holdRate =
        row.video3s > 0
          ? Number((row.thruplay / row.video3s).toFixed(6))
          : 0;

      // Compute roas: conversionValue / spend
      const roas =
        row.spend > 0
          ? Number((row.conversionValue / row.spend).toFixed(4))
          : 0;

      // Natural key: adId + date + breakdownHash (+ hour if hourly)
      const existingCandidates = await ctx.db
        .query("adInsights")
        .withIndex("by_ad_date_hash", (q) =>
          q
            .eq("adId", row.adId)
            .eq("date", row.date)
            .eq("breakdownHash", row.breakdownHash),
        )
        .collect();
      const existing =
        existingCandidates.find((c) => c.hour === row.hour) ?? null;

      if (existing !== null) {
        await ctx.db.patch(existing._id, {
          breakdown: row.breakdown,
          spend: row.spend,
          impressions: row.impressions,
          reach: row.reach,
          frequency: row.frequency,
          clicks: row.clicks,
          ctr: row.ctr,
          uniqueCtr: row.uniqueCtr,
          cpc: row.cpc,
          cpm: row.cpm,
          cpp: row.cpp,
          video3s: row.video3s,
          thruplay: row.thruplay,
          videoP25: row.videoP25,
          videoP50: row.videoP50,
          videoP75: row.videoP75,
          videoP95: row.videoP95,
          videoP100: row.videoP100,
          hookRate,
          holdRate,
          outboundCtr: row.outboundCtr,
          results: row.results,
          costPerResult: row.costPerResult,
          conversionValue: row.conversionValue,
          roas,
          qualityRanking: row.qualityRanking,
          engagementRanking: row.engagementRanking,
          conversionRanking: row.conversionRanking,
          syncedAt: now,
        });
      } else {
        await ctx.db.insert("adInsights", {
          workspaceId,
          adId: row.adId,
          date: row.date,
          hour: row.hour,
          breakdownHash: row.breakdownHash,
          breakdown: row.breakdown,
          spend: row.spend,
          impressions: row.impressions,
          reach: row.reach,
          frequency: row.frequency,
          clicks: row.clicks,
          ctr: row.ctr,
          uniqueCtr: row.uniqueCtr,
          cpc: row.cpc,
          cpm: row.cpm,
          cpp: row.cpp,
          video3s: row.video3s,
          thruplay: row.thruplay,
          videoP25: row.videoP25,
          videoP50: row.videoP50,
          videoP75: row.videoP75,
          videoP95: row.videoP95,
          videoP100: row.videoP100,
          hookRate,
          holdRate,
          outboundCtr: row.outboundCtr,
          results: row.results,
          costPerResult: row.costPerResult,
          conversionValue: row.conversionValue,
          roas,
          qualityRanking: row.qualityRanking,
          engagementRanking: row.engagementRanking,
          conversionRanking: row.conversionRanking,
          syncedAt: now,
        });
      }
      written++;
    }

    return written;
  },
});

// ── Internal Queries (for sync actions) ──────────────────────────────────────

/**
 * Get map of external ad IDs to Convex ad IDs for the workspace.
 */
export const getAdIdMap = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    const rows = await ctx.db
      .query("ads")
      .withIndex("by_workspace_external", (q) => q.eq("workspaceId", workspaceId))
      .collect();

    const map: Record<string, string> = {};
    for (const r of rows) {
      map[r.externalId] = r._id;
    }
    return map;
  },
});

/**
 * Get campaign IDs by sync priority.
 */
export const getCampaignsByPriority = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    priority: v.union(v.literal("hot"), v.literal("cold")),
  },
  handler: async (ctx, { workspaceId, priority }) => {
    const rows = await ctx.db
      .query("adCampaigns")
      .withIndex("by_workspace_priority", (q) =>
        q.eq("workspaceId", workspaceId).eq("syncPriority", priority),
      )
      .collect();

    return rows.map((r) => ({
      _id: r._id,
      externalId: r.externalId,
      name: r.name,
      status: r.status,
      syncPriority: r.syncPriority,
    }));
  },
});

/**
 * Get ad accounts for the workspace.
 */
export const getAccounts = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    provider: v.optional(providerValidator),
  },
  handler: async (ctx, { workspaceId, provider }) => {
    if (provider) {
      return await ctx.db
        .query("adAccounts")
        .withIndex("by_workspace_provider", (q) =>
          q.eq("workspaceId", workspaceId).eq("provider", provider),
        )
        .collect();
    }
    return await ctx.db
      .query("adAccounts")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();
  },
});

// ── Public Queries (for Dashboards & Hook Battle) ────────────────────────────

export const listAccounts = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireMembership(ctx);
    return await ctx.db
      .query("adAccounts")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();
  },
});

export const listCampaigns = query({
  args: {
    accountId: v.optional(v.id("adAccounts")),
    syncPriority: v.optional(v.union(v.literal("hot"), v.literal("cold"))),
  },
  handler: async (ctx, { accountId, syncPriority }) => {
    const { workspaceId } = await requireMembership(ctx);
    if (accountId) {
      return await ctx.db
        .query("adCampaigns")
        .withIndex("by_workspace_account", (q) =>
          q.eq("workspaceId", workspaceId).eq("accountId", accountId),
        )
        .collect();
    }
    if (syncPriority) {
      return await ctx.db
        .query("adCampaigns")
        .withIndex("by_workspace_priority", (q) =>
          q.eq("workspaceId", workspaceId).eq("syncPriority", syncPriority),
        )
        .collect();
    }
    return await ctx.db
      .query("adCampaigns")
      .withIndex("by_workspace_priority", (q) =>
        q.eq("workspaceId", workspaceId),
      )
      .collect();
  },
});

export const listAdSets = query({
  args: {
    campaignId: v.id("adCampaigns"),
  },
  handler: async (ctx, { campaignId }) => {
    const { workspaceId } = await requireMembership(ctx);
    return await ctx.db
      .query("adSets")
      .withIndex("by_workspace_campaign", (q) =>
        q.eq("workspaceId", workspaceId).eq("campaignId", campaignId),
      )
      .collect();
  },
});

export const listAds = query({
  args: {
    adSetId: v.id("adSets"),
  },
  handler: async (ctx, { adSetId }) => {
    const { workspaceId } = await requireMembership(ctx);
    return await ctx.db
      .query("ads")
      .withIndex("by_workspace_adset", (q) =>
        q.eq("workspaceId", workspaceId).eq("adSetId", adSetId),
      )
      .collect();
  },
});

export const listAdInsights = query({
  args: {
    adId: v.id("ads"),
    from: v.string(), // "YYYY-MM-DD"
    to: v.string(),   // "YYYY-MM-DD"
  },
  handler: async (ctx, { adId, from, to }) => {
    await requireMembership(ctx);
    return await ctx.db
      .query("adInsights")
      .withIndex("by_ad_date", (q) =>
        q.eq("adId", adId).gte("date", from).lte("date", to),
      )
      .collect();
  },
});

function generateDateKeys(from: string, to: string): string[] {
  const dates: string[] = [];
  const current = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

/**
 * Aggregated campaigns report for the `/ads` table with sparklines and date filtering.
 */
export const getCampaignsReport = query({
  args: {
    accountId: v.optional(v.id("adAccounts")),
    from: v.string(),
    to: v.string(),
  },
  handler: async (ctx, { accountId, from, to }) => {
    const { workspaceId } = await requireMembership(ctx);

    // 1. Fetch campaigns
    let campaignsQuery = ctx.db
      .query("adCampaigns")
      .withIndex("by_workspace_priority", (q) => q.eq("workspaceId", workspaceId));

    if (accountId) {
      campaignsQuery = ctx.db
        .query("adCampaigns")
        .withIndex("by_workspace_account", (q) =>
          q.eq("workspaceId", workspaceId).eq("accountId", accountId),
        );
    }

    const campaigns = await campaignsQuery.collect();
    const dateKeys = generateDateKeys(from, to);

    // Fetch accounts to resolve provider (Meta Ads vs Google Ads)
    const accounts = await ctx.db
      .query("adAccounts")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();
    const accountMap = new Map(accounts.map((a) => [a._id, a]));

    // 2. Fetch all adSets and ads for this workspace
    const allAdSets = await ctx.db
      .query("adSets")
      .withIndex("by_workspace_campaign", (q) => q.eq("workspaceId", workspaceId))
      .collect();

    const allAds = await ctx.db
      .query("ads")
      .withIndex("by_workspace_adset", (q) => q.eq("workspaceId", workspaceId))
      .collect();

    const adSetsByCampaign = new Map<string, typeof allAdSets>();
    for (const set of allAdSets) {
      const list = adSetsByCampaign.get(set.campaignId) ?? [];
      list.push(set);
      adSetsByCampaign.set(set.campaignId, list);
    }

    const adsByAdSet = new Map<string, typeof allAds>();
    for (const ad of allAds) {
      const list = adsByAdSet.get(ad.adSetId) ?? [];
      list.push(ad);
      adsByAdSet.set(ad.adSetId, list);
    }

    // 3. For each campaign, aggregate metrics across its ads
    let totalSpend = 0;
    let totalImpressions = 0;
    let totalReach = 0;
    let totalClicks = 0;
    let totalResults = 0;
    let totalConversionValue = 0;

    const campaignRows = await Promise.all(
      campaigns.map(async (campaign) => {
        const adSets = adSetsByCampaign.get(campaign._id) ?? [];
        const ads: (typeof allAds)[number][] = [];
        for (const set of adSets) {
          const setAds = adsByAdSet.get(set._id) ?? [];
          ads.push(...setAds);
        }

        let spend = 0;
        let impressions = 0;
        let reach = 0;
        let clicks = 0;
        let results = 0;
        let conversionValue = 0;
        let video3s = 0;
        let thruplay = 0;

        const dailySpendMap = new Map<string, number>();
        for (const d of dateKeys) {
          dailySpendMap.set(d, 0);
        }

        for (const ad of ads) {
          const insights = await ctx.db
            .query("adInsights")
            .withIndex("by_ad_date", (q) =>
              q.eq("adId", ad._id).gte("date", from).lte("date", to),
            )
            .collect();

          for (const row of insights) {
            // Aggregate daily totals only (breakdownHash === "none" and hour === undefined)
            if (row.breakdownHash === "none" && row.hour === undefined) {
              spend += row.spend;
              impressions += row.impressions;
              reach += row.reach;
              clicks += row.clicks;
              results += row.results;
              conversionValue += row.conversionValue;
              video3s += row.video3s;
              thruplay += row.thruplay;

              const currentDaily = dailySpendMap.get(row.date) ?? 0;
              dailySpendMap.set(row.date, currentDaily + row.spend);
            }
          }
        }

        totalSpend += spend;
        totalImpressions += impressions;
        totalReach += reach;
        totalClicks += clicks;
        totalResults += results;
        totalConversionValue += conversionValue;

        const ctr = impressions > 0 ? clicks / impressions : 0;
        const cpc = clicks > 0 ? spend / clicks : 0;
        const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
        const frequency = reach > 0 ? impressions / reach : 1;
        const costPerResult = results > 0 ? spend / results : 0;
        const roas = spend > 0 ? conversionValue / spend : 0;
        const hasConversionValue = conversionValue > 0;

        const dailySpend = dateKeys.map((date) => ({
          date,
          spend: Number((dailySpendMap.get(date) ?? 0).toFixed(2)),
        }));

        const account = accountMap.get(campaign.accountId);

        return {
          _id: campaign._id,
          externalId: campaign.externalId,
          name: campaign.name,
          provider: account?.provider ?? "meta_ads",
          accountName: account?.name,
          objective: campaign.objective,
          status: campaign.status,
          dailyBudget: campaign.dailyBudget,
          lifetimeBudget: campaign.lifetimeBudget,
          searchImpressionShare: campaign.searchImpressionShare,
          syncPriority: campaign.syncPriority,
          syncedAt: campaign.syncedAt,
          spend: Number(spend.toFixed(2)),
          impressions,
          reach,
          clicks,
          results,
          conversionValue: Number(conversionValue.toFixed(2)),
          costPerResult: Number(costPerResult.toFixed(2)),
          roas: Number(roas.toFixed(2)),
          hasConversionValue,
          ctr: Number(ctr.toFixed(4)),
          cpc: Number(cpc.toFixed(2)),
          cpm: Number(cpm.toFixed(2)),
          frequency: Number(frequency.toFixed(2)),
          video3s,
          thruplay,
          dailySpend,
          adSetsCount: adSets.length,
          adsCount: ads.length,
        };
      }),
    );

    const overallCtr = totalImpressions > 0 ? totalClicks / totalImpressions : 0;
    const overallCpa = totalResults > 0 ? totalSpend / totalResults : 0;
    const overallRoas = totalSpend > 0 ? totalConversionValue / totalSpend : 0;
    const overallFrequency = totalReach > 0 ? totalImpressions / totalReach : 1;

    return {
      campaigns: campaignRows,
      totals: {
        totalSpend: Number(totalSpend.toFixed(2)),
        totalImpressions,
        totalClicks,
        totalResults,
        totalConversionValue: Number(totalConversionValue.toFixed(2)),
        overallCpa: Number(overallCpa.toFixed(2)),
        overallRoas: Number(overallRoas.toFixed(2)),
        hasConversionValue: totalConversionValue > 0,
        overallCtr: Number(overallCtr.toFixed(4)),
        overallFrequency: Number(overallFrequency.toFixed(2)),
        campaignsCount: campaigns.length,
      },
    };
  },
});

/**
 * Full campaign hierarchy with ad sets, ads, per-ad metrics, and sparklines.
 */
export const getCampaignHierarchy = query({
  args: {
    campaignId: v.id("adCampaigns"),
    from: v.string(),
    to: v.string(),
  },
  handler: async (ctx, { campaignId, from, to }) => {
    const { workspaceId } = await requireMembership(ctx);

    const campaign = await ctx.db.get(campaignId);
    if (!campaign || campaign.workspaceId !== workspaceId) {
      return null;
    }

    const account = await ctx.db.get(campaign.accountId);

    const dateKeys = generateDateKeys(from, to);

    const adSets = await ctx.db
      .query("adSets")
      .withIndex("by_workspace_campaign", (q) =>
        q.eq("workspaceId", workspaceId).eq("campaignId", campaignId),
      )
      .collect();

    let campSpend = 0;
    let campImpressions = 0;
    let campReach = 0;
    let campClicks = 0;
    let campResults = 0;
    let campConversionValue = 0;
    let campVideo3s = 0;
    let campThruplay = 0;

    const adSetResults = await Promise.all(
      adSets.map(async (set) => {
        const ads = await ctx.db
          .query("ads")
          .withIndex("by_workspace_adset", (q) =>
            q.eq("workspaceId", workspaceId).eq("adSetId", set._id),
          )
          .collect();

        let setSpend = 0;
        let setImpressions = 0;
        let setReach = 0;
        let setClicks = 0;
        let setResults = 0;
        let setConversionValue = 0;
        let setVideo3s = 0;
        let setThruplay = 0;

        const adResults = await Promise.all(
          ads.map(async (ad) => {
            const insights = await ctx.db
              .query("adInsights")
              .withIndex("by_ad_date", (q) =>
                q.eq("adId", ad._id).gte("date", from).lte("date", to),
              )
              .collect();

            let adSpend = 0;
            let adImpressions = 0;
            let adReach = 0;
            let adClicks = 0;
            let adResultsCount = 0;
            let adConversionValue = 0;
            let adVideo3s = 0;
            let adThruplay = 0;
            let qualityRanking = ad.status;
            let engagementRanking: string | undefined;
            let conversionRanking: string | undefined;

            const dailySpendMap = new Map<string, number>();
            for (const d of dateKeys) dailySpendMap.set(d, 0);

            for (const row of insights) {
              if (row.breakdownHash === "none" && row.hour === undefined) {
                adSpend += row.spend;
                adImpressions += row.impressions;
                adReach += row.reach;
                adClicks += row.clicks;
                adResultsCount += row.results;
                adConversionValue += row.conversionValue;
                adVideo3s += row.video3s;
                adThruplay += row.thruplay;

                if (row.qualityRanking) qualityRanking = row.qualityRanking;
                if (row.engagementRanking) engagementRanking = row.engagementRanking;
                if (row.conversionRanking) conversionRanking = row.conversionRanking;

                const cur = dailySpendMap.get(row.date) ?? 0;
                dailySpendMap.set(row.date, cur + row.spend);
              }
            }

            setSpend += adSpend;
            setImpressions += adImpressions;
            setReach += adReach;
            setClicks += adClicks;
            setResults += adResultsCount;
            setConversionValue += adConversionValue;
            setVideo3s += adVideo3s;
            setThruplay += adThruplay;

            const adCtr = adImpressions > 0 ? adClicks / adImpressions : 0;
            const adCpc = adClicks > 0 ? adSpend / adClicks : 0;
            const adCpm = adImpressions > 0 ? (adSpend / adImpressions) * 1000 : 0;
            const adFrequency = adReach > 0 ? adImpressions / adReach : 1;
            const adCpa = adResultsCount > 0 ? adSpend / adResultsCount : 0;
            const adRoas = adSpend > 0 ? adConversionValue / adSpend : 0;
            const hookRate = adImpressions > 0 ? adVideo3s / adImpressions : 0;
            const holdRate = adVideo3s > 0 ? adThruplay / adVideo3s : 0;

            const dailySpend = dateKeys.map((date) => ({
              date,
              spend: Number((dailySpendMap.get(date) ?? 0).toFixed(2)),
            }));

            return {
              _id: ad._id,
              externalId: ad.externalId,
              name: ad.name,
              status: ad.status,
              hookLabel: ad.hookLabel,
              creativeId: ad.creativeId,
              thumbnailUrl: ad.thumbnailUrl,
              previewUrl: ad.previewUrl,
              syncedAt: ad.syncedAt,
              spend: Number(adSpend.toFixed(2)),
              impressions: adImpressions,
              reach: adReach,
              clicks: adClicks,
              results: adResultsCount,
              conversionValue: Number(adConversionValue.toFixed(2)),
              costPerResult: Number(adCpa.toFixed(2)),
              roas: Number(adRoas.toFixed(2)),
              hasConversionValue: adConversionValue > 0,
              ctr: Number(adCtr.toFixed(4)),
              cpc: Number(adCpc.toFixed(2)),
              cpm: Number(adCpm.toFixed(2)),
              frequency: Number(adFrequency.toFixed(2)),
              video3s: adVideo3s,
              thruplay: adThruplay,
              hookRate: Number(hookRate.toFixed(4)),
              holdRate: Number(holdRate.toFixed(4)),
              qualityRanking,
              engagementRanking,
              conversionRanking,
              dailySpend,
            };
          }),
        );

        campSpend += setSpend;
        campImpressions += setImpressions;
        campReach += setReach;
        campClicks += setClicks;
        campResults += setResults;
        campConversionValue += setConversionValue;
        campVideo3s += setVideo3s;
        campThruplay += setThruplay;

        const setCtr = setImpressions > 0 ? setClicks / setImpressions : 0;
        const setCpa = setResults > 0 ? setSpend / setResults : 0;
        const setRoas = setSpend > 0 ? setConversionValue / setSpend : 0;
        const setFrequency = setReach > 0 ? setImpressions / setReach : 1;

        return {
          _id: set._id,
          externalId: set.externalId,
          name: set.name,
          status: set.status,
          targetingSummary: set.targetingSummary,
          dailyBudget: set.dailyBudget,
          lifetimeBudget: set.lifetimeBudget,
          syncedAt: set.syncedAt,
          spend: Number(setSpend.toFixed(2)),
          impressions: setImpressions,
          reach: setReach,
          clicks: setClicks,
          results: setResults,
          conversionValue: Number(setConversionValue.toFixed(2)),
          costPerResult: Number(setCpa.toFixed(2)),
          roas: Number(setRoas.toFixed(2)),
          hasConversionValue: setConversionValue > 0,
          ctr: Number(setCtr.toFixed(4)),
          frequency: Number(setFrequency.toFixed(2)),
          ads: adResults,
        };
      }),
    );

    const campCtr = campImpressions > 0 ? campClicks / campImpressions : 0;
    const campCpa = campResults > 0 ? campSpend / campResults : 0;
    const campRoas = campSpend > 0 ? campConversionValue / campSpend : 0;
    const campFrequency = campReach > 0 ? campImpressions / campReach : 1;

    return {
      campaign: {
        _id: campaign._id,
        externalId: campaign.externalId,
        name: campaign.name,
        provider: account?.provider ?? "meta_ads",
        accountName: account?.name,
        objective: campaign.objective,
        status: campaign.status,
        dailyBudget: campaign.dailyBudget,
        lifetimeBudget: campaign.lifetimeBudget,
        searchImpressionShare: campaign.searchImpressionShare,
        syncPriority: campaign.syncPriority,
        syncedAt: campaign.syncedAt,
        spend: Number(campSpend.toFixed(2)),
        impressions: campImpressions,
        reach: campReach,
        clicks: campClicks,
        results: campResults,
        conversionValue: Number(campConversionValue.toFixed(2)),
        costPerResult: Number(campCpa.toFixed(2)),
        roas: Number(campRoas.toFixed(2)),
        hasConversionValue: campConversionValue > 0,
        ctr: Number(campCtr.toFixed(4)),
        frequency: Number(campFrequency.toFixed(2)),
        video3s: campVideo3s,
        thruplay: campThruplay,
      },
      adSets: adSetResults,
    };
  },
});

/**
 * Deep drill-down panel metrics for a single ad (core metrics, video funnel, heat table, placement split, hourly pattern).
 */
export const getAdDrilldown = query({
  args: {
    adId: v.id("ads"),
    from: v.string(),
    to: v.string(),
  },
  handler: async (ctx, { adId, from, to }) => {
    const { workspaceId } = await requireMembership(ctx);

    const ad = await ctx.db.get(adId);
    if (!ad || ad.workspaceId !== workspaceId) return null;

    const adSet = await ctx.db.get(ad.adSetId);
    const campaign = adSet ? await ctx.db.get(adSet.campaignId) : null;
    const account = campaign ? await ctx.db.get(campaign.accountId) : null;

    const dateKeys = generateDateKeys(from, to);

    // Fetch all insights for this ad within [from, to]
    const allInsights = await ctx.db
      .query("adInsights")
      .withIndex("by_ad_date", (q) =>
        q.eq("adId", adId).gte("date", from).lte("date", to),
      )
      .collect();

    // 1. Daily aggregate rows (breakdownHash === "none" && hour === undefined)
    const dailyMap = new Map<
      string,
      {
        spend: number;
        impressions: number;
        clicks: number;
        results: number;
        video3s: number;
        thruplay: number;
      }
    >();
    for (const d of dateKeys) {
      dailyMap.set(d, {
        spend: 0,
        impressions: 0,
        clicks: 0,
        results: 0,
        video3s: 0,
        thruplay: 0,
      });
    }

    let spend = 0;
    let impressions = 0;
    let reach = 0;
    let clicks = 0;
    let uniqueCtrSum = 0;
    let uniqueCtrCount = 0;
    let cppSum = 0;
    let cppCount = 0;
    let video3s = 0;
    let thruplay = 0;
    let videoP25 = 0;
    let videoP50 = 0;
    let videoP75 = 0;
    let videoP95 = 0;
    let videoP100 = 0;
    let outboundCtrSum = 0;
    let outboundCtrCount = 0;
    let results = 0;
    let conversionValue = 0;
    let qualityRanking: string | undefined;
    let engagementRanking: string | undefined;
    let conversionRanking: string | undefined;

    // 2. Hourly rows (hour !== undefined)
    const hourlyMap = new Map<
      number,
      { spend: number; impressions: number; clicks: number; results: number }
    >();
    for (let h = 0; h < 24; h++) {
      hourlyMap.set(h, { spend: 0, impressions: 0, clicks: 0, results: 0 });
    }
    let hasHourlyData = false;

    // 3. Breakdown rows (breakdownHash !== "none")
    // Age x Gender matrix
    const ageGenderData = new Map<
      string,
      Map<
        string,
        { spend: number; impressions: number; clicks: number; results: number }
      >
    >();
    // Placement split list
    const placementData = new Map<
      string,
      {
        placement: string;
        platform: string;
        spend: number;
        impressions: number;
        clicks: number;
        results: number;
      }
    >();

    for (const row of allInsights) {
      // Daily aggregates
      if (row.breakdownHash === "none" && row.hour === undefined) {
        spend += row.spend;
        impressions += row.impressions;
        reach += row.reach;
        clicks += row.clicks;
        results += row.results;
        conversionValue += row.conversionValue;
        video3s += row.video3s;
        thruplay += row.thruplay;
        videoP25 += row.videoP25;
        videoP50 += row.videoP50;
        videoP75 += row.videoP75;
        if (row.videoP95) videoP95 += row.videoP95;
        videoP100 += row.videoP100;

        if (row.uniqueCtr !== undefined) {
          uniqueCtrSum += row.uniqueCtr;
          uniqueCtrCount++;
        }
        if (row.cpp !== undefined) {
          cppSum += row.cpp;
          cppCount++;
        }
        if (row.outboundCtr !== undefined) {
          outboundCtrSum += row.outboundCtr;
          outboundCtrCount++;
        }

        if (row.qualityRanking) qualityRanking = row.qualityRanking;
        if (row.engagementRanking) engagementRanking = row.engagementRanking;
        if (row.conversionRanking) conversionRanking = row.conversionRanking;

        const dayEntry = dailyMap.get(row.date);
        if (dayEntry) {
          dayEntry.spend += row.spend;
          dayEntry.impressions += row.impressions;
          dayEntry.clicks += row.clicks;
          dayEntry.results += row.results;
          dayEntry.video3s += row.video3s;
          dayEntry.thruplay += row.thruplay;
        }
      }

      // Hourly rows
      if (row.hour !== undefined && row.breakdownHash === "none") {
        hasHourlyData = true;
        const entry = hourlyMap.get(row.hour);
        if (entry) {
          entry.spend += row.spend;
          entry.impressions += row.impressions;
          entry.clicks += row.clicks;
          entry.results += row.results;
        }
      }

      // Breakdown rows
      if (row.breakdown) {
        // Age x Gender
        if (row.breakdown.age || row.breakdown.gender) {
          const age = row.breakdown.age ?? "18-24";
          const gender = (row.breakdown.gender ?? "unknown").toLowerCase();

          if (!ageGenderData.has(age)) {
            ageGenderData.set(age, new Map());
          }
          const ageMap = ageGenderData.get(age)!;
          const genderEntry = ageMap.get(gender) ?? {
            spend: 0,
            impressions: 0,
            clicks: 0,
            results: 0,
          };
          genderEntry.spend += row.spend;
          genderEntry.impressions += row.impressions;
          genderEntry.clicks += row.clicks;
          genderEntry.results += row.results;
          ageMap.set(gender, genderEntry);
        }

        // Placement / Platform
        if (row.breakdown.placement || row.breakdown.platform) {
          const placement = row.breakdown.placement ?? "all_placements";
          const platform = row.breakdown.platform ?? "all_platforms";
          const key = `${platform}::${placement}`;

          const entry = placementData.get(key) ?? {
            placement,
            platform,
            spend: 0,
            impressions: 0,
            clicks: 0,
            results: 0,
          };
          entry.spend += row.spend;
          entry.impressions += row.impressions;
          entry.clicks += row.clicks;
          entry.results += row.results;
          placementData.set(key, entry);
        }
      }
    }

    const ctr = impressions > 0 ? clicks / impressions : 0;
    const cpc = clicks > 0 ? spend / clicks : 0;
    const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
    const frequency = reach > 0 ? impressions / reach : 1;
    const costPerResult = results > 0 ? spend / results : 0;
    const roas = spend > 0 ? conversionValue / spend : 0;
    const hookRate = impressions > 0 ? video3s / impressions : 0;
    const holdRate = video3s > 0 ? thruplay / video3s : 0;
    const uniqueCtr = uniqueCtrCount > 0 ? uniqueCtrSum / uniqueCtrCount : undefined;
    const cpp = cppCount > 0 ? cppSum / cppCount : undefined;
    const outboundCtr = outboundCtrCount > 0 ? outboundCtrSum / outboundCtrCount : undefined;

    // Build age x gender standard matrix
    const standardAges = ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"];
    const allKnownAges = Array.from(
      new Set([...standardAges, ...Array.from(ageGenderData.keys())]),
    ).sort();

    const ageGenderMatrix = allKnownAges.map((age) => {
      const ageMap = ageGenderData.get(age) ?? new Map();
      const female = ageMap.get("female") ?? { spend: 0, impressions: 0, clicks: 0, results: 0 };
      const male = ageMap.get("male") ?? { spend: 0, impressions: 0, clicks: 0, results: 0 };
      const unknown = ageMap.get("unknown") ?? { spend: 0, impressions: 0, clicks: 0, results: 0 };

      const totalSpendRow = female.spend + male.spend + unknown.spend;
      const totalImpRow = female.impressions + male.impressions + unknown.impressions;
      const totalClicksRow = female.clicks + male.clicks + unknown.clicks;
      const totalResultsRow = female.results + male.results + unknown.results;

      return {
        age,
        female: {
          ...female,
          spend: Number(female.spend.toFixed(2)),
          ctr: female.impressions > 0 ? female.clicks / female.impressions : 0,
        },
        male: {
          ...male,
          spend: Number(male.spend.toFixed(2)),
          ctr: male.impressions > 0 ? male.clicks / male.impressions : 0,
        },
        unknown: {
          ...unknown,
          spend: Number(unknown.spend.toFixed(2)),
          ctr: unknown.impressions > 0 ? unknown.clicks / unknown.impressions : 0,
        },
        total: {
          spend: Number(totalSpendRow.toFixed(2)),
          impressions: totalImpRow,
          clicks: totalClicksRow,
          results: totalResultsRow,
          ctr: totalImpRow > 0 ? totalClicksRow / totalImpRow : 0,
        },
      };
    });

    const placementList = Array.from(placementData.values()).map((p) => {
      const pCtr = p.impressions > 0 ? p.clicks / p.impressions : 0;
      const pCpc = p.clicks > 0 ? p.spend / p.clicks : 0;
      const pCpa = p.results > 0 ? p.spend / p.results : 0;
      return {
        placement: p.placement,
        platform: p.platform,
        spend: Number(p.spend.toFixed(2)),
        impressions: p.impressions,
        clicks: p.clicks,
        results: p.results,
        ctr: Number(pCtr.toFixed(4)),
        cpc: Number(pCpc.toFixed(2)),
        cpa: Number(pCpa.toFixed(2)),
      };
    });

    const dailySeries = dateKeys.map((date) => {
      const entry = dailyMap.get(date)!;
      return {
        date,
        spend: Number(entry.spend.toFixed(2)),
        impressions: entry.impressions,
        clicks: entry.clicks,
        results: entry.results,
        video3s: entry.video3s,
        thruplay: entry.thruplay,
      };
    });

    const hourlySeries = Array.from(hourlyMap.entries()).map(([hour, val]) => ({
      hour,
      spend: Number(val.spend.toFixed(2)),
      impressions: val.impressions,
      clicks: val.clicks,
      results: val.results,
    }));

    return {
      ad: {
        _id: ad._id,
        externalId: ad.externalId,
        name: ad.name,
        status: ad.status,
        hookLabel: ad.hookLabel,
        creativeId: ad.creativeId,
        thumbnailUrl: ad.thumbnailUrl,
        previewUrl: ad.previewUrl,
        syncedAt: ad.syncedAt,
      },
      adSet: adSet
        ? {
            _id: adSet._id,
            name: adSet.name,
            status: adSet.status,
            targetingSummary: adSet.targetingSummary,
            dailyBudget: adSet.dailyBudget,
          }
        : null,
      campaign: campaign
        ? {
            _id: campaign._id,
            name: campaign.name,
            objective: campaign.objective,
            status: campaign.status,
            syncPriority: campaign.syncPriority,
            syncedAt: campaign.syncedAt,
          }
        : null,
      coreMetrics: {
        spend: Number(spend.toFixed(2)),
        impressions,
        reach,
        frequency: Number(frequency.toFixed(2)),
        clicks,
        ctr: Number(ctr.toFixed(4)),
        uniqueCtr: uniqueCtr ? Number(uniqueCtr.toFixed(4)) : undefined,
        cpc: Number(cpc.toFixed(2)),
        cpm: Number(cpm.toFixed(2)),
        cpp: cpp ? Number(cpp.toFixed(2)) : undefined,
        results,
        costPerResult: Number(costPerResult.toFixed(2)),
        conversionValue: Number(conversionValue.toFixed(2)),
        roas: Number(roas.toFixed(2)),
        hasConversionValue: conversionValue > 0,
        outboundCtr: outboundCtr ? Number(outboundCtr.toFixed(4)) : undefined,
      },
      videoFunnel: {
        impressions,
        video3s,
        thruplay,
        hookRate: Number(hookRate.toFixed(4)),
        holdRate: Number(holdRate.toFixed(4)),
        videoP25,
        videoP50,
        videoP75,
        videoP95,
        videoP100,
      },
      rankings: {
        qualityRanking,
        engagementRanking,
        conversionRanking,
      },
      dailySeries,
      hourlySeries,
      hasHourlyData,
      ageGenderMatrix,
      placementList,
      provider: account?.provider ?? "meta_ads",
      searchImpressionShare: campaign?.searchImpressionShare,
    };
  },
});

/**
 * ============================================================================
 * HOOK BATTLE & PINNED BATTLES (PLAN.md §7.4)
 * ============================================================================
 */

/**
 * Inline edit / update custom hook label on an ad.
 */
export const setHookLabel = mutation({
  args: {
    adId: v.id("ads"),
    hookLabel: v.string(),
  },
  handler: async (ctx, { adId, hookLabel }) => {
    const { workspaceId } = await requireMembership(ctx);
    const ad = await ctx.db.get(adId);
    if (!ad || ad.workspaceId !== workspaceId) {
      throw new Error("Oglas nije pronađen ili nemate pristup.");
    }
    const trimmed = hookLabel.trim();
    await ctx.db.patch(adId, {
      hookLabel: trimmed.length > 0 ? trimmed : undefined,
    });
    return { success: true, hookLabel: trimmed.length > 0 ? trimmed : undefined };
  },
});

/**
 * Deep comparison data for all creative versions inside an ad set.
 */
export const getHookBattle = query({
  args: {
    adSetId: v.id("adSets"),
    from: v.string(),
    to: v.string(),
  },
  handler: async (ctx, { adSetId, from, to }) => {
    const { workspaceId } = await requireMembership(ctx);

    const adSet = await ctx.db.get(adSetId);
    if (!adSet || adSet.workspaceId !== workspaceId) {
      return null;
    }

    const campaign = await ctx.db.get(adSet.campaignId);
    if (!campaign || campaign.workspaceId !== workspaceId) {
      return null;
    }

    const dateKeys = generateDateKeys(from, to);

    // Fetch all ads in this adSet
    const ads = await ctx.db
      .query("ads")
      .withIndex("by_workspace_adset", (q) =>
        q.eq("workspaceId", workspaceId).eq("adSetId", adSetId),
      )
      .collect();

    // Check if pinned
    const pinnedRecord = await ctx.db
      .query("pinnedBattles")
      .withIndex("by_workspace_adset", (q) =>
        q.eq("workspaceId", workspaceId).eq("adSetId", adSetId),
      )
      .filter((q) => q.and(q.eq(q.field("from"), from), q.eq(q.field("to"), to)))
      .first();

    const isPinned = Boolean(pinnedRecord);

    const versions = await Promise.all(
      ads.map(async (ad) => {
        const insights = await ctx.db
          .query("adInsights")
          .withIndex("by_ad_date", (q) =>
            q.eq("adId", ad._id).gte("date", from).lte("date", to),
          )
          .collect();

        let spend = 0;
        let impressions = 0;
        let reach = 0;
        let clicks = 0;
        let results = 0;
        let conversionValue = 0;
        let video3s = 0;
        let thruplay = 0;
        let videoP25 = 0;
        let videoP50 = 0;
        let videoP75 = 0;
        let videoP95 = 0;
        let videoP100 = 0;

        const dailySpendMap = new Map<string, number>();
        const dailyHookMap = new Map<string, { video3s: number; impressions: number }>();
        for (const d of dateKeys) {
          dailySpendMap.set(d, 0);
          dailyHookMap.set(d, { video3s: 0, impressions: 0 });
        }

        for (const row of insights) {
          if (row.breakdownHash === "none" && row.hour === undefined) {
            spend += row.spend;
            impressions += row.impressions;
            reach += row.reach;
            clicks += row.clicks;
            results += row.results;
            conversionValue += row.conversionValue;
            video3s += row.video3s;
            thruplay += row.thruplay;
            videoP25 += row.videoP25;
            videoP50 += row.videoP50;
            videoP75 += row.videoP75;
            if (row.videoP95) videoP95 += row.videoP95;
            videoP100 += row.videoP100;

            const curSpend = dailySpendMap.get(row.date) ?? 0;
            dailySpendMap.set(row.date, curSpend + row.spend);

            const curHook = dailyHookMap.get(row.date) ?? { video3s: 0, impressions: 0 };
            dailyHookMap.set(row.date, {
              video3s: curHook.video3s + row.video3s,
              impressions: curHook.impressions + row.impressions,
            });
          }
        }

        const ctr = impressions > 0 ? clicks / impressions : 0;
        const cpc = clicks > 0 ? spend / clicks : 0;
        const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
        const frequency = reach > 0 ? impressions / reach : 1;
        const costPerResult = results > 0 ? spend / results : 0;
        const roas = spend > 0 ? conversionValue / spend : 0;
        const hookRate = impressions > 0 ? video3s / impressions : 0;
        const holdRate = video3s > 0 ? thruplay / video3s : 0;

        // Retention checkpoints
        // p25/p50/p75/p100 percentages relative to video3s (and relative to impressions)
        const p25Pct = video3s > 0 ? videoP25 / video3s : (impressions > 0 ? videoP25 / impressions : 0);
        const p50Pct = video3s > 0 ? videoP50 / video3s : (impressions > 0 ? videoP50 / impressions : 0);
        const p75Pct = video3s > 0 ? videoP75 / video3s : (impressions > 0 ? videoP75 / impressions : 0);
        const p100Pct = video3s > 0 ? videoP100 / video3s : (impressions > 0 ? videoP100 / impressions : 0);

        const dailySeries = dateKeys.map((date) => {
          const hookData = dailyHookMap.get(date) ?? { video3s: 0, impressions: 0 };
          const dayHookRate = hookData.impressions > 0 ? hookData.video3s / hookData.impressions : 0;
          return {
            date,
            spend: Number((dailySpendMap.get(date) ?? 0).toFixed(2)),
            hookRate: Number(dayHookRate.toFixed(4)),
          };
        });

        return {
          _id: ad._id,
          externalId: ad.externalId,
          name: ad.name,
          displayName:
            ad.hookLabel && ad.hookLabel.trim().length > 0
              ? ad.hookLabel.trim()
              : ad.name,
          hookLabel: ad.hookLabel,
          primaryText: ad.primaryText,
          headline: ad.headline,
          status: ad.status,
          creativeId: ad.creativeId,
          thumbnailUrl: ad.thumbnailUrl,
          previewUrl: ad.previewUrl,
          spend: Number(spend.toFixed(2)),
          impressions,
          reach,
          clicks,
          results,
          conversionValue: Number(conversionValue.toFixed(2)),
          costPerResult: Number(costPerResult.toFixed(2)),
          roas: Number(roas.toFixed(2)),
          hasConversionValue: conversionValue > 0,
          ctr: Number(ctr.toFixed(4)),
          cpc: Number(cpc.toFixed(2)),
          cpm: Number(cpm.toFixed(2)),
          frequency: Number(frequency.toFixed(2)),
          video3s,
          thruplay,
          hookRate: Number(hookRate.toFixed(4)),
          holdRate: Number(holdRate.toFixed(4)),
          videoRetention: {
            video3s,
            thruplay,
            videoP25,
            videoP50,
            videoP75,
            videoP95,
            videoP100,
            p25Pct: Number(p25Pct.toFixed(4)),
            p50Pct: Number(p50Pct.toFixed(4)),
            p75Pct: Number(p75Pct.toFixed(4)),
            p100Pct: Number(p100Pct.toFixed(4)),
          },
          dailySeries,
        };
      }),
    );

    return {
      adSet: {
        _id: adSet._id,
        externalId: adSet.externalId,
        name: adSet.name,
        status: adSet.status,
        targetingSummary: adSet.targetingSummary,
        dailyBudget: adSet.dailyBudget,
      },
      campaign: {
        _id: campaign._id,
        externalId: campaign.externalId,
        name: campaign.name,
        objective: campaign.objective,
        status: campaign.status,
      },
      from,
      to,
      isPinned,
      pinnedId: pinnedRecord?._id,
      versions,
    };
  },
});

/**
 * Pin a hook battle for later reference.
 */
export const pinBattle = mutation({
  args: {
    adSetId: v.id("adSets"),
    from: v.string(),
    to: v.string(),
    name: v.optional(v.string()),
  },
  handler: async (ctx, { adSetId, from, to, name }) => {
    const { workspaceId } = await requireMembership(ctx);
    const existing = await ctx.db
      .query("pinnedBattles")
      .withIndex("by_workspace_adset", (q) =>
        q.eq("workspaceId", workspaceId).eq("adSetId", adSetId),
      )
      .filter((q) => q.and(q.eq(q.field("from"), from), q.eq(q.field("to"), to)))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name,
        pinnedAt: Date.now(),
      });
      return existing._id;
    }

    return await ctx.db.insert("pinnedBattles", {
      workspaceId,
      adSetId,
      from,
      to,
      name,
      pinnedAt: Date.now(),
    });
  },
});

/**
 * Unpin a hook battle.
 */
export const unpinBattle = mutation({
  args: {
    adSetId: v.id("adSets"),
    from: v.string(),
    to: v.string(),
  },
  handler: async (ctx, { adSetId, from, to }) => {
    const { workspaceId } = await requireMembership(ctx);
    const rows = await ctx.db
      .query("pinnedBattles")
      .withIndex("by_workspace_adset", (q) =>
        q.eq("workspaceId", workspaceId).eq("adSetId", adSetId),
      )
      .filter((q) => q.and(q.eq(q.field("from"), from), q.eq(q.field("to"), to)))
      .collect();

    for (const r of rows) {
      await ctx.db.delete(r._id);
    }
    return { success: true };
  },
});

/**
 * List all pinned battles for the current workspace.
 */
export const listPinnedBattles = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireMembership(ctx);
    const pinned = await ctx.db
      .query("pinnedBattles")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .order("desc")
      .collect();

    return await Promise.all(
      pinned.map(async (p) => {
        const adSet = await ctx.db.get(p.adSetId);
        const campaign = adSet ? await ctx.db.get(adSet.campaignId) : null;
        const ads = adSet
          ? await ctx.db
              .query("ads")
              .withIndex("by_workspace_adset", (q) =>
                q.eq("workspaceId", workspaceId).eq("adSetId", adSet._id),
              )
              .collect()
          : [];

        return {
          _id: p._id,
          adSetId: p.adSetId,
          from: p.from,
          to: p.to,
          name: p.name,
          pinnedAt: p.pinnedAt,
          adSetName: adSet?.name ?? "Nepoznat Ad Set",
          campaignName: campaign?.name ?? "Nepoznata Kampanja",
          campaignId: campaign?._id,
          adsCount: ads.length,
        };
      }),
    );
  },
});

