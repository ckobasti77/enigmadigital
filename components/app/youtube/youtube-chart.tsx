"use client";

import {
  TimelineChart,
  TimelineChartSkeleton,
} from "@/components/app/timeline-chart";
import { formatNumber, formatWatchTime } from "@/lib/format";
import type { YtDailyPoint } from "@/lib/metrics";

/** Pregledi i vreme gledanja kroz vreme. Oblik je u `timeline-chart.tsx`. */
export function YouTubeChart({ data }: { data: YtDailyPoint[] }) {
  return (
    <TimelineChart
      syncId="youtube-timeline"
      dates={data.map((d) => d.date)}
      area={{
        label: "Pregledi",
        color: "var(--color-chart-1)",
        values: data.map((d) => d.views),
        format: formatNumber,
      }}
      bars={{
        label: "Vreme gledanja",
        color: "var(--color-chart-2)",
        values: data.map((d) => d.estimatedMinutesWatched),
        format: formatWatchTime,
      }}
      emptyReason="Kanal nije zabeležio nijedan pregled u ovom periodu. Istorija seže 90 dana unazad od prve sinhronizacije."
    />
  );
}

export function YouTubeChartSkeleton() {
  return <TimelineChartSkeleton topLabelWidth="w-28" bottomLabelWidth="w-36" />;
}
