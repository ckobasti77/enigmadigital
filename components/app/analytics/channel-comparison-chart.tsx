"use client";

import { useMemo, useState } from "react";
import { AlertCircle } from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

type ChannelData = FunctionReturnType<typeof api.analytics.acquisitionByChannel>;

/**
 * Channel comparison chart across two scopes:
 *   - First Touch: firstUserDefaultChannelGroup (firstUsers / firstNewUsers) -> --chart-1
 *   - This Visit: sessionDefaultChannelGroup (sessions) -> --chart-2
 *
 * Ordered descending by the larger of the two values.
 */
export function ChannelComparisonChart({ data }: { data: ChannelData }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const { rows, maxVal } = useMemo(() => {
    const list = data.rows;
    let max = 1;
    for (const r of list) {
      const v1 = r.firstUsers ?? 0;
      const v2 = r.sessions ?? 0;
      if (v1 > max) max = v1;
      if (v2 > max) max = v2;
    }
    return { rows: list, maxVal: max };
  }, [data.rows]);

  if (rows.length === 0) {
    return (
      <Card className="flex flex-col p-6 shadow-card ring-line">
        <p className="heading-caps text-micro font-medium text-text-muted">
          Poređenje kanala
        </p>
        <h2 className="mt-1 text-lg font-semibold text-foreground">
          Prvi dodir vs Ova poseta
        </h2>
        <p className="mt-6 text-sm text-text-muted">
          Nema podataka o kanalima u izabranom periodu.
        </p>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col p-6 shadow-card ring-line">
      {/* Header with Title and Legend */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="heading-caps text-micro font-medium text-text-muted">
            Grupe kanala
          </p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">
            Poređenje opsega: Prvi dodir vs Ova poseta
          </h2>
          <p className="mt-1 text-xs text-text-muted">
            Prvi dodir meri akviziciju novih korisnika, dok ova poseta meri
            trenutni saobraćaj i povratak.
          </p>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs font-medium">
          <div className="flex items-center gap-1.5">
            <span
              className="size-3 rounded-full"
              style={{ backgroundColor: "var(--chart-1)" }}
            />
            <span className="text-foreground">Prvi dodir (Korisnik)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className="size-3 rounded-full"
              style={{ backgroundColor: "var(--chart-2)" }}
            />
            <span className="text-foreground">Ova poseta (Sesija)</span>
          </div>
        </div>
      </div>

      {/* Paired Bar Rows */}
      <div className="mt-6 flex flex-col gap-4">
        {rows.map((row, idx) => {
          const firstVal = row.firstUsers;
          const sessionVal = row.sessions;
          const isHovered = hoveredIdx === idx;

          const firstWidth =
            firstVal !== undefined ? (firstVal / maxVal) * 100 : 0;
          const sessionWidth =
            sessionVal !== undefined ? (sessionVal / maxVal) * 100 : 0;

          return (
            <div
              key={`${row.channel}-${idx}`}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              className={cn(
                "group flex flex-col gap-2 rounded-md p-3 transition-colors",
                isHovered ? "bg-surface-raised" : "bg-transparent",
              )}
            >
              {/* Channel Label & Row KPIs */}
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-semibold text-foreground text-sm">
                    {row.channel}
                  </span>
                  {row.state === "thresholded" && (
                    <span
                      className="inline-flex items-center gap-1 rounded bg-warning/10 px-1.5 py-0.5 text-micro font-medium text-warning"
                      title="GA4 je primenio thresholding na podatke ovog kanala."
                    >
                      <AlertCircle className="size-3" />
                      Prag primenjen
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-4 shrink-0 font-mono text-xs">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: "var(--chart-1)" }}
                    />
                    <span className="text-text-muted">Korisnici:</span>
                    <span className="font-semibold text-foreground">
                      {firstVal !== undefined ? formatNumber(firstVal) : "—"}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: "var(--chart-2)" }}
                    />
                    <span className="text-text-muted">Sesije:</span>
                    <span className="font-semibold text-foreground">
                      {sessionVal !== undefined
                        ? formatNumber(sessionVal)
                        : "—"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Paired Bar 1: First Touch (--chart-1) */}
              <div className="flex items-center gap-2">
                <span className="w-20 shrink-0 text-micro text-text-muted">
                  Prvi dodir
                </span>
                <div className="h-2.5 flex-1 rounded-[4px] bg-line-soft overflow-hidden">
                  {firstVal !== undefined ? (
                    <div
                      className="h-full rounded-[4px] transition-all duration-300"
                      style={{
                        width: `${Math.max(firstWidth > 0 ? 1 : 0, firstWidth)}%`,
                        backgroundColor: "var(--chart-1)",
                      }}
                    />
                  ) : (
                    <div className="h-full w-full bg-line-soft/30 border border-dashed border-line rounded-[4px]" />
                  )}
                </div>
              </div>

              {/* Paired Bar 2: Session Touch (--chart-2) */}
              <div className="flex items-center gap-2">
                <span className="w-20 shrink-0 text-micro text-text-muted">
                  Ova poseta
                </span>
                <div className="h-2.5 flex-1 rounded-[4px] bg-line-soft overflow-hidden">
                  {sessionVal !== undefined ? (
                    <div
                      className="h-full rounded-[4px] transition-all duration-300"
                      style={{
                        width: `${Math.max(sessionWidth > 0 ? 1 : 0, sessionWidth)}%`,
                        backgroundColor: "var(--chart-2)",
                      }}
                    />
                  ) : (
                    <div className="h-full w-full bg-line-soft/30 border border-dashed border-line rounded-[4px]" />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export function ChannelComparisonSkeleton() {
  return (
    <Card className="flex flex-col p-6 shadow-card ring-line">
      <div className="flex justify-between items-start">
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-6 w-48" />
        </div>
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="mt-8 space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="flex justify-between">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-28" />
            </div>
            <Skeleton className="h-2.5 w-full rounded-[4px]" />
            <Skeleton className="h-2.5 w-full rounded-[4px]" />
          </div>
        ))}
      </div>
    </Card>
  );
}
