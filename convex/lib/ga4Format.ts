import type { Ga4MetricDef, ResolvedMetric } from "./ga4Catalog";

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
const ratePercentFmt = new Intl.NumberFormat(LOCALE, {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/**
 * Format duration in seconds to Serbian representation:
 *   - Under 1 min: "45 s"
 *   - Under 1 hr: "2 min 14 s" or "5 min"
 *   - 1 hr and over: "1 h 03 min" or "2 h"
 */
function formatSecondsDuration(totalSeconds: number): string {
  const sec = Math.max(0, Math.round(totalSeconds));
  if (sec < 60) return `${sec} s`;

  if (sec < 3600) {
    const min = Math.floor(sec / 60);
    const remSec = sec % 60;
    return remSec > 0 ? `${min} min ${remSec} s` : `${min} min`;
  }

  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  return minutes > 0
    ? `${hours} h ${String(minutes).padStart(2, "0")} min`
    : `${hours} h`;
}

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
      return ratePercentFmt.format(value);

    case "duration":
      if (def.type === "TYPE_MILLISECONDS") {
        return formatSecondsDuration(value / 1000);
      }
      if (def.type === "TYPE_MINUTES") {
        return formatSecondsDuration(value * 60);
      }
      if (def.type === "TYPE_HOURS") {
        return formatSecondsDuration(value * 3600);
      }
      return formatSecondsDuration(value);

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
