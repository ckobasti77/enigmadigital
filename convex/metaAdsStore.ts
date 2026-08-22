import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { providerValidator } from "./lib/providers";
import { requireMembership } from "./lib/auth";
import {
  QUOTA_TTL_MS,
  determineGateState,
  quotaPeak,
} from "./lib/metaAdsQuota";
import { deriveRate, META_INSIGHTS_VERSION } from "./lib/metaAdsCatalog";

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
 *   - `adActionBreakdown` upserted by `[adId, date, breakdownHash, actionType, window]`
 *
 * hookRate and holdRate are derived at read time via `deriveRate`.
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
  searchImpressionShare: v.optional(v.number()),
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
  clicks: v.number(),
  reach: v.optional(v.number()),
  frequency: v.optional(v.number()),
  ctr: v.optional(v.number()),
  uniqueCtr: v.optional(v.number()),
  cpc: v.optional(v.number()),
  cpm: v.optional(v.number()),
  cpp: v.optional(v.number()),
  video3s: v.optional(v.number()),
  thruplay: v.optional(v.number()),
  videoP25: v.optional(v.number()),
  videoP50: v.optional(v.number()),
  videoP75: v.optional(v.number()),
  videoP95: v.optional(v.number()),
  videoP100: v.optional(v.number()),
  outboundCtr: v.optional(v.number()),
  results: v.optional(v.number()),
  costPerResult: v.optional(v.number()),
  conversionValue: v.optional(v.number()),
  roas: v.optional(v.number()),
  searchImpressionShare: v.optional(v.number()),
  /** Read-only echo iz Meta odgovora (MA1); undefined kada nije stiglo. */
  attributionSetting: v.optional(v.string()),
  qualityRanking: v.optional(v.string()),
  engagementRanking: v.optional(v.string()),
  conversionRanking: v.optional(v.string()),
  insightsVersion: v.optional(v.number()),
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
        const patchData: Record<string, unknown> = {
          accountId,
          name: c.name,
          status: c.status,
          syncPriority: c.syncPriority,
          syncedAt: now,
        };
        if (c.objective !== undefined) patchData.objective = c.objective;
        if (c.dailyBudget !== undefined) patchData.dailyBudget = c.dailyBudget;
        if (c.lifetimeBudget !== undefined) patchData.lifetimeBudget = c.lifetimeBudget;
        await ctx.db.patch(existing._id, patchData);
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
        const patchData: Record<string, unknown> = {
          campaignId,
          name: s.name,
          status: s.status,
          syncedAt: now,
        };
        if (s.targetingSummary !== undefined) patchData.targetingSummary = s.targetingSummary;
        if (s.dailyBudget !== undefined) patchData.dailyBudget = s.dailyBudget;
        if (s.lifetimeBudget !== undefined) patchData.lifetimeBudget = s.lifetimeBudget;
        await ctx.db.patch(existing._id, patchData);
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
        const patchData: Record<string, unknown> = {
          adSetId,
          name: a.name,
          status: a.status,
          syncedAt: now,
        };
        if (a.creativeId !== undefined) patchData.creativeId = a.creativeId;
        if (a.thumbnailUrl !== undefined) patchData.thumbnailUrl = a.thumbnailUrl;
        if (a.previewUrl !== undefined) patchData.previewUrl = a.previewUrl;
        await ctx.db.patch(existing._id, patchData);
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
 * Batch upsert ad insights rows with insightsVersion (MA3).
 *
 * Gradi patch objekat sa ISKLJUČIVO definisanim poljima jer slanje undefined polja u ctx.db.patch briše postojeće vrednosti u Convexu.
 * roas i costPerResult se ne upisuju u bazu već se računaju pri čitanju preko deriveRate.
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

      const data: Record<string, unknown> = {
        spend: row.spend,
        impressions: row.impressions,
        clicks: row.clicks,
        insightsVersion: row.insightsVersion ?? META_INSIGHTS_VERSION,
        syncedAt: now,
      };

      if (row.breakdown !== undefined) data.breakdown = row.breakdown;
      if (row.reach !== undefined) data.reach = row.reach;
      if (row.frequency !== undefined) data.frequency = row.frequency;
      if (row.ctr !== undefined) data.ctr = row.ctr;
      if (row.uniqueCtr !== undefined) data.uniqueCtr = row.uniqueCtr;
      if (row.cpc !== undefined) data.cpc = row.cpc;
      if (row.cpm !== undefined) data.cpm = row.cpm;
      if (row.cpp !== undefined) data.cpp = row.cpp;
      if (row.video3s !== undefined) data.video3s = row.video3s;
      if (row.thruplay !== undefined) data.thruplay = row.thruplay;
      if (row.videoP25 !== undefined) data.videoP25 = row.videoP25;
      if (row.videoP50 !== undefined) data.videoP50 = row.videoP50;
      if (row.videoP75 !== undefined) data.videoP75 = row.videoP75;
      if (row.videoP95 !== undefined) data.videoP95 = row.videoP95;
      if (row.videoP100 !== undefined) data.videoP100 = row.videoP100;
      if (row.outboundCtr !== undefined) data.outboundCtr = row.outboundCtr;
      if (row.results !== undefined) data.results = row.results;
      if (row.conversionValue !== undefined) data.conversionValue = row.conversionValue;
      if (row.searchImpressionShare !== undefined) data.searchImpressionShare = row.searchImpressionShare;
      if (row.attributionSetting !== undefined) data.attributionSetting = row.attributionSetting;
      if (row.qualityRanking !== undefined) data.qualityRanking = row.qualityRanking;
      if (row.engagementRanking !== undefined) data.engagementRanking = row.engagementRanking;
      if (row.conversionRanking !== undefined) data.conversionRanking = row.conversionRanking;

      if (existing !== null) {
        await ctx.db.patch(existing._id, data);
      } else {
        await ctx.db.insert("adInsights", {
          workspaceId,
          adId: row.adId,
          date: row.date,
          hour: row.hour,
          breakdown: row.breakdown,
          breakdownHash: row.breakdownHash,
          spend: row.spend,
          impressions: row.impressions,
          clicks: row.clicks,
          syncedAt: now,
          reach: row.reach,
          uniqueCtr: row.uniqueCtr,
          cpp: row.cpp,
          video3s: row.video3s,
          thruplay: row.thruplay,
          videoP25: row.videoP25,
          videoP50: row.videoP50,
          videoP75: row.videoP75,
          videoP95: row.videoP95,
          videoP100: row.videoP100,
          outboundCtr: row.outboundCtr,
          results: row.results,
          conversionValue: row.conversionValue,
          searchImpressionShare: row.searchImpressionShare,
          attributionSetting: row.attributionSetting,
          qualityRanking: row.qualityRanking,
          engagementRanking: row.engagementRanking,
          conversionRanking: row.conversionRanking,
        });
      }
      written++;
    }

    return written;
  },
});

