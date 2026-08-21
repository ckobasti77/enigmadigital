"use client";

import { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Laptop, Smartphone, Tablet } from "lucide-react";
import type { ComponentType } from "react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatCompact,
  formatLongDate,
  formatNumber,
  formatPercent,
  formatShortDate,
} from "@/lib/format";
import { ChartCard, ChartLegend } from "./chart-card";
import { metricFormat } from "./metric-state";

type DeviceData = FunctionReturnType<typeof api.analytics.audienceDevice>;

const fmtSessions = metricFormat("sessions");
const fmtRate = metricFormat("engagementRate");

const SERIES = [
  { key: "desktop", label: "Desktop", color: "var(--chart-1)", icon: Laptop },
  { key: "mobile", label: "Mobile", color: "var(--chart-2)", icon: Smartphone },
  { key: "tablet", label: "Tablet", color: "var(--chart-3)", icon: Tablet },
] as const;

export function DeviceChart({ data }: { data: DeviceData }) {
  const chartData = useMemo(
    () => data.series.map((pt) => ({ ...pt })),
    [data.series],
  );

  const rowFor = (cat: string) =>
    data.rows.find((r) => r.deviceCategory === cat);
  const totalSessions = data.totals.sessions;

  return (
    <ChartCard
      title="Uređaji kroz vreme"
      description="Distribucija sesija po tipu uređaja."
      legend={
        <ChartLegend items={SERIES.map((s) => ({ color: s.color, label: s.label }))} />
      }
      empty={
        chartData.length === 0
          ? "Nema podataka o uređajima za izabrani period."
          : undefined
      }
    >
      <div className="flex flex-col gap-6">
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
              <defs>
                {SERIES.map((s) => (
                  <linearGradient
                    key={s.key}
                    id={`dev-${s.key}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor={s.color} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={s.color} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <XAxis
                dataKey="date"
                tickFormatter={formatShortDate}
                interval="preserveStartEnd"
                minTickGap={44}
                tickLine={false}
                axisLine={false}
                tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
                tickMargin={8}
              />
              <YAxis
                width={44}
                tickLine={false}
                axisLine={false}
                tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
                tickFormatter={formatCompact}
              />
              <Tooltip
                cursor={{ stroke: "var(--color-line-strong)", strokeWidth: 1 }}
                content={({ active, payload }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const d = payload[0].payload as (typeof chartData)[number];
                  return (
                    <div className="min-w-44 rounded-lg border border-line bg-popover px-3 py-2 text-xs shadow-elev-2">
                      <p className="text-text-muted">{formatLongDate(d.date)}</p>
                      <dl className="mt-1.5 space-y-1">
                        {SERIES.map((s) => (
                          <div
                            key={s.key}
                            className="flex items-center justify-between gap-4"
                          >
                            <dt className="flex items-center gap-2 text-muted-foreground">
                              <span
                                className="size-2 rounded-full"
                                style={{ backgroundColor: s.color }}
                                aria-hidden
                              />
                              {s.label}
                            </dt>
                            <dd className="font-mono font-medium tabular-nums text-foreground">
                              {formatNumber(
                                Number((d as Record<string, unknown>)[s.key] ?? 0),
                              )}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  );
                }}
              />
              {SERIES.map((s) => (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  stackId="1"
                  stroke={s.color}
                  fill={`url(#dev-${s.key})`}
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {SERIES.map((s) => (
            <DeviceStat
              key={s.key}
              icon={s.icon}
              color={s.color}
              label={s.label}
              sessions={rowFor(s.key)?.sessions ?? 0}
              share={
                totalSessions > 0
                  ? (rowFor(s.key)?.sessions ?? 0) / totalSessions
                  : 0
              }
              rate={rowFor(s.key)?.engagementRate ?? 0}
            />
          ))}
        </div>
      </div>
    </ChartCard>
  );
}

function DeviceStat({
  icon: Icon,
  color,
  label,
  sessions,
  share,
  rate,
}: {
  icon: ComponentType<{ className?: string }>;
  color: string;
  label: string;
  sessions: number;
  share: number;
  rate: number;
}) {
  return (
    <div className="flex items-center gap-3.5 rounded-xl border border-line-soft bg-surface-raised/20 p-4">
      <div
        className="flex size-10 items-center justify-center rounded-lg"
        style={{ backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)`, color }}
      >
        <Icon className="size-5" />
      </div>
      <div className="flex min-w-0 flex-col">
        <span className="text-xs text-text-muted">{label}</span>
        <div className="flex items-baseline gap-1.5">
          <span className="font-mono text-base font-semibold text-foreground">
            {fmtSessions(sessions)}
          </span>
          <span className="text-xs text-text-muted">({formatPercent(share)})</span>
        </div>
        <span className="text-[11px] text-text-muted">stopa {fmtRate(rate)}</span>
      </div>
    </div>
  );
}

export function DeviceChartSkeleton() {
  return (
    <Card className="gap-0 py-0 shadow-card ring-line">
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-48" />
      </div>
      <div className="flex flex-col gap-6 px-5 pb-5">
        <Skeleton className="h-[280px] w-full rounded-xl" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      </div>
    </Card>
  );
}
