"use client";

import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import { ChartEmpty } from "@/components/app/chart-states";
import { formatLongDate, formatShortDate } from "@/lib/format";

/**
 * Praćenja i otpraćivanja kao divergentni stubovi oko nule — priliv gore,
 * odliv dole. Ne dve linije: promena naloga je jedna mera sa znakom, a stub
 * koji prelazi nulu čita se odjednom, dok bi dve linije tražile sabiranje u
 * glavi.
 *
 * Vrednost je dnevni neto (zbir po `follow_type`). Kada podatak nosi znak,
 * negativni dan pada ispod nule; kada Meta vraća samo nenegativan broj, svi
 * stubovi idu naviše i grafikon i dalje govori istinu (priliv), samo bez
 * odliva. Boje su statusne (uspeh/opasnost) i idu uz natpis, ne same.
 */
export function FollowsDivergingChart({
  title,
  dates,
  values,
  format,
  emptyReason,
}: {
  title: string;
  dates: string[];
  values: (number | null)[];
  format: (v: number) => string;
  emptyReason: ReactNode;
}) {
  const rows = dates.map((date, i) => ({
    date,
    v: typeof values[i] === "number" ? (values[i] as number) : 0,
    present: typeof values[i] === "number",
  }));

  const nums = values.filter((v): v is number => typeof v === "number");
  if (nums.length === 0 || nums.every((v) => v === 0)) {
    return (
      <Card className="gap-0 py-0 shadow-card ring-line">
        <div className="px-5 pt-5">
          <p className="text-sm font-medium text-foreground">{title}</p>
        </div>
        <ChartEmpty reason={emptyReason} />
      </Card>
    );
  }

  const maxAbs = Math.max(1, ...nums.map((v) => Math.abs(v)));
  const ceiling = niceCeil(maxAbs);
  const hasOutflow = nums.some((v) => v < 0);
  const config: ChartConfig = { v: { label: title } };

  return (
    <Card className="gap-0 py-0 shadow-card ring-line">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 pt-5">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <ul className="flex items-center gap-4 text-xs text-muted-foreground">
          <li className="flex items-center gap-1.5">
            <span
              className="size-2 rounded-full bg-success"
              aria-hidden
            />
            Priliv
          </li>
          {hasOutflow && (
            <li className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-danger" aria-hidden />
              Odliv
            </li>
          )}
        </ul>
      </div>
      <ChartContainer
        config={config}
        className="h-56 w-full px-3 pt-2 pb-3 aspect-auto"
      >
        <BarChart
          data={rows}
          margin={{ top: 12, right: 12, bottom: 0, left: 0 }}
          barCategoryGap={2}
        >
          <CartesianGrid vertical={false} stroke="var(--color-chart-grid)" />
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
            domain={[hasOutflow ? -ceiling : 0, ceiling]}
            tickFormatter={format}
            tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
          />
          <ReferenceLine y={0} stroke="var(--color-line-strong)" strokeWidth={1} />
          <ChartTooltip
            cursor={{ fill: "var(--color-line-soft)" }}
            isAnimationActive={false}
            content={(props) => (
              <FollowsTooltip
                active={props.active}
                payload={props.payload}
                format={format}
              />
            )}
          />
          <Bar dataKey="v" maxBarSize={22} isAnimationActive={false}>
            {rows.map((r) => (
              <Cell
                key={r.date}
                fill={
                  r.v < 0 ? "var(--color-danger)" : "var(--color-success)"
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
    </Card>
  );
}

type TooltipRow = { payload?: { date: string; v: number; present: boolean } };

function FollowsTooltip({
  active,
  payload,
  format,
}: {
  active?: boolean;
  payload?: unknown;
  format: (v: number) => string;
}) {
  const list = payload as TooltipRow[] | undefined;
  const row = list?.[0]?.payload;
  if (!active || !row || !row.present) return null;
  const outflow = row.v < 0;

  return (
    <div className="min-w-48 rounded-lg border border-line bg-popover px-3 py-2 text-xs shadow-elev-2">
      <p className="text-text-muted">{formatLongDate(row.date)}</p>
      <div className="mt-1.5 flex items-center justify-between gap-4">
        <span className="flex items-center gap-2 text-muted-foreground">
          <span
            className={`size-2 rounded-full ${outflow ? "bg-danger" : "bg-success"}`}
            aria-hidden
          />
          {outflow ? "Neto odliv" : "Neto priliv"}
        </span>
        <span className="font-mono font-medium tabular-nums text-foreground">
          {format(Math.abs(row.v))}
        </span>
      </div>
    </div>
  );
}

/** Okrugli plafon za simetričnu osu — 1/2/5 × 10^n iznad najveće apsolutne. */
function niceCeil(max: number): number {
  if (max <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(max));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= max)!;
  return step;
}
