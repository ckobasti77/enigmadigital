import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import {
  deriveReportKey,
  getKeyEvents,
  getMetricDimKey,
  getMetricReportKey,
} from "./lib/ga4Catalog";
import {
  determineGateState,
  quotaHourlyPeak,
  quotaDailyPeak,
  quotaPeak,
  QUOTA_TTL_MS,
  QUOTA_DAILY_TTL_MS,
} from "./lib/ga4Quota";

/**
 * ============================================================================
 * GA4 PERSISTENCE LAYER (V8 runtime)
 * ============================================================================
 *
 * Handles database writes and reads for GA4 daily aggregates, traffic breakdown,
 * quota tracking, report metadata, and key events migration.
 *
 * Natural keys:
 *   - ga4Daily: [workspaceId, date]
 *   - ga4TrafficDaily: [workspaceId, date, source, medium, campaign]
 *   - ga4Quota: [workspaceId]
 *   - ga4ReportMeta: [workspaceId, reportKey]
 * ============================================================================
 */

const dailyRowValidator = v.object({
  date: v.string(),
  sessions: v.number(),
  activeUsers: v.number(),
  newUsers: v.number(),
  keyEvents: v.optional(v.number()),
  conversions: v.optional(v.number()),
  engagementRate: v.optional(v.number()),
  totalUsers: v.optional(v.number()),
  engagedSessions: v.optional(v.number()),
  screenPageViews: v.optional(v.number()),
  userEngagementDuration: v.optional(v.number()),
  scrolledUsers: v.optional(v.number()),
  metricsVersion: v.optional(v.number()),
});

const trafficRowValidator = v.object({
  date: v.string(),
  sessionSource: v.string(),
  sessionMedium: v.string(),
  sessionCampaign: v.string(),
  sessions: v.number(),
  keyEvents: v.optional(v.number()),
  conversions: v.optional(v.number()),
});

const metricDailyRowValidator = v.object({
  reportKey: v.optional(v.string()),
  date: v.string(),
  metric: v.string(),
  dimensionKeys: v.array(v.string()),
  dimensionValues: v.array(v.string()),
  dimKey: v.optional(v.string()),
  value: v.optional(v.number()),
  state: v.union(
    v.literal("value"),
    v.literal("thresholded"),
    v.literal("unavailable"),
  ),
});

/**
 * Upsert GA4 long-format metrics (ga4MetricDaily) by natural key:
 * [workspaceId, reportKey, date, metric, dimKey] (F2).
 */
export const upsertMetricDaily = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    rows: v.array(metricDailyRowValidator),
  },
  returns: v.number(),
  handler: async (ctx, { workspaceId, rows }) => {
    const syncedAt = Date.now();
    for (const row of rows) {
      const reportKey = getMetricReportKey(row);
      const dimKey = getMetricDimKey(row);
      const existing = await ctx.db
        .query("ga4MetricDaily")
        .withIndex("by_ws_report_date_metric_dim", (q) =>
          q
            .eq("workspaceId", workspaceId)
            .eq("reportKey", reportKey)
            .eq("date", row.date)
            .eq("metric", row.metric)
            .eq("dimKey", dimKey),
        )
        .unique();

      if (existing !== null) {
        await ctx.db.patch(existing._id, {
          reportKey,
          dimensionKeys: row.dimensionKeys,
          dimensionValues: row.dimensionValues,
          dimKey,
          value: row.value,
          state: row.state,
          syncedAt,
        });
      } else {
        await ctx.db.insert("ga4MetricDaily", {
          workspaceId,
          reportKey,
          date: row.date,
          metric: row.metric,
          dimensionKeys: row.dimensionKeys,
          dimensionValues: row.dimensionValues,
          dimKey,
          value: row.value,
          state: row.state,
          syncedAt,
        });
      }
    }
    return rows.length;
  },
});

