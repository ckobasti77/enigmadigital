/**
 * ============================================================================
 * INSTAGRAM METRICS CATALOG, 3-STATE MODEL & PARSER (G1)
 * ============================================================================
 *
 * Implements the 3-state metric model:
 *   - "value": A real number arrived from Meta (including true 0).
 *   - "suppressed": Below Meta's privacy/reporting threshold or empty dataset.
 *   - "unavailable": Metric unsupported for context or API call failed.
 *
 * Covers all 15 Instagram account-level metrics according to official Meta Graph API:
 *   - 12 'day' period metrics (active in G1)
 *   - 2 'lifetime' demographics metrics (placeholders for G2)
 *   - 1 deprecated dead metric ('impressions', forbidden)
 * ============================================================================
 */

import {
  INSTAGRAM_GRAPH_BASE_URL,
  getMetaGraphVersion,
} from "./instagramApi";

export type MetricState = "value" | "suppressed" | "unavailable";

export type MetricPeriod = "day" | "lifetime";

export type MetricType = "total_value" | "time_series";

export type MetricBreakdown =
  | "media_product_type"
  | "follow_type"
  | "contact_button_type"
  | "follower_type"
  | "age"
  | "city"
  | "country"
  | "gender";

export interface IgMetricDefinition {
  readonly name: string;
  readonly period: MetricPeriod;
  readonly supportedMetricTypes: readonly MetricType[];
  readonly supportedBreakdowns: readonly MetricBreakdown[];
  readonly deprecated?: boolean;
  readonly description: string;
}

/**
 * The single source of truth for all 15 Instagram account metrics.
 */
export const IG_METRIC_CATALOG: Record<string, IgMetricDefinition> = {
  accounts_engaged: {
    name: "accounts_engaged",
    period: "day",
    supportedMetricTypes: ["total_value"],
    supportedBreakdowns: [],
    description: "Broj jedinstvenih naloga koji su imali interakciju sa sadržajem.",
  },
  comments: {
    name: "comments",
    period: "day",
    supportedMetricTypes: ["total_value"],
    supportedBreakdowns: ["media_product_type"],
    description: "Ukupan broj komentara na objavama.",
  },
  likes: {
    name: "likes",
    period: "day",
    supportedMetricTypes: ["total_value"],
    supportedBreakdowns: ["media_product_type"],
    description: "Ukupan broj lajkova na objavama.",
  },
  saves: {
    name: "saves",
    period: "day",
    supportedMetricTypes: ["total_value"],
    supportedBreakdowns: ["media_product_type"],
    description: "Ukupan broj čuvanja objava.",
  },
  shares: {
    name: "shares",
    period: "day",
    supportedMetricTypes: ["total_value"],
    supportedBreakdowns: ["media_product_type"],
    description: "Ukupan broj deljenja objava.",
  },
  replies: {
    name: "replies",
    period: "day",
    supportedMetricTypes: ["total_value"],
    supportedBreakdowns: [],
    description: "Ukupan broj odgovora na priče (stories).",
  },
  reposts: {
    name: "reposts",
    period: "day",
    supportedMetricTypes: ["total_value"],
    supportedBreakdowns: [],
    description: "Ukupan broj ponovnih objava (reposts).",
  },
  total_interactions: {
    name: "total_interactions",
    period: "day",
    supportedMetricTypes: ["total_value"],
    supportedBreakdowns: ["media_product_type"],
    description: "Ukupan zbir svih interakcija (lajkovi, komentari, čuvanja, deljenja, odgovori).",
  },
  views: {
    name: "views",
    period: "day",
    supportedMetricTypes: ["total_value"],
    supportedBreakdowns: ["follower_type", "media_product_type"],
    description: "Ukupan broj pregleda sadržaja.",
  },
  reach: {
    name: "reach",
    period: "day",
    supportedMetricTypes: ["total_value", "time_series"],
    supportedBreakdowns: ["media_product_type", "follow_type"],
    description: "Broj jedinstvenih naloga koji su videli bilo koji sadržaj.",
  },
  follows_and_unfollows: {
    name: "follows_and_unfollows",
    period: "day",
    supportedMetricTypes: ["total_value"],
    supportedBreakdowns: ["follow_type"],
    description: "Broj novih praćenja i otpraćivanja.",
  },
  profile_links_taps: {
    name: "profile_links_taps",
    period: "day",
    supportedMetricTypes: ["total_value"],
    supportedBreakdowns: ["contact_button_type"],
    description: "Broj dodira linkova i dugmadi na profilu.",
  },
  profile_views: {
    name: "profile_views",
    period: "day",
    supportedMetricTypes: ["total_value"],
    supportedBreakdowns: [],
    description: "Broj pregleda profila.",
  },
  // Demographics (G2 placeholders - lifetime period)
  follower_demographics: {
    name: "follower_demographics",
    period: "lifetime",
    supportedMetricTypes: ["total_value"],
    supportedBreakdowns: ["age", "city", "country", "gender"],
    description: "Demografska struktura pratilaca (G2).",
  },
  engaged_audience_demographics: {
    name: "engaged_audience_demographics",
    period: "lifetime",
    supportedMetricTypes: ["total_value"],
    supportedBreakdowns: ["age", "city", "country", "gender"],
    description: "Demografska struktura angažovane publike (G2).",
  },
  // Dead metric (forbidden)
  impressions: {
    name: "impressions",
    period: "day",
    supportedMetricTypes: [],
    supportedBreakdowns: [],
    deprecated: true,
    description: "Zastarela metrika — Meta ju je ugasila i ne sme se pozivati.",
  },
} as const;