export const actionBreakdownInputValidator = v.object({
  adId: v.id("ads"),
  date: v.string(),
  breakdownHash: v.string(),
  actionType: v.string(),
  window: v.string(), // "1d_click" | "7d_click" | "1d_view" | "7d_view" | "default"
  count: v.optional(v.number()),
  value: v.optional(v.number()),
  costPer: v.optional(v.number()),
});

/**
 * Batch upsert ad action breakdowns by type & attribution window (MA2/MA3).
 *
 * Gradi patch objekat sa ISKLJUČIVO definisanim poljima jer slanje undefined polja u ctx.db.patch briše postojeće vrednosti u Convexu.
 */
export const upsertActionBreakdownsBatch = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    rows: v.array(actionBreakdownInputValidator),
  },
  returns: v.number(),
  handler: async (ctx, { workspaceId, rows }) => {
    const now = Date.now();
    let written = 0;

    for (const row of rows) {
      const existing = await ctx.db
        .query("adActionBreakdown")
        .withIndex("by_upsert_key", (q) =>
          q
            .eq("adId", row.adId)
            .eq("date", row.date)
            .eq("breakdownHash", row.breakdownHash)
            .eq("actionType", row.actionType)
            .eq("window", row.window),
        )
        .unique();

      if (existing !== null) {
        const patchData: Record<string, unknown> = { syncedAt: now };
        if (row.count !== undefined) patchData.count = row.count;
        if (row.value !== undefined) patchData.value = row.value;
        if (row.costPer !== undefined) patchData.costPer = row.costPer;
        await ctx.db.patch(existing._id, patchData);
      } else {
        await ctx.db.insert("adActionBreakdown", {
          workspaceId,
          adId: row.adId,
          date: row.date,
          breakdownHash: row.breakdownHash,
          actionType: row.actionType,
          window: row.window,
          count: row.count,
          value: row.value,
          costPer: row.costPer,
          syncedAt: now,
        });
      }
      written++;
    }

    return written;
  },
});

/**
 * Migracija: uklanja zaostala polja hookRate i holdRate iz adInsights dokumenata (MA2).
 * Patchuje postojeće redove postavljanjem polja na undefined, bez brisanja redova.
 */
