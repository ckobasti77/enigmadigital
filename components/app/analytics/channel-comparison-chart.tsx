"use client";

import { useMemo, useState } from "react";
import { AlertCircle } from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartCard, ChartLegend } from "./chart-card";
import { MetricValue, metricFormat } from "./metric-state";
import { cn } from "@/lib/utils";

type ChannelData = FunctionReturnType<typeof api.analytics.acquisitionByChannel>;

const FIRST = "var(--chart-1)";
const SESSION = "var(--chart-2)";
const fmtCount = metricFormat("sessions");

/**
 * Poređenje kanala u dva opsega: prvi dodir (firstUsers → chart-1) i ova poseta
 * (sessions → chart-2). Dve serije → legenda obavezna; boja prati opseg (entitet),
 * ne rang. „—" i isprekidana traka kada vrednost nije stigla; bedž kada je prag.
 */
export function ChannelComparisonChart({ data }: { data: ChannelData }) {
  const [hovered, setHovered] = useState<number | null>(null);

  const maxVal = useMemo(() => {
    let max = 1;
    for (const r of data.rows) {
      max = Math.max(max, r.firstUsers ?? 0, r.sessions ?? 0);
    }
    return max;
  }, [data.rows]);

  return (
    <ChartCard
      title="Poređenje opsega: prvi dodir vs ova poseta"
      description="Prvi dodir meri akviziciju novih korisnika; ova poseta meri trenutni saobraćaj i povratak."
      legend={
        <ChartLegend
          items={[
            { color: FIRST, label: "Prvi dodir (korisnik)" },
            { color: SESSION, label: "Ova poseta (sesija)" },
          ]}
        />
      }
      empty={
        data.rows.length === 0
          ? "Nema podataka o kanalima u izabranom periodu."
          : undefined
      }
    >
      <div className="flex flex-col gap-3">
        {data.rows.map((row, idx) => {
          const firstW =
            row.firstUsers !== undefined ? (row.firstUsers / maxVal) * 100 : 0;
          const sessionW =
            row.sessions !== undefined ? (row.sessions / maxVal) * 100 : 0;
          return (
            <div
              key={`${row.channel}-${idx}`}
              onMouseEnter={() => setHovered(idx)}
              onMouseLeave={() => setHovered(null)}
              className={cn(
                "flex flex-col gap-2 rounded-md p-3 transition-colors",
                hovered === idx ? "bg-surface-raised/60" : "bg-transparent",
              )}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    {row.channel}
                  </span>
                  {row.state === "thresholded" && (
                    <span
                      className="inline-flex items-center gap-1 rounded bg-warning/10 px-1.5 py-0.5 text-micro font-medium text-warning"
                      title="GA4 je primenio prag privatnosti na podatke ovog kanala."
                    >
                      <AlertCircle className="size-3" />
                      Prag primenjen
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-4 text-xs">
                  <span className="flex items-center gap-1.5">
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: FIRST }}
                      aria-hidden
                    />
                    <span className="text-text-muted">Korisnici:</span>
                    <MetricValue
                      value={row.firstUsers}
                      format={fmtCount}
                      className="font-semibold text-foreground"
                    />
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: SESSION }}
                      aria-hidden
                    />
                    <span className="text-text-muted">Sesije:</span>
                    <MetricValue
                      value={row.sessions}
                      format={fmtCount}
                      className="font-semibold text-foreground"
                    />
                  </span>
                </div>
              </div>

              <PairedBar label="Prvi dodir" width={firstW} color={FIRST} defined={row.firstUsers !== undefined} />
              <PairedBar label="Ova poseta" width={sessionW} color={SESSION} defined={row.sessions !== undefined} />
            </div>
          );
        })}
      </div>
    </ChartCard>
  );
}

function PairedBar({
  label,
  width,
  color,
  defined,
}: {
  label: string;
  width: number;
  color: string;
  defined: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-micro text-text-muted">{label}</span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-[4px] bg-line-soft">
        {defined ? (
          <div
            className="h-full rounded-[4px]"
            style={{
              width: `${Math.max(width > 0 ? 1 : 0, width)}%`,
              backgroundColor: color,
            }}
          />
        ) : (
          <div className="h-full w-full rounded-[4px] border border-dashed border-line-soft" />
        )}
      </div>
    </div>
  );
}

export function ChannelComparisonSkeleton() {
  return (
    <Card className="gap-0 py-0 shadow-card ring-line">
      <div className="flex items-start justify-between px-5 pt-5 pb-3">
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="space-y-4 px-5 pb-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-2.5 w-full rounded-[4px]" />
            <Skeleton className="h-2.5 w-full rounded-[4px]" />
          </div>
        ))}
      </div>
    </Card>
  );
}