/** Known breakdown dimension values published by Meta. */
export const MEDIA_PRODUCT_TYPES = ["AD", "FEED", "REELS", "STORY"] as const;
export const FOLLOW_TYPES = ["FOLLOWER", "NON_FOLLOWER", "UNKNOWN"] as const;
export const CONTACT_BUTTON_TYPES = [
  "BOOK_NOW",
  "CALL",
  "DIRECTION",
  "EMAIL",
  "INSTANT_EXPERIENCE",
  "TEXT",
  "UNDEFINED",
] as const;
// follower_type dimension values are unpublished; dynamically read from API responses.

export interface MetricQueryGroup {
  readonly breakdown?: MetricBreakdown;
  readonly metrics: readonly string[];
  readonly period: MetricPeriod;
  readonly metricType: MetricType;
}

/**
 * Optimal batching of daily metrics into exactly 5 Graph API calls per time slice.
 * Every metric is only queried with breakdowns it officially supports.
 */
export const DAILY_METRIC_GROUPS: readonly MetricQueryGroup[] = [
  // 1. Media product type breakdown (7 metrics in 1 call)
  {
    breakdown: "media_product_type",
    metrics: [
      "comments",
      "likes",
      "saves",
      "shares",
      "total_interactions",
      "views",
      "reach",
    ],
    period: "day",
    metricType: "total_value",
  },
  // 2. Follow type breakdown (2 metrics in 1 call)
  {
    breakdown: "follow_type",
    metrics: ["reach", "follows_and_unfollows"],
    period: "day",
    metricType: "total_value",
  },
  // 3. Follower type breakdown (1 metric in 1 call)
  {
    breakdown: "follower_type",
    metrics: ["views"],
    period: "day",
    metricType: "total_value",
  },
  // 4. Contact button type breakdown (1 metric in 1 call)
  {
    breakdown: "contact_button_type",
    metrics: ["profile_links_taps"],
    period: "day",
    metricType: "total_value",
  },
  // 5. No breakdown metrics (4 metrics in 1 call)
  {
    breakdown: undefined,
    metrics: ["accounts_engaged", "replies", "reposts", "profile_views"],
    period: "day",
    metricType: "total_value",
  },
] as const;

// ── URL Builders ─────────────────────────────────────────────────────────────

export interface BuildIgMetricInsightsParams {
  accessToken: string;
  metrics: readonly string[];
  period?: MetricPeriod;
  metricType?: MetricType;
  breakdown?: MetricBreakdown;
  since?: number; // epoch seconds
  until?: number; // epoch seconds
  version?: string;
  target?: string; // default "me"
}

/**
 * Build endpoint URL for fetching account metrics from /{target}/insights.
 */
