/**
 * ============================================================================
 * META MARKETING GRAPH API MODULE
 * ============================================================================
 *
 * Single source of truth for all Meta Marketing API (v25.0) endpoint paths,
 * parameters, metric definitions, rate-limit headers parsing, and response helpers.
 *
 * Used by System User token connection (provider "meta_ads").
 *
 * Versioning:
 *   Default Graph API version is "v25.0", overridable via META_GRAPH_API_VERSION.
 * ============================================================================
 */

export const DEFAULT_GRAPH_VERSION = "v25.0";
export const META_GRAPH_BASE_URL = "https://graph.facebook.com";

export function getMetaGraphVersion(): string {
  const envVersion = process.env.META_GRAPH_API_VERSION?.trim();
  if (envVersion && /^v\d+\.\d+$/.test(envVersion)) {
    return envVersion;
  }
  return DEFAULT_GRAPH_VERSION;
}

// ── Fields Definitions ──────────────────────────────────────────────────────

export const AD_ACCOUNT_FIELDS = [
  "id",
  "account_id",
  "name",
  "currency",
  "account_status",
] as const;

export const CAMPAIGN_FIELDS = [
  "id",
  "name",
  "objective",
  "status",
  "effective_status",
  "daily_budget",
  "lifetime_budget",
  "updated_time",
  "created_time",
] as const;

export const ADSET_FIELDS = [
  "id",
  "campaign_id",
  "name",
  "status",
  "effective_status",
  "daily_budget",
  "lifetime_budget",
  "targeting",
  "updated_time",
] as const;

export const AD_FIELDS = [
  "id",
  "adset_id",
  "campaign_id",
  "name",
  "status",
  "effective_status",
  "creative{id,name,thumbnail_url,image_url}",
  "updated_time",
] as const;

export const INSIGHTS_FIELDS = [
  "account_id",
  "campaign_id",
  "adset_id",
  "ad_id",
  "ad_name",
  "date_start",
  "date_stop",
  "spend",
  "impressions",
  "reach",
  "frequency",
  "clicks",
  "ctr",
  "unique_ctr",
  "cpc",
  "cpm",
  "cpp",
  "actions",
  "action_values",
  "cost_per_action_type",
  "cost_per_unique_action_type",
  "video_3_sec_watched_actions",
  "video_thruplay_watched_actions",
  "video_p25_watched_actions",
  "video_p50_watched_actions",
  "video_p75_watched_actions",
  "video_p95_watched_actions",
  "video_p100_watched_actions",
  "outbound_clicks_ctr",
  "quality_ranking",
  "engagement_rate_ranking",
  "conversion_rate_ranking",
] as const;

// ── URL Builders ─────────────────────────────────────────────────────────────

/** Normalize ad account ID to ensure "act_" prefix when calling endpoints */
export function normalizeAdAccountId(id: string): string {
  const clean = id.trim();
  if (clean.startsWith("act_")) return clean;
  return `act_${clean}`;
}

/** Build URL to list accessible ad accounts for the token */
export function buildAdAccountsUrl(
  accessToken: string,
  version: string = getMetaGraphVersion(),
): string {
  const url = new URL(`${META_GRAPH_BASE_URL}/${version}/me/adaccounts`);
  url.searchParams.set("fields", AD_ACCOUNT_FIELDS.join(","));
  url.searchParams.set("limit", "100");
  url.searchParams.set("access_token", accessToken);
  return url.toString();
}

/** Build URL to fetch details of a specific ad account */
export function buildAdAccountUrl(
  accountId: string,
  accessToken: string,
  version: string = getMetaGraphVersion(),
): string {
  const actId = normalizeAdAccountId(accountId);
  const url = new URL(`${META_GRAPH_BASE_URL}/${version}/${actId}`);
  url.searchParams.set("fields", AD_ACCOUNT_FIELDS.join(","));
  url.searchParams.set("access_token", accessToken);
  return url.toString();
}

/** Build URL to fetch campaigns under an ad account */
export function buildCampaignsUrl(
  accountId: string,
  accessToken: string,
  limit: number = 500,
  version: string = getMetaGraphVersion(),
): string {
  const actId = normalizeAdAccountId(accountId);
  const url = new URL(`${META_GRAPH_BASE_URL}/${version}/${actId}/campaigns`);
  url.searchParams.set("fields", CAMPAIGN_FIELDS.join(","));
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("access_token", accessToken);
  return url.toString();
}

/** Build URL to fetch ad sets under an ad account */
export function buildAdSetsUrl(
  accountId: string,
  accessToken: string,
  limit: number = 500,
  version: string = getMetaGraphVersion(),
): string {
  const actId = normalizeAdAccountId(accountId);
  const url = new URL(`${META_GRAPH_BASE_URL}/${version}/${actId}/adsets`);
  url.searchParams.set("fields", ADSET_FIELDS.join(","));
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("access_token", accessToken);
  return url.toString();
}

