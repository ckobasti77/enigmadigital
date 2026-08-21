/**
 * ============================================================================
 * INSTAGRAM MEDIA METRICS & 3-STATE MODEL (G3)
 * ============================================================================
 *
 * Implements the 3-state metric model on post/media level:
 *   - "value": A real number returned by Meta (including true 0).
 *   - "suppressed": Below Meta threshold (e.g. Story < 5 viewers code 10) or empty dataset.
 *   - "unavailable": Metric unsupported for context or API call rejected.
 *
 * Metric Matrix:
 *   - FEED (IMAGE / CAROUSEL): views, reach, likes, comments, saved, shares,
 *     total_interactions, reposts, profile_visits, profile_activity (action_type),
 *     follows, facebook_views
 *   - REELS: views, reach, likes, comments, saved, shares, total_interactions,
 *     reposts, ig_reels_avg_watch_time, ig_reels_video_view_total_time,
 *     reels_skip_rate, crossposted_views, facebook_views
 *     (NOTE: profile_visits, profile_activity and follows DO NOT exist for Reels!)
 *   - STORY: views, reach, shares, total_interactions, reposts, profile_visits,
 *     profile_activity (action_type), follows, navigation (story_navigation_action_type),
 *     replies, facebook_views
 *     (NOTE: likes, comments and saved DO NOT exist for Story!)
 *
 * Dead metrics (never query): impressions, plays, clips_replays_count, ig_reels_aggregated_all_plays_count
 * ============================================================================
 */

import {
  INSTAGRAM_GRAPH_BASE_URL,
  getMetaGraphVersion,
} from "./instagramApi";
import type { MetricState } from "./igMetrics";

export type IgMediaProductGroup = "FEED" | "REELS" | "STORY";

export interface IgMediaMetricDef {
  readonly name: string;
  readonly label: string;
  readonly description: string;
  readonly isEstimate?: boolean;
  readonly isOrganicOnly?: boolean;
  readonly unit?: "number" | "ms" | "percent";
}

export const IG_MEDIA_METRIC_CATALOG: Record<string, IgMediaMetricDef> = {
  views: {
    name: "views",
    label: "Pregledi",
    description: "Ukupan broj reprodukcija ili pregleda ovog sadržaja.",
    unit: "number",
  },
  reach: {
    name: "reach",
    label: "Doseg",
    description: "Broj jedinstvenih naloga koji su videli ovu objavu (procena).",
    isEstimate: true,
    isOrganicOnly: true,
    unit: "number",
  },
  likes: {
    name: "likes",
    label: "Lajkovi",
    description: "Ukupan broj lajkova na ovoj objavi.",
    unit: "number",
  },
  comments: {
    name: "comments",
    label: "Komentari",
    description: "Ukupan broj komentara na ovoj objavi.",
    unit: "number",
  },
  saved: {
    name: "saved",
    label: "Sačuvano",
    description: "Broj korisnika koji su sačuvali ovu objavu.",
    unit: "number",
  },
  shares: {
    name: "shares",
    label: "Deljenja",
    description: "Broj deljenja ove objave.",
    unit: "number",
  },
  total_interactions: {
    name: "total_interactions",
    label: "Ukupno interakcija",
    description: "Zbir svih interakcija (lajkovi, komentari, čuvanja, deljenja, odgovori).",
    unit: "number",
  },
  reposts: {
    name: "reposts",
    label: "Ponovne objave",
    description: "Broj ponovnih objava (reposts).",
    unit: "number",
  },
  profile_visits: {
    name: "profile_visits",
    label: "Posete profilu",
    description: "Broj poseta profilu ostvarenih sa ove objave.",
    unit: "number",
  },
  profile_activity: {
    name: "profile_activity",
    label: "Radnje na profilu",
    description: "Radnje preduzete na profilu nakon gledanja objave, po tipu akcije.",
    unit: "number",
  },
  follows: {
    name: "follows",
    label: "Novi pratioci",
    description: "Broj naloga koji su zapratili profil sa ove objave.",
    unit: "number",
  },
  navigation: {
    name: "navigation",
    label: "Navigacija kroz priču",
    description: "Radnje navigacije preduzete tokom gledanja priče.",
    unit: "number",
  },
  replies: {
    name: "replies",
    label: "Odgovori na priču",
    description: "Broj poruka/odgovora poslatih na ovu priču.",
    unit: "number",
  },
  ig_reels_avg_watch_time: {
    name: "ig_reels_avg_watch_time",
    label: "Prosečno vreme gledanja",
    description: "Prosečno trajanje gledanja ovog Reels videa po sesiji.",
    unit: "ms",
  },
  ig_reels_video_view_total_time: {
    name: "ig_reels_video_view_total_time",
    label: "Ukupno vreme gledanja",
    description: "Ukupno akumulirano vreme gledanja ovog Reels videa.",
    unit: "ms",
  },
  reels_skip_rate: {
    name: "reels_skip_rate",
    label: "Stopa preskakanja",
    description: "Procenat gledalaca koji su preskočili Reels video pre kraja (procena).",
    isEstimate: true,
    unit: "percent",
  },
  crossposted_views: {
    name: "crossposted_views",
    label: "Crosspost pregledi",
    description: "Broj pregleda sa deljenja na povezanim profilima/platformama.",
    unit: "number",
  },
  facebook_views: {
    name: "facebook_views",
    label: "Facebook pregledi",
    description: "Broj pregleda ostvarenih kada je sadržaj prikazan na Facebook platformi.",
    unit: "number",
  },
} as const;

