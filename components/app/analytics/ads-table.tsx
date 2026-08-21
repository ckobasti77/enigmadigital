"use client";

import { useMemo } from "react";
import { Info } from "lucide-react";
import { formatNumber, formatPercent, pluralSr } from "@/lib/format";
import { RankTable, RankTableSkeleton, type RankColumn } from "./rank-table";
import { SegmentedToggle } from "./segmented-toggle";
import { metricFormat } from "./metric-state";

export interface AdsTableRow {
  campaign: string;
  keyword?: string;
  cost: number;
  clicks: number;
  impressions?: number;
  sessions: number;
  engagedSessions?: number;
  keyEvents: number;
  costPerClick?: number;
  costPerKeyEvent?: number;
  sessionsPerClick?: number;
}

export interface AdsTableTotals {
  cost: number;
  clicks: number;
  impressions?: number;
  sessions: number;
  engagedSessions?: number;
  keyEvents: number;
  costPerClick?: number;
  costPerKeyEvent?: number;
  sessionsPerClick?: number;
}

export function AdsTable({
  rows,
  totals,
  itemCount,
  level,
  onLevelChange,
  currencyCode,
  thresholdedDays = 0,
}: {
  rows: AdsTableRow[];
  totals: AdsTableTotals;
  itemCount: number;
  level: "campaign" | "keyword";
  onLevelChange: (next: "campaign" | "keyword") => void;
  currencyCode?: string;
  thresholdedDays?: number;
}) {
  const isCampaign = level === "campaign";

  const columns: RankColumn<AdsTableRow>[] = useMemo(() => {
    const money = metricFormat("advertiserAdCost", currencyCode);
    const perKeyEvent = metricFormat("advertiserAdCostPerClick", currencyCode);
    const derivedState = (v: number | undefined) =>
      v !== undefined ? "value" : thresholdedDays > 0 ? "thresholded" : "unavailable";
    return [
      {
        key: "name",
        header: isCampaign ? "Kampanja" : "Kampanja / Ključna reč",
        align: "left",
        value: (r) => (r.keyword ? `${r.campaign} / ${r.keyword}` : r.campaign),
        cellClassName: "max-w-[12rem] sm:max-w-[20rem]",
        cell: (r) => (
          <span className="block truncate font-mono text-xs">
            <span className="font-semibold text-foreground">{r.campaign}</span>
            {r.keyword && (
              <span className="text-text-muted"> / {r.keyword}</span>
            )}
          </span>
        ),
      },
      {
        key: "cost",
        header: "Potrošnja",
        align: "right",
        value: (r) => r.cost,
        format: money,
      },
      {
        key: "clicks",
        header: "Klikovi",
        align: "right",
        value: (r) => r.clicks,
        format: metricFormat("advertiserAdClicks"),
      },
      {
        key: "sessions",
        header: "Sesije",
        align: "right",
        value: (r) => r.sessions,
        format: metricFormat("sessions"),
      },
      {
        key: "sessionsPerClick",
        header: "Sesije / klik",
        align: "right",
        value: (r) => r.sessionsPerClick,
        format: formatPercent,
        state: (r) => derivedState(r.sessionsPerClick),
      },
      {
        key: "keyEvents",
        header: "Klj. događaji",
        align: "right",
        value: (r) => r.keyEvents,
        format: metricFormat("keyEvents"),
      },
      {
        key: "costPerKeyEvent",
        header: "Cena / klj. dog.",
        align: "right",
        value: (r) => r.costPerKeyEvent,
        format: perKeyEvent,
        state: (r) => derivedState(r.costPerKeyEvent),
      },
    ];
  }, [isCampaign, currencyCode, thresholdedDays]);

  const topCost = rows.reduce((s, r) => s + r.cost, 0);
  const topClicks = rows.reduce((s, r) => s + r.clicks, 0);
  const topSessions = rows.reduce((s, r) => s + r.sessions, 0);
  const topKe = rows.reduce((s, r) => s + r.keyEvents, 0);
  const remCost = Math.max(0, totals.cost - topCost);
  const remClicks = Math.max(0, totals.clicks - topClicks);
  const remSessions = Math.max(0, totals.sessions - topSessions);
  const remKe = Math.max(0, totals.keyEvents - topKe);
  const hidden = itemCount - rows.length;

  const remainder: AdsTableRow | null =
    hidden > 0 && remCost > 0
      ? {
          campaign: "Ostalo",
          keyword: isCampaign ? undefined : "—",
          cost: remCost,
          clicks: remClicks,
          sessions: remSessions,
          keyEvents: remKe,
          sessionsPerClick:
            thresholdedDays === 0 && remClicks > 0
              ? remSessions / remClicks
              : undefined,
          costPerKeyEvent:
            thresholdedDays === 0 && remKe > 0 ? remCost / remKe : undefined,
        }
      : null;

  const totalsRow: AdsTableRow = {
    campaign: "",
    cost: totals.cost,
    clicks: totals.clicks,
    sessions: totals.sessions,
    keyEvents: totals.keyEvents,
    sessionsPerClick: totals.sessionsPerClick,
    costPerKeyEvent: totals.costPerKeyEvent,
  };

  return (
    <RankTable<AdsTableRow>
      title={isCampaign ? "Učinak po kampanjama" : "Učinak po ključnim rečima"}
      subtitle={`Top ${rows.length} od ${formatNumber(itemCount)} ${isCampaign ? pluralSr(itemCount, "kampanje", "kampanje", "kampanja") : "ključnih reči"} · ${metricFormat("advertiserAdCost", currencyCode)(totals.cost)} ukupne potrošnje`}
      headerRight={
        <SegmentedToggle
          ariaLabel="Nivo oglasa"
          value={level}
          onChange={onLevelChange}
          options={[
            { value: "campaign", label: "Kampanje" },
            { value: "keyword", label: "Ključne reči" },
          ]}
        />
      }
      columns={columns}
      rows={rows}
      rowKey={(r) => `${r.campaign}-${r.keyword ?? ""}`}
      share={{ value: (r) => r.cost, total: totals.cost }}
      remainder={remainder}
      totalsRow={totalsRow}
      totalsLabel="Ukupno (svi oglasi)"
      defaultSort={{ key: "cost", dir: "desc" }}
      emptyMessage="Nema podataka o plaćenim oglasima u izabranom periodu."
      footNote={
        <span className="flex flex-col gap-2">
          {!currencyCode && (
            <span className="flex items-center gap-2">
              <Info className="size-3.5 shrink-0" aria-hidden />
              Valuta propertije još nije poznata.
            </span>
          )}
          <span className="flex items-start gap-2">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Klikovi dolaze iz Google Ads-a, a sesije iz GA4 — brojevi se neće
            poklapati sa ekranom Oglasi. Odnos sesija po kliku pokazuje koliko
            klikova stvarno stigne do sajta.
          </span>
        </span>
      }
    />
  );
}

export function AdsTableSkeleton() {
  return <RankTableSkeleton rows={6} />;
}
