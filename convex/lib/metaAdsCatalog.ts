/**
 * ============================================================================
 * META MARKETING GRAPH API METRICS CATALOG & BREAKDOWN RULES (MA2)
 * ============================================================================
 *
 * Single source of truth for Meta Ads metrics, derived calculations,
 * breakdown restrictions, and rate resolution.
 * Modeled after `convex/lib/ga4Catalog.ts`.
 * ============================================================================
 */

/**
 * Podignuto na verziju 3: stari redovi su imali 0 umesto undefined za nepoznate metrike.
 * Normalni restatement kroz sync ponovo dohvata ove podatke sa ispravnim opcionim poljima.
 */
export const META_INSIGHTS_VERSION = 3;

export const META_INSIGHTS_DOC_URL =
  "https://developers.facebook.com/docs/marketing-api/insights/breakdowns";
export const META_DYNAMIC_CREATIVE_DOC_URL =
  "https://developers.facebook.com/docs/marketing-api/guides/dynamic-creative";

export type MetaMetricUnit =
  | "currency"
  | "count"
  | "ratio"
  | "percent"
  | "enum";

export type MetaMetricSource = "meta" | "derived";

export interface MetaMetricDef {
  readonly apiName: string;
  readonly label: string; // srpski, latinica
  readonly unit: MetaMetricUnit;
  readonly source: MetaMetricSource;
  readonly higherIsBetter: boolean;
  readonly allowedValues?: readonly string[];
  readonly category?: string;
  readonly description?: string;
  readonly numerator?: string;
  readonly denominator?: string;
}

/**
 * Staticki katalog svih podrzanih Meta Ads metrika.
 */