export const removeLegacyRatesMigration = internalMutation({
  args: {
    cursor: v.optional(v.string()),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, { cursor, batchSize = 200 }) => {
    const result = await ctx.db
      .query("adInsights")
      .paginate({ cursor: cursor ?? null, numItems: batchSize });

    let patched = 0;
    for (const row of result.page) {
      const raw = row as unknown as Record<string, unknown>;
      if ("hookRate" in raw || "holdRate" in raw) {
        await ctx.db.patch(
          row._id,
          {
            hookRate: undefined,
            holdRate: undefined,
          } as unknown as Record<string, unknown>,
        );
        patched++;
      }
    }

    return {
      patched,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
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

export const getAccountCurrency = query({
  args: {
    accountId: v.optional(v.union(v.id("adAccounts"), v.string())),
  },
  handler: async (ctx, { accountId }) => {
    if (!accountId) return null;
    const { workspaceId } = await requireMembership(ctx);

    try {
      const byId = await ctx.db.get(accountId as Id<"adAccounts">);
      if (byId && byId.workspaceId === workspaceId) {
        return byId.currency || null;
      }
    } catch {
      // not a valid convex Id, fallback to externalId
    }

    const byExt = await ctx.db
      .query("adAccounts")
      .withIndex("by_workspace_external", (q) =>
        q.eq("workspaceId", workspaceId).eq("externalId", accountId),
      )
      .unique();

    if (byExt) {
      return byExt.currency || null;
    }

    return null;
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
    let totalClicks = 0;
    let totalReach: number | undefined;
    let totalResults: number | undefined;
    let totalConversionValue: number | undefined;

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
        let clicks = 0;
        let reach: number | undefined;
        let results: number | undefined;
        let conversionValue: number | undefined;
        let video3s: number | undefined;
        let thruplay: number | undefined;

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
              clicks += row.clicks;
              if (row.reach !== undefined) reach = (reach ?? 0) + row.reach;
              if (row.results !== undefined) results = (results ?? 0) + row.results;
              if (row.conversionValue !== undefined) conversionValue = (conversionValue ?? 0) + row.conversionValue;
              if (row.video3s !== undefined) video3s = (video3s ?? 0) + row.video3s;
              if (row.thruplay !== undefined) thruplay = (thruplay ?? 0) + row.thruplay;

              const currentDaily = dailySpendMap.get(row.date) ?? 0;
              dailySpendMap.set(row.date, currentDaily + row.spend);
            }
          }
        }

        totalSpend += spend;
        totalImpressions += impressions;
        totalClicks += clicks;
        if (reach !== undefined) totalReach = (totalReach ?? 0) + reach;
        if (results !== undefined) totalResults = (totalResults ?? 0) + results;
        if (conversionValue !== undefined) totalConversionValue = (totalConversionValue ?? 0) + conversionValue;

        const ctr = impressions > 0 ? clicks / impressions : 0;
        const cpc = clicks > 0 ? spend / clicks : 0;
        const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
        const frequency = reach !== undefined && reach > 0 ? impressions / reach : 1;
        const costPerResult = deriveRate(spend, results);
        const roas = deriveRate(conversionValue, spend);
        const hasConversionValue = conversionValue !== undefined && conversionValue > 0;

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
          currency: account?.currency,
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
          conversionValue: conversionValue !== undefined ? Number(conversionValue.toFixed(2)) : undefined,
          costPerResult: costPerResult !== undefined ? Number(costPerResult.toFixed(2)) : undefined,
          roas: roas !== undefined ? Number(roas.toFixed(2)) : undefined,
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
    const overallCpa = deriveRate(totalSpend, totalResults);
    const overallRoas = deriveRate(totalConversionValue, totalSpend);
    const overallFrequency = totalReach !== undefined && totalReach > 0 ? totalImpressions / totalReach : 1;

    // Resolve unified workspace currency if all accounts share same currency
    const uniqueCurrencies = Array.from(
      new Set(accounts.map((a) => a.currency).filter(Boolean)),
    );
    const resolvedTotalsCurrency =
      uniqueCurrencies.length === 1 ? uniqueCurrencies[0] : undefined;

    return {
      campaigns: campaignRows,
      totals: {
        totalSpend: Number(totalSpend.toFixed(2)),
        totalImpressions,
        totalClicks,
        totalResults,
        totalConversionValue: totalConversionValue !== undefined ? Number(totalConversionValue.toFixed(2)) : undefined,
        overallCpa: overallCpa !== undefined ? Number(overallCpa.toFixed(2)) : undefined,
        overallRoas: overallRoas !== undefined ? Number(overallRoas.toFixed(2)) : undefined,
        hasConversionValue: totalConversionValue !== undefined && totalConversionValue > 0,
        overallCtr: Number(overallCtr.toFixed(4)),
        overallFrequency: Number(overallFrequency.toFixed(2)),
        campaignsCount: campaigns.length,
        currency: resolvedTotalsCurrency,
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
    let campClicks = 0;
    let campReach: number | undefined;
    let campResults: number | undefined;
    let campConversionValue: number | undefined;
    let campVideo3s: number | undefined;
    let campThruplay: number | undefined;

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
        let setClicks = 0;
        let setReach: number | undefined;
        let setResults: number | undefined;
        let setConversionValue: number | undefined;
        let setVideo3s: number | undefined;
        let setThruplay: number | undefined;

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
            let adClicks = 0;
            let adReach: number | undefined;
            let adResultsCount: number | undefined;
            let adConversionValue: number | undefined;
            let adVideo3s: number | undefined;
            let adThruplay: number | undefined;
            let qualityRanking = ad.status;
            let engagementRanking: string | undefined;
            let conversionRanking: string | undefined;

            const dailySpendMap = new Map<string, number>();
            for (const d of dateKeys) dailySpendMap.set(d, 0);

            for (const row of insights) {
              if (row.breakdownHash === "none" && row.hour === undefined) {
                adSpend += row.spend;
                adImpressions += row.impressions;
                adClicks += row.clicks;
                if (row.reach !== undefined) adReach = (adReach ?? 0) + row.reach;
                if (row.results !== undefined) adResultsCount = (adResultsCount ?? 0) + row.results;
                if (row.conversionValue !== undefined) adConversionValue = (adConversionValue ?? 0) + row.conversionValue;
                if (row.video3s !== undefined) adVideo3s = (adVideo3s ?? 0) + row.video3s;
                if (row.thruplay !== undefined) adThruplay = (adThruplay ?? 0) + row.thruplay;

                if (row.qualityRanking) qualityRanking = row.qualityRanking;
                if (row.engagementRanking) engagementRanking = row.engagementRanking;
                if (row.conversionRanking) conversionRanking = row.conversionRanking;

                const cur = dailySpendMap.get(row.date) ?? 0;
                dailySpendMap.set(row.date, cur + row.spend);
              }
            }

            setSpend += adSpend;
            setImpressions += adImpressions;
            setClicks += adClicks;
            if (adReach !== undefined) setReach = (setReach ?? 0) + adReach;
            if (adResultsCount !== undefined) setResults = (setResults ?? 0) + adResultsCount;
            if (adConversionValue !== undefined) setConversionValue = (setConversionValue ?? 0) + adConversionValue;
            if (adVideo3s !== undefined) setVideo3s = (setVideo3s ?? 0) + adVideo3s;
            if (adThruplay !== undefined) setThruplay = (setThruplay ?? 0) + adThruplay;

            const adCtr = adImpressions > 0 ? adClicks / adImpressions : 0;
            const adCpc = adClicks > 0 ? adSpend / adClicks : 0;
            const adCpm = adImpressions > 0 ? (adSpend / adImpressions) * 1000 : 0;
            const adFrequency = adReach !== undefined && adReach > 0 ? adImpressions / adReach : 1;
            const adCpa = deriveRate(adSpend, adResultsCount);
            const adRoas = deriveRate(adConversionValue, adSpend);
            const hookRate = deriveRate(adVideo3s, adImpressions);
            const holdRate = deriveRate(adThruplay, adVideo3s);

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
              conversionValue: adConversionValue !== undefined ? Number(adConversionValue.toFixed(2)) : undefined,
              costPerResult: adCpa !== undefined ? Number(adCpa.toFixed(2)) : undefined,
              roas: adRoas !== undefined ? Number(adRoas.toFixed(2)) : undefined,
              hasConversionValue: adConversionValue !== undefined && adConversionValue > 0,
              ctr: Number(adCtr.toFixed(4)),
              cpc: Number(adCpc.toFixed(2)),
              cpm: Number(adCpm.toFixed(2)),
              frequency: Number(adFrequency.toFixed(2)),
              video3s: adVideo3s,
              thruplay: adThruplay,
              hookRate: hookRate !== undefined ? Number(hookRate.toFixed(4)) : undefined,
              holdRate: holdRate !== undefined ? Number(holdRate.toFixed(4)) : undefined,
              qualityRanking,
              engagementRanking,
              conversionRanking,
              dailySpend,
            };
          }),
        );

        campSpend += setSpend;
        campImpressions += setImpressions;
        campClicks += setClicks;
        if (setReach !== undefined) campReach = (campReach ?? 0) + setReach;
        if (setResults !== undefined) campResults = (campResults ?? 0) + setResults;
        if (setConversionValue !== undefined) campConversionValue = (campConversionValue ?? 0) + setConversionValue;
        if (setVideo3s !== undefined) campVideo3s = (campVideo3s ?? 0) + setVideo3s;
        if (setThruplay !== undefined) campThruplay = (campThruplay ?? 0) + setThruplay;

        const setCtr = setImpressions > 0 ? setClicks / setImpressions : 0;
        const setCpa = deriveRate(setSpend, setResults);
        const setRoas = deriveRate(setConversionValue, setSpend);
        const setFrequency = setReach !== undefined && setReach > 0 ? setImpressions / setReach : 1;

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
          conversionValue: setConversionValue !== undefined ? Number(setConversionValue.toFixed(2)) : undefined,
          costPerResult: setCpa !== undefined ? Number(setCpa.toFixed(2)) : undefined,
          roas: setRoas !== undefined ? Number(setRoas.toFixed(2)) : undefined,
          hasConversionValue: setConversionValue !== undefined && setConversionValue > 0,
          ctr: Number(setCtr.toFixed(4)),
          frequency: Number(setFrequency.toFixed(2)),
          ads: adResults,
        };
      }),
    );

    const campCtr = campImpressions > 0 ? campClicks / campImpressions : 0;
    const campCpa = deriveRate(campSpend, campResults);
    const campRoas = deriveRate(campConversionValue, campSpend);
    const campFrequency = campReach !== undefined && campReach > 0 ? campImpressions / campReach : 1;

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
        conversionValue: campConversionValue !== undefined ? Number(campConversionValue.toFixed(2)) : undefined,
        costPerResult: campCpa !== undefined ? Number(campCpa.toFixed(2)) : undefined,
        roas: campRoas !== undefined ? Number(campRoas.toFixed(2)) : undefined,
        hasConversionValue: campConversionValue !== undefined && campConversionValue > 0,
        ctr: Number(campCtr.toFixed(4)),
        frequency: Number(campFrequency.toFixed(2)),
        video3s: campVideo3s,
        thruplay: campThruplay,
        currency: account?.currency,
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
    let reach: number | undefined;
    let clicks = 0;
    let uniqueCtrSum = 0;
    let uniqueCtrCount = 0;
    let cppSum = 0;
    let cppCount = 0;
    let video3s: number | undefined;
    let thruplay: number | undefined;
    let videoP25: number | undefined;
    let videoP50: number | undefined;
    let videoP75: number | undefined;
    let videoP95: number | undefined;
    let videoP100: number | undefined;
    let outboundCtrSum = 0;
    let outboundCtrCount = 0;
    let results: number | undefined;
    let conversionValue: number | undefined;
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
        clicks += row.clicks;
        if (row.reach !== undefined) reach = (reach ?? 0) + row.reach;
        if (row.results !== undefined) results = (results ?? 0) + row.results;
        if (row.conversionValue !== undefined) conversionValue = (conversionValue ?? 0) + row.conversionValue;
        if (row.video3s !== undefined) video3s = (video3s ?? 0) + row.video3s;
        if (row.thruplay !== undefined) thruplay = (thruplay ?? 0) + row.thruplay;
        if (row.videoP25 !== undefined) videoP25 = (videoP25 ?? 0) + row.videoP25;
        if (row.videoP50 !== undefined) videoP50 = (videoP50 ?? 0) + row.videoP50;
        if (row.videoP75 !== undefined) videoP75 = (videoP75 ?? 0) + row.videoP75;
        if (row.videoP95 !== undefined) videoP95 = (videoP95 ?? 0) + row.videoP95;
        if (row.videoP100 !== undefined) videoP100 = (videoP100 ?? 0) + row.videoP100;

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
          if (row.results !== undefined) dayEntry.results = (dayEntry.results ?? 0) + row.results;
          if (row.video3s !== undefined) dayEntry.video3s = (dayEntry.video3s ?? 0) + row.video3s;
          if (row.thruplay !== undefined) dayEntry.thruplay = (dayEntry.thruplay ?? 0) + row.thruplay;
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
          if (row.results !== undefined) entry.results = (entry.results ?? 0) + row.results;
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
          if (row.results !== undefined) genderEntry.results += row.results;
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
          if (row.results !== undefined) entry.results += row.results;
          placementData.set(key, entry);
        }
      }
    }

    const ctr = impressions > 0 ? clicks / impressions : 0;
    const cpc = clicks > 0 ? spend / clicks : 0;
    const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
    const frequency = reach !== undefined && reach > 0 ? impressions / reach : 1;
    const costPerResult = deriveRate(spend, results);
    const roas = deriveRate(conversionValue, spend);
    const hookRate = deriveRate(video3s, impressions);
    const holdRate = deriveRate(thruplay, video3s);
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
      const pCpa = deriveRate(p.spend, p.results);
      return {
        placement: p.placement,
        platform: p.platform,
        spend: Number(p.spend.toFixed(2)),
        impressions: p.impressions,
        clicks: p.clicks,
        results: p.results,
        ctr: Number(pCtr.toFixed(4)),
        cpc: Number(pCpc.toFixed(2)),
        cpa: pCpa !== undefined ? Number(pCpa.toFixed(2)) : undefined,
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
        costPerResult: costPerResult !== undefined ? Number(costPerResult.toFixed(2)) : undefined,
        conversionValue: conversionValue !== undefined ? Number(conversionValue.toFixed(2)) : undefined,
        roas: roas !== undefined ? Number(roas.toFixed(2)) : undefined,
        hasConversionValue: conversionValue !== undefined && conversionValue > 0,
        outboundCtr: outboundCtr ? Number(outboundCtr.toFixed(4)) : undefined,
      },
      videoFunnel: {
        impressions,
        video3s,
        thruplay,
        hookRate: hookRate !== undefined ? Number(hookRate.toFixed(4)) : undefined,
        holdRate: holdRate !== undefined ? Number(holdRate.toFixed(4)) : undefined,
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
      currency: account?.currency,
      accountId: account?._id,
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

    const account = await ctx.db.get(campaign.accountId);

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
        let clicks = 0;
        let reach: number | undefined;
        let results: number | undefined;
        let conversionValue: number | undefined;
        let video3s: number | undefined;
        let thruplay: number | undefined;
        let videoP25: number | undefined;
        let videoP50: number | undefined;
        let videoP75: number | undefined;
        let videoP95: number | undefined;
        let videoP100: number | undefined;

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
            clicks += row.clicks;
            if (row.reach !== undefined) reach = (reach ?? 0) + row.reach;
            if (row.results !== undefined) results = (results ?? 0) + row.results;
            if (row.conversionValue !== undefined) conversionValue = (conversionValue ?? 0) + row.conversionValue;
            if (row.video3s !== undefined) video3s = (video3s ?? 0) + row.video3s;
            if (row.thruplay !== undefined) thruplay = (thruplay ?? 0) + row.thruplay;
            if (row.videoP25 !== undefined) videoP25 = (videoP25 ?? 0) + row.videoP25;
            if (row.videoP50 !== undefined) videoP50 = (videoP50 ?? 0) + row.videoP50;
            if (row.videoP75 !== undefined) videoP75 = (videoP75 ?? 0) + row.videoP75;
            if (row.videoP95 !== undefined) videoP95 = (videoP95 ?? 0) + row.videoP95;
            if (row.videoP100 !== undefined) videoP100 = (videoP100 ?? 0) + row.videoP100;

            const curSpend = dailySpendMap.get(row.date) ?? 0;
            dailySpendMap.set(row.date, curSpend + row.spend);

            const curHook = dailyHookMap.get(row.date) ?? { video3s: 0, impressions: 0 };
            dailyHookMap.set(row.date, {
              video3s: curHook.video3s + (row.video3s ?? 0),
              impressions: curHook.impressions + row.impressions,
            });
          }
        }

        const ctr = impressions > 0 ? clicks / impressions : 0;
        const cpc = clicks > 0 ? spend / clicks : 0;
        const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
        const frequency = reach !== undefined && reach > 0 ? impressions / reach : 1;
        const costPerResult = deriveRate(spend, results);
        const roas = deriveRate(conversionValue, spend);
        const hookRate = deriveRate(video3s, impressions);
        const holdRate = deriveRate(thruplay, video3s);

        // Retention checkpoints relative to video3s (or impressions if video3s undefined)
        const p25Pct = video3s !== undefined && video3s > 0 && videoP25 !== undefined ? videoP25 / video3s : (impressions > 0 && videoP25 !== undefined ? videoP25 / impressions : 0);
        const p50Pct = video3s !== undefined && video3s > 0 && videoP50 !== undefined ? videoP50 / video3s : (impressions > 0 && videoP50 !== undefined ? videoP50 / impressions : 0);
        const p75Pct = video3s !== undefined && video3s > 0 && videoP75 !== undefined ? videoP75 / video3s : (impressions > 0 && videoP75 !== undefined ? videoP75 / impressions : 0);
        const p100Pct = video3s !== undefined && video3s > 0 && videoP100 !== undefined ? videoP100 / video3s : (impressions > 0 && videoP100 !== undefined ? videoP100 / impressions : 0);

        const dailySeries = dateKeys.map((date) => {
          const hookData = dailyHookMap.get(date) ?? { video3s: 0, impressions: 0 };
          const dayHookRate = deriveRate(hookData.video3s, hookData.impressions);
          return {
            date,
            spend: Number((dailySpendMap.get(date) ?? 0).toFixed(2)),
            hookRate: dayHookRate !== undefined ? Number(dayHookRate.toFixed(4)) : undefined,
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
          conversionValue: conversionValue !== undefined ? Number(conversionValue.toFixed(2)) : undefined,
          costPerResult: costPerResult !== undefined ? Number(costPerResult.toFixed(2)) : undefined,
          roas: roas !== undefined ? Number(roas.toFixed(2)) : undefined,
          hasConversionValue: conversionValue !== undefined && conversionValue > 0,
          ctr: Number(ctr.toFixed(4)),
          cpc: Number(cpc.toFixed(2)),
          cpm: Number(cpm.toFixed(2)),
          frequency: Number(frequency.toFixed(2)),
          video3s,
          thruplay,
          hookRate: hookRate !== undefined ? Number(hookRate.toFixed(4)) : undefined,
          holdRate: holdRate !== undefined ? Number(holdRate.toFixed(4)) : undefined,
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
        accountId: campaign.accountId,
      },
      currency: account?.currency,
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
      const patchData: Record<string, unknown> = {
        pinnedAt: Date.now(),
      };
      if (name !== undefined) patchData.name = name;
      await ctx.db.patch(existing._id, patchData);
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

// ── Kvota i backfill (MA1) ───────────────────────────────────────────────────

const quotaReadingValidator = v.object({
  callCount: v.optional(v.number()),
  totalCpuTime: v.optional(v.number()),
  totalTime: v.optional(v.number()),
  appIdUtilPct: v.optional(v.number()),
  accIdUtilPct: v.optional(v.number()),
});

/**
 * Upiši poslednje očitavanje oba zaglavlja kvote. Jedan red po workspace-u.
 *
 * Polja koja nisu stigla ostaju `undefined` — nula bi značila „prazno, ima
 * mesta”, a to očitavanje nije reklo.
 */
export const recordQuota = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    reading: quotaReadingValidator,
    tier: v.optional(v.string()),
    /** estimated_time_to_regain_access, u MINUTIMA. */
    regainMinutes: v.optional(v.number()),
    fetchedAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, { workspaceId, reading, tier, regainMinutes, fetchedAt }) => {
    const peakPct = quotaPeak(reading);
    // Blokada koju je Meta izričito najavila nadjačava procente: dok traje,
    // kapija je "stop" i kad procenti izgledaju pitomo.
    const blockedUntil =
      regainMinutes !== undefined && regainMinutes > 0
        ? fetchedAt + regainMinutes * 60_000
        : undefined;
    const state = blockedUntil !== undefined ? "stop" : determineGateState(peakPct);

    const existing = await ctx.db
      .query("metaAdsQuota")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .unique();

    const data: Record<string, unknown> = {
      workspaceId,
      fetchedAt,
      peakPct,
      state: state as "ok" | "warn" | "stop",
    };
    if (reading.callCount !== undefined) data.callCount = reading.callCount;
    if (reading.totalCpuTime !== undefined) data.totalCpuTime = reading.totalCpuTime;
    if (reading.totalTime !== undefined) data.totalTime = reading.totalTime;
    if (reading.appIdUtilPct !== undefined) data.appIdUtilPct = reading.appIdUtilPct;
    if (reading.accIdUtilPct !== undefined) data.accIdUtilPct = reading.accIdUtilPct;
    // Sloj se menja tek posle App Review-a: staro očitavanje je bolje od
    // brisanja podatka kad ga jedan odgovor nije poslao.
    if (tier !== undefined) {
      data.tier = tier;
    } else if (existing?.tier !== undefined) {
      data.tier = existing.tier;
    }
    if (regainMinutes !== undefined) data.regainMinutes = regainMinutes;
    if (blockedUntil !== undefined) data.blockedUntil = blockedUntil;

    if (existing !== null) {
      await ctx.db.patch(existing._id, data);
    } else {
      await ctx.db.insert("metaAdsQuota", {
        workspaceId,
        fetchedAt,
        peakPct,
        state,
        callCount: reading.callCount,
        totalCpuTime: reading.totalCpuTime,
        totalTime: reading.totalTime,
        appIdUtilPct: reading.appIdUtilPct,
        accIdUtilPct: reading.accIdUtilPct,
        tier: tier,
        regainMinutes,
        blockedUntil,
      });
    }
    return null;
  },
});

