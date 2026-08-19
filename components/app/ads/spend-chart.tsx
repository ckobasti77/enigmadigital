"use client";

import { useMemo } from "react";
import {
  TimelineChart,
  TimelineChartSkeleton,
} from "@/components/app/timeline-chart";
import { formatNumber } from "@/lib/format";
import type { CampaignRow } from "./campaigns-table";

const formatEur = (v: number) => `${formatNumber(v)} €`;

/**
 * Dnevna potrošnja preko svih kampanja — jedina mera koju izveštaj nosi po
 * danima. Rezultati i CPA postoje samo kao zbir za period, pa donjeg panela
 * nema: prazne trake ispod linije obećale bi poređenje kojeg u podacima nema.
 *
 * Zbir se računa ovde, iz `dailySpend` koji svaka kampanja već donosi. Nijedan
 * nov upit, i broj je proverljiv sabiranjem redova u tabeli ispod.
 */
export function SpendChart({ campaigns }: { campaigns: CampaignRow[] }) {
  const { dates, values } = useMemo(() => {
    const byDate = new Map<string, number>();
    for (const campaign of campaigns) {
      for (const day of campaign.dailySpend) {
        byDate.set(day.date, (byDate.get(day.date) ?? 0) + day.spend);
      }
    }
    const dates = [...byDate.keys()].sort();
    return {
      dates,
      values: dates.map((d) => Number((byDate.get(d) ?? 0).toFixed(2))),
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
        format: formatEur,
      }}
      emptyReason="Nijedna kampanja nije trošila budžet u ovom periodu. Ako je nalog aktivan, sinhronizacija još nije stigla do ovih dana."
    />
  );
}

export function SpendChartSkeleton() {
  return <TimelineChartSkeleton topLabelWidth="w-32" bottomPanel={false} />;
}
