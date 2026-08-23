/**
 * ============================================================================
 * GOOGLE ADS FORMATTING & LOCALIZATION HELPERS (GA5)
 * ============================================================================
 *
 * Provides formatters for Quality Score attributes, components, search term
 * statuses, and match types with Serbian localization.
 *
 * Rules:
 *   - Quality score components are enums, NEVER numbers, and NEVER summed (B2).
 *   - "UNKNOWN" and absence of value return { label: "—", known: false }.
 *   - They are NEVER mapped to "ispod proseka".
 *   - Pure functions only — offline testable.
 * ============================================================================
 */

export interface FormattedQualityComponent {
  readonly label: string;
  readonly known: boolean;
}

/**
 * Formats Quality Score component enum into Serbian localized label and known status.
 *
 * Applicable to:
 *   - creative_quality_score (Ad Relevance)
 *   - post_click_quality_score (Landing Page Experience)
 *   - search_predicted_ctr (Expected CTR)
 *
 * Enum values from Google Ads API:
 *   "ABOVE_AVERAGE" | "AVERAGE" | "BELOW_AVERAGE" | "UNKNOWN" | "UNSPECIFIED"
 */
export function formatQualityComponent(raw?: string | null): FormattedQualityComponent {
  if (!raw || typeof raw !== "string") {
    return { label: "—", known: false };
  }

  const clean = raw.trim().toUpperCase();

  switch (clean) {
    case "ABOVE_AVERAGE":
      return { label: "iznad proseka", known: true };
    case "AVERAGE":
      return { label: "prosek", known: true };
    case "BELOW_AVERAGE":
      return { label: "ispod proseka", known: true };
    case "UNKNOWN":
    case "UNSPECIFIED":
    default:
      return { label: "—", known: false };
  }
}

/**
 * Alias for formatQualityComponent for consistency.
 */
export const formatQualityScoreComponent = formatQualityComponent;

/**
 * Formats an integer Quality Score (1..10) into a display string.
 *
 * Rules:
 *   - Missing / undefined / null -> "—" or "Nepoznato"
 *   - 1..10 -> "X/10"
 *   - 0 is treated as unknown / invalid (B1)
 */
export function formatQualityScore(score?: number | null): string {
  if (
    score === undefined ||
    score === null ||
    typeof score !== "number" ||
    !Number.isFinite(score) ||
    score < 1 ||
    score > 10
  ) {
    return "—";
  }
  return `${Math.round(score)}/10`;
}

export interface FormattedSearchTermStatus {
  readonly label: string;
  readonly raw: string;
}

/**
 * Formats search_term_view.status enum into Serbian description.
 *
 * Statuses:
 *   - ADDED: search term is already added as a keyword
 *   - EXCLUDED: search term is added as a negative keyword
 *   - NONE: not yet added or excluded
 */
export function formatSearchTermStatus(status?: string | null): FormattedSearchTermStatus {
  const raw = String(status || "NONE").toUpperCase();
  switch (raw) {
    case "ADDED":
      return { label: "Dodato kao ključna reč", raw: "ADDED" };
    case "EXCLUDED":
      return { label: "Isključeno (negativna)", raw: "EXCLUDED" };
    case "NONE":
      return { label: "Nije obrađeno", raw: "NONE" };
    default:
      return { label: "Nepoznato", raw: raw || "UNKNOWN" };
  }
}

export interface FormattedMatchType {
  readonly label: string;
  readonly symbol: string;
  readonly raw: string;
}

/**
 * Formats keyword or search term match type enum into localized representation.
 */
export function formatMatchType(matchType?: string | null): FormattedMatchType {
  const raw = String(matchType || "BROAD").toUpperCase();
  switch (raw) {
    case "EXACT":
      return { label: "Tačno podudaranje", symbol: "[reč]", raw: "EXACT" };
    case "PHRASE":
      return { label: "Podudaranje fraze", symbol: '"reč"', raw: "PHRASE" };
    case "BROAD":
      return { label: "Široko podudaranje", symbol: "reč", raw: "BROAD" };
    case "NEAR_EXACT":
      return { label: "Približno tačno", symbol: "[reč]~", raw: "NEAR_EXACT" };
    case "NEAR_PHRASE":
      return { label: "Približna fraza", symbol: '"reč"~', raw: "NEAR_PHRASE" };
    default:
      return { label: "Široko", symbol: "reč", raw };
  }
}

export interface FormattedDeviceType {
  readonly label: string;
  readonly known: boolean;
  readonly raw: string;
}

/**
 * Formats Google Ads segments.device enum into Serbian label and known flag (GA6 B2).
 *
 * Values: MOBILE, DESKTOP, TABLET, CONNECTED_TV, OTHER, UNKNOWN, UNSPECIFIED
 * Rules:
 *   - "OTHER" and "UNKNOWN" are NOT dropped or merged with anything else.
 *   - "UNKNOWN" and missing values give { known: false }.
 */