/**
 * Dates already present in `ga4Daily` for this workspace on/after `since`.
 * The action diffs this set against the target window to decide which days
 * still need a first-time fetch or re-fetch (metricsVersion).
 */
export const dailyDates = internalQuery({
  args: { workspaceId: v.id("workspaces"), since: v.string() },
  returns: v.array(
    v.object({
      date: v.string(),
      metricsVersion: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, { workspaceId, since }) => {
    const rows = await ctx.db
      .query("ga4Daily")
      .withIndex("by_workspace_date", (q) =>
        q.eq("workspaceId", workspaceId).gte("date", since),
      )
      .collect();
    return rows.map((r) => ({
      date: r.date,
      metricsVersion: r.metricsVersion,
    }));
  },
});

/** Upsert daily totals by [workspaceId, date]. Returns rows written. */
export const upsertDaily = internalMutation({
  args: { workspaceId: v.id("workspaces"), rows: v.array(dailyRowValidator) },
  returns: v.number(),
  handler: async (ctx, { workspaceId, rows }) => {
    for (const row of rows) {
      const keyEvents = getKeyEvents(row);
      const existing = await ctx.db
        .query("ga4Daily")
        .withIndex("by_workspace_date", (q) =>
          q.eq("workspaceId", workspaceId).eq("date", row.date),
        )
        .unique();
      const patchData = {
        sessions: row.sessions,
        activeUsers: row.activeUsers,
        newUsers: row.newUsers,
        keyEvents,
        totalUsers: row.totalUsers,
        engagedSessions: row.engagedSessions,
        screenPageViews: row.screenPageViews,
        userEngagementDuration: row.userEngagementDuration,
        scrolledUsers: row.scrolledUsers,
        metricsVersion: row.metricsVersion,
      };
      if (existing !== null) {
        await ctx.db.patch(existing._id, patchData);
      } else {
        await ctx.db.insert("ga4Daily", {
          workspaceId,
          date: row.date,
          ...patchData,
        });
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
      const keyEvents = getKeyEvents(row);
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
          keyEvents,
        });
      } else {
        await ctx.db.insert("ga4TrafficDaily", {
          workspaceId,
          date: row.date,
          sessionSource: row.sessionSource,
          sessionMedium: row.sessionMedium,
          sessionCampaign: row.sessionCampaign,
          sessions: row.sessions,
          keyEvents,
        });
      }
    }
    return rows.length;
  },
});

/** Record latest propertyQuota in ga4Quota table. */
export const recordQuota = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    propertyId: v.string(),
    quota: v.optional(
      v.object({
        tokensPerDay: v.optional(
          v.object({ consumed: v.number(), remaining: v.number() }),
        ),
        tokensPerHour: v.optional(
          v.object({ consumed: v.number(), remaining: v.number() }),
        ),
        tokensPerProjectPerHour: v.optional(
          v.object({ consumed: v.number(), remaining: v.number() }),
        ),
        concurrentRequests: v.optional(
          v.object({ consumed: v.number(), remaining: v.number() }),
        ),
        serverErrorsPerProjectPerHour: v.optional(
          v.object({ consumed: v.number(), remaining: v.number() }),
        ),
        potentiallyThresholdedRequestsPerHour: v.optional(
          v.object({ consumed: v.number(), remaining: v.number() }),
        ),
      }),
    ),
    fetchedAt: v.number(),
  },
  handler: async (ctx, { workspaceId, propertyId, quota, fetchedAt }) => {
    if (!quota) return;
    const peakPct = quotaPeak(quota);
    const state = determineGateState(peakPct);

    const existing = await ctx.db
      .query("ga4Quota")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .unique();

    const data = {
      workspaceId,
      propertyId,
      fetchedAt,
      tokensPerDay: quota.tokensPerDay,
      tokensPerHour: quota.tokensPerHour,
      tokensPerProjectPerHour: quota.tokensPerProjectPerHour,
      concurrentRequests: quota.concurrentRequests,
      serverErrorsPerProjectPerHour: quota.serverErrorsPerProjectPerHour,
      potentiallyThresholdedRequestsPerHour:
        quota.potentiallyThresholdedRequestsPerHour,
      peakPct,
      state,
    };

    if (existing !== null) {
      await ctx.db.patch(existing._id, data);
    } else {
      await ctx.db.insert("ga4Quota", data);
    }
  },
});

