"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ChartNoAxesColumn,
  Eye,
  LayoutDashboard,
  Link2,
  MessageCircle,
  Quote,
  Radio,
  Repeat2,
  Search,
  Send,
  Unplug,
  Zap,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { PRAVILA_XP } from "@/convex/lib/napredak";
import { useDateRange } from "@/components/app/date-range-picker";
import { RateLimitBanner } from "@/components/app/rate-limit-banner";
import { useNapredak } from "@/components/app/napredak/use-napredak";
import { useProjekatQuery } from "@/components/app/projekat-provider";
import {
  ChannelFocus,
  ChannelFocusSkeleton,
  useChannelSync,
} from "@/components/app/system/channel-focus";
import { EmptyState } from "@/components/app/system/empty-state";
import {
  StatTile,
  StatTileSkeleton,
} from "@/components/app/system/kpi-tile";
import { PageHeader } from "@/components/app/system/page-header";
import {
  TimelineChart,
  TimelineChartSkeleton,
} from "@/components/app/timeline-chart";
import { TabNav, TabPanel } from "@/components/app/tab-nav";
import { useNow } from "@/components/app/use-now";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { channelReadiness } from "@/lib/channel-readiness";
import { formatNumber } from "@/lib/format";
import { ThreadsFollowsChart } from "./threads-follows-chart";
import {
  ThreadsContentGrid,
  ThreadsContentGridSkeleton,
} from "./threads-content-grid";
import { ThreadsDemographicsTable } from "./threads-demographics-table";
import { ThreadsAttributionSection } from "./threads-attribution-section";
import { ThreadsComposer } from "./threads-composer";
import { ThreadsJobsPanel } from "./threads-jobs-panel";
import { ThreadsRepliesModeration } from "./threads-replies-moderation";
import { ThreadsAutomations } from "./threads-automations";
import { ThreadsSearch } from "./threads-search";

type ThreadsTab =
  | "overview"
  | "publish"
  | "moderation"
  | "automations"
  | "search";

const DESCRIPTION =
  "Prikazi, pratioci, klikovi i angažovanje naloga, uz atribuciju linkova.";

/**
 * Threads Dashboard.
 * Integrisan pregled analitike, kompozera objava sa redom poslova,
 * moderacije odgovora i pravila automatizacije (OpenReply).
 *
 * Fokus su Pratioci i Spremnost kanala; primarno dugme „Objavi" u zaglavlju
 * otvara jezičak Objavljivanje. Merač ima tri uslova: zbirnog broja odgovora
 * koji čekaju za Threads nema, pa se ne tvrdi.
 */
