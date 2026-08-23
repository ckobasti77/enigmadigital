/**
 * ============================================================================
 * GOOGLE ADS API (GAQL) METRICS CATALOG & COMPATIBILITY RULES (GA2)
 * ============================================================================
 *
 * Single source of truth for Google Ads GAQL metrics, derived rates,
 * segment & resource compatibility rules, and query building.
 * Modeled after `convex/lib/metaAdsCatalog.ts` and `convex/lib/ga4Catalog.ts`.
 *
 * Hard Rules:
 *   - Offline only (no live API connection required).
 *   - Currency metrics (*_micros) are marked to pass through `microsToUnits`.
 *   - Ratio metrics (ctr, conversion_rate, etc.) are NEVER stored as computed
 *     values in the database (`stored: false`). Numerator and denominator are
 *     stored, and the ratio is derived on read via `deriveRate`.
 *   - GAQL queries must have exactly ONE resource in FROM (no JOINs).
 *   - Incompatible combinations (e.g. segments.age_range + segments.gender)
 *     are rejected pre-flight with user-friendly Serbian explanation.
 * ============================================================================
 */

import { microsToUnits } from "./googleAdsShared";

export const GOOGLE_ADS_CATALOG_VERSION = 1;

export const GOOGLE_ADS_API_DOC_URL =
  "https://developers.google.com/google-ads/api/docs/reporting/overview";

export type GoogleAdsMetricUnit =
  | "count"
  | "currency"
  | "ratio"
  | "duration"
  | "score";

export type GoogleAdsMetricSource = "google_ads" | "derived";

export interface GoogleAdsMetricDef {
  readonly apiName: string;
  readonly label: string; // srpski, latinica
  readonly unit: GoogleAdsMetricUnit;
  readonly source: GoogleAdsMetricSource;
  readonly stored: boolean; // false za sve odnose (ratio)
  readonly isMicros?: boolean; // true ako je polje u mikrosima i prolazi kroz microsToUnits
  readonly higherIsBetter: boolean;
  readonly category: string;
  readonly description: string; // srpski opis za tooltip / dokumentaciju
  readonly numerator?: string; // za izvedene i ratio metrike
  readonly denominator?: string; // za izvedene i ratio metrike
}

/**
 * Statički katalog podržanih Google Ads metrika.
 */