export function buildIgMetricInsightsUrl({
  accessToken,
  metrics,
  period = "day",
  metricType = "total_value",
  breakdown,
  since,
  until,
  version = getMetaGraphVersion(),
  target = "me",
}: BuildIgMetricInsightsParams): string {
  const url = new URL(`${INSTAGRAM_GRAPH_BASE_URL}/${version}/${target}/insights`);
  url.searchParams.set("metric", metrics.join(","));
  url.searchParams.set("period", period);
  url.searchParams.set("metric_type", metricType);
  if (breakdown) {
    url.searchParams.set("breakdown", breakdown);
  }
  if (since !== undefined) {
    url.searchParams.set("since", String(since));
  }
  if (until !== undefined) {
    url.searchParams.set("until", String(until));
  }
  url.searchParams.set("access_token", accessToken);
  return url.toString();
}

// ── Raw API Response Types ───────────────────────────────────────────────────

export interface RawInsightBreakdownResult {
  dimension_values?: string[];
  value?: number;
}

export interface RawInsightBreakdown {
  dimension_keys?: string[];
  results?: RawInsightBreakdownResult[];
}

export interface RawInsightTotalValue {
  value?: number;
  breakdowns?: RawInsightBreakdown[];
}

export interface RawInsightTimeSeriesValue {
  value?: number;
  end_time?: string;
}

export interface RawInsightMetricItem {
  name: string;
  period?: string;
  title?: string;
  description?: string;
  id?: string;
  total_value?: RawInsightTotalValue;
  values?: RawInsightTimeSeriesValue[];
}

export interface RawIgInsightsResponse {
  data?: RawInsightMetricItem[];
  error?: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
  };
}

export interface ParsedMetricRow {
  date: string; // "YYYY-MM-DD", UTC
  metric: string;
  dimensionKeys: string[];
  dimensionValues: string[];
  value?: number;
  state: MetricState;
  reason?: string;
}

// ── Response Parser ──────────────────────────────────────────────────────────

export interface ParseIgInsightsParams {
  response?: RawIgInsightsResponse | null;
  requestedMetrics: readonly string[];
  date: string; // "YYYY-MM-DD"
  isError?: boolean;
  errorMessage?: string;
}

/**
 * Parse Graph API insights response into database-ready rows adhering to the 3-state model.
 *
 * Rules:
 *   - Value present (including 0): state = "value", value = number.
 *   - Empty response, missing metric or empty results array: state = "suppressed", reason = explanation.
 *   - API rejected, HTTP error or graph error: state = "unavailable", reason = error.
 */
