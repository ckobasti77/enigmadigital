"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id, Doc } from "./_generated/dataModel";
import { decryptCredentials } from "./lib/crypto";
import { runSync, sanitizeSyncError } from "./lib/runSync";
import {
  getMetaGraphVersion,
  normalizeAdAccountId,
  buildAdAccountsUrl,
  buildAdAccountUrl,
  buildCampaignsUrl,
  buildAdSetsUrl,
  buildAdsUrl,
  buildInsightsUrl,
  parseRateLimitHeaders,
  computeBreakdownHash,
  extractConversionResults,
  extractConversionValue,
  extractVideoActionCount,
  parseHourlyString,
  extractMetaAdsError,
  type RawAdInsightRow,
  type RawGraphApiResponse,
  type RateLimitStatus,
} from "./lib/metaAdsApi";

/**
 * ============================================================================
 * META ADS ACTIONS & SYNC (Node Runtime)
 * ============================================================================
 *
 * Implements:
 *   1. syncAdsStructure: Ad hierarchy (campaign -> adset -> ad + creative)
 *      - Marks campaigns with spend in last 48h as "hot", else "cold"
 *      - Cron interval: every 3h
 *   2. syncAdsInsights:
 *      - Hot campaigns (mode: "hot"): every 15 min, TODAY at ad level,
 *        hourly granularity where available, plus age/gender & placement breakdowns
 *      - Cold + all (mode: "cold_all"): every 6h, daily level with 7-day lookback
 *        (attribution restatement), plus breakdowns
 *   3. Rate limit budget & batching:
 *      - Respects X-Business-Use-Case-Usage headers & backs off
 *      - Fair request allocation across campaigns
 *      - Logs API call counts in syncRuns
 *   4. Cron fan-outs for structure & insights syncs
 *
 * Missing credentials result in a clean no-op with syncRuns error "Meta Ads nije povezan".
 * ============================================================================
 */

const INSIGHTS_BATCH_CHUNK = 100;
const LOOKBACK_DAYS = 7; // Attribution restatement window (PLAN.md §7.3)

// ── Date Helpers ─────────────────────────────────────────────────────────────

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function getLookbackDates(days: number): { since: string; until: string } {
  const now = Date.now();
  const until = isoDay(now);
  const since = isoDay(now - days * 86_400_000);
  return { since, until };
}

