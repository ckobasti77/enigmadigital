"use node";

import { action, internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { ConvexError, v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { decryptCredentials } from "./lib/crypto";
import { runSync, sanitizeSyncError } from "./lib/runSync";
import {
  batchRunReports,
  checkCompatibility,
  fetchMetadata,
  getAccessToken,
  runRealtimeReport,
  runReport,
  type Ga4PropertyQuota,
  type Ga4ResponseMetadata,
  type ReportRequest,
} from "./lib/ga4Api";
import { mapWithConcurrency, quotaPeak, readGate } from "./lib/ga4Quota";
import { resolveMetric } from "./lib/ga4Catalog";
import {
  fetchProperty,
  fetchDataRetention,
  fetchKeyEvents,
  fetchCustomDimensions,
  fetchCustomMetrics,
  fetchDataStreams,
  fetchGoogleAdsLinks,
  type Ga4PropertyDetails,
  type Ga4DataRetentionSettings,
  type Ga4KeyEvent,
  type Ga4CustomDimension,
  type Ga4CustomMetric,
  type Ga4DataStream,
  type Ga4GoogleAdsLink,
} from "./lib/ga4Admin";

/**
 * ============================================================================
 * GA4 SYNC ACTION (PLAN.md §4, M3 / A1 / A2 / A3 / A4)
 * ============================================================================
 *
 * Runs inside the Node.js runtime for JWT signing with the service-account key.
 * Calls GA4 Data API (v1beta) REST endpoints via fetch.
 *
 * Reports (11 total):
 *   1. daily totals            → ga4Daily (sessions, activeUsers, newUsers, keyEvents, engagementRate)
 *   2. source/medium/campaign  → ga4TrafficDaily (sessions, keyEvents)
 *   3. acq_channel_first       → ga4MetricDaily (totalUsers, newUsers, keyEvents)
 *   4. acq_channel_session     → ga4MetricDaily (sessions, engagedSessions, keyEvents)
 *   5. acq_source_first        → ga4MetricDaily (newUsers, totalUsers, keyEvents)
 *   6. acq_source_session      → ga4MetricDaily (sessions, engagedSessions, keyEvents)
 *   7. content_pages           → ga4MetricDaily (screenPageViews, totalUsers, userEngagementDuration, keyEvents)
 *   8. content_landing         → ga4MetricDaily (sessions, engagedSessions, keyEvents)
 *   9. audience_device         → ga4MetricDaily (sessions, engagedSessions, totalUsers, keyEvents)
 *   10. audience_geo           → ga4MetricDaily (totalUsers, sessions, keyEvents)
 *   11. time_hour              → ga4MetricDaily (sessions, totalUsers)
 *
 * Batches:
 *   - Max 5 requests per batch -> 11 requests split into 3 batches (4 + 4 + 3).
 *   - Executed in parallel with mapWithConcurrency (n=3).
 *
 * Backfill Engine (A4 §5.2):
 *   - Last 3 days are ALWAYS refreshed.
 *   - Up to 30 days back from oldestSyncedDate per run.
 *   - Once oldestSyncedDate reaches 90 days, mark completedAt and stop stepping back.
 * ============================================================================
 */

const BACKFILL_DAYS = 90;
const LOOKBACK_DAYS = 3; // GA4 keeps adjusting recent days
const CHUNK_SIZE = 100; // rows per upsert transaction
const COMPAT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days cache for compatibility checks
const CATALOG_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours metadata catalog refresh
const CONFIG_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours configuration refresh
export const GA4_DAILY_METRICS_VERSION = 2;
export const GA4_COMPAT_VERSION = 2;

/** Format timestamp to YYYY-MM-DD in the given IANA timezone. */
function formatTzDate(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone }).format(new Date(ms));
}

/** Last `n` days as "YYYY-MM-DD", ascending, ending today in property timezone. */
function lastNDatesInTz(n: number, timeZone: string): string[] {
  const now = Date.now();
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    out.push(formatTzDate(now - i * 86_400_000, timeZone));
  }
  return out;
}

/** GA4 returns the `date` dimension as "YYYYMMDD"; normalize to "YYYY-MM-DD". */
function normalizeDate(raw: string): string {
  return /^\d{8}$/.test(raw)
    ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
    : raw;
}

