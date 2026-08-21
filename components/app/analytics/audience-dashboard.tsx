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
import { DeviceChart, DeviceChartSkeleton } from "./device-chart";
import { GeoRanking, GeoRankingSkeleton } from "./geo-ranking";
import {
  TimeOfDayHeatmap,
  TimeOfDayHeatmapSkeleton,
} from "./time-of-day-heatmap";
import { DataQualityNotice } from "./data-quality-notice";
import { deltaPct, deltaPp, fillDays, summarize } from "@/lib/metrics";
import { formatNumber, formatPercent, formatSignedPercent } from "@/lib/format";

function useStale<T>(value: T | undefined): T | undefined {
  const [last, setLast] = useState<T | undefined>(value);
  if (value !== undefined && value !== last) {
    setLast(value);
    return value;
  }
  return value ?? last;
}

export function AudienceDashboard() {
  const { range } = useDateRange();
  const connections = useQuery(api.connections.list);

  const [geoLevel, setGeoLevel] = useState<"country" | "city">("country");

  const currentDaily = useQuery(api.analytics.daily, {
    from: range.from,
    to: range.to,
  });
  const previousDaily = useQuery(api.analytics.daily, {
    from: range.prevFrom,
    to: range.prevTo,
  });

  const deviceData = useStale(
    useQuery(api.analytics.audienceDevice, {
      from: range.from,
      to: range.to,
    }),
  );

  const geoData = useStale(
    useQuery(api.analytics.audienceGeo, {
      from: range.from,
      to: range.to,
      level: geoLevel,
    }),
  );

  const timeData = useStale(
    useQuery(api.analytics.timeOfDay, {
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
    deviceData === undefined ||
    geoData === undefined ||
    timeData === undefined ||
    dailySeries === undefined ||
    curDailySum === undefined ||
    prevDailySum === undefined;

  const compareLabel = `vs prethodnih ${range.days} d`;

  const sparkSessions = useMemo(
    () => (dailySeries ? dailySeries.map((d) => d.sessions) : []),
    [dailySeries],
  );
  const sparkUsers = useMemo(
    () => (dailySeries ? dailySeries.map((d) => d.activeUsers) : []),
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
        <AudienceSkeleton />
      ) : (
        <>
          {/* Top Explanation Banner */}
          <Reveal>
            <div className="rounded-xl border border-line bg-surface-raised/40 p-4 text-xs leading-relaxed text-text-muted sm:text-sm">
              <span className="font-semibold text-foreground">Posetioci i ponašanje</span>{" "}
              obuhvataju profil vaše publike: vrstu uređaja koje koriste, geografsku lokaciju odakle dolaze, i termine u toku dana i nedelje kada su najaktivniji.
            </div>
          </Reveal>

          {/* KPI Row (4 Tiles) */}
          <Reveal>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <KpiTile
                label="Ukupno korisnika"
                value={deviceData.totals.totalUsers || curDailySum.activeUsers}
                format={formatNumber}
                delta={{
                  kind: "pct",
                  value: deltaPct(
                    deviceData.totals.totalUsers || curDailySum.activeUsers,
                    prevDailySum.activeUsers,
                  ),
                }}
                formatDelta={formatSignedPercent}
                compareLabel={compareLabel}
                spark={sparkUsers}
              />
              <KpiTile
                label="Sesije"
                value={deviceData.totals.sessions || curDailySum.sessions}
                format={formatNumber}
                delta={{
                  kind: "pct",
                  value: deltaPct(
                    deviceData.totals.sessions || curDailySum.sessions,
                    prevDailySum.sessions,
                  ),
                }}
                formatDelta={formatSignedPercent}
                compareLabel={compareLabel}
                spark={sparkSessions}
              />
              <KpiTile
                label="Angažovane sesije"
                value={deviceData.totals.engagedSessions}
                format={formatNumber}
                delta={{
                  kind: "pct",
                  value: deltaPct(
                    deviceData.totals.engagedSessions,
                    prevDailySum.engagementRate !== undefined
                      ? Math.round(
                          prevDailySum.sessions * prevDailySum.engagementRate,
                        )
                      : undefined,
                  ),
                }}
                formatDelta={formatSignedPercent}
                compareLabel={compareLabel}
                spark={sparkEngaged}
              />
              <KpiTile
                label="Stopa angažovanja"
                value={deviceData.totals.engagementRate}
                format={formatPercent}
                delta={{
                  kind: "pp",
                  value: deltaPp(
                    deviceData.totals.engagementRate,
                    prevDailySum.engagementRate,
                  ),
                }}
                formatDelta={formatSignedPercent}
                compareLabel={compareLabel}
                spark={[]}
              />
            </div>
          </Reveal>

          {/* Device Stacked Area Chart */}
          <Reveal>
            <ChartErrorBoundary>
              <DeviceChart data={deviceData} />
            </ChartErrorBoundary>
          </Reveal>

          {/* Geographic Ranking (Explicitly NO MAP) */}
          <Reveal>
            <ChartErrorBoundary>
              <GeoRanking
                data={geoData}
                level={geoLevel}
                onLevelChange={setGeoLevel}
              />
            </ChartErrorBoundary>
          </Reveal>

          {/* 7x24 Heatmap Matrix */}
          <Reveal>
            <ChartErrorBoundary>
              <TimeOfDayHeatmap data={timeData} />
            </ChartErrorBoundary>
          </Reveal>

          {/* Data Quality Notice */}
          <Reveal>
            <DataQualityNotice
              meta={
                deviceData.reportMeta ||
                geoData.reportMeta ||
                timeData.reportMeta
              }
            />
          </Reveal>
        </>
      )}
    </div>
  );
}

function AudienceSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-8">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiTileSkeleton />
        <KpiTileSkeleton />
        <KpiTileSkeleton />
        <KpiTileSkeleton />
      </div>
      <DeviceChartSkeleton />
      <GeoRankingSkeleton />
      <TimeOfDayHeatmapSkeleton />
    </div>
  );
}
