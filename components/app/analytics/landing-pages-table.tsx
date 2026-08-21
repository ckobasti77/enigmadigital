"use client";

import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { formatNumber, pluralSr } from "@/lib/format";
import { RankTable, RankTableSkeleton, type RankColumn } from "./rank-table";
import { metricFormat } from "./metric-state";

type LandingData = FunctionReturnType<typeof api.analytics.landingPages>;

type Row = {
  landingPage: string;
  sessions?: number;
  engagedSessions?: number;
  engagementRate?: number;
  bounceRate?: number;
  keyEvents?: number;
};

const fmtBounce = metricFormat("bounceRate");

const columns: RankColumn<Row>[] = [
  {
    key: "landingPage",
    header: "Ulazna stranica",
    align: "left",
    value: (r) => r.landingPage,
    cellClassName: "max-w-[14rem] sm:max-w-[24rem]",
    cell: (r) => (
      <span
        className="block truncate font-mono text-xs text-foreground"
        title={r.landingPage}
      >
        {r.landingPage}
      </span>
    ),
  },
  {
    key: "sessions",
    header: "Sesije",
    align: "right",
    value: (r) => r.sessions,
    format: metricFormat("sessions"),
  },
  {
    key: "engagedSessions",
    header: "Angažovane",
    align: "right",
    value: (r) => r.engagedSessions,
    format: metricFormat("engagedSessions"),
  },
  {
    key: "engagementRate",
    header: "Stopa angažovanja",
    align: "right",
    value: (r) => r.engagementRate,
    format: metricFormat("engagementRate"),
    sub: (r) =>
      r.bounceRate === undefined ? null : `odskok ${fmtBounce(r.bounceRate)}`,
  },
  {
    key: "keyEvents",
    header: "Događaji",
    align: "right",
    value: (r) => r.keyEvents,
    format: metricFormat("keyEvents"),
  },
];

export function LandingPagesTable({ data }: { data: LandingData }) {
  const topSessions = data.rows.reduce((s, r) => s + r.sessions, 0);
  const topEngaged = data.rows.reduce((s, r) => s + r.engagedSessions, 0);
  const topKe = data.rows.reduce((s, r) => s + r.keyEvents, 0);
  const remSessions = Math.max(0, data.totals.sessions - topSessions);
  const remEngaged = Math.max(0, data.totals.engagedSessions - topEngaged);
  const remRate = remSessions > 0 ? remEngaged / remSessions : undefined;
  const hidden = data.pageCount - data.rows.length;

  const remainder: Row | null =
    hidden > 0 && remSessions > 0
      ? {
          landingPage: `Ostale ulazne stranice (${formatNumber(hidden)})`,
          sessions: remSessions,
          engagedSessions: remEngaged,
          engagementRate: remRate,
          bounceRate: remRate === undefined ? undefined : 1 - remRate,
          keyEvents: Math.max(0, data.totals.keyEvents - topKe),
        }
      : null;

  return (
    <RankTable<Row>
      title="Ulazne stranice"
      subtitle={`Prva stranica na koju korisnici dospevaju · Top ${data.rows.length} od ${formatNumber(data.pageCount)}`}
      columns={columns}
      rows={data.rows}
      rowKey={(r, i) => `${r.landingPage}-${i}`}
      share={{ value: (r) => r.sessions, total: data.totals.sessions }}
      remainder={remainder}
      totalsRow={{ landingPage: "", ...data.totals }}
      totalsLabel={`Ukupno (${formatNumber(data.pageCount)} ${pluralSr(data.pageCount, "stranica", "stranice", "stranica")})`}
      defaultSort={{ key: "sessions", dir: "desc" }}
      emptyMessage="Nema zabeleženih ulaznih sesija u izabranom periodu."
    />
  );
}

export function LandingPagesTableSkeleton() {
  return <RankTableSkeleton />;
}
