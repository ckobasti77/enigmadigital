"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface AgeGenderDataPoint {
  age: string;
  gender: string; // "F" | "M" | "U"
  value: number;
}

const STANDARD_AGE_GROUPS = [
  "13-17",
  "18-24",
  "25-34",
  "35-44",
  "45-54",
  "55-64",
  "65+",
] as const;

/**
 * Population pyramid chart (Uzrast × pol).
 *
 * Rules:
 *   - Mirrored around a central axis (one gender left, other right).
 *   - Age groups ordered bottom-up (13-17 at bottom, 65+ at top).
 *   - Colors: --chart-1 (Žene / F) and --chart-2 (Muškarci / M), --chart-3 (Nepoznato / U).
 *   - Outer ends rounded with 4px radius, anchored straight to axis.
 *   - 2px gap between adjacent rows.
 *   - Legend required.
 *   - Hover tooltip per bar showing count and percentage.
 */
export function PopulationPyramidChart({
  data,
  className,
}: {
  data: AgeGenderDataPoint[];
  className?: string;
}) {
  const [hovered, setHovered] = useState<{
    age: string;
    gender: "F" | "M" | "U";
    value: number;
    pct: number;
  } | null>(null);

  // Group and structure data
  const { rows, totalF, totalM, totalU, grandTotal, maxSingleValue } = useMemo(() => {
    let tF = 0;
    let tM = 0;
    let tU = 0;

    const byGroup = new Map<string, { F: number; M: number; U: number }>();

    for (const item of data) {
      const g = item.gender.toUpperCase();
      const group = byGroup.get(item.age) ?? { F: 0, M: 0, U: 0 };
      if (g === "F") {
        group.F += item.value;
        tF += item.value;
      } else if (g === "M") {
        group.M += item.value;
        tM += item.value;
      } else {
        group.U += item.value;
        tU += item.value;
      }
      byGroup.set(item.age, group);
    }

    // Determine all age groups (standard or discovered)
    const discovered = Array.from(byGroup.keys());
    const orderedAges = [
      ...STANDARD_AGE_GROUPS.filter((ag) => discovered.includes(ag)),
      ...discovered.filter((ag) => !STANDARD_AGE_GROUPS.includes(ag as (typeof STANDARD_AGE_GROUPS)[number])),
    ];

    // Bottom-up display: 65+ at top, 13-17 at bottom
    // We render from top to bottom, so top is 65+ down to 13-17
    const displayAges = [...orderedAges].reverse();

    const rowList = displayAges.map((age) => {
      const g = byGroup.get(age) ?? { F: 0, M: 0, U: 0 };
      return {
        age,
        F: g.F,
        M: g.M,
        U: g.U,
      };
    });

    const maxVal = rowList.reduce(
      (max, r) => Math.max(max, r.F, r.M, r.U),
      1,
    );

    const gTotal = tF + tM + tU;
    return {
      rows: rowList,
      totalF: tF,
      totalM: tM,
      totalU: tU,
      grandTotal: Math.max(1, gTotal),
      maxSingleValue: maxVal,
    };
  }, [data]);

  const hasU = totalU > 0;

  return (
    <Card className={cn("flex flex-col gap-6 p-6 shadow-card ring-line", className)}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="heading-caps text-micro font-medium text-text-muted">
            Struktura publike
          </p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">
            Uzrast i pol
          </h2>
        </div>

        {/* Legend — Mandatory */}
        <div className="flex flex-wrap items-center gap-4 text-xs font-medium">
          <div className="flex items-center gap-1.5">
            <span
              className="size-3 rounded-xs"
              style={{ backgroundColor: "var(--chart-1)" }}
              aria-hidden
            />
            <span className="text-text-secondary">
              Žene ({formatPercent(totalF / grandTotal)})
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className="size-3 rounded-xs"
              style={{ backgroundColor: "var(--chart-2)" }}
              aria-hidden
            />
            <span className="text-text-secondary">
              Muškarci ({formatPercent(totalM / grandTotal)})
            </span>
          </div>
          {hasU && (
            <div className="flex items-center gap-1.5">
              <span
                className="size-3 rounded-xs"
                style={{ backgroundColor: "var(--chart-3)" }}
                aria-hidden
              />
              <span className="text-text-secondary">
                Nepoznato ({formatPercent(totalU / grandTotal)})
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Population Pyramid Grid */}
      <div className="relative flex flex-col gap-1.5 pt-2">
        {/* Hover info banner */}
        <div className="h-6 text-xs text-text-muted">
          {hovered ? (
            <span className="inline-flex items-center gap-2">
              <span className="font-semibold text-foreground">
                {hovered.gender === "F"
                  ? "Žene"
                  : hovered.gender === "M"
                    ? "Muškarci"
                    : "Nepoznato"}
                , {hovered.age} god:
              </span>
              <span className="font-mono text-foreground font-medium">
                {formatNumber(hovered.value)}
              </span>
              <span className="font-mono text-text-muted">
                ({formatPercent(hovered.pct)})
              </span>
            </span>
          ) : (
            <span>Pređite mišem preko stubića za detalje</span>
          )}
        </div>

        <div className="flex flex-col gap-1">
          {rows.map((row) => {
            const fPct = row.F / grandTotal;
            const mPct = row.M / grandTotal;
            const fWidthPct = (row.F / maxSingleValue) * 100;
            const mWidthPct = (row.M / maxSingleValue) * 100;

            return (
              <div
                key={row.age}
                className="grid grid-cols-[1fr_5rem_1fr] items-center gap-2"
              >
                {/* Left Side: Žene (F) extending from center to left */}
                <div className="flex items-center justify-end gap-2">
                  <span className="font-mono text-[11px] tabular-nums text-text-muted">
                    {row.F > 0 ? formatPercent(fPct) : ""}
                  </span>
                  <div className="relative h-6.5 w-full max-w-[180px] sm:max-w-none flex justify-end">
                    <div
                      onMouseEnter={() =>
                        setHovered({
                          age: row.age,
                          gender: "F",
                          value: row.F,
                          pct: fPct,
                        })
                      }
                      onMouseLeave={() => setHovered(null)}
                      className={cn(
                        "h-full rounded-l-[4px] transition-opacity cursor-pointer",
                        hovered && hovered.age === row.age && hovered.gender === "F"
                          ? "opacity-100 ring-1 ring-accent-400"
                          : "opacity-90 hover:opacity-100",
                      )}
                      style={{
                        width: `${Math.max(row.F > 0 ? 3 : 0, fWidthPct)}%`,
                        backgroundColor: "var(--chart-1)",
                      }}
                    />
                  </div>
                </div>

                {/* Center: Age Group Label */}
                <div className="flex items-center justify-center rounded-xs bg-surface-raised py-1 text-center font-mono text-xs font-medium text-text-primary">
                  {row.age}
                </div>

                {/* Right Side: Muškarci (M) extending from center to right */}
                <div className="flex items-center justify-start gap-2">
                  <div className="relative h-6.5 w-full max-w-[180px] sm:max-w-none flex justify-start">
                    <div
                      onMouseEnter={() =>
                        setHovered({
                          age: row.age,
                          gender: "M",
                          value: row.M,
                          pct: mPct,
                        })
                      }
                      onMouseLeave={() => setHovered(null)}
                      className={cn(
                        "h-full rounded-r-[4px] transition-opacity cursor-pointer",
                        hovered && hovered.age === row.age && hovered.gender === "M"
                          ? "opacity-100 ring-1 ring-accent-400"
                          : "opacity-90 hover:opacity-100",
                      )}
                      style={{
                        width: `${Math.max(row.M > 0 ? 3 : 0, mWidthPct)}%`,
                        backgroundColor: "var(--chart-2)",
                      }}
                    />
                  </div>
                  <span className="font-mono text-[11px] tabular-nums text-text-muted">
                    {row.M > 0 ? formatPercent(mPct) : ""}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

export function PopulationPyramidSkeleton() {
  return (
    <Card className="flex flex-col gap-6 p-6 shadow-card ring-line">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-3 w-28 animate-pulse rounded-xs bg-line" />
          <div className="h-6 w-36 animate-pulse rounded-xs bg-line" />
        </div>
        <div className="h-4 w-40 animate-pulse rounded-xs bg-line" />
      </div>
      <div className="space-y-2 py-4">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="grid grid-cols-[1fr_5rem_1fr] items-center gap-2"
          >
            <div className="h-6.5 w-full animate-pulse rounded-l-[4px] bg-line/40" />
            <div className="h-6.5 w-full animate-pulse rounded-xs bg-line" />
            <div className="h-6.5 w-full animate-pulse rounded-r-[4px] bg-line/40" />
          </div>
        ))}
      </div>
    </Card>
  );
}
