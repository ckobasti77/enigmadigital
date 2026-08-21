"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface RankingDataPoint {
  name: string;
  value: number;
}

const displayNames =
  typeof Intl !== "undefined" && typeof Intl.DisplayNames !== "undefined"
    ? new Intl.DisplayNames(["sr-Latn-RS", "sr-RS", "sr"], { type: "region" })
    : null;

function resolveLocationName(raw: string, isCountry: boolean): string {
  if (!isCountry) return raw;
  if (raw === "Ostalo") return "Ostalo";
  if (raw.length === 2 && displayNames) {
    try {
      const localized = displayNames.of(raw.toUpperCase());
      if (localized) return localized;
    } catch {
      // Fall back to raw code
    }
  }
  return raw;
}

/**
 * Demographics ranking list (Top 10 + "Ostalo").
 *
 * Rules:
 *   - Single series -> NO legend, title names it.
 *   - Top 10 + "Ostalo" (remainder), sorted descending.
 *   - 4px rounded ends on horizontal bars.
 *   - Color: --chart-1.
 *   - Text uses semantic text tokens, never series color.
 */
export function DemographicsRankingList({
  title,
  subtitle,
  data,
  isCountry = false,
  className,
}: {
  title: string;
  subtitle?: string;
  data: RankingDataPoint[];
  isCountry?: boolean;
  className?: string;
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const { items, total, maxValue } = useMemo(() => {
    const sorted = [...data].sort((a, b) => b.value - a.value);
    const sumTotal = sorted.reduce((sum, item) => sum + item.value, 0);

    const top10 = sorted.slice(0, 10);
    const remainder = sorted.slice(10);
    const remainderSum = remainder.reduce((sum, item) => sum + item.value, 0);

    const result = top10.map((item, idx) => ({
      rank: idx + 1,
      name: resolveLocationName(item.name, isCountry),
      value: item.value,
      pct: sumTotal > 0 ? item.value / sumTotal : 0,
    }));

    if (remainderSum > 0) {
      result.push({
        rank: 11,
        name: "Ostalo",
        value: remainderSum,
        pct: sumTotal > 0 ? remainderSum / sumTotal : 0,
      });
    }

    const max = result.length > 0 ? Math.max(...result.map((r) => r.value)) : 1;

    return {
      items: result,
      total: Math.max(1, sumTotal),
      maxValue: Math.max(1, max),
    };
  }, [data, isCountry]);

  if (items.length === 0) {
    return (
      <Card className={cn("flex flex-col p-6 shadow-card ring-line", className)}>
        <p className="heading-caps text-micro font-medium text-text-muted">
          {subtitle ?? "Rang lista"}
        </p>
        <h2 className="mt-1 text-lg font-semibold text-foreground">{title}</h2>
        <p className="mt-6 text-sm text-text-muted">Nema podataka za prikaz.</p>
      </Card>
    );
  }

  return (
    <Card className={cn("flex flex-col p-6 shadow-card ring-line", className)}>
      <div className="flex items-center justify-between">
        <div>
          <p className="heading-caps text-micro font-medium text-text-muted">
            {subtitle ?? "Rang lista"}
          </p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">{title}</h2>
        </div>
        <span className="font-mono text-xs font-medium text-text-muted">
          Ukupno: {formatNumber(total)}
        </span>
      </div>

      <div className="mt-6 flex flex-col gap-2.5">
        {items.map((item, idx) => {
          const widthPct = (item.value / maxValue) * 100;
          const isHovered = hoveredIdx === idx;

          return (
            <div
              key={`${item.name}-${idx}`}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              className={cn(
                "group flex flex-col gap-1 rounded-xs p-1.5 transition-colors",
                isHovered ? "bg-surface-raised" : "bg-transparent",
              )}
            >
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-5 shrink-0 font-mono text-text-muted">
                    {item.name === "Ostalo" ? "—" : `${item.rank}.`}
                  </span>
                  <span
                    className={cn(
                      "truncate font-medium",
                      item.name === "Ostalo" ? "text-text-muted italic" : "text-foreground",
                    )}
                  >
                    {item.name}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0 font-mono">
                  <span className="text-foreground font-semibold">
                    {formatNumber(item.value)}
                  </span>
                  <span className="w-11 text-right text-text-muted">
                    ({formatPercent(item.pct)})
                  </span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-2 w-full rounded-[4px] bg-line-soft overflow-hidden">
                <div
                  className="h-full rounded-[4px] transition-all"
                  style={{
                    width: `${Math.max(2, widthPct)}%`,
                    backgroundColor: "var(--chart-1)",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export function DemographicsRankingSkeleton() {
  return (
    <Card className="flex flex-col p-6 shadow-card ring-line">
      <div className="space-y-2">
        <div className="h-3 w-20 animate-pulse rounded-xs bg-line" />
        <div className="h-6 w-32 animate-pulse rounded-xs bg-line" />
      </div>
      <div className="mt-6 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <div className="flex justify-between">
              <div className="h-3.5 w-28 animate-pulse rounded-xs bg-line" />
              <div className="h-3.5 w-16 animate-pulse rounded-xs bg-line" />
            </div>
            <div className="h-2 w-full animate-pulse rounded-[4px] bg-line/50" />
          </div>
        ))}
      </div>
    </Card>
  );
}
