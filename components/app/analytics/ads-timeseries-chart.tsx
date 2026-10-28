"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatNumber, formatShortDate, formatLongDate } from "@/lib/format";

export interface AdsDailyPoint {
  date: string;
  cost: number;
  clicks: number;
  impressions?: number;
  sessions: number;
  engagedSessions?: number;
  keyEvents: number;
  state: "value" | "thresholded" | "unavailable";
}

const CHART_H = 120;
const CHART_W = 600;
const PAD_L = 50;
const PAD_R = 15;
const PAD_T = 10;
const PAD_B = 25;
const PLOT_W = CHART_W - PAD_L - PAD_R;
const PLOT_H = CHART_H - PAD_T - PAD_B;

export function AdsTimeseriesChart({
  data,
  currencyCode,
}: {
  data: AdsDailyPoint[];
  currencyCode?: string;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const { points, maxCost, maxKeyEvents } = useMemo(() => {
    const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
    let topCost = 0;
    let topEvents = 0;
    for (const d of sorted) {
      if (d.cost > topCost) topCost = d.cost;
      if (d.keyEvents > topEvents) topEvents = d.keyEvents;
    }
    return {
      points: sorted,
      maxCost: Math.max(10, topCost),
      maxKeyEvents: Math.max(5, topEvents),
    };
  }, [data]);

  const n = points.length;

  // Compute SVG coords for Cost and KeyEvents
  const costCoords = useMemo(() => {
    if (n === 0) return [];
    return points.map((p, i) => {
      const x = PAD_L + (n === 1 ? PLOT_W / 2 : (i / (n - 1)) * PLOT_W);
      const y = PAD_T + PLOT_H - (p.cost / maxCost) * PLOT_H;
      return { x, y, point: p };
    });
  }, [points, maxCost, n]);

  const eventCoords = useMemo(() => {
    if (n === 0) return [];
    return points.map((p, i) => {
      const x = PAD_L + (n === 1 ? PLOT_W / 2 : (i / (n - 1)) * PLOT_W);
      const y = PAD_T + PLOT_H - (p.keyEvents / maxKeyEvents) * PLOT_H;
      return { x, y, point: p };
    });
  }, [points, maxKeyEvents, n]);

  const costPath = costCoords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" L ");
  const costArea =
    costCoords.length > 0
      ? `M ${PAD_L},${PAD_T + PLOT_H} L ${costPath} L ${(PAD_L + PLOT_W).toFixed(1)},${PAD_T + PLOT_H} Z`
      : "";

  const eventPath = eventCoords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" L ");
  const eventArea =
    eventCoords.length > 0
      ? `M ${PAD_L},${PAD_T + PLOT_H} L ${eventPath} L ${(PAD_L + PLOT_W).toFixed(1)},${PAD_T + PLOT_H} Z`
      : "";

  const activePoint = hoverIndex !== null && points[hoverIndex] ? points[hoverIndex] : null;
  const hoverX = hoverIndex !== null && costCoords[hoverIndex] ? costCoords[hoverIndex].x : null;

  // Generate 4-5 ticks on X axis
  const xTicks = useMemo(() => {
    if (n <= 1) return [];
    // Ravnomerno, sa prvim i poslednjim danom: oznake od 12 px se na telefonu
    // ne smeju sudariti (korak + nasilno dodat kraj je davao par na kraju ose).
    const count = Math.min(6, n);
    const indices = new Set<number>();
    for (let k = 0; k < count; k++) indices.add(Math.round((k * (n - 1)) / (count - 1)));
    return Array.from(indices).sort((a, b) => a - b);
  }, [n]);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const svgX = (clientX / rect.width) * CHART_W;
    const relX = svgX - PAD_L;
    if (relX < 0 || relX > PLOT_W || n <= 1) {
      if (n === 1) setHoverIndex(0);
      return;
    }
    const idx = Math.min(n - 1, Math.max(0, Math.round((relX / PLOT_W) * (n - 1))));
    setHoverIndex(idx);
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
  };

  if (points.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center p-12 text-center shadow-card ring-line">
        <p className="text-sm font-medium text-foreground">Nema podataka za prikaz grafikona</p>
        <p className="mt-1 text-xs text-text-muted">Izaberite drugi vremenski period.</p>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-4 p-5 shadow-card ring-line">
      {/* Header and Legend */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line-soft pb-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Trend potrošnje i ključnih događaja
          </h3>
          <p className="mt-0.5 text-xs text-text-muted">
            Dva sinhronizovana grafikona sa zajedničkom vremenskom osom i nišanom.
          </p>
        </div>

        {/* Dynamic Hover Tooltip Banner */}
        {activePoint ? (
          <div className="flex flex-wrap items-center gap-4 rounded-lg bg-surface-raised px-3 py-1.5 text-xs tabular-nums shadow-xs">
            <span className="font-semibold text-foreground">{formatLongDate(activePoint.date)}:</span>
            <span className="flex items-center gap-1.5 text-foreground">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--chart-1)]" />
              {formatCurrency(activePoint.cost, currencyCode)}
            </span>
            <span className="flex items-center gap-1.5 text-foreground">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--chart-2)]" />
              {formatNumber(activePoint.keyEvents)} klj. dog.
            </span>
            <span className="text-text-muted">
              ({formatNumber(activePoint.clicks)} klikova · {formatNumber(activePoint.sessions)} sesija)
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--chart-1)]" />
              <span className="text-foreground">
                Potrošnja{currencyCode ? ` (${currencyCode})` : ""}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--chart-2)]" />
              <span className="text-foreground">Ključni događaji</span>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {/* Top Chart: Cost */}
        <div className="relative flex flex-col">
          <div className="flex items-center justify-between px-1 text-meta font-medium text-text-muted">
            <span>Potrošnja{currencyCode ? ` (${currencyCode})` : ""}</span>
            <span className="tabular-nums">{formatCurrency(maxCost, currencyCode)}</span>
          </div>
          <div className="relative h-28 w-full">
            <svg
              className="h-full w-full overflow-visible"
              viewBox={`0 0 ${CHART_W} ${CHART_H}`}
              preserveAspectRatio="none"
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
            >
              {/* Grid Lines */}
              {[0, 0.5, 1].map((ratio) => {
                const y = PAD_T + PLOT_H * (1 - ratio);
                return (
                  <g key={ratio}>
                    <line
                      x1={PAD_L}
                      y1={y}
                      x2={PAD_L + PLOT_W}
                      y2={y}
                      stroke="currentColor"
                      className="text-line-soft"
                      strokeDasharray="3 3"
                      strokeWidth="1"
                    />
                  </g>
                );
              })}

              {/* Area & Line */}
              <path d={costArea} fill="var(--chart-1)" fillOpacity={0.12} />
              <path
                d={`M ${costPath}`}
                fill="none"
                stroke="var(--chart-1)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Crosshair on hover */}
              {hoverX !== null && (
                <line
                  x1={hoverX}
                  y1={PAD_T}
                  x2={hoverX}
                  y2={PAD_T + PLOT_H}
                  stroke="currentColor"
                  className="text-text-secondary"
                  strokeDasharray="2 2"
                  strokeWidth="1.5"
                />
              )}

              {/* Hover dot */}
              {hoverIndex !== null && costCoords[hoverIndex] && (
                <circle
                  cx={costCoords[hoverIndex].x}
                  cy={costCoords[hoverIndex].y}
                  r="4.5"
                  fill="var(--chart-1)"
                  stroke="var(--background)"
                  strokeWidth="2"
                />
              )}
            </svg>
            <OznakeY max={maxCost} />
          </div>
        </div>

        {/* Bottom Chart: Key Events */}
        <div className="relative flex flex-col">
          <div className="flex items-center justify-between px-1 text-meta font-medium text-text-muted">
            <span>Ključni događaji</span>
            <span className="tabular-nums">{formatNumber(maxKeyEvents)}</span>
          </div>
          <div className="relative h-28 w-full">
            <svg
              className="h-full w-full overflow-visible"
              viewBox={`0 0 ${CHART_W} ${CHART_H}`}
              preserveAspectRatio="none"
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
            >
              {/* Grid Lines */}
              {[0, 0.5, 1].map((ratio) => {
                const y = PAD_T + PLOT_H * (1 - ratio);
                return (
                  <g key={ratio}>
                    <line
                      x1={PAD_L}
                      y1={y}
                      x2={PAD_L + PLOT_W}
                      y2={y}
                      stroke="currentColor"
                      className="text-line-soft"
                      strokeDasharray="3 3"
                      strokeWidth="1"
                    />
                  </g>
                );
              })}

              {/* Area & Line */}
              <path d={eventArea} fill="var(--chart-2)" fillOpacity={0.12} />
              <path
                d={`M ${eventPath}`}
                fill="none"
                stroke="var(--chart-2)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Crosshair on hover */}
              {hoverX !== null && (
                <line
                  x1={hoverX}
                  y1={PAD_T}
                  x2={hoverX}
                  y2={PAD_T + PLOT_H}
                  stroke="currentColor"
                  className="text-text-secondary"
                  strokeDasharray="2 2"
                  strokeWidth="1.5"
                />
              )}

              {/* Hover dot */}
              {hoverIndex !== null && eventCoords[hoverIndex] && (
                <circle
                  cx={eventCoords[hoverIndex].x}
                  cy={eventCoords[hoverIndex].y}
                  r="4.5"
                  fill="var(--chart-2)"
                  stroke="var(--background)"
                  strokeWidth="2"
                />
              )}
            </svg>
            <OznakeY max={maxKeyEvents} />
            <div aria-hidden className="pointer-events-none absolute inset-0">
              {xTicks.map((idx) => {
                const c = eventCoords[idx];
                if (!c) return null;
                return (
                  <span
                    key={idx}
                    className="absolute -translate-x-1/2 whitespace-nowrap text-meta tabular-nums text-text-muted"
                    style={{
                      left: `${(c.x / CHART_W) * 100}%`,
                      top: `${((PAD_T + PLOT_H + 5) / CHART_H) * 100}%`,
                    }}
                  >
                    {formatShortDate(points[idx].date)}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

/**
 * Oznake ose Y kao HTML sloj preko grafikona. SVG je
 * `preserveAspectRatio="none"`, pa bi se njegov tekst na telefonu sabio ispod
 * 12 px i razvukao; pozicija je procenat viewBox-a.
 */
function OznakeY({ max }: { max: number }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {[0, 0.5, 1].map((ratio) => (
        <span
          key={ratio}
          className="absolute -translate-y-1/2 whitespace-nowrap text-meta tabular-nums text-text-muted"
          style={{
            top: `${((PAD_T + PLOT_H * (1 - ratio)) / CHART_H) * 100}%`,
            right: `${(1 - (PAD_L - 6) / CHART_W) * 100}%`,
          }}
        >
          {formatNumber(Math.round(max * ratio))}
        </span>
      ))}
    </div>
  );
}

export function AdsTimeseriesSkeleton() {
  return (
    <Card className="flex flex-col gap-4 p-5 shadow-card ring-line">
      <div className="flex justify-between items-center pb-3 border-b border-line-soft">
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-3 w-56" />
        </div>
        <Skeleton className="h-6 w-36" />
      </div>
      <div className="space-y-4">
        <Skeleton className="h-28 w-full rounded-lg" />
        <Skeleton className="h-28 w-full rounded-lg" />
      </div>
    </Card>
  );
}