/** Build URL to fetch ads under an ad account */
export function buildAdsUrl(
  accountId: string,
  accessToken: string,
  limit: number = 500,
  version: string = getMetaGraphVersion(),
): string {
  const actId = normalizeAdAccountId(accountId);
  const url = new URL(`${META_GRAPH_BASE_URL}/${version}/${actId}/ads`);
  url.searchParams.set("fields", AD_FIELDS.join(","));
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("access_token", accessToken);
  return url.toString();
}

/** Build URL to fetch ad creative details */
export function buildCreativeUrl(
  creativeId: string,
  accessToken: string,
  version: string = getMetaGraphVersion(),
): string {
  const url = new URL(`${META_GRAPH_BASE_URL}/${version}/${creativeId}`);
  url.searchParams.set(
    "fields",
    "id,name,thumbnail_url,image_url,object_story_spec",
  );
  url.searchParams.set("access_token", accessToken);
  return url.toString();
}

/** Build URL to generate iframe ad preview */
export function buildAdPreviewUrl(
  adId: string,
  accessToken: string,
  adFormat: string = "DESKTOP_FEED_STANDARD",
  version: string = getMetaGraphVersion(),
): string {
  const url = new URL(`${META_GRAPH_BASE_URL}/${version}/${adId}/previews`);
  url.searchParams.set("ad_format", adFormat);
  url.searchParams.set("access_token", accessToken);
  return url.toString();
}

export interface InsightsQueryParams {
  targetId: string; // accountId (act_...) or campaignId or adId
  level?: "account" | "campaign" | "adset" | "ad";
  datePreset?: string; // e.g. "today", "last_2d", "last_7d"
  timeRange?: { since: string; until: string }; // "YYYY-MM-DD"
  timeIncrement?: number | "all_days"; // 1 for daily
  breakdowns?: string[]; // e.g. ["age", "gender"] or ["publisher_platform", "platform_position"] or ["hourly_stats_aggregated_by_audience_time_zone"]
  filtering?: Array<{ field: string; operator: string; value: unknown }>;
  limit?: number;
  accessToken: string;
  version?: string;
}

/** Build URL to fetch ad insights */
export function buildInsightsUrl(params: InsightsQueryParams): string {
  const targetId = params.targetId.startsWith("act_") || /^\d+$/.test(params.targetId)
    ? params.targetId
    : normalizeAdAccountId(params.targetId);
  const version = params.version ?? getMetaGraphVersion();
  const url = new URL(`${META_GRAPH_BASE_URL}/${version}/${targetId}/insights`);

  url.searchParams.set("fields", INSIGHTS_FIELDS.join(","));
  if (params.level) url.searchParams.set("level", params.level);
  if (params.datePreset) url.searchParams.set("date_preset", params.datePreset);
  if (params.timeRange) {
    url.searchParams.set("time_range", JSON.stringify(params.timeRange));
  }
  if (params.timeIncrement !== undefined) {
    url.searchParams.set("time_increment", String(params.timeIncrement));
  }
  if (params.breakdowns && params.breakdowns.length > 0) {
    url.searchParams.set("breakdowns", params.breakdowns.join(","));
  }
  if (params.filtering && params.filtering.length > 0) {
    url.searchParams.set("filtering", JSON.stringify(params.filtering));
  }
  url.searchParams.set("limit", String(params.limit ?? 500));
  url.searchParams.set("access_token", params.accessToken);

  return url.toString();
}

// ── Rate Limit Inspection ───────────────────────────────────────────────────

export interface RateLimitStatus {
  callCount: number;
  totalCpuTime: number;
  totalTime: number;
  maxUsagePercent: number;
  shouldBackoff: boolean;
  estimatedTimeToRegainAccessSec: number;
}

/**
 * Parses Meta Graph API usage headers:
 * - X-Business-Use-Case-Usage
 * - X-App-Usage
 * - X-Ad-Account-Usage
 */
