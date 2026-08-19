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
import { KpiTile, KpiTileSkeleton } from "@/components/app/analytics/kpi-tile";
import { InstagramChart, InstagramChartSkeleton } from "./instagram-chart";
import {
  InstagramContentGrid,
  InstagramContentGridSkeleton,
} from "./instagram-content-grid";
import {
  deltaPct,
  fillIgDays,
  summarizeIg,
} from "@/lib/metrics";
import {
  formatNumber,
  formatSignedPercent,
} from "@/lib/format";

/**
 * Instagram Dashboard. Live subscriptions to daily account metrics
 * (followers, reach, profile views, accounts engaged) and recent media.
 */
export function InstagramDashboard() {
  const { range } = useDateRange();
  const connections = useQuery(api.connections.list);

  const currentRows = useQuery(api.instagramStore.dailyHistory, {
    from: range.from,
    to: range.to,
  });
  const previousRows = useQuery(api.instagramStore.dailyHistory, {
    from: range.prevFrom,
    to: range.prevTo,
  });
  const rawMedia = useQuery(api.instagramStore.mediaList, {
    limit: 30,
  });

  const media = useStale(rawMedia);

  const series = useStale(
    useMemo(
      () =>
        currentRows ? fillIgDays(currentRows, range.from, range.to) : undefined,
      [currentRows, range.from, range.to],
    ),
  );

  const cur = useStale(
    useMemo(
      () => (currentRows ? summarizeIg(currentRows) : undefined),
      [currentRows],
    ),
  );

  const prev = useStale(
    useMemo(
      () => (previousRows ? summarizeIg(previousRows) : undefined),
      [previousRows],
    ),
  );

  const igConnected =
    connections === undefined ||
    connections.some((c) => c.provider === "meta_ig");

  const loading =
    connections === undefined ||
    series === undefined ||
    cur === undefined ||
    prev === undefined ||
    media === undefined;

  const compareLabel = `vs prethodnih ${range.days} d`;

  return (
    <div className="flex flex-1 flex-col gap-8">
      {!igConnected ? (
        <EmptyState icon={Unplug}>
          Instagram još nije povezan.{" "}
          <Link
            href="/settings"
            className="text-accent-400 underline-offset-4 hover:underline"
          >
            Poveži ga u podešavanjima
          </Link>
          .
        </EmptyState>
      ) : loading ? (
        <InstagramDashboardSkeleton />
      ) : (
        <>
          <Reveal>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <KpiTile
                label="Pratioci"
                primary
                value={cur.followersCount}
                format={formatNumber}
                delta={{
                  kind: "pct",
                  value: deltaPct(cur.followersCount, prev.followersCount),
                }}
                formatDelta={formatSignedPercent}
                compareLabel={compareLabel}
                spark={series.map((d) => d.followersCount)}
              />
              <KpiTile
                label="Reach (Doseg)"
                value={cur.reach}
                format={formatNumber}
                delta={{
                  kind: "pct",
                  value: deltaPct(cur.reach, prev.reach),
                }}
                formatDelta={formatSignedPercent}
                compareLabel={compareLabel}
                spark={series.map((d) => d.reach)}
              />
              <KpiTile
                label="Pregledi profila"
                value={cur.profileViews}
                format={formatNumber}
                delta={{
                  kind: "pct",
                  value: deltaPct(cur.profileViews, prev.profileViews),
                }}
                formatDelta={formatSignedPercent}
                compareLabel={compareLabel}
                spark={series.map((d) => d.profileViews)}
              />
              <KpiTile
                label="Angažovani nalozi"
                value={cur.accountsEngaged}
                format={formatNumber}
                delta={{
                  kind: "pct",
                  value: deltaPct(cur.accountsEngaged, prev.accountsEngaged),
                }}
                formatDelta={formatSignedPercent}
                compareLabel={compareLabel}
                spark={series.map((d) => d.accountsEngaged)}
              />
            </div>
          </Reveal>

          {cur.reach === 0 && cur.followersCount === 0 && media.length === 0 ? (
            <EmptyState icon={ChartNoAxesColumn}>
              Nema podataka za izabrani period. Istorija seže 90 dana unazad od
              prve sinhronizacije.
            </EmptyState>
          ) : (
            <>
              <Reveal delay={0.05}>
                <ChartErrorBoundary>
                  <InstagramChart data={series} />
                </ChartErrorBoundary>
              </Reveal>

              <Reveal delay={0.1}>
                <InstagramContentGrid media={media} />
              </Reveal>
            </>
          )}
        </>
      )}
    </div>
  );
}

function useStale<T>(value: T | undefined): T | undefined {
  const [last, setLast] = useState<T | undefined>(value);
  if (value !== undefined && value !== last) setLast(value);
  return value ?? last;
}

export function InstagramDashboardSkeleton() {
  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiTileSkeleton />
        <KpiTileSkeleton />
        <KpiTileSkeleton />
        <KpiTileSkeleton />
      </div>
      <InstagramChartSkeleton />
      <InstagramContentGridSkeleton />
    </>
  );
}
