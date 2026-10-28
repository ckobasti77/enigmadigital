"use client";

import { ProjekatLink } from "@/components/app/projekat-link";
import { useMemo, useState } from "react";
import {
  ChartNoAxesColumn,
  Eye,
  Heart,
  MessageCircle,
  Percent,
  Radio,
  Unplug,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useProjekatQuery } from "@/components/app/projekat-provider";
import { useDateRange } from "@/components/app/date-range-picker";
import { ChartErrorBoundary } from "@/components/app/chart-states";
import { RateLimitBanner } from "@/components/app/rate-limit-banner";
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
import { FacebookChart, FacebookChartSkeleton } from "./facebook-chart";
import {
  FacebookContentGrid,
  FacebookContentGridSkeleton,
} from "./facebook-content-grid";
import { channelReadiness } from "@/lib/channel-readiness";
import { veceJeBolje } from "@/lib/mere";
import { deltaPct, fillFbDays, summarizeFb } from "@/lib/metrics";
import {
  formatNumber,
  formatPercent,
  formatSignedPercent,
} from "@/lib/format";

const DESCRIPTION =
  "Pratioci, prikazi i angažovanja stranice u odnosu na prethodni period iste dužine.";

/**
 * Facebook Page dashboard. Same layout as the Instagram one on purpose — focus
 * card, KPI row, timeline, content grid — so that switching channels does not
 * mean learning a second screen.
 *
 * Sa stranice se iz aplikacije ne objavljuje; jedino što se ovde RADI je
 * moderacija, pa je primarno dugme „Odgovori na komentare".
 */
export function FacebookDashboard() {
  const { range } = useDateRange();
  const pageInfo = useProjekatQuery(api.facebookStore.pageInfo);

  const currentRows = useProjekatQuery(api.facebookStore.dailyHistory, {
    from: range.from,
    to: range.to,
  });
  const previousRows = useProjekatQuery(api.facebookStore.dailyHistory, {
    from: range.prevFrom,
    to: range.prevTo,
  });
  const rawPosts = useProjekatQuery(api.facebookStore.postsList, { limit: 30 });

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

  // Spremnost kanala: sve iz upita koje ekran i ljuska već drže otvorene.
  const sync = useChannelSync("meta_fb");
  const commentCounts = useProjekatQuery(api.fbCommentsStore.filterCounts);
  const now = useNow();
  const lastPostAt = useMemo(() => {
    if (!posts) return null;
    const live = posts.filter((p) => p.deletedAt === undefined);
    return live.length > 0 ? Math.max(...live.map((p) => p.publishedAt)) : null;
  }, [posts]);
  const readiness =
    sync && commentCounts && pageInfo !== undefined
      ? channelReadiness({
          connected: pageInfo !== null,
          lastSyncAt: sync.lastSyncAt ?? pageInfo?.lastSyncAt ?? null,
          syncFailed: sync.syncFailed,
          lastPostAt,
          unanswered: commentCounts.unanswered,
          unansweredCapped: commentCounts.unanswered >= commentCounts.cap,
          now,
        })
      : undefined;

  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader
        variant="module"
        description={DESCRIPTION}
        actions={
          fbConnected && (
            <Button
              variant="primary"
              render={<ProjekatLink href="/facebook/komentari" />}
              nativeButton={false}
            >
              <MessageCircle aria-hidden />
              Odgovori na komentare
            </Button>
          )
        }
      />

      <RateLimitBanner network="Facebook" />

      {!fbConnected ? (
        <EmptyState
          icon={Unplug}
          variant="mission"
          title="Poveži Facebook stranicu"
          steps={[
            { label: "Poveži Facebook stranicu u Podešavanjima" },
            { label: "Prva sinhronizacija povlači uvide i objave stranice" },
            { label: "Odgovori na prvi komentar sa stranice" },
          ]}
          action={
            <Button
              variant="primary"
              render={<ProjekatLink href="/settings" />}
              nativeButton={false}
            >
              Poveži Facebook
            </Button>
          }
        >
          Posle povezivanja ovde stižu pratioci, prikazi i objave stranice.
        </EmptyState>
      ) : loading ? (
        <FacebookDashboardBodySkeleton />
      ) : cur.impressions === 0 && cur.fans === 0 && posts.length === 0 ? (
        <>
          <EmptyState
            icon={ChartNoAxesColumn}
            variant="line"
            title="Još nema podataka za ovaj period."
          >
            Uvidi stižu pri prvoj sinhronizaciji posle povezivanja stranice.
          </EmptyState>
          <EmptyState
            icon={Radio}
            variant="mission"
            size="sm"
            title="Pokreni kanal"
            steps={[
              { label: "Poveži Facebook stranicu u Podešavanjima", done: true },
              {
                label: "Prva sinhronizacija povlači uvide i objave stranice",
                done: readiness?.segments.some(
                  (s) => s.key === "sync" && s.done,
                ),
              },
              { label: "Odgovori na prvi komentar sa stranice" },
            ]}
          >
            Stranica je povezana. Brojevi stižu posle prve sinhronizacije.
          </EmptyState>
        </>
      ) : (
        <>
          <ChannelFocus
            label="Pratioci stranice"
            mera="pratioci"
            value={cur.fans}
            format={formatNumber}
            delta={deltaPct(cur.fans, prev.fans)}
            formatDelta={formatSignedPercent}
            compareLabel={compareLabel}
            higherIsBetter={veceJeBolje("pratioci")}
            note="trenutno stanje stranice"
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
              label="Prikazi"
              mera="prikazi"
              icon={Eye}
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
              mera="angazovanja"
              icon={Heart}
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
              mera="angazovanja_po_prikazu"
              shortLabel="Po prikazu"
              icon={Percent}
              value={engagementRate}
              format={formatPercent}
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

          <ChartErrorBoundary>
            <FacebookChart data={series} />
          </ChartErrorBoundary>

          <FacebookContentGrid posts={posts} />
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

function FacebookDashboardBodySkeleton() {
  return (
    <>
      <ChannelFocusSkeleton />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 [&>*:last-child]:col-span-2 lg:[&>*:last-child]:col-span-1">
        <KpiTileSkeleton />
        <KpiTileSkeleton />
        <KpiTileSkeleton />
      </div>
      <FacebookChartSkeleton />
      <FacebookContentGridSkeleton />
    </>
  );
}

/** Zaglavlje je isto kao na učitanom ekranu, pa podaci ništa ne pomeraju. */
export function FacebookDashboardSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader variant="module" description={DESCRIPTION} />
      <FacebookDashboardBodySkeleton />
    </div>
  );
}