export const GOOGLE_ADS_METRIC_CATALOG: Record<string, GoogleAdsMetricDef> = {
  // ── Obimi i brojači (count) ───────────────────────────────────────────────
  impressions: {
    apiName: "metrics.impressions",
    label: "Prikazi (Impresije)",
    unit: "count",
    source: "google_ads",
    stored: true,
    higherIsBetter: true,
    category: "Delivery",
    description: "Ukupan broj prikaza oglasa na Google pretrazi, YouTube-u ili Display mreži.",
  },
  clicks: {
    apiName: "metrics.clicks",
    label: "Klikovi",
    unit: "count",
    source: "google_ads",
    stored: true,
    higherIsBetter: true,
    category: "Engagement",
    description: "Ukupan broj zabeleženih klikova na oglas.",
  },
  conversions: {
    apiName: "metrics.conversions",
    label: "Konverzije",
    unit: "count",
    source: "google_ads",
    stored: true,
    higherIsBetter: true,
    category: "Conversions",
    description: "Broj ostvarenih primarnih konverzija definisanih u Google Ads nalogu.",
  },
  all_conversions: {
    apiName: "metrics.all_conversions",
    label: "Sve konverzije",
    unit: "count",
    source: "google_ads",
    stored: true,
    higherIsBetter: true,
    category: "Conversions",
    description: "Ukupan broj svih konverzija, uključujući primarne i sekundarne ciljeve.",
  },
  interactions: {
    apiName: "metrics.interactions",
    label: "Interakcije",
    unit: "count",
    source: "google_ads",
    stored: true,
    higherIsBetter: true,
    category: "Engagement",
    description: "Glavna akcija vezana za format oglasa (klikovi za Search, pregledi za Video).",
  },
  video_views: {
    apiName: "metrics.video_views",
    label: "Video pregledi",
    unit: "count",
    source: "google_ads",
    stored: true,
    higherIsBetter: true,
    category: "Video",
    description: "Broj pregleda video oglasa u trajanju od najmanje 30 sekundi ili do kraja videa.",
  },

  // ── Finansijske i troškovne metrike (currency — *_micros) ───────────────────
  cost_micros: {
    apiName: "metrics.cost_micros",
    label: "Trošak (Cena)",
    unit: "currency",
    source: "google_ads",
    stored: true,
    isMicros: true,
    higherIsBetter: false,
    category: "Cost",
    description: "Ukupan iznos potrošen na oglase u mikrosima (prolazi kroz microsToUnits).",
  },
  conversions_value_micros: {
    apiName: "metrics.conversions_value_micros",
    label: "Vrednost konverzija",
    unit: "currency",
    source: "google_ads",
    stored: true,
    isMicros: true,
    higherIsBetter: true,
    category: "Conversions",
    description: "Ukupna novčana vrednost ostvarenih primarnih konverzija u mikrosima.",
  },
  all_conversions_value_micros: {
    apiName: "metrics.all_conversions_value_micros",
    label: "Vrednost svih konverzija",
    unit: "currency",
    source: "google_ads",
    stored: true,
    isMicros: true,
    higherIsBetter: true,
    category: "Conversions",
    description: "Ukupna novčana vrednost svih ostvarenih konverzija u mikrosima.",
  },

  // ── Odnosi i stope (ratio — NIKAD se ne čuvaju kao broj u bazi) ───────────
  ctr: {
    apiName: "metrics.ctr",
    label: "Stopa klikova (CTR)",
    unit: "ratio",
    source: "google_ads",
    stored: false,
    numerator: "metrics.clicks",
    denominator: "metrics.impressions",
    higherIsBetter: true,
    category: "Engagement",
    description: "Odnos broja klikova i prikaza oglasa (izvodi se pri čitanju: clicks / impressions).",
  },
  average_cpc: {
    apiName: "metrics.average_cpc",
    label: "Prosečna cena po kliku (CPC)",
    unit: "currency",
    source: "derived",
    stored: false,
    numerator: "metrics.cost_micros",
    denominator: "metrics.clicks",
    higherIsBetter: false,
    category: "Cost",
    description: "Prosečan trošak po pojedinačnom kliku (izvodi se: cost / clicks).",
  },
  average_cpm: {
    apiName: "metrics.average_cpm",
    label: "Prosečna cena za 1.000 prikaza (CPM)",
    unit: "currency",
    source: "derived",
    stored: false,
    numerator: "metrics.cost_micros",
    denominator: "metrics.impressions",
    higherIsBetter: false,
    category: "Cost",
    description: "Prosečan trošak za 1.000 prikaza oglasa (izvodi se: (cost / impressions) * 1000).",
  },
  cost_per_conversion: {
    apiName: "metrics.cost_per_conversion",
    label: "Cena po konverziji (CPA)",
    unit: "currency",
    source: "derived",
    stored: false,
    numerator: "metrics.cost_micros",
    denominator: "metrics.conversions",
    higherIsBetter: false,
    category: "Cost",
    description: "Prosečan trošak po ostvarenoj primarnoj konverziji (cost / conversions).",
  },
  interaction_rate: {
    apiName: "metrics.interaction_rate",
    label: "Stopa interakcije",
    unit: "ratio",
    source: "google_ads",
    stored: false,
    numerator: "metrics.interactions",
    denominator: "metrics.impressions",
    higherIsBetter: true,
    category: "Engagement",
    description: "Odnos interakcija i prikaza oglasa (izvodi se: interactions / impressions).",
  },
  conversions_from_interactions_rate: {
    apiName: "metrics.conversions_from_interactions_rate",
    label: "Stopa konverzije",
    unit: "ratio",
    source: "google_ads",
    stored: false,
    numerator: "metrics.conversions",
    denominator: "metrics.interactions",
    higherIsBetter: true,
    category: "Conversions",
    description: "Odnos konverzija i broja interakcija (izvodi se: conversions / interactions).",
  },
  cost_per_all_conversions: {
    apiName: "metrics.cost_per_all_conversions",
    label: "Cena po svim konverzijama",
    unit: "currency",
    source: "derived",
    stored: false,
    numerator: "metrics.cost_micros",
    denominator: "metrics.all_conversions",
    higherIsBetter: false,
    category: "Cost",
    description: "Prosečan trošak po ostvarenoj konverziji (primarnoj ili sekundarnoj) (cost / all_conversions).",
  },
  conversions_value_per_cost: {
    apiName: "metrics.conversions_value_per_cost",
    label: "Vrednost konverzija po trošku (ROAS)",
    unit: "ratio",
    source: "derived",
    stored: false,
    numerator: "metrics.conversions_value_micros",
    denominator: "metrics.cost_micros",
    higherIsBetter: true,
    category: "Conversions",
    description: "Povrat investicije u oglase (ROAS) — odnos novčane vrednosti konverzija i troška.",
  },
  value_per_conversion: {
    apiName: "metrics.value_per_conversion",
    label: "Vrednost po primarnoj konverziji",
    unit: "currency",
    source: "derived",
    stored: false,
    numerator: "metrics.conversions_value_micros",
    denominator: "metrics.conversions",
    higherIsBetter: true,
    category: "Conversions",
    description: "Prosečna vrednost po primarnoj konverziji (conversions_value / conversions).",
  },
  search_impression_share: {
    apiName: "metrics.search_impression_share",
    label: "Udeo u prikazima na pretrazi (Search Impression Share)",
    unit: "ratio",
    source: "google_ads",
    stored: false,
    higherIsBetter: true,
    category: "Competitive",
    description: "Procenat ostvarenih prikaza u poređenju sa ukupnim mogućim prikazima na pretrazi.",
  },
  search_budget_lost_impression_share: {
    apiName: "metrics.search_budget_lost_impression_share",
    label: "Izgubljeni udeo u prikazima zbog budžeta",
    unit: "ratio",
    source: "google_ads",
    stored: false,
    higherIsBetter: false,
    category: "Competitive",
    description: "Procenat propuštenih prikaza na pretrazi usled ograničenog budžeta kampanje.",
  },
  search_rank_lost_impression_share: {
    apiName: "metrics.search_rank_lost_impression_share",
    label: "Izgubljeni udeo u prikazima zbog ranga",
    unit: "ratio",
    source: "google_ads",
    stored: false,
    higherIsBetter: false,
    category: "Competitive",
    description: "Procenat propuštenih prikaza na pretrazi usled slabijeg ranga oglasa (Ad Rank).",
  },
  video_view_rate: {
    apiName: "metrics.video_view_rate",
    label: "Stopa pregleda videa (View Rate)",
    unit: "ratio",
    source: "google_ads",
    stored: false,
    numerator: "metrics.video_views",
    denominator: "metrics.impressions",
    higherIsBetter: true,
    category: "Video",
    description: "Odnos video pregleda i impresija (video_views / impressions).",
  },
  video_quartile_p25_rate: {
    apiName: "metrics.video_quartile_p25_rate",
    label: "Stopa pregleda videa do 25%",
    unit: "ratio",
    source: "google_ads",
    stored: false,
    higherIsBetter: true,
    category: "Video",
    description: "Procenat reprodukcija koje su dostigle 25% dužine videa.",
  },
  video_quartile_p50_rate: {
    apiName: "metrics.video_quartile_p50_rate",
    label: "Stopa pregleda videa do 50%",
    unit: "ratio",
    source: "google_ads",
    stored: false,
    higherIsBetter: true,
    category: "Video",
    description: "Procenat reprodukcija koje su dostigle 50% dužine videa.",
  },
  video_quartile_p75_rate: {
    apiName: "metrics.video_quartile_p75_rate",
    label: "Stopa pregleda videa do 75%",
    unit: "ratio",
    source: "google_ads",
    stored: false,
    higherIsBetter: true,
    category: "Video",
    description: "Procenat reprodukcija koje su dostigle 75% dužine videa.",
  },
  video_quartile_p100_rate: {
    apiName: "metrics.video_quartile_p100_rate",
    label: "Stopa pregleda videa do 100%",
    unit: "ratio",
    source: "google_ads",
    stored: false,
    higherIsBetter: true,
    category: "Video",
    description: "Procenat kompletnih reprodukcija videa do samog kraja.",
  },

  // ── Ocene i rangovi (score) ───────────────────────────────────────────────
  quality_score: {
    apiName: "quality_score",
    label: "Ocena kvaliteta (Quality Score)",
    unit: "score",
    source: "google_ads",
    stored: true,
    higherIsBetter: true,
    category: "Diagnostics",
    description: "Ocena relevantnosti ključne reči, oglasa i odredišne stranice na skali od 1 do 10.",
  },
  search_predicted_ctr: {
    apiName: "search_predicted_ctr",
    label: "Očekivani CTR",
    unit: "score",
    source: "google_ads",
    stored: true,
    higherIsBetter: true,
    category: "Diagnostics",
    description: "Procena verovatnoće klika na oglas za datu ključnu reč (ABOVE_AVERAGE / AVERAGE / BELOW_AVERAGE).",
  },
  creative_quality_score: {
    apiName: "creative_quality_score",
    label: "Relevantnost oglasa",
    unit: "score",
    source: "google_ads",
    stored: true,
    higherIsBetter: true,
    category: "Diagnostics",
    description: "Ocena usklađenosti teksta oglasa sa ključnom reči koju korisnik pretražuje.",
  },
  post_click_quality_score: {
    apiName: "post_click_quality_score",
    label: "Iskustvo na odredišnoj stranici",
    unit: "score",
    source: "google_ads",
    stored: true,
    higherIsBetter: true,
    category: "Diagnostics",
    description: "Ocena relevantnosti i lakoće navigacije na odredišnoj stranici za korisnika.",
  },
};

