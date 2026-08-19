"use client";

import {
  TimelineChart,
  TimelineChartSkeleton,
} from "@/components/app/timeline-chart";
import { formatNumber } from "@/lib/format";
import type { IgDailyPoint } from "@/lib/metrics";

/** Broj pratilaca i dnevni doseg. Oblik je u `timeline-chart.tsx`. */
export function InstagramChart({ data }: { data: IgDailyPoint[] }) {
  return (
    <TimelineChart
      syncId="instagram-timeline"
      dates={data.map((d) => d.date)}
      area={{
        label: "Broj pratilaca",
        color: "var(--color-chart-1)",
        values: data.map((d) => d.followersCount),
        format: formatNumber,
        // Nivo, ne protok: na osi od nule promena od par stotina pratilaca je
        // ravna crta pri vrhu panela.
        baseline: "fitted",
      }}
      bars={{
        label: "Dnevni doseg",
        color: "var(--color-chart-2)",
        values: data.map((d) => d.reach),
        format: formatNumber,
      }}
      emptyReason="Instagram nije prijavio nijednog pratioca ni doseg u ovom periodu. Istorija seže 90 dana unazad od prve sinhronizacije."
    />
  );
}

export function InstagramChartSkeleton() {
  return <TimelineChartSkeleton topLabelWidth="w-28" bottomLabelWidth="w-28" />;
}
