"use client";

import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { formatNumber, pluralSr } from "@/lib/format";
import { RankTable, RankTableSkeleton, type RankColumn } from "./rank-table";
import { metricFormat } from "./metric-state";

type EventsData = FunctionReturnType<typeof api.analytics.eventsByName>;

type Row = {
  eventName: string;
  eventCount?: number;
  totalUsers?: number;
  eventsPerUser?: number;
  isKeyEvent?: boolean;
};

const columns: RankColumn<Row>[] = [
  {
    key: "eventName",
    header: "Naziv događaja",
    align: "left",
    value: (r) => r.eventName,
    cellClassName: "max-w-[12rem] sm:max-w-[22rem]",
    cell: (r) => (
      <span className="flex min-w-0 items-center gap-2">
        <span
          className="truncate font-mono text-xs text-foreground"
          title={r.eventName}
        >
          {r.eventName}
        </span>
        {r.isKeyEvent && (
          <span className="shrink-0 rounded border border-line-soft bg-surface-raised/60 px-1.5 py-0.5 text-micro font-medium text-text-secondary">
            Ključni
          </span>
        )}
      </span>
    ),
  },
  {
    key: "eventCount",
    header: "Broj",
    align: "right",
    value: (r) => r.eventCount,
    format: metricFormat("eventCount"),
  },
  {
    key: "totalUsers",
    header: "Korisnici",
    align: "right",
    value: (r) => r.totalUsers,
    format: metricFormat("totalUsers"),
  },
  {
    key: "eventsPerUser",
    header: "Događaja po korisniku",
    align: "right",
    value: (r) => r.eventsPerUser,
    format: metricFormat("eventCountPerUser"),
  },
];

export function EventsTable({ data }: { data: EventsData }) {
  const topCount = data.rows.reduce((s, r) => s + r.eventCount, 0);
  const topUsers = data.rows.reduce((s, r) => s + r.totalUsers, 0);
  const remCount = Math.max(0, data.totals.eventCount - topCount);
  const remUsers = Math.max(0, data.totals.totalUsers - topUsers);
  const hidden = data.eventTypesCount - data.rows.length;

  const remainder: Row | null =
    hidden > 0 && remCount > 0
      ? {
          eventName: `Ostali događaji (${formatNumber(hidden)})`,
          eventCount: remCount,
          totalUsers: remUsers,
          eventsPerUser: remUsers > 0 ? remCount / remUsers : 0,
          isKeyEvent: false,
        }
      : null;

  return (
    <RankTable<Row>
      title="Događaji"
      subtitle={`Broj događaja, korisnici i prosek po korisniku · Top ${data.rows.length} od ${formatNumber(data.eventTypesCount)}`}
      note={'Događaj označen kao „Ključni" ulazi u metriku „Ključni događaji" na svim ekranima.'}
      columns={columns}
      rows={data.rows}
      rowKey={(r, i) => `${r.eventName}-${i}`}
      share={{ value: (r) => r.eventCount, total: data.totals.eventCount }}
      remainder={remainder}
      totalsRow={{ eventName: "", ...data.totals, isKeyEvent: false }}
      totalsLabel={`Ukupno (${formatNumber(data.eventTypesCount)} ${pluralSr(data.eventTypesCount, "događaj", "događaja", "događaja")})`}
      defaultSort={{ key: "eventCount", dir: "desc" }}
      emptyMessage="Nema zabeleženih događaja u izabranom periodu."
    />
  );
}

export function EventsTableSkeleton() {
  return <RankTableSkeleton />;
}