/**
 * Razrešava metriku iz kataloga po ključu ili apiName-u.
 */
export function resolveGoogleAdsMetric(name: string): GoogleAdsMetricDef | undefined {
  if (GOOGLE_ADS_METRIC_CATALOG[name]) {
    return GOOGLE_ADS_METRIC_CATALOG[name];
  }
  const cleanName = name.replace(/^metrics\./, "");
  if (GOOGLE_ADS_METRIC_CATALOG[cleanName]) {
    return GOOGLE_ADS_METRIC_CATALOG[cleanName];
  }
  return Object.values(GOOGLE_ADS_METRIC_CATALOG).find(
    (m) => m.apiName === name || m.apiName === `metrics.${name}`,
  );
}

export { deriveRate } from "./rates";
export { calculateGoogleAdsBackfillDepth } from "./googleAdsBackfill";
export {
  formatQualityComponent,
  formatQualityScoreComponent,
  formatQualityScore,
  formatSearchTermStatus,
  formatMatchType,
  formatDeviceType,
  formatDayOfWeek,
  formatAgeRange,
  formatGender,
  formatLocationType,
  formatAssetPerformanceLabel,
  formatAssetFieldType,
  formatAssetType,
  calculateAssetCombinationCoverage,
} from "./googleAdsFormat";

