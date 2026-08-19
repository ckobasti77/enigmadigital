"use client";

import type { ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import { ChartEmpty, ChartShapeSkeleton } from "./chart-states";
import {
  formatLongDate,
  formatShortDate,
  formatSignedPercent,
} from "@/lib/format";

/**
 * Dve mere kroz vreme, u dva panela jedan ispod drugog — nikad na dve y-ose.
 * Dupla osa je najčešća greška u grafikonima: poravnanje dve skale je
 * proizvoljno, pa grafikon izmisli vezu koje u podacima nema. Panel gore nosi
 * meru koja se prati, panel dole prateću; x-osa je zajednička (`syncId`), pa
 * jedan prelaz mišem očitava obe.
 *
 * Po jedna serija na panelu, i naslov panela je imenuje — zato legenda ne
 * postoji. Kutija sa jednim uzorkom boje ponovila bi naslov i pojela prostor.
 *
 * Donji panel je opcion. Kada podaci nose samo jednu dnevnu meru, prazan
 * panel ispod nje bi obećao poređenje kojeg nema — pa ga tada nema ni na
 * ekranu, a x-osa se seli u gornji panel.
 */

export type TimelineMeasure = {
  /** Ime serije. Nosi ga naslov panela. */
  label: string;
  /** Token serije iz `globals.css`, npr. `var(--color-chart-1)`. */
  color: string;
  /** Vrednosti po danu, istim redosledom kao `dates`. */
  values: number[];
  /** Formatiranje kroz `lib/format.ts`. */
  format: (v: number) => string;
  /**
   * Odakle kreće y-osa gornjeg panela. Podrazumevano `"zero"` — protok
   * (sesije, pregledi, DM-ovi) se meri od nule i ispuna ispod linije je tačna.
   *
   * `"fitted"` je za nivo koji se ne resetuje: broj pratilaca ide oko 12.300 i
   * na osi od nule je ravna crta na 98% visine, gde se promena ne vidi. Tada se
   * osa steže oko podataka i ispuna se gasi — površina od proizvoljne osnove
   * ne znači ništa, pa ostaje samo linija.
   *
   * Ne važi za donji panel: trake uvek kreću od nule.
   */
  baseline?: "zero" | "fitted";
};

const TOP_H = "h-52";
const BOTTOM_H = "h-28";

/**
 * Prostor iznad najviše marke, da direktna oznaka ne izlazi iz panela — kao
 * udeo visine panela. Dodaje se samo koliko fali: okrugli podeoci obično već
 * ostave višak iznad maksimuma, pa se u tom slučaju opseg ne dira i panel ne
 * ostaje poluprazan. Donji panel je upola niži, pa mu treba veći udeo.
 */
const AREA_HEADROOM = 0.08;
const BARS_HEADROOM = 0.18;

/** Gornja granica ose: viša od poslednjeg podeoka i od maksimuma sa razmakom. */
function ceilingFor(floor: number, top: number, max: number, headroom: number) {
  return Math.max(top, max + (top - floor) * headroom);
}

export function TimelineChart({
  dates,
  area,
  bars,
  syncId,
  yWidth = 48,
  emptyReason,
}: {
  dates: string[];
  area: TimelineMeasure;
  /** Izostavljeno = jedan panel. */
  bars?: TimelineMeasure;
  /** Vezuje dva panela u jednu x-osu. Jedinstven po ekranu. */
  syncId: string;
  yWidth?: number;
  /** Objašnjava ZAŠTO je prazno — ne samo da jeste. */
  emptyReason: ReactNode;
}) {
  const rows = dates.map((date, i) => ({
    date,
    i,
    area: area.values[i] ?? 0,
    bars: bars ? (bars.values[i] ?? 0) : 0,
  }));

  const areaMax = Math.max(0, ...rows.map((r) => r.area));
  const barsMax = Math.max(0, ...rows.map((r) => r.bars));

  if (rows.length === 0 || (areaMax === 0 && barsMax === 0)) {
    return (
      <Card className="gap-0 py-0 shadow-card ring-line">
        <div className="px-5 pt-5">
          <PanelTitle color={area.color} title={area.label} />
        </div>
        <ChartEmpty reason={emptyReason} />
      </Card>
    );
  }

  const config: ChartConfig = {
    area: { label: area.label },
    ...(bars ? { bars: { label: bars.label } } : {}),
  };

  const fitted = area.baseline === "fitted";
  const areaTicks = fitted
    ? fittedTicks(Math.min(...rows.map((r) => r.area)), areaMax, 3)
    : niceTicks(areaMax, 3);
  const barsTicks = bars ? niceTicks(barsMax, 1) : [0];
  const areaFloor = fitted ? areaTicks[0] : 0;
  const areaTop = areaTicks[areaTicks.length - 1];
  const barsTop = barsTicks[barsTicks.length - 1];
  const areaCeiling = ceilingFor(areaFloor, areaTop, areaMax, AREA_HEADROOM);
  const barsCeiling = ceilingFor(0, barsTop, barsMax, BARS_HEADROOM);

  const areaMarks = markedPoints(rows.map((r) => r.area));
  const barsPeak = bars ? peakIndex(rows.map((r) => r.bars)) : -1;

  return (
    <Card className="gap-0 py-0 shadow-card ring-line">
      <div className="px-5 pt-5">
        <PanelTitle color={area.color} title={area.label} />
      </div>
      <ChartContainer
        config={config}
        className={`${TOP_H} w-full px-3 pt-2 aspect-auto ${bars ? "" : "pb-3"}`}
      >
        <AreaChart
          data={rows}
          syncId={syncId}
          margin={{ top: 12, right: 12, bottom: bars ? 8 : 0, left: 0 }}
        >
          <CartesianGrid
            vertical={false}
            stroke="var(--color-chart-grid)"
            strokeDasharray="0"
          />
          {/* Bez donjeg panela x-osu nosi gornji — inače bi grafikon ostao
              bez datuma. Prorede se prema raspoloživoj širini. */}
          <XAxis
            dataKey="date"
            hide={Boolean(bars)}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={44}
            tickFormatter={formatShortDate}
            tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
            tickMargin={8}
          />
          <YAxis
            width={yWidth}
            axisLine={false}
            tickLine={false}
            ticks={areaTicks}
            interval={0}
            domain={[areaFloor, areaCeiling]}
            tickFormatter={area.format}
            tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
          />
          <ChartTooltip
            cursor={{ stroke: "var(--color-line-strong)", strokeWidth: 1 }}
            isAnimationActive={false}
            content={(props) => (
              <TimelineTooltip
                active={props.active}
                row={firstRow(props.payload)}
                rows={rows}
                area={area}
                bars={bars}
              />
            )}
          />
          <Area
            dataKey="area"
            type="monotone"
            stroke={area.color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill={area.color}
            fillOpacity={fitted ? 0 : 0.1}
            dot={false}
            activeDot={{
              r: 4,
              strokeWidth: 2,
              stroke: "var(--color-card)",
              fill: area.color,
            }}
            isAnimationActive={false}
          >
            {/* Prva, poslednja i ekstremna tačka — nikad broj na svakoj. */}
            <LabelList
              dataKey="area"
              content={(props) =>
                renderAreaLabel(props, areaMarks, area.color, area.format)
              }
            />
          </Area>
        </AreaChart>
      </ChartContainer>

      {bars && (
        <>
          <div className="mt-3 border-t border-line-soft px-5 pt-4">
            <PanelTitle color={bars.color} title={bars.label} />
          </div>
          <ChartContainer
            config={config}
            className={`${BOTTOM_H} w-full px-3 pt-2 pb-3 aspect-auto`}
          >
            <BarChart
              data={rows}
              syncId={syncId}
              /* Gornja margina je prostor za direktnu oznaku iznad najviše trake. */
              margin={{ top: 11, right: 12, bottom: 0, left: 0 }}
              /* 2 px u boji podloge razdvaja susedne trake — bez linije oko njih. */
              barCategoryGap={2}
            >
              <CartesianGrid vertical={false} stroke="var(--color-chart-grid)" />
              {/* Prorede se prema raspoloživoj širini, a ne prema broju dana —
                  fiksnih „najviše sedam" na telefonu daje sedam slepljenih datuma.
                  Prvi i poslednji dan ostaju uvek. */}
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
                width={yWidth}
                axisLine={false}
                tickLine={false}
                ticks={barsTicks}
                interval={0}
                domain={[0, barsCeiling]}
                allowDecimals={false}
                tickFormatter={bars.format}
                tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
              />
              {/* Očitavanje za oba panela stoji u gornjem; ovde ostaje samo
                  isticanje trake preko koje je pokazivač. */}
              <ChartTooltip
                cursor={{ fill: "var(--color-line-soft)" }}
                content={() => null}
              />
              <Bar
                dataKey="bars"
                fill={bars.color}
                /* Zaobljenje samo na kraju koji nije na osnovnoj liniji. */
                radius={[4, 4, 0, 0]}
                maxBarSize={24}
                isAnimationActive={false}
              >
                <LabelList
                  dataKey="bars"
                  content={(props) =>
                    renderBarLabel(props, barsPeak, bars.format)
                  }
                />
              </Bar>
            </BarChart>
          </ChartContainer>
        </>
      )}
    </Card>
  );
}

// ── naslov panela ────────────────────────────────────────────────────────────

/** Tekst nosi tekstualni token; identitet nosi tačkica pored njega. */
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

// ── očitavanje ───────────────────────────────────────────────────────────────

type Row = { date: string; i: number; area: number; bars: number };

function firstRow(payload: unknown): Row | undefined {
  const list = payload as Array<{ payload?: Row }> | undefined;
  return list?.[0]?.payload;
}

/**
 * Sve serije za taj dan, opadajuće po vrednosti, uz promenu u odnosu na
 * prethodni dan. Vrednost je jaka, ime serije prateće — čitalac već zna koju
 * seriju gleda i traži broj.
 */
function TimelineTooltip({
  active,
  row,
  rows,
  area,
  bars,
}: {
  active?: boolean;
  row?: Row;
  rows: Row[];
  area: TimelineMeasure;
  bars?: TimelineMeasure;
}) {
  if (!active || !row) return null;
  const prev = row.i > 0 ? rows[row.i - 1] : undefined;

  const entries = [
    {
      label: area.label,
      color: area.color,
      value: row.area,
      text: area.format(row.area),
      change: relativeChange(row.area, prev?.area),
    },
    ...(bars
      ? [
          {
            label: bars.label,
            color: bars.color,
            value: row.bars,
            text: bars.format(row.bars),
            change: relativeChange(row.bars, prev?.bars),
          },
        ]
      : []),
  ];

  // Opadajuće po vrednosti — ali samo kada obe serije mere u istoj jedinici.
  // Pregledi i minuti gledanja nisu uporedivi: sortiranje bi „333 h" stavilo
  // iznad „7.475" i to bi izgledalo kao poredak, a nije. Tada redosled prati
  // panele, odozgo nadole.
  if (bars && area.format === bars.format) {
    entries.sort((a, b) => b.value - a.value);
  }

  return (
    <div className="min-w-56 rounded-lg border border-line bg-popover px-3 py-2 text-xs shadow-elev-2">
      <p className="text-text-muted">{formatLongDate(row.date)}</p>
      <dl className="mt-1.5 space-y-1">
        {entries.map((e) => (
          <div key={e.label} className="flex items-center justify-between gap-4">
            <dt className="flex items-center gap-2 text-muted-foreground">
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: e.color }}
                aria-hidden
              />
              {e.label}
            </dt>
            <dd className="flex items-baseline gap-2">
              <span className="font-mono font-medium tabular-nums text-foreground">
                {e.text}
              </span>
              <span className="w-14 text-right font-mono tabular-nums text-text-muted">
                {e.change === null ? "—" : formatSignedPercent(e.change)}
              </span>
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-1.5 text-[0.6875rem] text-text-muted">
        Desna kolona: promena u odnosu na prethodni dan.
      </p>
    </div>
  );
}

/** `null` kada poređenje ne postoji ili bi delilo nulom. */
function relativeChange(value: number, previous?: number): number | null {
  if (previous === undefined || previous === 0) return null;
  return (value - previous) / previous;
}

// ── direktne oznake ──────────────────────────────────────────────────────────

type MarkKind = "first" | "last" | "peak";

/** `below` = oznaka ide ispod tačke, jer je prostor iznad zauzet linijom. */
type Mark = { kind: MarkKind; below: boolean };

type MarkProps = {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
  index?: number;
  value?: unknown;
  /** Okvir crtaće površine panela — služi da oznaka ne izađe iz njega.
      Recharts ovde šalje uniju kartezijanskog i polarnog okvira. */
  parentViewBox?: unknown;
};

/** Prazan čvor: `content` mora da vrati element, a ne `null`. */
const NO_LABEL = <g />;

/** Odmak osnovne linije teksta od tačke, naviše i naniže. */
const LABEL_RISE = 11;
const LABEL_DROP = 18;

/** Gornja i donja ivica crtaće površine; bez okvira nema ni ograničenja. */
function plotBand(viewBox: unknown): { top: number; bottom: number } {
  const box = viewBox as { y?: unknown; height?: unknown } | undefined;
  const y = typeof box?.y === "number" ? box.y : undefined;
  const height = typeof box?.height === "number" ? box.height : undefined;
  if (y === undefined || height === undefined) return { top: 0, bottom: Infinity };
  return { top: y, bottom: y + height };
}

/**
 * Prva, poslednja i ekstremna tačka. Ekstrem se preskače kada je blizu nekog
 * kraja — taj kraj već nosi isti broj, a dve oznake jedna preko druge su gore
 * nego nijedna.
 */
function markedPoints(values: number[]): Map<number, Mark> {
  const marks = new Map<number, Mark>();
  const n = values.length;
  if (n === 0) return marks;

  // Vrh je lokalni maksimum, pa je iznad njega uvek prazno.
  const peak = peakIndex(values);
  const guard = Math.max(1, Math.ceil(n * 0.1));
  if (values[peak] > 0 && peak > guard && peak < n - 1 - guard) {
    marks.set(peak, { kind: "peak", below: false });
  }
  // Na krajevima linija ulazi u prostor oznake: ako se penje od prve tačke
  // (ili pada u poslednju), iznad je linija, pa oznaka silazi ispod.
  if (n >= 3) marks.set(0, { kind: "first", below: values[1] > values[0] });
  if (n >= 2) {
    marks.set(n - 1, { kind: "last", below: values[n - 2] > values[n - 1] });
  }
  return marks;
}

function peakIndex(values: number[]): number {
  return values.reduce((best, v, i) => (v > values[best] ? i : best), 0);
}

function renderAreaLabel(
  props: MarkProps,
  marks: Map<number, Mark>,
  color: string,
  format: (v: number) => string,
) {
  const { index, x, y } = props;
  const mark = index === undefined ? undefined : marks.get(index);
  if (!mark || typeof x !== "number" || typeof y !== "number") return NO_LABEL;

  const value = Number(props.value);
  if (!Number.isFinite(value)) return NO_LABEL;

  const { kind } = mark;
  // Ivica panela nadjačava izbor strane: bolje preko linije nego odsečeno.
  const { top, bottom } = plotBand(props.parentViewBox);
  let below = mark.below;
  if (!below && y - LABEL_RISE < top + 9) below = true;
  if (below && y + LABEL_DROP > bottom - 1) below = false;

  const textY = below ? y + LABEL_DROP : y - LABEL_RISE;
  // Oznaka tačno iznad krajnje tačke sedne na samu tačku, pa se odmakne u
  // stranu ka unutrašnjosti panela.
  const anchor = kind === "first" ? "start" : kind === "last" ? "end" : "middle";
  const textX = kind === "first" ? x + 7 : kind === "last" ? x - 7 : x;

  return (
    <g>
      <circle
        cx={x}
        cy={y}
        r={4}
        fill={color}
        stroke="var(--color-card)"
        strokeWidth={2}
      />
      <text
        x={textX}
        y={textY}
        textAnchor={anchor}
        className="font-mono text-[0.6875rem] tabular-nums"
        fill={
          kind === "peak"
            ? "var(--color-text-primary)"
            : "var(--color-text-secondary)"
        }
      >
        {format(value)}
      </text>
    </g>
  );
}

/** Na kratkom panelu staje samo jedna oznaka — ekstrem. */
function renderBarLabel(
  props: MarkProps,
  peak: number,
  format: (v: number) => string,
) {
  const { index, x, y, width } = props;
  if (index !== peak) return NO_LABEL;
  if (typeof x !== "number" || typeof y !== "number" || typeof width !== "number") {
    return NO_LABEL;
  }

  const value = Number(props.value);
  if (!Number.isFinite(value) || value <= 0) return NO_LABEL;

  return (
    <text
      x={x + width / 2}
      y={Math.max(LABEL_RISE, y - 5)}
      textAnchor="middle"
      className="font-mono text-[0.6875rem] tabular-nums"
      fill="var(--color-text-primary)"
    >
      {format(value)}
    </text>
  );
}

// ── ose ──────────────────────────────────────────────────────────────────────

/** Okrugli podeoci (0, korak, 2·korak, …) koji pokrivaju `max` — nikad 95/190. */
function niceTicks(max: number, count: number): number[] {
  if (max <= 0) return [0, 1];
  const rough = max / count;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= rough)!;
  return Array.from({ length: count + 1 }, (_, i) => i * step);
}

/**
 * Okrugli podeoci koji obuhvataju [min, max] bez obaveze da krenu od nule —
 * za nivo koji se ne resetuje. Korak raste dok poslednji podeok ne pokrije
 * `max`, pa petlja uvek stane.
 */
function fittedTicks(min: number, max: number, count: number): number[] {
  const span = Math.max(max - min, 1);
  const mag = 10 ** Math.floor(Math.log10(span / count));
  for (const mult of [1, 2, 5, 10, 20, 50, 100]) {
    const step = mult * mag;
    const base = Math.floor(min / step) * step;
    if (base + count * step >= max) {
      return Array.from({ length: count + 1 }, (_, i) =>
        Number((base + i * step).toPrecision(12)),
      );
    }
  }
  return niceTicks(max, count);
}

// ── skelet ───────────────────────────────────────────────────────────────────

/** Isti okvir i iste visine kao učitan grafikon — dolazak podataka ne pomera ništa. */
export function TimelineChartSkeleton({
  topLabelWidth = "w-16",
  bottomLabelWidth = "w-24",
  /** `false` = jedan panel, isto kao i sam grafikon bez donje mere. */
  bottomPanel = true,
}: {
  topLabelWidth?: string;
  bottomLabelWidth?: string;
  bottomPanel?: boolean;
}) {
  return (
    <Card className="gap-0 py-0 shadow-card ring-line">
      <div className="px-5 pt-5">
        <Skeleton className={`h-4 ${topLabelWidth}`} />
      </div>
      <ChartShapeSkeleton
        variant="area"
        className={`${TOP_H} px-5 pt-2 ${bottomPanel ? "" : "pb-3"}`}
      />
      {bottomPanel && (
        <>
          <div className="mt-3 border-t border-line-soft px-5 pt-4">
            <Skeleton className={`h-4 ${bottomLabelWidth}`} />
          </div>
          <ChartShapeSkeleton
            variant="bars"
            className={`${BOTTOM_H} px-5 pt-2 pb-3`}
          />
        </>
      )}
    </Card>
  );
}
