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
import { RateLimitBanner } from "@/components/app/rate-limit-banner";
import { KpiTile, KpiTileSkeleton } from "@/components/app/analytics/kpi-tile";
import { FacebookChart, FacebookChartSkeleton } from "./facebook-chart";
import {
  FacebookContentGrid,
  FacebookContentGridSkeleton,
} from "./facebook-content-grid";
import { deltaPct, fillFbDays, summarizeFb } from "@/lib/metrics";
import { formatNumber, formatSignedPercent } from "@/lib/format";

/**
 * Facebook Page dashboard. Same layout as the Instagram one on purpose — KPI
 * row, timeline, content grid — so that switching channels does not mean
 * learning a second screen.
 */
export function FacebookDashboard() {
  const { range } = useDateRange();
  const pageInfo = useQuery(api.facebookStore.pageInfo);

  const currentRows = useQuery(api.facebookStore.dailyHistory, {
    from: range.from,
    to: range.to,
  });
  const previousRows = useQuery(api.facebookStore.dailyHistory, {
    from: range.prevFrom,
    to: range.prevTo,
  });
  const rawPosts = useQuery(api.facebookStore.postsList, { limit: 30 });

  const posts = useStale(rawPosts);

  const series = useStale(
    useMemo(
      () =>
        currentRows ? fillFbDays(currentRows, range.from, range.to) : undefined,
      [currentRows, range.from, range.to],
    ),
  );

  const cur = useStale(
    useMemo(
      () => (currentRows ? summarizeFb(currentRows) : undefined),
      [currentRows],
    ),
  );

  const prev = useStale(
    useMemo(
      () => (previousRows ? summarizeFb(previousRows) : undefined),
      [previousRows],
    ),
  );

  const fbConnected = pageInfo === undefined || pageInfo !== null;

  const loading =
    pageInfo === undefined ||
    series === undefined ||
    cur === undefined ||
    prev === undefined ||
    posts === undefined;

  const compareLabel = `vs prethodnih ${range.days} d`;

  // Engagement per impression: the one derived number worth a tile, because it
  // is the only one that says whether reach turned into anything.
  const engagementRate = cur && cur.impressions > 0
    ? cur.engagements / cur.impressions
    : 0;
  const prevEngagementRate =
    prev && prev.impressions > 0 ? prev.engagements / prev.impressions : 0;

  return (
    <div className="flex flex-1 flex-col gap-8">
      <RateLimitBanner network="Facebook" />

      {!fbConnected ? (
        <EmptyState icon={Unplug}>
          Facebook stranica još nije povezana.{" "}
          <Link
            href="/settings"
            className="text-accent-400 underline-offset-4 hover:underline"
          >
            Poveži je u podešavanjima
          </Link>
          .
        </EmptyState>
      ) : loading ? (
        <FacebookDashboardSkeleton />
      ) : (
        <>
          <Reveal>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <KpiTile
                label="Pratioci stranice"
                primary
                value={cur.fans}
                format={formatNumber}
                delta={{ kind: "pct", value: deltaPct(cur.fans, prev.fans) }}
                formatDelta={formatSignedPercent}
                compareLabel={compareLabel}
                spark={series.map((d) => d.fans)}
              />
              <KpiTile
                label="Prikazi"
                value={cur.impressions}
                format={formatNumber}
                delta={{
                  kind: "pct",
                  value: deltaPct(cur.impressions, prev.impressions),
                }}
                formatDelta={formatSignedPercent}
                compareLabel={compareLabel}
                spark={series.map((d) => d.impressions)}
              />
              <KpiTile
                label="Angažovanja"
                value={cur.engagements}
                format={formatNumber}
                delta={{
                  kind: "pct",
                  value: deltaPct(cur.engagements, prev.engagements),
                }}
                formatDelta={formatSignedPercent}
                compareLabel={compareLabel}
                spark={series.map((d) => d.engagements)}
              />
              <KpiTile
                label="Angažovanja po prikazu"
                value={engagementRate}
                format={(value) => formatNumber(Math.round(value * 1000) / 10)}
                delta={{
                  kind: "pct",
                  value: deltaPct(engagementRate, prevEngagementRate),
                }}
                formatDelta={formatSignedPercent}
                compareLabel={compareLabel}
                spark={series.map((d) =>
                  d.impressions > 0 ? d.engagements / d.impressions : 0,
                )}
              />
            </div>
          </Reveal>

          {cur.impressions === 0 && cur.fans === 0 && posts.length === 0 ? (
            <EmptyState icon={ChartNoAxesColumn}>
              Nema podataka za izabrani period. Uvidi stižu pri prvoj
              sinhronizaciji posle povezivanja stranice.
            </EmptyState>
          ) : (
            <>
              <Reveal delay={0.05}>
                <ChartErrorBoundary>
                  <FacebookChart data={series} />
                </ChartErrorBoundary>
              </Reveal>

              <Reveal delay={0.1}>
                <FacebookContentGrid posts={posts} />
              </Reveal>
            </>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Keeps the last non-undefined value on screen while a new one is in flight, so
 * a range change fades rather than blanking the whole board.
 */
function useStale<T>(value: T | undefined): T | undefined {
  const [last, setLast] = useState<T | undefined>(value);
  if (value !== undefined && value !== last) setLast(value);
  return value ?? last;
}

export function FacebookDashboardSkeleton() {
  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiTileSkeleton />
        <KpiTileSkeleton />
        <KpiTileSkeleton />
        <KpiTileSkeleton />
      </div>
      <FacebookChartSkeleton />
      <FacebookContentGridSkeleton />
    </>
  );
}
