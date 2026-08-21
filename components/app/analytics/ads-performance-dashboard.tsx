"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { Megaphone, Unplug } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Reveal } from "@/components/motion/reveal";
import { useDateRange } from "@/components/app/date-range-picker";
import { EmptyState } from "@/components/app/empty-state";
import { ChartErrorBoundary } from "@/components/app/chart-states";
import { Card } from "@/components/ui/card";
import { KpiTile, KpiTileSkeleton } from "./kpi-tile";
import { AdsTimeseriesChart, AdsTimeseriesSkeleton } from "./ads-timeseries-chart";
import { AdsTable, AdsTableSkeleton } from "./ads-table";
import { DataQualityNotice } from "./data-quality-notice";
import { deltaPct } from "@/lib/metrics";
import { formatCurrency, formatNumber, formatSignedPercent } from "@/lib/format";

/** Hook to preserve last known value while SWR refetches on date-range changes. */
function useStale<T>(value: T | undefined): T | undefined {
  const [last, setLast] = useState<T | undefined>(value);
  if (value !== undefined && value !== last) {
    setLast(value);
    return value;
  }
  return value ?? last;
}

export function AdsPerformanceDashboard() {
  const { range } = useDateRange();
  const connections = useQuery(api.connections.list);

  const [level, setLevel] = useState<"campaign" | "keyword">("campaign");

  const currentData = useStale(
    useQuery(api.analytics.adsPerformance, {
      from: range.from,
      to: range.to,
      level,
    }),
  );

  const previousData = useStale(
    useQuery(api.analytics.adsPerformance, {
      from: range.prevFrom,
      to: range.prevTo,
      level,
    }),
  );

  const ga4Connected =
    connections === undefined ||
    connections.some((c) => c.provider === "ga4");

  const loading =
    connections === undefined ||
    currentData === undefined ||
    previousData === undefined;

  const compareLabel = `vs prethodnih ${range.days} d`;

  const curTotals = currentData?.totals;
  const prevTotals = previousData?.totals;
  const currencyCode = currentData?.currencyCode;

  // Sparklines
  const dailySeries = currentData?.dailySeries;

  const sparkCost = useMemo(
    () => (dailySeries ? dailySeries.map((d) => d.cost) : []),
    [dailySeries],
  );
  const sparkClicks = useMemo(
    () => (dailySeries ? dailySeries.map((d) => d.clicks) : []),
    [dailySeries],
  );
  const sparkSessions = useMemo(
    () => (dailySeries ? dailySeries.map((d) => d.sessions) : []),
    [dailySeries],
  );
  const sparkKeyEvents = useMemo(
    () => (dailySeries ? dailySeries.map((d) => d.keyEvents) : []),
    [dailySeries],
  );
  const sparkCpk = useMemo(
    () =>
      dailySeries
        ? dailySeries.map((d) => (d.keyEvents > 0 ? d.cost / d.keyEvents : 0))
        : [],
    [dailySeries],
  );

  return (
    <div className="flex flex-1 flex-col gap-8">
      {!ga4Connected ? (
        <EmptyState icon={Unplug}>
          GA4 još nije povezan.{" "}
          <Link
            href="/settings"
            className="text-accent-400 underline-offset-4 hover:underline"
          >
            Poveži ga u podešavanjima
          </Link>
          .
        </EmptyState>
      ) : loading ? (
        <AdsDashboardSkeleton />
      ) : currentData.availability !== "available" ? (
        /* Section 4.4b: Clear reason based on GA4 Admin API googleAdsLinks */
        <Card className="flex flex-col items-center justify-center p-12 text-center shadow-card ring-line">
          <div className="mb-4 rounded-2xl bg-surface-raised p-4">
            <Megaphone className="size-8 text-accent-400" />
          </div>
          <h3 className="text-base font-semibold text-foreground">
            Google Ads metrike nisu dostupne
          </h3>
          <p className="mt-2 max-w-md text-xs leading-relaxed text-text-muted">
            {currentData.adsLinkStatus === "unlinked"
              ? "Google Ads nije povezan sa ovom propertijom."
              : currentData.adsLinkStatus === "linked_pending_data"
                ? "Veza postoji ali metrike troškova još nisu dostupne — obično traje do 24 sata posle povezivanja."
                : "Google Ads nalog nije povezan sa ovom GA4 propertijom, pa troškovi i podaci o oglasima nisu dostupni u GA4 Data API-ju."}
          </p>
          <div className="mt-6 rounded-xl border border-line bg-surface-raised/60 p-4 text-left text-xs leading-relaxed text-foreground max-w-lg">
            <span className="font-semibold text-foreground block mb-1">
              Potreban korak za aktivaciju:
            </span>
            <span>
              {currentData.adsLinkStatus === "linked_pending_data"
                ? "Google Ads nalog je uspešno povezan u GA4 administraciji. Podaci o troškovima i klikovima se automatski prenose u roku od 24 do 48 sati, nakon čega će se pojaviti u izveštaju."
                : "U GA4 administraciji, pod sekcijom Veze proizvoda (Product Links), povežite vaš Google Ads nalog sa ovom GA4 propertijom. Nakon povezivanja i sledeće sinhronizacije, podaci o troškovima i ponašanju na sajtu će se automatski pojaviti."}
            </span>
          </div>
        </Card>
      ) : (
        <>
          {/* Top Explanation Banner */}
          <Reveal>
            <div className="rounded-xl border border-line bg-surface-raised/40 p-4 text-xs leading-relaxed text-text-muted sm:text-sm">
              <span className="font-semibold text-foreground">Plaćeni oglasi (Google Ads)</span>{" "}
              prikazuju troškove oglašavanja spojene sa ponašanjem posetilaca i ključnim događajima na sajtu.
            </div>
          </Reveal>

          {/* KPI Row (5 Tiles) */}
          <Reveal>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
              {/* 1. Potrošnja */}
              <KpiTile
                label="Potrošnja"
                primary
                value={curTotals?.cost ?? 0}
                format={(v) => formatCurrency(v, currencyCode)}
                delta={{
                  kind: "pct",
                  value: deltaPct(curTotals?.cost ?? 0, prevTotals?.cost ?? 0),
                }}
                formatDelta={formatSignedPercent}
                compareLabel={compareLabel}
                spark={sparkCost}
              />

              {/* 2. Klikovi */}
              <KpiTile
                label="Klikovi"
                value={curTotals?.clicks ?? 0}
                format={formatNumber}
                delta={{
                  kind: "pct",
                  value: deltaPct(curTotals?.clicks ?? 0, prevTotals?.clicks ?? 0),
                }}
                formatDelta={formatSignedPercent}
                compareLabel={compareLabel}
                spark={sparkClicks}
              />

              {/* 3. Sesije */}
              <KpiTile
                label="Sesije"
                value={curTotals?.sessions ?? 0}
                format={formatNumber}
                delta={{
                  kind: "pct",
                  value: deltaPct(curTotals?.sessions ?? 0, prevTotals?.sessions ?? 0),
                }}
                formatDelta={formatSignedPercent}
                compareLabel={compareLabel}
                spark={sparkSessions}
              />

              {/* 4. Ključni događaji */}
              <KpiTile
                label="Ključni događaji"
                value={curTotals?.keyEvents ?? 0}
                format={formatNumber}
                delta={{
                  kind: "pct",
                  value: deltaPct(curTotals?.keyEvents ?? 0, prevTotals?.keyEvents ?? 0),
                }}
                formatDelta={formatSignedPercent}
                compareLabel={compareLabel}
                spark={sparkKeyEvents}
              />

              {/* 5. Cena po ključnom događaju */}
              <KpiTile
                label="Cena / klj. događaj"
                value={curTotals?.costPerKeyEvent ?? 0}
                format={(v) => (v > 0 ? formatCurrency(v, currencyCode) : "—")}
                delta={{
                  kind: "pct",
                  value: deltaPct(
                    curTotals?.costPerKeyEvent ?? 0,
                    prevTotals?.costPerKeyEvent ?? 0,
                  ),
                }}
                formatDelta={formatSignedPercent}
                compareLabel={compareLabel}
                spark={sparkCpk}
              />
            </div>
          </Reveal>

          {/* Main Dual Timeseries Chart */}
          <Reveal delay={0.05}>
            <ChartErrorBoundary>
              <AdsTimeseriesChart
                data={currentData.dailySeries}
                currencyCode={currencyCode}
              />
            </ChartErrorBoundary>
          </Reveal>

          {/* Table: Campaigns or Keywords */}
          <Reveal delay={0.1}>
            <AdsTable
              rows={currentData.rows}
              totals={currentData.totals}
              itemCount={currentData.itemCount}
              level={level}
              onLevelChange={setLevel}
              currencyCode={currentData.currencyCode}
              thresholdedDays={currentData.thresholdedDays}
            />
          </Reveal>

          {/* Data Quality Notice */}
          <Reveal delay={0.15}>
            <DataQualityNotice meta={currentData.reportMeta} />
          </Reveal>
        </>
      )}
    </div>
  );
}

function AdsDashboardSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-8">
      <div className="h-12 w-full animate-pulse rounded-xl bg-line/40" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <KpiTileSkeleton key={i} />
        ))}
      </div>
      <AdsTimeseriesSkeleton />
      <AdsTableSkeleton />
    </div>
  );
}
