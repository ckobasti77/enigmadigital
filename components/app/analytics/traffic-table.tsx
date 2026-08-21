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

export function TrafficTable({ traffic }: { traffic: Traffic }) {
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
    />
  );
}

export function TrafficTableSkeleton() {
  return <RankTableSkeleton />;
}