export function formatDeviceType(raw?: string | null): FormattedDeviceType {
  if (!raw || typeof raw !== "string") {
    return { label: "—", known: false, raw: "UNKNOWN" };
  }

  const clean = raw.trim().toUpperCase();

  switch (clean) {
    case "MOBILE":
      return { label: "Mobilni telefoni", known: true, raw: "MOBILE" };
    case "DESKTOP":
      return { label: "Računari", known: true, raw: "DESKTOP" };
    case "TABLET":
      return { label: "Tableti", known: true, raw: "TABLET" };
    case "CONNECTED_TV":
      return { label: "Smart TV (Connected TV)", known: true, raw: "CONNECTED_TV" };
    case "OTHER":
      return { label: "Ostalo", known: true, raw: "OTHER" };
    case "UNKNOWN":
    case "UNSPECIFIED":
    default:
      return { label: "Nepoznato", known: false, raw: clean || "UNKNOWN" };
  }
}

export interface FormattedDayOfWeek {
  readonly label: string;
  readonly known: boolean;
  readonly raw: string;
}

/**
 * Formats Google Ads segments.day_of_week enum into localized Serbian name (GA6 B3).
 */
export function formatDayOfWeek(raw?: string | null): FormattedDayOfWeek {
  if (!raw || typeof raw !== "string") {
    return { label: "Nepoznato", known: false, raw: "UNKNOWN" };
  }

  const clean = raw.trim().toUpperCase();

  switch (clean) {
    case "MONDAY":
      return { label: "Ponedeljak", known: true, raw: "MONDAY" };
    case "TUESDAY":
      return { label: "Utorak", known: true, raw: "TUESDAY" };
    case "WEDNESDAY":
      return { label: "Sreda", known: true, raw: "WEDNESDAY" };
    case "THURSDAY":
      return { label: "Četvrtak", known: true, raw: "THURSDAY" };
    case "FRIDAY":
      return { label: "Petak", known: true, raw: "FRIDAY" };
    case "SATURDAY":
      return { label: "Subota", known: true, raw: "SATURDAY" };
    case "SUNDAY":
      return { label: "Nedelja", known: true, raw: "SUNDAY" };
    default:
      return { label: "Nepoznato", known: false, raw: clean || "UNKNOWN" };
  }
}

export interface FormattedAgeRange {
  readonly label: string;
  readonly known: boolean;
  readonly raw: string;
}

/**
 * Formats age_range_view demographic criteria into Serbian label (GA6 B4).
 *
 * Rules:
 *   - UNDETERMINED / UNKNOWN is valid and often large; it must be preserved.
 */
export function formatAgeRange(raw?: string | null): FormattedAgeRange {
  if (!raw || typeof raw !== "string") {
    return { label: "Nepoznato", known: false, raw: "UNKNOWN" };
  }

  const clean = raw.trim().toUpperCase().replace(/^AGE_RANGE_/, "");

  switch (clean) {
    case "18_24":
    case "18-24":
      return { label: "18–24", known: true, raw: "AGE_RANGE_18_24" };
    case "25_34":
    case "25-34":
      return { label: "25–34", known: true, raw: "AGE_RANGE_25_34" };
    case "35_44":
    case "35-44":
      return { label: "35–44", known: true, raw: "AGE_RANGE_35_44" };
    case "45_54":
    case "45-54":
      return { label: "45–54", known: true, raw: "AGE_RANGE_45_54" };
    case "55_64":
    case "55-64":
      return { label: "55–64", known: true, raw: "AGE_RANGE_55_64" };
    case "65_UP":
    case "65+":
    case "65_PLUS":
      return { label: "65+", known: true, raw: "AGE_RANGE_65_UP" };
    case "UNDETERMINED":
      return { label: "Neodređeno", known: true, raw: "UNDETERMINED" };
    case "UNKNOWN":
    case "UNSPECIFIED":
    default:
      return { label: "Nepoznato", known: false, raw: "UNKNOWN" };
  }
}

export interface FormattedGender {
  readonly label: string;
  readonly known: boolean;
  readonly raw: string;
}

/**
 * Formats gender_view demographic criteria into Serbian label (GA6 B4).
 *
 * Rules:
 *   - UNDETERMINED / UNKNOWN is valid and often large; it must be preserved.
 */
export function formatGender(raw?: string | null): FormattedGender {
  if (!raw || typeof raw !== "string") {
    return { label: "Nepoznato", known: false, raw: "UNKNOWN" };
  }

  const clean = raw.trim().toUpperCase().replace(/^GENDER_/, "");

  switch (clean) {
    case "MALE":
      return { label: "Muški", known: true, raw: "MALE" };
    case "FEMALE":
      return { label: "Ženski", known: true, raw: "FEMALE" };
    case "UNDETERMINED":
      return { label: "Neodređeno", known: true, raw: "UNDETERMINED" };
    case "UNKNOWN":
    case "UNSPECIFIED":
    default:
      return { label: "Nepoznato", known: false, raw: "UNKNOWN" };
  }
}