const quotaGateValidator = v.object({
  state: v.union(v.literal("ok"), v.literal("warn"), v.literal("stop")),
  peakPct: v.number(),
  stale: v.boolean(),
  fetchedAt: v.optional(v.number()),
  blockedUntil: v.optional(v.number()),
  tier: v.optional(v.string()),
});

/**
 * Kapija kvote za workspace. Prima `now` spolja jer upiti ne čitaju sat.
 *
 * TTL je sat vremena: BUC procenti opisuju klizajući sat, pa starije očitavanje
 * ne govori ni o čemu što još traje. Blokada sa `blockedUntil` je izuzetak —
 * ona važi do svog trenutka bez obzira na TTL.
 */
export const getQuotaGate = internalQuery({
  args: { workspaceId: v.id("workspaces"), now: v.number() },
  returns: quotaGateValidator,
  handler: async (ctx, { workspaceId, now }) => {
    const row = await ctx.db
      .query("metaAdsQuota")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .unique();

    if (row === null) {
      return { state: "ok" as const, peakPct: 0, stale: true };
    }

    if (row.blockedUntil !== undefined && row.blockedUntil > now) {
      return {
        state: "stop" as const,
        peakPct: row.peakPct,
        stale: false,
        fetchedAt: row.fetchedAt,
        blockedUntil: row.blockedUntil,
        tier: row.tier,
      };
    }

    if (now - row.fetchedAt > QUOTA_TTL_MS) {
      return {
        state: "ok" as const,
        peakPct: 0,
        stale: true,
        fetchedAt: row.fetchedAt,
        tier: row.tier,
      };
    }

    return {
      state: determineGateState(row.peakPct),
      peakPct: row.peakPct,
      stale: false,
      fetchedAt: row.fetchedAt,
      tier: row.tier,
    };
  },
});

