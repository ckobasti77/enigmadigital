"use client";

import { useMemo } from "react";
import { Globe, MapPin } from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { formatNumber, pluralSr } from "@/lib/format";
import { RankTable, RankTableSkeleton, type RankColumn } from "./rank-table";
import { SegmentedToggle } from "./segmented-toggle";
import { metricFormat } from "./metric-state";

type GeoData = FunctionReturnType<typeof api.analytics.audienceGeo>;

type Row = {
  name: string;
  totalUsers?: number;
  sessions?: number;
  keyEvents?: number;
};

export function GeoRanking({
  data,
  level,
  onLevelChange,
}: {
  data: GeoData;
  level: "country" | "city";
  onLevelChange: (next: "country" | "city") => void;
}) {
  const columns: RankColumn<Row>[] = useMemo(
    () => [
      {
        key: "name",
        header: level === "country" ? "Država" : "Grad",
        align: "left",
        value: (r) => r.name,
        cellClassName: "max-w-[12rem] sm:max-w-[20rem]",
        cell: (r) => (
          <span className="block truncate text-foreground" title={r.name}>
            {r.name}
          </span>
        ),
      },
      {
        key: "totalUsers",
        header: "Korisnici",
        align: "right",
        value: (r) => r.totalUsers,
        format: metricFormat("totalUsers"),
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
        header: "Događaji",
        align: "right",
        value: (r) => r.keyEvents,
        format: metricFormat("keyEvents"),
      },
    ],
    [level],
  );

  const topUsers = data.rows.reduce((s, r) => s + r.totalUsers, 0);
  const topSessions = data.rows.reduce((s, r) => s + r.sessions, 0);
  const topKe = data.rows.reduce((s, r) => s + r.keyEvents, 0);
  const remUsers = Math.max(0, data.totals.totalUsers - topUsers);
  const hidden = data.itemCount - data.rows.length;

  const remainder: Row | null =
    hidden > 0 && remUsers > 0
      ? {
          name: `Ostale lokacije (${formatNumber(hidden)})`,
          totalUsers: remUsers,
          sessions: Math.max(0, data.totals.sessions - topSessions),
          keyEvents: Math.max(0, data.totals.keyEvents - topKe),
        }
      : null;

  const unit =
    level === "country"
      ? pluralSr(data.itemCount, "država", "države", "država")
      : pluralSr(data.itemCount, "grad", "grada", "gradova");

  return (
    <RankTable<Row>
      title="Geografska distribucija"
      subtitle={`Lokacije posetilaca po broju korisnika · Top ${data.rows.length} od ${formatNumber(data.itemCount)}`}
      headerRight={
        <SegmentedToggle
          ariaLabel="Nivo lokacije"
          value={level}
          onChange={onLevelChange}
          options={[
            { value: "country", label: "Država", icon: Globe },
            { value: "city", label: "Grad", icon: MapPin },
          ]}
        />
      }
      rank
      columns={columns}
      rows={data.rows}
      rowKey={(r, i) => `${r.name}-${i}`}
      share={{ value: (r) => r.totalUsers, total: data.totals.totalUsers }}
      remainder={remainder}
      totalsRow={{ name: "", ...data.totals }}
      totalsLabel={`Ukupno (${formatNumber(data.itemCount)} ${unit})`}
      defaultSort={{ key: "totalUsers", dir: "desc" }}
      emptyMessage="Nema zabeleženih geografskih podataka u izabranom periodu."
      footNote="Zbir može biti manji od ukupnog broja korisnika usled zaštite privatnosti ili nepoznatih lokacija."
    />
  );
}

export function GeoRankingSkeleton() {
  return <RankTableSkeleton />;
}
