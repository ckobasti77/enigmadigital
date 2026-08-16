"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import { formatLongDate, formatNumber, formatShortDate } from "@/lib/format";
import type { OrDailyPoint } from "@/lib/metrics";

const config = {
  dmsSent: { label: "Poslati DM", color: "var(--color-chart-1)" },
  linkClicks: { label: "Klikovi", color: "var(--color-chart-2)" },
} satisfies ChartConfig;

const SYNC_ID = "openreply-timeline";
const TOP_H = "h-52";
const BOTTOM_H = "h-24";
const Y_WIDTH = 44;

/** Round ticks (0, step, 2·step, …) covering `max`. */
function niceTicks(max: number, count: number): number[] {
  if (max <= 0) return [0, 1];
  const rough = max / count;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= rough)!;
  return Array.from({ length: count + 1 }, (_, i) => i * step);
}

function tickFormatterFor(count: number) {
  const every = Math.max(1, Math.ceil(count / 7));
  return (value: string, index: number) =>
    index % every === 0 ? formatShortDate(value) : "";
}

export function OpenReplyChart({ data }: { data: OrDailyPoint[] }) {
  const tick = tickFormatterFor(data.length);
  const dmTicks = niceTicks(Math.max(...data.map((d) => d.dmsSent)), 3);
  const clickTicks = niceTicks(Math.max(...data.map((d) => d.linkClicks)), 1);

  return (
    <Card className="gap-0 py-0 shadow-card ring-line">
      <div className="px-5 pt-5">
        <PanelTitle color="var(--color-chart-1)" title="Poslati DM-ovi" />
      </div>
      <ChartContainer
        config={config}
        className={`${TOP_H} w-full px-3 pt-2 aspect-auto`}
      >
        <AreaChart
          data={data}
          syncId={SYNC_ID}
          margin={{ top: 8, right: 12, bottom: 8, left: 0 }}
        >
          <defs>
            <linearGradient id="or-dms-fill" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="var(--color-dmsSent)"
                stopOpacity={0.22}
              />
              <stop
                offset="100%"
                stopColor="var(--color-dmsSent)"
                stopOpacity={0}
              />
            </linearGradient>
          </defs>
          <CartesianGrid
            vertical={false}
            stroke="var(--color-chart-grid)"
            strokeDasharray="0"
          />
          <XAxis dataKey="date" hide />
          <YAxis
            width={Y_WIDTH}
            axisLine={false}
            tickLine={false}
            ticks={dmTicks}
            interval={0}
            domain={[0, dmTicks[dmTicks.length - 1]]}
            tickFormatter={(v: number) => formatNumber(v)}
            tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
          />
          <ChartTooltip
            cursor={{ stroke: "var(--color-line-strong)", strokeWidth: 1 }}
            isAnimationActive={false}
            content={<TimelineTooltip />}
          />
          <Area
            dataKey="dmsSent"
            type="monotone"
            stroke="var(--color-dmsSent)"
            strokeWidth={2}
            fill="url(#or-dms-fill)"
            dot={false}
            activeDot={{
              r: 4,
              strokeWidth: 2,
              stroke: "var(--color-card)",
              fill: "var(--color-dmsSent)",
            }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ChartContainer>

      <div className="mt-3 border-t border-line-soft px-5 pt-4">
        <PanelTitle color="var(--color-chart-2)" title="Klikovi na linkove" />
      </div>
      <ChartContainer
        config={config}
        className={`${BOTTOM_H} w-full px-3 pt-2 pb-3 aspect-auto`}
      >
        <BarChart
          data={data}
          syncId={SYNC_ID}
          margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
          barCategoryGap={data.length > 40 ? 1 : 3}
        >
          <CartesianGrid vertical={false} stroke="var(--color-chart-grid)" />
          <XAxis
            dataKey="date"
            axisLine={false}
            tickLine={false}
            interval={0}
            tickFormatter={tick}
            tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
            tickMargin={8}
          />
          <YAxis
            width={Y_WIDTH}
            axisLine={false}
            tickLine={false}
            ticks={clickTicks}
            interval={0}
            domain={[0, clickTicks[clickTicks.length - 1]]}
            allowDecimals={false}
            tickFormatter={(v: number) => formatNumber(v)}
            tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
          />
          <ChartTooltip
            cursor={{ fill: "var(--color-line-soft)" }}
            content={() => null}
          />
          <Bar
            dataKey="linkClicks"
            fill="var(--color-linkClicks)"
            radius={[2, 2, 0, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ChartContainer>
    </Card>
  );
}

function PanelTitle({ color, title }: { color: string; title: string }) {
  return (
    <p className="flex items-center gap-2 text-sm font-medium text-foreground">
      <span
        className="size-2 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      {title}
    </p>
  );
}

function TimelineTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: OrDailyPoint }>;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="min-w-44 rounded-lg border border-line bg-popover px-3 py-2 text-xs shadow-card">
      <p className="text-text-muted">{formatLongDate(point.date)}</p>
      <dl className="mt-1.5 space-y-1">
        <TooltipRow
          color="var(--color-chart-1)"
          label="Poslati DM"
          value={formatNumber(point.dmsSent)}
        />
        <TooltipRow
          color="var(--color-chart-2)"
          label="Klikovi"
          value={formatNumber(point.linkClicks)}
        />
      </dl>
    </div>
  );
}

function TooltipRow({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="flex items-center gap-2 text-muted-foreground">
        <span
          className="size-2 rounded-full"
          style={{ backgroundColor: color }}
          aria-hidden
        />
        {label}
      </dt>
      <dd className="font-mono font-medium tabular-nums text-foreground">
        {value}
      </dd>
    </div>
  );
}

export function OpenReplyChartSkeleton() {
  return (
    <Card className="gap-0 py-0 shadow-card ring-line">
      <div className="px-5 pt-5">
        <Skeleton className="h-4 w-28" />
      </div>
      <div className={`${TOP_H} px-5 pt-2`}>
        <Skeleton className="h-full w-full" />
      </div>
      <div className="mt-3 border-t border-line-soft px-5 pt-4">
        <Skeleton className="h-4 w-32" />
      </div>
      <div className={`${BOTTOM_H} px-5 pt-2 pb-3`}>
        <Skeleton className="h-full w-full" />
      </div>
    </Card>
  );
}
