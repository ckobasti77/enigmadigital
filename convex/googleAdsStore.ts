import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireMembership } from "./lib/auth";

/**
 * ============================================================================
 * GOOGLE ADS PERSISTENCE & QUERY LAYER (V8 Runtime)
 * ============================================================================
 *
 * All writes are executed in atomic Convex mutations.
 * Upsert semantics ensure idempotency across 7-day lookback windows:
 *   - `adAccounts` upserted by natural key `[workspaceId, externalId]`
 *   - `adCampaigns` upserted by natural key `[workspaceId, externalId]`
 *   - `adSets` (Ad Groups) upserted by natural key `[workspaceId, externalId]`
 *   - `ads` (Ad Group Ads) upserted by natural key `[workspaceId, externalId]`
 *   - `adInsights` upserted by `[adId, date, breakdownHash, hour]`
 *   - `gadsKeywordQuality` upserted by `[workspaceId, keywordId, date]`
 * ============================================================================
 */

export const gadsCampaignInputValidator = v.object({
  externalId: v.string(),
  name: v.string(),
  objective: v.optional(v.string()),
  status: v.string(),
  dailyBudget: v.optional(v.number()),
  lifetimeBudget: v.optional(v.number()),
  searchImpressionShare: v.optional(v.number()),
  syncPriority: v.union(v.literal("hot"), v.literal("cold")),
});

export const gadsAdGroupInputValidator = v.object({
  externalId: v.string(),
  campaignExternalId: v.string(),
  name: v.string(),
  status: v.string(),
  targetingSummary: v.optional(v.string()),
  dailyBudget: v.optional(v.number()),
  lifetimeBudget: v.optional(v.number()),
});

export const gadsAdInputValidator = v.object({
  externalId: v.string(),
  adGroupExternalId: v.string(),
  name: v.string(),
  status: v.string(),
  creativeId: v.optional(v.string()),
  thumbnailUrl: v.optional(v.string()),
  previewUrl: v.optional(v.string()),
});

export const gadsInsightInputValidator = v.object({
  adExternalId: v.string(),
  date: v.string(),
  hour: v.optional(v.number()),
  spend: v.number(),
  impressions: v.number(),
  reach: v.number(),
  frequency: v.number(),
  clicks: v.number(),
  ctr: v.number(),
  cpc: v.number(),
  cpm: v.number(),
  results: v.number(),
  costPerResult: v.number(),
  conversionValue: v.number(),
  roas: v.number(),
  searchImpressionShare: v.optional(v.number()),
});

export const gadsKeywordQualityInputValidator = v.object({
  campaignExternalId: v.string(),
  adGroupExternalId: v.string(),
  keywordId: v.string(),
  keywordText: v.string(),
  matchType: v.string(),
  qualityScore: v.optional(v.number()),
  creativeQualityScore: v.optional(v.string()),
  postClickQualityScore: v.optional(v.string()),
  searchPredictedCtr: v.optional(v.string()),
  status: v.optional(v.string()),
  impressions: v.number(),
  clicks: v.number(),
  cost: v.number(),
  conversions: v.number(),
  date: v.string(),
});

// ── Internal Mutations ───────────────────────────────────────────────────────

/**
 * Atomically upsert Google Ads account, campaigns, ad groups, ads, insights, and keyword quality scores.
 */
