import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireMembership } from "./lib/auth";
import {
  calculateRollingQuota,
  getGoogleAdsDailyLimit,
  type GoogleAdsRateGate,
  ROLLING_WINDOW_MS,
} from "./lib/googleAdsQuota";
import {
  formatQualityComponent,
  formatQualityScore,
  formatSearchTermStatus,
  formatMatchType,
  formatDeviceType,
  formatDayOfWeek,
  formatAgeRange,
  formatGender,
  formatLocationType,
  formatAssetPerformanceLabel,
  formatAssetFieldType,
  formatAssetType,
  calculateAssetCombinationCoverage,
} from "./lib/googleAdsFormat";

export {
  formatAssetPerformanceLabel,
  formatAssetFieldType,
  formatAssetType,
  calculateAssetCombinationCoverage,
};

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
 *   - `gadsQuota` managed by workspace / customer ID with sliding 24h window
 *   - `gadsGeographicView` upserted by `[workspaceId, campaignExternalId, locationType, date]`
 *   - `gadsUserLocationView` upserted by `[workspaceId, campaignExternalId, date]`
 *   - `gadsDeviceStats` upserted by `[workspaceId, campaignExternalId, device, date]`
 *   - `gadsHourlyStats` upserted by `[workspaceId, campaignExternalId, date, hour]`
 *   - `gadsAgeRangeView` upserted by `[workspaceId, campaignExternalId, ageRange, date]`
 *   - `gadsGenderView` upserted by `[workspaceId, campaignExternalId, gender, date]`
 * ============================================================================
 */

export const SPENDING_CAP_NOTICE =
  "Google Ads može potrošiti do 2x dnevnog budžeta u pojedinačnom danu, ali mesečna potrošnja ne prelazi dnevni budžet × 30.4.";

export const BREAKDOWN_NOT_SUM_NOTICE =
  "Ovo je razlaganje po segmentima, a ne zbir. Zbirovi iz različitih segmenata se nikada ne sabiraju međusobno.";

/**
 * Računa ukupan alocirani dnevni budžet bez dvostrukog brojanja deljenih budžeta (GA3 B2).
 *
 * Pravila:
 *   - Svaki jedinstveni `budgetId` se broji tačno jednom.
 *   - Ako više kampanja deli isti budžet, taj iznos se u zbir dodaje samo jednom.
 *   - Budžet sa iznosom 0 doprinosi 0.
 *   - Budžet sa nedefinisanim ili nevalidnim iznosom se ignoriše.
 */
export function calculateTotalAllocatedBudget(
  budgets: Array<{
    budgetId: string;
    amount?: number | null;
    explicitlyShared?: boolean;
  }>,
): number {
  const seenBudgetIds = new Set<string>();
  let total = 0;

  for (const b of budgets) {
    if (!b || !b.budgetId || seenBudgetIds.has(b.budgetId)) continue;
    seenBudgetIds.add(b.budgetId);

    if (
      b.amount !== undefined &&
      b.amount !== null &&
      typeof b.amount === "number" &&
      Number.isFinite(b.amount)
    ) {
      total += b.amount;
    }
  }

  return Number(total.toFixed(2));
}

export interface SearchTermCoverageResult {
  readonly termsImpressions: number;
  readonly totalImpressions: number;
  readonly hiddenImpressions: number;
  readonly coverageRatio: number | undefined;
  readonly coveragePct: number | undefined;
  readonly notice: string;
}

/**
 * Računa pokrivenost i razliku između prikaza zabeleženih po search terminima
 * i ukupnih prikaza kampanje (B3 / GA5 Dopuna).
 *
 * Pravila:
 *   - Kad ukupan broj impresija nije poznat ili je 0 (ili effectiveTotal <= 0),
 *     coverageRatio i coveragePct vraćaju undefined, a notice glasi da se
 *     pokrivenost ne može utvrditi (DEO A).
 *   - Tip povratne vrednosti dozvoljava number | undefined.
 *   - Google izostavlja termine sa malim brojem pretraga radi zaštite privatnosti,
 *     pa je zbir prikaza po search terminima UVEK manji ili jednak ukupnim prikazima.
 *   - Ta razlika se beleži kao podatak, a lista termina se NIKADA ne dopunjuje
 *     izmišljenom stavkom "ostalo".
 */
export function calculateSearchTermCoverage(
  termsImpressions?: number | null,
  totalImpressions?: number | null,
): SearchTermCoverageResult {
  const safeTerms = Math.max(
    0,
    termsImpressions !== undefined && termsImpressions !== null && Number.isFinite(termsImpressions)
      ? termsImpressions
      : 0,
  );
  const isTotalKnown =
    totalImpressions !== undefined &&
    totalImpressions !== null &&
    Number.isFinite(totalImpressions) &&
    totalImpressions > 0;

  const safeTotal = isTotalKnown ? (totalImpressions as number) : 0;
  const effectiveTotal = isTotalKnown ? Math.max(safeTerms, safeTotal) : safeTerms;
  const hiddenImpressions = isTotalKnown ? Math.max(0, effectiveTotal - safeTerms) : 0;

  if (!isTotalKnown || effectiveTotal <= 0) {
    return {
      termsImpressions: safeTerms,
      totalImpressions: effectiveTotal,
      hiddenImpressions: 0,
      coverageRatio: undefined,
      coveragePct: undefined,
      notice:
        "Pokrivenost search termina se ne može utvrditi jer ukupan broj impresija nije poznat ili je 0.",
    };
  }

  const coverageRatio = Number((safeTerms / effectiveTotal).toFixed(4));
  const coveragePct = Number(((safeTerms / effectiveTotal) * 100).toFixed(1));
  const notice = `Prikazano ${safeTerms} od ${effectiveTotal} impresija (${coveragePct}%). Google izostavlja pretrage sa malim brojem prikaza radi zaštite privatnosti.`;

  return {
    termsImpressions: safeTerms,
    totalImpressions: effectiveTotal,
    hiddenImpressions,
    coverageRatio,
    coveragePct,
    notice,
  };
}

export interface SegmentCoverageResult {
  readonly segmentedImpressions: number;
  readonly totalImpressions: number;
  readonly hiddenImpressions: number;
  readonly coverageRatio: number | undefined;
  readonly coveragePct: number | undefined;
  readonly notice: string;
  readonly isBreakdownOnlyNotice: string;
}

/**
 * Računa pokrivenost segmentnog razlaganja u odnosu na ukupne impresije kampanje (GA6 B5).
 *
 * Pravila (B5):
 *   - Segmenti menjaju broj redova. Uz svaku segmentnu tabelu stoji podatak "ovo je razlaganje, ne zbir".
 *   - Kad ukupan broj nije poznat ili je 0, coverageRatio i coveragePct su undefined.
 *   - Zbirovi iz dva različita segmenta se NIKADA ne sabiraju međusobno.
 */
export function calculateSegmentCoverage(
  segmentedImpressions?: number | null,
  totalImpressions?: number | null,
): SegmentCoverageResult {
  const safeSegmented = Math.max(
    0,
    segmentedImpressions !== undefined &&
      segmentedImpressions !== null &&
      Number.isFinite(segmentedImpressions)
      ? segmentedImpressions
      : 0,
  );
  const isTotalKnown =
    totalImpressions !== undefined &&
    totalImpressions !== null &&
    Number.isFinite(totalImpressions) &&
    totalImpressions > 0;

  const safeTotal = isTotalKnown ? (totalImpressions as number) : 0;
  const effectiveTotal = isTotalKnown ? Math.max(safeSegmented, safeTotal) : safeSegmented;
  const hiddenImpressions = isTotalKnown ? Math.max(0, effectiveTotal - safeSegmented) : 0;

  if (!isTotalKnown || effectiveTotal <= 0) {
    return {
      segmentedImpressions: safeSegmented,
      totalImpressions: effectiveTotal,
      hiddenImpressions: 0,
      coverageRatio: undefined,
      coveragePct: undefined,
      notice:
        "Pokrivenost segmenta se ne može utvrditi jer ukupan broj impresija nije poznat ili je 0.",
      isBreakdownOnlyNotice: BREAKDOWN_NOT_SUM_NOTICE,
    };
  }

  const coverageRatio = Number((safeSegmented / effectiveTotal).toFixed(4));
  const coveragePct = Number(((safeSegmented / effectiveTotal) * 100).toFixed(1));
  const notice = `Prikazano ${safeSegmented} od ${effectiveTotal} impresija (${coveragePct}%). ${BREAKDOWN_NOT_SUM_NOTICE}`;

  return {
    segmentedImpressions: safeSegmented,
    totalImpressions: effectiveTotal,
    hiddenImpressions,
    coverageRatio,
    coveragePct,
    notice,
    isBreakdownOnlyNotice: BREAKDOWN_NOT_SUM_NOTICE,
  };
}

export const gadsConversionActionInputValidator = v.object({
  id: v.string(),
  name: v.string(),
  status: v.string(), // "ENABLED", "PAUSED", "REMOVED", "HIDDEN", "UNKNOWN"
  category: v.optional(v.string()),
  type: v.optional(v.string()),
  primaryForGoal: v.boolean(),
  countingType: v.optional(v.string()),
  attributionModel: v.optional(v.string()),
  clickThroughLookupWindowDays: v.optional(v.number()),
  viewThroughLookupWindowDays: v.optional(v.number()),
});

export const gadsCustomerClientInputValidator = v.object({
  clientCustomer: v.string(),
  customerId: v.string(),
  descriptiveName: v.string(),
  currencyCode: v.optional(v.string()),
  timeZone: v.optional(v.string()),
  manager: v.boolean(),
  level: v.number(),
  status: v.string(),
  hidden: v.optional(v.boolean()),
});

export const gadsBudgetInputValidator = v.object({
  budgetId: v.string(),
  name: v.string(),
  amount: v.optional(v.number()), // ako je undefined, red se ne upisuje u bazu
  totalAmount: v.optional(v.number()),
  status: v.optional(v.string()),
  deliveryMethod: v.optional(v.string()),
  explicitlyShared: v.boolean(),
  referenceCount: v.optional(v.number()),
});