export interface FormattedLocationType {
  readonly label: string;
  readonly known: boolean;
  readonly raw: string;
}

/**
 * Formats geographic_view location type (GA6 B1).
 */
export function formatLocationType(raw?: string | null): FormattedLocationType {
  if (!raw || typeof raw !== "string") {
    return { label: "Nepoznato", known: false, raw: "UNKNOWN" };
  }

  const clean = raw.trim().toUpperCase();

  switch (clean) {
    case "LOCATION_OF_PRESENCE":
      return { label: "Fizička lokacija prisustva", known: true, raw: "LOCATION_OF_PRESENCE" };
    case "AREA_OF_INTEREST":
      return { label: "Područje interesovanja", known: true, raw: "AREA_OF_INTEREST" };
    default:
      return { label: "Nepoznato", known: false, raw: clean || "UNKNOWN" };
  }
}

export interface FormattedAssetPerformanceLabel {
  readonly label: string;
  readonly known: boolean;
  readonly raw: string;
}

/**
 * Formats ad_group_ad_asset_view.performance_label enum into localized label (GA7 B2).
 *
 * Values: BEST, GOOD, LOW, LEARNING, PENDING, UNKNOWN, UNSPECIFIED
 * Rules:
 *   - NIKAD ne mapiraj u broj i ne sortiraj kao ocenu.
 *   - LEARNING i PENDING znače "još se meri", NE "loše".
 *   - "UNKNOWN" ne nestaje iz rezultata i vraća { known: false }.
 */
export function formatAssetPerformanceLabel(
  raw?: string | null,
): FormattedAssetPerformanceLabel {
  if (!raw || typeof raw !== "string") {
    return { label: "Nepoznato", known: false, raw: "UNKNOWN" };
  }

  const clean = raw.trim().toUpperCase();

  switch (clean) {
    case "BEST":
      return { label: "Najbolje", known: true, raw: "BEST" };
    case "GOOD":
      return { label: "Dobro", known: true, raw: "GOOD" };
    case "LOW":
      return { label: "Nisko", known: true, raw: "LOW" };
    case "LEARNING":
      return { label: "Učenje (meri se)", known: false, raw: "LEARNING" };
    case "PENDING":
      return { label: "Na čekanju", known: false, raw: "PENDING" };
    case "UNKNOWN":
    case "UNSPECIFIED":
    default:
      return { label: "Nepoznato", known: false, raw: clean || "UNKNOWN" };
  }
}

export interface FormattedAssetFieldType {
  readonly label: string;
  readonly raw: string;
}

/**
 * Formats asset field_type enum into Serbian description (GA7 B4).
 */
export function formatAssetFieldType(raw?: string | null): FormattedAssetFieldType {
  if (!raw || typeof raw !== "string") {
    return { label: "Nepoznato", raw: "UNKNOWN" };
  }

  const clean = raw.trim().toUpperCase();

  switch (clean) {
    case "HEADLINE":
      return { label: "Naslov", raw: "HEADLINE" };
    case "DESCRIPTION":
      return { label: "Opis", raw: "DESCRIPTION" };
    case "MARKETING_IMAGE":
      return { label: "Marketinška slika", raw: "MARKETING_IMAGE" };
    case "SQUARE_MARKETING_IMAGE":
      return { label: "Kvadratna slika", raw: "SQUARE_MARKETING_IMAGE" };
    case "PORTRAIT_MARKETING_IMAGE":
      return { label: "Uspravna slika", raw: "PORTRAIT_MARKETING_IMAGE" };
    case "LOGO":
      return { label: "Logotip", raw: "LOGO" };
    case "LANDSCAPE_LOGO":
      return { label: "Položeni logotip", raw: "LANDSCAPE_LOGO" };
    case "CALL_TO_ACTION_SELECTION":
      return { label: "Poziv na akciju (CTA)", raw: "CALL_TO_ACTION_SELECTION" };
    case "BUSINESS_NAME":
      return { label: "Naziv preduzeća", raw: "BUSINESS_NAME" };
    case "SITELINK":
      return { label: "Sitelink (veza do stranice)", raw: "SITELINK" };
    case "CALLOUT":
      return { label: "Callout (istaknuti tekst)", raw: "CALLOUT" };
    case "STRUCTURED_SNIPPET":
      return { label: "Strukturisani isečak", raw: "STRUCTURED_SNIPPET" };
    case "CALL":
      return { label: "Telefonski poziv", raw: "CALL" };
    case "LEAD_FORM":
      return { label: "Obrazac za potencijalne klijente", raw: "LEAD_FORM" };
    case "PROMOTION":
      return { label: "Promocija", raw: "PROMOTION" };
    case "PRICE":
      return { label: "Cena", raw: "PRICE" };
    case "APP":
      return { label: "Aplikacija", raw: "APP" };
    case "HOTEL_CALLOUT":
      return { label: "Istaknuti detalji hotela", raw: "HOTEL_CALLOUT" };
    default:
      return { label: clean, raw: clean };
  }
}