export const upsertGoogleAdsData = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    account: v.object({
      externalId: v.string(),
      name: v.string(),
      currency: v.string(),
    }),
    campaigns: v.array(gadsCampaignInputValidator),
    adGroups: v.array(gadsAdGroupInputValidator),
    ads: v.array(gadsAdInputValidator),
    insights: v.array(gadsInsightInputValidator),
    keywordQuality: v.array(gadsKeywordQualityInputValidator),
  },
  returns: v.number(),
  handler: async (
    ctx,
    { workspaceId, account, campaigns, adGroups, ads, insights, keywordQuality },
  ) => {
    const now = Date.now();
    let written = 0;

    // 1. Upsert AdAccount (provider = "google_ads")
    let accountId: Id<"adAccounts">;
    const existingAccount = await ctx.db
      .query("adAccounts")
      .withIndex("by_workspace_external", (q) =>
        q.eq("workspaceId", workspaceId).eq("externalId", account.externalId),
      )
      .unique();

    if (existingAccount !== null) {
      await ctx.db.patch(existingAccount._id, {
        name: account.name,
        currency: account.currency,
        provider: "google_ads",
        syncedAt: now,
      });
      accountId = existingAccount._id;
    } else {
      accountId = await ctx.db.insert("adAccounts", {
        workspaceId,
        provider: "google_ads",
        externalId: account.externalId,
        name: account.name,
        currency: account.currency,
        syncedAt: now,
      });
    }
    written++;

    // 2. Upsert Campaigns
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
          searchImpressionShare: c.searchImpressionShare,
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
          searchImpressionShare: c.searchImpressionShare,
          syncPriority: c.syncPriority,
          syncedAt: now,
        });
        campaignIdMap.set(c.externalId, id);
      }
      written++;
    }

    // 3. Upsert AdSets (Ad Groups)
    const adGroupIdMap = new Map<string, Id<"adSets">>();
    for (const g of adGroups) {
      let campaignId = campaignIdMap.get(g.campaignExternalId);
      if (!campaignId) {
        const camp = await ctx.db
          .query("adCampaigns")
          .withIndex("by_workspace_external", (q) =>
            q.eq("workspaceId", workspaceId).eq("externalId", g.campaignExternalId),
          )
          .unique();
        if (camp) {
          campaignId = camp._id;
          campaignIdMap.set(g.campaignExternalId, campaignId);
        }
      }

      if (!campaignId) continue;

      const existing = await ctx.db
        .query("adSets")
        .withIndex("by_workspace_external", (q) =>
          q.eq("workspaceId", workspaceId).eq("externalId", g.externalId),
        )
        .unique();

      if (existing !== null) {
        await ctx.db.patch(existing._id, {
          campaignId,
          name: g.name,
          status: g.status,
          targetingSummary: g.targetingSummary,
          dailyBudget: g.dailyBudget,
          lifetimeBudget: g.lifetimeBudget,
          syncedAt: now,
        });
        adGroupIdMap.set(g.externalId, existing._id);
      } else {
        const id = await ctx.db.insert("adSets", {
          workspaceId,
          campaignId,
          externalId: g.externalId,
          name: g.name,
          status: g.status,
          targetingSummary: g.targetingSummary,
          dailyBudget: g.dailyBudget,
          lifetimeBudget: g.lifetimeBudget,
          syncedAt: now,
        });
        adGroupIdMap.set(g.externalId, id);
      }
      written++;
    }

    // 4. Upsert Ads (Ad Group Ads)
    const adIdMap = new Map<string, Id<"ads">>();
    for (const a of ads) {
      let adSetId = adGroupIdMap.get(a.adGroupExternalId);
      if (!adSetId) {
        const adSet = await ctx.db
          .query("adSets")
          .withIndex("by_workspace_external", (q) =>
            q.eq("workspaceId", workspaceId).eq("externalId", a.adGroupExternalId),
          )
          .unique();
        if (adSet) {
          adSetId = adSet._id;
          adGroupIdMap.set(a.adGroupExternalId, adSetId);
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
        adIdMap.set(a.externalId, existing._id);
      } else {
        const id = await ctx.db.insert("ads", {
          workspaceId,
          adSetId,
          externalId: a.externalId,
          name: a.name,
          status: a.status,
          creativeId: a.creativeId,
          thumbnailUrl: a.thumbnailUrl,
          previewUrl: a.previewUrl,
          syncedAt: now,
        });
        adIdMap.set(a.externalId, id);
      }
      written++;
    }

    // 5. Upsert Insights
    for (const row of insights) {
      let adId = adIdMap.get(row.adExternalId);
      if (!adId) {
        const foundAd = await ctx.db
          .query("ads")
          .withIndex("by_workspace_external", (q) =>
            q.eq("workspaceId", workspaceId).eq("externalId", row.adExternalId),
          )
          .unique();
        if (foundAd) {
          adId = foundAd._id;
          adIdMap.set(row.adExternalId, adId);
        }
      }

      if (!adId) continue;

      const existingCandidates = await ctx.db
        .query("adInsights")
        .withIndex("by_ad_date_hash", (q) =>
          q
            .eq("adId", adId!)
            .eq("date", row.date)
            .eq("breakdownHash", "none"),
        )
        .collect();
      const existing =
        existingCandidates.find((c) => c.hour === row.hour) ?? null;

      const insightData = {
        workspaceId,
        adId,
        date: row.date,
        hour: row.hour,
        breakdownHash: "none",
        spend: row.spend,
        impressions: row.impressions,
        reach: row.reach,
        frequency: row.frequency,
        clicks: row.clicks,
        ctr: row.ctr,
        cpc: row.cpc,
        cpm: row.cpm,
        video3s: 0,
        thruplay: 0,
        videoP25: 0,
        videoP50: 0,
        videoP75: 0,
        videoP100: 0,
        results: row.results,
        costPerResult: row.costPerResult,
        conversionValue: row.conversionValue,
        roas: row.roas,
        searchImpressionShare: row.searchImpressionShare,
        syncedAt: now,
      };

      if (existing !== null) {
        await ctx.db.patch(existing._id, insightData);
      } else {
        await ctx.db.insert("adInsights", insightData);
      }
      written++;
    }

    // 6. Upsert Keyword Quality Scores
    for (const kw of keywordQuality) {
      const campaignId = campaignIdMap.get(kw.campaignExternalId);
      const adGroupId = adGroupIdMap.get(kw.adGroupExternalId);

      const existing = await ctx.db
        .query("gadsKeywordQuality")
        .withIndex("by_upsert_key", (q) =>
          q
            .eq("workspaceId", workspaceId)
            .eq("keywordId", kw.keywordId)
            .eq("date", kw.date),
        )
        .unique();

      const kwData = {
        workspaceId,
        campaignId,
        campaignExternalId: kw.campaignExternalId,
        adGroupId,
        adGroupExternalId: kw.adGroupExternalId,
        keywordId: kw.keywordId,
        keywordText: kw.keywordText,
        matchType: kw.matchType,
        qualityScore: kw.qualityScore,
        creativeQualityScore: kw.creativeQualityScore,
        postClickQualityScore: kw.postClickQualityScore,
        searchPredictedCtr: kw.searchPredictedCtr,
        status: kw.status,
        impressions: kw.impressions,
        clicks: kw.clicks,
        cost: kw.cost,
        conversions: kw.conversions,
        date: kw.date,
        syncedAt: now,
      };

      if (existing !== null) {
        await ctx.db.patch(existing._id, kwData);
      } else {
        await ctx.db.insert("gadsKeywordQuality", kwData);
      }
      written++;
    }

    return written;
  },
});