/** Dokle je backfill stigao za jedan scope; undefined pre prvog prolaza. */
export const getBackfill = internalQuery({
  args: { workspaceId: v.id("workspaces"), scope: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      oldestSyncedDate: v.string(),
      completedAt: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, { workspaceId, scope }) => {
    const row = await ctx.db
      .query("metaAdsBackfill")
      .withIndex("by_workspace_scope", (q) =>
        q.eq("workspaceId", workspaceId).eq("scope", scope),
      )
      .unique();
    if (row === null) return null;
    return {
      oldestSyncedDate: row.oldestSyncedDate,
      completedAt: row.completedAt,
    };
  },
});

/**
 * Pomeri backfill nazad za jedan scope.
 *
 * Piše se TEK kad su redovi upisani: prolaz koji je pao ne sme da preskoči
 * dane koje nikada nije doneo. `oldestSyncedDate` se pomera samo unazad, osim
 * kad plan izričito započne nov krug (`restarted`).
 */
export const advanceBackfill = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    scope: v.string(),
    oldestSyncedDate: v.string(),
    complete: v.boolean(),
    restarted: v.boolean(),
  },
  returns: v.null(),
  handler: async (
    ctx,
    { workspaceId, scope, oldestSyncedDate, complete, restarted },
  ) => {
    const existing = await ctx.db
      .query("metaAdsBackfill")
      .withIndex("by_workspace_scope", (q) =>
        q.eq("workspaceId", workspaceId).eq("scope", scope),
      )
      .unique();

    const completedAt = complete ? Date.now() : undefined;

    if (existing === null) {
      await ctx.db.insert("metaAdsBackfill", {
        workspaceId,
        scope,
        oldestSyncedDate,
        completedAt,
      });
      return null;
    }

    const goesDeeper = oldestSyncedDate < existing.oldestSyncedDate;
    // Nov krug ponistava zavrsetak prethodnog: bez ovoga red zauvek tvrdi da je
    // 28 dana pokriveno i kad je krug tek na sedmom danu.
    const nextCompletedAt = complete
      ? completedAt
      : restarted
        ? undefined
        : existing.completedAt;
    await ctx.db.patch(existing._id, {
      oldestSyncedDate:
        restarted || goesDeeper ? oldestSyncedDate : existing.oldestSyncedDate,
      completedAt: nextCompletedAt,
    });
    return null;
  },
});

