"use client";

import {
  TimelineChart,
  TimelineChartSkeleton,
} from "@/components/app/timeline-chart";
import { formatNumber } from "@/lib/format";
import type { DailyPoint } from "@/lib/metrics";

/** Sesije i konverzije kroz vreme. Oblik i pravila su u `timeline-chart.tsx`. */
export function SessionsChart({ data }: { data: DailyPoint[] }) {
  return (
    <TimelineChart
      syncId="ga4-timeline"
      yWidth={44}
      dates={data.map((d) => d.date)}
      area={{
        label: "Sesije",
        color: "var(--color-chart-1)",
        values: data.map((d) => d.sessions),
        format: formatNumber,
      }}
      bars={{
        label: "Konverzije",
        color: "var(--color-chart-2)",
        values: data.map((d) => d.conversions),
        format: formatNumber,
      }}
      emptyReason="GA4 nije prijavio nijednu sesiju ni konverziju u ovom periodu. Istorija seže 90 dana unazad od prve sinhronizacije."
    />
  );
}

export function SessionsChartSkeleton() {
  return <TimelineChartSkeleton topLabelWidth="w-16" bottomLabelWidth="w-20" />;
}