// ── Public Queries ───────────────────────────────────────────────────────────

/**
 * Fetch keyword quality scores and metrics report for a campaign, ad group, or workspace.
 */
export const getKeywordQualityReport = query({
  args: {
    campaignId: v.optional(v.id("adCampaigns")),
    adGroupId: v.optional(v.id("adSets")),
    from: v.string(),
    to: v.string(),
  },
  handler: async (ctx, { campaignId, adGroupId, from, to }) => {
    const { workspaceId } = await requireMembership(ctx);

    let recordsQuery = ctx.db
      .query("gadsKeywordQuality")
      .withIndex("by_workspace_date", (q) =>
        q.eq("workspaceId", workspaceId).gte("date", from).lte("date", to),
      );

    if (campaignId) {
      recordsQuery = ctx.db
        .query("gadsKeywordQuality")
        .withIndex("by_workspace_campaign_id", (q) =>
          q.eq("workspaceId", workspaceId).eq("campaignId", campaignId),
        );
    }

    const records = await recordsQuery.collect();

    // Filter by date if queried by campaign index, and filter by adGroupId if passed
    const filtered = records.filter(
      (r) =>
        r.date >= from &&
        r.date <= to &&
        (adGroupId === undefined || r.adGroupId === adGroupId),
    );

    // Aggregate metrics per keyword
    const map = new Map<
      string,
      {
        keywordId: string;
        keywordText: string;
        matchType: string;
        qualityScore?: number;
        creativeQualityScore?: string;
        postClickQualityScore?: string;
        searchPredictedCtr?: string;
        status?: string;
        impressions: number;
        clicks: number;
        cost: number;
        conversions: number;
        samples: number;
      }
    >();

    let totalImpressions = 0;
    let totalClicks = 0;
    let totalCost = 0;
    let totalConversions = 0;
    let qualityScoreSum = 0;
    let qualityScoreCount = 0;

    for (const r of filtered) {
      totalImpressions += r.impressions;
      totalClicks += r.clicks;
      totalCost += r.cost;
      totalConversions += r.conversions;

      if (r.qualityScore && r.qualityScore > 0) {
        qualityScoreSum += r.qualityScore;
        qualityScoreCount++;
      }

      const existing = map.get(r.keywordId);
      if (existing) {
        existing.impressions += r.impressions;
        existing.clicks += r.clicks;
        existing.cost += r.cost;
        existing.conversions += r.conversions;
        existing.samples++;
        if (r.qualityScore) existing.qualityScore = r.qualityScore;
        if (r.creativeQualityScore)
          existing.creativeQualityScore = r.creativeQualityScore;
        if (r.postClickQualityScore)
          existing.postClickQualityScore = r.postClickQualityScore;
        if (r.searchPredictedCtr)
          existing.searchPredictedCtr = r.searchPredictedCtr;
      } else {
        map.set(r.keywordId, {
          keywordId: r.keywordId,
          keywordText: r.keywordText,
          matchType: r.matchType,
          qualityScore: r.qualityScore,
          creativeQualityScore: r.creativeQualityScore,
          postClickQualityScore: r.postClickQualityScore,
          searchPredictedCtr: r.searchPredictedCtr,
          status: r.status,
          impressions: r.impressions,
          clicks: r.clicks,
          cost: r.cost,
          conversions: r.conversions,
          samples: 1,
        });
      }
    }

    const keywords = Array.from(map.values()).map((k) => ({
      keywordId: k.keywordId,
      keywordText: k.keywordText,
      matchType: k.matchType,
      qualityScore: k.qualityScore,
      creativeQualityScore: k.creativeQualityScore,
      postClickQualityScore: k.postClickQualityScore,
      searchPredictedCtr: k.searchPredictedCtr,
      status: k.status,
      impressions: k.impressions,
      clicks: k.clicks,
      cost: Number(k.cost.toFixed(2)),
      conversions: k.conversions,
      ctr: k.impressions > 0 ? Number((k.clicks / k.impressions).toFixed(4)) : 0,
      cpc: k.clicks > 0 ? Number((k.cost / k.clicks).toFixed(2)) : 0,
    }));

    keywords.sort((a, b) => b.impressions - a.impressions);

    const averageQualityScore =
      qualityScoreCount > 0
        ? Number((qualityScoreSum / qualityScoreCount).toFixed(1))
        : null;

    return {
      keywords,
      totals: {
        totalKeywords: keywords.length,
        totalImpressions,
        totalClicks,
        totalCost: Number(totalCost.toFixed(2)),
        totalConversions,
        averageQualityScore,
        overallCtr:
          totalImpressions > 0
            ? Number((totalClicks / totalImpressions).toFixed(4))
            : 0,
      },
    };
  },
});

