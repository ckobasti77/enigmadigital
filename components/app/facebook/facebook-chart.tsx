"use client";

import {
  TimelineChart,
  TimelineChartSkeleton,
} from "@/components/app/timeline-chart";
import { formatNumber } from "@/lib/format";
import type { FbDailyPoint } from "@/lib/metrics";

/**
 * Broj pratilaca stranice i dnevni broj prikaza — isti par kao na Instagram
 * grafikonu (nivo gore, protok dole), da se ista pitanja čitaju na istom mestu
 * kad se pređe sa jednog ekrana na drugi.
 */
export function FacebookChart({ data }: { data: FbDailyPoint[] }) {
  return (
    <TimelineChart
      syncId="facebook-timeline"
      dates={data.map((d) => d.date)}
      area={{
        label: "Pratioci stranice",
        color: "var(--color-chart-1)",
        values: data.map((d) => d.fans),
        format: formatNumber,
        // Nivo, ne protok: na osi od nule promena od par stotina pratilaca je
        // ravna crta pri vrhu panela.
        baseline: "fitted",
      }}
      bars={{
        label: "Dnevni prikazi",
        color: "var(--color-chart-2)",
        values: data.map((d) => d.impressions),
        format: formatNumber,
      }}
      emptyReason="Facebook nije prijavio nijedan prikaz ni pratioca u ovom periodu. Uvidi stranice stižu pri sinhronizaciji na svakih 6 sati."
    />
  );
}

export function FacebookChartSkeleton() {
  return <TimelineChartSkeleton topLabelWidth="w-32" bottomLabelWidth="w-28" />;
}
