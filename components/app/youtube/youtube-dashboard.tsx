"use client";

import { ProjekatLink } from "@/components/app/projekat-link";
import { useMemo, useState } from "react";
import {
  ChartNoAxesColumn,
  Clock,
  Gauge,
  Radio,
  Unplug,
  UserPlus,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import {
  useMoze,
  useProjekatQuery,
} from "@/components/app/projekat-provider";
import {
  useDateRange,
} from "@/components/app/date-range-picker";
import { ChartErrorBoundary } from "@/components/app/chart-states";
import {
  ChannelFocus,
  ChannelFocusSkeleton,
  useChannelSync,
} from "@/components/app/system/channel-focus";
import { EmptyState } from "@/components/app/system/empty-state";
import { KpiTile, KpiTileSkeleton } from "@/components/app/system/kpi-tile";
import { PageHeader } from "@/components/app/system/page-header";
import { useNow } from "@/components/app/use-now";
import { Button } from "@/components/ui/button";
import { YouTubeChart, YouTubeChartSkeleton } from "./youtube-chart";
import {
  YouTubeTrafficSources,
  YouTubeTrafficSourcesSkeleton,
} from "./youtube-traffic-sources";
import {
  YouTubeVideosGrid,
  YouTubeVideosGridSkeleton,
} from "./youtube-videos-grid";
import { YtUploadButton } from "./yt-upload-dialog";
import { POST_NOUN_VIDEO, channelReadiness } from "@/lib/channel-readiness";
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

const DESCRIPTION =
  "Pregledi, vreme gledanja i pratioci kanala u odnosu na prethodni period iste dužine.";

/**
 * YouTube Dashboard. Live subscriptions to channel daily totals (views, watch
 * time, subscribers, retention), traffic sources and the newest videos.
 *
 * Fokus su Pregledi i Spremnost kanala; primarno dugme je „Pošalji video" u
 * zaglavlju. Merač ovde ima tri uslova: stanje odgovora na komentare se za
 * YouTube ne čuva, pa se ne tvrdi.
 */
export function YouTubeDashboard() {
  const { range } = useDateRange();
  const mozeUrediti = useMoze("urednik");
  const connections = useProjekatQuery(api.connections.list);

  const currentRows = useProjekatQuery(api.youtubeStore.dailyTotals, {
    from: range.from,
    to: range.to,
  });
  const previousRows = useProjekatQuery(api.youtubeStore.dailyTotals, {
    from: range.prevFrom,
    to: range.prevTo,
  });
  const rawSources = useProjekatQuery(api.youtubeStore.trafficSources, {
    from: range.from,
    to: range.to,
  });
  const rawVideos = useProjekatQuery(api.youtubeStore.videos, {
    limit: VIDEO_LIMIT,
  });

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

  // Spremnost kanala: sve iz upita koje ekran i ljuska već drže otvorene.
  const sync = useChannelSync("youtube");
  const now = useNow();
  const lastPostAt = useMemo(() => {
    if (!videos || videos.length === 0) return null;
    const newest = Math.max(...videos.map((v) => v.publishedAt));
    return newest > 0 ? newest : null;
  }, [videos]);
  const readiness = sync
    ? channelReadiness({
        connected: sync.connected,
        lastSyncAt: sync.lastSyncAt,
        syncFailed: sync.syncFailed,
        lastPostAt,
        postNoun: POST_NOUN_VIDEO,
        now,
      })
    : undefined;

  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader
        variant="module"
        description={DESCRIPTION}
        actions={ytConnected && mozeUrediti && <YtUploadButton />}
      />

      {!ytConnected ? (
        <EmptyState
          icon={Unplug}
          variant="mission"
          title="Poveži YouTube kanal"
          steps={[
            { label: "Poveži YouTube kanal u Podešavanjima" },
            { label: "Prva sinhronizacija povlači do 90 dana istorije" },
            { label: "Pošalji prvi video iz aplikacije" },
          ]}
          action={
            <Button
              variant="primary"
              render={<ProjekatLink href="/settings" />}
              nativeButton={false}
            >
              Poveži YouTube
            </Button>
          }
        >
          Posle povezivanja ovde stižu pregledi, vreme gledanja i video snimci.
        </EmptyState>
      ) : loading ? (
        <YouTubeDashboardBodySkeleton />
      ) : cur.views === 0 && videos.length === 0 ? (
        <>
          <EmptyState
            icon={ChartNoAxesColumn}
            variant="line"
            title="Još nema podataka za ovaj period."
          >
            Istorija seže 90 dana unazad od prve sinhronizacije.
          </EmptyState>
          <EmptyState
            icon={Radio}
            variant="mission"
            size="sm"
            title="Pokreni kanal"
            steps={[
              { label: "Poveži YouTube kanal u Podešavanjima", done: true },
              {
                label: "Prva sinhronizacija povlači do 90 dana istorije",
                done: sync !== undefined && sync.lastSyncAt !== null,
              },
              { label: "Pošalji prvi video iz aplikacije" },
            ]}
          >
            Kanal je povezan. Brojevi stižu posle sinhronizacije i prvog videa.
          </EmptyState>
        </>
      ) : (
        <>
          <ChannelFocus
            label="Pregledi"
            value={cur.views}
            format={formatNumber}
            delta={deltaPct(cur.views, prev.views)}
            formatDelta={formatSignedPercent}
            compareLabel={compareLabel}
            note="zbir za period"
            readiness={readiness}
            next={
              readiness?.next === "connected" || readiness?.next === "sync" ? (
                <Button
                  variant="secondary"
                  size="sm"
                  render={<ProjekatLink href="/settings" />}
                  nativeButton={false}
                >
                  Otvori podešavanja
                </Button>
              ) : null
            }
          />

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 [&>*:last-child]:col-span-2 lg:[&>*:last-child]:col-span-1">
            <KpiTile
              label="Vreme gledanja"
              icon={Clock}
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
              icon={UserPlus}
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
              shortLabel="Odgledano"
              icon={Gauge}
              value={cur.averageViewPercentage}
              format={formatPercent}
              delta={{
                kind: "pp",
                // Prazan prethodni period nije „0 %" — tada poređenja nema.
                value:
                  previousRows !== undefined && previousRows.length > 0
                    ? deltaPp(
                        cur.averageViewPercentage,
                        prev.averageViewPercentage,
                      )
                    : null,
              }}
              formatDelta={formatSignedPp}
              compareLabel={compareLabel}
              spark={series.map((d) => d.averageViewPercentage)}
            />
          </div>

          <ChartErrorBoundary>
            <YouTubeChart data={series} />
          </ChartErrorBoundary>

          <YouTubeTrafficSources sources={sources} />

          <YouTubeVideosGrid videos={videos} />
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

function YouTubeDashboardBodySkeleton() {
  return (
    <>
      <ChannelFocusSkeleton />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 [&>*:last-child]:col-span-2 lg:[&>*:last-child]:col-span-1">
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

/** Zaglavlje je isto kao na učitanom ekranu, pa podaci ništa ne pomeraju. */
export function YouTubeDashboardSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader variant="module" description={DESCRIPTION} />
      <YouTubeDashboardBodySkeleton />
    </div>
  );
}