/**
 * Base metrics without breakdown queried in a single call per media type.
 */
export const MEDIA_BASE_METRICS: Record<IgMediaProductGroup, readonly string[]> = {
  FEED: [
    "views",
    "reach",
    "likes",
    "comments",
    "saved",
    "shares",
    "total_interactions",
    "reposts",
    "profile_visits",
    "follows",
    "facebook_views",
  ],
  REELS: [
    "views",
    "reach",
    "likes",
    "comments",
    "saved",
    "shares",
    "total_interactions",
    "reposts",
    "ig_reels_avg_watch_time",
    "ig_reels_video_view_total_time",
    "reels_skip_rate",
    "crossposted_views",
    "facebook_views",
  ],
  STORY: [
    "views",
    "reach",
    "shares",
    "total_interactions",
    "reposts",
    "profile_visits",
    "follows",
    "replies",
    "facebook_views",
  ],
};

export interface MediaBreakdownConfig {
  readonly metric: string;
  readonly breakdown: string;
}

/**
 * Breakdown metrics queried in separate calls with their breakdown parameter.
 */
export const MEDIA_BREAKDOWN_CONFIGS: Record<
  IgMediaProductGroup,
  readonly MediaBreakdownConfig[]
> = {
  FEED: [{ metric: "profile_activity", breakdown: "action_type" }],
  REELS: [],
  STORY: [
    { metric: "profile_activity", breakdown: "action_type" },
    { metric: "navigation", breakdown: "story_navigation_action_type" },
  ],
};

/**
 * Known breakdown dimension values.
 */
export const PROFILE_ACTION_TYPES = [
  "BIO_LINK_CLICKED",
  "CALL",
  "DIRECTION",
  "EMAIL",
  "OTHER",
  "TEXT",
] as const;

export const PROFILE_ACTION_LABELS: Record<string, string> = {
  BIO_LINK_CLICKED: "Link u opisu profila",
  CALL: "Poziv",
  DIRECTION: "Uputstva za lokaciju",
  EMAIL: "Email",
  TEXT: "SMS poruka",
  OTHER: "Ostalo",
};

export const STORY_NAVIGATION_ACTION_TYPES = [
  "TAP_FORWARD",
  "SWIPE_FORWARD",
  "TAP_BACK",
  "TAP_EXIT",
] as const;

export const STORY_NAVIGATION_LABELS: Record<string, string> = {
  TAP_FORWARD: "Dodir za sledeće (Tap forward)",
  SWIPE_FORWARD: "Prevlačenje na sledeći nalog (Swipe forward)",
  TAP_BACK: "Povratak nazad (Tap back)",
  TAP_EXIT: "Napuštanje priče (Tap exit)",
};