export const gadsCampaignCriterionInputValidator = v.object({
  campaignExternalId: v.string(),
  criterionId: v.string(),
  type: v.string(),
  negative: v.boolean(),
  status: v.optional(v.string()),
  bidModifier: v.optional(v.number()),
  location: v.optional(
    v.object({
      geoTargetConstant: v.string(),
      displayName: v.optional(v.string()),
    }),
  ),
  language: v.optional(
    v.object({
      languageConstant: v.string(),
      code: v.optional(v.string()),
    }),
  ),
  adSchedule: v.optional(
    v.object({
      dayOfWeek: v.string(),
      startHour: v.number(),
      startMinute: v.string(),
      endHour: v.number(),
      endMinute: v.string(),
    }),
  ),
  keyword: v.optional(
    v.object({
      text: v.string(),
      matchType: v.string(),
    }),
  ),
  device: v.optional(
    v.object({
      type: v.string(),
    }),
  ),
  detailsSummary: v.optional(v.string()),
});

export const gadsSearchTermInputValidator = v.object({
  campaignExternalId: v.string(),
  adGroupExternalId: v.string(),
  searchTerm: v.string(),
  status: v.string(), // "ADDED", "EXCLUDED", "NONE", "UNKNOWN"
  matchType: v.optional(v.string()), // "EXACT", "PHRASE", "BROAD", "NEAR_EXACT", "NEAR_PHRASE", "UNKNOWN"
  impressions: v.optional(v.number()),
  clicks: v.optional(v.number()),
  cost: v.optional(v.number()),
  conversions: v.optional(v.number()),
  allConversions: v.optional(v.number()),
  date: v.string(),
});

export const gadsSharedSetInputValidator = v.object({
  sharedSetId: v.string(),
  name: v.string(),
  type: v.string(),
  status: v.optional(v.string()),
  memberCount: v.optional(v.number()),
  referenceCount: v.optional(v.number()),
});

export const gadsSharedCriterionInputValidator = v.object({
  sharedSetId: v.string(),
  criterionId: v.string(),
  type: v.string(),
  keywordText: v.optional(v.string()),
  matchType: v.optional(v.string()),
});

export const gadsCampaignSharedSetInputValidator = v.object({
  campaignExternalId: v.string(),
  sharedSetId: v.string(),
  status: v.optional(v.string()),
});

export const gadsGeographicViewInputValidator = v.object({
  campaignExternalId: v.string(),
  countryCriterionId: v.optional(v.string()),
  locationType: v.string(), // "LOCATION_OF_PRESENCE", "AREA_OF_INTEREST", etc.
  impressions: v.optional(v.number()),
  clicks: v.optional(v.number()),
  cost: v.optional(v.number()),
  conversions: v.optional(v.number()),
  allConversions: v.optional(v.number()),
  date: v.string(),
});

export const gadsUserLocationViewInputValidator = v.object({
  campaignExternalId: v.string(),
  countryCriterionId: v.optional(v.string()),
  targetingLocation: v.optional(v.boolean()),
  impressions: v.optional(v.number()),
  clicks: v.optional(v.number()),
  cost: v.optional(v.number()),
  conversions: v.optional(v.number()),
  allConversions: v.optional(v.number()),
  date: v.string(),
});

export const gadsDeviceStatsInputValidator = v.object({
  campaignExternalId: v.string(),
  device: v.string(), // "MOBILE", "DESKTOP", "TABLET", "CONNECTED_TV", "OTHER", "UNKNOWN"
  impressions: v.optional(v.number()),
  clicks: v.optional(v.number()),
  cost: v.optional(v.number()),
  conversions: v.optional(v.number()),
  allConversions: v.optional(v.number()),
  date: v.string(),
});

export const gadsHourlyStatsInputValidator = v.object({
  campaignExternalId: v.string(),
  dayOfWeek: v.string(), // "MONDAY", "TUESDAY", ...
  hour: v.number(), // 0..23
  impressions: v.optional(v.number()),
  clicks: v.optional(v.number()),
  cost: v.optional(v.number()),
  conversions: v.optional(v.number()),
  allConversions: v.optional(v.number()),
  date: v.string(),
});

export const gadsAgeRangeViewInputValidator = v.object({
  campaignExternalId: v.string(),
  adGroupExternalId: v.optional(v.string()),
  criterionId: v.optional(v.string()),
  ageRange: v.string(), // "AGE_RANGE_18_24", ..., "UNDETERMINED", "UNKNOWN"
  impressions: v.optional(v.number()),
  clicks: v.optional(v.number()),
  cost: v.optional(v.number()),
  conversions: v.optional(v.number()),
  allConversions: v.optional(v.number()),
  date: v.string(),
});

export const gadsGenderViewInputValidator = v.object({
  campaignExternalId: v.string(),
  adGroupExternalId: v.optional(v.string()),
  criterionId: v.optional(v.string()),
  gender: v.string(), // "MALE", "FEMALE", "UNDETERMINED", "UNKNOWN"
  impressions: v.optional(v.number()),
  clicks: v.optional(v.number()),
  cost: v.optional(v.number()),
  conversions: v.optional(v.number()),
  allConversions: v.optional(v.number()),
  date: v.string(),
});

export const gadsAssetInputValidator = v.object({
  assetId: v.string(),
  name: v.optional(v.string()),
  type: v.string(),
  text: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  imageFileSize: v.optional(v.number()),
  youtubeVideoId: v.optional(v.string()),
  youtubeVideoTitle: v.optional(v.string()),
  phoneNumber: v.optional(v.string()),
  source: v.optional(v.string()),
  status: v.optional(v.string()),
});

export const gadsAdGroupAdAssetViewInputValidator = v.object({
  campaignExternalId: v.string(),
  adGroupExternalId: v.string(),
  adExternalId: v.string(),
  assetExternalId: v.string(),
  fieldType: v.string(),
  performanceLabel: v.string(),
  pinnedField: v.optional(v.string()),
  status: v.optional(v.string()),
  enabled: v.optional(v.boolean()),
  impressions: v.optional(v.number()),
  clicks: v.optional(v.number()),
  cost: v.optional(v.number()),
  conversions: v.optional(v.number()),
  allConversions: v.optional(v.number()),
  date: v.string(),
});

export const gadsAssetCombinationViewInputValidator = v.object({
  campaignExternalId: v.string(),
  adGroupExternalId: v.string(),
  adExternalId: v.string(),
  servedAssetIds: v.array(v.string()),
  combinationHash: v.string(),
  impressions: v.optional(v.number()),
  date: v.string(),
});

export const gadsCampaignInputValidator = v.object({
  externalId: v.string(),
  name: v.string(),
  objective: v.optional(v.string()),
  status: v.string(),
  dailyBudget: v.optional(v.number()),
  lifetimeBudget: v.optional(v.number()),
  budgetId: v.optional(v.string()),
  startDate: v.optional(v.string()),
  endDate: v.optional(v.string()),
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
  spend: v.optional(v.number()),
  impressions: v.optional(v.number()),
  reach: v.optional(v.number()),
  frequency: v.optional(v.number()),
  clicks: v.optional(v.number()),
  ctr: v.optional(v.number()),
  cpc: v.optional(v.number()),
  cpm: v.optional(v.number()),
  results: v.optional(v.number()),
  conversions: v.optional(v.number()), // primarne konverzije (decimalni broj float64, npr. 2.33)
  allConversions: v.optional(v.number()), // sve konverzije (decimalni broj float64)
  allConversionsValue: v.optional(v.number()), // vrednost svih konverzija (kroz microsToUnits)
  costPerResult: v.optional(v.number()),
  conversionValue: v.optional(v.number()),
  roas: v.optional(v.number()),
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
  impressions: v.optional(v.number()),
  clicks: v.optional(v.number()),
  cost: v.optional(v.number()),
  conversions: v.optional(v.number()),
  allConversions: v.optional(v.number()),
  date: v.string(),
});

// ── Internal Mutations ───────────────────────────────────────────────────────

/**
 * Atomically upsert Google Ads account, conversion actions, campaigns, ad groups, ads, insights, keyword quality scores, search terms, and negative sets.
 */
