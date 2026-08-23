"use node";

import { internalAction } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import { decryptCredentials } from "./lib/crypto";
import { runSync, sanitizeSyncError } from "./lib/runSync";
import {
  microsToUnits,
  normalizeCustomerId,
  getGoogleAdsDeveloperToken,
  executeGaqlResource,
  summarizeGoogleAdsSync,
  type GoogleAdsResourceOutcome,
  type GoogleAdsSyncSummary,
} from "./lib/googleAdsShared";
import {
  getGoogleAdsAccessToken,
  queryGoogleAdsSearchStream,
} from "./lib/googleAdsApi";
import { buildGaqlQuery } from "./lib/googleAdsCatalog";
import { calculateGoogleAdsBackfillDepth } from "./lib/googleAdsBackfill";
import {
  checkGoogleAdsQuota,
  readGadsGate,
} from "./lib/googleAdsQuota";

import type { Id } from "./_generated/dataModel";

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
 * Sync Google Ads structure and performance data for a specific connection (GA3, GA7).
 *
 * Rules:
 *   - Authentication via Google Service Account JSON & JWT exchange (A1, A2).
 *   - Developer token loaded strictly from GOOGLE_ADS_DEVELOPER_TOKEN env variable (A3).
 *   - Pre-flight quota check (B1): if skipped, job does not run.
 *   - All GAQL queries are constructed via `buildGaqlQuery` (B5).
 *   - Budgets are separate entities and support explicitly_shared (B2).
 *   - Currency conversion through `microsToUnits` (B4).
 *   - Offline verifiable without live network.
 */