export const META_METRIC_CATALOG: Record<string, MetaMetricDef> = {
  // ── Finansijske i troškovne metrike (currency) ─────────────────────────────
  spend: {
    apiName: "spend",
    label: "Potrošnja",
    unit: "currency",
    source: "meta",
    higherIsBetter: false,
    category: "Performance",
    description: "Ukupan iznos potrošen na oglase u izabranom periodu.",
  },
  cpc: {
    apiName: "cpc",
    label: "Cena po kliku (CPC)",
    unit: "currency",
    source: "meta",
    higherIsBetter: false,
    category: "Performance",
    description: "Prosečna cena po pojedinačnom kliku na oglas (Meta kalkulacija).",
  },
  cpm: {
    apiName: "cpm",
    label: "Cena za 1.000 impresija (CPM)",
    unit: "currency",
    source: "meta",
    higherIsBetter: false,
    category: "Performance",
    description: "Prosečan trošak za 1.000 prikaza oglasa.",
  },
  cpp: {
    apiName: "cpp",
    label: "Cena za 1.000 dosegnutih ljudi (CPP)",
    unit: "currency",
    source: "meta",
    higherIsBetter: false,
    category: "Performance",
    description: "Prosečan trošak za 1.000 jedinstveno dosegnutih korisnika.",
  },
  action_values: {
    apiName: "action_values",
    label: "Vrednost akcija",
    unit: "currency",
    source: "meta",
    higherIsBetter: true,
    category: "Conversions",
    description: "Ukupna novčana vrednost svih konverzija pripisanih oglasu.",
  },
  cost_per_action_type: {
    apiName: "cost_per_action_type",
    label: "Cena po akciji",
    unit: "currency",
    source: "meta",
    higherIsBetter: false,
    category: "Conversions",
    description: "Trošak po pojedinačnoj akciji ili konverziji određenog tipa.",
  },
  cost_per_unique_action_type: {
    apiName: "cost_per_unique_action_type",
    label: "Cena po jedinstvenoj akciji",
    unit: "currency",
    source: "meta",
    higherIsBetter: false,
    category: "Conversions",
    description: "Trošak po pojedinačnom jedinstvenom korisniku koji je izveo akciju.",
  },

  // ── Obimi i brojači (count) ───────────────────────────────────────────────
  impressions: {
    apiName: "impressions",
    label: "Impresije",
    unit: "count",
    source: "meta",
    higherIsBetter: true,
    category: "Delivery",
    description: "Ukupan broj prikaza oglasa na ekranima korisnika.",
  },
  reach: {
    apiName: "reach",
    label: "Doseg",
    unit: "count",
    source: "meta",
    higherIsBetter: true,
    category: "Delivery",
    description: "Broj jedinstvenih korisnika koji su videli oglas najmanje jednom.",
  },
  clicks: {
    apiName: "clicks",
    label: "Klikovi",
    unit: "count",
    source: "meta",
    higherIsBetter: true,
    category: "Engagement",
    description: "Ukupan broj klikova na oglas (svi klikovi).",
  },
  actions: {
    apiName: "actions",
    label: "Akcije",
    unit: "count",
    source: "meta",
    higherIsBetter: true,
    category: "Conversions",
    description: "Ukupan broj zabeleženih akcija i konverzija podstaknutih oglasom.",
  },

  // ── Video akcije (count) ──────────────────────────────────────────────────
  video_3_sec_watched_actions: {
    apiName: "video_3_sec_watched_actions",
    label: "Video pregledi ≥ 3s",
    unit: "count",
    source: "meta",
    higherIsBetter: true,
    category: "Video",
    description: "Broj reprodukcija videa u trajanju od najmanje 3 sekunde.",
  },
  video_thruplay_watched_actions: {
    apiName: "video_thruplay_watched_actions",
    label: "Video ThruPlay pregledi",
    unit: "count",
    source: "meta",
    higherIsBetter: true,
    category: "Video",
    description: "Broj reprodukcija videa do kraja ili najmanje 15 sekundi.",
  },
  video_p25_watched_actions: {
    apiName: "video_p25_watched_actions",
    label: "Video pregledi 25%",
    unit: "count",
    source: "meta",
    higherIsBetter: true,
    category: "Video",
    description: "Broj reprodukcija koje su dostigle 25% dužine videa.",
  },
  video_p50_watched_actions: {
    apiName: "video_p50_watched_actions",
    label: "Video pregledi 50%",
    unit: "count",
    source: "meta",
    higherIsBetter: true,
    category: "Video",
    description: "Broj reprodukcija koje su dostigle 50% dužine videa.",
  },
  video_p75_watched_actions: {
    apiName: "video_p75_watched_actions",
    label: "Video pregledi 75%",
    unit: "count",
    source: "meta",
    higherIsBetter: true,
    category: "Video",
    description: "Broj reprodukcija koje su dostigle 75% dužine videa.",
  },
  video_p95_watched_actions: {
    apiName: "video_p95_watched_actions",
    label: "Video pregledi 95%",
    unit: "count",
    source: "meta",
    higherIsBetter: true,
    category: "Video",
    description: "Broj reprodukcija koje su dostigle 95% dužine videa.",
  },
  video_p100_watched_actions: {
    apiName: "video_p100_watched_actions",
    label: "Video pregledi 100%",
    unit: "count",
    source: "meta",
    higherIsBetter: true,
    category: "Video",
    description: "Broj kompletnih reprodukcija videa do samog kraja.",
  },

  // ── Odnosi (ratio) ────────────────────────────────────────────────────────
  frequency: {
    apiName: "frequency",
    label: "Frekvencija",
    unit: "ratio",
    source: "meta",
    higherIsBetter: false,
    category: "Delivery",
    description: "Prosečan broj prikaza oglasa po jedinstvenom korisniku (NIJE procenat).",
  },

  // ── Procenti (percent — Meta vraća 0-100, NE 0-1) ──────────────────────────
  ctr: {
    apiName: "ctr",
    label: "Stopa klikova (CTR)",
    unit: "percent",
    source: "meta",
    higherIsBetter: true,
    category: "Engagement",
    description: "Procenat prikaza oglasa koji su rezultovali klikom (Meta unified kalkulacija).",
  },
  unique_ctr: {
    apiName: "unique_ctr",
    label: "Jedinstveni CTR",
    unit: "percent",
    source: "meta",
    higherIsBetter: true,
    category: "Engagement",
    description: "Procenat dosegnutih korisnika koji su kliknuli na oglas.",
  },
  outbound_clicks_ctr: {
    apiName: "outbound_clicks_ctr",
    label: "CTR odlaznih klikova",
    unit: "percent",
    source: "meta",
    higherIsBetter: true,
    category: "Engagement",
    description: "Procenat prikaza koji su rezultovali klikom koji vodi van Meta platforme.",
  },

  // ── Rangiranja (enum) ─────────────────────────────────────────────────────
  quality_ranking: {
    apiName: "quality_ranking",
    label: "Rang kvaliteta",
    unit: "enum",
    allowedValues: [
      "ABOVE_AVERAGE",
      "AVERAGE",
      "BELOW_AVERAGE_35",
      "BELOW_AVERAGE_20",
      "BELOW_AVERAGE_10",
      "UNKNOWN",
    ],
    source: "meta",
    higherIsBetter: true,
    category: "Diagnostics",
    description: "Ocena kvaliteta oglasa u poređenju sa oglasima koji se takmiče za istu publiku.",
  },
  engagement_rate_ranking: {
    apiName: "engagement_rate_ranking",
    label: "Rang stope angažovanja",
    unit: "enum",
    allowedValues: [
      "ABOVE_AVERAGE",
      "AVERAGE",
      "BELOW_AVERAGE_35",
      "BELOW_AVERAGE_20",
      "BELOW_AVERAGE_10",
      "UNKNOWN",
    ],
    source: "meta",
    higherIsBetter: true,
    category: "Diagnostics",
    description: "Očekivana stopa angažovanja oglasa u poređenju sa konkurencijom za istu publiku.",
  },
  conversion_rate_ranking: {
    apiName: "conversion_rate_ranking",
    label: "Rang stope konverzije",
    unit: "enum",
    allowedValues: [
      "ABOVE_AVERAGE",
      "AVERAGE",
      "BELOW_AVERAGE_35",
      "BELOW_AVERAGE_20",
      "BELOW_AVERAGE_10",
      "UNKNOWN",
    ],
    source: "meta",
    higherIsBetter: true,
    category: "Diagnostics",
    description: "Očekivana stopa konverzije oglasa u poređenju sa oglasima sa istim ciljem optimizacije.",
  },

  // ── Izvedene metrike (derived) ────────────────────────────────────────────
  hookRate: {
    apiName: "hookRate",
    label: "Hook stopa (Hook Rate)",
    unit: "percent",
    source: "derived",
    numerator: "video_3_sec_watched_actions",
    denominator: "impressions",
    higherIsBetter: true,
    category: "Creative Diagnostics",
    description: "Procenat impresija koje su zadržale pažnju gledaoca najmanje 3 sekunde.",
  },
  holdRate: {
    apiName: "holdRate",
    label: "Hold stopa (Hold Rate)",
    unit: "percent",
    source: "derived",
    numerator: "video_thruplay_watched_actions",
    denominator: "video_3_sec_watched_actions",
    higherIsBetter: true,
    category: "Creative Diagnostics",
    description: "Procenat 3-sekundnih pregleda videa koji su stigli do ThruPlay završetka.",
  },
  roas: {
    apiName: "roas",
    label: "Povrat investicije u oglase (ROAS)",
    unit: "ratio",
    source: "derived",
    numerator: "action_values",
    denominator: "spend",
    higherIsBetter: true,
    category: "Performance",
    description: "Odnos ostvarene vrednosti konverzija (action_values) i troškova oglasa (spend).",
  },
  costPerResult: {
    apiName: "costPerResult",
    label: "Cena po rezultatu (CPA)",
    unit: "currency",
    source: "derived",
    numerator: "spend",
    denominator: "results",
    higherIsBetter: false,
    category: "Performance",
    description: "Prosečan trošak po ostvarenom ključnom rezultatu ili konverziji.",
  },
  results: {
    apiName: "results",
    label: "Rezultati (Konverzije)",
    unit: "count",
    source: "derived",
    numerator: "actions",
    denominator: undefined,
    higherIsBetter: true,
    category: "Conversions",
    description: "Ukupan broj prioritetnih konverzija (kupovine, lidovi, registracije).",
  },
};

