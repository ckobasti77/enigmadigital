"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DateRangePicker, useDateRange } from "@/components/app/date-range-picker";
import { EmptyState } from "@/components/app/empty-state";
import { Reveal } from "@/components/motion/reveal";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CampaignsTable } from "./campaigns-table";
import { CampaignDetail } from "./campaign-detail";
import { HookBattleView } from "./hook-battle-view";
import { formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  Unplug,
  TrendingUp,
  Target,
  DollarSign,
  BarChart3,
  Swords,
  Pin,
} from "lucide-react";

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
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <DateRangePicker />

        {/* Pinned Battles Quick Pill Indicator */}
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
          {/* Hero KPI Summary */}
          <Reveal>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Card className="gap-0 py-0 shadow-card ring-line" size="sm">
                <div className="flex h-32 flex-col justify-between px-5 py-4">
                  <div className="flex items-center justify-between">
                    <p className="heading-caps text-xs font-medium text-text-muted">
                      Ukupna potrošnja
                    </p>
                    <DollarSign className="size-4 text-accent-400" />
                  </div>
                  <div>
                    <span className="font-mono text-2xl sm:text-3xl font-bold tracking-tight text-accent-400">
                      {formatNumber(report.totals.totalSpend)} €
                    </span>
                    <p className="mt-1 text-xs text-text-muted">
                      za {report.totals.campaignsCount} {report.totals.campaignsCount === 1 ? "kampanju" : "kampanja"}
                    </p>
                  </div>
                </div>
              </Card>

              <Card className="gap-0 py-0 shadow-card ring-line" size="sm">
                <div className="flex h-32 flex-col justify-between px-5 py-4">
                  <div className="flex items-center justify-between">
                    <p className="heading-caps text-xs font-medium text-text-muted">
                      Ukupno rezultata
                    </p>
                    <Target className="size-4 text-foreground/60" />
                  </div>
                  <div>
                    <span className="font-mono text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                      {formatNumber(report.totals.totalResults)}
                    </span>
                    <p className="mt-1 text-xs text-text-muted">
                      konverzija / ciljeva
                    </p>
                  </div>
                </div>
              </Card>

              <Card className="gap-0 py-0 shadow-card ring-line" size="sm">
                <div className="flex h-32 flex-col justify-between px-5 py-4">
                  <div className="flex items-center justify-between">
                    <p className="heading-caps text-xs font-medium text-text-muted">
                      Prosečan CPA
                    </p>
                    <TrendingUp className="size-4 text-foreground/60" />
                  </div>
                  <div>
                    <span className="font-mono text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                      {report.totals.overallCpa > 0 ? `${formatNumber(report.totals.overallCpa)} €` : "—"}
                    </span>
                    <p className="mt-1 text-xs text-text-muted">
                      cena po konverziji
                    </p>
                  </div>
                </div>
              </Card>

              <Card className="gap-0 py-0 shadow-card ring-line" size="sm">
                <div className="flex h-32 flex-col justify-between px-5 py-4">
                  <div className="flex items-center justify-between">
                    <p className="heading-caps text-xs font-medium text-text-muted">
                      {report.totals.hasConversionValue ? "Prosečan ROAS" : "Prosečan CTR"}
                    </p>
                    <BarChart3 className="size-4 text-foreground/60" />
                  </div>
                  <div>
                    <span
                      className={cn(
                        "font-mono text-2xl sm:text-3xl font-bold tracking-tight",
                        report.totals.hasConversionValue ? "text-success" : "text-foreground",
                      )}
                    >
                      {report.totals.hasConversionValue
                        ? `${report.totals.overallRoas.toFixed(2)}x`
                        : formatPercent(report.totals.overallCtr)}
                    </span>
                    <p className="mt-1 text-xs text-text-muted">
                      {report.totals.hasConversionValue
                        ? "povrat na uloženi budžet"
                        : "procenat klikova na oglas"}
                    </p>
                  </div>
                </div>
              </Card>
            </div>
          </Reveal>

          {/* Campaigns Table */}
          <Reveal delay={0.08}>
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
    <div className="flex flex-1 flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Skeleton className="h-32 rounded-lg" />
        <Skeleton className="h-32 rounded-lg" />
        <Skeleton className="h-32 rounded-lg" />
        <Skeleton className="h-32 rounded-lg" />
      </div>
      <Skeleton className="h-96 w-full rounded-lg" />
    </div>
  );
}