export const upsertGoogleAdsData = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    account: v.object({
      externalId: v.string(),
      name: v.string(),
      currency: v.string(),
    }),
    conversionActions: v.optional(v.array(gadsConversionActionInputValidator)),
    customerClients: v.optional(v.array(gadsCustomerClientInputValidator)),
    budgets: v.optional(v.array(gadsBudgetInputValidator)),
    campaigns: v.array(gadsCampaignInputValidator),
    adGroups: v.array(gadsAdGroupInputValidator),
    campaignCriteria: v.optional(v.array(gadsCampaignCriterionInputValidator)),
    ads: v.array(gadsAdInputValidator),
    insights: v.array(gadsInsightInputValidator),
    keywordQuality: v.array(gadsKeywordQualityInputValidator),
    searchTerms: v.optional(v.array(gadsSearchTermInputValidator)),
    sharedSets: v.optional(v.array(gadsSharedSetInputValidator)),
    sharedCriteria: v.optional(v.array(gadsSharedCriterionInputValidator)),
    campaignSharedSets: v.optional(v.array(gadsCampaignSharedSetInputValidator)),
    geographicViews: v.optional(v.array(gadsGeographicViewInputValidator)),
    userLocationViews: v.optional(v.array(gadsUserLocationViewInputValidator)),
    deviceStats: v.optional(v.array(gadsDeviceStatsInputValidator)),
    hourlyStats: v.optional(v.array(gadsHourlyStatsInputValidator)),
    ageRangeViews: v.optional(v.array(gadsAgeRangeViewInputValidator)),
    genderViews: v.optional(v.array(gadsGenderViewInputValidator)),
    assets: v.optional(v.array(gadsAssetInputValidator)),
    adGroupAdAssetViews: v.optional(v.array(gadsAdGroupAdAssetViewInputValidator)),
    assetCombinationViews: v.optional(v.array(gadsAssetCombinationViewInputValidator)),
  },
  returns: v.number(),
  handler: async (
    ctx,
    {
      workspaceId,
      account,
      conversionActions,
      customerClients,
      budgets,
      campaigns,
      adGroups,
      campaignCriteria,
      ads,
      insights,
      keywordQuality,
      searchTerms,
      sharedSets,
      sharedCriteria,
      campaignSharedSets,
      geographicViews,
      userLocationViews,
      deviceStats,
      hourlyStats,
      ageRangeViews,
      genderViews,
      assets,
      adGroupAdAssetViews,
      assetCombinationViews,
    },
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

    // 2. Upsert Conversion Actions (GA4 B1)
    if (conversionActions && conversionActions.length > 0) {
      for (const ca of conversionActions) {
        const existingCA = await ctx.db
          .query("gadsConversionActions")
          .withIndex("by_upsert_key", (q) =>
            q.eq("workspaceId", workspaceId).eq("id", ca.id),
          )
          .unique();

        const caData = {
          workspaceId,
          id: ca.id,
          name: ca.name,
          status: ca.status,
          category: ca.category,
          type: ca.type,
          primaryForGoal: ca.primaryForGoal,
          countingType: ca.countingType,
          attributionModel: ca.attributionModel,
          clickThroughLookupWindowDays: ca.clickThroughLookupWindowDays,
          viewThroughLookupWindowDays: ca.viewThroughLookupWindowDays,
          syncedAt: now,
        };

        if (existingCA !== null) {
          await ctx.db.patch(existingCA._id, caData);
        } else {
          await ctx.db.insert("gadsConversionActions", caData);
        }
        written++;
      }
    }

    // 3. Upsert Customer Clients (MCC Hierarchy) (GA3)
    if (customerClients && customerClients.length > 0) {
      for (const cc of customerClients) {
        const existingCC = await ctx.db
          .query("gadsCustomerClients")
          .withIndex("by_workspace_customer", (q) =>
            q.eq("workspaceId", workspaceId).eq("customerId", cc.customerId),
          )
          .unique();

        const ccData = {
          workspaceId,
          clientCustomer: cc.clientCustomer,
          customerId: cc.customerId,
          descriptiveName: cc.descriptiveName,
          currencyCode: cc.currencyCode,
          timeZone: cc.timeZone,
          manager: cc.manager,
          level: cc.level,
          status: cc.status,
          hidden: cc.hidden,
          syncedAt: now,
        };

        if (existingCC !== null) {
          await ctx.db.patch(existingCC._id, ccData);
        } else {
          await ctx.db.insert("gadsCustomerClients", ccData);
        }
        written++;
      }
    }

    // 4. Upsert Campaign Budgets (GA3 B2, B3, B4 & GA4 A1, A2)
    if (budgets && budgets.length > 0) {
      for (const b of budgets) {
        // Pravilo B4: ako iznos ne može da se odredi (undefined / null / NaN), red se NE UPISUJE.
        // Prava nula ostaje 0.
        if (
          b.amount === undefined ||
          b.amount === null ||
          typeof b.amount !== "number" ||
          !Number.isFinite(b.amount)
        ) {
          console.warn(
            `[googleAdsStore] Preskačem upis gadsBudgets za budžet "${b.budgetId}" ("${b.name}"): nedostaje ili je nevalidan iznos (${b.amount}).`,
          );
          continue;
        }

        const maxDailySpend = Number((b.amount * 2).toFixed(2));

        const existingBudget = await ctx.db
          .query("gadsBudgets")
          .withIndex("by_workspace_budget", (q) =>
            q.eq("workspaceId", workspaceId).eq("budgetId", b.budgetId),
          )
          .unique();

        const budgetData = {
          workspaceId,
          budgetId: b.budgetId,
          name: b.name,
          amount: b.amount,
          totalAmount: b.totalAmount,
          status: b.status,
          deliveryMethod: b.deliveryMethod,
          explicitlyShared: b.explicitlyShared,
          referenceCount: b.referenceCount,
          maxDailySpend,
          syncedAt: now,
        };

        if (existingBudget !== null) {
          await ctx.db.patch(existingBudget._id, budgetData);
        } else {
          await ctx.db.insert("gadsBudgets", budgetData);
        }
        written++;
      }
    }

    // 4. Upsert Campaigns
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
          budgetId: c.budgetId,
          startDate: c.startDate,
          endDate: c.endDate,
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
          budgetId: c.budgetId,
          startDate: c.startDate,
          endDate: c.endDate,
          searchImpressionShare: c.searchImpressionShare,
          syncPriority: c.syncPriority,
          syncedAt: now,
        });
        campaignIdMap.set(c.externalId, id);
      }
      written++;
    }

    // 5. Upsert AdSets (Ad Groups)
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

    // 6. Upsert Campaign Criteria (Targeting: Locations, Languages, Ad Schedule, Devices, Negative Keywords) (GA3)
    if (campaignCriteria && campaignCriteria.length > 0) {
      for (const crit of campaignCriteria) {
        const campaignId = campaignIdMap.get(crit.campaignExternalId);

        const existingCrit = await ctx.db
          .query("gadsCampaignCriteria")
          .withIndex("by_upsert_key", (q) =>
            q
              .eq("workspaceId", workspaceId)
              .eq("campaignExternalId", crit.campaignExternalId)
              .eq("criterionId", crit.criterionId),
          )
          .unique();

        const critData: Record<string, unknown> = {
          workspaceId,
          campaignId,
          campaignExternalId: crit.campaignExternalId,
          criterionId: crit.criterionId,
          type: crit.type,
          negative: crit.negative,
          syncedAt: now,
        };

        if (crit.status !== undefined) critData.status = crit.status;
        if (crit.bidModifier !== undefined) critData.bidModifier = crit.bidModifier;
        if (crit.location !== undefined) critData.location = crit.location;
        if (crit.language !== undefined) critData.language = crit.language;
        if (crit.adSchedule !== undefined) critData.adSchedule = crit.adSchedule;
        if (crit.keyword !== undefined) critData.keyword = crit.keyword;
        if (crit.device !== undefined) critData.device = crit.device;
        if (crit.detailsSummary !== undefined) critData.detailsSummary = crit.detailsSummary;

        if (existingCrit !== null) {
          await ctx.db.patch(existingCrit._id, critData);
        } else {
          await ctx.db.insert("gadsCampaignCriteria", critData as any);
        }
        written++;
      }
    }

    // 7. Upsert Ads (Ad Group Ads)
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
      // Pravilo A3: ako cena, prikazi ili klikovi ne mogu da se odrede, red se NE UPISUJE.
      if (
        row.spend === undefined ||
        row.impressions === undefined ||
        row.clicks === undefined ||
        typeof row.spend !== "number" ||
        typeof row.impressions !== "number" ||
        typeof row.clicks !== "number"
      ) {
        console.warn(
          `[googleAdsStore] Preskačem upis adInsights za oglas "${row.adExternalId}" (datum: ${row.date}): nedostaje ili je nepoznat spend (${row.spend}), impressions (${row.impressions}) ili clicks (${row.clicks}).`,
        );
        continue;
      }

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
        breakdownHash: "none",
        spend: row.spend,
        impressions: row.impressions,
        clicks: row.clicks,
        video3s: 0,
        thruplay: 0,
        videoP25: 0,
        videoP50: 0,
        videoP75: 0,
        videoP100: 0,
        syncedAt: now,
        ...(row.hour !== undefined ? { hour: row.hour } : {}),
        ...(row.reach !== undefined ? { reach: row.reach } : {}),
        ...(row.frequency !== undefined ? { frequency: row.frequency } : {}),
        ...(row.ctr !== undefined ? { ctr: row.ctr } : {}),
        ...(row.cpc !== undefined ? { cpc: row.cpc } : {}),
        ...(row.cpm !== undefined ? { cpm: row.cpm } : {}),
        ...(row.results !== undefined ? { results: row.results } : {}),
        ...(row.conversions !== undefined ? { conversions: row.conversions } : {}),
        ...(row.allConversions !== undefined ? { allConversions: row.allConversions } : {}),
        ...(row.allConversionsValue !== undefined ? { allConversionsValue: row.allConversionsValue } : {}),
        ...(row.costPerResult !== undefined ? { costPerResult: row.costPerResult } : {}),
        ...(row.conversionValue !== undefined ? { conversionValue: row.conversionValue } : {}),
        ...(row.roas !== undefined ? { roas: row.roas } : {}),
        ...(row.searchImpressionShare !== undefined ? { searchImpressionShare: row.searchImpressionShare } : {}),
      };

      if (existing !== null) {
        await ctx.db.patch(existing._id, insightData);
      } else {
        await ctx.db.insert("adInsights", insightData);
      }
      written++;
    }

    // 6. Upsert Keyword Quality Scores (GA5 B1, B2)
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

      const kwData: Record<string, unknown> = {
        workspaceId,
        campaignId,
        campaignExternalId: kw.campaignExternalId,
        adGroupId,
        adGroupExternalId: kw.adGroupExternalId,
        keywordId: kw.keywordId,
        keywordText: kw.keywordText,
        matchType: kw.matchType,
        date: kw.date,
        syncedAt: now,
      };

      // B1: Quality Score koji nedostaje ili je 0 se NE UPISUJE (polje se izostavlja).
      // Prava vrednost 1 ostaje 1 (1..10).
      if (
        kw.qualityScore !== undefined &&
        kw.qualityScore !== null &&
        typeof kw.qualityScore === "number" &&
        Number.isFinite(kw.qualityScore) &&
        kw.qualityScore >= 1 &&
        kw.qualityScore <= 10
      ) {
        kwData.qualityScore = Math.round(kw.qualityScore);
      }

      if (kw.creativeQualityScore !== undefined) kwData.creativeQualityScore = kw.creativeQualityScore;
      if (kw.postClickQualityScore !== undefined) kwData.postClickQualityScore = kw.postClickQualityScore;
      if (kw.searchPredictedCtr !== undefined) kwData.searchPredictedCtr = kw.searchPredictedCtr;
      if (kw.status !== undefined) kwData.status = kw.status;
      if (kw.impressions !== undefined) kwData.impressions = kw.impressions;
      if (kw.clicks !== undefined) kwData.clicks = kw.clicks;
      if (kw.cost !== undefined) kwData.cost = kw.cost;
      if (kw.conversions !== undefined) kwData.conversions = kw.conversions;
      if (kw.allConversions !== undefined) kwData.allConversions = kw.allConversions;

      if (existing !== null) {
        await ctx.db.patch(existing._id, kwData);
      } else {
        await ctx.db.insert("gadsKeywordQuality", kwData as any);
      }
      written++;
    }

    // 7. Upsert Search Terms (search_term_view) (GA5)
    if (searchTerms && searchTerms.length > 0) {
      for (const st of searchTerms) {
        const campaignId = campaignIdMap.get(st.campaignExternalId);
        const adGroupId = adGroupIdMap.get(st.adGroupExternalId);

        const existing = await ctx.db
          .query("gadsSearchTerms")
          .withIndex("by_upsert_key", (q) =>
            q
              .eq("workspaceId", workspaceId)
              .eq("campaignExternalId", st.campaignExternalId)
              .eq("adGroupExternalId", st.adGroupExternalId)
              .eq("searchTerm", st.searchTerm)
              .eq("date", st.date),
          )
          .unique();

        const stData: Record<string, unknown> = {
          workspaceId,
          campaignId,
          campaignExternalId: st.campaignExternalId,
          adGroupId,
          adGroupExternalId: st.adGroupExternalId,
          searchTerm: st.searchTerm,
          status: st.status,
          date: st.date,
          syncedAt: now,
        };

        if (st.matchType !== undefined) stData.matchType = st.matchType;
        if (st.impressions !== undefined) stData.impressions = st.impressions;
        if (st.clicks !== undefined) stData.clicks = st.clicks;
        if (st.cost !== undefined) stData.cost = st.cost;
        if (st.conversions !== undefined) stData.conversions = st.conversions;
        if (st.allConversions !== undefined) stData.allConversions = st.allConversions;

        if (existing !== null) {
          await ctx.db.patch(existing._id, stData);
        } else {
          await ctx.db.insert("gadsSearchTerms", stData as any);
        }
        written++;
      }
    }

    // 8. Upsert Shared Sets (Negative Lists) (GA5)
    if (sharedSets && sharedSets.length > 0) {
      for (const s of sharedSets) {
        const existing = await ctx.db
          .query("gadsSharedSets")
          .withIndex("by_upsert_key", (q) =>
            q.eq("workspaceId", workspaceId).eq("sharedSetId", s.sharedSetId),
          )
          .unique();

        const sData: Record<string, unknown> = {
          workspaceId,
          sharedSetId: s.sharedSetId,
          name: s.name,
          type: s.type,
          syncedAt: now,
        };

        if (s.status !== undefined) sData.status = s.status;
        if (s.memberCount !== undefined) sData.memberCount = s.memberCount;
        if (s.referenceCount !== undefined) sData.referenceCount = s.referenceCount;

        if (existing !== null) {
          await ctx.db.patch(existing._id, sData);
        } else {
          await ctx.db.insert("gadsSharedSets", sData as any);
        }
        written++;
      }
    }

    // 9. Upsert Shared Criteria (Negative Keywords in Lists) (GA5)
    if (sharedCriteria && sharedCriteria.length > 0) {
      for (const sc of sharedCriteria) {
        const existing = await ctx.db
          .query("gadsSharedCriteria")
          .withIndex("by_upsert_key", (q) =>
            q
              .eq("workspaceId", workspaceId)
              .eq("sharedSetId", sc.sharedSetId)
              .eq("criterionId", sc.criterionId),
          )
          .unique();

        const scData: Record<string, unknown> = {
          workspaceId,
          sharedSetId: sc.sharedSetId,
          criterionId: sc.criterionId,
          type: sc.type,
          syncedAt: now,
        };

        if (sc.keywordText !== undefined) scData.keywordText = sc.keywordText;
        if (sc.matchType !== undefined) scData.matchType = sc.matchType;

        if (existing !== null) {
          await ctx.db.patch(existing._id, scData);
        } else {
          await ctx.db.insert("gadsSharedCriteria", scData as any);
        }
        written++;
      }
    }

    // 10. Upsert Campaign Shared Sets (Campaign Links to Negative Lists) (GA5)
    if (campaignSharedSets && campaignSharedSets.length > 0) {
      for (const css of campaignSharedSets) {
        const campaignId = campaignIdMap.get(css.campaignExternalId);

        const existing = await ctx.db
          .query("gadsCampaignSharedSets")
          .withIndex("by_upsert_key", (q) =>
            q
              .eq("workspaceId", workspaceId)
              .eq("campaignExternalId", css.campaignExternalId)
              .eq("sharedSetId", css.sharedSetId),
          )
          .unique();

        const cssData: Record<string, unknown> = {
          workspaceId,
          campaignId,
          campaignExternalId: css.campaignExternalId,
          sharedSetId: css.sharedSetId,
          syncedAt: now,
        };

        if (css.status !== undefined) cssData.status = css.status;

        if (existing !== null) {
          await ctx.db.patch(existing._id, cssData);
        } else {
          await ctx.db.insert("gadsCampaignSharedSets", cssData as any);
        }
        written++;
      }
    }

    // 11. Upsert Geographic Views (Physical presence) (GA6 B1)
    if (geographicViews && geographicViews.length > 0) {
      for (const geo of geographicViews) {
        const campaignId = campaignIdMap.get(geo.campaignExternalId);

        const existing = await ctx.db
          .query("gadsGeographicView")
          .withIndex("by_upsert_key", (q) =>
            q
              .eq("workspaceId", workspaceId)
              .eq("campaignExternalId", geo.campaignExternalId)
              .eq("locationType", geo.locationType)
              .eq("date", geo.date),
          )
          .unique();

        const geoData: Record<string, unknown> = {
          workspaceId,
          campaignId,
          campaignExternalId: geo.campaignExternalId,
          locationType: geo.locationType,
          date: geo.date,
          syncedAt: now,
        };

        if (geo.countryCriterionId !== undefined) geoData.countryCriterionId = geo.countryCriterionId;
        if (geo.impressions !== undefined) geoData.impressions = geo.impressions;
        if (geo.clicks !== undefined) geoData.clicks = geo.clicks;
        if (geo.cost !== undefined) geoData.cost = geo.cost;
        if (geo.conversions !== undefined) geoData.conversions = geo.conversions;
        if (geo.allConversions !== undefined) geoData.allConversions = geo.allConversions;

        if (existing !== null) {
          await ctx.db.patch(existing._id, geoData);
        } else {
          await ctx.db.insert("gadsGeographicView", geoData as any);
        }
        written++;
      }
    }

    // 12. Upsert User Location Views (Targeted location / interest) (GA6 B1)
    if (userLocationViews && userLocationViews.length > 0) {
      for (const ul of userLocationViews) {
        const campaignId = campaignIdMap.get(ul.campaignExternalId);

        const existing = await ctx.db
          .query("gadsUserLocationView")
          .withIndex("by_upsert_key", (q) =>
            q
              .eq("workspaceId", workspaceId)
              .eq("campaignExternalId", ul.campaignExternalId)
              .eq("date", ul.date),
          )
          .unique();

        const ulData: Record<string, unknown> = {
          workspaceId,
          campaignId,
          campaignExternalId: ul.campaignExternalId,
          date: ul.date,
          syncedAt: now,
        };

        if (ul.countryCriterionId !== undefined) ulData.countryCriterionId = ul.countryCriterionId;
        if (ul.targetingLocation !== undefined) ulData.targetingLocation = ul.targetingLocation;
        if (ul.impressions !== undefined) ulData.impressions = ul.impressions;
        if (ul.clicks !== undefined) ulData.clicks = ul.clicks;
        if (ul.cost !== undefined) ulData.cost = ul.cost;
        if (ul.conversions !== undefined) ulData.conversions = ul.conversions;
        if (ul.allConversions !== undefined) ulData.allConversions = ul.allConversions;

        if (existing !== null) {
          await ctx.db.patch(existing._id, ulData);
        } else {
          await ctx.db.insert("gadsUserLocationView", ulData as any);
        }
        written++;
      }
    }

    // 13. Upsert Device Stats (GA6 B2)
    if (deviceStats && deviceStats.length > 0) {
      for (const dev of deviceStats) {
        const campaignId = campaignIdMap.get(dev.campaignExternalId);

        const existing = await ctx.db
          .query("gadsDeviceStats")
          .withIndex("by_upsert_key", (q) =>
            q
              .eq("workspaceId", workspaceId)
              .eq("campaignExternalId", dev.campaignExternalId)
              .eq("device", dev.device)
              .eq("date", dev.date),
          )
          .unique();

        const devData: Record<string, unknown> = {
          workspaceId,
          campaignId,
          campaignExternalId: dev.campaignExternalId,
          device: dev.device,
          date: dev.date,
          syncedAt: now,
        };

        if (dev.impressions !== undefined) devData.impressions = dev.impressions;
        if (dev.clicks !== undefined) devData.clicks = dev.clicks;
        if (dev.cost !== undefined) devData.cost = dev.cost;
        if (dev.conversions !== undefined) devData.conversions = dev.conversions;
        if (dev.allConversions !== undefined) devData.allConversions = dev.allConversions;

        if (existing !== null) {
          await ctx.db.patch(existing._id, devData);
        } else {
          await ctx.db.insert("gadsDeviceStats", devData as any);
        }
        written++;
      }
    }

    // 14. Upsert Hourly Schedule Stats (GA6 B3)
    if (hourlyStats && hourlyStats.length > 0) {
      for (const h of hourlyStats) {
        const campaignId = campaignIdMap.get(h.campaignExternalId);

        const existing = await ctx.db
          .query("gadsHourlyStats")
          .withIndex("by_upsert_key", (q) =>
            q
              .eq("workspaceId", workspaceId)
              .eq("campaignExternalId", h.campaignExternalId)
              .eq("date", h.date)
              .eq("hour", h.hour),
          )
          .unique();

        const hData: Record<string, unknown> = {
          workspaceId,
          campaignId,
          campaignExternalId: h.campaignExternalId,
          dayOfWeek: h.dayOfWeek,
          hour: h.hour,
          date: h.date,
          syncedAt: now,
        };

        if (h.impressions !== undefined) hData.impressions = h.impressions;
        if (h.clicks !== undefined) hData.clicks = h.clicks;
        if (h.cost !== undefined) hData.cost = h.cost;
        if (h.conversions !== undefined) hData.conversions = h.conversions;
        if (h.allConversions !== undefined) hData.allConversions = h.allConversions;

        if (existing !== null) {
          await ctx.db.patch(existing._id, hData);
        } else {
          await ctx.db.insert("gadsHourlyStats", hData as any);
        }
        written++;
      }
    }

    // 15. Upsert Age Range Demographics (GA6 B4)
    if (ageRangeViews && ageRangeViews.length > 0) {
      for (const age of ageRangeViews) {
        const campaignId = campaignIdMap.get(age.campaignExternalId);
        const adGroupId = age.adGroupExternalId ? adGroupIdMap.get(age.adGroupExternalId) : undefined;

        const existing = await ctx.db
          .query("gadsAgeRangeView")
          .withIndex("by_upsert_key", (q) =>
            q
              .eq("workspaceId", workspaceId)
              .eq("campaignExternalId", age.campaignExternalId)
              .eq("ageRange", age.ageRange)
              .eq("date", age.date),
          )
          .unique();

        const ageData: Record<string, unknown> = {
          workspaceId,
          campaignId,
          campaignExternalId: age.campaignExternalId,
          adGroupId,
          adGroupExternalId: age.adGroupExternalId,
          ageRange: age.ageRange,
          date: age.date,
          syncedAt: now,
        };

        if (age.criterionId !== undefined) ageData.criterionId = age.criterionId;
        if (age.impressions !== undefined) ageData.impressions = age.impressions;
        if (age.clicks !== undefined) ageData.clicks = age.clicks;
        if (age.cost !== undefined) ageData.cost = age.cost;
        if (age.conversions !== undefined) ageData.conversions = age.conversions;
        if (age.allConversions !== undefined) ageData.allConversions = age.allConversions;

        if (existing !== null) {
          await ctx.db.patch(existing._id, ageData);
        } else {
          await ctx.db.insert("gadsAgeRangeView", ageData as any);
        }
        written++;
      }
    }

    // 16. Upsert Gender Demographics (GA6 B4)
    if (genderViews && genderViews.length > 0) {
      for (const gen of genderViews) {
        const campaignId = campaignIdMap.get(gen.campaignExternalId);
        const adGroupId = gen.adGroupExternalId ? adGroupIdMap.get(gen.adGroupExternalId) : undefined;

        const existing = await ctx.db
          .query("gadsGenderView")
          .withIndex("by_upsert_key", (q) =>
            q
              .eq("workspaceId", workspaceId)
              .eq("campaignExternalId", gen.campaignExternalId)
              .eq("gender", gen.gender)
              .eq("date", gen.date),
          )
          .unique();

        const genData: Record<string, unknown> = {
          workspaceId,
          campaignId,
          campaignExternalId: gen.campaignExternalId,
          adGroupId,
          adGroupExternalId: gen.adGroupExternalId,
          gender: gen.gender,
          date: gen.date,
          syncedAt: now,
        };

        if (gen.criterionId !== undefined) genData.criterionId = gen.criterionId;
        if (gen.impressions !== undefined) genData.impressions = gen.impressions;
        if (gen.clicks !== undefined) genData.clicks = gen.clicks;
        if (gen.cost !== undefined) genData.cost = gen.cost;
        if (gen.conversions !== undefined) genData.conversions = gen.conversions;
        if (gen.allConversions !== undefined) genData.allConversions = gen.allConversions;

        if (existing !== null) {
          await ctx.db.patch(existing._id, genData);
        } else {
          await ctx.db.insert("gadsGenderView", genData as any);
        }
        written++;
      }
    }

    // 17. Upsert Assets (GA7 B1)
    if (assets && assets.length > 0) {
      for (const a of assets) {
        const existing = await ctx.db
          .query("gadsAssets")
          .withIndex("by_upsert_key", (q) =>
            q.eq("workspaceId", workspaceId).eq("assetId", a.assetId),
          )
          .unique();

        const aData: Record<string, unknown> = {
          workspaceId,
          assetId: a.assetId,
          type: a.type,
          cannotBeDeleted: true, // GA7 B1: asset se ne može obrisati u Google Ads-u
          syncedAt: now,
        };

        if (a.name !== undefined) aData.name = a.name;
        if (a.text !== undefined) aData.text = a.text;
        if (a.imageUrl !== undefined) aData.imageUrl = a.imageUrl;
        if (a.imageFileSize !== undefined) aData.imageFileSize = a.imageFileSize;
        if (a.youtubeVideoId !== undefined) aData.youtubeVideoId = a.youtubeVideoId;
        if (a.youtubeVideoTitle !== undefined) aData.youtubeVideoTitle = a.youtubeVideoTitle;
        if (a.phoneNumber !== undefined) aData.phoneNumber = a.phoneNumber;
        if (a.source !== undefined) aData.source = a.source;
        if (a.status !== undefined) aData.status = a.status;

        if (existing !== null) {
          await ctx.db.patch(existing._id, aData);
        } else {
          await ctx.db.insert("gadsAssets", aData as any);
        }
        written++;
      }
    }

    // 18. Upsert Ad Group Ad Asset Views (GA7 B2, B4)
    if (adGroupAdAssetViews && adGroupAdAssetViews.length > 0) {
      for (const av of adGroupAdAssetViews) {
        const campaignId = campaignIdMap.get(av.campaignExternalId);
        const adGroupId = adGroupIdMap.get(av.adGroupExternalId);
        const adId = adIdMap.get(av.adExternalId);

        const existing = await ctx.db
          .query("gadsAdGroupAdAssetViews")
          .withIndex("by_upsert_key", (q) =>
            q
              .eq("workspaceId", workspaceId)
              .eq("adExternalId", av.adExternalId)
              .eq("assetExternalId", av.assetExternalId)
              .eq("fieldType", av.fieldType)
              .eq("date", av.date),
          )
          .unique();

        const avData: Record<string, unknown> = {
          workspaceId,
          campaignId,
          campaignExternalId: av.campaignExternalId,
          adGroupId,
          adGroupExternalId: av.adGroupExternalId,
          adId,
          adExternalId: av.adExternalId,
          assetExternalId: av.assetExternalId,
          fieldType: av.fieldType,
          performanceLabel: av.performanceLabel,
          date: av.date,
          syncedAt: now,
        };

        if (av.pinnedField !== undefined) avData.pinnedField = av.pinnedField;
        if (av.status !== undefined) avData.status = av.status;
        if (av.enabled !== undefined) avData.enabled = av.enabled;
        if (av.impressions !== undefined) avData.impressions = av.impressions;
        if (av.clicks !== undefined) avData.clicks = av.clicks;
        if (av.cost !== undefined) avData.cost = av.cost;
        if (av.conversions !== undefined) avData.conversions = av.conversions;
        if (av.allConversions !== undefined) avData.allConversions = av.allConversions;

        if (existing !== null) {
          await ctx.db.patch(existing._id, avData);
        } else {
          await ctx.db.insert("gadsAdGroupAdAssetViews", avData as any);
        }
        written++;
      }
    }

    // 19. Upsert Asset Combinations (GA7 B3)
    if (assetCombinationViews && assetCombinationViews.length > 0) {
      for (const ac of assetCombinationViews) {
        const campaignId = campaignIdMap.get(ac.campaignExternalId);
        const adGroupId = adGroupIdMap.get(ac.adGroupExternalId);
        const adId = adIdMap.get(ac.adExternalId);

        const existing = await ctx.db
          .query("gadsAssetCombinationViews")
          .withIndex("by_upsert_key", (q) =>
            q
              .eq("workspaceId", workspaceId)
              .eq("adExternalId", ac.adExternalId)
              .eq("combinationHash", ac.combinationHash)
              .eq("date", ac.date),
          )
          .unique();

        const acData: Record<string, unknown> = {
          workspaceId,
          campaignId,
          campaignExternalId: ac.campaignExternalId,
          adGroupId,
          adGroupExternalId: ac.adGroupExternalId,
          adId,
          adExternalId: ac.adExternalId,
          servedAssetIds: ac.servedAssetIds,
          combinationHash: ac.combinationHash,
          date: ac.date,
          syncedAt: now,
        };

        if (ac.impressions !== undefined) acData.impressions = ac.impressions;

        if (existing !== null) {
          await ctx.db.patch(existing._id, acData);
        } else {
          await ctx.db.insert("gadsAssetCombinationViews", acData as any);
        }
        written++;
      }
    }

    return written;
  },
});