// ── Pravila kompatibilnosti za GAQL (B2) ────────────────────────────────────

export interface ProhibitedSegmentComboRule {
  readonly segments: readonly string[];
  readonly reason: string;
  readonly note: string;
}

export interface ResourceFieldRestrictionRule {
  readonly field: string;
  readonly allowedResources: readonly string[];
  readonly reason: string;
  readonly note: string;
}

export interface SegmentDependencyRule {
  readonly segment: string;
  readonly requiresFieldOrSegment: string;
  readonly reason: string;
  readonly note: string;
}

/**
 * 1. ZABRANJENE KOMBINACIJE SEGMENATA
 * Google Ads API zabranjuje istovremeno segmentiranje po ovim dimenzijama u jednom upitu.
 */
export const PROHIBITED_SEGMENT_COMBINATIONS: readonly ProhibitedSegmentComboRule[] = [
  {
    segments: ["segments.age_range", "segments.gender"],
    reason:
      "Segmenti 'segments.age_range' i 'segments.gender' ne smeju se nalaziti u istom GAQL upitu. Google Ads API zabranjuje istovremeno demografsko segmentiranje po starosnoj grupi i polu u jednom zahtevu.",
    note: "Google Ads API vraća grešku PROHIBITED_SEGMENT_COMBINATION. Koristite odvojene upite ili specijalizovane resurse age_range_view i gender_view.",
  },
  {
    segments: ["segments.age_range", "segments.geo_target_city"],
    reason:
      "Segmenti 'segments.age_range' i 'segments.geo_target_city' ne smeju se kombinovati u istom GAQL upitu.",
    note: "Google Ads ne podržava ukrštanje mikrolokacija sa demografskim segmentima.",
  },
  {
    segments: ["segments.gender", "segments.geo_target_city"],
    reason:
      "Segmenti 'segments.gender' i 'segments.geo_target_city' ne smeju se kombinovati u istom GAQL upitu.",
    note: "Google Ads ne podržava ukrštanje mikrolokacija sa demografskim segmentima.",
  },
];