/**
 * Razrešava metriku iz statičkog kataloga.
 */
export function resolveMetric(apiName: string): MetaMetricDef | undefined {
  return META_METRIC_CATALOG[apiName];
}

export { deriveRate } from "./rates";

// ── Pravila kombinovanja razdvajanja i metrika (MA2) ────────────────────────

export interface BreakdownRule {
  readonly breakdown: string;
  readonly excludesMetrics: readonly string[]; // apiName-ovi koji NE stizu uz ovaj breakdown
  readonly note: string; // zasto, jednom recenicom
  readonly source: string; // URL Meta dokumentacije
}

/**
 * Nazivi parametara koji su zapravo `action_breakdowns`, a ne `breakdowns`.
 */
export const ACTION_BREAKDOWN_NAMES = [
  "action_type",
  "action_target_id",
  "action_device",
  "action_destination",
  "action_reaction",
  "action_video_sound",
  "action_video_type",
  "action_canvas_component_name",
  "action_carousel_card_id",
  "action_carousel_card_name",
] as const;

/**
 * Statička pravila o isključenjima metrika pri razdvajanjima (potvrđena u Meta Graph API dokumentaciji).
 */
export const BREAKDOWN_RULES: readonly BreakdownRule[] = [
  // 1. Satna razdvajanja
  {
    breakdown: "hourly_stats_aggregated_by_audience_time_zone",
    excludesMetrics: [
      "reach",
      "frequency",
      "unique_ctr",
      "cost_per_unique_action_type",
      "video_3_sec_watched_actions",
      "video_thruplay_watched_actions",
      "video_p25_watched_actions",
      "video_p50_watched_actions",
      "video_p75_watched_actions",
      "video_p95_watched_actions",
      "video_p100_watched_actions",
    ],
    note: "Satna razdvajanja po vremenskoj zoni publike ne podržavaju jedinstvene metrike (reach, frequency, unique_*) i video metrike.",
    source: META_INSIGHTS_DOC_URL,
  },
  {
    breakdown: "hourly_stats_aggregated_by_advertiser_time_zone",
    excludesMetrics: [
      "reach",
      "frequency",
      "unique_ctr",
      "cost_per_unique_action_type",
      "video_3_sec_watched_actions",
      "video_thruplay_watched_actions",
      "video_p25_watched_actions",
      "video_p50_watched_actions",
      "video_p75_watched_actions",
      "video_p95_watched_actions",
      "video_p100_watched_actions",
    ],
    note: "Satna razdvajanja po vremenskoj zoni oglašivača ne podržavaju jedinstvene metrike (reach, frequency, unique_*) i video metrike.",
    source: META_INSIGHTS_DOC_URL,
  },

  // 2. Geografska razdvajanja (region, country, dma)
  {
    breakdown: "region",
    excludesMetrics: [
      "video_p25_watched_actions",
      "video_p50_watched_actions",
      "video_p75_watched_actions",
      "video_p95_watched_actions",
      "video_p100_watched_actions",
    ],
    note: "Geografsko razdvajanje po regionu ne podržava video kvartile gledanosti (p25, p50, p75, p95, p100).",
    source: META_INSIGHTS_DOC_URL,
  },
  {
    breakdown: "country",
    excludesMetrics: [
      "video_p25_watched_actions",
      "video_p50_watched_actions",
      "video_p75_watched_actions",
      "video_p95_watched_actions",
      "video_p100_watched_actions",
    ],
    note: "Geografsko razdvajanje po državi ne podržava video kvartile gledanosti (p25, p50, p75, p95, p100).",
    source: META_INSIGHTS_DOC_URL,
  },
  {
    breakdown: "dma",
    excludesMetrics: [
      "video_p25_watched_actions",
      "video_p50_watched_actions",
      "video_p75_watched_actions",
      "video_p95_watched_actions",
      "video_p100_watched_actions",
    ],
    note: "Geografsko razdvajanje po DMA tržišnom području ne podržava video kvartile gledanosti (p25, p50, p75, p95, p100).",
    source: META_INSIGHTS_DOC_URL,
  },

  // 3. Asset breakdown-i za dinamički kreativ
  ...[
    "image_asset",
    "video_asset",
    "body_asset",
    "title_asset",
    "description_asset",
    "call_to_action_asset",
    "link_url_asset",
    "ad_format_asset",
  ].map((breakdown) => ({
    breakdown,
    excludesMetrics: [
      "cpc",
      "cpm",
      "cpp",
      "ctr",
      "unique_ctr",
      "frequency",
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
    ],
    note: `Asset razdvajanje (${breakdown}) za dinamički kreativ podržava samo osnovne metrike: impressions, clicks, spend, reach, actions, action_values.`,
    source: META_DYNAMIC_CREATIVE_DOC_URL,
  })),
];

