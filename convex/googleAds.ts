"use node";

import { internalAction } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import { GoogleAdsApi, enums } from "google-ads-api";
import { decryptCredentials } from "./lib/crypto";
import { runSync, sanitizeSyncError } from "./lib/runSync";

interface GoogleAdsCredentials {
  developerToken: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  customerId: string;
  loginCustomerId?: string;
}

function parseCredentials(secretJson: string): GoogleAdsCredentials {
  let parsed: unknown;
  try {
    parsed = JSON.parse(secretJson);
  } catch {
    throw new Error("Google Ads kredencijali nisu validan JSON format.");
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Google Ads kredencijali moraju biti JSON objekat.");
  }

  const p = parsed as Record<string, unknown>;
  const developerToken = String(p.developerToken || p.developer_token || "").trim();
  const clientId = String(p.clientId || p.client_id || "").trim();
  const clientSecret = String(p.clientSecret || p.client_secret || "").trim();
  const refreshToken = String(p.refreshToken || p.refresh_token || "").trim();
  const customerId = String(p.customerId || p.customer_id || "").trim().replace(/-/g, "");
  const loginCustomerId = String(p.loginCustomerId || p.login_customer_id || "").trim().replace(/-/g, "") || undefined;

  if (!developerToken) {
    throw new Error("Nedostaje developer token (developer_token).");
  }
  if (!clientId || !clientSecret) {
    throw new Error("Nedostaju OAuth client_id ili client_secret.");
  }
  if (!refreshToken) {
    throw new Error("Nedostaje OAuth refresh_token.");
  }
  if (!customerId) {
    throw new Error("Nedostaje customer_id.");
  }

  return {
    developerToken,
    clientId,
    clientSecret,
    refreshToken,
    customerId,
    loginCustomerId,
  };
}

/**
 * Format date YYYY-MM-DD for N days ago.
 */
function getLookbackDates(days = 7): { startDate: string; endDate: string } {
  const today = new Date();
  const past = new Date();
  past.setDate(today.getDate() - days);

  const startDate = past.toISOString().split("T")[0];
  const endDate = today.toISOString().split("T")[0];
  return { startDate, endDate };
}

/**
 * Sync Google Ads data for a specific connection.
 */