// ── Public Queries ───────────────────────────────────────────────────────────

/**
 * Dohvata podatke o Google Ads assetima, njihovim performansama i kombinacijama (GA7).
 */
export const getGoogleAdsAssets = query({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
  },
  handler: async (ctx, args) => {
    let wsId: Id<"workspaces">;
    if (args.workspaceId) {
      wsId = args.workspaceId;
    } else {
      const membership = await requireMembership(ctx);
      wsId = membership.workspaceId;
    }

    const assets = await ctx.db
      .query("gadsAssets")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", wsId))
      .collect();

    const assetViews = await ctx.db
      .query("gadsAdGroupAdAssetViews")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", wsId))
      .collect();

    const combinationViews = await ctx.db
      .query("gadsAssetCombinationViews")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", wsId))
      .collect();

    return {
      assets,
      assetViews,
      combinationViews,
    };
  },
});

/**
 * Dohvata kompletnu strukturu Google Ads naloga za radni prostor (GA3).
 * Vraća nalog, MCC hijerarhiju (customer_client), kampanje sa budžetima i kriterijume ciljanja.
 */
export const getGoogleAdsStructure = query({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
  },
  handler: async (ctx, args) => {
    let wsId: Id<"workspaces">;
    if (args.workspaceId) {
      wsId = args.workspaceId;
    } else {
      const membership = await requireMembership(ctx);
      wsId = membership.workspaceId;
    }

    const account = await ctx.db
      .query("adAccounts")
      .withIndex("by_workspace_provider", (q) =>
        q.eq("workspaceId", wsId).eq("provider", "google_ads"),
      )
      .first();

    const conversionActions = await ctx.db
      .query("gadsConversionActions")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", wsId))
      .collect();

    const customerClients = await ctx.db
      .query("gadsCustomerClients")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", wsId))
      .collect();

    const rawBudgets = await ctx.db
      .query("gadsBudgets")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", wsId))
      .collect();

    const budgets = rawBudgets.map((b) => ({
      ...b,
      monthlyCap: Number((b.amount * 30.4).toFixed(2)),
      maxDailySpend: Number((b.amount * 2).toFixed(2)),
      spendingCapNotice: SPENDING_CAP_NOTICE,
    }));

    const campaigns = account
      ? await ctx.db
          .query("adCampaigns")
          .withIndex("by_account", (q) => q.eq("accountId", account._id))
          .collect()
      : [];

    const adGroups = await ctx.db
      .query("adSets")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", wsId))
      .collect();

    const campaignCriteria = await ctx.db
      .query("gadsCampaignCriteria")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", wsId))
      .collect();

    const totalAllocatedDailyBudget = calculateTotalAllocatedBudget(rawBudgets);

    return {
      account,
      conversionActions,
      customerClients,
      budgets,
      campaigns,
      adGroups,
      campaignCriteria,
      summary: {
        totalConversionActions: conversionActions.length,
        totalCampaigns: campaigns.length,
        totalAdGroups: adGroups.length,
        totalBudgets: budgets.length,
        totalAllocatedDailyBudget,
        sharedBudgetsCount: budgets.filter((b) => b.explicitlyShared).length,
      },
    };
  },
});

