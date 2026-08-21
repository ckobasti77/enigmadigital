"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { ChartNoAxesColumn, Unplug } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Reveal } from "@/components/motion/reveal";
import { useDateRange } from "@/components/app/date-range-picker";
import { EmptyState } from "@/components/app/empty-state";
import { ChartErrorBoundary } from "@/components/app/chart-states";
import { KpiTile, KpiTileSkeleton } from "./kpi-tile";
import { PagesTable, PagesTableSkeleton } from "./pages-table";
import {
  LandingPagesTable,
  LandingPagesTableSkeleton,
} from "./landing-pages-table";
import { EventsTable, EventsTableSkeleton } from "./events-table";
import { DataQualityNotice } from "./data-quality-notice";
import { deltaPct, fillDays, summarize } from "@/lib/metrics";
import { formatNumber, formatSeconds, formatSignedPercent } from "@/lib/format";

function useStale<T>(value: T | undefined): T | undefined {
  const [last, setLast] = useState<T | undefined>(value);
  if (value !== undefined && value !== last) {
    setLast(value);
    return value;
  }
  return value ?? last;
}

export function ContentDashboard() {
  const { range } = useDateRange();
  const connections = useQuery(api.connections.list);

  const currentDaily = useQuery(api.analytics.daily, {
    from: range.from,
    to: range.to,
  });
  const previousDaily = useQuery(api.analytics.daily, {
    from: range.prevFrom,
    to: range.prevTo,
  });

  const pagesData = useStale(
    useQuery(api.analytics.contentPages, {
      from: range.from,
      to: range.to,
    }),
  );

  const landingData = useStale(
    useQuery(api.analytics.landingPages, {
      from: range.from,
      to: range.to,
    }),
  );

  const eventsData = useStale(
    useQuery(api.analytics.eventsByName, {
      from: range.from,
      to: range.to,
    }),
  );

  const dailySeries = useStale(
    useMemo(
      () =>
        currentDaily ? fillDays(currentDaily, range.from, range.to) : undefined,
      [currentDaily, range.from, range.to],
    ),
  );

  const curDailySum = useStale(
    useMemo(() => (currentDaily ? summarize(currentDaily) : undefined), [currentDaily]),
  );
  const prevDailySum = useStale(
    useMemo(
      () => (previousDaily ? summarize(previousDaily) : undefined),
      [previousDaily],
    ),
  );

  const ga4Connected =
    connections === undefined ||
    connections.some((c) => c.provider === "ga4");

  const loading =
    connections === undefined ||
    pagesData === undefined ||
    landingData === undefined ||
    eventsData === undefined ||
    dailySeries === undefined ||
    curDailySum === undefined ||
    prevDailySum === undefined;

  const compareLabel = `vs prethodnih ${range.days} d`;

  const sparkViews = useMemo(
    () => (dailySeries ? dailySeries.map((d) => d.sessions) : []),
    [dailySeries],
  );
  const sparkUsers = useMemo(
    () => (dailySeries ? dailySeries.map((d) => d.activeUsers) : []),
    [dailySeries],
  );
  const sparkKeyEvents = useMemo(
    () => (dailySeries ? dailySeries.map((d) => d.keyEvents) : []),
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
        <ContentSkeleton />
      ) : (
        <>
          {/* Top Explanation Banner */}
          <Reveal>
            <div className="rounded-xl border border-line bg-surface-raised/40 p-4 text-xs leading-relaxed text-text-muted sm:text-sm">
              <span className="font-semibold text-foreground">Sadržaj i stranice</span>{" "}
              prikazuju interakciju korisnika sa web stranicama.{" "}
              <span className="font-semibold text-foreground">Najposećenije stranice</span>{" "}
              mere ukupan broj prikaza i angažovanje, dok{" "}
              <span className="font-semibold text-foreground">Ulazne stranice</span>{" "}
              pokazuju gde korisnici započinju posetu vašem sajtu.
            </div>
          </Reveal>

          {/* KPI Row (4 Tiles) */}
          <Reveal>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <KpiTile
                label="Prikazi stranica"
                value={pagesData.totals.screenPageViews}
                format={formatNumber}
                delta={{
                  kind: "pct",
                  value: deltaPct(
                    pagesData.totals.screenPageViews,
                    prevDailySum.screenPageViews,
                  ),
                }}
                formatDelta={formatSignedPercent}
                compareLabel={compareLabel}
                spark={sparkViews}
              />
              <KpiTile
                label="Korisnici"
                value={pagesData.totals.totalUsers}
                format={formatNumber}
                delta={{
                  kind: "pct",
                  value: deltaPct(
                    pagesData.totals.totalUsers,
                    prevDailySum.activeUsers,
                  ),
                }}
                formatDelta={formatSignedPercent}
                compareLabel={compareLabel}
                spark={sparkUsers}
              />
              <KpiTile
                label="Prosečno zadržavanje"
                value={pagesData.totals.avgEngagementDuration}
                format={formatSeconds}
                delta={{
                  kind: "pct",
                  value: null,
                }}
                formatDelta={formatSignedPercent}
                compareLabel={compareLabel}
                spark={[]}
              />
              <KpiTile
                label="Ključni događaji"
                value={pagesData.totals.keyEvents}
                format={formatNumber}
                delta={{
                  kind: "pct",
                  value: deltaPct(
                    pagesData.totals.keyEvents,
                    prevDailySum.keyEvents,
                  ),
                }}
                formatDelta={formatSignedPercent}
                compareLabel={compareLabel}
                spark={sparkKeyEvents}
              />
            </div>
          </Reveal>

          {pagesData.totals.screenPageViews === 0 &&
          landingData.totals.sessions === 0 &&
          eventsData.totals.eventCount === 0 ? (
            <EmptyState icon={ChartNoAxesColumn}>
              Nema podataka o sadržaju za izabrani period. Istorija seže 90 dana
              unazad od prve sinhronizacije.
            </EmptyState>
          ) : (
            <>
              {/* Top 20 Pages Table */}
              <Reveal>
                <ChartErrorBoundary>
                  <PagesTable data={pagesData} />
                </ChartErrorBoundary>
              </Reveal>

              {/* Top 20 Landing Pages Table */}
              <Reveal>
                <ChartErrorBoundary>
                  <LandingPagesTable data={landingData} />
                </ChartErrorBoundary>
              </Reveal>

              {/* Top 20 Events Table */}
              <Reveal>
                <ChartErrorBoundary>
                  <EventsTable data={eventsData} />
                </ChartErrorBoundary>
              </Reveal>

              {/* Data Quality Notice */}
              <Reveal>
                <DataQualityNotice meta={pagesData.reportMeta} />
              </Reveal>
            </>
          )}
        </>
      )}
    </div>
  );
}

function ContentSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-8">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiTileSkeleton />
        <KpiTileSkeleton />
        <KpiTileSkeleton />
        <KpiTileSkeleton />
      </div>
      <PagesTableSkeleton />
      <LandingPagesTableSkeleton />
      <EventsTableSkeleton />
    </div>
  );
}
