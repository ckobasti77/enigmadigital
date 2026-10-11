"use client";

import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { formatNumber } from "@/lib/format";
import { RankTable, RankTableSkeleton, type RankColumn } from "./rank-table";
import { metricFormat } from "./metric-state";

type Traffic = FunctionReturnType<typeof api.analytics.traffic>;

type Row = {
  source: string;
  medium: string;
  campaign: string;
  sessions?: number;
  keyEvents?: number;
};

const columns: RankColumn<Row>[] = [
  {
    key: "source",
    header: "Izvor / medij",
    align: "left",
    value: (r) => r.source,
    cellClassName: "max-w-[12rem] sm:max-w-[16rem]",
    cell: (r) => (
      <span className="block truncate">
        <span className="text-foreground">{r.source}</span>
        <span className="text-text-muted"> / {r.medium}</span>
        <span className="block truncate text-xs text-text-muted md:hidden">
          {r.campaign}
        </span>
      </span>
    ),
  },
  {
    key: "campaign",
    header: "Kampanja",
    align: "left",
    value: (r) => r.campaign,
    headerClassName: "hidden md:table-cell",
    cellClassName: "hidden max-w-[14rem] truncate text-muted-foreground md:table-cell",
  },
  {
    key: "sessions",
    header: "Sesije",
    align: "right",
    value: (r) => r.sessions,
    format: metricFormat("sessions"),
  },
  {
    key: "keyEvents",
    header: "Ključni događaji",
    align: "right",
    value: (r) => r.keyEvents,
    format: metricFormat("keyEvents"),
  },
];

export function TrafficTable({
  traffic,
  kpiSessions,
}: {
  traffic: Traffic;
  /** Zbir sa pločice „Sesije" za isti period — imenilac sa kojim se tabela poredi. */
  kpiSessions?: number;
}) {
  // Dva GA4 izveštaja za isti period: pločica sabira dnevni izveštaj, tabela
  // izveštaj po izvoru / mediju / kampanji. Kad se zbirovi raziđu, to piše —
  // dva različita broja „sesija" bez objašnjenja su greška na ekranu (F13).
  const differs =
    kpiSessions !== undefined && kpiSessions !== traffic.totalSessions;
  return (
    <RankTable<Row>
      title="Izvori saobraćaja"
      subtitle={`Top ${traffic.rows.length} od ${formatNumber(traffic.tupleCount)} · ${formatNumber(traffic.totalSessions)} sesija`}
      columns={columns}
      rows={traffic.rows}
      rowKey={(r) => `${r.source}|${r.medium}|${r.campaign}`}
      share={{ value: (r) => r.sessions, total: traffic.totalSessions }}
      defaultSort={{ key: "sessions", dir: "desc" }}
      emptyMessage="Nema saobraćaja u izabranom periodu."
      footNote={
        differs
          ? `Zbir po izvorima (${formatNumber(traffic.totalSessions)}) je iz zasebnog GA4 izveštaja po izvoru, mediju i kampanji za isti period, pa odstupa od pločice „Sesije" (${formatNumber(kpiSessions)}), koja sabira dnevni izveštaj.`
          : undefined
      }
    />
  );
}

export function TrafficTableSkeleton() {
  return <RankTableSkeleton />;
}