/**
 * Dohvata listu konverzionih akcija definisanih na nalogu (GA4 B1).
 */
export const getGoogleAdsConversionActions = query({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
  },
  handler: async (ctx, args) => {
    let wsId: Id<"workspaces">;
    if (args.workspaceId) {
      wsId = args.workspaceId;
    } else {
      const membership = await requireMembership(ctx);
      wsId = membership.workspaceId;
    }

    return await ctx.db
      .query("gadsConversionActions")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", wsId))
      .collect();
  },
});

/**
 * Dohvata listu budžeta sa vezanim kampanjama i izvedenim limitima potrošnje (GA3 B2, B3 & GA4 A1, A2).
 */
export const getGoogleAdsBudgets = query({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
  },
  handler: async (ctx, args) => {
    let wsId: Id<"workspaces">;
    if (args.workspaceId) {
      wsId = args.workspaceId;
    } else {
      const membership = await requireMembership(ctx);
      wsId = membership.workspaceId;
    }

    const budgets = await ctx.db
      .query("gadsBudgets")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", wsId))
      .collect();

    const campaigns = await ctx.db
      .query("adCampaigns")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", wsId))
      .collect();

    const enrichedBudgets = budgets.map((b) => {
      const linkedCampaigns = campaigns.filter(
        (c) => c.budgetId === b.budgetId || c.budgetId?.endsWith(b.budgetId),
      );
      const monthlyCap = Number((b.amount * 30.4).toFixed(2));
      const maxDailySpend = Number((b.amount * 2).toFixed(2));
      return {
        ...b,
        monthlyCap,
        maxDailySpend,
        spendingCapNotice: SPENDING_CAP_NOTICE,
        linkedCampaigns: linkedCampaigns.map((c) => ({
          externalId: c.externalId,
          name: c.name,
          status: c.status,
        })),
        campaignCount: linkedCampaigns.length,
      };
    });

    const totalAllocatedDailyBudget = calculateTotalAllocatedBudget(budgets);

    return {
      budgets: enrichedBudgets,
      totalAllocatedDailyBudget,
      spendingCapNotice: SPENDING_CAP_NOTICE,
    };
  },
});

