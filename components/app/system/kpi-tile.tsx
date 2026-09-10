"use client";

import type { ComponentType } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CountUp } from "@/components/motion/count-up";
import type { MetricState } from "@/convex/lib/igMetrics";
import { cn } from "@/lib/utils";

/**
 * ============================================================================
 * KPI PLOČICA — jedna za celu aplikaciju (A1 §3)
 * ============================================================================
 *
 * Natpis, brojka, poređenje sa prethodnim periodom i sparklinija. Vlasnik je
 * ovaj fajl; `components/app/analytics/kpi-tile.tsx` samo prosleđuje, da 10
 * postojećih uvoza ostane netaknuto.
 *
 * POŠTENO POREĐENJE. Izmereno 9.9.2026: 7/7 pločica na Kontrolnoj tabli i
 * 5/5 na Instagramu ispisivalo je „— — vs prethodnih 28 d" — prazan red pune
 * veličine, dvadeset puta kroz aplikaciju. Sada:
 *
 *   - poređenje se crta SAMO kad delta postoji (broj, ne null/undefined);
 *   - bez poređenja red ne postoji; umesto njega stoji `note` ako pozivalac
 *     ima šta da kaže („od 3 ukupno", „zbir za period"), inače ništa;
 *   - visina pločice je uvek ista (h-40), pa mreža ostaje ravna kad jedna
 *     pločica ima poređenje a susedna nema.
 *
 * Tri stanja mere (G1): kad `state` nije `"value"`, umesto broja stoji crtica
 * i razlog — nula i „nema podatka" nikad ne izgledaju isto.
 *
 * Brojka je `font-mono` + `tabular-nums` na `text-metric` (28 px), po pravilu
 * projekta za metričke brojeve; `primary` označava jedinu pločicu na ekranu
 * koja sme da nosi cijan.
 */
export type KpiDelta =
  | { kind: "pct"; value: number | null | undefined }
  | { kind: "pp"; value: number | null | undefined };

export function KpiTile({
  label,
  value,
  format,
  delta,
  formatDelta,
  compareLabel,
  note,
  spark = [],
  primary = false,
  state = "value",
  reason,
}: {
  label: string;
  value: number | undefined;
  format: (v: number) => string;
  /** Promena u odnosu na prethodni period. `value` null/undefined = nema poređenja. */
  delta?: KpiDelta;
  formatDelta?: (v: number) => string;
  /** „vs prethodnih 28 d" — crta se samo uz stvarnu deltu. */
  compareLabel?: string;
  /** Jedna linija kad poređenja nema („od 3 ukupno"). Opciono. */
  note?: string;
  spark?: (number | undefined)[];
  primary?: boolean;
  state?: MetricState;
  reason?: string;
}) {
  if (state !== "value" || value === undefined) {
    return (
      <Card className="gap-0 py-0 shadow-card ring-line" size="sm">
        <div className="flex h-40 flex-col px-5 pt-4">
          <p className="heading-caps text-meta font-medium text-text-muted">
            {label}
          </p>
          <span className="mt-2 block font-mono text-metric font-bold leading-none text-text-muted tabular-nums">
            —
          </span>
          <p className="mt-3 text-ui leading-relaxed text-text-muted">
            {reason ??
              (state === "suppressed"
                ? "Nedovoljno podataka za prikaz."
                : state === "unavailable"
                  ? "Podatak nije dostupan za ovaj period."
                  : "Merenje ove metrike je početo kasnije; stariji dani nemaju podatak.")}
          </p>
        </div>
      </Card>
    );
  }

  const d = delta?.value;
  const hasComparison =
    d !== null && d !== undefined && Number.isFinite(d) && formatDelta !== undefined;
  const tone =
    !hasComparison || Math.abs(d) < 1e-9 ? "neutral" : d > 0 ? "up" : "down";
  const DeltaIcon =
    tone === "up" ? ArrowUpRight : tone === "down" ? ArrowDownRight : Minus;
  const hasSpark = spark.some((v) => v !== undefined && v !== null);

  return (
    <Card className="gap-0 py-0 shadow-card ring-line" size="sm">
      <div className="flex h-40 flex-col px-5 pt-4 pb-4">
        <p className="heading-caps text-meta font-medium text-text-muted">
          {label}
        </p>
        <CountUp
          value={value}
          format={format}
          className={cn(
            "mt-2 block font-mono text-metric font-bold leading-none",
            primary ? "text-accent-400" : "text-foreground",
          )}
        />
        {hasComparison ? (
          <div className="mt-2 flex items-baseline gap-1.5 text-ui">
            <span
              className={cn(
                "inline-flex items-center gap-0.5 font-mono tabular-nums",
                tone === "up" && "text-success",
                tone === "down" && "text-danger",
                tone === "neutral" && "text-text-muted",
              )}
            >
              <DeltaIcon className="size-3.5" aria-hidden />
              {formatDelta(d)}
            </span>
            {compareLabel && <span className="text-text-muted">{compareLabel}</span>}
          </div>
        ) : note ? (
          <p className="mt-2 text-ui text-text-muted">{note}</p>
        ) : null}
        {hasSpark && (
          <Sparkline
            values={spark}
            className={cn(
              "mt-auto",
              primary ? "text-accent-400" : "text-foreground/45",
            )}
          />
        )}
      </div>
    </Card>
  );
}