/**
 * 2. OGRANIČENJA METRIKA I POLJA PO RESURSIMA
 * Određene metrike postoje isključivo na određenim nivoima hijerarhije (resursima).
 */
export const RESOURCE_FIELD_RESTRICTIONS: readonly ResourceFieldRestrictionRule[] = [
  // Search impression share metrike su dostupne samo na nivou kampanje, oglasne grupe i naloga
  {
    field: "metrics.search_impression_share",
    allowedResources: ["campaign", "ad_group", "customer"],
    reason:
      "Metrika udela u prikazima (metrics.search_impression_share) dostupna je samo na resursima 'campaign', 'ad_group' ili 'customer', a ne na nivou pojedinačnih oglasa ili ključnih reči.",
    note: "Google Ads računa udeo u aukcijama samo na nivou kampanje, grupe ili naloga.",
  },
  {
    field: "metrics.search_budget_lost_impression_share",
    allowedResources: ["campaign", "customer"],
    reason:
      "Metrika izgubljenog udela u prikazima zbog budžeta (metrics.search_budget_lost_impression_share) dostupna je samo na resursima 'campaign' ili 'customer'.",
    note: "Budžet se postavlja na nivou kampanje, pa oglasne grupe i oglasi nemaju ovu metriku.",
  },
  {
    field: "metrics.search_rank_lost_impression_share",
    allowedResources: ["campaign", "ad_group", "customer"],
    reason:
      "Metrika izgubljenog udela u prikazima zbog ranga (metrics.search_rank_lost_impression_share) dostupna je samo na resursima 'campaign', 'ad_group' ili 'customer'.",
    note: "Dostupno samo na agregiranim nivoima aukcije.",
  },

  // Ocene kvaliteta postoje samo na nivou ključnih reči
  {
    field: "quality_score",
    allowedResources: ["keyword_view", "ad_group_criterion"],
    reason:
      "Metrika ocene kvaliteta (quality_score) je specifična za ključne reči i dostupna je samo na resursu 'keyword_view' ili 'ad_group_criterion'.",
    note: "Quality Score ne postoji na nivou kampanje, oglasne grupe ili oglasa.",
  },
  {
    field: "search_predicted_ctr",
    allowedResources: ["keyword_view", "ad_group_criterion"],
    reason:
      "Metrika očekivanog CTR-a (search_predicted_ctr) dostupna je samo na resursu 'keyword_view' ili 'ad_group_criterion'.",
    note: "Dijagnostika ključnih reči.",
  },
  {
    field: "creative_quality_score",
    allowedResources: ["keyword_view", "ad_group_criterion"],
    reason:
      "Metrika relevantnosti teksta oglasa (creative_quality_score) dostupna je samo na resursu 'keyword_view' ili 'ad_group_criterion'.",
    note: "Dijagnostika ključnih reči.",
  },
  {
    field: "post_click_quality_score",
    allowedResources: ["keyword_view", "ad_group_criterion"],
    reason:
      "Metrika iskustva na odredišnoj stranici (post_click_quality_score) dostupna je samo na resursu 'keyword_view' ili 'ad_group_criterion'.",
    note: "Dijagnostika ključnih reči.",
  },

  // Video metrike nisu podržane na keyword_view
  {
    field: "metrics.video_views",
    allowedResources: ["campaign", "ad_group", "ad_group_ad", "customer", "video"],
    reason:
      "Video metrike (metrics.video_views) nisu dostupne na resursu 'keyword_view'.",
    note: "Ključne reči na pretrazi ne generišu video preglede.",
  },
];