/**
 * Resolve Instagram media product group from media_type and media_product_type.
 * Note: VIDEO published today behaves as REELS.
 */
export function resolveMediaProductGroup(
  mediaType: string = "",
  mediaProductType?: string,
): IgMediaProductGroup {
  const upperProduct = (mediaProductType || "").toUpperCase();
  const upperType = (mediaType || "").toUpperCase();

  if (upperProduct === "STORY" || upperType === "STORY") {
    return "STORY";
  }
  if (
    upperProduct === "REELS" ||
    upperType === "REELS" ||
    upperType === "VIDEO"
  ) {
    return "REELS";
  }
  return "FEED";
}

/**
 * URL builder for /{mediaId}/insights endpoint.
 */
export function buildMediaInsightsUrl(
  mediaId: string,
  metrics: readonly string[],
  accessToken: string,
  version: string = getMetaGraphVersion(),
  breakdown?: string,
): string {
  const url = new URL(`${INSTAGRAM_GRAPH_BASE_URL}/${version}/${mediaId}/insights`);
  url.searchParams.set("metric", metrics.join(","));
  if (breakdown) {
    url.searchParams.set("breakdown", breakdown);
  }
  url.searchParams.set("access_token", accessToken);
  return url.toString();
}

export interface MetricValueResult {
  value?: number;
  state: MetricState;
  reason?: string;
}

export interface RawMediaInsightEntry {
  name: string;
  period?: string;
  values?: { value?: number; end_time?: string }[];
  total_value?: {
    value?: number;
    breakdowns?: {
      dimension_keys?: string[];
      results?: {
        dimension_values?: string[];
        value?: number;
      }[];
    }[];
  };
  title?: string;
  description?: string;
  id?: string;
}

export interface RawMediaInsightsResponse {
  data?: RawMediaInsightEntry[];
  error?: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
  };
}

export const STORY_BELOW_THRESHOLD_REASON =
  "Instagram ne prikazuje uvide za priče sa manje od 5 gledalaca.";

/**
 * Checks whether an error response from Meta is the code 10 "Not enough viewers" condition.
 */
export function isStoryBelowViewerThreshold(
  status?: number,
  errorObj?: { code?: number; message?: string },
): boolean {
  if (errorObj?.code === 10) return true;
  const msg = (errorObj?.message ?? "").toLowerCase();
  return (
    msg.includes("not enough viewers") ||
    msg.includes("not enough viewers for the media to show insights")
  );
}

/**
 * Parses raw Meta Graph API media insights response into 3-state metric map.
 */
export function parseMediaInsightsResponse(params: {
  response?: RawMediaInsightsResponse | null;
  requestedMetrics: readonly string[];
  isError?: boolean;
  errorMessage?: string;
  statusCode?: number;
}): Record<string, MetricValueResult> {
  const { response, requestedMetrics, isError = false, errorMessage, statusCode } = params;
  const out: Record<string, MetricValueResult> = {};

  const isBelowThreshold =
    isStoryBelowViewerThreshold(statusCode, response?.error) ||
    (errorMessage ?? "").toLowerCase().includes("not enough viewers");

  if (isBelowThreshold) {
    for (const metric of requestedMetrics) {
      out[metric] = {
        value: undefined,
        state: "suppressed",
        reason: STORY_BELOW_THRESHOLD_REASON,
      };
    }
    return out;
  }

  if (isError || response?.error) {
    const reason =
      errorMessage ||
      response?.error?.message ||
      "Meta API nije vratila uvide za ovu objavu.";
    for (const metric of requestedMetrics) {
      out[metric] = {
        value: undefined,
        state: "unavailable",
        reason,
      };
    }
    return out;
  }

  const items = response?.data ?? [];
  const byName = new Map<string, RawMediaInsightEntry>();
  for (const item of items) {
    if (item?.name) byName.set(item.name, item);
  }

  for (const metric of requestedMetrics) {
    const item = byName.get(metric);
    if (!item) {
      out[metric] = {
        value: undefined,
        state: "suppressed",
        reason: "Nedovoljno podataka za ovu metriku.",
      };
      continue;
    }

    let val: number | undefined;
    if (
      item.total_value &&
      typeof item.total_value.value === "number" &&
      Number.isFinite(item.total_value.value)
    ) {
      val = item.total_value.value;
    } else if (Array.isArray(item.values) && item.values.length > 0) {
      const last = item.values[item.values.length - 1]?.value;
      if (typeof last === "number" && Number.isFinite(last)) {
        val = last;
      }
    }

    if (val !== undefined) {
      out[metric] = {
        value: val,
        state: "value",
      };
    } else {
      out[metric] = {
        value: undefined,
        state: "suppressed",
        reason: "Nedovoljno podataka za ovu metriku.",
      };
    }
  }

  return out;
}