// ── Synthetic Seeding & Testing Mutations ────────────────────────────────────

/**
 * Seed realistic synthetic Google Ads data for verification and testing.
 */
export const seedGoogleAdsData = mutation({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
  },
  handler: async (ctx, args) => {
    let workspaceId: Id<"workspaces">;
    if (args.workspaceId) {
      workspaceId = args.workspaceId;
    } else {
      const membership = await requireMembership(ctx);
      workspaceId = membership.workspaceId;
    }

    const now = Date.now();
    const accountExternalId = "seed_gads_act_8921";

    // 1. Account
    const existingAccount = await ctx.db
      .query("adAccounts")
      .withIndex("by_workspace_external", (q) =>
        q.eq("workspaceId", workspaceId).eq("externalId", accountExternalId),
      )
      .unique();

    let accountId: Id<"adAccounts">;
    if (existingAccount) {
      accountId = existingAccount._id;
    } else {
      accountId = await ctx.db.insert("adAccounts", {
        workspaceId,
        provider: "google_ads",
        externalId: accountExternalId,
        name: "Enigma IT Search & Performance Max",
        currency: "EUR",
        syncedAt: now,
      });
    }

    // 2. Campaigns
    const seedCampaigns = [
      {
        externalId: "gads_camp_search_leadgen",
        name: "Search — Custom Software & Web Dev RS",
        objective: "LEADS",
        status: "ACTIVE",
        dailyBudget: 45,
        searchImpressionShare: 0.74,
        syncPriority: "hot" as const,
      },
      {
        externalId: "gads_camp_pmax_solutions",
        name: "Performance Max — Digital Transformation B2B",
        objective: "SALES",
        status: "ACTIVE",
        dailyBudget: 35,
        searchImpressionShare: 0.62,
        syncPriority: "cold" as const,
      },
      {
        externalId: "gads_camp_brand_defense",
        name: "Search — Enigma IT Brand Defense",
        objective: "TRAFFIC",
        status: "ACTIVE",
        dailyBudget: 15,
        searchImpressionShare: 0.96,
        syncPriority: "cold" as const,
      },
    ];

    const campaignIdMap = new Map<string, Id<"adCampaigns">>();
    for (const c of seedCampaigns) {
      const existing = await ctx.db
        .query("adCampaigns")
        .withIndex("by_workspace_external", (q) =>
          q.eq("workspaceId", workspaceId).eq("externalId", c.externalId),
        )
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, {
          accountId,
          name: c.name,
          objective: c.objective,
          status: c.status,
          dailyBudget: c.dailyBudget,
          searchImpressionShare: c.searchImpressionShare,
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
          searchImpressionShare: c.searchImpressionShare,
          syncPriority: c.syncPriority,
          syncedAt: now,
        });
        campaignIdMap.set(c.externalId, id);
      }
    }

    // 3. Ad Groups
    const seedAdGroups = [
      {
        externalId: "gads_ag_web_dev",
        campaignExternalId: "gads_camp_search_leadgen",
        name: "Izrada Web Aplikacija & Portala",
        status: "ENABLED",
        dailyBudget: 25,
      },
      {
        externalId: "gads_ag_custom_software",
        campaignExternalId: "gads_camp_search_leadgen",
        name: "Namenski Softver & Automatizacija",
        status: "ENABLED",
        dailyBudget: 20,
      },
      {
        externalId: "gads_ag_brand_exact",
        campaignExternalId: "gads_camp_brand_defense",
        name: "Enigma IT Brend Ključne Reči",
        status: "ENABLED",
        dailyBudget: 15,
      },
    ];

    const adGroupIdMap = new Map<string, Id<"adSets">>();
    for (const g of seedAdGroups) {
      const campaignId = campaignIdMap.get(g.campaignExternalId);
      if (!campaignId) continue;

      const existing = await ctx.db
        .query("adSets")
        .withIndex("by_workspace_external", (q) =>
          q.eq("workspaceId", workspaceId).eq("externalId", g.externalId),
        )
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, {
          campaignId,
          name: g.name,
          status: g.status,
          dailyBudget: g.dailyBudget,
          syncedAt: now,
        });
        adGroupIdMap.set(g.externalId, existing._id);
      } else {
        const id = await ctx.db.insert("adSets", {
          workspaceId,
          campaignId,
          externalId: g.externalId,
          name: g.name,
          status: g.status,
          dailyBudget: g.dailyBudget,
          syncedAt: now,
        });
        adGroupIdMap.set(g.externalId, id);
      }
    }

    // 4. Ads (Responsive Search Ads)
    const seedAds = [
      {
        externalId: "gads_ad_rsa_web_1",
        adGroupExternalId: "gads_ag_web_dev",
        name: "RSA — Premium Web Razvoj & Next.js",
        status: "ACTIVE",
        previewUrl: "https://digital.enigmait.rs",
      },
      {
        externalId: "gads_ad_rsa_software_1",
        adGroupExternalId: "gads_ag_custom_software",
        name: "RSA — Skalabilna Softverska Rešenja",
        status: "ACTIVE",
        previewUrl: "https://digital.enigmait.rs",
      },
      {
        externalId: "gads_ad_rsa_brand_1",
        adGroupExternalId: "gads_ag_brand_exact",
        name: "RSA — Zvanični Sajt Enigma IT",
        status: "ACTIVE",
        previewUrl: "https://digital.enigmait.rs",
      },
    ];

    const adIdMap = new Map<string, Id<"ads">>();
    for (const a of seedAds) {
      const adSetId = adGroupIdMap.get(a.adGroupExternalId);
      if (!adSetId) continue;

      const existing = await ctx.db
        .query("ads")
        .withIndex("by_workspace_external", (q) =>
          q.eq("workspaceId", workspaceId).eq("externalId", a.externalId),
        )
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, {
          adSetId,
          name: a.name,
          status: a.status,
          previewUrl: a.previewUrl,
          syncedAt: now,
        });
        adIdMap.set(a.externalId, existing._id);
      } else {
        const id = await ctx.db.insert("ads", {
          workspaceId,
          adSetId,
          externalId: a.externalId,
          name: a.name,
          status: a.status,
          previewUrl: a.previewUrl,
          syncedAt: now,
        });
        adIdMap.set(a.externalId, id);
      }
    }

    // 5. Generate 7 days of daily insights
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];

      // Ad 1
      const ad1Id = adIdMap.get("gads_ad_rsa_web_1");
      if (ad1Id) {
        const spend = 24.5 + Math.sin(i) * 3;
        const impressions = Math.floor(480 + Math.sin(i) * 50);
        const clicks = Math.floor(38 + Math.cos(i) * 5);
        const results = Math.floor(3 + (i % 2));
        const conversionValue = results * 120;
        const ctr = impressions > 0 ? clicks / impressions : 0;
        const cpc = clicks > 0 ? spend / clicks : 0;
        const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
        const costPerResult = results > 0 ? spend / results : 0;
        const roas = spend > 0 ? conversionValue / spend : 0;

        const existingCandidates = await ctx.db
          .query("adInsights")
          .withIndex("by_ad_date_hash", (q) =>
            q
              .eq("adId", ad1Id)
              .eq("date", dateStr)
              .eq("breakdownHash", "none"),
          )
          .collect();
        const existing =
          existingCandidates.find((c) => c.hour === undefined) ?? null;

        const data = {
          workspaceId,
          adId: ad1Id,
          date: dateStr,
          breakdownHash: "none",
          spend: Number(spend.toFixed(2)),
          impressions,
          reach: impressions,
          frequency: 1,
          clicks,
          ctr: Number(ctr.toFixed(4)),
          cpc: Number(cpc.toFixed(2)),
          cpm: Number(cpm.toFixed(2)),
          video3s: 0,
          thruplay: 0,
          videoP25: 0,
          videoP50: 0,
          videoP75: 0,
          videoP100: 0,
          results,
          costPerResult: Number(costPerResult.toFixed(2)),
          conversionValue,
          roas: Number(roas.toFixed(2)),
          searchImpressionShare: 0.76,
          syncedAt: now,
        };

        if (existing) {
          await ctx.db.patch(existing._id, data);
        } else {
          await ctx.db.insert("adInsights", data);
        }
      }

      // Ad 2
      const ad2Id = adIdMap.get("gads_ad_rsa_software_1");
      if (ad2Id) {
        const spend = 18.2 + Math.cos(i) * 2;
        const impressions = Math.floor(320 + Math.cos(i) * 30);
        const clicks = Math.floor(22 + (i % 3));
        const results = Math.floor(2 + (i % 2));
        const conversionValue = results * 150;
        const ctr = impressions > 0 ? clicks / impressions : 0;
        const cpc = clicks > 0 ? spend / clicks : 0;
        const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
        const costPerResult = results > 0 ? spend / results : 0;
        const roas = spend > 0 ? conversionValue / spend : 0;

        const existingCandidates = await ctx.db
          .query("adInsights")
          .withIndex("by_ad_date_hash", (q) =>
            q
              .eq("adId", ad2Id)
              .eq("date", dateStr)
              .eq("breakdownHash", "none"),
          )
          .collect();
        const existing =
          existingCandidates.find((c) => c.hour === undefined) ?? null;

        const data = {
          workspaceId,
          adId: ad2Id,
          date: dateStr,
          breakdownHash: "none",
          spend: Number(spend.toFixed(2)),
          impressions,
          reach: impressions,
          frequency: 1,
          clicks,
          ctr: Number(ctr.toFixed(4)),
          cpc: Number(cpc.toFixed(2)),
          cpm: Number(cpm.toFixed(2)),
          video3s: 0,
          thruplay: 0,
          videoP25: 0,
          videoP50: 0,
          videoP75: 0,
          videoP100: 0,
          results,
          costPerResult: Number(costPerResult.toFixed(2)),
          conversionValue,
          roas: Number(roas.toFixed(2)),
          searchImpressionShare: 0.68,
          syncedAt: now,
        };

        if (existing) {
          await ctx.db.patch(existing._id, data);
        } else {
          await ctx.db.insert("adInsights", data);
        }
      }
    }

    // 6. Seed Keyword Quality Data
    const seedKeywords = [
      {
        keywordId: "kw_1001",
        keywordText: "izrada web aplikacija beograd",
        matchType: "PHRASE",
        qualityScore: 9,
        creativeQualityScore: "ABOVE_AVERAGE",
        postClickQualityScore: "ABOVE_AVERAGE",
        searchPredictedCtr: "ABOVE_AVERAGE",
        campaignExternalId: "gads_camp_search_leadgen",
        adGroupExternalId: "gads_ag_web_dev",
        impressions: 520,
        clicks: 44,
        cost: 28.5,
        conversions: 4,
      },
      {
        keywordId: "kw_1002",
        keywordText: "custom software development serbia",
        matchType: "EXACT",
        qualityScore: 8,
        creativeQualityScore: "ABOVE_AVERAGE",
        postClickQualityScore: "AVERAGE",
        searchPredictedCtr: "ABOVE_AVERAGE",
        campaignExternalId: "gads_camp_search_leadgen",
        adGroupExternalId: "gads_ag_custom_software",
        impressions: 340,
        clicks: 29,
        cost: 22.8,
        conversions: 3,
      },
      {
        keywordId: "kw_1003",
        keywordText: "izrada poslovnog softvera",
        matchType: "PHRASE",
        qualityScore: 7,
        creativeQualityScore: "AVERAGE",
        postClickQualityScore: "AVERAGE",
        searchPredictedCtr: "AVERAGE",
        campaignExternalId: "gads_camp_search_leadgen",
        adGroupExternalId: "gads_ag_custom_software",
        impressions: 290,
        clicks: 18,
        cost: 16.4,
        conversions: 1,
      },
      {
        keywordId: "kw_1004",
        keywordText: "enigma it",
        matchType: "EXACT",
        qualityScore: 10,
        creativeQualityScore: "ABOVE_AVERAGE",
        postClickQualityScore: "ABOVE_AVERAGE",
        searchPredictedCtr: "ABOVE_AVERAGE",
        campaignExternalId: "gads_camp_brand_defense",
        adGroupExternalId: "gads_ag_brand_exact",
        impressions: 890,
        clicks: 145,
        cost: 12.2,
        conversions: 12,
      },
    ];

    const todayStr = today.toISOString().split("T")[0];
    for (const kw of seedKeywords) {
      const campaignId = campaignIdMap.get(kw.campaignExternalId);
      const adGroupId = adGroupIdMap.get(kw.adGroupExternalId);

      const existing = await ctx.db
        .query("gadsKeywordQuality")
        .withIndex("by_upsert_key", (q) =>
          q
            .eq("workspaceId", workspaceId)
            .eq("keywordId", kw.keywordId)
            .eq("date", todayStr),
        )
        .unique();

      const data = {
        workspaceId,
        campaignId,
        campaignExternalId: kw.campaignExternalId,
        adGroupId,
        adGroupExternalId: kw.adGroupExternalId,
        keywordId: kw.keywordId,
        keywordText: kw.keywordText,
        matchType: kw.matchType,
        qualityScore: kw.qualityScore,
        creativeQualityScore: kw.creativeQualityScore,
        postClickQualityScore: kw.postClickQualityScore,
        searchPredictedCtr: kw.searchPredictedCtr,
        status: "ENABLED",
        impressions: kw.impressions,
        clicks: kw.clicks,
        cost: kw.cost,
        conversions: kw.conversions,
        date: todayStr,
        syncedAt: now,
      };

      if (existing) {
        await ctx.db.patch(existing._id, data);
      } else {
        await ctx.db.insert("gadsKeywordQuality", data);
      }
    }

    return { success: true, accountId };
  },
});

