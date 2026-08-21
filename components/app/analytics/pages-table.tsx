"use client";

import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { formatNumber, pluralSr } from "@/lib/format";
import { RankTable, RankTableSkeleton, type RankColumn } from "./rank-table";
import { metricFormat } from "./metric-state";

type ContentData = FunctionReturnType<typeof api.analytics.contentPages>;

type Row = {
  pagePath: string;
  screenPageViews?: number;
  totalUsers?: number;
  avgEngagementDuration?: number;
  keyEvents?: number;
};

const columns: RankColumn<Row>[] = [
  {
    key: "pagePath",
    header: "Putanja stranice",
    align: "left",
    value: (r) => r.pagePath,
    cellClassName: "max-w-[14rem] sm:max-w-[24rem]",
    cell: (r) => (
      <span
        className="block truncate font-mono text-xs text-foreground"
        title={r.pagePath}
      >
        {r.pagePath}
      </span>
    ),
  },
  {
    key: "screenPageViews",
    header: "Prikazi",
    align: "right",
    value: (r) => r.screenPageViews,
    format: metricFormat("screenPageViews"),
  },
  {
    key: "totalUsers",
    header: "Korisnici",
    align: "right",
    value: (r) => r.totalUsers,
    format: metricFormat("totalUsers"),
  },
  {
    key: "avgEngagementDuration",
    header: "Prosečno vreme",
    align: "right",
    value: (r) => r.avgEngagementDuration,
    format: metricFormat("averageSessionDuration"),
  },
  {
    key: "keyEvents",
    header: "Događaji",
    align: "right",
    value: (r) => r.keyEvents,
    format: metricFormat("keyEvents"),
  },
];

export function PagesTable({ data }: { data: ContentData }) {
  const topViews = data.rows.reduce((s, r) => s + r.screenPageViews, 0);
  const topUsers = data.rows.reduce((s, r) => s + r.totalUsers, 0);
  const topKe = data.rows.reduce((s, r) => s + r.keyEvents, 0);
  const remViews = Math.max(0, data.totals.screenPageViews - topViews);
  const hidden = data.pageCount - data.rows.length;

  const remainder: Row | null =
    hidden > 0 && remViews > 0
      ? {
          pagePath: `Ostale stranice (${formatNumber(hidden)})`,
          screenPageViews: remViews,
          totalUsers: Math.max(0, data.totals.totalUsers - topUsers),
          avgEngagementDuration: undefined,
          keyEvents: Math.max(0, data.totals.keyEvents - topKe),
        }
      : null;

  return (
    <RankTable<Row>
      title="Najposećenije stranice"
      subtitle={`Prikazi, korisnici i prosečno zadržavanje po putanji · Top ${data.rows.length} od ${formatNumber(data.pageCount)}`}
      columns={columns}
      rows={data.rows}
      rowKey={(r, i) => `${r.pagePath}-${i}`}
      share={{ value: (r) => r.screenPageViews, total: data.totals.screenPageViews }}
      remainder={remainder}
      totalsRow={{ pagePath: "", ...data.totals }}
      totalsLabel={`Ukupno (${formatNumber(data.pageCount)} ${pluralSr(data.pageCount, "stranica", "stranice", "stranica")})`}
      defaultSort={{ key: "screenPageViews", dir: "desc" }}
      emptyMessage="Nema zabeleženih prikaza stranica u izabranom periodu."
    />
  );
}

export function PagesTableSkeleton() {
  return <RankTableSkeleton />;
}