function toNumber(value: string | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Prefixed combo key for compatibility cache: d:name and m:name sorted (F5). */
function computeComboKey(request: ReportRequest): string {
  const dims = (request.dimensions ?? []).map((d) => `d:${d.name}`);
  const metrics = (request.metrics ?? []).map((m) => `m:${m.name}`);
  return [...dims, ...metrics].sort().join(",");
}

/**
 * Verify compatibility of a single ReportRequest with 7-day caching in ga4Compat.
 */
async function verifyRequestCompatibility(
  ctx: ActionCtx,
  workspaceId: Id<"workspaces">,
  propertyId: string,
  token: string,
  request: ReportRequest,
): Promise<string | undefined> {
  const comboKey = computeComboKey(request);
  const now = Date.now();

  const cached = await ctx.runQuery(internal.ga4Store.getCompat, {
    workspaceId,
    comboKey,
  });

  if (
    cached !== null &&
    cached.schemaVersion === GA4_COMPAT_VERSION &&
    now - cached.checkedAt <= COMPAT_TTL_MS
  ) {
    if (!cached.compatible) {
      throw new Error(
        `GA4 Data API ne podržava traženu kombinaciju dimenzija/metrika (${cached.incompatible.join(", ")}).`,
      );
    }
    return undefined;
  }

  // Not in cache, schema version mismatch, or expired -> run checkCompatibility
  const compatibility = await checkCompatibility(propertyId, token, {
    dimensions: request.dimensions,
    metrics: request.metrics,
  });

  const requestedDims = new Set((request.dimensions ?? []).map((d) => d.name));
  const requestedMetrics = new Set((request.metrics ?? []).map((m) => m.name));

  const matchingDims = (compatibility.dimensionCompatibilities ?? []).filter(
    (d) =>
      d.dimensionMetadata?.apiName !== undefined &&
      requestedDims.has(d.dimensionMetadata.apiName),
  );

  const matchingMetrics = (compatibility.metricCompatibilities ?? []).filter(
    (m) =>
      m.metricMetadata?.apiName !== undefined &&
      requestedMetrics.has(m.metricMetadata.apiName),
  );

  const incompatibleDims = matchingDims
    .filter((d) => d.compatibility === "INCOMPATIBLE")
    .map((d) => d.dimensionMetadata!.apiName!);

  const incompatibleMetrics = matchingMetrics
    .filter((m) => m.compatibility === "INCOMPATIBLE")
    .map((m) => m.metricMetadata!.apiName!);

  const incompatible = [...incompatibleDims, ...incompatibleMetrics];
  const compatible = incompatible.length === 0;

  await ctx.runMutation(internal.ga4Store.recordCompat, {
    workspaceId,
    comboKey,
    compatible,
    incompatible,
    checkedAt: now,
    schemaVersion: GA4_COMPAT_VERSION,
  });

  if (!compatible) {
    throw new Error(
      `GA4 Data API ne podržava traženu kombinaciju dimenzija/metrika (${incompatible.join(", ")}).`,
    );
  }

  if (matchingDims.length === 0 && matchingMetrics.length === 0) {
    return "GA4 provera kompatibilnosti nije vratila status za tražene dimenzije/metrike; zahtev je prosleđen.";
  }

  return undefined;
}

interface MetricDailyConfig {
  reportKey: string;
  dimensionKeys: string[];
  metrics: string[];
}

interface MetricDailyRow {
  reportKey: string;
  date: string;
  metric: string;
  dimensionKeys: string[];
  dimensionValues: string[];
  dimKey: string;
  value?: number;
  state: "value" | "thresholded" | "unavailable";
}

/**
 * Parses a GA4 report into long-format ga4MetricDaily rows.
 *
 * F1: If targetDates is null (unknown timezone on first sync), only emit
 * dates that actually arrived in report rows. Do NOT populate phantom 0s.
 * F4: Marker rows (state === "thresholded" | "unavailable") strictly have
 * dimensionKeys: [] and dimensionValues: [].
 */
function parseMetricDailyReport(
  report: {
    rows: {
      dimensionValues?: { value?: string }[];
      metricValues?: { value?: string }[];
    }[];
    metadata?: { subjectToThresholding?: boolean };
  },
  config: MetricDailyConfig,
  targetDates: string[] | null,
): MetricDailyRow[] {
  const rows = report.rows ?? [];
  const isThresholded = report.metadata?.subjectToThresholding === true;
  const out: MetricDailyRow[] = [];

  // Group rows by normalized date
  const byDate = new Map<string, typeof rows>();
  for (const r of rows) {
    const rawDate = r.dimensionValues?.[0]?.value ?? "";
    const normDate = normalizeDate(rawDate);
    if (!normDate) continue;
    const list = byDate.get(normDate);
    if (list) list.push(r);
    else byDate.set(normDate, [r]);
  }

  // F1: Unknown timezone -> write ONLY returned dates
  if (targetDates === null) {
    for (const [d, dateRows] of byDate.entries()) {
      for (const r of dateRows) {
        const dimVals = (r.dimensionValues ?? [])
          .slice(1)
          .map((v) => v.value ?? "(not set)");
        const dimKey =
          config.dimensionKeys.join("|") + "\u0000" + dimVals.join("|");

        for (let mIdx = 0; mIdx < config.metrics.length; mIdx++) {
          const metricName = config.metrics[mIdx];
          const rawVal = r.metricValues?.[mIdx]?.value;
          const val = toNumber(rawVal);
          out.push({
            reportKey: config.reportKey,
            date: d,
            metric: metricName,
            dimensionKeys: config.dimensionKeys,
            dimensionValues: dimVals,
            dimKey,
            value: val,
            state: "value",
          });
        }
      }
    }
    return out;
  }

  // Known timezone with target dates
  for (const d of targetDates) {
    const dateRows = byDate.get(d);
    if (dateRows && dateRows.length > 0) {
      // Rows exist -> state = "value"
      for (const r of dateRows) {
        const dimVals = (r.dimensionValues ?? [])
          .slice(1)
          .map((v) => v.value ?? "(not set)");
        const dimKey =
          config.dimensionKeys.join("|") + "\u0000" + dimVals.join("|");

        for (let mIdx = 0; mIdx < config.metrics.length; mIdx++) {
          const metricName = config.metrics[mIdx];
          const rawVal = r.metricValues?.[mIdx]?.value;
          const val = toNumber(rawVal);
          out.push({
            reportKey: config.reportKey,
            date: d,
            metric: metricName,
            dimensionKeys: config.dimensionKeys,
            dimensionValues: dimVals,
            dimKey,
            value: val,
            state: "value",
          });
        }
      }
    } else {
      // 0 rows for this date
      for (const metricName of config.metrics) {
        if (isThresholded) {
          // F4: Markerski red ima dimensionKeys: [] i dimensionValues: []
          out.push({
            reportKey: config.reportKey,
            date: d,
            metric: metricName,
            dimensionKeys: [],
            dimensionValues: [],
            dimKey: "",
            value: undefined,
            state: "thresholded",
          });
        } else {
          out.push({
            reportKey: config.reportKey,
            date: d,
            metric: metricName,
            dimensionKeys: [],
            dimensionValues: [],
            dimKey: "",
            value: 0,
            state: "value",
          });
        }
      }
    }
  }

  return out;
}

/**
 * Aligns 12 weekly cohorts to Sunday-Saturday in the property timezone (F2).
 * Finds the last COMPLETED Saturday in that timezone, excluding the current incomplete week,
 * and steps backwards 12 weeks of Sunday->Saturday windows.
 * Cohort names are prefixed with "w_" (F1 - never "cohort_" or "RESERVED_").
 * cohortReportSettings is omitted (F3 - not supported in RunReportRequest).
 */
function generateWeeklyCohorts(timeZone: string, numWeeks = 12) {
  const now = Date.now();
  const todayStr = formatTzDate(now, timeZone);
  const [y, m, d] = todayStr.split("-").map(Number);
  const todayUtc = new Date(Date.UTC(y, m - 1, d));
  const dayOfWeek = todayUtc.getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

  // If today is Saturday (6), the week is still in progress, so last completed Saturday was 7 days ago.
  const daysSinceLastSaturday =
    (dayOfWeek + 1) % 7 === 0 ? 7 : (dayOfWeek + 1) % 7;
  const lastSatMs = todayUtc.getTime() - daysSinceLastSaturday * 86_400_000;

  const cohorts: Array<{
    name: string;
    dimension: "firstSessionDate";
    dateRange: { startDate: string; endDate: string };
  }> = [];
  const nameToStartDate = new Map<string, string>();

  for (let i = numWeeks - 1; i >= 0; i--) {
    const endMs = lastSatMs - i * 7 * 86_400_000;
    const startMs = endMs - 6 * 86_400_000;
    const startDate = formatTzDate(startMs, "UTC");
    const endDate = formatTzDate(endMs, "UTC");
    const name = `w_${startDate}`;

    cohorts.push({
      name,
      dimension: "firstSessionDate",
      dateRange: { startDate, endDate },
    });
    nameToStartDate.set(name, startDate);
  }

  return {
    cohortSpec: {
      cohorts,
      cohortsRange: {
        granularity: "WEEKLY" as const,
        startOffset: 0,
        endOffset: numWeeks - 1,
      },
    },
    nameToStartDate,
  };
}

/**
 * Discovers and records metadata catalog for a property (F1 / F4).
 * Single implementation used both on-demand and routine sync.
 */
export const syncGa4Catalog = internalAction({
  args: { connectionId: v.id("connections") },
  handler: async (ctx, { connectionId }) => {
    const conn = await ctx.runQuery(internal.connections.getForSync, {
      connectionId,
    });
    if (conn === null) throw new Error("GA4 connection not found.");
    if (conn.provider !== "ga4") {
      throw new Error("Connection is not a GA4 connection.");
    }
    const propertyId = (conn.externalId ?? "").trim();
    if (!/^\d+$/.test(propertyId)) {
      throw new Error("GA4 property ID is missing or invalid.");
    }

    try {
      const secret = await decryptCredentials(conn.encryptedCredentials);
      const parsed = JSON.parse(secret) as {
        client_email?: string;
        private_key?: string;
      };
      if (!parsed.client_email || !parsed.private_key) {
        throw new Error("missing fields in GA4 service account");
      }
      const token = await getAccessToken({
        client_email: parsed.client_email,
        private_key: parsed.private_key,
      });

      const meta = await fetchMetadata(propertyId, token);
      await ctx.runMutation(internal.ga4Store.recordCatalog, {
        workspaceId: conn.workspaceId,
        propertyId,
        dimensions: meta.dimensions,
        metrics: meta.metrics,
        fetchedAt: Date.now(),
      });
    } catch (err) {
      await ctx.runMutation(internal.ga4Store.recordCatalogError, {
        workspaceId: conn.workspaceId,
        propertyId,
        error: sanitizeSyncError(err),
        errorAt: Date.now(),
      });
      throw err;
    }
  },
});

/**
 * Discovers and records GA4 configuration from Admin API (A7).
 * Reads: property details, dataRetentionSettings, keyEvents, customDimensions,
 * customMetrics, dataStreams, googleAdsLinks.
 */
export const syncGa4Config = internalAction({
  args: { connectionId: v.id("connections") },
  handler: async (ctx, { connectionId }) => {
    const conn = await ctx.runQuery(internal.connections.getForSync, {
      connectionId,
    });
    if (conn === null) throw new Error("GA4 connection not found.");
    if (conn.provider !== "ga4") {
      throw new Error("Connection is not a GA4 connection.");
    }
    const propertyId = (conn.externalId ?? "").trim();
    if (!/^\d+$/.test(propertyId)) {
      throw new Error("GA4 property ID is missing or invalid.");
    }

    const secret = await decryptCredentials(conn.encryptedCredentials);
    const parsed = JSON.parse(secret) as {
      client_email?: string;
      private_key?: string;
    };
    if (!parsed.client_email || !parsed.private_key) {
      throw new Error("missing fields in GA4 service account");
    }
    const token = await getAccessToken({
      client_email: parsed.client_email,
      private_key: parsed.private_key,
    });

    const tasks = [
      { name: "property", fn: () => fetchProperty(propertyId, token) },
      { name: "dataRetention", fn: () => fetchDataRetention(propertyId, token) },
      { name: "keyEvents", fn: () => fetchKeyEvents(propertyId, token) },
      { name: "customDimensions", fn: () => fetchCustomDimensions(propertyId, token) },
      { name: "customMetrics", fn: () => fetchCustomMetrics(propertyId, token) },
      { name: "dataStreams", fn: () => fetchDataStreams(propertyId, token) },
      { name: "googleAdsLinks", fn: () => fetchGoogleAdsLinks(propertyId, token) },
    ];

    const results = await mapWithConcurrency(tasks, 7, async (t) => {
      const res = await t.fn();
      return { name: t.name, res };
    });

    const errors: Array<{ resource: string; reason: string }> = [];
    let propertyData: Ga4PropertyDetails | undefined;
    let retentionData: Ga4DataRetentionSettings | undefined;
    let keyEventsData: Ga4KeyEvent[] | undefined;
    let customDimsData: Ga4CustomDimension[] | undefined;
    let customMetricsData: Ga4CustomMetric[] | undefined;
    let dataStreamsData: Ga4DataStream[] | undefined;
    let googleAdsLinksData: Ga4GoogleAdsLink[] | undefined;

    for (const { name, res } of results) {
      if (!res.ok) {
        errors.push({ resource: name, reason: res.reason });
      } else {
        if (name === "property") propertyData = res.data as Ga4PropertyDetails;
        else if (name === "dataRetention") retentionData = res.data as Ga4DataRetentionSettings;
        else if (name === "keyEvents") keyEventsData = res.data as Ga4KeyEvent[];
        else if (name === "customDimensions") customDimsData = res.data as Ga4CustomDimension[];
        else if (name === "customMetrics") customMetricsData = res.data as Ga4CustomMetric[];
        else if (name === "dataStreams") dataStreamsData = res.data as Ga4DataStream[];
        else if (name === "googleAdsLinks") googleAdsLinksData = res.data as Ga4GoogleAdsLink[];
      }
    }

    await ctx.runMutation(internal.ga4Store.recordConfig, {
      workspaceId: conn.workspaceId,
      propertyId,
      fetchedAt: Date.now(),
      displayName: propertyData?.displayName,
      timeZone: propertyData?.timeZone,
      currencyCode: propertyData?.currencyCode,
      industryCategory: propertyData?.industryCategory,
      serviceLevel: propertyData?.serviceLevel,
      createTime: propertyData?.createTime,
      eventDataRetention: retentionData?.eventDataRetention,
      resetUserDataOnNewActivity: retentionData?.resetUserDataOnNewActivity,
      keyEvents: keyEventsData,
      customDimensions: customDimsData,
      customMetrics: customMetricsData,
      dataStreams: dataStreamsData,
      googleAdsLinks: googleAdsLinksData,
      errors: errors.length > 0 ? errors : undefined,
    });
  },
});

export const syncGa4 = internalAction({
  args: { connectionId: v.id("connections") },
  handler: async (ctx, { connectionId }) => {
    const conn = await ctx.runQuery(internal.connections.getForSync, {
      connectionId,
    });
    if (conn === null) throw new Error("GA4 connection not found.");
    if (conn.provider !== "ga4") {
      throw new Error("Connection is not a GA4 connection.");
    }
    const workspaceId = conn.workspaceId;

    // Everything below records to `syncRuns` via `runSync`
    await runSync(
      ctx,
      { workspaceId, provider: "ga4", connectionId },
      async () => {
        const propertyId = (conn.externalId ?? "").trim();
        if (!/^\d+$/.test(propertyId)) {
          throw new Error("GA4 property ID is missing or invalid.");
        }

        // 1. Quota Gate check: refuse run if gate is in "stop" state
        const gate = await readGate(ctx, workspaceId);
        if (gate.state === "stop") {
          throw new Error(
            `GA4 kvota je preopterećena (${gate.peakPct.toFixed(1)}% iskorišćeno). Sinhronizacija je zaustavljena radi zaštite projekta.`,
          );
        }
        const isWarn = gate.state === "warn";

        // 2. Decrypt credentials & acquire access token
        const secret = await decryptCredentials(conn.encryptedCredentials);
        let sa: { client_email: string; private_key: string };
        try {
          const parsed = JSON.parse(secret) as {
            client_email?: string;
            private_key?: string;
          };
          if (!parsed.client_email || !parsed.private_key) {
            throw new Error("missing fields");
          }
          sa = {
            client_email: parsed.client_email,
            private_key: parsed.private_key,
          };
        } catch {
          throw new Error("GA4 service account JSON is invalid.");
        }

        const token = await getAccessToken(sa);

        // 3. Metadata Catalog Sync (once per 24 hours, non-blocking fallback via syncGa4Catalog) (F1 / F4)
        const cachedCatalog = await ctx.runQuery(
          internal.ga4Store.getCatalog,
          { workspaceId },
        );
        const now = Date.now();
        if (
          cachedCatalog === null ||
          now - cachedCatalog.fetchedAt > CATALOG_SYNC_INTERVAL_MS
        ) {
          try {
            await ctx.runAction(internal.ga4.syncGa4Catalog, { connectionId });
          } catch {
            // Non-fatal if metadata call fails during routine data sync; error logged to ga4Catalog
          }
        }

        const cachedConfig = await ctx.runQuery(
          internal.ga4Store.getConfig,
          { workspaceId },
        );
        if (
          cachedConfig === null ||
          now - cachedConfig.fetchedAt > CONFIG_SYNC_INTERVAL_MS
        ) {
          try {
            await ctx.runAction(internal.ga4.syncGa4Config, { connectionId });
          } catch {
            // Non-fatal if config call fails during routine data sync
          }
        }

        // 4. Timezone Resolution & Target Date Range for daily / traffic
        const cachedMeta = await ctx.runQuery(
          internal.ga4Store.getReportMeta,
          {
            workspaceId,
            reportKey: "daily",
          },
        );

        let dailyDateRange: { startDate: string; endDate: string };
        const propertyTz = cachedMeta?.timeZone;

        if (!propertyTz) {
          // First run: use relative date range that GA4 resolves in property timezone
          dailyDateRange = { startDate: "89daysAgo", endDate: "today" };
        } else {
          // Known property timezone: calculate calendar window in that timezone
          const candidates = lastNDatesInTz(BACKFILL_DAYS, propertyTz);
          const existingRows: Array<{ date: string; metricsVersion?: number }> =
            await ctx.runQuery(internal.ga4Store.dailyDates, {
              workspaceId,
              since: candidates[0],
            });
          const existingMap = new Map<string, number | undefined>(
            existingRows.map((r) => [r.date, r.metricsVersion]),
          );
          const lookbackCutoff =
            candidates[candidates.length - LOOKBACK_DAYS];

          // Stale / missing days before lookbackCutoff
          const staleDays = candidates.filter(
            (d) =>
              d < lookbackCutoff &&
              (!existingMap.has(d) ||
                (existingMap.get(d) ?? 0) < GA4_DAILY_METRICS_VERSION),
          );

          // Take up to 30 newest stale days (candidates is ascending, so slice(-30) takes newest)
          const selectedStaleDays = staleDays.slice(-30);

          // Merge with lookback window [lookbackCutoff, today] into ONE continuous dateRange
          const startDate =
            selectedStaleDays.length > 0
              ? selectedStaleDays[0]
              : lookbackCutoff;

          dailyDateRange = { startDate, endDate: "today" };
        }

        // 5. Progressive Backfill Planning for 11 Metric Reports (A4 §5.2 + A6)
        type ReportPlan = {
          reportKey: string;
          dateRanges: { startDate: string; endDate: string }[];
          syncDates: string[] | null;
          newOldestDate?: string;
          isCompleted?: boolean;
        };

        const metricReportDefs = [
          {
            reportKey: "acq_channel_first",
            dimensionKeys: ["firstUserDefaultChannelGroup"],
            dimensions: [{ name: "date" }, { name: "firstUserDefaultChannelGroup" }],
            metrics: ["totalUsers", "newUsers", "keyEvents"],
          },
          {
            reportKey: "acq_channel_session",
            dimensionKeys: ["sessionDefaultChannelGroup"],
            dimensions: [{ name: "date" }, { name: "sessionDefaultChannelGroup" }],
            metrics: ["sessions", "engagedSessions", "keyEvents"],
          },
          {
            reportKey: "acq_source_first",
            dimensionKeys: ["firstUserSource", "firstUserMedium"],
            dimensions: [
              { name: "date" },
              { name: "firstUserSource" },
              { name: "firstUserMedium" },
            ],
            metrics: ["newUsers", "totalUsers", "keyEvents"],
          },
          {
            reportKey: "acq_source_session",
            dimensionKeys: ["sessionSource", "sessionMedium"],
            dimensions: [
              { name: "date" },
              { name: "sessionSource" },
              { name: "sessionMedium" },
            ],
            metrics: ["sessions", "engagedSessions", "keyEvents"],
          },
          {
            reportKey: "content_pages",
            dimensionKeys: ["pagePath"],
            dimensions: [{ name: "date" }, { name: "pagePath" }],
            metrics: [
              "screenPageViews",
              "totalUsers",
              "userEngagementDuration",
              "keyEvents",
            ],
          },
          {
            reportKey: "content_landing",
            dimensionKeys: ["landingPage"],
            dimensions: [{ name: "date" }, { name: "landingPage" }],
            metrics: ["sessions", "engagedSessions", "keyEvents"],
          },
          {
            reportKey: "audience_device",
            dimensionKeys: ["deviceCategory"],
            dimensions: [{ name: "date" }, { name: "deviceCategory" }],
            metrics: [
              "sessions",
              "engagedSessions",
              "totalUsers",
              "keyEvents",
            ],
          },
          {
            reportKey: "audience_geo",
            dimensionKeys: ["country", "city"],
            dimensions: [{ name: "date" }, { name: "country" }, { name: "city" }],
            metrics: ["totalUsers", "sessions", "keyEvents"],
          },
          {
            reportKey: "time_hour",
            dimensionKeys: ["hour"],
            dimensions: [{ name: "date" }, { name: "hour" }],
            metrics: ["sessions", "totalUsers"],
          },
          {
            reportKey: "events_by_name",
            dimensionKeys: ["eventName"],
            dimensions: [{ name: "date" }, { name: "eventName" }],
            metrics: ["eventCount", "totalUsers", "eventValue"],
          },
          {
            reportKey: "ads_campaign",
            dimensionKeys: ["googleAdsCampaignName"],
            dimensions: [{ name: "date" }, { name: "googleAdsCampaignName" }],
            metrics: [
              "advertiserAdCost",
              "advertiserAdClicks",
              "advertiserAdImpressions",
              "sessions",
              "engagedSessions",
              "keyEvents",
            ],
          },
          {
            reportKey: "ads_keyword",
            dimensionKeys: ["googleAdsCampaignName", "googleAdsKeyword"],
            dimensions: [
              { name: "date" },
              { name: "googleAdsCampaignName" },
              { name: "googleAdsKeyword" },
            ],
            metrics: [
              "advertiserAdCost",
              "advertiserAdClicks",
              "sessions",
              "keyEvents",
            ],
          },
        ] as const;

        const metricPlans = new Map<string, ReportPlan>();

        if (!propertyTz) {
          // First run: 30-day relative range, null syncDates (F1)
          for (const def of metricReportDefs) {
            metricPlans.set(def.reportKey, {
              reportKey: def.reportKey,
              dateRanges: [{ startDate: "29daysAgo", endDate: "today" }],
              syncDates: null,
            });
          }
        } else {
          const all90 = lastNDatesInTz(BACKFILL_DAYS, propertyTz);
          const recentCutoff = all90[all90.length - LOOKBACK_DAYS]; // last 3 days

          for (const def of metricReportDefs) {
            const rk = def.reportKey;
            const backfill = await ctx.runQuery(internal.ga4Store.getBackfill, {
              workspaceId,
              reportKey: rk,
            });

            if (!backfill) {
              // 1st run in tz: sync last 30 days
              const oldestIdx = Math.max(0, all90.length - 30);
              const oldestDate = all90[oldestIdx];
              const rRanges = [{ startDate: oldestDate, endDate: "today" }];
              const rSyncDates = all90.filter((d) => d >= oldestDate);
              const isCompleted = oldestIdx === 0;
              metricPlans.set(rk, {
                reportKey: rk,
                dateRanges: rRanges,
                syncDates: rSyncDates,
                newOldestDate: oldestDate,
                isCompleted,
              });
            } else if (backfill.completedAt) {
              // Fully backfilled: only sync recent 3 days
              const rRanges = [{ startDate: recentCutoff, endDate: "today" }];
              const rSyncDates = all90.filter((d) => d >= recentCutoff);
              metricPlans.set(rk, {
                reportKey: rk,
                dateRanges: rRanges,
                syncDates: rSyncDates,
              });
            } else {
              // In progress: step back up to 30 days from previous oldest
              const currentOldestIdx = all90.indexOf(backfill.oldestSyncedDate);
              if (currentOldestIdx <= 0) {
                // Already at boundary
                const rRanges = [{ startDate: recentCutoff, endDate: "today" }];
                const rSyncDates = all90.filter((d) => d >= recentCutoff);
                metricPlans.set(rk, {
                  reportKey: rk,
                  dateRanges: rRanges,
                  syncDates: rSyncDates,
                  newOldestDate: backfill.oldestSyncedDate,
                  isCompleted: true,
                });
              } else {
                const nextOldestIdx = Math.max(0, currentOldestIdx - 30);
                const newOldestDate = all90[nextOldestIdx];
                const isCompleted = nextOldestIdx === 0;
                const prevOldest = backfill.oldestSyncedDate;

                let rRanges: { startDate: string; endDate: string }[];
                if (recentCutoff <= prevOldest) {
                  rRanges = [{ startDate: newOldestDate, endDate: "today" }];
                } else {
                  // Exactly TWO separate dateRanges (F1 rule: sent as 2 distinct requests)
                  rRanges = [
                    { startDate: newOldestDate, endDate: prevOldest },
                    { startDate: recentCutoff, endDate: "today" },
                  ];
                }

                const rSyncDates = all90.filter(
                  (d) =>
                    (d >= newOldestDate && d <= prevOldest) || d >= recentCutoff,
                );

                metricPlans.set(rk, {
                  reportKey: rk,
                  dateRanges: rRanges,
                  syncDates: rSyncDates,
                  newOldestDate,
                  isCompleted,
                });
              }
            }
          }
        }

        // 6. Check Google Ads metric availability before building requests (Section 5.2)
        const freshCatalog =
          cachedCatalog ??
          (await ctx.runQuery(internal.ga4Store.getCatalog, { workspaceId }));
        const catalogMetrics = freshCatalog?.metrics;
        const adsCostResolved = resolveMetric("advertiserAdCost", catalogMetrics);
        const adsAvailable = adsCostResolved.availability === "available";

        // Define Requests with EXACTLY ONE dateRange per request (F1)
        const dailyRequest: ReportRequest = {
          dateRanges: [dailyDateRange],
          dimensions: [{ name: "date" }],
          metrics: [
            { name: "sessions" },
            { name: "activeUsers" },
            { name: "newUsers" },
            { name: "keyEvents" },
            { name: "totalUsers" },
            { name: "engagedSessions" },
            { name: "screenPageViews" },
            { name: "userEngagementDuration" },
            { name: "scrolledUsers" },
          ],
          keepEmptyRows: true,
          returnPropertyQuota: true,
        };

        const trafficRequest: ReportRequest = {
          dateRanges: [dailyDateRange],
          dimensions: [
            { name: "date" },
            { name: "sessionSource" },
            { name: "sessionMedium" },
            { name: "sessionCampaignName" },
          ],
          metrics: [{ name: "sessions" }, { name: "keyEvents" }],
          keepEmptyRows: true,
          returnPropertyQuota: true,
        };

        type TaggedMetricRequest = {
          reportKey: string;
          def: (typeof metricReportDefs)[number];
          range: { startDate: string; endDate: string };
          activeMetrics: string[];
          blockedMetrics: string[];
          syncDates: string[] | null;
          request: ReportRequest;
        };

        const taggedMetricRequests: TaggedMetricRequest[] = [];
        const unavailAdsRows: MetricDailyRow[] = [];

        for (const def of metricReportDefs) {
          const isAdsDef =
            def.reportKey === "ads_campaign" || def.reportKey === "ads_keyword";

          // If Google Ads metrics are blocked/unavailable, do NOT send requests to GA4 API (Section 5.2)
          if (isAdsDef && !adsAvailable) {
            const plan = metricPlans.get(def.reportKey);
            const targetDates =
              plan?.syncDates ??
              (propertyTz
                ? lastNDatesInTz(LOOKBACK_DAYS, propertyTz)
                : [formatTzDate(Date.now(), "UTC")]);

            for (const d of targetDates) {
              for (const m of def.metrics) {
                unavailAdsRows.push({
                  reportKey: def.reportKey,
                  date: d,
                  metric: m,
                  dimensionKeys: [],
                  dimensionValues: [],
                  dimKey: "",
                  value: undefined,
                  state: "unavailable",
                });
              }
            }
            continue;
          }

          const plan = metricPlans.get(def.reportKey);
          if (!plan) continue;

          // Check for blocked metrics
          const activeMetrics: string[] = [];
          const blockedMetrics: string[] = [];

          for (const m of def.metrics) {
            const resolved = resolveMetric(m, catalogMetrics);
            if (resolved.availability === "blocked") {
              blockedMetrics.push(m);
            } else {
              activeMetrics.push(m);
            }
          }

          for (const range of plan.dateRanges) {
            const req: ReportRequest = {
              dateRanges: [range],
              dimensions: def.dimensions as unknown as { name: string }[],
              metrics: activeMetrics.map((m) => ({ name: m })),
              keepEmptyRows: true,
              returnPropertyQuota: true,
            };

            let subSyncDates: string[] | null = null;
            if (plan.syncDates && propertyTz) {
              subSyncDates = plan.syncDates.filter(
                (d) =>
                  d >= range.startDate &&
                  (range.endDate === "today" || d <= range.endDate),
              );
            }

            taggedMetricRequests.push({
              reportKey: def.reportKey,
              def,
              range,
              activeMetrics,
              blockedMetrics,
              syncDates: subSyncDates,
              request: req,
            });
          }
        }

        // 7. Partition into Batches (max 5 requests per batch)
        const requestsToRun: ReportRequest[] = isWarn
          ? [dailyRequest, trafficRequest]
          : [
              dailyRequest,
              trafficRequest,
              ...taggedMetricRequests.map((t) => t.request),
            ];

        // 8. Pre-flight Compatibility Check per request using mapWithConcurrency & 7d cache
        const compatWarnings = await mapWithConcurrency(
          requestsToRun,
          3,
          async (req) => {
            return await verifyRequestCompatibility(
              ctx,
              workspaceId,
              propertyId,
              token,
              req,
            );
          },
        );

        // 9. Execute Batch Reports (max 5 per batch, concurrency 3)
        const batches: ReportRequest[][] = [];
        for (let i = 0; i < requestsToRun.length; i += 5) {
          batches.push(requestsToRun.slice(i, i + 5));
        }

        const batchResults = await mapWithConcurrency(
          batches,
          3,
          async (batchReqs) => batchRunReports(propertyId, token, batchReqs),
        );

        const fetchedAt = Date.now();

        // 10. Record Property Quotas (highest peak quota)
        let bestQuota: Ga4PropertyQuota | undefined;
        let highestPeak = -1;
        for (const batchRes of batchResults) {
          if (batchRes.propertyQuota) {
            const peak = quotaPeak(batchRes.propertyQuota);
            if (peak > highestPeak) {
              highestPeak = peak;
              bestQuota = batchRes.propertyQuota;
            }
          }
        }
        if (bestQuota) {
          await ctx.runMutation(internal.ga4Store.recordQuota, {
            workspaceId,
            propertyId,
            quota: bestQuota,
            fetchedAt,
          });
        }

        const flattenedReports = batchResults.flatMap((b) => b.reports);
        const dailyReport = flattenedReports[0];
        const trafficReport = flattenedReports[1];

        // Record Daily & Traffic Metadatas
        if (dailyReport?.metadata) {
          await ctx.runMutation(internal.ga4Store.recordReportMeta, {
            workspaceId,
            reportKey: "daily",
            metadata: dailyReport.metadata as Ga4ResponseMetadata,
            fetchedAt,
          });
        }
        if (trafficReport?.metadata) {
          await ctx.runMutation(internal.ga4Store.recordReportMeta, {
            workspaceId,
            reportKey: "traffic",
            metadata: trafficReport.metadata as Ga4ResponseMetadata,
            fetchedAt,
          });
        }

        // 11. Parse & Upsert Daily Totals (ga4Daily)
        const dailyRows = (dailyReport?.rows ?? []).map((r) => {
          const d = r.dimensionValues ?? [];
          const m = r.metricValues ?? [];
          return {
            date: normalizeDate(d[0]?.value ?? ""),
            sessions: toNumber(m[0]?.value),
            activeUsers: toNumber(m[1]?.value),
            newUsers: toNumber(m[2]?.value),
            keyEvents: toNumber(m[3]?.value),
            totalUsers: toNumber(m[4]?.value),
            engagedSessions: toNumber(m[5]?.value),
            screenPageViews: toNumber(m[6]?.value),
            userEngagementDuration: toNumber(m[7]?.value),
            scrolledUsers: toNumber(m[8]?.value),
            metricsVersion: GA4_DAILY_METRICS_VERSION,
          };
        });

        const dailyWritten =
          dailyRows.length > 0
            ? await ctx.runMutation(internal.ga4Store.upsertDaily, {
                workspaceId,
                rows: dailyRows,
              })
            : 0;

        // 12. Parse & Upsert Traffic Breakdown (ga4TrafficDaily)
        const trafficRows = (trafficReport?.rows ?? []).map((r) => {
          const d = r.dimensionValues ?? [];
          const m = r.metricValues ?? [];
          return {
            date: normalizeDate(d[0]?.value ?? ""),
            sessionSource: d[1]?.value ?? "(not set)",
            sessionMedium: d[2]?.value ?? "(not set)",
            sessionCampaign: d[3]?.value ?? "(not set)",
            sessions: toNumber(m[0]?.value),
            keyEvents: toNumber(m[1]?.value),
          };
        });

        let trafficWritten = 0;
        for (let i = 0; i < trafficRows.length; i += CHUNK_SIZE) {
          trafficWritten += await ctx.runMutation(
            internal.ga4Store.upsertTraffic,
            { workspaceId, rows: trafficRows.slice(i, i + CHUNK_SIZE) },
          );
        }

        // 13. Parse & Merge Metric Reports (ga4MetricDaily)
        let metricDailyWritten = 0;
        if (!isWarn) {
          const allMetricRows: MetricDailyRow[] = [];

          for (let i = 0; i < taggedMetricRequests.length; i++) {
            const tagged = taggedMetricRequests[i];
            const reportRes = flattenedReports[2 + i];
            if (!reportRes) continue;

            if (reportRes.metadata) {
              await ctx.runMutation(internal.ga4Store.recordReportMeta, {
                workspaceId,
                reportKey: tagged.reportKey,
                metadata: reportRes.metadata as Ga4ResponseMetadata,
                fetchedAt,
              });
            }

            const parsedRows = parseMetricDailyReport(
              reportRes,
              {
                reportKey: tagged.reportKey,
                dimensionKeys: tagged.def.dimensionKeys as unknown as string[],
                metrics: tagged.activeMetrics,
              },
              tagged.syncDates,
            );
            allMetricRows.push(...parsedRows);

            // Emit "unavailable" marker rows for blocked metrics
            if (tagged.blockedMetrics.length > 0 && tagged.syncDates) {
              for (const d of tagged.syncDates) {
                for (const bm of tagged.blockedMetrics) {
                  allMetricRows.push({
                    reportKey: tagged.reportKey,
                    date: d,
                    metric: bm,
                    dimensionKeys: [],
                    dimensionValues: [],
                    dimKey: "",
                    value: undefined,
                    state: "unavailable",
                  });
                }
              }
            }
          }

          // If Google Ads metrics are unavailable/blocked, append marker rows
          if (!adsAvailable && unavailAdsRows.length > 0) {
            allMetricRows.push(...unavailAdsRows);
          }

          for (let i = 0; i < allMetricRows.length; i += CHUNK_SIZE) {
            metricDailyWritten += await ctx.runMutation(
              internal.ga4Store.upsertMetricDaily,
              {
                workspaceId,
                rows: allMetricRows.slice(i, i + CHUNK_SIZE),
              },
            );
          }

          // 14. Update ga4Backfill markers
          for (const [rk, plan] of metricPlans.entries()) {
            // Skip updating completed backfill if ads are blocked
            if ((rk === "ads_campaign" || rk === "ads_keyword") && !adsAvailable) {
              continue;
            }
            if (plan.newOldestDate) {
              await ctx.runMutation(internal.ga4Store.updateBackfill, {
                workspaceId,
                reportKey: rk,
                oldestSyncedDate: plan.newOldestDate,
                completedAt: plan.isCompleted ? Date.now() : undefined,
              });
            }
          }

          // 15. Cohort Report Sync (12 weekly cohorts as a separate runReport) (A5 §5.2 / F1-F4)
          try {
            const { cohortSpec, nameToStartDate } = generateWeeklyCohorts(
              propertyTz ?? "UTC",
              12,
            );
            const cohortRequest: ReportRequest = {
              dimensions: [{ name: "cohort" }, { name: "cohortNthWeek" }],
              metrics: [
                { name: "cohortActiveUsers" },
                { name: "cohortTotalUsers" },
              ],
              cohortSpec,
              returnPropertyQuota: true,
            };

            const cohortResult = await runReport(
              propertyId,
              token,
              cohortRequest,
            );

            if (cohortResult.propertyQuota) {
              const peak = quotaPeak(cohortResult.propertyQuota);
              if (peak > highestPeak) {
                await ctx.runMutation(internal.ga4Store.recordQuota, {
                  workspaceId,
                  propertyId,
                  quota: cohortResult.propertyQuota,
                  fetchedAt: Date.now(),
                });
              }
            }

            if (cohortResult.metadata) {
              await ctx.runMutation(internal.ga4Store.recordReportMeta, {
                workspaceId,
                reportKey: "cohorts",
                metadata: cohortResult.metadata as Ga4ResponseMetadata,
                fetchedAt: Date.now(),
              });
            }

            const cohortRows = (cohortResult.rows ?? []).map((r) => {
              const cohortName = r.dimensionValues?.[0]?.value ?? "";
              const nth = parseInt(r.dimensionValues?.[1]?.value ?? "0", 10);
              const startDate =
                nameToStartDate.get(cohortName) ??
                cohortName.replace(/^w_/, "");
              const activeUsers = toNumber(r.metricValues?.[0]?.value);
              const totalUsers = toNumber(r.metricValues?.[1]?.value);
              // F4 rule: Every row returned from the API is state "value", even when activeUsers is 0.
              const state = "value" as const;

              return {
                granularity: "WEEKLY",
                cohortName,
                cohortStartDate: startDate,
                nth,
                cohortTotalUsers: totalUsers,
                cohortActiveUsers: activeUsers,
                state,
              };
            });

            if (cohortRows.length > 0) {
              await ctx.runMutation(internal.ga4Store.upsertCohorts, {
                workspaceId,
                rows: cohortRows,
              });
            }
          } catch {
            // Non-fatal if cohort sync fails
          }
        }

        const totalItems = dailyWritten + trafficWritten + metricDailyWritten;

        // Notes for syncRuns
        const notes: string[] = [];
        const uniqueCompatWarnings = Array.from(
          new Set(compatWarnings.filter((w): w is string => Boolean(w))),
        );
        for (const warn of uniqueCompatWarnings) {
          notes.push(warn);
        }
        if (isWarn) {
          notes.push(
            `Delimično: kvota na ${gate.peakPct.toFixed(0)}%, prošireni izveštaji i kohorte preskočeni.`,
          );
        }
        if (!adsAvailable) {
          notes.push(
            "Google Ads metrike nisu dostupne - veza GA4 i Google Ads nije aktivna.",
          );
        }

        if (notes.length > 0) {
          return { itemsWritten: totalItems, note: notes.join(" ") };
        }

        return totalItems;
      },
    );
  },
});

/**
 * Public action for Realtime screen (/analytics/uzivo).
 * Enforces 45-second cache, sends 4 small runRealtimeReport requests concurrently.
 * Respects readGate: on "stop" writes state "unavailable" and does not throw.
 */
export const refreshRealtime = action({
  args: {},
  returns: v.object({
    refreshed: v.boolean(),
    cached: v.boolean(),
    gateBlocked: v.optional(v.boolean()),
    error: v.optional(v.string()),
    fetchedAt: v.optional(v.number()),
  }),
  handler: async (
    ctx,
  ): Promise<{
    refreshed: boolean;
    cached: boolean;
    gateBlocked?: boolean;
    error?: string;
    fetchedAt?: number;
  }> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new ConvexError({ code: "unauthorized" });

    const userWs = await ctx.runQuery(
      internal.workspaces.getWorkspaceForUser,
      { userId },
    );
    if (!userWs) {
      throw new ConvexError({ code: "forbidden" });
    }
    const workspaceId = userWs.workspaceId;

    // 1. Check existing snapshot in ga4Realtime for 45s cache
    const existing = await ctx.runQuery(internal.ga4Store.getRealtime, {
      workspaceId,
    });
    const now = Date.now();
    if (existing && now - existing.fetchedAt < 45_000) {
      return {
        refreshed: false,
        cached: true,
        fetchedAt: existing.fetchedAt,
      };
    }

    // 2. Check GA4 connection
    const conn = await ctx.runQuery(internal.connections.getGa4ForWorkspace, {
      workspaceId,
    });
    if (!conn) {
      return {
        refreshed: false,
        cached: false,
        error: "Nema povezane GA4 integracije.",
      };
    }

    const propertyId = (conn.externalId ?? "").trim();
    if (!/^\d+$/.test(propertyId)) {
      return {
        refreshed: false,
        cached: false,
        error: "GA4 Property ID nije validan.",
      };
    }

    // 3. Quota Gate check: if "stop", write state: "unavailable" and do not throw
    const gate = await readGate(ctx, workspaceId);
    if (gate.state === "stop") {
      await ctx.runMutation(internal.ga4Store.recordRealtime, {
        workspaceId,
        propertyId,
        fetchedAt: now,
        state: "unavailable",
        error: `GA4 kvota je preopterećena (${gate.peakPct.toFixed(1)}%). Podaci uživo su privremeno zaustavljeni radi zaštite projekta.`,
        byMinute: [],
        byScreen: [],
        byCountry: [],
        byDevice: [],
        byEvent: [],
      });
      return {
        refreshed: true,
        cached: false,
        gateBlocked: true,
        fetchedAt: now,
      };
    }

    // 4. Decrypt credentials & acquire access token
    const secret = await decryptCredentials(conn.encryptedCredentials);
    const parsed = JSON.parse(secret) as {
      client_email?: string;
      private_key?: string;
    };
    if (!parsed.client_email || !parsed.private_key) {
      throw new Error("Neispravni GA4 kredencijali.");
    }
    const token = await getAccessToken({
      client_email: parsed.client_email,
      private_key: parsed.private_key,
    });

    // 5. Send 4 small realtime requests via mapWithConcurrency (n=4)
    const realtimeRequests = [
      {
        id: "minutes",
        req: {
          dimensions: [{ name: "minutesAgo" }],
          metrics: [{ name: "activeUsers" }],
          minuteRanges: [{ startMinutesAgo: 29, endMinutesAgo: 0 }],
          returnPropertyQuota: true,
        },
      },
      {
        id: "screens",
        req: {
          dimensions: [{ name: "unifiedScreenName" }],
          metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }],
          minuteRanges: [{ startMinutesAgo: 29, endMinutesAgo: 0 }],
          returnPropertyQuota: true,
        },
      },
      {
        id: "countries",
        req: {
          dimensions: [{ name: "country" }],
          metrics: [{ name: "activeUsers" }],
          minuteRanges: [{ startMinutesAgo: 29, endMinutesAgo: 0 }],
          returnPropertyQuota: true,
        },
      },
      {
        id: "devices",
        req: {
          dimensions: [{ name: "deviceCategory" }],
          metrics: [{ name: "activeUsers" }],
          minuteRanges: [{ startMinutesAgo: 29, endMinutesAgo: 0 }],
          returnPropertyQuota: true,
        },
      },
    ];

    const results = await mapWithConcurrency(
      realtimeRequests,
      4,
      async ({ req }) => runRealtimeReport(propertyId, token, req),
    );

    // Track highest quota from realtime calls
    let bestQuota: Ga4PropertyQuota | undefined;
    let highestPeak = -1;
    for (const r of results) {
      if (r.propertyQuota) {
        const peak = quotaPeak(r.propertyQuota);
        if (peak > highestPeak) {
          highestPeak = peak;
          bestQuota = r.propertyQuota;
        }
      }
    }
    if (bestQuota) {
      await ctx.runMutation(internal.ga4Store.recordQuota, {
        workspaceId,
        propertyId,
        quota: bestQuota,
        fetchedAt: now,
      });
    }

    const minRes = results[0]?.rows ?? [];
    const screenRes = results[1]?.rows ?? [];
    const countryRes = results[2]?.rows ?? [];
    const deviceRes = results[3]?.rows ?? [];

    // Parse minutes: 00..29 -> 30 entries (minutesAgo 0..29)
    const minuteMap = new Map<number, number>();
    for (const r of minRes) {
      const minAgo = parseInt(r.dimensionValues?.[0]?.value ?? "0", 10);
      const users = toNumber(r.metricValues?.[0]?.value);
      minuteMap.set(minAgo, (minuteMap.get(minAgo) ?? 0) + users);
    }

    const byMinute: Array<{ minutesAgo: number; activeUsers: number }> = [];
    let totalActive = 0;
    for (let m = 29; m >= 0; m--) {
      const u = minuteMap.get(m) ?? 0;
      byMinute.push({ minutesAgo: m, activeUsers: u });
      totalActive += u;
    }

    const byScreen: Array<{ key: string; value: number }> = screenRes
      .map((r) => ({
        key: r.dimensionValues?.[0]?.value || "(not set)",
        value: toNumber(r.metricValues?.[0]?.value), // screenPageViews
      }))
      .sort((a, b) => b.value - a.value);

    const byCountry: Array<{ key: string; value: number }> = countryRes
      .map((r) => ({
        key: r.dimensionValues?.[0]?.value || "(not set)",
        value: toNumber(r.metricValues?.[0]?.value),
      }))
      .sort((a, b) => b.value - a.value);

    const byDevice: Array<{ key: string; value: number }> = deviceRes
      .map((r) => ({
        key: r.dimensionValues?.[0]?.value || "(not set)",
        value: toNumber(r.metricValues?.[0]?.value),
      }))
      .sort((a, b) => b.value - a.value);

    await ctx.runMutation(internal.ga4Store.recordRealtime, {
      workspaceId,
      propertyId,
      fetchedAt: now,
      activeUsers: totalActive,
      byMinute,
      byScreen,
      byCountry,
      byDevice,
      byEvent: [],
      state: "value",
    });

    return {
      refreshed: true,
      cached: false,
      fetchedAt: now,
    };
  },
});

