/**
 * ============================================================================
 * INSTAGRAM AUDIENCE DEMOGRAPHICS (G2)
 * ============================================================================
 *
 * Implements the 3-state model for audience demographics:
 *   - "value": Real number breakdown from Meta.
 *   - "suppressed": Below Meta threshold (<100 followers for follower_demographics,
 *     <100 engagements in timeframe for engaged_audience_demographics).
 *   - "unavailable": API error or network failure.
 *
 * Constraints & Rules:
 *   - Endpoint: GET /{ig-user-id}/insights (graph.instagram.com)
 *   - Exactly two metrics: follower_demographics, engaged_audience_demographics
 *   - Required params: period=lifetime, metric_type=total_value, timeframe, breakdown
 *   - 6 timeframes: last_14_days, last_30_days, last_90_days, prev_month, this_month, this_week
 *   - 3 breakdown sets: ["age","gender"], ["country"], ["city"]
 * ============================================================================
 */

import {
  INSTAGRAM_GRAPH_BASE_URL,
  getMetaGraphVersion,
} from "./instagramApi";
import type { MetricState } from "./igMetrics";

export const DEMOGRAPHIC_TIMEFRAMES = [
  "last_14_days",
  "last_30_days",
  "last_90_days",
  "prev_month",
  "this_month",
  "this_week",
] as const;

export type DemographicTimeframe = (typeof DEMOGRAPHIC_TIMEFRAMES)[number];

export const DEMOGRAPHIC_METRICS = ["follower", "engaged"] as const;
export type DemographicMetric = (typeof DEMOGRAPHIC_METRICS)[number];

export const DEMOGRAPHIC_BREAKDOWNS = [
  "age,gender",
  "country",
  "city",
] as const;
export type DemographicBreakdown = (typeof DEMOGRAPHIC_BREAKDOWNS)[number];

export const DEMOGRAPHIC_TIMEFRAME_LABELS: Record<DemographicTimeframe, string> = {
  last_14_days: "Poslednjih 14 dana",
  last_30_days: "Poslednjih 30 dana",
  last_90_days: "Poslednjih 90 dana",
  prev_month: "Prethodni mesec",
  this_month: "Ovaj mesec",
  this_week: "Ova nedelja",
};

/**
 * Maps our short metric name to Meta Graph API metric parameter.
 */
export function toMetaDemographicMetric(
  metric: DemographicMetric,
): "follower_demographics" | "engaged_audience_demographics" {
  return metric === "follower"
    ? "follower_demographics"
    : "engaged_audience_demographics";
}

/**
 * Build endpoint URL for fetching audience demographics from /{target}/insights.
 */
export function buildIgDemographicsUrl({
  accessToken,
  metric,
  timeframe,
  breakdown,
  target = "me",
  version = getMetaGraphVersion(),
}: {
  accessToken: string;
  metric: DemographicMetric;
  timeframe: DemographicTimeframe;
  breakdown: DemographicBreakdown;
  target?: string;
  version?: string;
}): string {
  const metaMetric = toMetaDemographicMetric(metric);
  const url = new URL(`${INSTAGRAM_GRAPH_BASE_URL}/${version}/${target}/insights`);
  url.searchParams.set("metric", metaMetric);
  url.searchParams.set("period", "lifetime");
  url.searchParams.set("metric_type", "total_value");
  url.searchParams.set("timeframe", timeframe);
  url.searchParams.set("breakdown", breakdown);
  url.searchParams.set("access_token", accessToken);
  return url.toString();
}

export interface ParsedDemographicRow {
  metric: DemographicMetric;
  timeframe: DemographicTimeframe;
  dimensionKeys: string[];
  dimensionValues: string[];
  value?: number;
  state: MetricState;
  reason?: string;
}

export interface RawDemographicsResult {
  dimension_values?: string[];
  value?: number;
}

export interface RawDemographicsBreakdown {
  dimension_keys?: string[];
  results?: RawDemographicsResult[];
}

export interface RawDemographicsItem {
  name: string;
  period?: string;
  title?: string;
  description?: string;
  total_value?: {
    value?: number;
    breakdowns?: RawDemographicsBreakdown[];
  };
}

export interface RawDemographicsResponse {
  data?: RawDemographicsItem[];
  error?: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
  };
}

/**
 * Parses raw Meta Graph API demographics response into database-ready rows adhering to 3-state model.
 */
export function parseIgDemographicsResponse({
  metric,
  timeframe,
  breakdown,
  response,
  isError = false,
  errorMessage,
}: {
  metric: DemographicMetric;
  timeframe: DemographicTimeframe;
  breakdown: DemographicBreakdown;
  response?: RawDemographicsResponse | null;
  isError?: boolean;
  errorMessage?: string;
}): ParsedDemographicRow[] {
  const dimensionKeys = breakdown.split(",");

  if (isError || response?.error) {
    const reason =
      errorMessage ||
      response?.error?.message ||
      "Meta API je odbila zahtev za demografske podatke.";
    return [
      {
        metric,
        timeframe,
        dimensionKeys,
        dimensionValues: [],
        value: undefined,
        state: "unavailable",
        reason,
      },
    ];
  }

  const items = response?.data ?? [];
  const metaMetric = toMetaDemographicMetric(metric);
  const item = items.find((it) => it.name === metaMetric) ?? items[0];

  const suppressedReason =
    metric === "follower"
      ? "Instagram ne isporučuje demografske podatke ispod 100 pratilaca."
      : "Instagram ne isporučuje demografske podatke ispod 100 angažovanja u izabranom periodu.";

  if (!item || !item.total_value?.breakdowns || item.total_value.breakdowns.length === 0) {
    return [
      {
        metric,
        timeframe,
        dimensionKeys,
        dimensionValues: [],
        value: undefined,
        state: "suppressed",
        reason: suppressedReason,
      },
    ];
  }

  const breakdownObj = item.total_value.breakdowns[0];
  const keys = breakdownObj.dimension_keys ?? dimensionKeys;
  const results = breakdownObj.results ?? [];

  if (results.length === 0) {
    return [
      {
        metric,
        timeframe,
        dimensionKeys: keys,
        dimensionValues: [],
        value: undefined,
        state: "suppressed",
        reason: suppressedReason,
      },
    ];
  }

  const rows: ParsedDemographicRow[] = [];
  for (const res of results) {
    const dimVals = res.dimension_values ?? [];
    if (typeof res.value === "number" && Number.isFinite(res.value)) {
      rows.push({
        metric,
        timeframe,
        dimensionKeys: keys,
        dimensionValues: dimVals,
        value: res.value,
        state: "value",
      });
    }
  }

  if (rows.length === 0) {
    return [
      {
        metric,
        timeframe,
        dimensionKeys: keys,
        dimensionValues: [],
        value: undefined,
        state: "suppressed",
        reason: suppressedReason,
      },
    ];
  }

  return rows;
}
