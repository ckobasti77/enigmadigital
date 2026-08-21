"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { TabNav } from "@/components/app/tab-nav";
import {
  TimelineChart,
  TimelineChartSkeleton,
} from "@/components/app/timeline-chart";
import { Card } from "@/components/ui/card";
import { ChartEmpty } from "@/components/app/chart-states";
import { formatNumber } from "@/lib/format";
import { BreakdownChart, type BreakdownSeries } from "./breakdown-chart";
import { FollowsDivergingChart } from "./follows-chart";

/**
 * Glavni grafikon /instagram ekrana: biraš jednu od metrika iz `igMetricDaily`
 * i, kad mera to podržava, razdvajanje po dimenziji. Sve tri boje modela
 * preživljavaju: metrika bez ijedne vrednosti se NE crta kao nula — panel
 * ostaje prazan sa razlogom.
 *
 * Katalog metrika ovde je klijentski (ne uvozi se iz `convex/lib/igMetrics`,
 * koji povlači serverski `instagramApi`) — kratak, stabilan spisak Meta
 * metrika, sa istim ključevima kao katalog na serveru.
 */

type BreakdownDim =
  | "media_product_type"
  | "follow_type"
  | "contact_button_type"
  | "follower_type";

type MetricDesc = {
  key: string;
  label: string;
  breakdowns: readonly BreakdownDim[];
  special?: "followers" | "diverging";
  baseline?: "fitted" | "zero";
};

const METRICS: readonly MetricDesc[] = [
  {
    key: "followers",
    label: "Broj pratilaca",
    breakdowns: [],
    special: "followers",
    baseline: "fitted",
  },
  { key: "reach", label: "Doseg", breakdowns: ["media_product_type", "follow_type"] },
  {
    key: "views",
    label: "Pregledi sadržaja",
    breakdowns: ["media_product_type", "follower_type"],
  },
  {
    key: "total_interactions",
    label: "Ukupno interakcija",
    breakdowns: ["media_product_type"],
  },
  { key: "accounts_engaged", label: "Angažovani nalozi", breakdowns: [] },
  { key: "likes", label: "Lajkovi", breakdowns: ["media_product_type"] },
  { key: "comments", label: "Komentari", breakdowns: ["media_product_type"] },
  { key: "saves", label: "Čuvanja", breakdowns: ["media_product_type"] },
  { key: "shares", label: "Deljenja", breakdowns: ["media_product_type"] },
  { key: "profile_views", label: "Pregledi profila", breakdowns: [] },
  {
    key: "profile_links_taps",
    label: "Dodiri linkova i dugmadi",
    breakdowns: ["contact_button_type"],
  },
  { key: "replies", label: "Odgovori na priče", breakdowns: [] },
  { key: "reposts", label: "Ponovne objave", breakdowns: [] },
  {
    key: "follows_and_unfollows",
    label: "Praćenja i otpraćivanja",
    breakdowns: ["follow_type"],
    special: "diverging",
  },
] as const;

const DIM_LABEL: Record<BreakdownDim, string> = {
  media_product_type: "Po tipu sadržaja",
  follow_type: "Po pratiocu",
  contact_button_type: "Po dugmetu",
  follower_type: "Po tipu gledaoca",
};

/** Fiksan redosled vrednosti po dimenziji — boja prati entitet, ne rang. */
const VALUE_ORDER: Record<BreakdownDim, readonly string[]> = {
  media_product_type: ["FEED", "REELS", "STORY", "AD"],
  follow_type: ["FOLLOWER", "NON_FOLLOWER", "UNKNOWN"],
  contact_button_type: [
    "BOOK_NOW",
    "CALL",
    "DIRECTION",
    "EMAIL",
    "INSTANT_EXPERIENCE",
    "TEXT",
    "UNDEFINED",
  ],
  follower_type: [], // Meta ne objavljuje vrednosti — čitaju se dinamički.
};