/**
 * KPI bez poređenja i bez linije: mera koja za period postoji samo kao zbir.
 * Niža je od `KpiTile` tačno za sparkliniju — red sa istim ovakvim pločicama
 * ne laže praznim prostorom.
 */
export function StatTile({
  label,
  value,
  format,
  note,
  icon: Icon,
  valueClassName,
}: {
  label: string;
  value: number | undefined;
  format: (v: number) => string;
  /** Šta broj znači — jedna linija, bez ponavljanja natpisa. */
  note: string;
  icon: ComponentType<{ className?: string }>;
  valueClassName?: string;
}) {
  return (
    <Card className="gap-0 py-0 shadow-card ring-line" size="sm">
      <div className="flex h-32 flex-col justify-between px-5 py-4">
        <div className="flex items-center justify-between gap-2">
          <p className="heading-caps text-meta font-medium text-text-muted">
            {label}
          </p>
          <Icon className="size-4 shrink-0 text-text-muted" aria-hidden />
        </div>
        <div>
          {value !== undefined ? (
            <CountUp
              value={value}
              format={format}
              className={cn(
                "block font-mono text-metric font-bold leading-none",
                valueClassName ?? "text-foreground",
              )}
            />
          ) : (
            <span className="block font-mono text-metric font-bold leading-none text-text-muted tabular-nums">
              —
            </span>
          )}
          <p className="mt-1.5 text-ui text-text-muted">{note}</p>
        </div>
      </div>
    </Card>
  );
}

export function StatTileSkeleton() {
  return (
    <Card className="gap-0 py-0 shadow-card ring-line" size="sm">
      <div className="flex h-32 flex-col justify-between px-5 py-4">
        <Skeleton className="h-3 w-24" />
        <div>
          <Skeleton className="h-8 w-28" />
          <Skeleton className="mt-2 h-3 w-32" />
        </div>
      </div>
    </Card>
  );
}

/** Isti otisak kao učitana pločica — podaci ništa ne pomeraju. */
export function KpiTileSkeleton() {
  return (
    <Card className="gap-0 py-0 shadow-card ring-line" size="sm">
      <div className="flex h-40 flex-col px-5 pt-4">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="mt-3 h-8 w-28" />
        <Skeleton className="mt-3 h-3 w-32" />
        <Skeleton className="mt-auto mb-4 h-8 w-full" />
      </div>
    </Card>
  );
}

const SPARK_W = 100;
const SPARK_H = 32;

/**
 * Inline SVG sparklinija — fiksan viewBox razvučen na širinu pločice, pa ne
 * meri ništa i ne treperi. Prekida liniju preko dana bez podatka (nema nule,
 * nema interpolacije).
 */
function Sparkline({
  values,
  className,
}: {
  values: (number | undefined)[];
  className?: string;
}) {
  const defined = values.filter((v): v is number => v !== undefined && v !== null);
  if (defined.length === 0) return null;

  const max = Math.max(1, ...defined);
  const n = values.length;

  const segments: Array<Array<[number, number]>> = [];
  let currentSegment: Array<[number, number]> = [];

  values.forEach((v, i) => {
    if (v !== undefined && v !== null) {
      const x = n === 1 ? SPARK_W / 2 : (i / (n - 1)) * SPARK_W;
      const y = SPARK_H - 2 - (v / max) * (SPARK_H - 4);
      currentSegment.push([x, y]);
    } else if (currentSegment.length > 0) {
      segments.push(currentSegment);
      currentSegment = [];
    }
  });
  if (currentSegment.length > 0) segments.push(currentSegment);

  return (
    <svg
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      preserveAspectRatio="none"
      className={cn("h-8 w-full", className)}
      aria-hidden
    >
      {segments.map((seg, sIdx) => {
        if (seg.length === 0) return null;
        if (seg.length === 1) {
          const [cx, cy] = seg[0];
          return <circle key={sIdx} cx={cx} cy={cy} r={1.5} fill="currentColor" />;
        }
        const line = seg.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
        const firstX = seg[0][0].toFixed(2);
        const lastX = seg[seg.length - 1][0].toFixed(2);
        const area = `M${firstX},${SPARK_H} L${line.replace(/ /g, " L")} L${lastX},${SPARK_H} Z`;
        return (
          <g key={sIdx}>
            <path d={area} fill="currentColor" fillOpacity={0.08} />
            <polyline
              points={line}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        );
      })}
    </svg>
  );
}
