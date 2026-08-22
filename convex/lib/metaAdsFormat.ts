import type { MetaMetricDef } from "./metaAdsCatalog";

/**
 * ============================================================================
 * META ADS METRIC FORMATTER (MA2)
 * ============================================================================
 *
 * Pure formatting functions for Meta Ads metrics.
 * Modeled after `convex/lib/ga4Format.ts`.
 * Shared between backend and frontend — NO imports from convex/_generated or React.
 * ============================================================================
 */

export const LOCALE = "sr-Latn-RS";

const integerFmt = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const decimalFmt = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const ratePercentFmt = new Intl.NumberFormat(LOCALE, {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const metaPercentFmt = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Formats a metric value according to its definition in MetaMetricDef.
 *
 * @param value Raw numerical value (or undefined / null)
 * @param def MetaMetricDef containing explicit unit, source, and higherIsBetter
 * @param currencyCode ISO currency code (e.g. "EUR", "USD", "RSD") from adAccounts.currency.
 *                     If not provided, the number is formatted without a currency symbol (never fallback to RSD).
 */
export function formatMetric(
  value: number | undefined | null,
  def: MetaMetricDef,
  currencyCode?: string,
): string {
  if (value === undefined || value === null || !Number.isFinite(value)) {
    return "—";
  }

  switch (def.unit) {
    case "percent":
      if (def.source === "meta") {
        // Meta returns percentage as 0-100 (e.g. 2.45 for 2.45%), do NOT multiply by 100
        return `${metaPercentFmt.format(value)} %`;
      }
      // Derived percentage (e.g. hookRate, holdRate = 0.25 for 25%)
      return ratePercentFmt.format(value);

    case "currency":
      if (!currencyCode || !currencyCode.trim()) {
        // If currency is unknown, format as decimal without symbol
        return decimalFmt.format(value);
      }
      try {
        return new Intl.NumberFormat(LOCALE, {
          style: "currency",
          currency: currencyCode.trim(),
        }).format(value);
      } catch {
        return `${decimalFmt.format(value)} ${currencyCode.trim()}`;
      }

    case "ratio":
      return decimalFmt.format(value);

    case "count":
    default:
      return integerFmt.format(value);
  }
}

/**
 * Formats a ranking enum string (quality_ranking, engagement_rate_ranking, conversion_rate_ranking)
 * into a Serbian localized label and whether it is a known ranking.
 *
 * @param raw Raw ranking enum from Meta Graph API
 *            ("ABOVE_AVERAGE", "AVERAGE", "BELOW_AVERAGE_35", "BELOW_AVERAGE_20", "BELOW_AVERAGE_10", "UNKNOWN")
 */
export function formatRanking(raw?: string): { label: string; known: boolean } {
  if (!raw || raw === "UNKNOWN") {
    return { label: "—", known: false };
  }

  switch (raw) {
    case "ABOVE_AVERAGE":
      return { label: "iznad proseka", known: true };
    case "AVERAGE":
      return { label: "prosek", known: true };
    case "BELOW_AVERAGE_35":
      return { label: "ispod proseka (donjih 35%)", known: true };
    case "BELOW_AVERAGE_20":
      return { label: "ispod proseka (donjih 20%)", known: true };
    case "BELOW_AVERAGE_10":
      return { label: "ispod proseka (donjih 10%)", known: true };
    default:
      return { label: "—", known: false };
  }
}