export type BreakdownCheckResult =
  | { allowed: true }
  | { allowed: false; reason: string; dropMetrics: string[] };

/**
 * Proverava da li je zadata kombinacija breakdowns i metrika dozvoljena po pravilima Meta Graph API-ja.
 *
 * Ako je nedozvoljena, vraća `allowed: false`, objašnjenje i spisak metrika `dropMetrics`
 * koje treba izostaviti iz zahteva kako bi poziv uspeo.
 */
export function isBreakdownComboAllowed(
  breakdowns: string[],
  metrics: string[],
): BreakdownCheckResult {
  // 1. Provera da li je neko prosledio action_breakdown kao redovan breakdown
  const actionBreakdownsPassed = breakdowns.filter((b) =>
    ACTION_BREAKDOWN_NAMES.includes(
      b as (typeof ACTION_BREAKDOWN_NAMES)[number],
    ),
  );
  if (actionBreakdownsPassed.length > 0) {
    return {
      allowed: false,
      reason: `${actionBreakdownsPassed.join(", ")} NISU 'breakdowns', nego 'action_breakdowns' (poseban parametar u Meta Marketing API-ju).`,
      dropMetrics: [],
    };
  }

  // 2. Provera pravila isključenja metrika
  const dropSet = new Set<string>();
  const reasons: string[] = [];

  for (const b of breakdowns) {
    const rules = BREAKDOWN_RULES.filter((r) => r.breakdown === b);
    for (const rule of rules) {
      const droppedForThisRule = metrics.filter((m) =>
        rule.excludesMetrics.includes(m),
      );
      if (droppedForThisRule.length > 0) {
        for (const m of droppedForThisRule) {
          dropSet.add(m);
        }
        reasons.push(`${b}: ${rule.note}`);
      }
    }
  }

  if (dropSet.size > 0) {
    return {
      allowed: false,
      reason: Array.from(new Set(reasons)).join("; "),
      dropMetrics: Array.from(dropSet),
    };
  }

  return { allowed: true };
}