/**
 * Stanje kvote za Sync Health widget.
 *
 * Vraća `null` dok nijedan poziv nije prošao — widget tada ćuti umesto da
 * prikaže nulu koju niko nije izmerio.
 */
export const quotaStatus = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      state: v.union(v.literal("ok"), v.literal("warn"), v.literal("stop")),
      peakPct: v.number(),
      fetchedAt: v.number(),
      tier: v.optional(v.string()),
      blockedUntil: v.optional(v.number()),
      callCount: v.optional(v.number()),
      totalCpuTime: v.optional(v.number()),
      totalTime: v.optional(v.number()),
      appIdUtilPct: v.optional(v.number()),
      accIdUtilPct: v.optional(v.number()),
    }),
  ),
  handler: async (ctx) => {
    const { workspaceId } = await requireMembership(ctx);
    const row = await ctx.db
      .query("metaAdsQuota")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .unique();
    if (row === null) return null;

    // Bez `Date.now()`: rezultat upita se kesira i ponovo racuna tek kad se red
    // promeni, pa bi izvedeni "stale"/"blokirano" ostali zamrznuti na vrednosti
    // iz trenutka upisa. Klijent ima sat; ovde idu samo cinjenice iz reda.
    return {
      state: row.state,
      peakPct: row.peakPct,
      fetchedAt: row.fetchedAt,
      tier: row.tier,
      blockedUntil: row.blockedUntil,
      callCount: row.callCount,
      totalCpuTime: row.totalCpuTime,
      totalTime: row.totalTime,
      appIdUtilPct: row.appIdUtilPct,
      accIdUtilPct: row.accIdUtilPct,
    };
  },
});

