"use client";

import {
  TimelineChart,
  TimelineChartSkeleton,
} from "@/components/app/timeline-chart";
import { formatNumber } from "@/lib/format";
import type { OrDailyPoint } from "@/lib/metrics";

/** Poslati DM-ovi i klikovi kroz vreme. Oblik je u `timeline-chart.tsx`. */
export function OpenReplyChart({ data }: { data: OrDailyPoint[] }) {
  return (
    <TimelineChart
      syncId="openreply-timeline"
      yWidth={44}
      dates={data.map((d) => d.date)}
      area={{
        label: "Poslati DM-ovi",
        color: "var(--color-chart-1)",
        values: data.map((d) => d.dmsSent),
        format: formatNumber,
      }}
      bars={{
        label: "Klikovi na linkove",
        color: "var(--color-chart-2)",
        values: data.map((d) => d.linkClicks),
        format: formatNumber,
      }}
      emptyReason="Nijedna automatizacija nije poslala DM u ovom periodu. Istorija seže 90 dana unazad od prve sinhronizacije."
    />
  );
}

export function OpenReplyChartSkeleton() {
  return <TimelineChartSkeleton topLabelWidth="w-28" bottomLabelWidth="w-32" />;
}