export interface ParsedMediaBreakdownRow {
  mediaId: string;
  metric: string;
  dimensionKey: string;
  dimensionValue: string;
  value?: number;
  state: MetricState;
  reason?: string;
  syncedAt: number;
}

/**
 * Parses raw Meta Graph API media breakdown insights response.
 */
export function parseMediaBreakdownResponse(params: {
  mediaId: string;
  metric: string;
  dimensionKey: string;
  response?: RawMediaInsightsResponse | null;
  isError?: boolean;
  errorMessage?: string;
  statusCode?: number;
  syncedAt: number;
}): ParsedMediaBreakdownRow[] {
  const {
    mediaId,
    metric,
    dimensionKey,
    response,
    isError = false,
    errorMessage,
    statusCode,
    syncedAt,
  } = params;

  const isBelowThreshold =
    isStoryBelowViewerThreshold(statusCode, response?.error) ||
    (errorMessage ?? "").toLowerCase().includes("not enough viewers");

  if (isBelowThreshold) {
    return [
      {
        mediaId,
        metric,
        dimensionKey,
        dimensionValue: "ALL",
        value: undefined,
        state: "suppressed",
        reason: STORY_BELOW_THRESHOLD_REASON,
        syncedAt,
      },
    ];
  }

  if (isError || response?.error) {
    const reason =
      errorMessage ||
      response?.error?.message ||
      "Meta API nije vratila razdvajanje za ovu metriku.";
    return [
      {
        mediaId,
        metric,
        dimensionKey,
        dimensionValue: "ALL",
        value: undefined,
        state: "unavailable",
        reason,
        syncedAt,
      },
    ];
  }

  const items = response?.data ?? [];
  const item = items.find((it) => it.name === metric) ?? items[0];

  if (!item || !item.total_value?.breakdowns || item.total_value.breakdowns.length === 0) {
    return [
      {
        mediaId,
        metric,
        dimensionKey,
        dimensionValue: "ALL",
        value: undefined,
        state: "suppressed",
        reason: "Nedovoljno podataka za dato razdvajanje.",
        syncedAt,
      },
    ];
  }

  const breakdownObj = item.total_value.breakdowns[0];
  const results = breakdownObj.results ?? [];

  if (results.length === 0) {
    return [
      {
        mediaId,
        metric,
        dimensionKey,
        dimensionValue: "ALL",
        value: undefined,
        state: "suppressed",
        reason: "Nedovoljno podataka za dato razdvajanje.",
        syncedAt,
      },
    ];
  }

  const rows: ParsedMediaBreakdownRow[] = [];
  for (const res of results) {
    const dimVal = res.dimension_values?.[0] ?? "UNKNOWN";
    if (typeof res.value === "number" && Number.isFinite(res.value)) {
      rows.push({
        mediaId,
        metric,
        dimensionKey,
        dimensionValue: dimVal,
        value: res.value,
        state: "value",
        syncedAt,
      });
    } else {
      rows.push({
        mediaId,
        metric,
        dimensionKey,
        dimensionValue: dimVal,
        value: undefined,
        state: "suppressed",
        reason: "Nedovoljno podataka.",
        syncedAt,
      });
    }
  }

  return rows.length > 0
    ? rows
    : [
        {
          mediaId,
          metric,
          dimensionKey,
          dimensionValue: "ALL",
          value: undefined,
          state: "suppressed",
          reason: "Nedovoljno podataka za dato razdvajanje.",
          syncedAt,
        },
      ];
}