// ── Custom & Lookalike Audiences ────────────────────────────────────────────

export const audienceInputValidator = v.object({
  audienceId: v.string(),
  name: v.string(),
  subtype: v.string(),
  description: v.optional(v.string()),
  approximateCountLower: v.optional(v.number()),
  approximateCountUpper: v.optional(v.number()),
  operationStatus: v.optional(v.string()),
  deliveryStatus: v.optional(v.string()),
  timeContentUpdated: v.optional(v.number()),
  retentionDays: v.optional(v.number()),
  ruleAggregation: v.optional(v.string()),
});

/**
 * Batch upsert Meta Custom & Lookalike audiences.
 * Follows Rule 1 (no 0 for undefined) and Rule 4 (defined keys only in patch).
 */
export const upsertAudiencesBatch = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    adAccountId: v.id("adAccounts"),
    audiences: v.array(audienceInputValidator),
    syncedAt: v.number(),
  },
  returns: v.number(),
  handler: async (ctx, { workspaceId, adAccountId, audiences, syncedAt }) => {
    let written = 0;

    for (const aud of audiences) {
      const existing = await ctx.db
        .query("adAudiences")
        .withIndex("by_upsert_key", (q) =>
          q.eq("adAccountId", adAccountId).eq("audienceId", aud.audienceId),
        )
        .unique();

      if (existing !== null) {
        const patch: Record<string, unknown> = {
          name: aud.name,
          subtype: aud.subtype,
          syncedAt,
        };
        if (aud.description !== undefined) patch.description = aud.description;
        if (aud.approximateCountLower !== undefined) {
          patch.approximateCountLower = aud.approximateCountLower;
        }
        if (aud.approximateCountUpper !== undefined) {
          patch.approximateCountUpper = aud.approximateCountUpper;
        }
        if (aud.operationStatus !== undefined) {
          patch.operationStatus = aud.operationStatus;
        }
        if (aud.deliveryStatus !== undefined) {
          patch.deliveryStatus = aud.deliveryStatus;
        }
        if (aud.timeContentUpdated !== undefined) {
          patch.timeContentUpdated = aud.timeContentUpdated;
        }
        if (aud.retentionDays !== undefined) {
          patch.retentionDays = aud.retentionDays;
        }
        if (aud.ruleAggregation !== undefined) {
          patch.ruleAggregation = aud.ruleAggregation;
        }

        await ctx.db.patch(existing._id, patch);
        written++;
      } else {
        await ctx.db.insert("adAudiences", {
          workspaceId,
          adAccountId,
          audienceId: aud.audienceId,
          name: aud.name,
          subtype: aud.subtype,
          description: aud.description,
          approximateCountLower: aud.approximateCountLower,
          approximateCountUpper: aud.approximateCountUpper,
          operationStatus: aud.operationStatus,
          deliveryStatus: aud.deliveryStatus,
          timeContentUpdated: aud.timeContentUpdated,
          retentionDays: aud.retentionDays,
          ruleAggregation: aud.ruleAggregation,
          syncedAt,
        });
        written++;
      }
    }

    return written;
  },
});