export function parseIgInsightsResponse(
  params: ParseIgInsightsParams,
): ParsedMetricRow[] {
  const { response, requestedMetrics, date, isError = false, errorMessage } = params;

  if (isError || response?.error) {
    const reason =
      errorMessage ||
      response?.error?.message ||
      "Meta API je odbila zahtev za ovu metriku.";
    return requestedMetrics.map((metric) => ({
      date,
      metric,
      dimensionKeys: [],
      dimensionValues: [],
      value: undefined,
      state: "unavailable",
      reason,
    }));
  }

  const items = response?.data ?? [];
  const byName = new Map<string, RawInsightMetricItem>();
  for (const item of items) {
    if (item?.name) byName.set(item.name, item);
  }

  const out: ParsedMetricRow[] = [];

  for (const metric of requestedMetrics) {
    const item = byName.get(metric);

    if (!item) {
      if (metric === "profile_views") {
        out.push({
          date,
          metric,
          dimensionKeys: [],
          dimensionValues: [],
          value: undefined,
          state: "unavailable",
          reason: "Metrika nije dokumentovana i može biti ukinuta.",
        });
        continue;
      }
      // Metric not returned in response dataset -> suppressed
      out.push({
        date,
        metric,
        dimensionKeys: [],
        dimensionValues: [],
        value: undefined,
        state: "suppressed",
        reason: "Nedovoljno podataka (Meta prag privatnosti ili prazan skup).",
      });
      continue;
    }

    // 1. Time Series format (e.g. reach time_series)
    if (Array.isArray(item.values)) {
      if (item.values.length === 0) {
        out.push({
          date,
          metric,
          dimensionKeys: [],
          dimensionValues: [],
          value: undefined,
          state: "suppressed",
          reason: "Prazna vremenska serija.",
        });
      } else {
        for (const entry of item.values) {
          const rowDate = entry.end_time ? entry.end_time.slice(0, 10) : date;
          if (typeof entry.value === "number" && Number.isFinite(entry.value)) {
            out.push({
              date: rowDate,
              metric,
              dimensionKeys: [],
              dimensionValues: [],
              value: entry.value,
              state: "value",
            });
          } else {
            out.push({
              date: rowDate,
              metric,
              dimensionKeys: [],
              dimensionValues: [],
              value: undefined,
              state: "suppressed",
              reason: "Nedovoljno podataka za dati datum.",
            });
          }
        }
      }
      continue;
    }

    // 2. Total Value format (with or without breakdowns)
    const totalVal = item.total_value;
    if (!totalVal) {
      out.push({
        date,
        metric,
        dimensionKeys: [],
        dimensionValues: [],
        value: undefined,
        state: "suppressed",
        reason: "Nedovoljno podataka (Meta nije vratila total_value).",
      });
      continue;
    }

    // A) Overall total value without breakdown:
    if (typeof totalVal.value === "number" && Number.isFinite(totalVal.value)) {
      out.push({
        date,
        metric,
        dimensionKeys: [],
        dimensionValues: [],
        value: totalVal.value,
        state: "value",
      });
    } else if (!totalVal.breakdowns || totalVal.breakdowns.length === 0) {
      out.push({
        date,
        metric,
        dimensionKeys: [],
        dimensionValues: [],
        value: undefined,
        state: "suppressed",
        reason: "Nedovoljno podataka (vrednost ispod praga).",
      });
    }

    // B) Breakdowns:
    if (Array.isArray(totalVal.breakdowns) && totalVal.breakdowns.length > 0) {
      for (const breakdown of totalVal.breakdowns) {
        const dimKeys = breakdown.dimension_keys ?? [];
        const results = breakdown.results ?? [];

        if (results.length === 0) {
          out.push({
            date,
            metric,
            dimensionKeys: dimKeys,
            dimensionValues: [],
            value: undefined,
            state: "suppressed",
            reason: "Nedovoljno podataka za izabrano razdvajanje.",
          });
        } else {
          for (const res of results) {
            const dimVals = res.dimension_values ?? [];
            if (typeof res.value === "number" && Number.isFinite(res.value)) {
              out.push({
                date,
                metric,
                dimensionKeys: dimKeys,
                dimensionValues: dimVals,
                value: res.value,
                state: "value",
              });
            } else {
              out.push({
                date,
                metric,
                dimensionKeys: dimKeys,
                dimensionValues: dimVals,
                value: undefined,
                state: "suppressed",
                reason: "Nedovoljno podataka za datu dimenziju.",
              });
            }
          }
        }
      }
    }
  }

  return out;
}

// ── Date Range Utilities ─────────────────────────────────────────────────────

/**
 * Returns UTC epoch seconds range for a given date "YYYY-MM-DD" (00:00:00 to 23:59:59).
 */
export function getSinceUntilForUtcDate(dateStr: string): {
  since: number;
  until: number;
} {
  const since = Math.floor(Date.parse(`${dateStr}T00:00:00.000Z`) / 1000);
  const until = Math.floor(Date.parse(`${dateStr}T23:59:59.000Z`) / 1000);
  return { since, until };
}

/**
 * Returns an array of YYYY-MM-DD strings for the past `days` days ending at `now` (UTC).
 */
export function getRecentUtcDates(days: number, nowMs: number = Date.now()): string[] {
  const dates: string[] = [];
  for (let i = 0; i < days; i++) {
    const ms = nowMs - i * 24 * 60 * 60 * 1000;
    dates.push(new Date(ms).toISOString().slice(0, 10));
  }
  return dates; // newest first
}

/**
 * Splits 90 days into 3 chunks of 30 days (newest to oldest) for backfill.
 */
export function getBackfillDateChunks(
  totalDays: number = 90,
  chunkSize: number = 30,
  nowMs: number = Date.now(),
): string[][] {
  const allDates = getRecentUtcDates(totalDays, nowMs);
  const chunks: string[][] = [];
  for (let i = 0; i < allDates.length; i += chunkSize) {
    chunks.push(allDates.slice(i, i + chunkSize));
  }
  return chunks;
}