const VALUE_LABEL: Record<string, string> = {
  FEED: "Feed",
  REELS: "Reels",
  STORY: "Priče",
  AD: "Oglasi",
  FOLLOWER: "Pratioci",
  NON_FOLLOWER: "Nepratioci",
  UNKNOWN: "Nepoznato",
  BOOK_NOW: "Zakazivanje",
  CALL: "Poziv",
  DIRECTION: "Ruta",
  EMAIL: "Email",
  INSTANT_EXPERIENCE: "Instant",
  TEXT: "Poruka",
  UNDEFINED: "Nedefinisano",
};

const prettyValue = (v: string) => VALUE_LABEL[v] ?? v;

const CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--color-chart-6)",
] as const;

type MetricPoint = {
  date: string;
  dimensionKeys: string[];
  dimensionValues: string[];
  value?: number;
  state: "value" | "suppressed" | "unavailable";
  reason?: string;
};

type AggState = { state: "value" | "suppressed" | "unavailable"; reason?: string };

/** Stanje cele serije: „value" čim postoji ijedna vrednost; inače prvi razlog. */
function aggregateState(points: MetricPoint[]): AggState {
  if (points.some((p) => p.state === "value" && typeof p.value === "number")) {
    return { state: "value" };
  }
  const supp = points.find((p) => p.state === "suppressed");
  if (supp) return { state: "suppressed", reason: supp.reason };
  const unav = points.find((p) => p.state === "unavailable");
  if (unav) return { state: "unavailable", reason: unav.reason };
  return {
    state: "unavailable",
    reason: "Meta nije prijavila ovu meru za izabrani period.",
  };
}