/** Read quota gate for workspace. Accepts external `now` timestamp. */
export const getGate = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    now: v.number(),
  },
  returns: v.object({
    state: v.union(v.literal("ok"), v.literal("warn"), v.literal("stop")),
    peakPct: v.number(),
    stale: v.boolean(),
    fetchedAt: v.optional(v.number()),
  }),
  handler: async (ctx, { workspaceId, now }) => {
    const row = await ctx.db
      .query("ga4Quota")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .unique();

    if (row === null) {
      return { state: "ok" as const, peakPct: 0, stale: true };
    }

    const isHourlyStale = now - row.fetchedAt > QUOTA_TTL_MS;
    const isDailyStale = now - row.fetchedAt > QUOTA_DAILY_TTL_MS;

    if (isHourlyStale && isDailyStale) {
      return {
        state: "ok" as const,
        peakPct: 0,
        stale: true,
        fetchedAt: row.fetchedAt,
      };
    }

    const hourlyPeak = isHourlyStale ? 0 : quotaHourlyPeak(row);
    const dailyPeak = isDailyStale ? 0 : quotaDailyPeak(row);
    const peakPct = Math.max(hourlyPeak, dailyPeak);
    const state = determineGateState(peakPct);

    return {
      state,
      peakPct,
      stale: false,
      fetchedAt: row.fetchedAt,
    };
  },
});

/**
 * Helper to build patch object for ga4ReportMeta.
 * Rule: timeZone and currencyCode are STICKY (omitted if undefined so existing values stay).
 * Non-sticky fields (emptyReason, subjectToThresholding, dataLossFromOtherRow,
 * sampled, samplesReadCount, samplingSpaceSize) are written as they arrive.
 */
function buildReportMetaPatch(
  metadata: {
    timeZone?: string;
    currencyCode?: string;
    emptyReason?: string;
    subjectToThresholding?: boolean;
    dataLossFromOtherRow?: boolean;
  },
  sampledInfo: {
    sampled?: boolean;
    samplesReadCount?: number;
    samplingSpaceSize?: number;
  },
  fetchedAt: number,
) {
  const patch: Record<string, unknown> = {
    fetchedAt,
    emptyReason: metadata.emptyReason,
    subjectToThresholding: metadata.subjectToThresholding,
    dataLossFromOtherRow: metadata.dataLossFromOtherRow,
    sampled: sampledInfo.sampled,
    samplesReadCount: sampledInfo.samplesReadCount,
    samplingSpaceSize: sampledInfo.samplingSpaceSize,
  };

  if (metadata.timeZone !== undefined) {
    patch.timeZone = metadata.timeZone;
  }
  if (metadata.currencyCode !== undefined) {
    patch.currencyCode = metadata.currencyCode;
  }

  return patch;
}

