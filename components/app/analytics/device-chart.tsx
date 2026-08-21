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
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber, formatPercent, formatShortDate } from "@/lib/format";

type DeviceData = FunctionReturnType<typeof api.analytics.audienceDevice>;

export function DeviceChart({ data }: { data: DeviceData }) {
  const chartData = useMemo(() => {
    return data.series.map((pt) => ({
      ...pt,
      formattedDate: formatShortDate(pt.date),
    }));
  }, [data.series]);

  const desktopRow = data.rows.find((r) => r.deviceCategory === "desktop");
  const mobileRow = data.rows.find((r) => r.deviceCategory === "mobile");
  const tabletRow = data.rows.find((r) => r.deviceCategory === "tablet");

  const totalSessions = data.totals.sessions;

  return (
    <Card className="flex flex-col gap-6 rounded-2xl border border-line bg-card p-6 shadow-sm">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            Uređaji kroz vreme
          </h3>
          <p className="text-xs text-muted-foreground">
            Distribucija sesija po tipu uređaja (Desktop, Mobile, Tablet).
          </p>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5 font-medium">
            <span className="h-2.5 w-2.5 rounded-full bg-chart-1" />
            <span className="text-foreground">Desktop</span>
          </div>
          <div className="flex items-center gap-1.5 font-medium">
            <span className="h-2.5 w-2.5 rounded-full bg-chart-2" />
            <span className="text-foreground">Mobile</span>
          </div>
          <div className="flex items-center gap-1.5 font-medium">
            <span className="h-2.5 w-2.5 rounded-full bg-chart-3" />
            <span className="text-foreground">Tablet</span>
          </div>
        </div>
      </div>

      {/* Main Stacked Area Chart */}
      <div className="h-[280px] w-full">
        {chartData.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Nema podataka o uređajima za izabrani period.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
            >
              <defs>
                <linearGradient id="colorDesktop" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="colorMobile" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--chart-2)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="var(--chart-2)" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="colorTablet" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--chart-3)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="var(--chart-3)" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="formattedDate"
                stroke="currentColor"
                className="text-[11px] text-muted-foreground/70"
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="currentColor"
                className="text-[11px] text-muted-foreground/70"
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`)}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const d = payload[0].payload as (typeof chartData)[0];
                  return (
                    <div className="rounded-xl border border-line bg-card/95 p-3 text-xs shadow-md backdrop-blur">
                      <div className="mb-2 font-medium text-foreground">
                        {d.date}
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-4">
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <span className="h-2 w-2 rounded-full bg-chart-1" />
                            Desktop:
                          </span>
                          <span className="font-mono font-medium text-foreground">
                            {formatNumber(d.desktop)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <span className="h-2 w-2 rounded-full bg-chart-2" />
                            Mobile:
                          </span>
                          <span className="font-mono font-medium text-foreground">
                            {formatNumber(d.mobile)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <span className="h-2 w-2 rounded-full bg-chart-3" />
                            Tablet:
                          </span>
                          <span className="font-mono font-medium text-foreground">
                            {formatNumber(d.tablet)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="desktop"
                stackId="1"
                stroke="var(--chart-1)"
                fill="url(#colorDesktop)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="mobile"
                stackId="1"
                stroke="var(--chart-2)"
                fill="url(#colorMobile)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="tablet"
                stackId="1"
                stroke="var(--chart-3)"
                fill="url(#colorTablet)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Device summary cards */}
      <div className="grid grid-cols-1 gap-4 pt-2 sm:grid-cols-3">
        <div className="flex items-center gap-3.5 rounded-xl border border-line bg-muted/20 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-chart-1/10 text-chart-1">
            <Laptop className="h-5 w-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Desktop</span>
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-base font-semibold text-foreground">
                {formatNumber(desktopRow?.sessions ?? 0)}
              </span>
              <span className="text-xs text-muted-foreground">
                ({formatPercent(totalSessions > 0 ? (desktopRow?.sessions ?? 0) / totalSessions : 0)})
              </span>
            </div>
            <span className="text-[11px] text-muted-foreground">
              stopa {formatPercent(desktopRow?.engagementRate ?? 0)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3.5 rounded-xl border border-line bg-muted/20 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-chart-2/10 text-chart-2">
            <Smartphone className="h-5 w-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Mobile</span>
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-base font-semibold text-foreground">
                {formatNumber(mobileRow?.sessions ?? 0)}
              </span>
              <span className="text-xs text-muted-foreground">
                ({formatPercent(totalSessions > 0 ? (mobileRow?.sessions ?? 0) / totalSessions : 0)})
              </span>
            </div>
            <span className="text-[11px] text-muted-foreground">
              stopa {formatPercent(mobileRow?.engagementRate ?? 0)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3.5 rounded-xl border border-line bg-muted/20 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-chart-3/10 text-chart-3">
            <Tablet className="h-5 w-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Tablet</span>
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-base font-semibold text-foreground">
                {formatNumber(tabletRow?.sessions ?? 0)}
              </span>
              <span className="text-xs text-muted-foreground">
                ({formatPercent(totalSessions > 0 ? (tabletRow?.sessions ?? 0) / totalSessions : 0)})
              </span>
            </div>
            <span className="text-[11px] text-muted-foreground">
              stopa {formatPercent(tabletRow?.engagementRate ?? 0)}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}

export function DeviceChartSkeleton() {
  return (
    <Card className="flex flex-col gap-6 rounded-2xl border border-line p-6 shadow-sm">
      <Skeleton className="h-5 w-40 rounded" />
      <Skeleton className="h-[280px] w-full rounded-xl" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </div>
    </Card>
  );
}