export const syncGoogleAds = internalAction({
  args: { connectionId: v.id("connections") },
  handler: async (
    ctx,
    { connectionId },
  ): Promise<
    | { skipped: true; reason: string; remaining: number; peakPct: number }
    | GoogleAdsSyncSummary
  > => {
    const conn: {
      workspaceId: Id<"workspaces">;
      provider: string;
      externalId?: string;
      externalIdAlt?: string;
      encryptedCredentials: string;
    } | null = await ctx.runQuery(internal.connections.getForSync, {
      connectionId,
    });

    if (conn === null || conn.provider !== "google_ads") {
      throw new ConvexError({
        code: "invalid",
        message: "Google Ads konekcija nije pronađena.",
      });
    }

    const { workspaceId, encryptedCredentials } = conn;

    const rawCustomerId = conn.externalId;
    if (!rawCustomerId || typeof rawCustomerId !== "string") {
      throw new Error("Google Ads konekcija nema konfigurisan Customer ID.");
    }
    const customerId = normalizeCustomerId(rawCustomerId);
    const loginCustomerId = conn.externalIdAlt ? normalizeCustomerId(conn.externalIdAlt) : undefined;

    // A3: Proveri da li je GOOGLE_ADS_DEVELOPER_TOKEN podešen u environment varijablama
    const developerToken = getGoogleAdsDeveloperToken();

    // A1, A2: Dekriptuj i parsiraj Service Account JSON, pa preuzmi JWT access token
    const plaintext = await decryptCredentials(encryptedCredentials);
    let sa: { client_email?: string; private_key?: string };
    try {
      sa = JSON.parse(plaintext);
    } catch {
      throw new Error("Google Ads servisni nalog nije validan JSON format.");
    }

    if (!sa.client_email || !sa.private_key) {
      throw new Error("Google Ads servisni nalog ne sadrži client_email ili private_key.");
    }

    const accessToken = await getGoogleAdsAccessToken({
      client_email: sa.client_email,
      private_key: sa.private_key,
    });

    // ── B1) Pre-flight kvotna kapija ──────────────────────────────────────────
    const gate = await readGadsGate(ctx, workspaceId, customerId);
    const quotaCheck = checkGoogleAdsQuota(gate.consumed24h, gate.dailyLimit, 1);
    if (quotaCheck.skipped) {
      console.warn(
        `[syncGoogleAds] Sinhronizacija Google Ads naloga ${customerId} za radni prostor ${workspaceId} je sprečena kvotnom kapijom: ${quotaCheck.reason}`,
      );
      return {
        skipped: true,
        reason: quotaCheck.reason,
        remaining: quotaCheck.remaining,
        peakPct: quotaCheck.peakPct,
      };
    }

    const outcomes: GoogleAdsResourceOutcome[] = [];
    let summaryResult: GoogleAdsSyncSummary | undefined;

    await runSync(
      ctx,
      { workspaceId, provider: "google_ads", connectionId },
      async (): Promise<{ itemsWritten: number; note?: string }> => {
        const queryGaql = (query: string) =>
          queryGoogleAdsSearchStream({
            customerId,
            query,
            accessToken,
            developerToken,
            loginCustomerId,
          });

        // ── 1. Query Conversion Actions FIRST (GA4 B1, B2) ───────────────────
        const conversionActions: Array<{
          id: string;
          name: string;
          status: string;
          category?: string;
          type?: string;
          primaryForGoal: boolean;
          countingType?: string;
          attributionModel?: string;
          clickThroughLookupWindowDays?: number;
          viewThroughLookupWindowDays?: number;
        }> = [];

        const caResults = await executeGaqlResource("conversion_action", outcomes, async () => {
          const conversionActionQuery = buildGaqlQuery({
            resource: "conversion_action",
            fields: [
              "conversion_action.id",
              "conversion_action.name",
              "conversion_action.status",
              "conversion_action.category",
              "conversion_action.type",
              "conversion_action.primary_for_goal",
              "conversion_action.counting_type",
              "conversion_action.attribution_model_settings.attribution_model",
              "conversion_action.click_through_lookback_window_days",
              "conversion_action.view_through_lookback_window_days",
            ],
            where: "conversion_action.status != 'REMOVED'",
          });

          return (await queryGaql(conversionActionQuery)) as any[];
        });

        for (const row of caResults as Array<{
          conversion_action?: {
            id?: number | string;
            name?: string;
            status?: number | string;
            category?: number | string;
            type?: number | string;
            primary_for_goal?: boolean;
            counting_type?: number | string;
            attribution_model_settings?: {
              attribution_model?: number | string;
            };
            click_through_lookback_window_days?: number | string;
            click_through_lookup_window_days?: number | string;
            view_through_lookback_window_days?: number | string;
            view_through_lookup_window_days?: number | string;
          };
        }>) {
          const ca = row.conversion_action;
          if (!ca || !ca.id) continue;

          const id = String(ca.id);
          const name = String(ca.name || `Conversion Action ${id}`);

          let status = "ENABLED";
          const rawStatus = ca.status;
          if (
            rawStatus === "PAUSED" ||
            rawStatus === 3
          ) {
            status = "PAUSED";
          } else if (
            rawStatus === "REMOVED" ||
            rawStatus === 4
          ) {
            status = "REMOVED";
          } else if (
            rawStatus === "HIDDEN" ||
            rawStatus === 5
          ) {
            status = "HIDDEN";
          }

          const rawClickWindow =
            ca.click_through_lookback_window_days ?? ca.click_through_lookup_window_days;
          const clickWindow =
            rawClickWindow !== undefined && rawClickWindow !== null && rawClickWindow !== ""
              ? Number(rawClickWindow)
              : undefined;

          const rawViewWindow =
            ca.view_through_lookback_window_days ?? ca.view_through_lookup_window_days;
          const viewWindow =
            rawViewWindow !== undefined && rawViewWindow !== null && rawViewWindow !== ""
              ? Number(rawViewWindow)
              : undefined;

          conversionActions.push({
            id,
            name,
            status,
            category: ca.category !== undefined ? String(ca.category) : undefined,
            type: ca.type !== undefined ? String(ca.type) : undefined,
            primaryForGoal: Boolean(ca.primary_for_goal),
            countingType: ca.counting_type !== undefined ? String(ca.counting_type) : undefined,
            attributionModel:
              ca.attribution_model_settings?.attribution_model !== undefined
                ? String(ca.attribution_model_settings.attribution_model)
                : undefined,
            clickThroughLookupWindowDays:
              clickWindow !== undefined && Number.isFinite(clickWindow) ? clickWindow : undefined,
            viewThroughLookupWindowDays:
              viewWindow !== undefined && Number.isFinite(viewWindow) ? viewWindow : undefined,
          });
        }

        // ── 2. Derive Dynamic Backfill Depth (GA4 B2) ─────────────────────────
        const backfillResult = calculateGoogleAdsBackfillDepth(conversionActions);
        let lookbackDays = 7;

        if (backfillResult.skipped) {
          console.warn(
            `[syncGoogleAds] Dinamički backfill konverzija za nalog ${customerId} je preskočen: ${backfillResult.reason}`,
          );
        } else {
          lookbackDays = backfillResult.depth;
        }

        const { startDate, endDate } = getLookbackDates(lookbackDays);

        // ── 3. Query Customer Client (MCC & Account Hierarchy) ────────────────
        const customerClients: Array<{
          clientCustomer: string;
          customerId: string;
          descriptiveName: string;
          currencyCode?: string;
          timeZone?: string;
          manager: boolean;
          level: number;
          status: string;
          hidden?: boolean;
        }> = [];

        let accountName = `Google Ads (${customerId})`;
        let currencyCode: string | undefined = undefined;

        const ccResults = await executeGaqlResource("customer_client", outcomes, async () => {
          const customerClientQuery = buildGaqlQuery({
            resource: "customer_client",
            fields: [
              "customer_client.client_customer",
              "customer_client.id",
              "customer_client.descriptive_name",
              "customer_client.currency_code",
              "customer_client.time_zone",
              "customer_client.manager",
              "customer_client.level",
              "customer_client.status",
              "customer_client.hidden",
            ],
          });

          return (await queryGaql(customerClientQuery)) as any[];
        });

        for (const row of ccResults as Array<{
          customer_client?: {
            client_customer?: string;
            id?: number | string;
            descriptive_name?: string;
            currency_code?: string;
            time_zone?: string;
            manager?: boolean;
            level?: number;
            status?: number | string;
            hidden?: boolean;
          };
        }>) {
          const cc = row.customer_client;
          if (!cc || !cc.id) continue;

          const cId = normalizeCustomerId(String(cc.id));
          const name = String(cc.descriptive_name || `Account ${cId}`);
          let status = "ENABLED";
          if (cc.status === "CANCELED" || cc.status === 3) {
            status = "CANCELED";
          } else if (cc.status === "SUSPENDED" || cc.status === 4) {
            status = "SUSPENDED";
          } else if (cc.status === "CLOSED" || cc.status === 5) {
            status = "CLOSED";
          }

          if (cId === customerId) {
            accountName = name;
            if (cc.currency_code && typeof cc.currency_code === "string" && cc.currency_code.trim() !== "") {
              currencyCode = cc.currency_code.trim();
            }
          }

          customerClients.push({
            clientCustomer: String(cc.client_customer || `customers/${cId}`),
            customerId: cId,
            descriptiveName: name,
            currencyCode: cc.currency_code,
            timeZone: cc.time_zone,
            manager: Boolean(cc.manager),
            level: Number(cc.level ?? 0),
            status,
            hidden: cc.hidden !== undefined ? Boolean(cc.hidden) : undefined,
          });
        }

        // ── 4. Query Campaign Budgets (GA3 B2, B3, B4) ─────────────────────────
        const budgetList: Array<{
          budgetId: string;
          name: string;
          amount?: number;
          totalAmount?: number;
          status?: string;
          deliveryMethod?: string;
          explicitlyShared: boolean;
          referenceCount?: number;
        }> = [];

        const budgetResults = await executeGaqlResource("campaign_budget", outcomes, async () => {
          const budgetQuery = buildGaqlQuery({
            resource: "campaign_budget",
            fields: [
              "campaign_budget.id",
              "campaign_budget.name",
              "campaign_budget.amount_micros",
              "campaign_budget.total_amount_micros",
              "campaign_budget.status",
              "campaign_budget.delivery_method",
              "campaign_budget.explicitly_shared",
              "campaign_budget.reference_count",
            ],
            where: "campaign_budget.status != 'REMOVED'",
          });

          return (await queryGaql(budgetQuery)) as any[];
        });

        for (const row of budgetResults as Array<{
          campaign_budget?: {
            id?: number | string;
            name?: string;
            amount_micros?: number | string;
            total_amount_micros?: number | string;
            status?: number | string;
            delivery_method?: number | string;
            explicitly_shared?: boolean;
            reference_count?: number | string;
          };
        }>) {
          const b = row.campaign_budget;
          if (!b || !b.id) continue;

          const budgetId = String(b.id);
          const name = String(b.name || `Budget ${budgetId}`);
          const amount = microsToUnits(b.amount_micros);
          const totalAmount = microsToUnits(b.total_amount_micros);

          let status = "ENABLED";
          if (b.status === "REMOVED" || b.status === 3) {
            status = "REMOVED";
          }

          let deliveryMethod = "STANDARD";
          if (b.delivery_method === "ACCELERATED" || b.delivery_method === 3) {
            deliveryMethod = "ACCELERATED";
          }

          const explicitlyShared = Boolean(b.explicitly_shared);
          const referenceCount =
            b.reference_count !== undefined ? Number(b.reference_count) : undefined;

          budgetList.push({
            budgetId,
            name,
            amount: amount !== undefined ? Number(amount.toFixed(2)) : undefined,
            totalAmount: totalAmount !== undefined ? Number(totalAmount.toFixed(2)) : undefined,
            status,
            deliveryMethod,
            explicitlyShared,
            referenceCount,
          });
        }

        // ── 5. Query Campaigns & Search Impression Share ──────────────────────
        const campaignShareMap = new Map<string, number>();

        const campaignShareResults = await executeGaqlResource(
          "campaign_search_impression_share",
          outcomes,
          async () => {
            const campaignShareQuery = buildGaqlQuery({
              resource: "campaign",
              fields: [
                "campaign.id",
                "metrics.search_impression_share",
              ],
              segments: ["segments.date"],
              dateRange: { startDate, endDate },
              where: "campaign.status != 'REMOVED'",
            });

            return (await queryGaql(campaignShareQuery)) as any[];
          },
        );

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

        // ── 4. Query All Active / Paused Campaigns for full structure ──────────
        const campaignMap = new Map<
          string,
          {
            externalId: string;
            name: string;
            objective?: string;
            status: string;
            dailyBudget?: number;
            budgetId?: string;
            startDate?: string;
            endDate?: string;
            searchImpressionShare?: number;
            syncPriority: "hot" | "cold";
          }
        >();

        const campaignsList = await executeGaqlResource("campaign", outcomes, async () => {
          const campaignQuery = buildGaqlQuery({
            resource: "campaign",
            fields: [
              "campaign.id",
              "campaign.name",
              "campaign.status",
              "campaign.advertising_channel_type",
              "campaign.campaign_budget",
              "campaign.start_date",
              "campaign.end_date",
            ],
            where: "campaign.status != 'REMOVED'",
          });

          return (await queryGaql(campaignQuery)) as any[];
        });

        for (const row of campaignsList as Array<{
          campaign?: {
            id?: number | string;
            name?: string;
            status?: number | string;
            advertising_channel_type?: number | string;
            campaign_budget?: string;
            start_date?: string;
            end_date?: string;
          };
        }>) {
          const externalId = String(row.campaign?.id || "");
          if (!externalId) continue;

          const name = String(row.campaign?.name || `Campaign ${externalId}`);
          let status = "PAUSED";
          const rawStatus = row.campaign?.status;
          if (
            rawStatus === "ENABLED" ||
            rawStatus === 2 ||
            rawStatus === "HOT" ||
            rawStatus === "ACTIVE"
          ) {
            status = "ACTIVE";
          }

          const rawBudgetId = String(row.campaign?.campaign_budget || "");
          const cleanBudgetId = rawBudgetId.includes("/")
            ? rawBudgetId.split("/").pop() || rawBudgetId
            : rawBudgetId;

          const matchedBudget = budgetList.find(
            (b) => b.budgetId === cleanBudgetId || b.budgetId === rawBudgetId,
          );
          const dailyBudget = matchedBudget?.amount;

          const searchImpressionShare = campaignShareMap.get(externalId);

          campaignMap.set(externalId, {
            externalId,
            name,
            objective: String(row.campaign?.advertising_channel_type || "SEARCH"),
            status,
            dailyBudget,
            budgetId: cleanBudgetId || undefined,
            startDate: row.campaign?.start_date,
            endDate: row.campaign?.end_date,
            searchImpressionShare,
            syncPriority: status === "ACTIVE" ? "hot" : "cold",
          });
        }

        // ── 7. Query Ad Groups (ad_group) ─────────────────────────────────────
        const adGroupMap = new Map<
          string,
          {
            externalId: string;
            campaignExternalId: string;
            name: string;
            status: string;
            targetingSummary?: string;
            dailyBudget?: number;
          }
        >();

        const adGroupResults = await executeGaqlResource("ad_group", outcomes, async () => {
          const adGroupQuery = buildGaqlQuery({
            resource: "ad_group",
            fields: [
              "campaign.id",
              "campaign.name",
              "ad_group.id",
              "ad_group.name",
              "ad_group.status",
              "ad_group.type",
              "ad_group.cpc_bid_micros",
            ],
            where: [
              "campaign.status != 'REMOVED'",
              "ad_group.status != 'REMOVED'",
            ],
          });

          return (await queryGaql(adGroupQuery)) as any[];
        });

        for (const row of adGroupResults as Array<{
          campaign?: { id?: number | string; name?: string };
          ad_group?: {
            id?: number | string;
            name?: string;
            status?: number | string;
            type?: number | string;
            cpc_bid_micros?: number | string;
          };
        }>) {
          const campaignExternalId = String(row.campaign?.id || "");
          const adGroupId = String(row.ad_group?.id || "");
          if (!campaignExternalId || !adGroupId) continue;

          let agStatus = "PAUSED";
          if (
            row.ad_group?.status === "ENABLED" ||
            row.ad_group?.status === 2
          ) {
            agStatus = "ENABLED";
          }

          const cpcBid = microsToUnits(row.ad_group?.cpc_bid_micros);
          const targetingSummary =
            cpcBid !== undefined
              ? `CPC Bid: ${cpcBid.toFixed(2)}${currencyCode ? ` ${currencyCode}` : ""}`
              : undefined;

          adGroupMap.set(adGroupId, {
            externalId: adGroupId,
            campaignExternalId,
            name: String(row.ad_group?.name || `Ad Group ${adGroupId}`),
            status: agStatus,
            targetingSummary,
          });
        }

        // ── 8. Query Campaign Criteria (Targeting) (GA3) ──────────────────────
        const campaignCriteriaList: Array<{
          campaignExternalId: string;
          criterionId: string;
          type: string;
          negative: boolean;
          status?: string;
          bidModifier?: number;
          location?: { geoTargetConstant: string; displayName?: string };
          language?: { languageConstant: string; code?: string };
          adSchedule?: {
            dayOfWeek: string;
            startHour: number;
            startMinute: string;
            endHour: number;
            endMinute: string;
          };
          keyword?: { text: string; matchType: string };
          device?: { type: string };
          detailsSummary?: string;
        }> = [];

        const criteriaResults = await executeGaqlResource("campaign_criterion", outcomes, async () => {
          const criteriaQuery = buildGaqlQuery({
            resource: "campaign_criterion",
            fields: [
              "campaign.id",
              "campaign_criterion.criterion_id",
              "campaign_criterion.type",
              "campaign_criterion.negative",
              "campaign_criterion.status",
              "campaign_criterion.bid_modifier",
              "campaign_criterion.location.geo_target_constant",
              "campaign_criterion.language.language_constant",
              "campaign_criterion.ad_schedule.day_of_week",
              "campaign_criterion.ad_schedule.start_hour",
              "campaign_criterion.ad_schedule.start_minute",
              "campaign_criterion.ad_schedule.end_hour",
              "campaign_criterion.ad_schedule.end_minute",
              "campaign_criterion.keyword.text",
              "campaign_criterion.keyword.match_type",
              "campaign_criterion.device.type",
            ],
            where: "campaign.status != 'REMOVED'",
          });

          return (await queryGaql(criteriaQuery)) as any[];
        });

        for (const row of criteriaResults as Array<{
          campaign?: { id?: number | string };
          campaign_criterion?: {
            criterion_id?: number | string;
            type?: number | string;
            negative?: boolean;
            status?: number | string;
            bid_modifier?: number;
            location?: { geo_target_constant?: string };
            language?: { language_constant?: string };
            ad_schedule?: {
              day_of_week?: number | string;
              start_hour?: number;
              start_minute?: number | string;
              end_hour?: number;
              end_minute?: number | string;
            };
            keyword?: { text?: string; match_type?: number | string };
            device?: { type?: number | string };
          };
        }>) {
          const cId = String(row.campaign?.id || "");
          const crit = row.campaign_criterion;
          if (!cId || !crit || !crit.criterion_id) continue;

          const criterionId = String(crit.criterion_id);
          const rawType = String(crit.type || "UNKNOWN");
          const negative = Boolean(crit.negative);
          const bidModifier = typeof crit.bid_modifier === "number" ? crit.bid_modifier : undefined;

          let detailsSummary = `${rawType}${negative ? " (Isključeno)" : ""}`;

          let locationObj: { geoTargetConstant: string; displayName?: string } | undefined = undefined;
          if (crit.location?.geo_target_constant) {
            const constant = String(crit.location.geo_target_constant);
            detailsSummary = `Lokacija: ${constant.replace("geoTargetConstants/", "")}`;
            locationObj = { geoTargetConstant: constant, displayName: detailsSummary };
          }

          let languageObj: { languageConstant: string; code?: string } | undefined = undefined;
          if (crit.language?.language_constant) {
            const constant = String(crit.language.language_constant);
            detailsSummary = `Jezik: ${constant.replace("languageConstants/", "")}`;
            languageObj = { languageConstant: constant, code: detailsSummary };
          }

          let adScheduleObj: {
            dayOfWeek: string;
            startHour: number;
            startMinute: string;
            endHour: number;
            endMinute: string;
          } | undefined = undefined;
          if (crit.ad_schedule) {
            const s = crit.ad_schedule;
            const day = String(s.day_of_week || "UNKNOWN");
            const startH = Number(s.start_hour ?? 0);
            const startM = String(s.start_minute || "ZERO");
            const endH = Number(s.end_hour ?? 24);
            const endM = String(s.end_minute || "ZERO");
            detailsSummary = `Raspored: ${day} ${startH}:00 - ${endH}:00`;
            adScheduleObj = {
              dayOfWeek: day,
              startHour: startH,
              startMinute: startM,
              endHour: endH,
              endMinute: endM,
            };
          }

          let keywordObj: { text: string; matchType: string } | undefined = undefined;
          if (crit.keyword?.text) {
            const kwText = String(crit.keyword.text);
            const matchType = String(crit.keyword.match_type || "BROAD");
            detailsSummary = `${negative ? "Negativna reč" : "Ključna reč"}: "${kwText}" (${matchType})`;
            keywordObj = { text: kwText, matchType };
          }

          let deviceObj: { type: string } | undefined = undefined;
          if (crit.device?.type) {
            const dType = String(crit.device.type);
            detailsSummary = `Uređaj: ${dType}`;
            deviceObj = { type: dType };
          }

          campaignCriteriaList.push({
            campaignExternalId: cId,
            criterionId,
            type: rawType,
            negative,
            status: "ENABLED",
            bidModifier,
            location: locationObj,
            language: languageObj,
            adSchedule: adScheduleObj,
            keyword: keywordObj,
            device: deviceObj,
            detailsSummary,
          });
        }

        // ── 7. Query Ad Performance (ad_group_ad) with lookback ───────────────
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
          spend?: number;
          impressions?: number;
          reach?: number;
          frequency?: number;
          clicks?: number;
          ctr?: number;
          cpc?: number;
          cpm?: number;
          results?: number;
          conversions?: number;
          allConversions?: number;
          allConversionsValue?: number;
          costPerResult?: number;
          conversionValue?: number;
          roas?: number;
          searchImpressionShare?: number;
        }> = [];

        const adResults = await executeGaqlResource("ad_group_ad", outcomes, async () => {
          const adResultsQuery = buildGaqlQuery({
            resource: "ad_group_ad",
            fields: [
              "campaign.id",
              "campaign.name",
              "campaign.status",
              "ad_group.id",
              "ad_group.name",
              "ad_group.status",
              "ad_group_ad.ad.id",
              "ad_group_ad.ad.name",
              "ad_group_ad.ad.final_urls",
              "ad_group_ad.status",
              "metrics.impressions",
              "metrics.clicks",
              "metrics.ctr",
              "metrics.average_cpc",
              "metrics.cost_micros",
              "metrics.conversions",
              "metrics.conversions_value_micros",
              "metrics.all_conversions",
              "metrics.all_conversions_value_micros",
            ],
            segments: ["segments.date"],
            dateRange: { startDate, endDate },
            where: [
              "campaign.status != 'REMOVED'",
              "ad_group.status != 'REMOVED'",
              "ad_group_ad.status != 'REMOVED'",
            ],
          });

          return (await queryGaql(adResultsQuery)) as any[];
        });

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
            conversions_value_micros?: number | string;
            all_conversions?: number | string;
            all_conversions_value_micros?: number | string;
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

          // Register Ad Group if missing
          if (!adGroupMap.has(adGroupExternalId)) {
            let agStatus = "PAUSED";
            if (
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
          const rawImpressions = row.metrics?.impressions;
          const impressions =
            rawImpressions !== undefined && rawImpressions !== null
              ? Number(rawImpressions)
              : undefined;

          const rawClicks = row.metrics?.clicks;
          const clicks =
            rawClicks !== undefined && rawClicks !== null
              ? Number(rawClicks)
              : undefined;

          const spend = microsToUnits(row.metrics?.cost_micros);

          const rawConversions = row.metrics?.conversions;
          const conversions =
            rawConversions !== undefined &&
            rawConversions !== null &&
            !isNaN(Number(rawConversions))
              ? Number(rawConversions)
              : undefined;

          const rawAllConversions = row.metrics?.all_conversions;
          const allConversions =
            rawAllConversions !== undefined &&
            rawAllConversions !== null &&
            !isNaN(Number(rawAllConversions))
              ? Number(rawAllConversions)
              : undefined;

          const rawConversionsValue = row.metrics?.conversions_value_micros;
          const conversionValue = microsToUnits(rawConversionsValue);

          const rawAllConversionsValue = row.metrics?.all_conversions_value_micros;
          const allConversionsValue = microsToUnits(rawAllConversionsValue);

          const ctr =
            impressions !== undefined && impressions > 0 && clicks !== undefined
              ? Number((clicks / impressions).toFixed(4))
              : undefined;

          const avgCpc = microsToUnits(row.metrics?.average_cpc);
          const cpc =
            spend !== undefined && clicks !== undefined && clicks > 0
              ? Number((spend / clicks).toFixed(2))
              : avgCpc !== undefined
                ? Number(avgCpc.toFixed(2))
                : undefined;

          const cpm =
            spend !== undefined && impressions !== undefined && impressions > 0
              ? Number(((spend / impressions) * 1000).toFixed(2))
              : undefined;

          const costPerResult =
            spend !== undefined && conversions !== undefined && conversions > 0
              ? Number((spend / conversions).toFixed(2))
              : undefined;

          const roas =
            spend !== undefined && spend > 0 && conversionValue !== undefined
              ? Number((conversionValue / spend).toFixed(2))
              : undefined;

          const searchImpressionShare = campaignShareMap.get(campaignExternalId);

          insightRows.push({
            adExternalId,
            date,
            spend: spend !== undefined ? Number(spend.toFixed(2)) : undefined,
            impressions,
            reach: impressions,
            frequency: impressions !== undefined ? 1 : undefined,
            clicks,
            ctr,
            cpc,
            cpm,
            results: conversions,
            conversions,
            allConversions,
            allConversionsValue:
              allConversionsValue !== undefined
                ? Number(allConversionsValue.toFixed(2))
                : undefined,
            costPerResult,
            conversionValue:
              conversionValue !== undefined
                ? Number(conversionValue.toFixed(2))
                : undefined,
            roas,
            searchImpressionShare,
          });
        }

        // ── 9. Query Keyword Quality Scores & Metrics (keyword_view) ──────────
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
          impressions?: number;
          clicks?: number;
          cost?: number;
          conversions?: number;
          allConversions?: number;
          date: string;
        }> = [];

        const keywordResults = await executeGaqlResource("keyword_view", outcomes, async () => {
          const keywordQuery = buildGaqlQuery({
            resource: "keyword_view",
            fields: [
              "campaign.id",
              "ad_group.id",
              "ad_group_criterion.criterion_id",
              "ad_group_criterion.keyword.text",
              "ad_group_criterion.keyword.match_type",
              "ad_group_criterion.quality_info.quality_score",
              "ad_group_criterion.quality_info.creative_quality_score",
              "ad_group_criterion.quality_info.post_click_quality_score",
              "ad_group_criterion.quality_info.search_predicted_ctr",
              "ad_group_criterion.status",
              "metrics.impressions",
              "metrics.clicks",
              "metrics.cost_micros",
              "metrics.conversions",
              "metrics.all_conversions",
            ],
            segments: ["segments.date"],
            dateRange: { startDate, endDate },
            where: "ad_group_criterion.status != 'REMOVED'",
          });

          return (await queryGaql(keywordQuery)) as any[];
        });

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
            all_conversions?: number | string;
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
          if (matchTypeRaw === "EXACT" || matchTypeRaw === 2) {
            matchType = "EXACT";
          } else if (matchTypeRaw === "PHRASE" || matchTypeRaw === 3) {
            matchType = "PHRASE";
          }

          const rawQualityScore = row.ad_group_criterion?.quality_info?.quality_score;
          const qualityScore =
            rawQualityScore !== undefined &&
            rawQualityScore !== null &&
            Number(rawQualityScore) >= 1 &&
            Number(rawQualityScore) <= 10
              ? Number(rawQualityScore)
              : undefined;

          const creativeQualityScore =
            row.ad_group_criterion?.quality_info?.creative_quality_score !== undefined
              ? String(row.ad_group_criterion.quality_info.creative_quality_score)
              : undefined;
          const postClickQualityScore =
            row.ad_group_criterion?.quality_info?.post_click_quality_score !== undefined
              ? String(row.ad_group_criterion.quality_info.post_click_quality_score)
              : undefined;
          const searchPredictedCtr =
            row.ad_group_criterion?.quality_info?.search_predicted_ctr !== undefined
              ? String(row.ad_group_criterion.quality_info.search_predicted_ctr)
              : undefined;

          const rawImpressions = row.metrics?.impressions;
          const impressions =
            rawImpressions !== undefined && rawImpressions !== null
              ? Number(rawImpressions)
              : undefined;

          const rawClicks = row.metrics?.clicks;
          const clicks =
            rawClicks !== undefined && rawClicks !== null
              ? Number(rawClicks)
              : undefined;

          const cost = microsToUnits(row.metrics?.cost_micros);

          const rawConversions = row.metrics?.conversions;
          const conversions =
            rawConversions !== undefined &&
            rawConversions !== null &&
            !isNaN(Number(rawConversions))
              ? Number(rawConversions)
              : undefined;

          const rawAllConversions = row.metrics?.all_conversions;
          const allConversions =
            rawAllConversions !== undefined &&
            rawAllConversions !== null &&
            !isNaN(Number(rawAllConversions))
              ? Number(rawAllConversions)
              : undefined;

          keywordQualityRows.push({
            campaignExternalId,
            adGroupExternalId,
            keywordId,
            keywordText,
            matchType,
            qualityScore,
            creativeQualityScore,
            postClickQualityScore,
            searchPredictedCtr,
            status: "ENABLED",
            impressions,
            clicks,
            cost: cost !== undefined ? Number(cost.toFixed(2)) : undefined,
            conversions,
            allConversions,
            date,
          });
        }

        // ── 10. Query Search Terms (search_term_view) (GA5 B3, B4) ───────────
        const searchTermRows: Array<{
          campaignExternalId: string;
          adGroupExternalId: string;
          searchTerm: string;
          status: string;
          matchType?: string;
          impressions?: number;
          clicks?: number;
          cost?: number;
          conversions?: number;
          allConversions?: number;
          date: string;
        }> = [];

        const searchTermResults = await executeGaqlResource("search_term_view", outcomes, async () => {
          const searchTermQuery = buildGaqlQuery({
            resource: "search_term_view",
            fields: [
              "campaign.id",
              "ad_group.id",
              "search_term_view.search_term",
              "search_term_view.status",
              "metrics.impressions",
              "metrics.clicks",
              "metrics.cost_micros",
              "metrics.conversions",
              "metrics.all_conversions",
            ],
            segments: [
              "segments.date",
              "segments.search_term_match_type",
            ],
            dateRange: { startDate, endDate },
            where: [
              "campaign.status != 'REMOVED'",
              "ad_group.status != 'REMOVED'",
            ],
          });

          return (await queryGaql(searchTermQuery)) as any[];
        });

        for (const row of searchTermResults as Array<{
          campaign?: { id?: number | string };
          ad_group?: { id?: number | string };
          search_term_view?: {
            search_term?: string;
            status?: number | string;
          };
          segments?: {
            date?: string;
            search_term_match_type?: number | string;
          };
          metrics?: {
            impressions?: number | string;
            clicks?: number | string;
            cost_micros?: number | string;
            conversions?: number | string;
            all_conversions?: number | string;
          };
        }>) {
          const campaignExternalId = String(row.campaign?.id || "");
          const adGroupExternalId = String(row.ad_group?.id || "");
          const searchTerm = String(row.search_term_view?.search_term || "");
          const date = String(row.segments?.date || "");

          if (!campaignExternalId || !adGroupExternalId || !searchTerm || !date) {
            continue;
          }

          let status = "NONE";
          const rawStatus = row.search_term_view?.status;
          if (rawStatus === "ADDED" || rawStatus === 2) {
            status = "ADDED";
          } else if (rawStatus === "EXCLUDED" || rawStatus === 3) {
            status = "EXCLUDED";
          } else if (rawStatus === "NONE" || rawStatus === 1) {
            status = "NONE";
          }

          let matchType = "BROAD";
          const rawMatchType = row.segments?.search_term_match_type;
          if (rawMatchType === "EXACT" || rawMatchType === 2) {
            matchType = "EXACT";
          } else if (rawMatchType === "PHRASE" || rawMatchType === 3) {
            matchType = "PHRASE";
          } else if (rawMatchType === "NEAR_EXACT" || rawMatchType === 4) {
            matchType = "NEAR_EXACT";
          } else if (rawMatchType === "NEAR_PHRASE" || rawMatchType === 5) {
            matchType = "NEAR_PHRASE";
          }

          const rawImpressions = row.metrics?.impressions;
          const impressions =
            rawImpressions !== undefined && rawImpressions !== null
              ? Number(rawImpressions)
              : undefined;

          const rawClicks = row.metrics?.clicks;
          const clicks =
            rawClicks !== undefined && rawClicks !== null
              ? Number(rawClicks)
              : undefined;

          const cost = microsToUnits(row.metrics?.cost_micros);

          const rawConversions = row.metrics?.conversions;
          const conversions =
            rawConversions !== undefined &&
            rawConversions !== null &&
            !isNaN(Number(rawConversions))
              ? Number(rawConversions)
              : undefined;

          const rawAllConversions = row.metrics?.all_conversions;
          const allConversions =
            rawAllConversions !== undefined &&
            rawAllConversions !== null &&
            !isNaN(Number(rawAllConversions))
              ? Number(rawAllConversions)
              : undefined;

          searchTermRows.push({
            campaignExternalId,
            adGroupExternalId,
            searchTerm,
            status,
            matchType,
            impressions,
            clicks,
            cost: cost !== undefined ? Number(cost.toFixed(2)) : undefined,
            conversions,
            allConversions,
            date,
          });
        }

        // ── 11. Query Shared Sets (Negative Keyword Lists) (GA5 B5) ─────────
        const sharedSetRows: Array<{
          sharedSetId: string;
          name: string;
          type: string;
          status?: string;
          memberCount?: number;
          referenceCount?: number;
        }> = [];

        const sharedSetResults = await executeGaqlResource("shared_set", outcomes, async () => {
          const sharedSetQuery = buildGaqlQuery({
            resource: "shared_set",
            fields: [
              "shared_set.id",
              "shared_set.name",
              "shared_set.type",
              "shared_set.status",
              "shared_set.member_count",
              "shared_set.reference_count",
            ],
            where: "shared_set.status != 'REMOVED'",
          });

          return (await queryGaql(sharedSetQuery)) as any[];
        });

        for (const row of sharedSetResults as Array<{
          shared_set?: {
            id?: number | string;
            name?: string;
            type?: number | string;
            status?: number | string;
            member_count?: number | string;
            reference_count?: number | string;
          };
        }>) {
          const ss = row.shared_set;
          if (!ss || !ss.id) continue;

          const sharedSetId = String(ss.id);
          const name = String(ss.name || `Shared Set ${sharedSetId}`);
          const type = String(ss.type || "NEGATIVE_KEYWORDS");

          let status = "ENABLED";
          if (ss.status === "REMOVED" || ss.status === 3) {
            status = "REMOVED";
          }

          const memberCount =
            ss.member_count !== undefined ? Number(ss.member_count) : undefined;
          const referenceCount =
            ss.reference_count !== undefined ? Number(ss.reference_count) : undefined;

          sharedSetRows.push({
            sharedSetId,
            name,
            type,
            status,
            memberCount,
            referenceCount,
          });
        }

        // ── 11. Query Shared Criteria (Negative Keywords in Lists) (GA5 B5) ──
        const sharedCriteriaRows: Array<{
          sharedSetId: string;
          criterionId: string;
          type: string;
          keywordText?: string;
          matchType?: string;
        }> = [];

        const sharedCriteriaResults = await executeGaqlResource("shared_criterion", outcomes, async () => {
          const sharedCriteriaQuery = buildGaqlQuery({
            resource: "shared_criterion",
            fields: [
              "shared_criterion.criterion_id",
              "shared_criterion.shared_set",
              "shared_criterion.type",
              "shared_criterion.keyword.text",
              "shared_criterion.keyword.match_type",
            ],
          });

          return (await queryGaql(sharedCriteriaQuery)) as any[];
        });

        for (const row of sharedCriteriaResults as Array<{
          shared_criterion?: {
            criterion_id?: number | string;
            shared_set?: string;
            type?: number | string;
            keyword?: {
              text?: string;
              match_type?: number | string;
            };
          };
        }>) {
          const sc = row.shared_criterion;
          if (!sc || !sc.criterion_id || !sc.shared_set) continue;

          const criterionId = String(sc.criterion_id);
          const rawSet = String(sc.shared_set);
          const sharedSetId = rawSet.includes("/") ? rawSet.split("/").pop() || rawSet : rawSet;
          const type = String(sc.type || "KEYWORD");

          let matchType = "BROAD";
          const rawMatchType = sc.keyword?.match_type;
          if (rawMatchType === "EXACT" || rawMatchType === 2) {
            matchType = "EXACT";
          } else if (rawMatchType === "PHRASE" || rawMatchType === 3) {
            matchType = "PHRASE";
          }

          sharedCriteriaRows.push({
            sharedSetId,
            criterionId,
            type,
            keywordText: sc.keyword?.text,
            matchType: sc.keyword?.text ? matchType : undefined,
          });
        }

        // ── 13. Query Campaign Shared Sets (Campaign Links) (GA5 B5) ─────────
        const campaignSharedSetRows: Array<{
          campaignExternalId: string;
          sharedSetId: string;
          status?: string;
        }> = [];

        const cssResults = await executeGaqlResource("campaign_shared_set", outcomes, async () => {
          const campaignSharedSetQuery = buildGaqlQuery({
            resource: "campaign_shared_set",
            fields: [
              "campaign.id",
              "campaign_shared_set.shared_set",
              "campaign_shared_set.status",
            ],
            where: "campaign_shared_set.status != 'REMOVED'",
          });

          return (await queryGaql(campaignSharedSetQuery)) as any[];
        });

        for (const row of cssResults as Array<{
          campaign?: { id?: number | string };
          campaign_shared_set?: {
            shared_set?: string;
            status?: number | string;
          };
        }>) {
          const campaignExternalId = String(row.campaign?.id || "");
          const rawSet = String(row.campaign_shared_set?.shared_set || "");
          if (!campaignExternalId || !rawSet) continue;

          const sharedSetId = rawSet.includes("/") ? rawSet.split("/").pop() || rawSet : rawSet;

          let status = "ENABLED";
          if (row.campaign_shared_set?.status === "REMOVED" || row.campaign_shared_set?.status === 3) {
            status = "REMOVED";
          }

          campaignSharedSetRows.push({
            campaignExternalId,
            sharedSetId,
            status,
          });
        }

        // ── 14. Query Geographic View (Physical presence) (GA6 B1) ───────────
        const geographicViewRows: Array<{
          campaignExternalId: string;
          countryCriterionId?: string;
          locationType: string;
          impressions?: number;
          clicks?: number;
          cost?: number;
          conversions?: number;
          allConversions?: number;
          date: string;
        }> = [];

        const geoResults = await executeGaqlResource("geographic_view", outcomes, async () => {
          const geoQuery = buildGaqlQuery({
            resource: "geographic_view",
            fields: [
              "campaign.id",
              "geographic_view.country_criterion_id",
              "geographic_view.location_type",
              "segments.date",
              "metrics.impressions",
              "metrics.clicks",
              "metrics.cost_micros",
              "metrics.conversions",
              "metrics.all_conversions",
            ],
            dateRange: { startDate, endDate },
            where: "metrics.impressions > 0",
          });

          return (await queryGaql(geoQuery)) as any[];
        });

        for (const row of geoResults as Array<{
          campaign?: { id?: number | string };
          geographic_view?: {
            country_criterion_id?: number | string;
            location_type?: number | string;
          };
          segments?: { date?: string };
          metrics?: {
            impressions?: number | string;
            clicks?: number | string;
            cost_micros?: number | string;
            conversions?: number | string;
            all_conversions?: number | string;
          };
        }>) {
          const campaignExternalId = String(row.campaign?.id || "");
          const date = String(row.segments?.date || "");
          if (!campaignExternalId || !date) continue;

          const gv = row.geographic_view;
          const locationType = String(gv?.location_type || "LOCATION_OF_PRESENCE");
          const countryCriterionId = gv?.country_criterion_id ? String(gv.country_criterion_id) : undefined;

          const m = row.metrics;
          const impressions = m?.impressions !== undefined ? Number(m.impressions) : undefined;
          const clicks = m?.clicks !== undefined ? Number(m.clicks) : undefined;
          const cost = microsToUnits(m?.cost_micros);
          const conversions = m?.conversions !== undefined ? Number(m.conversions) : undefined;
          const allConversions = m?.all_conversions !== undefined ? Number(m.all_conversions) : undefined;

          geographicViewRows.push({
            campaignExternalId,
            countryCriterionId,
            locationType,
            impressions,
            clicks,
            cost,
            conversions,
            allConversions,
            date,
          });
        }

        // ── 15. Query User Location View (Targeted location / interest) (GA6 B1) ──
        const userLocationViewRows: Array<{
          campaignExternalId: string;
          countryCriterionId?: string;
          targetingLocation?: boolean;
          impressions?: number;
          clicks?: number;
          cost?: number;
          conversions?: number;
          allConversions?: number;
          date: string;
        }> = [];

        const userLocResults = await executeGaqlResource("user_location_view", outcomes, async () => {
          const userLocQuery = buildGaqlQuery({
            resource: "user_location_view",
            fields: [
              "campaign.id",
              "user_location_view.country_criterion_id",
              "user_location_view.targeting_location",
              "segments.date",
              "metrics.impressions",
              "metrics.clicks",
              "metrics.cost_micros",
              "metrics.conversions",
              "metrics.all_conversions",
            ],
            dateRange: { startDate, endDate },
            where: "metrics.impressions > 0",
          });

          return (await queryGaql(userLocQuery)) as any[];
        });

        for (const row of userLocResults as Array<{
          campaign?: { id?: number | string };
          user_location_view?: {
            country_criterion_id?: number | string;
            targeting_location?: boolean;
          };
          segments?: { date?: string };
          metrics?: {
            impressions?: number | string;
            clicks?: number | string;
            cost_micros?: number | string;
            conversions?: number | string;
            all_conversions?: number | string;
          };
        }>) {
          const campaignExternalId = String(row.campaign?.id || "");
          const date = String(row.segments?.date || "");
          if (!campaignExternalId || !date) continue;

          const ul = row.user_location_view;
          const countryCriterionId = ul?.country_criterion_id ? String(ul.country_criterion_id) : undefined;
          const targetingLocation = ul?.targeting_location;

          const m = row.metrics;
          const impressions = m?.impressions !== undefined ? Number(m.impressions) : undefined;
          const clicks = m?.clicks !== undefined ? Number(m.clicks) : undefined;
          const cost = microsToUnits(m?.cost_micros);
          const conversions = m?.conversions !== undefined ? Number(m.conversions) : undefined;
          const allConversions = m?.all_conversions !== undefined ? Number(m.all_conversions) : undefined;

          userLocationViewRows.push({
            campaignExternalId,
            countryCriterionId,
            targetingLocation,
            impressions,
            clicks,
            cost,
            conversions,
            allConversions,
            date,
          });
        }

        // ── 16. Query Device Segments (GA6 B2) ───────────────────────────────
        const deviceStatsRows: Array<{
          campaignExternalId: string;
          device: string;
          impressions?: number;
          clicks?: number;
          cost?: number;
          conversions?: number;
          allConversions?: number;
          date: string;
        }> = [];

        const deviceResults = await executeGaqlResource("campaign_device", outcomes, async () => {
          const deviceQuery = buildGaqlQuery({
            resource: "campaign",
            fields: [
              "campaign.id",
              "segments.device",
              "segments.date",
              "metrics.impressions",
              "metrics.clicks",
              "metrics.cost_micros",
              "metrics.conversions",
              "metrics.all_conversions",
            ],
            dateRange: { startDate, endDate },
            where: "campaign.status != 'REMOVED' AND metrics.impressions > 0",
          });

          return (await queryGaql(deviceQuery)) as any[];
        });

        for (const row of deviceResults as Array<{
          campaign?: { id?: number | string };
          segments?: { device?: number | string; date?: string };
          metrics?: {
            impressions?: number | string;
            clicks?: number | string;
            cost_micros?: number | string;
            conversions?: number | string;
            all_conversions?: number | string;
          };
        }>) {
          const campaignExternalId = String(row.campaign?.id || "");
          const date = String(row.segments?.date || "");
          if (!campaignExternalId || !date) continue;

          const rawDev = row.segments?.device;
          let device = "UNKNOWN";
          if (rawDev === "MOBILE" || rawDev === 2) {
            device = "MOBILE";
          } else if (rawDev === "DESKTOP" || rawDev === 3) {
            device = "DESKTOP";
          } else if (rawDev === "TABLET" || rawDev === 4) {
            device = "TABLET";
          } else if (rawDev === "CONNECTED_TV" || rawDev === 6) {
            device = "CONNECTED_TV";
          } else if (rawDev === "OTHER" || rawDev === 5) {
            device = "OTHER";
          } else if (typeof rawDev === "string" && rawDev.trim() !== "") {
            device = rawDev.trim();
          }

          const m = row.metrics;
          const impressions = m?.impressions !== undefined ? Number(m.impressions) : undefined;
          const clicks = m?.clicks !== undefined ? Number(m.clicks) : undefined;
          const cost = microsToUnits(m?.cost_micros);
          const conversions = m?.conversions !== undefined ? Number(m.conversions) : undefined;
          const allConversions = m?.all_conversions !== undefined ? Number(m.all_conversions) : undefined;

          deviceStatsRows.push({
            campaignExternalId,
            device,
            impressions,
            clicks,
            cost,
            conversions,
            allConversions,
            date,
          });
        }

        // ── 17. Query Hourly Schedule Segments (GA6 B3) ──────────────────────
        const hourlyStatsRows: Array<{
          campaignExternalId: string;
          dayOfWeek: string;
          hour: number;
          impressions?: number;
          clicks?: number;
          cost?: number;
          conversions?: number;
          allConversions?: number;
          date: string;
        }> = [];

        const hourlyResults = await executeGaqlResource("campaign_hourly", outcomes, async () => {
          const hourlyQuery = buildGaqlQuery({
            resource: "campaign",
            fields: [
              "campaign.id",
              "segments.day_of_week",
              "segments.hour",
              "segments.date",
              "metrics.impressions",
              "metrics.clicks",
              "metrics.cost_micros",
              "metrics.conversions",
              "metrics.all_conversions",
            ],
            dateRange: { startDate, endDate },
            where: "campaign.status != 'REMOVED' AND metrics.impressions > 0",
          });

          return (await queryGaql(hourlyQuery)) as any[];
        });

        for (const row of hourlyResults as Array<{
          campaign?: { id?: number | string };
          segments?: {
            day_of_week?: number | string;
            hour?: number | string;
            date?: string;
          };
          metrics?: {
            impressions?: number | string;
            clicks?: number | string;
            cost_micros?: number | string;
            conversions?: number | string;
            all_conversions?: number | string;
          };
        }>) {
          const campaignExternalId = String(row.campaign?.id || "");
          const date = String(row.segments?.date || "");
          if (!campaignExternalId || !date) continue;

          const hour = row.segments?.hour !== undefined ? Number(row.segments.hour) : 0;
          const dayOfWeek = String(row.segments?.day_of_week || "UNKNOWN");

          const m = row.metrics;
          const impressions = m?.impressions !== undefined ? Number(m.impressions) : undefined;
          const clicks = m?.clicks !== undefined ? Number(m.clicks) : undefined;
          const cost = microsToUnits(m?.cost_micros);
          const conversions = m?.conversions !== undefined ? Number(m.conversions) : undefined;
          const allConversions = m?.all_conversions !== undefined ? Number(m.all_conversions) : undefined;

          hourlyStatsRows.push({
            campaignExternalId,
            dayOfWeek,
            hour,
            impressions,
            clicks,
            cost,
            conversions,
            allConversions,
            date,
          });
        }

        // ── 17. Query Age Range Demographics (GA6 B4) ────────────────────────
        const ageRangeViewRows: Array<{
          campaignExternalId: string;
          adGroupExternalId?: string;
          criterionId?: string;
          ageRange: string;
          impressions?: number;
          clicks?: number;
          cost?: number;
          conversions?: number;
          allConversions?: number;
          date: string;
        }> = [];

        const ageResults = await executeGaqlResource("age_range_view", outcomes, async () => {
          const ageQuery = buildGaqlQuery({
            resource: "age_range_view",
            fields: [
              "campaign.id",
              "ad_group.id",
              "ad_group_criterion.criterion_id",
              "ad_group_criterion.age_range.type",
              "segments.date",
              "metrics.impressions",
              "metrics.clicks",
              "metrics.cost_micros",
              "metrics.conversions",
              "metrics.all_conversions",
            ],
            dateRange: { startDate, endDate },
            where: "metrics.impressions > 0",
          });

          return (await queryGaql(ageQuery)) as any[];
        });

        for (const row of ageResults as Array<{
          campaign?: { id?: number | string };
          ad_group?: { id?: number | string };
          ad_group_criterion?: {
            criterion_id?: number | string;
            age_range?: { type?: number | string };
          };
          segments?: { date?: string };
          metrics?: {
            impressions?: number | string;
            clicks?: number | string;
            cost_micros?: number | string;
            conversions?: number | string;
            all_conversions?: number | string;
          };
        }>) {
          const campaignExternalId = String(row.campaign?.id || "");
          const date = String(row.segments?.date || "");
          if (!campaignExternalId || !date) continue;

          const adGroupExternalId = row.ad_group?.id ? String(row.ad_group.id) : undefined;
          const criterionId = row.ad_group_criterion?.criterion_id
            ? String(row.ad_group_criterion.criterion_id)
            : undefined;

          const rawAge = row.ad_group_criterion?.age_range?.type;
          let ageRange = "UNDETERMINED";
          if (rawAge !== undefined && rawAge !== null) {
            ageRange = String(rawAge);
          }

          const m = row.metrics;
          const impressions = m?.impressions !== undefined ? Number(m.impressions) : undefined;
          const clicks = m?.clicks !== undefined ? Number(m.clicks) : undefined;
          const cost = microsToUnits(m?.cost_micros);
          const conversions = m?.conversions !== undefined ? Number(m.conversions) : undefined;
          const allConversions = m?.all_conversions !== undefined ? Number(m.all_conversions) : undefined;

          ageRangeViewRows.push({
            campaignExternalId,
            adGroupExternalId,
            criterionId,
            ageRange,
            impressions,
            clicks,
            cost,
            conversions,
            allConversions,
            date,
          });
        }

        // ── 19. Query Gender Demographics (GA6 B4) ───────────────────────────
        const genderViewRows: Array<{
          campaignExternalId: string;
          adGroupExternalId?: string;
          criterionId?: string;
          gender: string;
          impressions?: number;
          clicks?: number;
          cost?: number;
          conversions?: number;
          allConversions?: number;
          date: string;
        }> = [];

        const genderResults = await executeGaqlResource("gender_view", outcomes, async () => {
          const genderQuery = buildGaqlQuery({
            resource: "gender_view",
            fields: [
              "campaign.id",
              "ad_group.id",
              "ad_group_criterion.criterion_id",
              "ad_group_criterion.gender.type",
              "segments.date",
              "metrics.impressions",
              "metrics.clicks",
              "metrics.cost_micros",
              "metrics.conversions",
              "metrics.all_conversions",
            ],
            dateRange: { startDate, endDate },
            where: "metrics.impressions > 0",
          });

          return (await queryGaql(genderQuery)) as any[];
        });

        for (const row of genderResults as Array<{
          campaign?: { id?: number | string };
          ad_group?: { id?: number | string };
          ad_group_criterion?: {
            criterion_id?: number | string;
            gender?: { type?: number | string };
          };
          segments?: { date?: string };
          metrics?: {
            impressions?: number | string;
            clicks?: number | string;
            cost_micros?: number | string;
            conversions?: number | string;
            all_conversions?: number | string;
          };
        }>) {
          const campaignExternalId = String(row.campaign?.id || "");
          const date = String(row.segments?.date || "");
          if (!campaignExternalId || !date) continue;

          const adGroupExternalId = row.ad_group?.id ? String(row.ad_group.id) : undefined;
          const criterionId = row.ad_group_criterion?.criterion_id
            ? String(row.ad_group_criterion.criterion_id)
            : undefined;

          const rawGen = row.ad_group_criterion?.gender?.type;
          let gender = "UNDETERMINED";
          if (rawGen !== undefined && rawGen !== null) {
            gender = String(rawGen);
          }

          const m = row.metrics;
          const impressions = m?.impressions !== undefined ? Number(m.impressions) : undefined;
          const clicks = m?.clicks !== undefined ? Number(m.clicks) : undefined;
          const cost = microsToUnits(m?.cost_micros);
          const conversions = m?.conversions !== undefined ? Number(m.conversions) : undefined;
          const allConversions = m?.all_conversions !== undefined ? Number(m.all_conversions) : undefined;

          genderViewRows.push({
            campaignExternalId,
            adGroupExternalId,
            criterionId,
            gender,
            impressions,
            clicks,
            cost,
            conversions,
            allConversions,
            date,
          });
        }

        // ── 20. Query Assets (asset) (GA7 B1) ────────────────────────────────
        const assetList: Array<{
          assetId: string;
          name?: string;
          type: string;
          text?: string;
          imageUrl?: string;
          imageFileSize?: number;
          youtubeVideoId?: string;
          youtubeVideoTitle?: string;
          phoneNumber?: string;
          source?: string;
          status?: string;
        }> = [];

        const assetResults = await executeGaqlResource("asset", outcomes, async () => {
          const assetQuery = buildGaqlQuery({
            resource: "asset",
            fields: [
              "asset.id",
              "asset.name",
              "asset.type",
              "asset.text_asset.text",
              "asset.image_asset.full_size.url",
              "asset.image_asset.file_size",
              "asset.youtube_video_asset.youtube_video_id",
              "asset.youtube_video_asset.youtube_video_title",
              "asset.call_asset.phone_number",
              "asset.source",
              "asset.status",
            ],
            where: "asset.status != 'REMOVED'",
          });

          return (await queryGaql(assetQuery)) as any[];
        });

        for (const row of assetResults as Array<{
          asset?: {
            id?: number | string;
            name?: string;
            type?: string | number;
            text_asset?: { text?: string };
            textAsset?: { text?: string };
            image_asset?: { full_size?: { url?: string }; fullSize?: { url?: string }; file_size?: number; fileSize?: number };
            imageAsset?: { full_size?: { url?: string }; fullSize?: { url?: string }; file_size?: number; fileSize?: number };
            youtube_video_asset?: { youtube_video_id?: string; youtubeVideoId?: string; youtube_video_title?: string; youtubeVideoTitle?: string };
            youtubeVideoAsset?: { youtube_video_id?: string; youtubeVideoId?: string; youtube_video_title?: string; youtubeVideoTitle?: string };
            call_asset?: { phone_number?: string; phoneNumber?: string };
            callAsset?: { phone_number?: string; phoneNumber?: string };
            source?: string | number;
            status?: string | number;
          };
        }>) {
          const a = row.asset;
          if (!a || !a.id) continue;

          const assetId = String(a.id);
          const name = a.name ? String(a.name) : undefined;
          const type = String(a.type || "TEXT");
          const text = a.text_asset?.text ?? a.textAsset?.text;
          const img = a.image_asset ?? a.imageAsset;
          const imageUrl = img?.full_size?.url ?? img?.fullSize?.url;
          const imageFileSize = img?.file_size ?? img?.fileSize;
          const yt = a.youtube_video_asset ?? a.youtubeVideoAsset;
          const youtubeVideoId = yt?.youtube_video_id ?? yt?.youtubeVideoId;
          const youtubeVideoTitle = yt?.youtube_video_title ?? yt?.youtubeVideoTitle;
          const call = a.call_asset ?? a.callAsset;
          const phoneNumber = call?.phone_number ?? call?.phoneNumber;
          const source = a.source ? String(a.source) : undefined;
          const status = a.status ? String(a.status) : "ENABLED";

          assetList.push({
            assetId,
            name,
            type,
            text,
            imageUrl,
            imageFileSize: typeof imageFileSize === "number" ? imageFileSize : undefined,
            youtubeVideoId,
            youtubeVideoTitle,
            phoneNumber,
            source,
            status,
          });
        }

        // ── 21. Query Ad Group Ad Asset Views (ad_group_ad_asset_view) (GA7 B2, B4) ─
        const adGroupAdAssetViewList: Array<{
          campaignExternalId: string;
          adGroupExternalId: string;
          adExternalId: string;
          assetExternalId: string;
          fieldType: string;
          performanceLabel: string;
          pinnedField?: string;
          status?: string;
          enabled?: boolean;
          impressions?: number;
          clicks?: number;
          cost?: number;
          conversions?: number;
          allConversions?: number;
          date: string;
        }> = [];

        const assetViewResults = await executeGaqlResource("ad_group_ad_asset_view", outcomes, async () => {
          const assetViewQuery = buildGaqlQuery({
            resource: "ad_group_ad_asset_view",
            fields: [
              "campaign.id",
              "ad_group.id",
              "ad_group_ad.ad.id",
              "ad_group_ad_asset_view.asset",
              "ad_group_ad_asset_view.field_type",
              "ad_group_ad_asset_view.performance_label",
              "ad_group_ad_asset_view.pinned_field",
              "ad_group_ad_asset_view.status",
              "ad_group_ad_asset_view.enabled",
              "metrics.impressions",
              "metrics.clicks",
              "metrics.cost_micros",
              "metrics.conversions",
              "metrics.all_conversions",
            ],
            segments: ["segments.date"],
            dateRange: { startDate, endDate },
            where: [
              "campaign.status != 'REMOVED'",
              "ad_group.status != 'REMOVED'",
              "ad_group_ad.status != 'REMOVED'",
            ],
          });

          return (await queryGaql(assetViewQuery)) as any[];
        });

        for (const row of assetViewResults as Array<{
          campaign?: { id?: number | string };
          ad_group?: { id?: number | string };
          ad_group_ad?: { ad?: { id?: number | string } };
          adGroupAd?: { ad?: { id?: number | string } };
          ad_group_ad_asset_view?: {
            asset?: string;
            field_type?: string;
            fieldType?: string;
            performance_label?: string;
            performanceLabel?: string;
            pinned_field?: string;
            pinnedField?: string;
            status?: string;
            enabled?: boolean;
          };
          adGroupAdAssetView?: {
            asset?: string;
            field_type?: string;
            fieldType?: string;
            performance_label?: string;
            performanceLabel?: string;
            pinned_field?: string;
            pinnedField?: string;
            status?: string;
            enabled?: boolean;
          };
          metrics?: {
            impressions?: number | string;
            clicks?: number | string;
            cost_micros?: number | string;
            costMicros?: number | string;
            conversions?: number | string;
            all_conversions?: number | string;
            allConversions?: number | string;
          };
          segments?: { date?: string };
        }>) {
          const campaignExternalId = String(row.campaign?.id || "");
          const adGroupExternalId = String(row.ad_group?.id || "");
          const adObj = row.ad_group_ad?.ad ?? row.adGroupAd?.ad;
          const adExternalId = String(adObj?.id || "");
          const viewObj = row.ad_group_ad_asset_view ?? row.adGroupAdAssetView;

          if (!campaignExternalId || !adGroupExternalId || !adExternalId || !viewObj) {
            continue;
          }

          const rawAsset = String(viewObj.asset || "");
          const assetExternalId = rawAsset.includes("/")
            ? rawAsset.split("/").pop() || rawAsset
            : rawAsset;

          if (!assetExternalId) continue;

          const fieldType = String(viewObj.field_type ?? viewObj.fieldType ?? "HEADLINE");
          const rawPerfLabel = String(viewObj.performance_label ?? viewObj.performanceLabel ?? "UNKNOWN");
          const pinnedField = viewObj.pinned_field ?? viewObj.pinnedField;
          const date = row.segments?.date || endDate;

          const impressions = row.metrics?.impressions !== undefined ? Number(row.metrics.impressions) : undefined;
          const clicks = row.metrics?.clicks !== undefined ? Number(row.metrics.clicks) : undefined;
          const cost = microsToUnits(row.metrics?.cost_micros ?? row.metrics?.costMicros);
          const conversions = row.metrics?.conversions !== undefined ? Number(row.metrics.conversions) : undefined;
          const allConversions = (row.metrics?.all_conversions ?? row.metrics?.allConversions) !== undefined
            ? Number(row.metrics?.all_conversions ?? row.metrics?.allConversions)
            : undefined;

          adGroupAdAssetViewList.push({
            campaignExternalId,
            adGroupExternalId,
            adExternalId,
            assetExternalId,
            fieldType,
            performanceLabel: rawPerfLabel,
            pinnedField,
            status: viewObj.status,
            enabled: viewObj.enabled,
            impressions,
            clicks,
            cost,
            conversions,
            allConversions,
            date,
          });
        }

        // ── 22. Query Asset Combinations (ad_group_ad_asset_combination_view) (GA7 B3) ─
        const assetCombinationViewList: Array<{
          campaignExternalId: string;
          adGroupExternalId: string;
          adExternalId: string;
          servedAssetIds: string[];
          combinationHash: string;
          impressions?: number;
          date: string;
        }> = [];

        const comboResults = await executeGaqlResource(
          "ad_group_ad_asset_combination_view",
          outcomes,
          async () => {
            const comboQuery = buildGaqlQuery({
              resource: "ad_group_ad_asset_combination_view",
              fields: [
                "campaign.id",
                "ad_group.id",
                "ad_group_ad.ad.id",
                "ad_group_ad_asset_combination_view.served_assets",
                "metrics.impressions",
              ],
              segments: ["segments.date"],
              dateRange: { startDate, endDate },
              where: [
                "campaign.status != 'REMOVED'",
                "ad_group.status != 'REMOVED'",
                "ad_group_ad.status != 'REMOVED'",
              ],
            });

            return (await queryGaql(comboQuery)) as any[];
          },
        );

        for (const row of comboResults as Array<{
          campaign?: { id?: number | string };
          ad_group?: { id?: number | string };
          ad_group_ad?: { ad?: { id?: number | string } };
          adGroupAd?: { ad?: { id?: number | string } };
          ad_group_ad_asset_combination_view?: {
            served_assets?: Array<{ asset?: string } | string>;
            servedAssets?: Array<{ asset?: string } | string>;
          };
          adGroupAdAssetCombinationView?: {
            served_assets?: Array<{ asset?: string } | string>;
            servedAssets?: Array<{ asset?: string } | string>;
          };
          metrics?: { impressions?: number | string };
          segments?: { date?: string };
        }>) {
          const campaignExternalId = String(row.campaign?.id || "");
          const adGroupExternalId = String(row.ad_group?.id || "");
          const adObj = row.ad_group_ad?.ad ?? row.adGroupAd?.ad;
          const adExternalId = String(adObj?.id || "");
          const comboObj =
            row.ad_group_ad_asset_combination_view ?? row.adGroupAdAssetCombinationView;

          if (!campaignExternalId || !adGroupExternalId || !adExternalId || !comboObj) {
            continue;
          }

          const rawAssets = comboObj.served_assets ?? comboObj.servedAssets ?? [];
          const servedAssetIds = rawAssets.map((item) => {
            const resName = typeof item === "string" ? item : item.asset || "";
            return resName.includes("/") ? resName.split("/").pop() || resName : resName;
          }).filter(Boolean);

          servedAssetIds.sort();
          const combinationHash = servedAssetIds.join("|") || "unknown_combination";
          const impressions = row.metrics?.impressions !== undefined ? Number(row.metrics.impressions) : undefined;
          const date = row.segments?.date || endDate;

          assetCombinationViewList.push({
            campaignExternalId,
            adGroupExternalId,
            adExternalId,
            servedAssetIds,
            combinationHash,
            impressions,
            date,
          });
        }

        // ── 23. Persist everything to Convex in atomic mutation ───────────────
        const accountPayload = currencyCode
          ? {
              externalId: customerId,
              name: accountName,
              currency: currencyCode,
            }
          : undefined;

        const written: number = await ctx.runMutation(
          internal.googleAdsStore.upsertGoogleAdsData,
          {
            workspaceId,
            account: accountPayload,
            conversionActions,
            customerClients,
            budgets: budgetList,
            campaigns: Array.from(campaignMap.values()),
            adGroups: Array.from(adGroupMap.values()),
            campaignCriteria: campaignCriteriaList,
            ads: Array.from(adMap.values()),
            insights: insightRows,
            keywordQuality: keywordQualityRows,
            searchTerms: searchTermRows,
            sharedSets: sharedSetRows,
            sharedCriteria: sharedCriteriaRows,
            campaignSharedSets: campaignSharedSetRows,
            geographicViews: geographicViewRows,
            userLocationViews: userLocationViewRows,
            deviceStats: deviceStatsRows,
            hourlyStats: hourlyStatsRows,
            ageRangeViews: ageRangeViewRows,
            genderViews: genderViewRows,
            assets: assetList,
            adGroupAdAssetViews: adGroupAdAssetViewList,
            assetCombinationViews: assetCombinationViewList,
          },
        );

        summaryResult = summarizeGoogleAdsSync({
          outcomes,
          itemsWritten: written,
          currencyKnown: Boolean(currencyCode),
        });

        return {
          itemsWritten: written,
          note: summaryResult.note,
        };
      },
    );

    return (
      summaryResult ??
      summarizeGoogleAdsSync({
        outcomes,
        itemsWritten: 0,
        currencyKnown: false,
      })
    );
  },
});

/**
 * Cron entry point: Fan-out to sync all active Google Ads connections.
 */
export const syncAllGoogleAds = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    const connectionIds: Id<"connections">[] = await ctx.runQuery(
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