/**
 * 3. ZAVISNOSTI MEĐU SEGMENTIMA
 * Neki segmenti zahtevaju prisustvo drugog segmenta ili polja u upitu.
 */
export const SEGMENT_DEPENDENCIES: readonly SegmentDependencyRule[] = [
  {
    segment: "segments.hour",
    requiresFieldOrSegment: "segments.date",
    reason:
      "Segmentacija po satu ('segments.hour') zahteva da u upitu ili WHERE filteru bude uključen i datum ('segments.date').",
    note: "Google Ads API zahteva datumski kontekst pri segmentiranju po satu.",
  },
];

/**
 * Rezultat provere kompatibilnosti GAQL upita.
 */
export type GaqlComboCheckResult =
  | { allowed: true }
  | { allowed: false; reason: string };

/**
 * Normalizuje naziv polja/segmenta/metrike za proveru.
 */
function normalizeFieldName(f: string): string {
  return f.trim().toLowerCase();
}

/**
 * Proverava da li je zadata kombinacija FROM resursa i polja/segmenata dozvoljena po pravilima GAQL-a.
 *
 * Pravila:
 *   1. U FROM ide tačno JEDAN resurs (nema JOIN, nema zareza, nema višestrukih reči).
 *   2. Provera zabranjenih kombinacija segmenata (npr. age_range + gender).
 *   3. Provera kompatibilnosti polja i metrika sa izabranim resursom.
 *   4. Provera obaveznih zavisnosti segmenata (npr. hour traži date).
 *
 * Razlog je uvek na srpskom jeziku i razumljiv korisniku.
 */