export function ThreadsDashboard() {
  const [tab, setTab] = useState<ThreadsTab>("overview");
  const { range } = useDateRange();

  const overview = useProjekatQuery(api.threadsStore.accountOverview, {
    from: range.from,
    to: range.to,
  });

  const followerHistory = useProjekatQuery(api.threadsStore.followerHistory, {
    from: range.from,
    to: range.to,
  });

  const media = useProjekatQuery(api.threadsStore.mediaList, {
    limit: 50,
  });

  const demographics = useProjekatQuery(api.threadsStore.demographicsSummary, {});

  const attribution = useProjekatQuery(
    api.threadsFunnels.getThreadsLinkAttributionSummary,
    {
      dateFrom: range.from,
      dateTo: range.to,
    },
  );

  const unmatchedUrls = useProjekatQuery(api.threadsFunnels.listUnmatchedUrls, {
    limit: 50,
  });

  // Spremnost kanala: sve iz upita koje ekran i ljuska već drže otvorene.
  const sync = useChannelSync("threads");
  const now = useNow();
  const lastPostAt = useMemo(() => {
    if (!media) return null;
    const times = media
      .map((m) => (m.timestamp ? Date.parse(m.timestamp) : NaN))
      .filter((t) => Number.isFinite(t));
    return times.length > 0 ? Math.max(...times) : null;
  }, [media]);

  // XP uz korak misije se ispisuje samo kad ga Napredak stvarno dodeljuje.
  const napredak = useNapredak();
  const publishXp = napredak?.ukljucen ? PRAVILA_XP.objava.xp : undefined;

  const loading =
    overview === undefined ||
    followerHistory === undefined ||
    media === undefined ||
    demographics === undefined ||
    attribution === undefined ||
    unmatchedUrls === undefined;

  if (overview !== undefined && !overview.connected) {
    return (
      <div className="flex flex-1 flex-col gap-6">
        <PageHeader variant="module" description={DESCRIPTION} />
        <RateLimitBanner network="Threads" />
        <EmptyState
          icon={Unplug}
          variant="mission"
          title="Poveži Threads nalog"
          steps={[
            { label: "Poveži Threads nalog u Podešavanjima" },
            { label: "Prva sinhronizacija povlači prikaze i objave naloga" },
            { label: "Objavi prvu objavu iz aplikacije", xp: publishXp },
          ]}
          action={
            <Button
              variant="primary"
              render={<Link href="/settings" />}
              nativeButton={false}
            >
              Poveži Threads
            </Button>
          }
        >
          Posle povezivanja ovde stižu prikazi, pratioci i objave naloga.
        </EmptyState>
      </div>
    );
  }

  if (loading) {
    return <ThreadsDashboardSkeleton />;
  }

  const readiness = sync
    ? channelReadiness({
        connected: overview.connected,
        lastSyncAt:
          sync.lastSyncAt ??
          (overview.lastSync?.status === "ok"
            ? overview.lastSync.startedAt
            : null),
        syncFailed: sync.syncFailed || overview.lastSync?.status === "error",
        lastPostAt,
        now,
      })
    : undefined;

  const empty =
    !overview.followersCount && !overview.views && media.length === 0;

  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader
        variant="module"
        description={DESCRIPTION}
        actions={
          // Na jezičku Objavljivanje primarno dugme je slanje same objave.
          tab !== "publish" && (
            <Button variant="primary" onClick={() => setTab("publish")}>
              <Send aria-hidden />
              Objavi
            </Button>
          )
        }
      />

      <RateLimitBanner network="Threads" />

      <TabNav
        tabs={[
          { id: "overview", label: "Pregled i analitika", icon: LayoutDashboard },
          { id: "publish", label: "Objavljivanje", icon: Send },
          { id: "moderation", label: "Moderacija odgovora", icon: MessageCircle },
          { id: "automations", label: "Automatizacije (OpenReply)", icon: Zap },
          { id: "search", label: "Pretraga i otkrivanje", icon: Search },
        ]}
        active={tab}
        onChange={setTab}
        panelId="threads-channel-panel"
      />

      <TabPanel id="threads-channel-panel">
        {tab === "overview" &&
          (empty ? (
            <div className="flex flex-col gap-6">
              <EmptyState
                icon={ChartNoAxesColumn}
                variant="line"
                title="Još nema podataka za ovaj period."
              >
                Prikazi i objave stižu pri prvoj sinhronizaciji naloga.
              </EmptyState>
              <EmptyState
                icon={Radio}
                variant="mission"
                size="sm"
                title="Pokreni kanal"
                steps={[
                  { label: "Poveži Threads nalog u Podešavanjima", done: true },
                  {
                    label: "Prva sinhronizacija povlači prikaze i objave naloga",
                    done: readiness?.segments.some(
                      (s) => s.key === "sync" && s.done,
                    ),
                  },
                  { label: "Objavi prvu objavu iz aplikacije", xp: publishXp },
                ]}
              >
                Nalog je povezan. Brojevi stižu posle sinhronizacije i prve objave.
              </EmptyState>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              <ChannelFocus
                label="Pratioci"
                value={overview.followersCount ?? undefined}
                format={formatNumber}
                note={
                  overview.username
                    ? `@${overview.username.replace(/^@/, "")} · trenutno stanje naloga`
                    : "trenutno stanje naloga"
                }
                reason="Broj pratilaca još nije stigao sa naloga."
                readiness={readiness}
                next={
                  readiness?.next === "connected" ||
                  readiness?.next === "sync" ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      render={<Link href="/settings" />}
                      nativeButton={false}
                    >
                      Otvori podešavanja
                    </Button>
                  ) : null
                }
              />

              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
                <StatTile
                  label="Prikazi"
                  value={overview.views ?? undefined}
                  format={formatNumber}
                  note="Dnevna serija u periodu"
                  icon={Eye}
                />
                <StatTile
                  label="Klikovi na linkove"
                  value={overview.clicks ?? undefined}
                  format={formatNumber}
                  note="Zabeleženo u Threads-u"
                  icon={Link2}
                />
                <StatTile
                  label="Odgovori"
                  value={overview.replies ?? undefined}
                  format={formatNumber}
                  note="Kumulativno na nalogu"
                  icon={MessageCircle}
                />
                <StatTile
                  label="Citati"
                  value={overview.quotes ?? undefined}
                  format={formatNumber}
                  note="Kumulativno na nalogu"
                  icon={Quote}
                />
                <StatTile
                  label="Repostovi"
                  value={overview.reposts ?? undefined}
                  format={formatNumber}
                  note="Kumulativno na nalogu"
                  icon={Repeat2}
                />
              </div>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <TimelineChart
                  dates={overview.dailyViews.map((d) => d.date)}
                  syncId="threads-dashboard-views"
                  area={{
                    label: "Prikazi",
                    color: "var(--color-chart-1)",
                    values: overview.dailyViews.map((d) => d.views),
                    format: formatNumber,
                    baseline: "zero",
                  }}
                  emptyReason="Threads API beleži preglede po danu; nema zabeleženih prikaza u izabranom periodu."
                />

                <ThreadsFollowsChart snapshots={followerHistory} />
              </div>

              <ThreadsContentGrid media={media} />

              <ThreadsDemographicsTable
                state={demographics.state}
                reason={demographics.reason}
                ageGender={demographics.ageGender}
                countries={demographics.countries}
                cities={demographics.cities}
              />

              <ThreadsAttributionSection
                attributionSummary={attribution}
                unmatchedUrls={unmatchedUrls}
              />
            </div>
          ))}

        {tab === "publish" && (
          <div className="flex flex-col gap-8">
            <ThreadsComposer />
            <ThreadsJobsPanel />
          </div>
        )}

        {tab === "moderation" && <ThreadsRepliesModeration />}

        {tab === "automations" && <ThreadsAutomations />}

        {tab === "search" && <ThreadsSearch />}
      </TabPanel>
    </div>
  );
}

/** Zaglavlje je isto kao na učitanom ekranu, pa podaci ništa ne pomeraju. */
export function ThreadsDashboardSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader variant="module" description={DESCRIPTION} />
      <ChannelFocusSkeleton />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <StatTileSkeleton />
        <StatTileSkeleton />
        <StatTileSkeleton />
        <StatTileSkeleton />
        <StatTileSkeleton />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <TimelineChartSkeleton topLabelWidth="w-32" bottomPanel={false} />
        <Card className="h-72 animate-pulse p-5 shadow-card ring-line" />
      </div>
      <ThreadsContentGridSkeleton />
    </div>
  );
}