/** Record report metadata in ga4ReportMeta table. */
export const recordReportMeta = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    reportKey: v.string(), // "daily" | "traffic"
    metadata: v.optional(
      v.object({
        timeZone: v.optional(v.string()),
        currencyCode: v.optional(v.string()),
        emptyReason: v.optional(v.string()),
        subjectToThresholding: v.optional(v.boolean()),
        dataLossFromOtherRow: v.optional(v.boolean()),
        samplingMetadatas: v.optional(
          v.array(
            v.object({
              samplesReadCount: v.optional(v.string()),
              samplingSpaceSize: v.optional(v.string()),
            }),
          ),
        ),
        schemaRestrictionResponse: v.optional(v.any()),
      }),
    ),
    fetchedAt: v.number(),
  },
  handler: async (ctx, { workspaceId, reportKey, metadata, fetchedAt }) => {
    if (!metadata) return;

    let sampled: boolean | undefined = undefined;
    let samplesReadCount: number | undefined = undefined;
    let samplingSpaceSize: number | undefined = undefined;

    if (metadata.samplingMetadatas && metadata.samplingMetadatas.length > 0) {
      for (const sm of metadata.samplingMetadatas) {
        const read =
          sm.samplesReadCount !== undefined ? Number(sm.samplesReadCount) : undefined;
        const space =
          sm.samplingSpaceSize !== undefined ? Number(sm.samplingSpaceSize) : undefined;
        if (read !== undefined && space !== undefined) {
          samplesReadCount = read;
          samplingSpaceSize = space;
          if (read < space) {
            sampled = true;
          }
        }
      }
      if (sampled === undefined && samplesReadCount !== undefined) {
        sampled = false;
      }
    }

    const existing = await ctx.db
      .query("ga4ReportMeta")
      .withIndex("by_workspace_report", (q) =>
        q.eq("workspaceId", workspaceId).eq("reportKey", reportKey),
      )
      .unique();

    if (existing !== null) {
      await ctx.db.patch(
        existing._id,
        buildReportMetaPatch(
          metadata,
          { sampled, samplesReadCount, samplingSpaceSize },
          fetchedAt,
        ),
      );
    } else {
      await ctx.db.insert("ga4ReportMeta", {
        workspaceId,
        reportKey,
        fetchedAt,
        timeZone: metadata.timeZone,
        currencyCode: metadata.currencyCode,
        emptyReason: metadata.emptyReason,
        subjectToThresholding: metadata.subjectToThresholding,
        dataLossFromOtherRow: metadata.dataLossFromOtherRow,
        sampled,
        samplesReadCount,
        samplingSpaceSize,
      });
    }
  },
});

/** Read report metadata for workspace and report key. */
export const getReportMeta = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    reportKey: v.string(),
  },
  handler: async (ctx, { workspaceId, reportKey }) => {
    return await ctx.db
      .query("ga4ReportMeta")
      .withIndex("by_workspace_report", (q) =>
        q.eq("workspaceId", workspaceId).eq("reportKey", reportKey),
      )
      .unique();
  },
});

/** Read cached catalog for workspace. */
export const getCatalog = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    return await ctx.db
      .query("ga4Catalog")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .unique();
  },
});

/** Record/update discovered catalog from getMetadata. */
export const recordCatalog = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    propertyId: v.string(),
    dimensions: v.array(
      v.object({
        apiName: v.string(),
        uiName: v.string(),
        description: v.string(),
        customDefinition: v.optional(v.boolean()),
        category: v.optional(v.string()),
      }),
    ),
    metrics: v.array(
      v.object({
        apiName: v.string(),
        uiName: v.string(),
        description: v.string(),
        type: v.string(),
        expression: v.optional(v.string()),
        customDefinition: v.optional(v.boolean()),
        category: v.optional(v.string()),
        blockedReasons: v.optional(v.array(v.string())),
      }),
    ),
    fetchedAt: v.number(),
  },
  handler: async (
    ctx,
    { workspaceId, propertyId, dimensions, metrics, fetchedAt },
  ) => {
    const existing = await ctx.db
      .query("ga4Catalog")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .unique();

    if (existing !== null) {
      await ctx.db.patch(existing._id, {
        propertyId,
        dimensions,
        metrics,
        fetchedAt,
        lastErrorAt: undefined,
        lastError: undefined,
      });
    } else {
      await ctx.db.insert("ga4Catalog", {
        workspaceId,
        propertyId,
        dimensions,
        metrics,
        fetchedAt,
      });
    }
  },
});