export function MetricExplorer({
  from,
  to,
  dates,
  followers,
}: {
  from: string;
  to: string;
  dates: string[];
  /** Broj pratilaca po danu — nivo koji ne živi u `igMetricDaily`. */
  followers: number[];
}) {
  const [metricKey, setMetricKey] = useState<string>("followers");
  const [breakdown, setBreakdown] = useState<string>("");

  const metric = METRICS.find((m) => m.key === metricKey) ?? METRICS[0];
  const isFollowers = metric.special === "followers";
  const isDiverging = metric.special === "diverging";

  const activeDim: BreakdownDim | undefined = isDiverging
    ? "follow_type"
    : (breakdown as BreakdownDim) || undefined;

  const points = useQuery(
    api.instagramStore.metricSeries,
    isFollowers
      ? "skip"
      : { metric: metric.key, from, to, dimensionKey: activeDim },
  ) as MetricPoint[] | undefined;

  const overall = useMemo(() => {
    if (!points) return undefined;
    const byDate = new Map<string, MetricPoint>();
    for (const p of points) {
      if (p.dimensionKeys.length === 0) byDate.set(p.date, p);
    }
    const agg = aggregateState([...byDate.values()]);
    const values = dates.map((d) => {
      const p = byDate.get(d);
      return p && p.state === "value" && typeof p.value === "number"
        ? p.value
        : 0;
    });
    return { agg, values };
  }, [points, dates]);

  const breakdownSeries = useMemo<BreakdownSeries[]>(() => {
    if (!points || !activeDim || isDiverging) return [];
    const byValue = new Map<string, Map<string, MetricPoint>>();
    for (const p of points) {
      const idx = p.dimensionKeys.indexOf(activeDim);
      if (idx === -1) continue;
      const dv = p.dimensionValues[idx];
      if (!byValue.has(dv)) byValue.set(dv, new Map());
      byValue.get(dv)!.set(p.date, p);
    }
    const order = VALUE_ORDER[activeDim];
    const present = [...byValue.keys()];
    const ordered = order.length
      ? [
          ...order.filter((v) => byValue.has(v)),
          ...present.filter((v) => !order.includes(v)),
        ]
      : present;
    return ordered.map((dv, i) => {
      const canonical = order.indexOf(dv);
      const colorIdx = canonical === -1 ? i : canonical;
      const perDate = byValue.get(dv)!;
      const values = dates.map((d) => {
        const p = perDate.get(d);
        return p && p.state === "value" && typeof p.value === "number"
          ? p.value
          : null;
      });
      return {
        key: dv,
        label: prettyValue(dv),
        color: CHART_COLORS[colorIdx % CHART_COLORS.length],
        values,
      };
    });
  }, [points, activeDim, isDiverging, dates]);

  const divergingValues = useMemo<(number | null)[]>(() => {
    if (!points || !isDiverging) return [];
    const byDate = new Map<string, { sum: number; any: boolean }>();
    for (const p of points) {
      const cur = byDate.get(p.date) ?? { sum: 0, any: false };
      if (p.state === "value" && typeof p.value === "number") {
        cur.sum += p.value;
        cur.any = true;
      }
      byDate.set(p.date, cur);
    }
    return dates.map((d) => {
      const e = byDate.get(d);
      return e && e.any ? e.sum : null;
    });
  }, [points, isDiverging, dates]);

  const breakdownTabs = useMemo(
    () => [
      { id: "", label: "Ukupno" },
      ...metric.breakdowns.map((b) => ({ id: b, label: DIM_LABEL[b] })),
    ],
    [metric],
  );

  const onMetric = (key: string) => {
    setMetricKey(key);
    setBreakdown(""); // razdvajanja se razlikuju po metrici — kreni od „Ukupno"
  };

  const title = metric.label;
  const loading = !isFollowers && points === undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-text-muted">Metrika</span>
          <select
            value={metricKey}
            onChange={(e) => onMetric(e.target.value)}
            className="h-9 rounded-lg border border-line bg-surface-raised px-3 text-sm font-medium text-foreground outline-none transition-colors focus-visible:border-line-strong"
          >
            {METRICS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </label>

        {!isDiverging && metric.breakdowns.length > 0 && (
          <TabNav
            tabs={breakdownTabs}
            active={breakdown}
            onChange={setBreakdown}
            panelId="ig-explorer-panel"
          />
        )}
      </div>

      <div id="ig-explorer-panel">
        {loading ? (
          <TimelineChartSkeleton
            topLabelWidth="w-32"
            bottomPanel={false}
          />
        ) : isFollowers ? (
          <TimelineChart
            syncId="ig-explorer"
            dates={dates}
            area={{
              label: title,
              color: "var(--color-chart-1)",
              values: followers,
              format: formatNumber,
              baseline: "fitted",
            }}
            emptyReason="Instagram nije prijavio broj pratilaca u ovom periodu. Istorija seže 90 dana unazad od prve sinhronizacije."
          />
        ) : isDiverging ? (
          <FollowsDivergingChart
            title={title}
            dates={dates}
            values={divergingValues}
            format={formatNumber}
            emptyReason="Meta nije prijavila praćenja ni otpraćivanja u ovom periodu (ili su ispod praga prikaza)."
          />
        ) : activeDim ? (
          <BreakdownChart
            title={`${title} · ${DIM_LABEL[activeDim]}`}
            dates={dates}
            series={breakdownSeries}
            format={formatNumber}
            emptyReason="Meta nije prijavila razdvajanje za ovu meru u izabranom periodu."
          />
        ) : overall && overall.agg.state !== "value" ? (
          <Card className="gap-0 py-0 shadow-card ring-line">
            <div className="px-5 pt-5">
              <p className="text-sm font-medium text-foreground">{title}</p>
            </div>
            <ChartEmpty
              reason={
                overall.agg.reason ??
                "Meta nije prijavila ovu meru za izabrani period."
              }
            />
          </Card>
        ) : (
          <TimelineChart
            syncId="ig-explorer"
            dates={dates}
            area={{
              label: title,
              color: "var(--color-chart-1)",
              values: overall?.values ?? [],
              format: formatNumber,
              baseline: metric.baseline ?? "zero",
            }}
            emptyReason="Nema podataka za ovu meru u izabranom periodu. Istorija seže 90 dana unazad od prve sinhronizacije."
          />
        )}
      </div>
    </div>
  );
}
