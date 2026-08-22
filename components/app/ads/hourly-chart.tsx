"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import { formatNumber } from "@/lib/format";
import { formatMetric } from "@/convex/lib/metaAdsFormat";
import { resolveMetric } from "@/convex/lib/metaAdsCatalog";
import { Clock, Info } from "lucide-react";

const spendDef = resolveMetric("spend")!;

export type HourlyPoint = {
  hour: number;
  spend: number;
  impressions: number;
  clicks: number;
  results: number;
};

/* Jedna serija na grafikonu — potrošnja. Impresije, klikovi i rezultati su
   kontekst u očitavanju, ne serije, pa nemaju svoju boju. */
const config = {
  spend: { label: "Potrošnja", color: "var(--color-chart-1)" },
} satisfies ChartConfig;

export function HourlyChart({
  data,
  hasHourlyData,
  currencyCode,
}: {
  data: HourlyPoint[];
  hasHourlyData: boolean;
  currencyCode?: string;
}) {
  const chartData = useMemo(() => {
    return data.map((d) => ({
      ...d,
      hourLabel: `${String(d.hour).padStart(2, "0")}:00`,
    }));
  }, [data]);

  const spendTicks = useMemo(
    () => niceTicks(Math.max(0, ...data.map((d) => d.spend)), 3),
    [data],
  );

  if (!hasHourlyData || data.every((d) => d.spend === 0 && d.impressions === 0)) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-line-soft bg-surface/50 py-12 text-center">
        <div className="flex size-10 items-center justify-center rounded-full border border-line-soft text-text-muted">
          <Clock className="size-4" />
        </div>
        <p className="mt-3 text-sm font-medium text-foreground">
          Nema satnih podataka
        </p>
        <p className="mt-1 max-w-sm text-xs text-text-muted">
          Satna dinamika se automatski prikuplja za &quot;hot&quot; kampanje (sa aktivnom potrošnjom u poslednjih 48h) na svakih 15 minuta.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-muted">
          Distribucija potrošnje i aktivnosti po satima (00:00 – 23:00).
        </p>
        <div className="flex items-center gap-1.5 text-xs text-text-muted">
          <Info className="size-3 text-accent-400" />
          <span>Hot kampanja · sinhronizovano u 15-minutnom taktu</span>
        </div>
      </div>

      <div className="rounded-lg border border-line-soft bg-surface/30 p-3">
        <ChartContainer config={config} className="h-56 w-full aspect-auto">
          <BarChart
            data={chartData}
            margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
            /* 2 px u boji podloge razdvaja susedne trake. */
            barCategoryGap={2}
          >
            <CartesianGrid vertical={false} stroke="var(--color-chart-grid)" />
            <XAxis
              dataKey="hourLabel"
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={32}
              tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
              tickMargin={6}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
              tickFormatter={(v: number) => formatMetric(v, spendDef, currencyCode)}
              ticks={spendTicks}
              interval={0}
              domain={[0, spendTicks[spendTicks.length - 1] * 1.1]}
              width={48}
            />
            <ChartTooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as HourlyPoint & { hourLabel: string };
                return (
                  <div className="min-w-44 rounded-lg border border-line bg-popover px-3 py-2 text-xs shadow-elev-2">
                    <p className="font-semibold text-foreground">{p.hourLabel}</p>
                    <div className="mt-1.5 space-y-1">
                      <TooltipRow
                        label="Potrošnja"
                        value={formatMetric(p.spend, spendDef, currencyCode)}
                        color="var(--color-chart-1)"
                      />
                      <TooltipRow
                        label="Impresije"
                        value={formatNumber(p.impressions)}
                      />
                      <TooltipRow
                        label="Klikovi"
                        value={formatNumber(p.clicks)}
                      />
                      {p.results > 0 && (
                        <TooltipRow
                          label="Rezultati"
                          value={formatNumber(p.results)}
                        />
                      )}
                    </div>
                  </div>
                );
              }}
            />
            <Bar
              dataKey="spend"
              fill="var(--color-chart-1)"
              /* Zaobljenje samo na kraju koji nije na osnovnoj liniji. */
              radius={[4, 4, 0, 0]}
              maxBarSize={24}
              isAnimationActive={false}
            />
          </BarChart>
        </ChartContainer>
      </div>
    </div>
  );
}

/**
 * Vrednost nosi tekstualni token, nikad boju serije ni status boju — identitet
 * nosi tačkica pored oznake.
 */
function TooltipRow({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-text-muted">
        {color ? (
          <span
            className="size-2 rounded-full"
            style={{ backgroundColor: color }}
            aria-hidden
          />
        ) : (
          <span className="size-2" aria-hidden />
        )}
        {label}
      </span>
      <span className="font-mono font-medium tabular-nums text-foreground">
        {value}
      </span>
    </div>
  );
}

/** Okrugli podeoci (0, korak, 2·korak, …) koji pokrivaju `max`. */
function niceTicks(max: number, count: number): number[] {
  if (max <= 0) return [0, 1];
  const rough = max / count;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= rough)!;
  return Array.from({ length: count + 1 }, (_, i) => i * step);
}