export const syncGoogleAds = internalAction({
  args: { connectionId: v.id("connections") },
  handler: async (ctx, { connectionId }) => {
    const conn = await ctx.runQuery(internal.connections.getForSync, {
      connectionId,
    });

    if (conn === null || conn.provider !== "google_ads") {
      throw new ConvexError({
        code: "invalid",
        message: "Google Ads konekcija nije pronađena.",
      });
    }

    const { workspaceId, encryptedCredentials } = conn;

    await runSync(
      ctx,
      { workspaceId, provider: "google_ads", connectionId },
      async () => {
        const plaintext = await decryptCredentials(encryptedCredentials);
        const creds = parseCredentials(plaintext);

        const client = new GoogleAdsApi({
          client_id: creds.clientId,
          client_secret: creds.clientSecret,
          developer_token: creds.developerToken,
        });

        const customer = client.Customer({
          customer_id: creds.customerId,
          refresh_token: creds.refreshToken,
          login_customer_id: creds.loginCustomerId || undefined,
        });

        // 1. Query Account Info
        let accountName = `Google Ads (${creds.customerId})`;
        let currencyCode = "EUR";

        try {
          const customerResults = await customer.query(`
            SELECT
              customer.id,
              customer.descriptive_name,
              customer.currency_code,
              customer.time_zone
            FROM customer
            LIMIT 1
          `);

          if (customerResults && customerResults.length > 0) {
            const first = customerResults[0] as {
              customer?: {
                descriptive_name?: string;
                currency_code?: string;
              };
            };
            if (first.customer?.descriptive_name) {
              accountName = first.customer.descriptive_name;
            }
            if (first.customer?.currency_code) {
              currencyCode = first.customer.currency_code;
            }
          }
        } catch {
          // If customer resource query fails, continue with default name
        }

        const { startDate, endDate } = getLookbackDates(7);

        // 2. Query Campaigns & Search Impression Share
        const campaignShareMap = new Map<string, number>();
        try {
          const campaignShareResults = await customer.query(`
            SELECT
              campaign.id,
              metrics.search_impression_share
            FROM campaign
            WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
          `);

          for (const row of campaignShareResults as Array<{
            campaign?: { id?: number | string };
            metrics?: { search_impression_share?: number | string };
          }>) {
            const cId = String(row.campaign?.id || "");
            const share = row.metrics?.search_impression_share;
            if (cId && typeof share === "number") {
              campaignShareMap.set(cId, share);
            }
          }
        } catch {
          // Search impression share query optional
        }

        // 3. Query All Active / Paused Campaigns for full structure
        const campaignMap = new Map<
          string,
          {
            externalId: string;
            name: string;
            objective?: string;
            status: string;
            dailyBudget?: number;
            searchImpressionShare?: number;
            syncPriority: "hot" | "cold";
          }
        >();

        try {
          const campaignsList = await customer.query(`
            SELECT
              campaign.id,
              campaign.name,
              campaign.status,
              campaign.advertising_channel_type,
              campaign_budget.amount_micros
            FROM campaign
            WHERE campaign.status != 'REMOVED'
          `);

          for (const row of campaignsList as Array<{
            campaign?: {
              id?: number | string;
              name?: string;
              status?: number | string;
              advertising_channel_type?: number | string;
            };
            campaign_budget?: {
              amount_micros?: number | string;
            };
          }>) {
            const externalId = String(row.campaign?.id || "");
            if (!externalId) continue;

            const name = String(row.campaign?.name || `Campaign ${externalId}`);
            let status = "PAUSED";
            const rawStatus = row.campaign?.status;
            if (
              rawStatus === enums.CampaignStatus.ENABLED ||
              rawStatus === "ENABLED" ||
              rawStatus === 2
            ) {
              status = "ACTIVE";
            }

            const budgetMicros = Number(row.campaign_budget?.amount_micros || 0);
            const dailyBudget = budgetMicros > 0 ? Number((budgetMicros / 1_000_000).toFixed(2)) : undefined;
            const searchImpressionShare = campaignShareMap.get(externalId);

            campaignMap.set(externalId, {
              externalId,
              name,
              objective: String(row.campaign?.advertising_channel_type || "SEARCH"),
              status,
              dailyBudget,
              searchImpressionShare,
              syncPriority: status === "ACTIVE" ? "hot" : "cold",
            });
          }
        } catch {
          // If structure query fails, we fall back to ad_group_ad data
        }

        // 4. Query Ad Group Ad Level Performance with 7-day lookback
        const adGroupMap = new Map<
          string,
          {
            externalId: string;
            campaignExternalId: string;
            name: string;
            status: string;
          }
        >();

        const adMap = new Map<
          string,
          {
            externalId: string;
            adGroupExternalId: string;
            name: string;
            status: string;
            previewUrl?: string;
          }
        >();

        const insightRows: Array<{
          adExternalId: string;
          date: string;
          spend: number;
          impressions: number;
          reach: number;
          frequency: number;
          clicks: number;
          ctr: number;
          cpc: number;
          cpm: number;
          results: number;
          costPerResult: number;
          conversionValue: number;
          roas: number;
          searchImpressionShare?: number;
        }> = [];

        try {
          const adResults = await customer.query(`
            SELECT
              campaign.id,
              campaign.name,
              campaign.status,
              ad_group.id,
              ad_group.name,
              ad_group.status,
              ad_group_ad.ad.id,
              ad_group_ad.ad.name,
              ad_group_ad.ad.final_urls,
              ad_group_ad.status,
              segments.date,
              metrics.impressions,
              metrics.clicks,
              metrics.ctr,
              metrics.average_cpc,
              metrics.cost_micros,
              metrics.conversions,
              metrics.conversions_value
            FROM ad_group_ad
            WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
              AND campaign.status != 'REMOVED'
              AND ad_group.status != 'REMOVED'
              AND ad_group_ad.status != 'REMOVED'
          `);

          for (const row of adResults as Array<{
            campaign?: { id?: number | string; name?: string; status?: number | string };
            ad_group?: { id?: number | string; name?: string; status?: number | string };
            ad_group_ad?: {
              status?: number | string;
              ad?: {
                id?: number | string;
                name?: string;
                final_urls?: string[];
              };
            };
            segments?: { date?: string };
            metrics?: {
              impressions?: number | string;
              clicks?: number | string;
              ctr?: number | string;
              average_cpc?: number | string;
              cost_micros?: number | string;
              conversions?: number | string;
              conversions_value?: number | string;
            };
          }>) {
            const campaignExternalId = String(row.campaign?.id || "");
            const adGroupExternalId = String(row.ad_group?.id || "");
            const adExternalId = String(row.ad_group_ad?.ad?.id || "");
            const date = String(row.segments?.date || "");

            if (!campaignExternalId || !adGroupExternalId || !adExternalId || !date) {
              continue;
            }

            // Register Campaign if missing
            if (!campaignMap.has(campaignExternalId)) {
              let campStatus = "PAUSED";
              if (
                row.campaign?.status === enums.CampaignStatus.ENABLED ||
                row.campaign?.status === "ENABLED" ||
                row.campaign?.status === 2
              ) {
                campStatus = "ACTIVE";
              }
              campaignMap.set(campaignExternalId, {
                externalId: campaignExternalId,
                name: String(row.campaign?.name || `Campaign ${campaignExternalId}`),
                status: campStatus,
                syncPriority: campStatus === "ACTIVE" ? "hot" : "cold",
                searchImpressionShare: campaignShareMap.get(campaignExternalId),
              });
            }

            // Register Ad Group
            if (!adGroupMap.has(adGroupExternalId)) {
              let agStatus = "PAUSED";
              if (
                row.ad_group?.status === enums.AdGroupStatus.ENABLED ||
                row.ad_group?.status === "ENABLED" ||
                row.ad_group?.status === 2
              ) {
                agStatus = "ENABLED";
              }
              adGroupMap.set(adGroupExternalId, {
                externalId: adGroupExternalId,
                campaignExternalId,
                name: String(row.ad_group?.name || `Ad Group ${adGroupExternalId}`),
                status: agStatus,
              });
            }

            // Register Ad
            if (!adMap.has(adExternalId)) {
              let aStatus = "PAUSED";
              if (
                row.ad_group_ad?.status === enums.AdGroupAdStatus.ENABLED ||
                row.ad_group_ad?.status === "ENABLED" ||
                row.ad_group_ad?.status === 2
              ) {
                aStatus = "ACTIVE";
              }
              const finalUrls = row.ad_group_ad?.ad?.final_urls;
              const previewUrl = Array.isArray(finalUrls) && finalUrls.length > 0 ? finalUrls[0] : undefined;

              adMap.set(adExternalId, {
                externalId: adExternalId,
                adGroupExternalId,
                name: String(row.ad_group_ad?.ad?.name || `Ad ${adExternalId}`),
                status: aStatus,
                previewUrl,
              });
            }

            // Metrics
            const impressions = Number(row.metrics?.impressions || 0);
            const clicks = Number(row.metrics?.clicks || 0);
            const costMicros = Number(row.metrics?.cost_micros || 0);
            const spend = Number((costMicros / 1_000_000).toFixed(2));
            const results = Number(row.metrics?.conversions || 0);
            const conversionValue = Number(row.metrics?.conversions_value || 0);

            const ctr = impressions > 0 ? clicks / impressions : 0;
            const avgCpcMicros = Number(row.metrics?.average_cpc || 0);
            const cpc = clicks > 0 ? spend / clicks : avgCpcMicros > 0 ? avgCpcMicros / 1_000_000 : 0;
            const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
            const costPerResult = results > 0 ? spend / results : 0;
            const roas = spend > 0 ? conversionValue / spend : 0;
            const searchImpressionShare = campaignShareMap.get(campaignExternalId);

            insightRows.push({
              adExternalId,
              date,
              spend,
              impressions,
              reach: impressions,
              frequency: 1,
              clicks,
              ctr: Number(ctr.toFixed(4)),
              cpc: Number(cpc.toFixed(2)),
              cpm: Number(cpm.toFixed(2)),
              results,
              costPerResult: Number(costPerResult.toFixed(2)),
              conversionValue: Number(conversionValue.toFixed(2)),
              roas: Number(roas.toFixed(2)),
              searchImpressionShare,
            });
          }
        } catch (err) {
          // Log query error and continue to keyword view
          console.warn("Google Ads ad_group_ad GAQL query warning:", sanitizeSyncError(err));
        }

        // 5. Query Keyword Quality Scores & Metrics
        const keywordQualityRows: Array<{
          campaignExternalId: string;
          adGroupExternalId: string;
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
          date: string;
        }> = [];

        try {
          const keywordResults = await customer.query(`
            SELECT
              campaign.id,
              ad_group.id,
              ad_group_criterion.criterion_id,
              ad_group_criterion.keyword.text,
              ad_group_criterion.keyword.match_type,
              ad_group_criterion.quality_info.quality_score,
              ad_group_criterion.quality_info.creative_quality_score,
              ad_group_criterion.quality_info.post_click_quality_score,
              ad_group_criterion.quality_info.search_predicted_ctr,
              ad_group_criterion.status,
              segments.date,
              metrics.impressions,
              metrics.clicks,
              metrics.cost_micros,
              metrics.conversions
            FROM keyword_view
            WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
              AND ad_group_criterion.status != 'REMOVED'
          `);

          for (const row of keywordResults as Array<{
            campaign?: { id?: number | string };
            ad_group?: { id?: number | string };
            ad_group_criterion?: {
              criterion_id?: number | string;
              keyword?: {
                text?: string;
                match_type?: number | string;
              };
              quality_info?: {
                quality_score?: number;
                creative_quality_score?: number | string;
                post_click_quality_score?: number | string;
                search_predicted_ctr?: number | string;
              };
              status?: number | string;
            };
            segments?: { date?: string };
            metrics?: {
              impressions?: number | string;
              clicks?: number | string;
              cost_micros?: number | string;
              conversions?: number | string;
            };
          }>) {
            const campaignExternalId = String(row.campaign?.id || "");
            const adGroupExternalId = String(row.ad_group?.id || "");
            const keywordId = String(row.ad_group_criterion?.criterion_id || "");
            const keywordText = String(row.ad_group_criterion?.keyword?.text || "");
            const date = String(row.segments?.date || "");

            if (!keywordId || !keywordText || !date) continue;

            const matchTypeRaw = row.ad_group_criterion?.keyword?.match_type;
            let matchType = "BROAD";
            if (matchTypeRaw === enums.KeywordMatchType.EXACT || matchTypeRaw === "EXACT" || matchTypeRaw === 2) {
              matchType = "EXACT";
            } else if (matchTypeRaw === enums.KeywordMatchType.PHRASE || matchTypeRaw === "PHRASE" || matchTypeRaw === 3) {
              matchType = "PHRASE";
            }

            const qualityScore = row.ad_group_criterion?.quality_info?.quality_score;
            const creativeQualityScore = String(row.ad_group_criterion?.quality_info?.creative_quality_score || "UNKNOWN");
            const postClickQualityScore = String(row.ad_group_criterion?.quality_info?.post_click_quality_score || "UNKNOWN");
            const searchPredictedCtr = String(row.ad_group_criterion?.quality_info?.search_predicted_ctr || "UNKNOWN");

            const impressions = Number(row.metrics?.impressions || 0);
            const clicks = Number(row.metrics?.clicks || 0);
            const costMicros = Number(row.metrics?.cost_micros || 0);
            const cost = Number((costMicros / 1_000_000).toFixed(2));
            const conversions = Number(row.metrics?.conversions || 0);

            keywordQualityRows.push({
              campaignExternalId,
              adGroupExternalId,
              keywordId,
              keywordText,
              matchType,
              qualityScore: qualityScore && qualityScore > 0 ? qualityScore : undefined,
              creativeQualityScore,
              postClickQualityScore,
              searchPredictedCtr,
              status: "ENABLED",
              impressions,
              clicks,
              cost,
              conversions,
              date,
            });
          }
        } catch (err) {
          console.warn("Google Ads keyword_view GAQL query warning:", sanitizeSyncError(err));
        }

        // 6. Persist everything to Convex in atomic mutation
        const written = await ctx.runMutation(
          internal.googleAdsStore.upsertGoogleAdsData,
          {
            workspaceId,
            account: {
              externalId: creds.customerId,
              name: accountName,
              currency: currencyCode,
            },
            campaigns: Array.from(campaignMap.values()),
            adGroups: Array.from(adGroupMap.values()),
            ads: Array.from(adMap.values()),
            insights: insightRows,
            keywordQuality: keywordQualityRows,
          },
        );

        return written;
      },
    );
  },
});

/**
 * Cron entry point: Fan-out to sync all active Google Ads connections.
 */
export const syncAllGoogleAds = internalAction({
  args: {},
  handler: async (ctx) => {
    const connectionIds = await ctx.runQuery(
      internal.connections.listByProvider,
      { provider: "google_ads" },
    );

    for (const connectionId of connectionIds) {
      try {
        await ctx.runAction(internal.googleAds.syncGoogleAds, {
          connectionId,
        });
      } catch (err) {
        console.error(
          `Automated sync failed for Google Ads connection ${connectionId}:`,
          sanitizeSyncError(err),
        );
      }
    }
  },
});
