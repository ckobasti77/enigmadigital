"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { cn } from "@/lib/utils";

export type KpiDelta =
  | { kind: "pct"; value: number | null }
  | { kind: "pp"; value: number };

/**
 * One KPI: label, big Aeonik numeral, delta vs the previous equal period, and
 * a sparkline of the current period. `primary` marks the one metric that may
 * wear cyan (Sessions); every other tile stays in foreground ink.
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
}: {
  label: string;
  value: number;
  format: (v: number) => string;
  delta: KpiDelta;
  formatDelta: (v: number) => string;
  compareLabel: string;
  spark: number[];
  primary?: boolean;
}) {
  const d = delta.value;
  const tone =
    d === null || Math.abs(d) < 1e-9
      ? "neutral"
      : d > 0
        ? "up"
        : "down";
  const DeltaIcon =
    tone === "up" ? ArrowUpRight : tone === "down" ? ArrowDownRight : Minus;

  return (
    <Card className="gap-0 py-0 shadow-card ring-line" size="sm">
      <div className="flex h-40 flex-col px-5 pt-4">
        <p className="heading-caps text-xs font-medium text-text-muted">
          {label}
        </p>
        <AnimatedNumber
          value={value}
          format={format}
          className={cn(
            "mt-2 block text-2xl font-bold leading-none tracking-tight sm:text-3xl",
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
            {d === null ? "—" : formatDelta(d)}
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
 * (it doesn't move).
 */
function Sparkline({
  values,
  className,
}: {
  values: number[];
  className?: string;
}) {
  const max = Math.max(1, ...values);
  const n = values.length;
  const pts = values.map((v, i) => {
    const x = n === 1 ? SPARK_W / 2 : (i / (n - 1)) * SPARK_W;
    const y = SPARK_H - 2 - (v / max) * (SPARK_H - 4);
    return [x, y] as const;
  });
  const line = pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const area =
    pts.length > 0
      ? `M0,${SPARK_H} L${line.replace(/ /g, " L")} L${SPARK_W},${SPARK_H} Z`
      : "";

  return (
    <svg
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      preserveAspectRatio="none"
      className={cn("h-8 w-full", className)}
      aria-hidden
    >
      {pts.length > 1 && (
        <>
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
        </>
      )}
    </svg>
  );
}
