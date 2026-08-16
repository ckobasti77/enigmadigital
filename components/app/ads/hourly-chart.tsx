"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import { formatNumber } from "@/lib/format";
import { Clock, Info } from "lucide-react";

export type HourlyPoint = {
  hour: number;
  spend: number;
  impressions: number;
  clicks: number;
  results: number;
};

const config = {
  spend: { label: "Potrošnja", color: "var(--color-chart-1)" },
  impressions: { label: "Impresije", color: "var(--color-chart-2)" },
} satisfies ChartConfig;

export function HourlyChart({
  data,
  hasHourlyData,
}: {
  data: HourlyPoint[];
  hasHourlyData: boolean;
}) {
  const chartData = useMemo(() => {
    return data.map((d) => ({
      ...d,
      hourLabel: `${String(d.hour).padStart(2, "0")}:00`,
    }));
  }, [data]);

  const maxSpend = useMemo(() => Math.max(1, ...data.map((d) => d.spend)), [data]);

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
          <BarChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--color-chart-grid)" />
            <XAxis
              dataKey="hourLabel"
              axisLine={false}
              tickLine={false}
              interval={2}
              tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
              tickMargin={6}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
              tickFormatter={(v: number) => `${formatNumber(v)} €`}
              domain={[0, maxSpend * 1.1]}
              width={42}
            />
            <ChartTooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as HourlyPoint & { hourLabel: string };
                return (
                  <div className="min-w-40 rounded-lg border border-line bg-popover px-3 py-2 text-xs shadow-card">
                    <p className="font-semibold text-foreground">{p.hourLabel}</p>
                    <div className="mt-1.5 space-y-1">
                      <div className="flex justify-between gap-3 text-text-muted">
                        <span>Potrošnja:</span>
                        <span className="font-mono font-medium text-accent-400">
                          {formatNumber(p.spend)} €
                        </span>
                      </div>
                      <div className="flex justify-between gap-3 text-text-muted">
                        <span>Impresije:</span>
                        <span className="font-mono font-medium text-foreground">
                          {formatNumber(p.impressions)}
                        </span>
                      </div>
                      <div className="flex justify-between gap-3 text-text-muted">
                        <span>Klikovi:</span>
                        <span className="font-mono font-medium text-foreground">
                          {formatNumber(p.clicks)}
                        </span>
                      </div>
                      {p.results > 0 && (
                        <div className="flex justify-between gap-3 text-text-muted">
                          <span>Rezultati:</span>
                          <span className="font-mono font-medium text-success">
                            {formatNumber(p.results)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              }}
            />
            <Bar
              dataKey="spend"
              fill="var(--color-chart-1)"
              radius={[3, 3, 0, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        </ChartContainer>
      </div>
    </div>
  );
}
