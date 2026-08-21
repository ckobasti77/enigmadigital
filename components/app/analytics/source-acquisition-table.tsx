"use client";

import { useMemo } from "react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { formatNumber } from "@/lib/format";
import { RankTable, RankTableSkeleton, type RankColumn } from "./rank-table";
import { SegmentedToggle } from "./segmented-toggle";
import { metricFormat } from "./metric-state";

type SourceData = FunctionReturnType<typeof api.analytics.acquisitionBySource>;

type Row = {
  source: string;
  medium: string;
  primaryValue?: number;
  secondaryValue?: number;
  engagementRate?: number;
  keyEvents?: number;
};

export function SourceAcquisitionTable({
  data,
  scope,
  onScopeChange,
}: {
  data: SourceData;
  scope: "first" | "session";
  onScopeChange: (next: "first" | "session") => void;
}) {
  const isFirst = scope === "first";

  const columns: RankColumn<Row>[] = useMemo(() => {
    const cols: RankColumn<Row>[] = [
      {
        key: "source",
        header: "Izvor / medijum",
        align: "left",
        value: (r) => r.source,
        cellClassName: "max-w-[12rem] sm:max-w-[20rem]",
        cell: (r) => (
          <span className="block truncate font-mono text-xs">
            <span className="font-semibold text-foreground">{r.source}</span>
            <span className="text-text-muted"> / {r.medium}</span>
          </span>
        ),
      },
      {
        key: "primaryValue",
        header: isFirst ? "Novi korisnici" : "Sesije",
        align: "right",
        value: (r) => r.primaryValue,
        format: metricFormat(isFirst ? "newUsers" : "sessions"),
      },
      {
        key: "secondaryValue",
        header: isFirst ? "Ukupno korisnika" : "Angažovane sesije",
        align: "right",
        value: (r) => r.secondaryValue,
        format: metricFormat(isFirst ? "totalUsers" : "engagedSessions"),
      },
    ];
    if (!isFirst) {
      cols.push({
        key: "engagementRate",
        header: "Stopa angaž.",
        align: "right",
        value: (r) => r.engagementRate,
        format: metricFormat("engagementRate"),
      });
    }
    cols.push({
      key: "keyEvents",
      header: "Ključni događaji",
      align: "right",
      value: (r) => r.keyEvents,
      format: metricFormat("keyEvents"),
    });
    return cols;
  }, [isFirst]);

  const topPrimary = data.rows.reduce((s, r) => s + r.primaryValue, 0);
  const topSecondary = data.rows.reduce((s, r) => s + r.secondaryValue, 0);
  const topKe = data.rows.reduce((s, r) => s + r.keyEvents, 0);
  const remPrimary = Math.max(0, data.totalPrimary - topPrimary);
  const remSecondary = Math.max(0, data.totalSecondary - topSecondary);
  const hidden = data.pairCount - data.rows.length;

  const remainder: Row | null =
    hidden > 0 && remPrimary > 0
      ? {
          source: "Ostalo",
          medium: `${formatNumber(hidden)} parova`,
          primaryValue: remPrimary,
          secondaryValue: remSecondary,
          engagementRate: remPrimary > 0 ? remSecondary / remPrimary : undefined,
          keyEvents: Math.max(0, data.totalKeyEvents - topKe),
        }
      : null;

  const totalsRow: Row = {
    source: "",
    medium: "",
    primaryValue: data.totalPrimary,
    secondaryValue: data.totalSecondary,
    engagementRate:
      data.totalPrimary > 0 ? data.totalSecondary / data.totalPrimary : undefined,
    keyEvents: data.totalKeyEvents,
  };

  return (
    <RankTable<Row>
      title="Izvori i medijumi saobraćaja"
      subtitle={`Top ${data.rows.length} od ${formatNumber(data.pairCount)} parova · ${formatNumber(data.totalPrimary)} ${isFirst ? "novih korisnika" : "sesija"} ukupno`}
      headerRight={
        <SegmentedToggle
          ariaLabel="Opseg izvora"
          value={scope}
          onChange={onScopeChange}
          options={[
            { value: "first", label: "Prvi dodir" },
            { value: "session", label: "Ova poseta" },
          ]}
        />
      }
      columns={columns}
      rows={data.rows}
      rowKey={(r) => `${r.source}-${r.medium}`}
      share={{ value: (r) => r.primaryValue, total: data.totalPrimary }}
      remainder={remainder}
      totalsRow={totalsRow}
      totalsLabel="Ukupno (svi izvori)"
      defaultSort={{ key: "primaryValue", dir: "desc" }}
      emptyMessage="Nema podataka o izvorima u izabranom periodu."
    />
  );
}

export function SourceAcquisitionSkeleton() {
  return <RankTableSkeleton />;
}
