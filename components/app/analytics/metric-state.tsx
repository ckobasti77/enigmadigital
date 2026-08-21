import { GA4_METRIC_CATALOG, type Ga4ValueState } from "@/convex/lib/ga4Catalog";
import { formatMetric } from "@/convex/lib/ga4Format";
import { cn } from "@/lib/utils";

/**
 * ============================================================================
 * GA4 — jedan jezik za nepoznato (value / thresholded / unavailable)
 * ============================================================================
 *
 * Nula i „nema podatka" nikad ne smeju da izgledaju isto. GA4 ima tri stanja:
 *
 *   value        stigao je broj (uključujući stvarnu nulu) → prikaži broj.
 *   thresholded  GA4 je izostavio vrednost zbog praga privatnosti → „—" + razlog.
 *   unavailable  vrednost ne postoji za ovaj period/property → „—" + razlog.
 *
 * `KpiTile` (deljena, cela aplikacija) već crta „—" + razlog na nivou pločice
 * kroz svoj `state`/`reason` API — ovo je isti jezik za ćelije tabela i za
 * očitavanja grafikona, da svih osam ekrana govore jednako. Namerno NE dira
 * `MetricState` iz `convex/lib/igMetrics` (koji drugi kanali koriste).
 */

/** Znak za nepoznatu vrednost. Jedan, svuda. */
export const UNKNOWN = "—";

export type Ga4MetricKey = keyof typeof GA4_METRIC_CATALOG;

/**
 * Formatter jedne kolone/pločice — uvek kroz `formatMetric` + katalog, jedini
 * dogovoreni put do formatiranog broja. `currencyCode` samo za valutne metrike.
 */
export function metricFormat(key: Ga4MetricKey, currencyCode?: string) {
  const def = GA4_METRIC_CATALOG[key];
  return (v: number) => formatMetric(v, def, currencyCode);
}

/**
 * Standardni razlog za tooltip nad „—". `custom` (npr. „Deo dana nije dostupan
 * zbog praga") ima prednost kada mesto poziva zna nešto konkretnije.
 */
export function unknownReason(
  state: Exclude<Ga4ValueState, "value">,
  custom?: string,
): string {
  if (custom) return custom;
  return state === "thresholded"
    ? "GA4 je primenio prag privatnosti na ovu vrednost."
    : "Podatak nije dostupan za ovaj period.";
}

function isKnown(
  value: number | null | undefined,
  state?: Ga4ValueState,
): value is number {
  if (state !== undefined && state !== "value") return false;
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Jedna ćelija metrike. Poznata vrednost ide kroz `format`; nepoznata je „—" u
 * prigušenoj boji, sa razlogom u `title` — vizuelno različita od nule.
 * Podrazumevano poravnanje desno (brojčane kolone).
 */
export function MetricValue({
  value,
  state,
  format,
  reason,
  className,
}: {
  value: number | null | undefined;
  state?: Ga4ValueState;
  format: (v: number) => string;
  /** Konkretniji razlog za „—"; inače se izvodi iz `state`. */
  reason?: string;
  className?: string;
}) {
  if (isKnown(value, state)) {
    return (
      <span className={cn("font-mono tabular-nums", className)}>
        {format(value)}
      </span>
    );
  }
  const derived =
    state === "value" || state === undefined
      ? reason
      : unknownReason(state, reason);
  return (
    <span
      className={cn("font-mono tabular-nums text-text-muted", className)}
      title={derived}
    >
      {UNKNOWN}
    </span>
  );
}