export interface FormattedAssetType {
  readonly label: string;
  readonly raw: string;
}

/**
 * Formats asset.type enum into Serbian description (GA7 B4).
 */
export function formatAssetType(raw?: string | null): FormattedAssetType {
  if (!raw || typeof raw !== "string") {
    return { label: "Nepoznato", raw: "UNKNOWN" };
  }

  const clean = raw.trim().toUpperCase();

  switch (clean) {
    case "TEXT":
      return { label: "Tekst", raw: "TEXT" };
    case "IMAGE":
      return { label: "Slika", raw: "IMAGE" };
    case "YOUTUBE_VIDEO":
    case "VIDEO":
      return { label: "Video (YouTube)", raw: "YOUTUBE_VIDEO" };
    case "MEDIA_BUNDLE":
      return { label: "Medijski paket (HTML5/ZIP)", raw: "MEDIA_BUNDLE" };
    case "CALL":
      return { label: "Poziv", raw: "CALL" };
    case "SITELINK":
      return { label: "Sitelink", raw: "SITELINK" };
    case "CALLOUT":
      return { label: "Callout", raw: "CALLOUT" };
    case "STRUCTURED_SNIPPET":
      return { label: "Strukturisani isečak", raw: "STRUCTURED_SNIPPET" };
    case "LEAD_FORM":
      return { label: "Lead obrazac", raw: "LEAD_FORM" };
    case "PROMOTION":
      return { label: "Promocija", raw: "PROMOTION" };
    case "PRICE":
      return { label: "Cena", raw: "PRICE" };
    case "APP":
      return { label: "Aplikacija", raw: "APP" };
    default:
      return { label: clean, raw: clean };
  }
}

export interface AssetCombinationCoverageResult {
  readonly combinationImpressions: number;
  readonly totalImpressions: number;
  readonly hiddenImpressions: number;
  readonly coverageRatio: number | undefined;
  readonly coveragePct: number | undefined;
  readonly notice: string;
}

/**
 * Računa pokrivenost kombinacija asseta u odnosu na ukupne impresije oglasa (GA7 B3).
 *
 * Pravila:
 *   - Google ne prikazuje sve kombinacije, već samo one sa dovoljnim obimom.
 *   - Kad ukupan broj nije poznat ili je 0, coverageRatio i coveragePct su undefined (NIKAD 100).
 */
export function calculateAssetCombinationCoverage(
  combinationImpressions?: number | null,
  totalImpressions?: number | null,
): AssetCombinationCoverageResult {
  const safeCombinations = Math.max(
    0,
    combinationImpressions !== undefined &&
      combinationImpressions !== null &&
      Number.isFinite(combinationImpressions)
      ? combinationImpressions
      : 0,
  );
  const isTotalKnown =
    totalImpressions !== undefined &&
    totalImpressions !== null &&
    Number.isFinite(totalImpressions) &&
    totalImpressions > 0;

  const safeTotal = isTotalKnown ? (totalImpressions as number) : 0;
  const effectiveTotal = isTotalKnown ? Math.max(safeCombinations, safeTotal) : safeCombinations;
  const hiddenImpressions = isTotalKnown ? Math.max(0, effectiveTotal - safeCombinations) : 0;

  if (!isTotalKnown || effectiveTotal <= 0) {
    return {
      combinationImpressions: safeCombinations,
      totalImpressions: effectiveTotal,
      hiddenImpressions: 0,
      coverageRatio: undefined,
      coveragePct: undefined,
      notice:
        "Pokrivenost kombinacija asseta se ne može utvrditi jer ukupan broj impresija nije poznat ili je 0.",
    };
  }

  const coverageRatio = Number((safeCombinations / effectiveTotal).toFixed(4));
  const coveragePct = Number(((safeCombinations / effectiveTotal) * 100).toFixed(1));
  const notice = `Prikazano ${safeCombinations} od ${effectiveTotal} impresija kombinacija (${coveragePct}%). Google izostavlja kombinacije sa malim brojem prikaza radi zaštite privatnosti.`;

  return {
    combinationImpressions: safeCombinations,
    totalImpressions: effectiveTotal,
    hiddenImpressions,
    coverageRatio,
    coveragePct,
    notice,
  };
}