export function parseRateLimitHeaders(headers: Headers): RateLimitStatus {
  let callCount = 0;
  let totalCpuTime = 0;
  let totalTime = 0;
  let maxUsagePercent = 0;
  let estimatedTimeToRegainAccessSec = 0;

  // 1. X-Business-Use-Case-Usage header (JSON map of business objects)
  const businessUsage = headers.get("x-business-use-case-usage");
  if (businessUsage) {
    try {
      const parsed = JSON.parse(businessUsage) as Record<
        string,
        Array<{
          call_count?: number;
          total_cputime?: number;
          total_time?: number;
          estimated_time_to_regain_access?: number;
          type?: string;
        }>
      >;
      for (const entries of Object.values(parsed)) {
        for (const entry of entries) {
          if (typeof entry.call_count === "number") {
            callCount = Math.max(callCount, entry.call_count);
            maxUsagePercent = Math.max(maxUsagePercent, entry.call_count);
          }
          if (typeof entry.total_cputime === "number") {
            totalCpuTime = Math.max(totalCpuTime, entry.total_cputime);
            maxUsagePercent = Math.max(maxUsagePercent, entry.total_cputime);
          }
          if (typeof entry.total_time === "number") {
            totalTime = Math.max(totalTime, entry.total_time);
            maxUsagePercent = Math.max(maxUsagePercent, entry.total_time);
          }
          if (typeof entry.estimated_time_to_regain_access === "number") {
            estimatedTimeToRegainAccessSec = Math.max(
              estimatedTimeToRegainAccessSec,
              entry.estimated_time_to_regain_access,
            );
          }
        }
      }
    } catch {
      // Ignore header parsing failure
    }
  }

  // 2. X-App-Usage header: {"call_count":12,"total_cputime":10,"total_time":15}
  const appUsage = headers.get("x-app-usage");
  if (appUsage) {
    try {
      const parsed = JSON.parse(appUsage) as {
        call_count?: number;
        total_cputime?: number;
        total_time?: number;
      };
      if (typeof parsed.call_count === "number") {
        callCount = Math.max(callCount, parsed.call_count);
        maxUsagePercent = Math.max(maxUsagePercent, parsed.call_count);
      }
      if (typeof parsed.total_cputime === "number") {
        totalCpuTime = Math.max(totalCpuTime, parsed.total_cputime);
        maxUsagePercent = Math.max(maxUsagePercent, parsed.total_cputime);
      }
      if (typeof parsed.total_time === "number") {
        totalTime = Math.max(totalTime, parsed.total_time);
        maxUsagePercent = Math.max(maxUsagePercent, parsed.total_time);
      }
    } catch {
      // Ignore header parsing failure
    }
  }

  // 3. X-Ad-Account-Usage header: {"acc_id_util_pct": 25.5}
  const adAccountUsage = headers.get("x-ad-account-usage");
  if (adAccountUsage) {
    try {
      const parsed = JSON.parse(adAccountUsage) as { acc_id_util_pct?: number };
      if (typeof parsed.acc_id_util_pct === "number") {
        maxUsagePercent = Math.max(maxUsagePercent, parsed.acc_id_util_pct);
      }
    } catch {
      // Ignore header parsing failure
    }
  }

  const shouldBackoff =
    maxUsagePercent >= 80 || estimatedTimeToRegainAccessSec > 0;

  return {
    callCount,
    totalCpuTime,
    totalTime,
    maxUsagePercent,
    shouldBackoff,
    estimatedTimeToRegainAccessSec,
  };
}

// ── Breakdown Hasher ────────────────────────────────────────────────────────

export interface BreakdownDimensions {
  age?: string;
  gender?: string;
  placement?: string;
  platform?: string;
  device?: string;
}

/**
 * Compute deterministic hash/key for breakdown dimensions.
 * Returns "none" when no breakdown dimensions are provided.
 */
export function computeBreakdownHash(
  breakdown?: BreakdownDimensions,
): string {
  if (!breakdown) return "none";

  const parts: string[] = [];
  if (breakdown.age) parts.push(`age=${breakdown.age}`);
  if (breakdown.gender) parts.push(`gen=${breakdown.gender}`);
  if (breakdown.platform) parts.push(`plt=${breakdown.platform}`);
  if (breakdown.placement) parts.push(`plc=${breakdown.placement}`);
  if (breakdown.device) parts.push(`dev=${breakdown.device}`);

  if (parts.length === 0) return "none";
  return parts.sort().join("|");
}

// ── Types for Raw Graph API Responses ───────────────────────────────────────

export interface RawActionValue {
  action_type: string;
  value: string | number;
}

export interface RawAdInsightRow {
  account_id?: string;
  campaign_id?: string;
  adset_id?: string;
  ad_id?: string;
  ad_name?: string;
  date_start?: string;
  date_stop?: string;
  hourly_stats_aggregated_by_audience_time_zone?: string; // e.g. "00:00:00 - 00:59:59"
  age?: string;
  gender?: string;
  publisher_platform?: string;
  platform_position?: string;
  device_platform?: string;
  spend?: string | number;
  impressions?: string | number;
  reach?: string | number;
  frequency?: string | number;
  clicks?: string | number;
  ctr?: string | number;
  unique_ctr?: string | number;
  cpc?: string | number;
  cpm?: string | number;
  cpp?: string | number;
  actions?: RawActionValue[];
  action_values?: RawActionValue[];
  cost_per_action_type?: RawActionValue[];
  video_3_sec_watched_actions?: RawActionValue[];
  video_thruplay_watched_actions?: RawActionValue[];
  video_p25_watched_actions?: RawActionValue[];
  video_p50_watched_actions?: RawActionValue[];
  video_p75_watched_actions?: RawActionValue[];
  video_p95_watched_actions?: RawActionValue[];
  video_p100_watched_actions?: RawActionValue[];
  outbound_clicks_ctr?: RawActionValue[] | string | number;
  quality_ranking?: string;
  engagement_rate_ranking?: string;
  conversion_rate_ranking?: string;
}

