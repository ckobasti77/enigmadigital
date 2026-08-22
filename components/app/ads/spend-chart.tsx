"use client";

import { useMemo } from "react";
import {
  TimelineChart,
  TimelineChartSkeleton,
} from "@/components/app/timeline-chart";
import { formatMetric } from "@/convex/lib/metaAdsFormat";
import { resolveMetric } from "@/convex/lib/metaAdsCatalog";
import type { CampaignRow } from "./campaigns-table";

const spendDef = resolveMetric("spend")!;

/**
 * Dnevna potrošnja preko svih kampanja — jedina mera koju izveštaj nosi po
 * danima. Rezultati i CPA postoje samo kao zbir za period, pa donjeg panela
 * nema: prazne trake ispod linije obećale bi poređenje kojeg u podacima nema.
 *
 * Zbir se računa ovde, iz `dailySpend` koji svaka kampanja već donosi. Nijedan
 * nov upit, i broj je proverljiv sabiranjem redova u tabeli ispod.
 */
export function SpendChart({
  campaigns,
  currency,
}: {
  campaigns: CampaignRow[];
  currency?: string;
}) {
  const { dates, values } = useMemo(() => {
    const byDate = new Map<string, number>();
    const knownDates = new Set<string>();

    for (const campaign of campaigns) {
      for (const day of campaign.dailySpend) {
        knownDates.add(day.date);
        const current = byDate.get(day.date);
        if (current !== undefined) {
          byDate.set(day.date, current + day.spend);
        } else {
          byDate.set(day.date, day.spend);
        }
      }
    }
    const dates = [...knownDates].sort();
    return {
      dates,
      values: dates.map((d) => {
        const val = byDate.get(d);
        return val !== undefined ? Number(val.toFixed(2)) : null;
      }),
    };
  }, [campaigns]);

  return (
    <TimelineChart
      syncId="ads-timeline"
      yWidth={56}
      dates={dates}
      area={{
        label: "Dnevna potrošnja",
        color: "var(--color-chart-1)",
        values,
        format: (v: number) => formatMetric(v, spendDef, currency),
      }}
      emptyReason="Nijedna kampanja nije trošila budžet u ovom periodu. Ako je nalog aktivan, sinhronizacija još nije stigla do ovih dana."
    />
  );
}

export function SpendChartSkeleton() {
  return <TimelineChartSkeleton topLabelWidth="w-32" bottomPanel={false} />;
}
