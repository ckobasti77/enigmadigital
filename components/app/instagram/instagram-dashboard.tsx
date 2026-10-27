"use client";

import { ProjekatLink } from "@/components/app/projekat-link";
import { useMemo, useState } from "react";
import {
  ChartNoAxesColumn,
  Eye,
  Heart,
  Plus,
  Radio,
  Unplug,
  UserCheck,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import {
  useMoze,
  useProjekatQuery,
} from "@/components/app/projekat-provider";
import { PRAVILA_XP } from "@/convex/lib/napredak";
import { useDateRange } from "@/components/app/date-range-picker";
import { ChartErrorBoundary } from "@/components/app/chart-states";
import { RateLimitBanner } from "@/components/app/rate-limit-banner";
import { useNapredak } from "@/components/app/napredak/use-napredak";
import {
  ChannelFocus,
  ChannelFocusSkeleton,
  useChannelSync,
} from "@/components/app/system/channel-focus";
import { EmptyState } from "@/components/app/system/empty-state";
import { KpiTile, KpiTileSkeleton } from "@/components/app/system/kpi-tile";
import { PageHeader } from "@/components/app/system/page-header";
import { TimelineChartSkeleton } from "@/components/app/timeline-chart";
import { useNow } from "@/components/app/use-now";
import { Button } from "@/components/ui/button";
import { MetricExplorer } from "./metric-explorer";
import {
  InstagramContentGrid,
  InstagramContentGridSkeleton,
} from "./instagram-content-grid";
import { channelReadiness } from "@/lib/channel-readiness";
import { veceJeBolje } from "@/lib/mere";
import {
  deltaPct,
  fillIgDays,
  summarizeIg,
} from "@/lib/metrics";
import {
  formatNumber,
  formatSignedPercent,
} from "@/lib/format";

const DESCRIPTION =
  "Pratioci, doseg i angažovanje naloga u odnosu na prethodni period iste dužine.";

/**
 * Instagram Dashboard. Live subscriptions to daily account metrics
 * (followers, reach, profile views, accounts engaged) and recent media.
 *
 * Fokus ekrana su Pratioci i Spremnost kanala; primarno dugme je „Nova
 * objava" u zaglavlju. Nepovezan ili prazan nalog dobija Misiju za start
 * umesto reda nula.
 */
/** Zbir izmerenih dana; `undefined` dok upit ne stigne ili kad nijedan dan nije izmeren. */
function zbirIzmerenih(
  redovi: ReadonlyArray<{ state: string; value?: number | null }> | undefined,
): number | undefined {
  if (!redovi) return undefined;
  const izmereni = redovi.filter(
    (r): r is { state: string; value: number } =>
      r.state === "value" && typeof r.value === "number",
  );
  if (izmereni.length === 0) return undefined;
  return izmereni.reduce((sum, r) => sum + r.value, 0);
}

export function InstagramDashboard() {
  const { range } = useDateRange();
  const mozeUrediti = useMoze("urednik");
  const connections = useProjekatQuery(api.connections.list);

  const currentRows = useProjekatQuery(api.instagramStore.dailyHistory, {
    from: range.from,
    to: range.to,
  });
  const previousRows = useProjekatQuery(api.instagramStore.dailyHistory, {
    from: range.prevFrom,
    to: range.prevTo,
  });
  const profileViewsCurrent = useProjekatQuery(api.instagramStore.metricSeries, {
    metric: "profile_views",
    from: range.from,
    to: range.to,
  });
  const profileViewsPrevious = useProjekatQuery(api.instagramStore.metricSeries, {
    metric: "profile_views",
    from: range.prevFrom,
    to: range.prevTo,
  });
  const rawMedia = useProjekatQuery(api.instagramStore.mediaList, {
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

  // Zbir pregleda profila samo iz izmerenih dana. Kad nijedan dan perioda nema
  // izmerenu vrednost, zbira nema (nije 0) — pločica tada nosi „—" i razlog.
  const curProfileViews = useMemo(
    () => zbirIzmerenih(profileViewsCurrent),
    [profileViewsCurrent],
  );

  const prevProfileViews = useMemo(
    () => zbirIzmerenih(profileViewsPrevious),
    [profileViewsPrevious],
  );

  // Tri stanja za pločicu pregleda profila: nula i „nema podatka" ne smeju da
  // izgledaju isto. Potisnuto i nedostupno nose razlog koji je Meta javila;
  // period bez ijednog reda je takođe nedostupan, sa svojim razlogom.
  const profileViewsState = useMemo<{
    state: "value" | "suppressed" | "unavailable";
    reason?: string;
  }>(() => {
    if (!profileViewsCurrent) return { state: "value" };
    if (
      profileViewsCurrent.some(
        (r) => r.state === "value" && typeof r.value === "number",
      )
    ) {
      return { state: "value" };
    }
    const supp = profileViewsCurrent.find((r) => r.state === "suppressed");
    if (supp) return { state: "suppressed", reason: supp.reason };
    const unav = profileViewsCurrent.find((r) => r.state === "unavailable");
    if (unav) return { state: "unavailable", reason: unav.reason };
    return {
      state: "unavailable",
      reason: "Meta nije poslala preglede profila za ovaj period.",
    };
  }, [profileViewsCurrent]);

  const profileViewsSpark = useMemo(() => {
    if (!series) return [];
    const byDate = new Map<string, number>();
    if (profileViewsCurrent) {
      for (const r of profileViewsCurrent) {
        if (r.state === "value" && typeof r.value === "number") {
          byDate.set(r.date, r.value);
        }
      }
    }
    // Dan bez merenja ostaje praznina u liniji, ne nula.
    return series.map((d) => byDate.get(d.date));
  }, [series, profileViewsCurrent]);

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

  // Spremnost kanala: sve iz upita koje ekran i ljuska već drže otvorene.
  const sync = useChannelSync("meta_ig");
  const commentCounts = useProjekatQuery(api.igCommentsStore.filterCounts);
  const now = useNow();
  const lastPostAt = useMemo(() => {
    if (!media) return null;
    const live = media.filter((m) => m.deletedAt === undefined);
    return live.length > 0 ? Math.max(...live.map((m) => m.publishedAt)) : null;
  }, [media]);
  const readiness =
    sync && commentCounts
      ? channelReadiness({
          connected: sync.connected,
          lastSyncAt: sync.lastSyncAt,
          syncFailed: sync.syncFailed,
          lastPostAt,
          unanswered: commentCounts.unanswered,
          unansweredCapped: commentCounts.unanswered >= commentCounts.cap,
          now,
        })
      : undefined;

  // XP uz korak misije se ispisuje samo kad ga Napredak stvarno dodeljuje.
  const napredak = useNapredak();
  const publishXp = napredak?.ukljucen ? PRAVILA_XP.objava.xp : undefined;

  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader
        variant="module"
        description={DESCRIPTION}
        actions={
          igConnected &&
          mozeUrediti && (
            <Button
              variant="primary"
              render={<ProjekatLink href="/instagram/objavi" />}
              nativeButton={false}
            >
              <Plus aria-hidden />
              Nova objava
            </Button>
          )
        }
      />

      {/* Stanje koje objašnjava zašto podaci kasne — iznad svega ostalog. */}
      <RateLimitBanner network="Instagram" />

      {!igConnected ? (
        <EmptyState
          icon={Unplug}
          variant="mission"
          title="Poveži Instagram nalog"
          steps={[
            { label: "Poveži Instagram nalog u Podešavanjima" },
            { label: "Prva sinhronizacija povlači do 90 dana istorije" },
            { label: "Objavi prvu objavu iz aplikacije", xp: publishXp },
          ]}
          action={
            <Button
              variant="primary"
              render={<ProjekatLink href="/settings" />}
              nativeButton={false}
            >
              Poveži Instagram
            </Button>
          }
        >
          Posle povezivanja ovde stižu pratioci, doseg i objave naloga.
        </EmptyState>
      ) : loading ? (
        <InstagramDashboardBodySkeleton />
      ) : cur.reach === 0 && cur.followersCount === 0 && media.length === 0 ? (
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
              { label: "Poveži Instagram nalog u Podešavanjima", done: true },
              {
                label: "Prva sinhronizacija povlači do 90 dana istorije",
                done: sync !== undefined && sync.lastSyncAt !== null,
              },
              { label: "Objavi prvu objavu iz aplikacije", xp: publishXp },
            ]}
          >
            Nalog je povezan. Brojevi stižu posle sinhronizacije i prve objave.
          </EmptyState>
        </>
      ) : (
        <>
          <ChannelFocus
            label="Pratioci"
            value={cur.followersCount}
            format={formatNumber}
            delta={deltaPct(cur.followersCount, prev.followersCount)}
            formatDelta={formatSignedPercent}
            compareLabel={compareLabel}
            higherIsBetter={veceJeBolje("pratioci")}
            note="trenutno stanje naloga"
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
              ) : readiness?.next === "comments" ? (
                <Button
                  variant="secondary"
                  size="sm"
                  render={<ProjekatLink href="/instagram/komentari" />}
                  nativeButton={false}
                >
                  Odgovori na komentare
                </Button>
              ) : null
            }
          />

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiTile
              label="Doseg"
              mera="doseg"
              icon={Radio}
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
              shortLabel="Profil"
              mera="pregledi_profila"
              icon={Eye}
              value={curProfileViews}
              format={formatNumber}
              delta={{
                kind: "pct",
                value: deltaPct(curProfileViews, prevProfileViews),
              }}
              formatDelta={formatSignedPercent}
              compareLabel={compareLabel}
              spark={profileViewsSpark}
              state={profileViewsState.state}
              reason={profileViewsState.reason}
            />
            <KpiTile
              label="Ukupno interakcija"
              shortLabel="Interakcije"
              mera="interakcije"
              icon={Heart}
              value={cur.totalInteractions}
              format={formatNumber}
              delta={{
                kind: "pct",
                value: deltaPct(cur.totalInteractions, prev.totalInteractions),
              }}
              formatDelta={formatSignedPercent}
              compareLabel={compareLabel}
              spark={series.map((d) => d.totalInteractions)}
            />
            <KpiTile
              label="Angažovani nalozi"
              shortLabel="Angažovani"
              mera="angazovani_nalozi"
              icon={UserCheck}
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

          <ChartErrorBoundary>
            <MetricExplorer
              from={range.from}
              to={range.to}
              dates={series.map((d) => d.date)}
              followers={series.map((d) => d.followersCount)}
            />
          </ChartErrorBoundary>

          <InstagramContentGrid media={media} />
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

function InstagramDashboardBodySkeleton() {
  return (
    <>
      <ChannelFocusSkeleton />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiTileSkeleton />
        <KpiTileSkeleton />
        <KpiTileSkeleton />
        <KpiTileSkeleton />
      </div>
      <TimelineChartSkeleton topLabelWidth="w-32" bottomPanel={false} />
      <InstagramContentGridSkeleton />
    </>
  );
}

/** Zaglavlje je isto kao na učitanom ekranu, pa podaci ništa ne pomeraju. */
export function InstagramDashboardSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader variant="module" description={DESCRIPTION} />
      <InstagramDashboardBodySkeleton />
    </div>
  );
}