/**
 * Dohvata izveštaj stvarnih search termina (pretraga) i računa pokrivenost impresija (GA5 B3, B4).
 * Google iz privatnosti izostavlja termine sa malim brojem pretraga;
 * zbir prikaza po search terminima je UVEK manji ili jednak ukupnom broju prikaza kampanje.
 * Ta razlika se prikazuje kao podatak bez izmišljene stavke "ostalo".
 */
export const getGoogleAdsSearchTerms = query({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    campaignId: v.optional(v.id("adCampaigns")),
    campaignExternalId: v.optional(v.string()),
    adGroupId: v.optional(v.id("adSets")),
    from: v.optional(v.string()),
    to: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let wsId: Id<"workspaces">;
    if (args.workspaceId) {
      wsId = args.workspaceId;
    } else {
      const membership = await requireMembership(ctx);
      wsId = membership.workspaceId;
    }

    const fromDate = args.from ?? "1970-01-01";
    const toDate = args.to ?? "2099-12-31";

    let stQuery = ctx.db
      .query("gadsSearchTerms")
      .withIndex("by_workspace_date", (q) =>
        q.eq("workspaceId", wsId).gte("date", fromDate).lte("date", toDate),
      );

    if (args.campaignExternalId) {
      stQuery = ctx.db
        .query("gadsSearchTerms")
        .withIndex("by_workspace_campaign", (q) =>
          q.eq("workspaceId", wsId).eq("campaignExternalId", args.campaignExternalId!),
        );
    }

    const rawTerms = await stQuery.collect();

    // Učitavamo kampanje i oglasne grupe za nazive
    const campaigns = await ctx.db
      .query("adCampaigns")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", wsId))
      .collect();
    const campMap = new Map(campaigns.map((c) => [c.externalId, c.name]));
    const campIdMap = new Map(campaigns.map((c) => [c._id, c.externalId]));

    const adGroups = await ctx.db
      .query("adSets")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", wsId))
      .collect();
    const agMap = new Map(adGroups.map((g) => [g.externalId, g.name]));

    const targetCampExternalId = args.campaignId ? campIdMap.get(args.campaignId) : args.campaignExternalId;

    const filteredTerms = rawTerms.filter((t) => {
      if (t.date < fromDate || t.date > toDate) return false;
      if (targetCampExternalId && t.campaignExternalId !== targetCampExternalId) return false;
      if (args.adGroupId && t.adGroupId !== args.adGroupId) return false;
      return true;
    });

    // Agregacija po search terminu i oglasnoj grupi
    const termMap = new Map<
      string,
      {
        searchTerm: string;
        campaignExternalId: string;
        campaignName?: string;
        adGroupExternalId: string;
        adGroupName?: string;
        status: string;
        matchType?: string;
        impressions: number;
        clicks: number;
        cost: number;
        conversions: number;
        allConversions: number;
      }
    >();

    let termsImpressions = 0;
    let termsClicks = 0;
    let termsCost = 0;
    let termsConversions = 0;
    let termsAllConversions = 0;

    for (const t of filteredTerms) {
      const imp = t.impressions ?? 0;
      const clk = t.clicks ?? 0;
      const cst = t.cost ?? 0;
      const conv = t.conversions ?? 0;
      const allConv = t.allConversions ?? 0;

      termsImpressions += imp;
      termsClicks += clk;
      termsCost += cst;
      termsConversions += conv;
      termsAllConversions += allConv;

      const key = `${t.campaignExternalId}|${t.adGroupExternalId}|${t.searchTerm}`;
      const existing = termMap.get(key);
      if (existing) {
        existing.impressions += imp;
        existing.clicks += clk;
        existing.cost += cst;
        existing.conversions += conv;
        existing.allConversions += allConv;
        if (t.status && t.status !== "NONE") existing.status = t.status;
        if (t.matchType) existing.matchType = t.matchType;
      } else {
        termMap.set(key, {
          searchTerm: t.searchTerm,
          campaignExternalId: t.campaignExternalId,
          campaignName: campMap.get(t.campaignExternalId),
          adGroupExternalId: t.adGroupExternalId,
          adGroupName: agMap.get(t.adGroupExternalId),
          status: t.status,
          matchType: t.matchType,
          impressions: imp,
          clicks: clk,
          cost: cst,
          conversions: conv,
          allConversions: allConv,
        });
      }
    }

    // Učitavamo ukupne impresije i metrike iz adInsights za zadati period
    const insights = await ctx.db
      .query("adInsights")
      .withIndex("by_workspace_date", (q) =>
        q.eq("workspaceId", wsId).gte("date", fromDate).lte("date", toDate),
      )
      .collect();

    let totalImpressions = 0;
    let totalClicks = 0;
    let totalCost = 0;
    let totalConversions = 0;

    for (const ins of insights) {
      totalImpressions += ins.impressions ?? 0;
      totalClicks += ins.clicks ?? 0;
      totalCost += ins.spend ?? 0;
      totalConversions += ins.conversions ?? 0;
    }

    const coverage = calculateSearchTermCoverage(termsImpressions, totalImpressions);

    const searchTerms = Array.from(termMap.values()).map((st) => ({
      ...st,
      cost: Number(st.cost.toFixed(2)),
      ctr: st.impressions > 0 ? Number((st.clicks / st.impressions).toFixed(4)) : 0,
      cpc: st.clicks > 0 ? Number((st.cost / st.clicks).toFixed(2)) : 0,
      statusDetails: formatSearchTermStatus(st.status),
      matchTypeDetails: formatMatchType(st.matchType),
    }));

    searchTerms.sort((a, b) => b.impressions - a.impressions);

    return {
      searchTerms,
      summary: {
        termsCount: searchTerms.length,
        termsImpressions,
        termsClicks,
        termsCost: Number(termsCost.toFixed(2)),
        termsConversions,
        termsAllConversions,
        totalImpressions: coverage.totalImpressions,
        totalClicks,
        totalCost: Number(totalCost.toFixed(2)),
        totalConversions,
        hiddenImpressions: coverage.hiddenImpressions,
        coverageRatio: coverage.coverageRatio,
        coveragePct: coverage.coveragePct,
        coverageNotice: coverage.notice,
      },
    };
  },
});

