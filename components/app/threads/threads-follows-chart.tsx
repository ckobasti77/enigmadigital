"use client";

import type { ReactNode } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import { Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import { ChartEmpty, ChartErrorBoundary } from "@/components/app/chart-states";
import { formatCompact, formatLongDate, formatNumber, formatShortDate } from "@/lib/format";

export type FollowerSnapshotPoint = {
  date: string;
  followersCount: number | null;
  takenAt: number;
};

export function ThreadsFollowsChart({
  snapshots,
  emptyReason,
}: {
  snapshots?: FollowerSnapshotPoint[];
  emptyReason?: ReactNode;
}) {
  const definedSnapshots = (snapshots ?? []).filter(
    (s): s is FollowerSnapshotPoint & { followersCount: number } =>
      s.followersCount !== null && typeof s.followersCount === "number",
  );

  if (!snapshots || definedSnapshots.length === 0) {
    return (
      <Card className="gap-0 py-0 shadow-card ring-line">
        <div className="flex items-center gap-2 px-5 pt-5">
          <Users className="size-4 text-accent-400" aria-hidden="true" />
          <p className="text-sm font-semibold text-foreground">
            Istorija broja pratilaca
          </p>
        </div>
        <ChartEmpty
          reason={
            emptyReason ??
            "Threads ne beleži istoriju pratilaca kroz API, već se snima periodično. Nema zabeleženih snimaka za izabrani period."
          }
        />
      </Card>
    );
  }

  const values = definedSnapshots.map((s) => s.followersCount);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const padding = Math.max(1, Math.round((maxVal - minVal) * 0.15));
  const domainMin = Math.max(0, minVal - padding);
  const domainMax = maxVal + padding;

  const chartData = definedSnapshots.map((s) => ({
    date: s.date,
    followers: s.followersCount,
    takenAt: s.takenAt,
  }));

  const config: ChartConfig = {
    followers: {
      label: "Broj pratilaca",
      color: "var(--color-accent-400)",
    },
  };

  return (
    <ChartErrorBoundary>
      <Card className="gap-0 py-0 shadow-card ring-line">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 pt-5">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-accent-400/10 text-accent-400">
              <Users className="size-4" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Istorija broja pratilaca
              </h2>
              <p className="text-xs text-text-muted">
                Periodični snimci stanja naloga (nedeljni i dnevni)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-bold tabular-nums text-foreground">
              {formatNumber(values[values.length - 1])}
            </span>
            <span className="text-xs text-text-muted">poslednji snimak</span>
          </div>
        </div>

        <ChartContainer
          config={config}
          className="h-64 w-full px-3 pt-4 pb-3 aspect-auto"
        >
          <AreaChart
            data={chartData}
            margin={{ top: 12, right: 16, bottom: 0, left: 0 }}
          >
            <defs>
              <linearGradient id="threadsFollowersGrad" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-accent-400)"
                  stopOpacity={0.25}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-accent-400)"
                  stopOpacity={0.0}
                />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--color-chart-grid)" />
            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={36}
              tickFormatter={formatShortDate}
              tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
              tickMargin={8}
            />
            <YAxis
              width={48}
              axisLine={false}
              tickLine={false}
              domain={[domainMin, domainMax]}
              tickFormatter={formatCompact}
              tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
            />
            <ChartTooltip
              cursor={{ stroke: "var(--color-line-strong)", strokeDasharray: "3 3" }}
              isAnimationActive={false}
              content={(props) => (
                <FollowersTooltip
                  active={props.active}
                  payload={props.payload}
                />
              )}
            />
            <Area
              type="monotone"
              dataKey="followers"
              stroke="var(--color-accent-400)"
              strokeWidth={2}
              fill="url(#threadsFollowersGrad)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ChartContainer>
      </Card>
    </ChartErrorBoundary>
  );
}

type TooltipRow = {
  payload?: {
    date: string;
    followers: number;
    takenAt: number;
  };
};

function FollowersTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: unknown;
}) {
  const list = payload as TooltipRow[] | undefined;
  const row = list?.[0]?.payload;
  if (!active || !row || typeof row.followers !== "number") return null;

  return (
    <div className="min-w-48 rounded-lg border border-line bg-popover px-3 py-2 text-xs shadow-elev-2">
      <p className="text-text-muted">{formatLongDate(row.date)}</p>
      <div className="mt-1.5 flex items-center justify-between gap-4">
        <span className="text-muted-foreground">Broj pratilaca</span>
        <span className="font-mono font-bold tabular-nums text-foreground">
          {formatNumber(row.followers)}
        </span>
      </div>
    </div>
  );
}