/** Record catalog fetch error in ga4Catalog (F4). */
export const recordCatalogError = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    propertyId: v.string(),
    error: v.string(),
    errorAt: v.number(),
  },
  handler: async (ctx, { workspaceId, propertyId, error, errorAt }) => {
    const existing = await ctx.db
      .query("ga4Catalog")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .unique();

    if (existing !== null) {
      await ctx.db.patch(existing._id, {
        lastErrorAt: errorAt,
        lastError: error,
      });
    } else {
      await ctx.db.insert("ga4Catalog", {
        workspaceId,
        propertyId,
        fetchedAt: 0,
        dimensions: [],
        metrics: [],
        lastErrorAt: errorAt,
        lastError: error,
      });
    }
  },
});

/** Read cached compatibility result for a comboKey. */
export const getCompat = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    comboKey: v.string(),
  },
  handler: async (ctx, { workspaceId, comboKey }) => {
    return await ctx.db
      .query("ga4Compat")
      .withIndex("by_workspace_combo", (q) =>
        q.eq("workspaceId", workspaceId).eq("comboKey", comboKey),
      )
      .unique();
  },
});

/** Record compatibility result in cache. */
export const recordCompat = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    comboKey: v.string(),
    compatible: v.boolean(),
    incompatible: v.array(v.string()),
    checkedAt: v.number(),
    schemaVersion: v.optional(v.number()),
  },
  handler: async (
    ctx,
    {
      workspaceId,
      comboKey,
      compatible,
      incompatible,
      checkedAt,
      schemaVersion,
    },
  ) => {
    const existing = await ctx.db
      .query("ga4Compat")
      .withIndex("by_workspace_combo", (q) =>
        q.eq("workspaceId", workspaceId).eq("comboKey", comboKey),
      )
      .unique();

    if (existing !== null) {
      await ctx.db.patch(existing._id, {
        compatible,
        incompatible,
        checkedAt,
        schemaVersion,
      });
    } else {
      await ctx.db.insert("ga4Compat", {
        workspaceId,
        comboKey,
        compatible,
        incompatible,
        checkedAt,
        schemaVersion,
      });
    }
  },
});

/**
 * Briše sve keširane zapise provere kompatibilnosti (`ga4Compat`) za zadati workspace.
 * Paginirano i idempotentno.
 *
 * Ručno pokretanje preko Convex CLI:
 * npx convex run ga4Store:clearGa4Compat '{"workspaceId": "<WORKSPACE_ID>"}'
 */
export const clearGa4Compat = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    cursor: v.optional(v.union(v.string(), v.null())),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    deleted: v.number(),
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, { workspaceId, cursor, limit = 200 }) => {
    const page = await ctx.db
      .query("ga4Compat")
      .withIndex("by_workspace_combo", (q) => q.eq("workspaceId", workspaceId))
      .paginate({ cursor: cursor ?? null, numItems: limit });

    let deleted = 0;
    for (const doc of page.page) {
      await ctx.db.delete(doc._id);
      deleted++;
    }

    return {
      deleted,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

/** Read backfill status for a report. */
export const getBackfill = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    reportKey: v.string(),
  },
  handler: async (ctx, { workspaceId, reportKey }) => {
    return await ctx.db
      .query("ga4Backfill")
      .withIndex("by_workspace_report", (q) =>
        q.eq("workspaceId", workspaceId).eq("reportKey", reportKey),
      )
      .unique();
  },
});

/** Update backfill status for a report. */
export const updateBackfill = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    reportKey: v.string(),
    oldestSyncedDate: v.string(),
    completedAt: v.optional(v.number()),
  },
  handler: async (
    ctx,
    { workspaceId, reportKey, oldestSyncedDate, completedAt },
  ) => {
    const existing = await ctx.db
      .query("ga4Backfill")
      .withIndex("by_workspace_report", (q) =>
        q.eq("workspaceId", workspaceId).eq("reportKey", reportKey),
      )
      .unique();

    if (existing !== null) {
      await ctx.db.patch(existing._id, {
        oldestSyncedDate,
        ...(completedAt !== undefined ? { completedAt } : {}),
      });
    } else {
      await ctx.db.insert("ga4Backfill", {
        workspaceId,
        reportKey,
        oldestSyncedDate,
        completedAt,
      });
    }
  },
});