/**
 * Dohvata deljene negativne liste (shared_set + shared_criterion) i negativne kriterijume kampanja (GA5 B5).
 */
export const getGoogleAdsNegativeKeywords = query({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    campaignId: v.optional(v.id("adCampaigns")),
  },
  handler: async (ctx, args) => {
    let wsId: Id<"workspaces">;
    if (args.workspaceId) {
      wsId = args.workspaceId;
    } else {
      const membership = await requireMembership(ctx);
      wsId = membership.workspaceId;
    }

    const sharedSets = await ctx.db
      .query("gadsSharedSets")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", wsId))
      .collect();

    const sharedCriteria = await ctx.db
      .query("gadsSharedCriteria")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", wsId))
      .collect();

    const campaignSharedSets = await ctx.db
      .query("gadsCampaignSharedSets")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", wsId))
      .collect();

    const campaigns = await ctx.db
      .query("adCampaigns")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", wsId))
      .collect();
    const campMap = new Map(campaigns.map((c) => [c.externalId, c.name]));

    // Grupisanje kriterijuma po listi
    const criteriaBySet = new Map<string, typeof sharedCriteria>();
    for (const c of sharedCriteria) {
      const list = criteriaBySet.get(c.sharedSetId) ?? [];
      list.push(c);
      criteriaBySet.set(c.sharedSetId, list);
    }

    // Grupisanje vezanih kampanja po listi
    const campaignsBySet = new Map<string, string[]>();
    for (const css of campaignSharedSets) {
      const list = campaignsBySet.get(css.sharedSetId) ?? [];
      list.push(css.campaignExternalId);
      campaignsBySet.set(css.sharedSetId, list);
    }

    const enrichedSets = sharedSets.map((s) => {
      const criteria = (criteriaBySet.get(s.sharedSetId) ?? []).map((c) => ({
        criterionId: c.criterionId,
        type: c.type,
        keywordText: c.keywordText,
        matchType: c.matchType,
        matchTypeDetails: formatMatchType(c.matchType),
      }));

      const linkedCampaignIds = campaignsBySet.get(s.sharedSetId) ?? [];
      const linkedCampaigns = linkedCampaignIds.map((cId) => ({
        campaignExternalId: cId,
        name: campMap.get(cId) ?? `Campaign ${cId}`,
      }));

      return {
        sharedSetId: s.sharedSetId,
        name: s.name,
        type: s.type,
        status: s.status,
        memberCount: s.memberCount ?? criteria.length,
        referenceCount: s.referenceCount ?? linkedCampaigns.length,
        criteria,
        linkedCampaigns,
      };
    });

    // Negativni kriterijumi sa nivoa kampanja (gadsCampaignCriteria gde je negative === true)
    const rawCampaignCriteria = await ctx.db
      .query("gadsCampaignCriteria")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", wsId))
      .collect();

    const campaignNegatives = rawCampaignCriteria
      .filter((c) => c.negative)
      .map((c) => ({
        criterionId: c.criterionId,
        campaignExternalId: c.campaignExternalId,
        campaignName: campMap.get(c.campaignExternalId) ?? `Campaign ${c.campaignExternalId}`,
        type: c.type,
        keyword: c.keyword,
        matchTypeDetails: c.keyword?.matchType ? formatMatchType(c.keyword.matchType) : undefined,
        detailsSummary: c.detailsSummary,
      }));

    return {
      sharedSets: enrichedSets,
      campaignNegatives,
      summary: {
        totalSharedSets: enrichedSets.length,
        totalSharedCriteria: sharedCriteria.length,
        totalCampaignNegatives: campaignNegatives.length,
      },
    };
  },
});

/**
 * Fetch keyword quality scores and metrics report for a campaign, ad group, or workspace (GA5 B1, B2).
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
      const imp = r.impressions ?? 0;
      const clk = r.clicks ?? 0;
      const cst = r.cost ?? 0;
      const conv = r.conversions ?? 0;

      totalImpressions += imp;
      totalClicks += clk;
      totalCost += cst;
      totalConversions += conv;

      // B1: Quality Score koji je definisan i > 0 ulazi u prosek
      if (r.qualityScore !== undefined && r.qualityScore !== null && r.qualityScore > 0) {
        qualityScoreSum += r.qualityScore;
        qualityScoreCount++;
      }

      const existing = map.get(r.keywordId);
      if (existing) {
        existing.impressions += imp;
        existing.clicks += clk;
        existing.cost += cst;
        existing.conversions += conv;
        existing.samples++;
        if (r.qualityScore !== undefined && r.qualityScore > 0) {
          existing.qualityScore = r.qualityScore;
        }
        if (r.creativeQualityScore) {
          existing.creativeQualityScore = r.creativeQualityScore;
        }
        if (r.postClickQualityScore) {
          existing.postClickQualityScore = r.postClickQualityScore;
        }
        if (r.searchPredictedCtr) {
          existing.searchPredictedCtr = r.searchPredictedCtr;
        }
      } else {
        map.set(r.keywordId, {
          keywordId: r.keywordId,
          keywordText: r.keywordText,
          matchType: r.matchType,
          qualityScore: r.qualityScore !== undefined && r.qualityScore > 0 ? r.qualityScore : undefined,
          creativeQualityScore: r.creativeQualityScore,
          postClickQualityScore: r.postClickQualityScore,
          searchPredictedCtr: r.searchPredictedCtr,
          status: r.status,
          impressions: imp,
          clicks: clk,
          cost: cst,
          conversions: conv,
          samples: 1,
        });
      }
    }

    const keywords = Array.from(map.values()).map((k) => ({
      keywordId: k.keywordId,
      keywordText: k.keywordText,
      matchType: k.matchType,
      matchTypeDetails: formatMatchType(k.matchType),
      qualityScore: k.qualityScore,
      qualityScoreDisplay: formatQualityScore(k.qualityScore),
      creativeQualityScore: k.creativeQualityScore,
      creativeQualityDetails: formatQualityComponent(k.creativeQualityScore),
      postClickQualityScore: k.postClickQualityScore,
      postClickQualityDetails: formatQualityComponent(k.postClickQualityScore),
      searchPredictedCtr: k.searchPredictedCtr,
      searchPredictedCtrDetails: formatQualityComponent(k.searchPredictedCtr),
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

/**
 * Dohvata izveštaje segmentacije Google Ads kampanja (GA6 B1-B5).
 *
 * Podržava:
 *   - Geografiju (B1): geographic_view (fizičko prisustvo) i user_location_view (interesovanje) odvojeno.
 *   - Uređaje (B2): segments.device (uključujući OTHER i UNKNOWN).
 *   - Raspored (B3): segments.day_of_week i segments.hour (stvarno trošenje po satima i danima).
 *   - Demografiju (B4): age_range_view i gender_view (sa očuvanim UNDETERMINED).
 *   - Pokrivenost i pravilo B5: zbir po segmentima nije jednak zbiru kampanje; označeno kao razlaganje.
 */