export function isGaqlComboAllowed(
  resource: string,
  fields: string[],
): GaqlComboCheckResult {
  // 1. Provera resursa (tačno jedan resurs, bez JOIN ili zareza)
  if (!resource || typeof resource !== "string") {
    return {
      allowed: false,
      reason: "FROM klauzula mora sadržati tačno jedan resurs (naziv resursa ne sme biti prazan).",
    };
  }

  const cleanResource = resource.trim().toLowerCase();

  if (
    cleanResource.includes(",") ||
    /\bjoin\b/i.test(cleanResource) ||
    cleanResource.includes(" ") ||
    cleanResource.includes("\t") ||
    cleanResource.includes("\n")
  ) {
    return {
      allowed: false,
      reason:
        "GAQL podržava tačno jedan resurs u FROM klauzuli. Višestruki resursi, razdvajanje zarezom ili JOIN operacije nisu dozvoljeni u Google Ads API-ju.",
    };
  }

  const normalizedFields = fields.map(normalizeFieldName);

  // 2. Provera zabranjenih kombinacija segmenata
  for (const rule of PROHIBITED_SEGMENT_COMBINATIONS) {
    const presentCount = rule.segments.filter((seg) => {
      const segNorm = normalizeFieldName(seg);
      const segShort = segNorm.replace(/^segments\./, "");
      return normalizedFields.some(
        (f) =>
          f === segNorm ||
          f === segShort ||
          f.endsWith(`.${segShort}`) ||
          f.includes(segNorm),
      );
    }).length;

    if (presentCount === rule.segments.length) {
      return {
        allowed: false,
        reason: rule.reason,
      };
    }
  }

  // 3. Provera kompatibilnosti polja i resursa
  for (const rule of RESOURCE_FIELD_RESTRICTIONS) {
    const ruleFieldNorm = normalizeFieldName(rule.field);
    const ruleFieldShort = ruleFieldNorm
      .replace(/^metrics\./, "")
      .replace(/^segments\./, "");

    const isFieldRequested = normalizedFields.some(
      (f) =>
        f === ruleFieldNorm ||
        f === ruleFieldShort ||
        f === `metrics.${ruleFieldShort}` ||
        f === `segments.${ruleFieldShort}`,
    );

    if (isFieldRequested) {
      const isAllowed = rule.allowedResources.some(
        (r) => cleanResource === normalizeFieldName(r),
      );
      if (!isAllowed) {
        return {
          allowed: false,
          reason: rule.reason,
        };
      }
    }
  }

  // 4. Provera zavisnosti segmenata (npr. hour zahteva date)
  for (const rule of SEGMENT_DEPENDENCIES) {
    const segNorm = normalizeFieldName(rule.segment);
    const segShort = segNorm.replace(/^segments\./, "");

    const isSegmentRequested = normalizedFields.some(
      (f) => f === segNorm || f === segShort || f === `segments.${segShort}`,
    );

    if (isSegmentRequested) {
      const reqNorm = normalizeFieldName(rule.requiresFieldOrSegment);
      const reqShort = reqNorm.replace(/^segments\./, "");

      const hasRequired = normalizedFields.some(
        (f) => f === reqNorm || f === reqShort || f === `segments.${reqShort}`,
      );

      if (!hasRequired) {
        return {
          allowed: false,
          reason: rule.reason,
        };
      }
    }
  }

  return { allowed: true };
}

// ── Graditelj GAQL Upita (B3) ───────────────────────────────────────────────

export interface BuildGaqlQueryParams {
  resource: string;
  fields: string[];
  segments?: string[];
  dateRange?:
    | {
        startDate: string; // "YYYY-MM-DD"
        endDate: string; // "YYYY-MM-DD"
      }
    | {
        start: string; // "YYYY-MM-DD"
        end: string; // "YYYY-MM-DD"
      };
  where?: string | string[];
  limit?: number;
  orderBy?: string | { field: string; direction?: "ASC" | "DESC" };
}

/**
 * Validira datumski format YYYY-MM-DD.
 */
function isValidDateFormat(dateStr: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim());
}

/**
 * Sastavlja sintaksno i semantički validan GAQL upit.
 *
 * Pravila:
 *   - Proverava kompatibilnost preko `isGaqlComboAllowed`. Ako kombinacija nije dozvoljena,
 *     baca Error sa opisnim razlogom na srpskom.
 *   - Nikada ne sastavlja upit sa dva resursa u FROM.
 *   - Datumi se formatiraju u standardni GAQL oblik: `segments.date BETWEEN 'YYYY-MM-DD' AND 'YYYY-MM-DD'`.
 */