/**
 * Public action for manually refreshing GA4 configuration from Settings screen (A7).
 */
export const refreshGa4Config = action({
  args: {},
  returns: v.object({ ok: v.boolean(), error: v.optional(v.string()) }),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new ConvexError({ code: "unauthorized" });

    const userWs = await ctx.runQuery(
      internal.workspaces.getWorkspaceForUser,
      { userId },
    );
    if (!userWs) {
      throw new ConvexError({ code: "forbidden" });
    }
    const workspaceId = userWs.workspaceId;

    const conn = await ctx.runQuery(internal.connections.getGa4ForWorkspace, {
      workspaceId,
    });
    if (!conn) {
      return { ok: false, error: "Nema povezane GA4 integracije." };
    }

    try {
      await ctx.runAction(internal.ga4.syncGa4Config, {
        connectionId: conn._id,
      });
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
});

/**
 * Cron fan-out (every 6h): sync every GA4 connection. Per-connection errors are
 * already recorded on `syncRuns` by `runSync`, so we swallow here to keep one
 * bad connection from blocking the rest.
 */


export const syncAllGa4 = internalAction({
  args: {},
  handler: async (ctx) => {
    const connectionIds = await ctx.runQuery(
      internal.connections.listByProvider,
      { provider: "ga4" },
    );
    for (const connectionId of connectionIds) {
      try {
        await ctx.runAction(internal.ga4.syncGa4, { connectionId });
      } catch {
        // recorded on syncRuns; continue with the next connection
      }
    }
  },
});