export const getGoogleAdsSegments = query({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    campaignId: v.optional(v.id("adCampaigns")),
    campaignExternalId: v.optional(v.string()),
    from: v.optional(v.string()),
    to: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let wsId: Id<"workspaces">;
    if (args.workspaceId) {
      wsId = args.workspaceId;
    } else {
      const membership = await requireMembership(ctx);
      wsId = membership.workspaceId;
    }

    const fromDate = args.from ?? "1970-01-01";
    const toDate = args.to ?? "2099-12-31";

    const campaigns = await ctx.db
      .query("adCampaigns")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", wsId))
      .collect();
    const campMap = new Map(campaigns.map((c) => [c.externalId, c.name]));
    const campIdMap = new Map(campaigns.map((c) => [c._id, c.externalId]));
    const targetCampExternalId = args.campaignId
      ? campIdMap.get(args.campaignId)
      : args.campaignExternalId;

    // Total campaign insights for coverage calculation
    const insights = await ctx.db
      .query("adInsights")
      .withIndex("by_workspace_date", (q) =>
        q.eq("workspaceId", wsId).gte("date", fromDate).lte("date", toDate),
      )
      .collect();

    let totalCampaignImpressions = 0;
    let totalCampaignClicks = 0;
    let totalCampaignCost = 0;
    let totalCampaignConversions = 0;

    for (const ins of insights) {
      totalCampaignImpressions += ins.impressions ?? 0;
      totalCampaignClicks += ins.clicks ?? 0;
      totalCampaignCost += ins.spend ?? 0;
      totalCampaignConversions += ins.conversions ?? 0;
    }

    // 1. Geographic View (Physical presence) (B1)
    const rawGeo = await ctx.db
      .query("gadsGeographicView")
      .withIndex("by_workspace_date", (q) =>
        q.eq("workspaceId", wsId).gte("date", fromDate).lte("date", toDate),
      )
      .collect();

    const filteredGeo = rawGeo.filter((r) => {
      if (r.date < fromDate || r.date > toDate) return false;
      if (targetCampExternalId && r.campaignExternalId !== targetCampExternalId) return false;
      return true;
    });

    let geoImpressions = 0;
    const geographic = filteredGeo.map((g) => {
      geoImpressions += g.impressions ?? 0;
      return {
        ...g,
        campaignName: campMap.get(g.campaignExternalId),
        locationTypeDetails: formatLocationType(g.locationType),
      };
    });
    const geoCoverage = calculateSegmentCoverage(geoImpressions, totalCampaignImpressions);

    // 2. User Location View (Targeted location / interest) (B1)
    const rawUserLoc = await ctx.db
      .query("gadsUserLocationView")
      .withIndex("by_workspace_date", (q) =>
        q.eq("workspaceId", wsId).gte("date", fromDate).lte("date", toDate),
      )
      .collect();

    const filteredUserLoc = rawUserLoc.filter((r) => {
      if (r.date < fromDate || r.date > toDate) return false;
      if (targetCampExternalId && r.campaignExternalId !== targetCampExternalId) return false;
      return true;
    });

    let userLocImpressions = 0;
    const userLocations = filteredUserLoc.map((u) => {
      userLocImpressions += u.impressions ?? 0;
      return {
        ...u,
        campaignName: campMap.get(u.campaignExternalId),
      };
    });
    const userLocCoverage = calculateSegmentCoverage(userLocImpressions, totalCampaignImpressions);

    // 3. Device breakdown (B2)
    const rawDevice = await ctx.db
      .query("gadsDeviceStats")
      .withIndex("by_workspace_date", (q) =>
        q.eq("workspaceId", wsId).gte("date", fromDate).lte("date", toDate),
      )
      .collect();

    const filteredDevice = rawDevice.filter((r) => {
      if (r.date < fromDate || r.date > toDate) return false;
      if (targetCampExternalId && r.campaignExternalId !== targetCampExternalId) return false;
      return true;
    });

    let deviceImpressions = 0;
    const devices = filteredDevice.map((d) => {
      deviceImpressions += d.impressions ?? 0;
      return {
        ...d,
        campaignName: campMap.get(d.campaignExternalId),
        deviceDetails: formatDeviceType(d.device),
      };
    });
    const deviceCoverage = calculateSegmentCoverage(deviceImpressions, totalCampaignImpressions);

    // 4. Hourly / Schedule breakdown (B3)
    const rawHourly = await ctx.db
      .query("gadsHourlyStats")
      .withIndex("by_workspace_date", (q) =>
        q.eq("workspaceId", wsId).gte("date", fromDate).lte("date", toDate),
      )
      .collect();

    const filteredHourly = rawHourly.filter((r) => {
      if (r.date < fromDate || r.date > toDate) return false;
      if (targetCampExternalId && r.campaignExternalId !== targetCampExternalId) return false;
      return true;
    });

    let hourlyImpressions = 0;
    const hourlySchedule = filteredHourly.map((h) => {
      hourlyImpressions += h.impressions ?? 0;
      return {
        ...h,
        campaignName: campMap.get(h.campaignExternalId),
        dayOfWeekDetails: formatDayOfWeek(h.dayOfWeek),
      };
    });
    const hourlyCoverage = calculateSegmentCoverage(hourlyImpressions, totalCampaignImpressions);

    // 5. Age Range Demographics (B4)
    const rawAge = await ctx.db
      .query("gadsAgeRangeView")
      .withIndex("by_workspace_date", (q) =>
        q.eq("workspaceId", wsId).gte("date", fromDate).lte("date", toDate),
      )
      .collect();

    const filteredAge = rawAge.filter((r) => {
      if (r.date < fromDate || r.date > toDate) return false;
      if (targetCampExternalId && r.campaignExternalId !== targetCampExternalId) return false;
      return true;
    });

    let ageImpressions = 0;
    const ageRanges = filteredAge.map((a) => {
      ageImpressions += a.impressions ?? 0;
      return {
        ...a,
        campaignName: campMap.get(a.campaignExternalId),
        ageRangeDetails: formatAgeRange(a.ageRange),
      };
    });
    const ageCoverage = calculateSegmentCoverage(ageImpressions, totalCampaignImpressions);

    // 6. Gender Demographics (B4)
    const rawGender = await ctx.db
      .query("gadsGenderView")
      .withIndex("by_workspace_date", (q) =>
        q.eq("workspaceId", wsId).gte("date", fromDate).lte("date", toDate),
      )
      .collect();

    const filteredGender = rawGender.filter((r) => {
      if (r.date < fromDate || r.date > toDate) return false;
      if (targetCampExternalId && r.campaignExternalId !== targetCampExternalId) return false;
      return true;
    });

    let genderImpressions = 0;
    const genders = filteredGender.map((g) => {
      genderImpressions += g.impressions ?? 0;
      return {
        ...g,
        campaignName: campMap.get(g.campaignExternalId),
        genderDetails: formatGender(g.gender),
      };
    });
    const genderCoverage = calculateSegmentCoverage(genderImpressions, totalCampaignImpressions);

    return {
      geographic: {
        records: geographic,
        coverage: geoCoverage,
        totalImpressions: geoImpressions,
        description:
          "Fizička lokacija na kojoj se korisnik nalazio u trenutku pretrage (geographic_view). Razlikuje se od user_location_view i ne sme se sabirati sa njom.",
      },
      userLocations: {
        records: userLocations,
        coverage: userLocCoverage,
        totalImpressions: userLocImpressions,
        description:
          "Lokacija za koju se korisnik zanimao (user_location_view). Razlikuje se od geographic_view i ne sme se sabirati sa njom.",
      },
      devices: {
        records: devices,
        coverage: deviceCoverage,
        totalImpressions: deviceImpressions,
      },
      hourlySchedule: {
        records: hourlySchedule,
        coverage: hourlyCoverage,
        totalImpressions: hourlyImpressions,
        description:
          "Stvarno trošenje po satima i danima (segments.hour / segments.day_of_week), a ne raspored dozvole prikazivanja (AD_SCHEDULE).",
      },
      ageRanges: {
        records: ageRanges,
        coverage: ageCoverage,
        totalImpressions: ageImpressions,
      },
      genders: {
        records: genders,
        coverage: genderCoverage,
        totalImpressions: genderImpressions,
      },
      summary: {
        totalCampaignImpressions,
        totalCampaignClicks,
        totalCampaignCost: Number(totalCampaignCost.toFixed(2)),
        totalCampaignConversions,
        isBreakdownOnlyNotice: BREAKDOWN_NOT_SUM_NOTICE,
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

    // Delete quota rows
    // Delete segment rows
    const segmentTables = [
      "gadsGeographicView",
      "gadsUserLocationView",
      "gadsDeviceStats",
      "gadsHourlyStats",
      "gadsAgeRangeView",
      "gadsGenderView",
    ] as const;

    for (const table of segmentTables) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
        .collect();
      for (const r of rows) {
        await ctx.db.delete(r._id);
        deleted++;
      }
    }

    return { deleted };
  },
});

// ── Quota Gate Queries & Mutations ───────────────────────────────────────────

/**
 * Read the current Google Ads rate gate status for a workspace.
 */
export const getGadsGate = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    customerId: v.optional(v.string()),
    now: v.number(),
  },
  handler: async (ctx, { workspaceId, customerId, now }): Promise<GoogleAdsRateGate> => {
    let quotaDoc = null;
    if (customerId) {
      quotaDoc = await ctx.db
        .query("gadsQuota")
        .withIndex("by_workspace_customer", (q) =>
          q.eq("workspaceId", workspaceId).eq("customerId", customerId),
        )
        .first();
    }
    if (!quotaDoc) {
      quotaDoc = await ctx.db
        .query("gadsQuota")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
        .first();
    }

    const { level, dailyLimit } = getGoogleAdsDailyLimit();

    if (!quotaDoc) {
      return {
        state: "ok",
        peakPct: 0,
        consumed24h: 0,
        remaining24h: dailyLimit,
        dailyLimit,
        accessLevel: level,
        stale: false,
        updatedAt: now,
      };
    }

    const operations = quotaDoc.operations ?? [];
    const rolling = calculateRollingQuota(
      operations,
      quotaDoc.dailyLimit ?? dailyLimit,
      now,
    );
    const stale = now - quotaDoc.updatedAt > ROLLING_WINDOW_MS;

    return {
      state: rolling.state,
      peakPct: rolling.peakPct,
      consumed24h: rolling.consumed24h,
      remaining24h: rolling.remaining24h,
      dailyLimit: quotaDoc.dailyLimit ?? dailyLimit,
      accessLevel: (quotaDoc.accessLevel as any) ?? level,
      stale,
      updatedAt: quotaDoc.updatedAt,
    };
  },
});

/**
 * Record operation consumption in the sliding 24-hour window.
 */
export const recordGadsOperations = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    customerId: v.optional(v.string()),
    operationCount: v.number(),
    now: v.number(),
  },
  handler: async (ctx, { workspaceId, customerId, operationCount, now }) => {
    if (operationCount <= 0) return;

    let quotaDoc = null;
    if (customerId) {
      quotaDoc = await ctx.db
        .query("gadsQuota")
        .withIndex("by_workspace_customer", (q) =>
          q.eq("workspaceId", workspaceId).eq("customerId", customerId),
        )
        .first();
    }
    if (!quotaDoc) {
      quotaDoc = await ctx.db
        .query("gadsQuota")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
        .first();
    }

    const { level, dailyLimit } = getGoogleAdsDailyLimit();
    const existingOps = quotaDoc?.operations ?? [];
    const updatedOps = [...existingOps, { timestamp: now, count: operationCount }];
    const rolling = calculateRollingQuota(
      updatedOps,
      quotaDoc?.dailyLimit ?? dailyLimit,
      now,
    );

    const data = {
      workspaceId,
      customerId,
      accessLevel: quotaDoc?.accessLevel ?? level,
      dailyLimit: quotaDoc?.dailyLimit ?? dailyLimit,
      consumed24h: rolling.consumed24h,
      remaining24h: rolling.remaining24h,
      peakPct: rolling.peakPct,
      state: rolling.state,
      operations: updatedOps.filter(
        (o) => o.timestamp >= now - ROLLING_WINDOW_MS,
      ),
      lastCallAt: now,
      updatedAt: now,
    };

    if (quotaDoc) {
      await ctx.db.patch(quotaDoc._id, data);
    } else {
      await ctx.db.insert("gadsQuota", data);
    }
  },
});

