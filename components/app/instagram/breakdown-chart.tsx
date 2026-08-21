"use client";

import type { ReactNode } from "react";
import {
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import { ChartEmpty } from "@/components/app/chart-states";
import { formatLongDate, formatShortDate } from "@/lib/format";

/**
 * Jedna kategorija u razdvajanju: identitet, boja i dnevne vrednosti.
 * `null` znači da je taj dan potisnut (ispod praga) — tada linija ima prekid,
 * ne pad na nulu. Nula i „nema podatka" ostaju različiti i ovde.
 */
export type BreakdownSeries = {
  key: string;
  label: string;
  /** Token serije, npr. `var(--color-chart-1)`. Prati entitet, ne rang. */
  color: string;
  values: (number | null)[];
};

/**
 * Kategorijsko razdvajanje jedne metrike kroz vreme — više serija na jednom
 * panelu, jedna y-osa. Ne dupla osa: sve serije mere istu meru u istoj
 * jedinici, pa dele skalu.
 *
 * Boje idu fiksnim redom po entitetu (Feed je uvek prva boja, Reels druga…),
 * pa kad filter izbaci jednu kategoriju, ostale ne menjaju boju. Legenda stoji
 * uvek jer serija ima ≥2; do četiri serije nose i direktnu oznaku na kraju
 * linije, da se identitet čita i bez skoka na legendu. Tekst nosi tekstualne
 * tokene — boja je samo na tačkici i liniji, nikad na slovima.
 */
export function BreakdownChart({
  title,
  dates,
  series,
  format,
  emptyReason,
}: {
  title: string;
  dates: string[];
  series: BreakdownSeries[];
  format: (v: number) => string;
  emptyReason: ReactNode;
}) {
  const rows = dates.map((date, i) => {
    const row: Record<string, number | null | string> = { date };
    for (const s of series) row[s.key] = s.values[i] ?? null;
    return row;
  });

  const allValues = series.flatMap((s) =>
    s.values.filter((v): v is number => typeof v === "number"),
  );
  const maxV = Math.max(0, ...allValues);

  if (series.length === 0 || allValues.length === 0 || maxV === 0) {
    return (
      <Card className="gap-0 py-0 shadow-card ring-line">
        <div className="px-5 pt-5">
          <p className="text-sm font-medium text-foreground">{title}</p>
        </div>
        <ChartEmpty reason={emptyReason} />
      </Card>
    );
  }

  const config: ChartConfig = Object.fromEntries(
    series.map((s) => [s.key, { label: s.label }]),
  );
  const ticks = niceTicks(maxV, 3);
  const top = ticks[ticks.length - 1];
  const ceiling = Math.max(top, maxV * 1.08);
  const directLabels = series.length <= 4;

  return (
    <Card className="gap-0 py-0 shadow-card ring-line">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 pt-5">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <Legend series={series} />
      </div>
      <ChartContainer
        config={config}
        className="h-56 w-full px-3 pt-2 pb-3 aspect-auto"
      >
        <LineChart
          data={rows}
          margin={{ top: 12, right: directLabels ? 56 : 12, bottom: 0, left: 0 }}
        >
          <CartesianGrid
            vertical={false}
            stroke="var(--color-chart-grid)"
            strokeDasharray="0"
          />
          <XAxis
            dataKey="date"
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={44}
            tickFormatter={formatShortDate}
            tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
            tickMargin={8}
          />
          <YAxis
            width={48}
            axisLine={false}
            tickLine={false}
            ticks={ticks}
            interval={0}
            domain={[0, ceiling]}
            tickFormatter={format}
            tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
          />
          <ChartTooltip
            cursor={{ stroke: "var(--color-line-strong)", strokeWidth: 1 }}
            isAnimationActive={false}
            content={(props) => (
              <BreakdownTooltip
                active={props.active}
                payload={props.payload}
                series={series}
                format={format}
              />
            )}
          />
          {series.map((s) => (
            <Line
              key={s.key}
              dataKey={s.key}
              type="monotone"
              stroke={s.color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={false}
              activeDot={{
                r: 4,
                strokeWidth: 2,
                stroke: "var(--color-card)",
                fill: s.color,
              }}
              connectNulls={false}
              isAnimationActive={false}
            >
              {directLabels && (
                <LabelList
                  dataKey={s.key}
                  content={(props) => renderEndLabel(props, rows, s)}
                />
              )}
            </Line>
          ))}
        </LineChart>
      </ChartContainer>
    </Card>
  );
}

/** Uvek prisutna za ≥2 serije: tačkica u boji + naziv u tekstualnom tokenu. */
function Legend({ series }: { series: BreakdownSeries[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {series.map((s) => (
        <li
          key={s.key}
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          <span
            className="size-2 rounded-full"
            style={{ backgroundColor: s.color }}
            aria-hidden
          />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

type LabelProps = {
  x?: number | string;
  y?: number | string;
  index?: number;
  value?: unknown;
};

/** Direktna oznaka na poslednjem stvarnom danu serije, van desne margine. */
function renderEndLabel(
  props: LabelProps,
  rows: Array<Record<string, number | null | string>>,
  s: BreakdownSeries,
) {
  const { index, x, y } = props;
  if (index === undefined || typeof x !== "number" || typeof y !== "number") {
    return <g />;
  }
  // Oznaka ide samo na poslednji dan koji ima vrednost — ne na svaki.
  let lastWithValue = -1;
  for (let i = 0; i < rows.length; i++) {
    if (typeof rows[i][s.key] === "number") lastWithValue = i;
  }
  if (index !== lastWithValue) return <g />;

  return (
    <text
      x={x + 6}
      y={y}
      dominantBaseline="middle"
      className="text-micro font-medium"
      fill="var(--color-text-secondary)"
    >
      {s.label}
    </text>
  );
}

type TooltipRow = { payload?: Record<string, number | null | string> };

function BreakdownTooltip({
  active,
  payload,
  series,
  format,
}: {
  active?: boolean;
  payload?: unknown;
  series: BreakdownSeries[];
  format: (v: number) => string;
}) {
  const list = payload as TooltipRow[] | undefined;
  const row = list?.[0]?.payload;
  if (!active || !row) return null;

  const entries = series
    .map((s) => ({ s, value: row[s.key] }))
    .filter((e): e is { s: BreakdownSeries; value: number } =>
      typeof e.value === "number",
    )
    .sort((a, b) => b.value - a.value);

  if (entries.length === 0) return null;

  return (
    <div className="min-w-52 rounded-lg border border-line bg-popover px-3 py-2 text-xs shadow-elev-2">
      <p className="text-text-muted">{formatLongDate(String(row.date))}</p>
      <dl className="mt-1.5 space-y-1">
        {entries.map(({ s, value }) => (
          <div key={s.key} className="flex items-center justify-between gap-4">
            <dt className="flex items-center gap-2 text-muted-foreground">
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: s.color }}
                aria-hidden
              />
              {s.label}
            </dt>
            <dd className="font-mono font-medium tabular-nums text-foreground">
              {format(value)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Okrugli podeoci koji pokrivaju `max` — isti obrazac kao u timeline-chart. */
function niceTicks(max: number, count: number): number[] {
  if (max <= 0) return [0, 1];
  const rough = max / count;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= rough)!;
  return Array.from({ length: count + 1 }, (_, i) => i * step);
}