export function buildGaqlQuery(params: BuildGaqlQueryParams): string {
  const { resource, fields, segments, dateRange, where, limit, orderBy } = params;

  if (!resource || typeof resource !== "string") {
    throw new Error("GAQL upit zahteva definisan resurs u FROM klauzuli.");
  }

  const allFields: string[] = [...fields, ...(segments ?? [])];

  // Ako postoji dateRange, proveravamo format i po potrebi dodajemo segments.date u kontekst provere
  let dateCondition: string | undefined = undefined;
  if (dateRange) {
    const startDate = "startDate" in dateRange ? dateRange.startDate : dateRange.start;
    const endDate = "endDate" in dateRange ? dateRange.endDate : dateRange.end;

    if (!isValidDateFormat(startDate) || !isValidDateFormat(endDate)) {
      throw new Error(
        `Neispravan format datuma za GAQL: "${startDate}" / "${endDate}". Očekuje se "YYYY-MM-DD".`,
      );
    }

    if (startDate > endDate) {
      throw new Error(
        `Početni datum (${startDate}) ne može biti nakon krajnjeg datuma (${endDate}).`,
      );
    }

    dateCondition = `segments.date BETWEEN '${startDate}' AND '${endDate}'`;
  }

  // Ako u WHERE klauzuli ima segments.date ili je dateCondition aktivan, dodajemo ga u kontekst
  const checkFields = [...allFields];
  if (dateCondition || (typeof where === "string" && where.includes("segments.date"))) {
    if (!checkFields.includes("segments.date") && !checkFields.includes("date")) {
      checkFields.push("segments.date");
    }
  }

  // Pre-flight provera kompatibilnosti
  const check = isGaqlComboAllowed(resource, checkFields);
  if (!check.allowed) {
    throw new Error(check.reason);
  }

  // 1. SELECT klauzula
  const selectTokens = Array.from(new Set(allFields.map((f) => f.trim())));
  if (selectTokens.length === 0) {
    throw new Error("GAQL upit mora sadržati bar jedno polje u SELECT klauzuli.");
  }
  const selectClause = `SELECT ${selectTokens.join(", ")}`;

  // 2. FROM klauzula (tačno jedan resurs)
  const fromClause = `FROM ${resource.trim()}`;

  // 3. WHERE klauzula
  const whereConditions: string[] = [];
  if (where) {
    if (Array.isArray(where)) {
      for (const w of where) {
        if (w && w.trim()) whereConditions.push(w.trim());
      }
    } else if (typeof where === "string" && where.trim()) {
      whereConditions.push(where.trim());
    }
  }
  if (dateCondition) {
    whereConditions.push(dateCondition);
  }

  const whereClause =
    whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

  // 4. ORDER BY klauzula
  let orderClause = "";
  if (orderBy) {
    if (typeof orderBy === "string" && orderBy.trim()) {
      orderClause = `ORDER BY ${orderBy.trim()}`;
    } else if (typeof orderBy === "object" && orderBy.field) {
      const dir = orderBy.direction === "DESC" ? "DESC" : "ASC";
      orderClause = `ORDER BY ${orderBy.field.trim()} ${dir}`;
    }
  }

  // 5. LIMIT klauzula
  let limitClause = "";
  if (limit !== undefined && limit !== null) {
    if (!Number.isInteger(limit) || limit < 0) {
      throw new Error(`Neispravna LIMIT vrednost: "${limit}". Očekuje se pozitivan ceo broj.`);
    }
    limitClause = `LIMIT ${limit}`;
  }

  const queryParts = [selectClause, fromClause, whereClause, orderClause, limitClause].filter(
    (p) => p.length > 0,
  );

  return queryParts.join(" ");
}