/**
 * Records Terms of Service status for an ad account.
 */
export const recordAudienceTos = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    adAccountId: v.id("adAccounts"),
    status: v.union(
      v.literal("accepted"),
      v.literal("not_accepted"),
      v.literal("unknown"),
    ),
    lastError: v.optional(v.string()),
    checkedAt: v.number(),
  },
  returns: v.null(),
  handler: async (
    ctx,
    { workspaceId, adAccountId, status, lastError, checkedAt },
  ) => {
    const existing = await ctx.db
      .query("metaAudienceTos")
      .withIndex("by_account", (q) => q.eq("adAccountId", adAccountId))
      .unique();

    const fields: {
      status: "accepted" | "not_accepted" | "unknown";
      checkedAt: number;
      lastError?: string;
    } = {
      status,
      checkedAt,
    };
    if (lastError !== undefined) {
      fields.lastError = lastError;
    }

    if (existing !== null) {
      await ctx.db.patch(existing._id, fields);
    } else {
      await ctx.db.insert("metaAudienceTos", {
        workspaceId,
        adAccountId,
        ...fields,
      });
    }
    return null;
  },
});

/**
 * Public query for audience ToS acceptance status.
 * Rule 3: Date.now() is NOT called inside Convex query.
 * When row does not exist, returns status: "unknown" (not "not_accepted").
 */
export const getAudienceTos = query({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    adAccountId: v.optional(v.id("adAccounts")),
  },
  returns: v.object({
    status: v.union(
      v.literal("accepted"),
      v.literal("not_accepted"),
      v.literal("unknown"),
    ),
    checkedAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    adAccountId: v.optional(v.id("adAccounts")),
    accountName: v.optional(v.string()),
    externalId: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const { workspaceId } = await requireMembership(ctx);
    let account = null;
    if (args.adAccountId) {
      account = await ctx.db.get(args.adAccountId);
    } else {
      account = await ctx.db
        .query("adAccounts")
        .withIndex("by_workspace_provider", (q) =>
          q.eq("workspaceId", workspaceId).eq("provider", "meta_ads"),
        )
        .first();
    }
    if (!account) {
      return { status: "unknown" as const };
    }
    const tos = await ctx.db
      .query("metaAudienceTos")
      .withIndex("by_account", (q) => q.eq("adAccountId", account._id))
      .unique();
    return {
      status: (tos?.status ?? "unknown") as
        | "accepted"
        | "not_accepted"
        | "unknown",
      checkedAt: tos?.checkedAt,
      lastError: tos?.lastError,
      adAccountId: account._id,
      accountName: account.name,
      externalId: account.externalId,
    };
  },
});

/**
 * Internal query for audience ToS acceptance row.
 */
export const getAudienceTosInternal = internalQuery({
  args: {
    adAccountId: v.id("adAccounts"),
  },
  handler: async (ctx, { adAccountId }) => {
    return await ctx.db
      .query("metaAudienceTos")
      .withIndex("by_account", (q) => q.eq("adAccountId", adAccountId))
      .unique();
  },
});

/**
 * Public query listing custom and lookalike audiences for workspace.
 */
export const listAudiences = query({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    adAccountId: v.optional(v.id("adAccounts")),
  },
  handler: async (ctx, args) => {
    const { workspaceId } = await requireMembership(ctx);

    const rows = args.adAccountId
      ? await ctx.db
          .query("adAudiences")
          .withIndex("by_account", (q) => q.eq("adAccountId", args.adAccountId!))
          .collect()
      : await ctx.db
          .query("adAudiences")
          .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
          .collect();

    const sorted = rows.sort(
      (a, b) =>
        (b.timeContentUpdated ?? b.syncedAt) -
        (a.timeContentUpdated ?? a.syncedAt),
    );

    let latestSyncedAt: number | undefined;
    for (const row of rows) {
      if (latestSyncedAt === undefined || row.syncedAt > latestSyncedAt) {
        latestSyncedAt = row.syncedAt;
      }
    }

    return {
      audiences: sorted,
      count: sorted.length,
      syncedAt: latestSyncedAt,
    };
  },
});

/**
 * Internal query to fetch audience by audienceId.
 */
export const getAudienceById = internalQuery({
  args: {
    audienceId: v.string(),
    adAccountId: v.optional(v.id("adAccounts")),
  },
  handler: async (ctx, { audienceId, adAccountId }) => {
    if (adAccountId) {
      return await ctx.db
        .query("adAudiences")
        .withIndex("by_upsert_key", (q) =>
          q.eq("adAccountId", adAccountId).eq("audienceId", audienceId),
        )
        .unique();
    }
    return await ctx.db
      .query("adAudiences")
      .filter((q) => q.eq(q.field("audienceId"), audienceId))
      .first();
  },
});