/**
 * Migration mutation to backfill `reportKey` on `ga4MetricDaily` from `dimensionKeys`.
 * Paginated with cursor and idempotent.
 */
export const migrateReportKeys = internalMutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    updated: v.number(),
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, { cursor, limit = 200 }) => {
    const page = await ctx.db
      .query("ga4MetricDaily")
      .paginate({ cursor: cursor ?? null, numItems: limit });

    let updated = 0;
    for (const doc of page.page) {
      if (!doc.reportKey) {
        const derivedKey = deriveReportKey(doc.dimensionKeys);
        await ctx.db.patch(doc._id, {
          reportKey: derivedKey,
        });
        updated++;
      }
    }

    return {
      updated,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

/**
 * Migration mutation to backfill `keyEvents` from `conversions` and remove `conversions`.
 * Paginated with cursor and idempotent.
 */
export const migrateKeyEvents = internalMutation({
  args: {
    target: v.union(v.literal("daily"), v.literal("traffic")),
    cursor: v.optional(v.union(v.string(), v.null())),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    updated: v.number(),
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, { target, cursor, limit = 200 }) => {
    let updated = 0;
    if (target === "daily") {
      const page = await ctx.db
        .query("ga4Daily")
        .paginate({ cursor: cursor ?? null, numItems: limit });
      for (const doc of page.page) {
        if (doc.conversions !== undefined) {
          const keyEvents = getKeyEvents(doc);
          await ctx.db.replace(doc._id, {
            workspaceId: doc.workspaceId,
            date: doc.date,
            sessions: doc.sessions,
            activeUsers: doc.activeUsers,
            newUsers: doc.newUsers,
            keyEvents,
            engagementRate: doc.engagementRate,
            totalUsers: doc.totalUsers,
            engagedSessions: doc.engagedSessions,
            screenPageViews: doc.screenPageViews,
            userEngagementDuration: doc.userEngagementDuration,
            scrolledUsers: doc.scrolledUsers,
          });
          updated++;
        }
      }
      return {
        updated,
        isDone: page.isDone,
        continueCursor: page.continueCursor,
      };
    } else {
      const page = await ctx.db
        .query("ga4TrafficDaily")
        .paginate({ cursor: cursor ?? null, numItems: limit });
      for (const doc of page.page) {
        if (doc.conversions !== undefined) {
          const keyEvents = getKeyEvents(doc);
          await ctx.db.replace(doc._id, {
            workspaceId: doc.workspaceId,
            date: doc.date,
            sessionSource: doc.sessionSource,
            sessionMedium: doc.sessionMedium,
            sessionCampaign: doc.sessionCampaign,
            sessions: doc.sessions,
            keyEvents,
          });
          updated++;
        }
      }
      return {
        updated,
        isDone: page.isDone,
        continueCursor: page.continueCursor,
      };
    }
  },
});

/**
 * Migration mutation to clean up mixed/duplicate marker rows where state != "value" and dimKey == "".
 * Paginated with cursor and idempotent (F2).
 */
export const cleanupMixedMarkerRows = internalMutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    deleted: v.number(),
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, { cursor, limit = 200 }) => {
    const page = await ctx.db
      .query("ga4MetricDaily")
      .paginate({ cursor: cursor ?? null, numItems: limit });

    let deleted = 0;
    for (const doc of page.page) {
      if (doc.state !== "value" && doc.dimKey === "") {
        await ctx.db.delete(doc._id);
        deleted++;
      }
    }

    return {
      deleted,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

/**
 * Migration runner: executes all GA4 migrations in sequence to completion.
 * Calls migrateReportKeys -> migrateKeyEvents (daily) -> migrateKeyEvents (traffic) -> cleanupMixedMarkerRows.
 *
 * Komanda za rucno pokretanje:
 * npx convex run ga4Store:migrateGa4All
 */
export const migrateGa4All = internalAction({
  args: {},
  returns: v.object({
    reportKeysUpdated: v.number(),
    keyEventsDailyUpdated: v.number(),
    keyEventsTrafficUpdated: v.number(),
    mixedMarkersDeleted: v.number(),
  }),
  handler: async (
    ctx,
  ): Promise<{
    reportKeysUpdated: number;
    keyEventsDailyUpdated: number;
    keyEventsTrafficUpdated: number;
    mixedMarkersDeleted: number;
  }> => {
    let reportKeysUpdated = 0;
    let cursor: string | null = null;
    while (true) {
      const res: {
        updated: number;
        isDone: boolean;
        continueCursor: string | null;
      } = await ctx.runMutation(internal.ga4Store.migrateReportKeys, {
        cursor,
        limit: 200,
      });
      reportKeysUpdated += res.updated;
      if (res.isDone) break;
      cursor = res.continueCursor;
    }

    let keyEventsDailyUpdated = 0;
    cursor = null;
    while (true) {
      const res: {
        updated: number;
        isDone: boolean;
        continueCursor: string | null;
      } = await ctx.runMutation(internal.ga4Store.migrateKeyEvents, {
        target: "daily",
        cursor,
        limit: 200,
      });
      keyEventsDailyUpdated += res.updated;
      if (res.isDone) break;
      cursor = res.continueCursor;
    }

    let keyEventsTrafficUpdated = 0;
    cursor = null;
    while (true) {
      const res: {
        updated: number;
        isDone: boolean;
        continueCursor: string | null;
      } = await ctx.runMutation(internal.ga4Store.migrateKeyEvents, {
        target: "traffic",
        cursor,
        limit: 200,
      });
      keyEventsTrafficUpdated += res.updated;
      if (res.isDone) break;
      cursor = res.continueCursor;
    }

    let mixedMarkersDeleted = 0;
    cursor = null;
    while (true) {
      const res: {
        deleted: number;
        isDone: boolean;
        continueCursor: string | null;
      } = await ctx.runMutation(internal.ga4Store.cleanupMixedMarkerRows, {
        cursor,
        limit: 200,
      });
      mixedMarkersDeleted += res.deleted;
      if (res.isDone) break;
      cursor = res.continueCursor;
    }

    return {
      reportKeysUpdated,
      keyEventsDailyUpdated,
      keyEventsTrafficUpdated,
      mixedMarkersDeleted,
    };
  },
});

/**
 * Realtime snapshot store helpers (A5 §5.1)
 */
export const getRealtime = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    return await ctx.db
      .query("ga4Realtime")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .unique();
  },
});

