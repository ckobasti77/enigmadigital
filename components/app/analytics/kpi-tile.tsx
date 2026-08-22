"use client";

import type { ComponentType } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CountUp } from "@/components/motion/count-up";
import type { MetricState } from "@/convex/lib/igMetrics";
import { cn } from "@/lib/utils";

export type KpiDelta =
  | { kind: "pct"; value: number | null | undefined }
  | { kind: "pp"; value: number | null | undefined };

/**
 * One KPI: label, big Aeonik numeral, delta vs the previous equal period, and
 * a sparkline of the current period. `primary` marks the one metric that may
 * wear cyan (Sessions); every other tile stays in foreground ink.
 *
 * `state` nosi model tri stanja (G1): kada mera nije `"value"`, pločica NE
 * prikazuje nulu — nula i „nema podatka" nikad ne smeju da izgledaju isto.
 * Umesto broja stoji crtica i razlog, bez delte i bez linije (poređenje i
 * trend ne postoje kad nema vrednosti). Podrazumevano `"value"`, pa sve
 * postojeće pločice rade nepromenjeno.
 */
export function KpiTile({
  label,
  value,
  format,
  delta,
  formatDelta,
  compareLabel,
  spark,
  primary = false,
  state = "value",
  reason,
}: {
  label: string;
  value: number | undefined;
  format: (v: number) => string;
  delta: KpiDelta;
  formatDelta: (v: number) => string;
  compareLabel: string;
  spark: (number | undefined)[];
  primary?: boolean;
  state?: MetricState;
  reason?: string;
}) {
  if (state !== "value" || value === undefined) {
    return (
      <Card className="gap-0 py-0 shadow-card ring-line" size="sm">
        <div className="flex h-40 flex-col px-5 pt-4">
          <p className="heading-caps text-micro font-medium text-text-muted">
            {label}
          </p>
          <span className="mt-2 block text-2xl font-semibold leading-none text-text-muted sm:text-3xl">
            —
          </span>
          <p className="mt-3 text-xs leading-relaxed text-text-muted">
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

  const d = delta.value;
  const tone =
    d === null || d === undefined || Math.abs(d) < 1e-9
      ? "neutral"
      : d > 0
        ? "up"
        : "down";
  const DeltaIcon =
    tone === "up" ? ArrowUpRight : tone === "down" ? ArrowDownRight : Minus;

  return (
    <Card className="gap-0 py-0 shadow-card ring-line" size="sm">
      <div className="flex h-40 flex-col px-5 pt-4">
        <p className="heading-caps text-micro font-medium text-text-muted">
          {label}
        </p>
        <CountUp
          value={value}
          format={format}
          className={cn(
            "mt-2 block text-2xl font-bold leading-none sm:text-3xl",
            primary ? "text-accent-400" : "text-foreground",
          )}
        />
        <div className="mt-2 flex items-baseline gap-1.5 text-xs">
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-mono tabular-nums",
              tone === "up" && "text-success",
              tone === "down" && "text-danger",
              tone === "neutral" && "text-text-muted",
            )}
          >
            <DeltaIcon className="size-3.5" aria-hidden />
            {d === null || d === undefined ? "—" : formatDelta(d)}
          </span>
          <span className="text-text-muted">{compareLabel}</span>
        </div>
        <Sparkline
          values={spark}
          className={cn(
            "mt-auto mb-4",
            primary ? "text-accent-400" : "text-foreground/45",
          )}
        />
      </div>
    </Card>
  );
}

/**
 * KPI bez poređenja: mera koja za izabrani period postoji samo kao zbir, pa
 * nema ni prethodni period ni dnevnu liniju. Niža je od `KpiTile` za tačno
 * onoliko koliko bi zauzela sparklinija — prazan prostor bi lagao da nešto
 * nedostaje.
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
          <p className="heading-caps text-micro font-medium text-text-muted">
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
                "block font-mono text-2xl font-bold leading-none sm:text-3xl",
                valueClassName ?? "text-foreground",
              )}
            />
          ) : (
            <span
              className={cn(
                "block font-mono text-2xl font-bold leading-none sm:text-3xl text-text-muted",
              )}
            >
              —
            </span>
          )}
          <p className="mt-1.5 text-xs text-text-muted">{note}</p>
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

/** Same footprint as a loaded tile, so data arriving doesn't shift the grid. */
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
 * Inline SVG sparkline — fixed viewBox stretched to the tile width, so it
 * needs no measurement and can't cause a resize flash. Reduced-motion safe
 * (it doesn't move). Breaks line across undefined days (no 0, no interpolation).
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
    } else {
      if (currentSegment.length > 0) {
        segments.push(currentSegment);
        currentSegment = [];
      }
    }
  });
  if (currentSegment.length > 0) {
    segments.push(currentSegment);
  }

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
          return (
            <circle
              key={sIdx}
              cx={cx}
              cy={cy}
              r={1.5}
              fill="currentColor"
            />
          );
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
