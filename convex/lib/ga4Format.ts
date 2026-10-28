import type { Ga4MetricDef, ResolvedMetric } from "./ga4Catalog";
import { procenat, trajanje } from "./formatJezgro";

/**
 * ============================================================================
 * GA4 METRIC FORMATTER (A2/A3)
 * ============================================================================
 *
 * Pure formatting functions for GA4 metrics and dimensions.
 * Shared between backend and frontend — NO imports from convex/_generated or React.
 * ============================================================================
 */

export const LOCALE = "sr-Latn-RS";

const integerFmt = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const decimalFmt = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Formats a metric value according to its definition in Ga4MetricDef / ResolvedMetric.
 *
 * @param value Raw numerical value
 * @param def Ga4MetricDef or ResolvedMetric containing explicit unit & type
 * @param currencyCode ISO currency code (e.g. "RSD", "EUR", "USD") for currency unit
 */
export function formatMetric(
  value: number,
  def: Ga4MetricDef | ResolvedMetric,
  currencyCode?: string,
): string {
  if (!Number.isFinite(value)) return "—";

  switch (def.unit) {
    case "percent":
      return procenat(value);

    case "duration":
      if (def.type === "TYPE_MILLISECONDS") {
        return trajanje(value / 1000);
      }
      if (def.type === "TYPE_MINUTES") {
        return trajanje(value * 60);
      }
      if (def.type === "TYPE_HOURS") {
        return trajanje(value * 3600);
      }
      return trajanje(value);

    case "currency":
      if (!currencyCode) {
        return decimalFmt.format(value);
      }
      return new Intl.NumberFormat(LOCALE, {
        style: "currency",
        currency: currencyCode,
      }).format(value);

    case "ratio":
      return decimalFmt.format(value);

    case "count":
    default:
      if (def.type === "TYPE_FLOAT") {
        return decimalFmt.format(value);
      }
      if (def.type === "TYPE_FEET") {
        return `${integerFmt.format(value)} ft`;
      }
      if (def.type === "TYPE_MILES") {
        return `${decimalFmt.format(value)} mi`;
      }
      if (def.type === "TYPE_METERS") {
        return `${integerFmt.format(value)} m`;
      }
      if (def.type === "TYPE_KILOMETERS") {
        return `${decimalFmt.format(value)} km`;
      }
      return integerFmt.format(value);
  }
}