export const recordRealtime = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    propertyId: v.string(),
    fetchedAt: v.number(),
    activeUsers: v.optional(v.number()),
    byMinute: v.array(
      v.object({ minutesAgo: v.number(), activeUsers: v.number() }),
    ),
    byScreen: v.array(v.object({ key: v.string(), value: v.number() })),
    byCountry: v.array(v.object({ key: v.string(), value: v.number() })),
    byDevice: v.array(v.object({ key: v.string(), value: v.number() })),
    byEvent: v.array(v.object({ key: v.string(), value: v.number() })),
    state: v.union(v.literal("value"), v.literal("unavailable")),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("ga4Realtime")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .unique();

    if (existing !== null) {
      await ctx.db.replace(existing._id, args);
    } else {
      await ctx.db.insert("ga4Realtime", args);
    }
  },
});

/**
 * Cohort retention store helpers (A5 §5.2)
 */
const cohortRowValidator = v.object({
  granularity: v.string(),
  cohortName: v.string(),
  cohortStartDate: v.string(),
  nth: v.number(),
  cohortTotalUsers: v.optional(v.number()),
  cohortActiveUsers: v.optional(v.number()),
  state: v.union(
    v.literal("value"),
    v.literal("thresholded"),
    v.literal("unavailable"),
  ),
});

