"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { ChartNoAxesColumn, Unplug } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Reveal } from "@/components/motion/reveal";
import {
  DateRangePicker,
  useDateRange,
} from "@/components/app/date-range-picker";
import { EmptyState } from "@/components/app/empty-state";
import { KpiTile, KpiTileSkeleton } from "@/components/app/analytics/kpi-tile";
import { YouTubeChart, YouTubeChartSkeleton } from "./youtube-chart";
import {
  YouTubeTrafficSources,
  YouTubeTrafficSourcesSkeleton,
} from "./youtube-traffic-sources";
import {
  YouTubeVideosGrid,
  YouTubeVideosGridSkeleton,
} from "./youtube-videos-grid";
import { deltaPct, deltaPp, fillYtDays, summarizeYt } from "@/lib/metrics";
import type { YtDailyPoint } from "@/lib/metrics";
import {
  formatNumber,
  formatPercent,
  formatSignedNumber,
  formatSignedPercent,
  formatSignedPp,
  formatWatchTime,
} from "@/lib/format";

const VIDEO_LIMIT = 30;

/**
 * YouTube Dashboard. Live subscriptions to channel daily totals (views, watch
 * time, subscribers, retention), traffic sources and the newest videos.
 */
export function YouTubeDashboard() {
  const { range } = useDateRange();
  const connections = useQuery(api.connections.list);

  const currentRows = useQuery(api.youtubeStore.dailyTotals, {
    from: range.from,
    to: range.to,
  });
  const previousRows = useQuery(api.youtubeStore.dailyTotals, {
    from: range.prevFrom,
    to: range.prevTo,
  });
  const rawSources = useQuery(api.youtubeStore.trafficSources, {
    from: range.from,
    to: range.to,
  });
  const rawVideos = useQuery(api.youtubeStore.videos, { limit: VIDEO_LIMIT });

  const sources = useStale(rawSources);
  const videos = useStale(rawVideos);

  const series = useStale(
    useMemo(
      () =>
        currentRows ? fillYtDays(currentRows, range.from, range.to) : undefined,
      [currentRows, range.from, range.to],
    ),
  );

  const cur = useStale(
    useMemo(
      () => (currentRows ? summarizeYt(currentRows) : undefined),
      [currentRows],
    ),
  );

  const prev = useStale(
    useMemo(
      () => (previousRows ? summarizeYt(previousRows) : undefined),
      [previousRows],
    ),
  );

  const ytConnected =
    connections === undefined ||
    connections.some((c) => c.provider === "youtube");

  const loading =
    connections === undefined ||
    series === undefined ||
    cur === undefined ||
    prev === undefined ||
    sources === undefined ||
    videos === undefined;

  const compareLabel = `vs prethodnih ${range.days} d`;

  return (
    <div className="flex flex-1 flex-col gap-6">
      <DateRangePicker />

      {!ytConnected ? (
        <EmptyState icon={Unplug}>
          YouTube još nije povezan.{" "}
          <Link
            href="/settings"
            className="text-accent-400 underline-offset-4 hover:underline"
          >
            Poveži ga u podešavanjima
          </Link>
          .
        </EmptyState>
      ) : loading ? (
        <YouTubeDashboardSkeleton />
      ) : (
        <>
          <Reveal>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <KpiTile
                label="Pregledi"
                primary
                value={cur.views}
                format={formatNumber}
                delta={{ kind: "pct", value: deltaPct(cur.views, prev.views) }}
                formatDelta={formatSignedPercent}
                compareLabel={compareLabel}
                spark={series.map((d) => d.views)}
              />
              <KpiTile
                label="Vreme gledanja"
                value={cur.estimatedMinutesWatched}
                format={formatWatchTime}
                delta={{
                  kind: "pct",
                  value: deltaPct(
                    cur.estimatedMinutesWatched,
                    prev.estimatedMinutesWatched,
                  ),
                }}
                formatDelta={formatSignedPercent}
                compareLabel={compareLabel}
                spark={series.map((d) => d.estimatedMinutesWatched)}
              />
              <KpiTile
                label="Pratioci (neto)"
                value={cur.netSubscribers}
                format={formatSignedNumber}
                delta={{
                  kind: "pct",
                  // A negative or zero baseline makes a relative change
                  // meaningless — show a dash instead of a nonsense percentage.
                  value:
                    prev.netSubscribers > 0
                      ? deltaPct(cur.netSubscribers, prev.netSubscribers)
                      : null,
                }}
                formatDelta={formatSignedPercent}
                compareLabel={compareLabel}
                spark={cumulativeNet(series)}
              />
              <KpiTile
                label="Prosečno odgledano"
                value={cur.averageViewPercentage}
                format={formatPercent}
                delta={{
                  kind: "pp",
                  value: deltaPp(
                    cur.averageViewPercentage,
                    prev.averageViewPercentage,
                  ),
                }}
                formatDelta={formatSignedPp}
                compareLabel={compareLabel}
                spark={series.map((d) => d.averageViewPercentage)}
              />
            </div>
          </Reveal>

          {cur.views === 0 && videos.length === 0 ? (
            <EmptyState icon={ChartNoAxesColumn}>
              Nema podataka za izabrani period. Istorija seže 90 dana unazad od
              prve sinhronizacije.
            </EmptyState>
          ) : (
            <>
              <Reveal delay={0.04}>
                <YouTubeChart data={series} />
              </Reveal>

              <Reveal delay={0.07}>
                <YouTubeTrafficSources sources={sources} />
              </Reveal>

              <Reveal delay={0.1}>
                <YouTubeVideosGrid videos={videos} />
              </Reveal>
            </>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Running total of the daily net subscriber change, rebased so the lowest
 * point sits at 0 — the sparkline has no axis, only the shape carries meaning,
 * and a channel that loses subscribers must still draw a falling line.
 */
function cumulativeNet(series: YtDailyPoint[]): number[] {
  let acc = 0;
  const running = series.map((d) => {
    acc += d.subscribersGained - d.subscribersLost;
    return acc;
  });
  const floor = Math.min(0, ...running);
  return running.map((v) => v - floor);
}

function useStale<T>(value: T | undefined): T | undefined {
  const [last, setLast] = useState<T | undefined>(value);
  if (value !== undefined && value !== last) setLast(value);
  return value ?? last;
}

export function YouTubeDashboardSkeleton() {
  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiTileSkeleton />
        <KpiTileSkeleton />
        <KpiTileSkeleton />
        <KpiTileSkeleton />
      </div>
      <YouTubeChartSkeleton />
      <YouTubeTrafficSourcesSkeleton />
      <YouTubeVideosGridSkeleton />
    </>
  );
}