export interface RawGraphApiResponse<T> {
  data?: T[];
  paging?: {
    cursors?: { before?: string; after?: string };
    next?: string;
  };
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

// ── Metric Extractors ───────────────────────────────────────────────────────

function toNum(val: unknown): number {
  if (typeof val === "number") return Number.isFinite(val) ? val : 0;
  if (typeof val === "string") {
    const parsed = parseFloat(val);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/** Extract action sum for prioritized conversion types */
export function extractConversionResults(actions?: RawActionValue[]): number {
  if (!Array.isArray(actions) || actions.length === 0) return 0;

  // Priority conversion action types
  const conversionKeys = [
    "purchase",
    "lead",
    "contact",
    "complete_registration",
    "submit_application",
    "offsite_conversion.fb_pixel_purchase",
    "offsite_conversion.fb_pixel_lead",
    "omni_purchase",
    "omni_complete_registration",
    "landing_page_view",
    "link_click",
  ];

  for (const key of conversionKeys) {
    const found = actions.find((a) => a.action_type === key);
    if (found) return toNum(found.value);
  }

  // Fallback: sum all offsite conversions if available
  let total = 0;
  for (const a of actions) {
    if (a.action_type?.startsWith("offsite_conversion")) {
      total += toNum(a.value);
    }
  }
  return total;
}

/** Extract total purchase / lead value from action_values */
export function extractConversionValue(actionValues?: RawActionValue[]): number {
  if (!Array.isArray(actionValues) || actionValues.length === 0) return 0;

  const valueKeys = [
    "purchase",
    "omni_purchase",
    "offsite_conversion.fb_pixel_purchase",
    "lead",
    "offsite_conversion.fb_pixel_lead",
  ];

  for (const key of valueKeys) {
    const found = actionValues.find((a) => a.action_type === key);
    if (found) return toNum(found.value);
  }

  let sum = 0;
  for (const v of actionValues) {
    sum += toNum(v.value);
  }
  return sum;
}

/** Extract video views action count from video actions array */
export function extractVideoActionCount(actions?: RawActionValue[]): number {
  if (!Array.isArray(actions) || actions.length === 0) return 0;
  const found = actions.find(
    (a) =>
      a.action_type === "video_view" ||
      a.action_type?.includes("video") ||
      true,
  );
  return found ? toNum(found.value) : toNum(actions[0]?.value);
}

/** Parse hour integer (0..23) from Meta hourly breakdown string */
export function parseHourlyString(raw?: string): number | undefined {
  if (!raw) return undefined;
  // Format is typically "00:00:00 - 00:59:59"
  const match = /^(\d{2}):/.exec(raw);
  if (match) {
    const h = parseInt(match[1], 10);
    if (h >= 0 && h <= 23) return h;
  }
  return undefined;
}

/**
 * Extract human-readable error from Meta Graph API response without leaking credentials.
 */
export function extractMetaAdsError(body: unknown): string {
  let message = "";
  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body) as {
        error?: { message?: string; error_user_msg?: string };
      };
      message =
        parsed.error?.error_user_msg ||
        parsed.error?.message ||
        body.slice(0, 300);
    } catch {
      message = body.slice(0, 300);
    }
  } else if (typeof body === "object" && body !== null) {
    const errObj = body as {
      error?: { message?: string; error_user_msg?: string };
      message?: string;
    };
    message =
      errObj.error?.error_user_msg ||
      errObj.error?.message ||
      errObj.message ||
      "Meta Marketing API request failed.";
  }

  if (!message) message = "Meta Marketing API request failed.";

  return message
    .replace(
      /(access_token|client_secret|appsecret_proof|secret|password)(\s*[=:]\s*)[^\s&]+/gi,
      "$1$2<redacted>",
    )
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer <redacted>");
}

/**
 * Sanitize raw API responses (such as JSON from Graph API or exceptions)
 * before persisting to adActions.apiResponse or returning to the client.
 */
export function sanitizeApiResponse(val: unknown): string {
  if (val === undefined || val === null) return "";
  const str = typeof val === "string" ? val : JSON.stringify(val);
  return str
    .replace(
      /(access_token|refresh_token|client_secret|appsecret_proof|secret|password)(\s*[=:]\s*)[^\s&",]+/gi,
      "$1$2<redacted>",
    )
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer <redacted>");
}

