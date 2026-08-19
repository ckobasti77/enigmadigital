"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useDateRange } from "@/components/app/date-range-picker";
import { EmptyState } from "@/components/app/empty-state";
import { Reveal } from "@/components/motion/reveal";
import { Skeleton } from "@/components/ui/skeleton";
import {
  StatTile,
  StatTileSkeleton,
} from "@/components/app/analytics/kpi-tile";
import { ChartErrorBoundary } from "@/components/app/chart-states";
import { SpendChart, SpendChartSkeleton } from "./spend-chart";
import { CampaignsTable } from "./campaigns-table";
import { CampaignDetail } from "./campaign-detail";
import { HookBattleView } from "./hook-battle-view";
import { formatNumber, formatPercent } from "@/lib/format";
import {
  Unplug,
  TrendingUp,
  Target,
  DollarSign,
  BarChart3,
  Swords,
  Pin,
} from "lucide-react";

const formatEur = (v: number) => `${formatNumber(v)} €`;
const formatCpa = (v: number) => (v > 0 ? formatEur(v) : "—");
const formatRoas = (v: number) => `${v.toFixed(2)}x`;

export function AdsDashboard() {
  const { range } = useDateRange();
  const connections = useQuery(api.connections.list);
  const [selectedCampaignId, setSelectedCampaignId] = useState<Id<"adCampaigns"> | null>(null);
  const [selectedBattleAdSetId, setSelectedBattleAdSetId] = useState<Id<"adSets"> | null>(null);

  const report = useQuery(api.metaAdsStore.getCampaignsReport, {
    from: range.from,
    to: range.to,
  });

  const pinnedBattles = useQuery(api.metaAdsStore.listPinnedBattles);

  const adsConnected =
    connections === undefined ||
    connections.some((c) => c.provider === "meta_ads" || c.provider === "google_ads");

  const loading = connections === undefined || report === undefined;

  return (
    <div className="flex flex-1 flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4 empty:hidden">
        {/* Prečice do prikačenih duela kreativa — jedini ulaz u njih sa ovog
            ekrana kada nijedna kampanja nije otvorena. */}
        {pinnedBattles && pinnedBattles.length > 0 && !selectedBattleAdSetId && (
          <div className="flex items-center gap-1.5 overflow-x-auto py-1">
            <span className="inline-flex items-center gap-1 text-xs text-text-muted font-medium mr-1">
              <Pin className="size-3 text-accent-400 fill-accent-400" />
              <span>Pinovano:</span>
            </span>
            {pinnedBattles.map((b) => (
              <button
                key={b._id}
                type="button"
                onClick={() => setSelectedBattleAdSetId(b.adSetId)}
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-foreground hover:border-accent-400/50 hover:bg-surface-raised transition-colors shrink-0"
              >
                <Swords className="size-3 text-accent-400" />
                <span>{b.adSetName}</span>
                <span className="text-[0.625rem] text-text-muted font-mono">
                  ({b.adsCount} v)
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {!adsConnected ? (
        <EmptyState icon={Unplug}>
          Meta Ads ili Google Ads još nisu povezani. Povežite naloge u{" "}
          <Link
            href="/settings"
            className="text-accent-400 underline-offset-4 hover:underline font-medium"
          >
            podešavanjima
          </Link>
          .
        </EmptyState>
      ) : loading ? (
        <AdsDashboardSkeleton />
      ) : selectedBattleAdSetId ? (
        <Reveal>
          <HookBattleView
            adSetId={selectedBattleAdSetId}
            from={range.from}
            to={range.to}
            onBack={() => setSelectedBattleAdSetId(null)}
          />
        </Reveal>
      ) : selectedCampaignId ? (
        <Reveal>
          <CampaignDetail
            campaignId={selectedCampaignId}
            from={range.from}
            to={range.to}
            onBack={() => setSelectedCampaignId(null)}
            onOpenBattle={(adSetId) => setSelectedBattleAdSetId(adSetId)}
          />
        </Reveal>
      ) : (
        <>
          {/* Četiri mere koje odlučuju: koliko je otišlo, šta je stiglo,
              po kojoj ceni i sa kakvim povratom. */}
          <Reveal>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatTile
                label="Ukupna potrošnja"
                icon={DollarSign}
                value={report.totals.totalSpend}
                format={formatEur}
                valueClassName="text-accent-400"
                note={`za ${report.totals.campaignsCount} ${
                  report.totals.campaignsCount === 1 ? "kampanju" : "kampanja"
                }`}
              />
              <StatTile
                label="Ukupno rezultata"
                icon={Target}
                value={report.totals.totalResults}
                format={formatNumber}
                note="konverzija / ciljeva"
              />
              <StatTile
                label="Prosečan CPA"
                icon={TrendingUp}
                value={report.totals.overallCpa}
                format={formatCpa}
                note="cena po konverziji"
              />
              <StatTile
                label={
                  report.totals.hasConversionValue
                    ? "Prosečan ROAS"
                    : "Prosečan CTR"
                }
                icon={BarChart3}
                value={
                  report.totals.hasConversionValue
                    ? report.totals.overallRoas
                    : report.totals.overallCtr
                }
                format={
                  report.totals.hasConversionValue ? formatRoas : formatPercent
                }
                valueClassName={
                  report.totals.hasConversionValue ? "text-success" : undefined
                }
                note={
                  report.totals.hasConversionValue
                    ? "povrat na uloženi budžet"
                    : "procenat klikova na oglas"
                }
              />
            </div>
          </Reveal>

          {/* Kuda je budžet otišao kroz period — pre nego što se gleda po
              kojoj kampanji. */}
          <Reveal delay={0.05}>
            <ChartErrorBoundary>
              <SpendChart campaigns={report.campaigns} />
            </ChartErrorBoundary>
          </Reveal>

          {/* Campaigns Table */}
          <Reveal delay={0.1}>
            <CampaignsTable
              campaigns={report.campaigns}
              onSelectCampaign={(id) => setSelectedCampaignId(id)}
            />
          </Reveal>
        </>
      )}
    </div>
  );
}

export function AdsDashboardSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-8">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTileSkeleton />
        <StatTileSkeleton />
        <StatTileSkeleton />
        <StatTileSkeleton />
      </div>
      <SpendChartSkeleton />
      <Skeleton className="h-96 w-full rounded-lg" />
    </div>
  );
}