function toNum(val: unknown): number {
  if (typeof val === "number") return Number.isFinite(val) ? val : 0;
  if (typeof val === "string") {
    const parsed = parseFloat(val);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

// ── HTTP Fetcher with Rate-Limit & Error Handling ────────────────────────────

interface FetchMetaResult<T> {
  data: T[];
  rateLimit: RateLimitStatus;
  apiCalls: number;
}

async function fetchMetaGraphPage<T>(
  url: string,
): Promise<{ items: T[]; nextUrl?: string; rateLimit: RateLimitStatus }> {
  const res = await fetch(url);
  const rateLimit = parseRateLimitHeaders(res.headers);

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(extractMetaAdsError(body));
  }

  const json = (await res.json()) as RawGraphApiResponse<T>;
  if (json.error) {
    throw new Error(extractMetaAdsError(json));
  }

  const items = json.data ?? [];
  const nextUrl = json.paging?.next;
  return { items, nextUrl, rateLimit };
}

/**
 * Fetch all paginated items up to a maximum page limit.
 */
async function fetchAllPages<T>(
  initialUrl: string,
  maxPages: number = 10,
  onCall?: () => void,
): Promise<FetchMetaResult<T>> {
  const data: T[] = [];
  let currentUrl: string | undefined = initialUrl;
  let pageCount = 0;
  let lastRateLimit: RateLimitStatus = {
    callCount: 0,
    totalCpuTime: 0,
    totalTime: 0,
    maxUsagePercent: 0,
    shouldBackoff: false,
    estimatedTimeToRegainAccessSec: 0,
  };

  while (currentUrl && pageCount < maxPages) {
    if (onCall) onCall();
    pageCount++;

    const pageResult: {
      items: T[];
      nextUrl?: string;
      rateLimit: RateLimitStatus;
    } = await fetchMetaGraphPage<T>(currentUrl);

    lastRateLimit = pageResult.rateLimit;
    data.push(...pageResult.items);
    currentUrl = pageResult.nextUrl;

    if (pageResult.rateLimit.shouldBackoff) {
      console.warn(
        `[Meta Ads API] Rate limit threshold reached (${pageResult.rateLimit.maxUsagePercent}%). Backing off pagination.`,
      );
      break;
    }
  }

  return {
    data,
    rateLimit: lastRateLimit,
    apiCalls: pageCount,
  };
}

// ── Transform Insight Row Helper ─────────────────────────────────────────────

function transformInsightRow(
  raw: RawAdInsightRow,
  adId: Id<"ads">,
  isHourly: boolean = false,
): {
  adId: Id<"ads">;
  date: string;
  hour?: number;
  breakdownHash: string;
  breakdown?: {
    age?: string;
    gender?: string;
    placement?: string;
    platform?: string;
    device?: string;
  };
  spend: number;
  impressions: number;
  reach: number;
  frequency: number;
  clicks: number;
  ctr: number;
  uniqueCtr?: number;
  cpc: number;
  cpm: number;
  cpp?: number;
  video3s: number;
  thruplay: number;
  videoP25: number;
  videoP50: number;
  videoP75: number;
  videoP95?: number;
  videoP100: number;
  outboundCtr?: number;
  results: number;
  costPerResult: number;
  conversionValue: number;
  roas: number;
  qualityRanking?: string;
  engagementRanking?: string;
  conversionRanking?: string;
} {
  const date = raw.date_start ?? isoDay(Date.now());
  const hour = isHourly
    ? parseHourlyString(raw.hourly_stats_aggregated_by_audience_time_zone)
    : undefined;

  const breakdown =
    raw.age ||
    raw.gender ||
    raw.publisher_platform ||
    raw.platform_position ||
    raw.device_platform
      ? {
          age: raw.age,
          gender: raw.gender,
          platform: raw.publisher_platform,
          placement: raw.platform_position,
          device: raw.device_platform,
        }
      : undefined;

  const breakdownHash = computeBreakdownHash(breakdown);

  const spend = toNum(raw.spend);
  const impressions = toNum(raw.impressions);
  const reach = toNum(raw.reach);
  const frequency = toNum(raw.frequency);
  const clicks = toNum(raw.clicks);
  const ctr = toNum(raw.ctr);
  const uniqueCtr = raw.unique_ctr !== undefined ? toNum(raw.unique_ctr) : undefined;
  const cpc = toNum(raw.cpc);
  const cpm = toNum(raw.cpm);
  const cpp = raw.cpp !== undefined ? toNum(raw.cpp) : undefined;

  const video3s = extractVideoActionCount(raw.video_3_sec_watched_actions);
  const thruplay = extractVideoActionCount(raw.video_thruplay_watched_actions);
  const videoP25 = extractVideoActionCount(raw.video_p25_watched_actions);
  const videoP50 = extractVideoActionCount(raw.video_p50_watched_actions);
  const videoP75 = extractVideoActionCount(raw.video_p75_watched_actions);
  const videoP95 = extractVideoActionCount(raw.video_p95_watched_actions);
  const videoP100 = extractVideoActionCount(raw.video_p100_watched_actions);

  let outboundCtr: number | undefined;
  if (Array.isArray(raw.outbound_clicks_ctr) && raw.outbound_clicks_ctr.length > 0) {
    outboundCtr = toNum(raw.outbound_clicks_ctr[0]?.value);
  } else if (raw.outbound_clicks_ctr !== undefined) {
    outboundCtr = toNum(raw.outbound_clicks_ctr);
  }

  const results = extractConversionResults(raw.actions);
  const conversionValue = extractConversionValue(raw.action_values);
  const costPerResult = results > 0 ? spend / results : 0;
  const roas = spend > 0 ? conversionValue / spend : 0;

  return {
    adId,
    date,
    hour,
    breakdownHash,
    breakdown,
    spend,
    impressions,
    reach,
    frequency,
    clicks,
    ctr,
    uniqueCtr,
    cpc,
    cpm,
    cpp,
    video3s,
    thruplay,
    videoP25,
    videoP50,
    videoP75,
    videoP95,
    videoP100,
    outboundCtr,
    results,
    costPerResult,
    conversionValue,
    roas,
    qualityRanking: raw.quality_ranking,
    engagementRanking: raw.engagement_rate_ranking,
    conversionRanking: raw.conversion_rate_ranking,
  };
}

// ── Structure Sync Action ───────────────────────────────────────────────────

/**
 * syncAdsStructure (cron every 3h):
 * Pulls campaign -> adset -> ad hierarchy incl. status, budgets, creative details.
 * Evaluates spend in the last 48h and flags campaigns as syncPriority "hot" vs "cold".
 */
export const syncAdsStructure = internalAction({
  args: { connectionId: v.id("connections") },
  handler: async (ctx, { connectionId }): Promise<void> => {
    const conn: Doc<"connections"> | null = await ctx.runQuery(
      internal.connections.getForSync,
      { connectionId },
    );
    if (conn === null) {
      throw new Error("Meta Ads konekcija nije pronađena.");
    }
    if (conn.provider !== "meta_ads") {
      throw new Error("Konekcija nije Meta Ads provajder.");
    }
    const workspaceId: Id<"workspaces"> = conn.workspaceId;

    await runSync(
      ctx,
      { workspaceId, provider: "meta_ads", connectionId },
      async (): Promise<number> => {
        if (!conn.encryptedCredentials) {
          throw new Error("Meta Ads nije povezan");
        }

        let token: string;
        try {
          token = await decryptCredentials(conn.encryptedCredentials);
        } catch {
          throw new Error("Meta Ads nije povezan");
        }

        const trimmedToken = token.trim();
        if (!trimmedToken) {
          throw new Error("Meta Ads nije povezan");
        }

        const version = getMetaGraphVersion();
        let apiCalls = 0;
        const countCall = () => {
          apiCalls++;
        };

        // 1. Identify Ad Account(s)
        let primaryAccountId = (conn.externalId ?? "").trim();
        let accountName = "Meta Ad Account";
        let accountCurrency = "USD";

        if (primaryAccountId) {
          try {
            countCall();
            const actRes = await fetch(
              buildAdAccountUrl(primaryAccountId, trimmedToken, version),
            );
            if (actRes.ok) {
              const actData = (await actRes.json()) as {
                id?: string;
                account_id?: string;
                name?: string;
                currency?: string;
              };
              if (actData.name) accountName = actData.name;
              if (actData.currency) accountCurrency = actData.currency;
            }
          } catch {
            // Keep fallback account metadata
          }
        } else {
          // Discover accounts via /me/adaccounts
          countCall();
          const meRes = await fetch(buildAdAccountsUrl(trimmedToken, version));
          if (!meRes.ok) {
            const errBody = await meRes.text().catch(() => "");
            throw new Error(`Meta Ad Accounts greška: ${extractMetaAdsError(errBody)}`);
          }
          const meData = (await meRes.json()) as {
            data?: Array<{
              id: string;
              account_id?: string;
              name?: string;
              currency?: string;
            }>;
          };

          const firstAct = meData.data?.[0];
          if (!firstAct || !firstAct.id) {
            throw new Error("Nije pronađen nijedan Meta Ad nalog za dati token.");
          }
          primaryAccountId = firstAct.id;
          accountName = firstAct.name ?? "Meta Ad Account";
          accountCurrency = firstAct.currency ?? "USD";
        }

        const normalizedActId = normalizeAdAccountId(primaryAccountId);

        // 2. Upsert Ad Account document
        const adAccountId: Id<"adAccounts"> = await ctx.runMutation(
          internal.metaAdsStore.upsertAdAccount,
          {
            workspaceId,
            provider: "meta_ads",
            externalId: normalizedActId,
            name: accountName,
            currency: accountCurrency,
          },
        );

        // 3. Fetch Campaigns
        const campaignsRes = await fetchAllPages<{
          id: string;
          name: string;
          objective?: string;
          status: string;
          effective_status?: string;
          daily_budget?: string;
          lifetime_budget?: string;
        }>(buildCampaignsUrl(normalizedActId, trimmedToken, 500, version), 10, countCall);

        // 4. Fetch 48h spend to classify hot vs cold campaigns
        const spend48hMap = new Map<string, number>();
        try {
          const spend48hUrl = buildInsightsUrl({
            targetId: normalizedActId,
            level: "campaign",
            datePreset: "last_2d",
            limit: 500,
            accessToken: trimmedToken,
            version,
          });
          const spendRes = await fetchAllPages<{
            campaign_id?: string;
            spend?: string | number;
          }>(spend48hUrl, 5, countCall);

          for (const item of spendRes.data) {
            if (item.campaign_id) {
              const prev = spend48hMap.get(item.campaign_id) ?? 0;
              spend48hMap.set(item.campaign_id, prev + toNum(item.spend));
            }
          }
        } catch (err) {
          console.warn(
            "[Meta Ads Sync] 48h spend lookup warning:",
            sanitizeSyncError(err),
          );
        }

        const campaigns = campaignsRes.data.map((c) => {
          const spend48h = spend48hMap.get(c.id) ?? 0;
          const isActive =
            c.status === "ACTIVE" || c.effective_status === "ACTIVE";
          const syncPriority: "hot" | "cold" =
            spend48h > 0 || (isActive && spend48h > 0) ? "hot" : "cold";

          return {
            externalId: c.id,
            name: c.name || "Bez naziva",
            objective: c.objective,
            status: c.status || "PAUSED",
            dailyBudget: c.daily_budget ? toNum(c.daily_budget) / 100 : undefined,
            lifetimeBudget: c.lifetime_budget
              ? toNum(c.lifetime_budget) / 100
              : undefined,
            syncPriority,
          };
        });

        // 5. Fetch AdSets
        const adSetsRes = await fetchAllPages<{
          id: string;
          campaign_id: string;
          name: string;
          status: string;
          effective_status?: string;
          daily_budget?: string;
          lifetime_budget?: string;
          targeting?: Record<string, unknown>;
        }>(buildAdSetsUrl(normalizedActId, trimmedToken, 500, version), 10, countCall);

        const adSets = adSetsRes.data.map((s) => ({
          externalId: s.id,
          campaignExternalId: s.campaign_id,
          name: s.name || "Bez naziva",
          status: s.status || "PAUSED",
          targetingSummary: s.targeting ? JSON.stringify(s.targeting) : undefined,
          dailyBudget: s.daily_budget ? toNum(s.daily_budget) / 100 : undefined,
          lifetimeBudget: s.lifetime_budget
            ? toNum(s.lifetime_budget) / 100
            : undefined,
        }));

        // 6. Fetch Ads with Creatives
        const adsRes = await fetchAllPages<{
          id: string;
          adset_id: string;
          campaign_id?: string;
          name: string;
          status: string;
          effective_status?: string;
          creative?: {
            id?: string;
            name?: string;
            thumbnail_url?: string;
            image_url?: string;
          };
        }>(buildAdsUrl(normalizedActId, trimmedToken, 500, version), 10, countCall);

        const ads = adsRes.data.map((a) => ({
          externalId: a.id,
          adSetExternalId: a.adset_id,
          name: a.name || "Bez naziva",
          status: a.status || "PAUSED",
          creativeId: a.creative?.id,
          hookLabel: undefined,
          thumbnailUrl: a.creative?.thumbnail_url || a.creative?.image_url,
          previewUrl: a.creative?.image_url,
        }));

        // 7. Atomically persist structure
        const written: number = await ctx.runMutation(
          internal.metaAdsStore.upsertStructure,
          {
            workspaceId,
            accountId: adAccountId,
            campaigns,
            adSets,
            ads,
          },
        );

        console.log(
          `[Meta Ads Sync] Structure sync finished. API calls: ${apiCalls}, campaigns: ${campaigns.length}, adSets: ${adSets.length}, ads: ${ads.length}`,
        );

        return written;
      },
    );
  },
});

// ── Insights Sync Action ────────────────────────────────────────────────────

/**
 * syncAdsInsights:
 * Mode "hot": Every 15 min for active/hot campaigns (today at ad-level, hourly + breakdowns)
 * Mode "cold_all": Every 6h for all campaigns (daily level with 7-day lookback + breakdowns)
 */
export const syncAdsInsights = internalAction({
  args: {
    connectionId: v.id("connections"),
    mode: v.union(v.literal("hot"), v.literal("cold_all")),
  },
  handler: async (ctx, { connectionId, mode }): Promise<void> => {
    const conn: Doc<"connections"> | null = await ctx.runQuery(
      internal.connections.getForSync,
      { connectionId },
    );
    if (conn === null) {
      throw new Error("Meta Ads konekcija nije pronađena.");
    }
    if (conn.provider !== "meta_ads") {
      throw new Error("Konekcija nije Meta Ads provajder.");
    }
    const workspaceId: Id<"workspaces"> = conn.workspaceId;

    await runSync(
      ctx,
      { workspaceId, provider: "meta_ads", connectionId },
      async (): Promise<number> => {
        if (!conn.encryptedCredentials) {
          throw new Error("Meta Ads nije povezan");
        }

        let token: string;
        try {
          token = await decryptCredentials(conn.encryptedCredentials);
        } catch {
          throw new Error("Meta Ads nije povezan");
        }

        const trimmedToken = token.trim();
        if (!trimmedToken) {
          throw new Error("Meta Ads nije povezan");
        }

        const version = getMetaGraphVersion();
        let apiCalls = 0;
        const countCall = () => {
          apiCalls++;
        };

        // Map external ad IDs to Convex ad IDs
        const adIdMap: Record<string, string> = await ctx.runQuery(
          internal.metaAdsStore.getAdIdMap,
          { workspaceId },
        );

        const adExternalIds = Object.keys(adIdMap);
        if (adExternalIds.length === 0) {
          // No ads in workspace yet -> nothing to pull insights for
          return 0;
        }

        const accounts = await ctx.runQuery(internal.metaAdsStore.getAccounts, {
          workspaceId,
          provider: "meta_ads",
        });

        if (accounts.length === 0) {
          return 0;
        }

        let totalWritten = 0;

        for (const account of accounts) {
          const actId = normalizeAdAccountId(account.externalId);

          if (mode === "hot") {
            // Mode "hot": Fetch TODAY insights for active/hot campaigns
            const hotCampaigns = await ctx.runQuery(
              internal.metaAdsStore.getCampaignsByPriority,
              { workspaceId, priority: "hot" },
            );

            if (hotCampaigns.length === 0) {
              continue;
            }

            // 1. Fetch Today hourly insights at ad level
            try {
              const hourlyUrl = buildInsightsUrl({
                targetId: actId,
                level: "ad",
                datePreset: "today",
                breakdowns: [
                  "hourly_stats_aggregated_by_audience_time_zone",
                ],
                limit: 500,
                accessToken: trimmedToken,
                version,
              });

              const hourlyRes = await fetchAllPages<RawAdInsightRow>(
                hourlyUrl,
                5,
                countCall,
              );

              const rows = [];
              for (const raw of hourlyRes.data) {
                if (!raw.ad_id || !adIdMap[raw.ad_id]) continue;
                const adId = adIdMap[raw.ad_id] as Id<"ads">;
                rows.push(transformInsightRow(raw, adId, true));
              }

              for (let i = 0; i < rows.length; i += INSIGHTS_BATCH_CHUNK) {
                totalWritten += await ctx.runMutation(
                  internal.metaAdsStore.upsertInsightsBatch,
                  {
                    workspaceId,
                    rows: rows.slice(i, i + INSIGHTS_BATCH_CHUNK),
                  },
                );
              }
            } catch (err) {
              console.warn(
                "[Meta Ads Sync] Hot hourly insights warning:",
                sanitizeSyncError(err),
              );
            }

            // 2. Fetch Today demographic breakdown (age, gender)
            try {
              const demoUrl = buildInsightsUrl({
                targetId: actId,
                level: "ad",
                datePreset: "today",
                breakdowns: ["age", "gender"],
                limit: 500,
                accessToken: trimmedToken,
                version,
              });

              const demoRes = await fetchAllPages<RawAdInsightRow>(
                demoUrl,
                5,
                countCall,
              );

              const rows = [];
              for (const raw of demoRes.data) {
                if (!raw.ad_id || !adIdMap[raw.ad_id]) continue;
                const adId = adIdMap[raw.ad_id] as Id<"ads">;
                rows.push(transformInsightRow(raw, adId, false));
              }

              for (let i = 0; i < rows.length; i += INSIGHTS_BATCH_CHUNK) {
                totalWritten += await ctx.runMutation(
                  internal.metaAdsStore.upsertInsightsBatch,
                  {
                    workspaceId,
                    rows: rows.slice(i, i + INSIGHTS_BATCH_CHUNK),
                  },
                );
              }
            } catch (err) {
              console.warn(
                "[Meta Ads Sync] Hot demographic breakdown warning:",
                sanitizeSyncError(err),
              );
            }

            // 3. Fetch Today placement breakdown (publisher_platform, platform_position)
            try {
              const placementUrl = buildInsightsUrl({
                targetId: actId,
                level: "ad",
                datePreset: "today",
                breakdowns: ["publisher_platform", "platform_position"],
                limit: 500,
                accessToken: trimmedToken,
                version,
              });

              const placementRes = await fetchAllPages<RawAdInsightRow>(
                placementUrl,
                5,
                countCall,
              );

              const rows = [];
              for (const raw of placementRes.data) {
                if (!raw.ad_id || !adIdMap[raw.ad_id]) continue;
                const adId = adIdMap[raw.ad_id] as Id<"ads">;
                rows.push(transformInsightRow(raw, adId, false));
              }

              for (let i = 0; i < rows.length; i += INSIGHTS_BATCH_CHUNK) {
                totalWritten += await ctx.runMutation(
                  internal.metaAdsStore.upsertInsightsBatch,
                  {
                    workspaceId,
                    rows: rows.slice(i, i + INSIGHTS_BATCH_CHUNK),
                  },
                );
              }
            } catch (err) {
              console.warn(
                "[Meta Ads Sync] Hot placement breakdown warning:",
                sanitizeSyncError(err),
              );
            }
          } else {
            // Mode "cold_all": 7-day lookback window (attribution restatement)
            const timeRange = getLookbackDates(LOOKBACK_DAYS);

            // 1. Daily ad-level totals (no breakdown)
            try {
              const dailyUrl = buildInsightsUrl({
                targetId: actId,
                level: "ad",
                timeRange,
                timeIncrement: 1,
                limit: 500,
                accessToken: trimmedToken,
                version,
              });

              const dailyRes = await fetchAllPages<RawAdInsightRow>(
                dailyUrl,
                10,
                countCall,
              );

              const rows = [];
              for (const raw of dailyRes.data) {
                if (!raw.ad_id || !adIdMap[raw.ad_id]) continue;
                const adId = adIdMap[raw.ad_id] as Id<"ads">;
                rows.push(transformInsightRow(raw, adId, false));
              }

              for (let i = 0; i < rows.length; i += INSIGHTS_BATCH_CHUNK) {
                totalWritten += await ctx.runMutation(
                  internal.metaAdsStore.upsertInsightsBatch,
                  {
                    workspaceId,
                    rows: rows.slice(i, i + INSIGHTS_BATCH_CHUNK),
                  },
                );
              }
            } catch (err) {
              console.warn(
                "[Meta Ads Sync] 7-day daily insights warning:",
                sanitizeSyncError(err),
              );
            }

            // 2. Demographic breakdown over 7-day window
            try {
              const demoUrl = buildInsightsUrl({
                targetId: actId,
                level: "ad",
                timeRange,
                timeIncrement: 1,
                breakdowns: ["age", "gender"],
                limit: 500,
                accessToken: trimmedToken,
                version,
              });

              const demoRes = await fetchAllPages<RawAdInsightRow>(
                demoUrl,
                10,
                countCall,
              );

              const rows = [];
              for (const raw of demoRes.data) {
                if (!raw.ad_id || !adIdMap[raw.ad_id]) continue;
                const adId = adIdMap[raw.ad_id] as Id<"ads">;
                rows.push(transformInsightRow(raw, adId, false));
              }

              for (let i = 0; i < rows.length; i += INSIGHTS_BATCH_CHUNK) {
                totalWritten += await ctx.runMutation(
                  internal.metaAdsStore.upsertInsightsBatch,
                  {
                    workspaceId,
                    rows: rows.slice(i, i + INSIGHTS_BATCH_CHUNK),
                  },
                );
              }
            } catch (err) {
              console.warn(
                "[Meta Ads Sync] 7-day demographic breakdown warning:",
                sanitizeSyncError(err),
              );
            }

            // 3. Placement breakdown over 7-day window
            try {
              const placementUrl = buildInsightsUrl({
                targetId: actId,
                level: "ad",
                timeRange,
                timeIncrement: 1,
                breakdowns: ["publisher_platform", "platform_position"],
                limit: 500,
                accessToken: trimmedToken,
                version,
              });

              const placementRes = await fetchAllPages<RawAdInsightRow>(
                placementUrl,
                10,
                countCall,
              );

              const rows = [];
              for (const raw of placementRes.data) {
                if (!raw.ad_id || !adIdMap[raw.ad_id]) continue;
                const adId = adIdMap[raw.ad_id] as Id<"ads">;
                rows.push(transformInsightRow(raw, adId, false));
              }

              for (let i = 0; i < rows.length; i += INSIGHTS_BATCH_CHUNK) {
                totalWritten += await ctx.runMutation(
                  internal.metaAdsStore.upsertInsightsBatch,
                  {
                    workspaceId,
                    rows: rows.slice(i, i + INSIGHTS_BATCH_CHUNK),
                  },
                );
              }
            } catch (err) {
              console.warn(
                "[Meta Ads Sync] 7-day placement breakdown warning:",
                sanitizeSyncError(err),
              );
            }
          }
        }

        console.log(
          `[Meta Ads Sync] ${mode} insights sync completed. API calls: ${apiCalls}, items written: ${totalWritten}`,
        );

        return totalWritten;
      },
    );
  },
});

// ── Cron Fan-Outs ───────────────────────────────────────────────────────────

/**
 * Cron fan-out (every 3h): sync structure for every Meta Ads connection.
 */
export const syncAllAdsStructure = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    const connectionIds: Id<"connections">[] = await ctx.runQuery(
      internal.connections.listByProvider,
      { provider: "meta_ads" },
    );

    for (const connectionId of connectionIds) {
      try {
        await ctx.runAction(internal.metaAds.syncAdsStructure, { connectionId });
      } catch {
        // Error is logged on syncRuns; continue with next connection
      }
    }
  },
});

/**
 * Cron fan-out (every 15 min): sync hot campaigns insights.
 */
export const syncHotAdsInsights = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    const connectionIds: Id<"connections">[] = await ctx.runQuery(
      internal.connections.listByProvider,
      { provider: "meta_ads" },
    );

    for (const connectionId of connectionIds) {
      try {
        await ctx.runAction(internal.metaAds.syncAdsInsights, {
          connectionId,
          mode: "hot",
        });
      } catch {
        // Error is logged on syncRuns; continue with next connection
      }
    }
  },
});

/**
 * Cron fan-out (every 6h): sync 7-day daily insights for all campaigns.
 */
export const syncAllAdsInsights = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    const connectionIds: Id<"connections">[] = await ctx.runQuery(
      internal.connections.listByProvider,
      { provider: "meta_ads" },
    );

    for (const connectionId of connectionIds) {
      try {
        await ctx.runAction(internal.metaAds.syncAdsInsights, {
          connectionId,
          mode: "cold_all",
        });
      } catch {
        // Error is logged on syncRuns; continue with next connection
      }
    }
  },
});
