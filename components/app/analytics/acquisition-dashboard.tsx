"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { Unplug } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Reveal } from "@/components/motion/reveal";
import { useDateRange } from "@/components/app/date-range-picker";
import { EmptyState } from "@/components/app/empty-state";
import { ChartErrorBoundary } from "@/components/app/chart-states";
import { KpiTile, KpiTileSkeleton } from "./kpi-tile";
import {
  ChannelComparisonChart,
  ChannelComparisonSkeleton,
} from "./channel-comparison-chart";
import {
  SourceAcquisitionTable,
  SourceAcquisitionSkeleton,
} from "./source-acquisition-table";
import { DataQualityNotice } from "./data-quality-notice";
import { deltaPct, fillDays, summarize } from "@/lib/metrics";
import { formatNumber, formatSignedPercent } from "@/lib/format";

/** Hook to preserve last known value while SWR refetches on date-range changes. */
function useStale<T>(value: T | undefined): T | undefined {
  const [last, setLast] = useState<T | undefined>(value);
  if (value !== undefined && value !== last) {
    setLast(value);
    return value;
  }
  return value ?? last;
}

export function AcquisitionDashboard() {
  const { range } = useDateRange();
  const connections = useQuery(api.connections.list);

  const [sourceScope, setSourceScope] = useState<"first" | "session">("first");

  const currentDaily = useQuery(api.analytics.daily, {
    from: range.from,
    to: range.to,
  });
  const previousDaily = useQuery(api.analytics.daily, {
    from: range.prevFrom,
    to: range.prevTo,
  });

  const channels = useStale(
    useQuery(api.analytics.acquisitionByChannel, {
      from: range.from,
      to: range.to,
    }),
  );

  const sources = useStale(
    useQuery(api.analytics.acquisitionBySource, {
      from: range.from,
      to: range.to,
      scope: sourceScope,
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
    channels === undefined ||
    sources === undefined ||
    dailySeries === undefined ||
    curDailySum === undefined ||
    prevDailySum === undefined;

  const compareLabel = `vs prethodnih ${range.days} d`;

  // Engaged sessions estimate for current vs prev
  const curEngaged = channels?.totals.engagedSessions ?? 0;
  const prevEngagedEstimate =
    prevDailySum && prevDailySum.engagementRate !== undefined
      ? Math.round(prevDailySum.sessions * prevDailySum.engagementRate)
      : 0;

  // Sparkline arrays
  const sparkSessions = useMemo(
    () => (dailySeries ? dailySeries.map((d) => d.sessions) : []),
    [dailySeries],
  );
  const sparkNewUsers = useMemo(
    () => (dailySeries ? dailySeries.map((d) => d.newUsers) : []),
    [dailySeries],
  );
  const sparkTotalUsers = useMemo(
    () => (dailySeries ? dailySeries.map((d) => d.activeUsers) : []),
    [dailySeries],
  );
  const sparkKeyEvents = useMemo(
    () => (dailySeries ? dailySeries.map((d) => d.keyEvents) : []),
    [dailySeries],
  );
  const sparkEngaged = useMemo(
    () =>
      dailySeries
        ? dailySeries.map((d) =>
            d.engagementRate !== undefined
              ? Math.round(d.sessions * d.engagementRate)
              : undefined,
          )
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
        <AcquisitionSkeleton />
      ) : (
        <>
          {/* Top Explanation Sentence */}
          <Reveal>
            <div className="rounded-xl border border-line bg-surface-raised/40 p-4 text-xs leading-relaxed text-text-muted sm:text-sm">
              <span className="font-semibold text-foreground">Prvi dodir</span>{" "}
              kaže odakle je korisnik prvi put došao (vezano za korisnika,
              odgovara na pitanje <em>„ko mi dovodi nove ljude”</em>).{" "}
              <span className="font-semibold text-foreground">Ova poseta</span>{" "}
              kaže odakle je došla konkretna poseta (vezano za sesiju,
              odgovara na pitanje <em>„šta mi vraća ljude”</em>).
            </div>
          </Reveal>

          {/* KPI Row (5 Tiles) */}
          <Reveal>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
              <KpiTile
                label="Novi korisnici"
                value={channels.totals.firstNewUsers || curDailySum.activeUsers}
                format={formatNumber}
                delta={{
                  kind: "pct",
                  value: deltaPct(
                    channels.totals.firstNewUsers,
                    prevDailySum.activeUsers,
                  ),
                }}
                formatDelta={formatSignedPercent}
                compareLabel={compareLabel}
                spark={sparkNewUsers}
              />
              <KpiTile
                label="Ukupno korisnika"
                value={channels.totals.firstUsers || curDailySum.activeUsers}
                format={formatNumber}
                delta={{
                  kind: "pct",
                  value: deltaPct(
                    channels.totals.firstUsers,
                    prevDailySum.activeUsers,
                  ),
                }}
                formatDelta={formatSignedPercent}
                compareLabel={compareLabel}
                spark={sparkTotalUsers}
              />
              <KpiTile
                label="Sesije"
                value={channels.totals.sessions || curDailySum.sessions}
                format={formatNumber}
                delta={{
                  kind: "pct",
                  value: deltaPct(
                    channels.totals.sessions || curDailySum.sessions,
                    prevDailySum.sessions,
                  ),
                }}
                formatDelta={formatSignedPercent}
                compareLabel={compareLabel}
                spark={sparkSessions}
                primary
              />
              <KpiTile
                label="Angažovane sesije"
                value={curEngaged}
                format={formatNumber}
                delta={{
                  kind: "pct",
                  value: deltaPct(curEngaged, prevEngagedEstimate),
                }}
                formatDelta={formatSignedPercent}
                compareLabel={compareLabel}
                spark={sparkEngaged}
              />
              <KpiTile
                label="Ključni događaji"
                value={channels.totals.sessionKeyEvents || curDailySum.keyEvents}
                format={formatNumber}
                delta={{
                  kind: "pct",
                  value: deltaPct(
                    channels.totals.sessionKeyEvents || curDailySum.keyEvents,
                    prevDailySum.keyEvents,
                  ),
                }}
                formatDelta={formatSignedPercent}
                compareLabel={compareLabel}
                spark={sparkKeyEvents}
              />
            </div>
          </Reveal>

          {/* Main Chart: Channel Comparison across Two Scopes */}
          <Reveal>
            <ChartErrorBoundary>
              <ChannelComparisonChart data={channels} />
            </ChartErrorBoundary>
          </Reveal>

          {/* Source / Medium Table with Scope Toggle */}
          <Reveal>
            <SourceAcquisitionTable
              data={sources}
              scope={sourceScope}
              onScopeChange={setSourceScope}
            />
          </Reveal>

          {/* Data Quality Notice */}
          <Reveal>
            <DataQualityNotice
              meta={
                channels.reportMetaFirst ||
                channels.reportMetaSession ||
                sources.reportMeta
              }
            />
          </Reveal>
        </>
      )}
    </div>
  );
}

function AcquisitionSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-8">
      <div className="h-12 w-full animate-pulse rounded-xl bg-line/40" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <KpiTileSkeleton key={i} />
        ))}
      </div>
      <ChannelComparisonSkeleton />
      <SourceAcquisitionSkeleton />
    </div>
  );
}