export const upsertCohorts = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    rows: v.array(cohortRowValidator),
  },
  returns: v.number(),
  handler: async (ctx, { workspaceId, rows }) => {
    const syncedAt = Date.now();
    for (const row of rows) {
      const existing = await ctx.db
        .query("ga4Cohorts")
        .withIndex("by_workspace_cohort_nth", (q) =>
          q
            .eq("workspaceId", workspaceId)
            .eq("granularity", row.granularity)
            .eq("cohortName", row.cohortName)
            .eq("nth", row.nth),
        )
        .unique();

      if (existing !== null) {
        await ctx.db.patch(existing._id, {
          cohortStartDate: row.cohortStartDate,
          cohortTotalUsers: row.cohortTotalUsers,
          cohortActiveUsers: row.cohortActiveUsers,
          state: row.state,
          syncedAt,
        });
      } else {
        await ctx.db.insert("ga4Cohorts", {
          workspaceId,
          granularity: row.granularity,
          cohortName: row.cohortName,
          cohortStartDate: row.cohortStartDate,
          nth: row.nth,
          cohortTotalUsers: row.cohortTotalUsers,
          cohortActiveUsers: row.cohortActiveUsers,
          state: row.state,
          syncedAt,
        });
      }
    }
    return rows.length;
  },
});

export const getCohorts = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    granularity: v.string(),
  },
  handler: async (ctx, { workspaceId, granularity }) => {
    return await ctx.db
      .query("ga4Cohorts")
      .withIndex("by_workspace_granularity", (q) =>
        q.eq("workspaceId", workspaceId).eq("granularity", granularity),
      )
      .collect();
  },
});

/**
 * Record/update GA4 configuration in ga4Config table (A7).
 * Exactly one row per workspace.
 */
export const recordConfig = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    propertyId: v.string(),
    fetchedAt: v.number(),
    displayName: v.optional(v.string()),
    timeZone: v.optional(v.string()),
    currencyCode: v.optional(v.string()),
    industryCategory: v.optional(v.string()),
    serviceLevel: v.optional(v.string()),
    createTime: v.optional(v.string()),
    eventDataRetention: v.optional(v.string()),
    resetUserDataOnNewActivity: v.optional(v.boolean()),
    keyEvents: v.optional(
      v.array(
        v.object({
          eventName: v.string(),
          countingMethod: v.optional(v.string()),
          custom: v.optional(v.boolean()),
          createTime: v.optional(v.string()),
        }),
      ),
    ),
    customDimensions: v.optional(
      v.array(
        v.object({
          parameterName: v.string(),
          displayName: v.string(),
          description: v.optional(v.string()),
          scope: v.optional(v.string()),
        }),
      ),
    ),
    customMetrics: v.optional(
      v.array(
        v.object({
          parameterName: v.string(),
          displayName: v.string(),
          description: v.optional(v.string()),
          scope: v.optional(v.string()),
        }),
      ),
    ),
    dataStreams: v.optional(
      v.array(
        v.object({
          displayName: v.string(),
          type: v.optional(v.string()),
          measurementId: v.optional(v.string()),
          defaultUri: v.optional(v.string()),
        }),
      ),
    ),
    googleAdsLinks: v.optional(
      v.array(
        v.object({
          customerId: v.string(),
          adsPersonalizationEnabled: v.optional(v.boolean()),
          createTime: v.optional(v.string()),
        }),
      ),
    ),
    errors: v.optional(
      v.array(
        v.object({
          resource: v.string(),
          reason: v.string(),
        }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("ga4Config")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .unique();

    if (existing !== null) {
      await ctx.db.replace(existing._id, args);
    } else {
      await ctx.db.insert("ga4Config", args);
    }
  },
});

export const getConfig = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    return await ctx.db
      .query("ga4Config")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .unique();
  },
});