/**
 * Clean up all seeded Google Ads data.
 */
export const clearGoogleAdsSeeds = mutation({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
  },
  handler: async (ctx, args) => {
    let workspaceId: Id<"workspaces">;
    if (args.workspaceId) {
      workspaceId = args.workspaceId;
    } else {
      const membership = await requireMembership(ctx);
      workspaceId = membership.workspaceId;
    }

    // Find accounts with provider google_ads
    const accounts = await ctx.db
      .query("adAccounts")
      .withIndex("by_workspace_provider", (q) =>
        q.eq("workspaceId", workspaceId).eq("provider", "google_ads"),
      )
      .collect();

    let deleted = 0;
    for (const acc of accounts) {
      const campaigns = await ctx.db
        .query("adCampaigns")
        .withIndex("by_workspace_account", (q) =>
          q.eq("workspaceId", workspaceId).eq("accountId", acc._id),
        )
        .collect();

      for (const camp of campaigns) {
        const adSets = await ctx.db
          .query("adSets")
          .withIndex("by_workspace_campaign", (q) =>
            q.eq("workspaceId", workspaceId).eq("campaignId", camp._id),
          )
          .collect();

        for (const set of adSets) {
          const ads = await ctx.db
            .query("ads")
            .withIndex("by_workspace_adset", (q) =>
              q.eq("workspaceId", workspaceId).eq("adSetId", set._id),
            )
            .collect();

          for (const ad of ads) {
            const insights = await ctx.db
              .query("adInsights")
              .withIndex("by_ad_date", (q) => q.eq("adId", ad._id))
              .collect();

            for (const ins of insights) {
              await ctx.db.delete(ins._id);
              deleted++;
            }
            await ctx.db.delete(ad._id);
            deleted++;
          }
          await ctx.db.delete(set._id);
          deleted++;
        }
        await ctx.db.delete(camp._id);
        deleted++;
      }

      await ctx.db.delete(acc._id);
      deleted++;
    }

    // Delete keyword quality rows
    const kwRows = await ctx.db
      .query("gadsKeywordQuality")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();

    for (const kw of kwRows) {
      await ctx.db.delete(kw._id);
      deleted++;
    }

    return { deleted };
  },
});
