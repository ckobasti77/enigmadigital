"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "convex/react";
import {
  AtSign,
  CheckCircle2,
  Clock,
  Eye,
  Heart,
  LayoutDashboard,
  Link2,
  MessageCircle,
  Quote,
  RefreshCw,
  Repeat2,
  Search,
  Send,
  TriangleAlert,
  Unplug,
  Users,
  Zap,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Reveal } from "@/components/motion/reveal";
import { useDateRange } from "@/components/app/date-range-picker";
import { EmptyState } from "@/components/app/empty-state";
import { RateLimitBanner } from "@/components/app/rate-limit-banner";
import {
  StatTile,
  StatTileSkeleton,
} from "@/components/app/analytics/kpi-tile";
import {
  TimelineChart,
  TimelineChartSkeleton,
} from "@/components/app/timeline-chart";
import { TabNav, TabPanel } from "@/components/app/tab-nav";
import { Card } from "@/components/ui/card";
import { formatNumber, formatRelativeTime } from "@/lib/format";
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

/**
 * Threads Dashboard.
 * Integrisan pregled analitike, kompozera objava sa redom poslova,
 * moderacije odgovora i pravila automatizacije (OpenReply).
 */
export function ThreadsDashboard() {
  const [tab, setTab] = useState<ThreadsTab>("overview");
  const { range } = useDateRange();

  const overview = useQuery(api.threadsStore.accountOverview, {
    from: range.from,
    to: range.to,
  });

  const followerHistory = useQuery(api.threadsStore.followerHistory, {
    from: range.from,
    to: range.to,
  });

  const media = useQuery(api.threadsStore.mediaList, {
    limit: 50,
  });

  const demographics = useQuery(api.threadsStore.demographicsSummary, {});

  const attribution = useQuery(
    api.threadsFunnels.getThreadsLinkAttributionSummary,
    {
      dateFrom: range.from,
      dateTo: range.to,
    },
  );

  const unmatchedUrls = useQuery(api.threadsFunnels.listUnmatchedUrls, {
    limit: 50,
  });

  const loading =
    overview === undefined ||
    followerHistory === undefined ||
    media === undefined ||
    demographics === undefined ||
    attribution === undefined ||
    unmatchedUrls === undefined;

  if (overview !== undefined && !overview.connected) {
    return (
      <div className="flex flex-1 flex-col gap-8">
        <RateLimitBanner network="Threads" />
        <EmptyState icon={Unplug}>
          Threads nalog još nije povezan.{" "}
          <Link
            href="/settings"
            className="text-accent-400 underline-offset-4 hover:underline"
          >
            Poveži ga u Podešavanjima
          </Link>
          .
        </EmptyState>
      </div>
    );
  }

  if (loading) {
    return <ThreadsDashboardSkeleton />;
  }

  const { lastSync } = overview;

  return (
    <div className="flex flex-1 flex-col gap-8">
      <RateLimitBanner network="Threads" />

      {/* ── Status naloga i poslednja sinhronizacija ────────────────────── */}
      <Reveal>
        <Card className="flex flex-wrap items-center justify-between gap-4 p-4 shadow-card ring-line">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-full bg-accent-400/10 text-accent-400">
              <AtSign className="size-5" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground">
                  {overview.username ?? "Threads nalog"}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-micro font-medium text-success">
                  <span className="size-1.5 rounded-full bg-success" />
                  Povezan
                </span>
              </div>
              <p className="text-xs text-text-muted">
                Kanal za organske objave, praćenje metrika i analizu linkova
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs">
            {lastSync ? (
              <div className="flex items-center gap-2 text-text-muted">
                {lastSync.status === "ok" ? (
                  <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
                ) : lastSync.status === "running" ? (
                  <RefreshCw className="size-4 animate-spin text-accent-400" aria-hidden="true" />
                ) : (
                  <TriangleAlert className="size-4 text-danger" aria-hidden="true" />
                )}
                <span>
                  {lastSync.status === "running"
                    ? "Sinhronizacija u toku..."
                    : lastSync.status === "error"
                      ? `Greška pri sinhronizaciji (${formatRelativeTime(lastSync.startedAt)})`
                      : `Sinhronizovano ${formatRelativeTime(lastSync.startedAt)}`}
                </span>
                {lastSync.itemsWritten > 0 && lastSync.status === "ok" && (
                  <span className="font-mono text-micro text-text-secondary">
                    ({formatNumber(lastSync.itemsWritten)} stavki)
                  </span>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-text-muted">
                <Clock className="size-4" aria-hidden="true" />
                <span>Nema zabeležene prethodne sinhronizacije</span>
              </div>
            )}
          </div>
        </Card>
      </Reveal>

      {/* ── Navigacija kroz sekcije kanala (TabNav) ───────────────────────── */}
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
        {tab === "overview" && (
          <div className="flex flex-col gap-8">
            {/* ── Metrike po nalogu (§5.4) — 6 zasebnih kartica ─────────────────── */}
            <Reveal delay={0.05}>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
                {/* 1. Prikazi (views) */}
                <StatTile
                  label="Prikazi (views)"
                  value={overview.views ?? undefined}
                  format={formatNumber}
                  note="Dnevna serija u periodu"
                  icon={Eye}
                />

                {/* 2. Pratioci (followers_count) */}
                <StatTile
                  label="Pratioci"
                  value={overview.followersCount ?? undefined}
                  format={formatNumber}
                  note="Trenutno stanje na nalogu"
                  icon={Users}
                />

                {/* 3. Klikovi na linkove (clicks) */}
                <StatTile
                  label="Klikovi na linkove"
                  value={overview.clicks ?? undefined}
                  format={formatNumber}
                  note="Zabeleženo u Threads-u"
                  icon={Link2}
                />

                {/* 4. Odgovori (replies) */}
                <StatTile
                  label="Ukupno odgovora"
                  value={overview.replies ?? undefined}
                  format={formatNumber}
                  note="Kumulativno na nalogu"
                  icon={MessageCircle}
                />

                {/* 5. Citati (quotes) */}
                <StatTile
                  label="Ukupno citata"
                  value={overview.quotes ?? undefined}
                  format={formatNumber}
                  note="Kumulativno na nalogu"
                  icon={Quote}
                />

                {/* 6. Repostovi (reposts) */}
                <StatTile
                  label="Ukupno repostova"
                  value={overview.reposts ?? undefined}
                  format={formatNumber}
                  note="Kumulativno na nalogu"
                  icon={Repeat2}
                />
              </div>
            </Reveal>

            {/* ── Vremenska serija prikaza i Istorija pratilaca ─────────────────── */}
            <Reveal delay={0.1}>
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* Prikazi kroz vreme */}
                <TimelineChart
                  dates={overview.dailyViews.map((d) => d.date)}
                  syncId="threads-dashboard-views"
                  area={{
                    label: "Prikazi (views)",
                    color: "var(--color-accent-400)",
                    values: overview.dailyViews.map((d) => d.views),
                    format: formatNumber,
                    baseline: "zero",
                  }}
                  emptyReason="Threads API beleži preglede po danu; nema zabeleženih prikaza u izabranom periodu."
                />

                {/* Istorija pratilaca iz snimaka */}
                <ThreadsFollowsChart snapshots={followerHistory} />
              </div>
            </Reveal>

            {/* ── Mreža objava (§5.3) ─────────────────────────────────────────── */}
            <Reveal delay={0.15}>
              <ThreadsContentGrid media={media} />
            </Reveal>

            {/* ── Demografija pratilaca (§5.4) ─────────────────────────────────── */}
            <Reveal delay={0.2}>
              <ThreadsDemographicsTable
                state={demographics.state}
                reason={demographics.reason}
                ageGender={demographics.ageGender}
                countries={demographics.countries}
                cities={demographics.cities}
              />
            </Reveal>

            {/* ── Atribucija linkova i levak poseta (§10.2) ────────────────────── */}
            <Reveal delay={0.25}>
              <ThreadsAttributionSection
                attributionSummary={attribution}
                unmatchedUrls={unmatchedUrls}
              />
            </Reveal>
          </div>
        )}

        {tab === "publish" && (
          <div className="flex flex-col gap-8">
            <Reveal>
              <ThreadsComposer />
            </Reveal>
            <Reveal delay={0.05}>
              <ThreadsJobsPanel />
            </Reveal>
          </div>
        )}

        {tab === "moderation" && (
          <div className="flex flex-col gap-8">
            <Reveal>
              <ThreadsRepliesModeration />
            </Reveal>
          </div>
        )}

        {tab === "automations" && (
          <div className="flex flex-col gap-8">
            <Reveal>
              <ThreadsAutomations />
            </Reveal>
          </div>
        )}

        {tab === "search" && (
          <div className="flex flex-col gap-8">
            <Reveal>
              <ThreadsSearch />
            </Reveal>
          </div>
        )}
      </TabPanel>
    </div>
  );
}

export function ThreadsDashboardSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-8">
      <Card className="h-16 p-4 shadow-card ring-line animate-pulse" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <StatTileSkeleton />
        <StatTileSkeleton />
        <StatTileSkeleton />
        <StatTileSkeleton />
        <StatTileSkeleton />
        <StatTileSkeleton />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <TimelineChartSkeleton topLabelWidth="w-32" bottomPanel={false} />
        <Card className="h-72 p-5 shadow-card ring-line animate-pulse" />
      </div>
      <ThreadsContentGridSkeleton />
    </div>
  );
}
