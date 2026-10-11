"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useDateRange } from "@/components/app/date-range-picker";
import { Chip } from "@/components/app/system/chip";
import {
  ChannelFocus,
  ChannelFocusSkeleton,
  useChannelSync,
} from "@/components/app/system/channel-focus";
import { EmptyState } from "@/components/app/system/empty-state";
import { KpiTile, KpiTileSkeleton } from "@/components/app/system/kpi-tile";
import { PageHeader } from "@/components/app/system/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartErrorBoundary } from "@/components/app/chart-states";
import { SpendChart, SpendChartSkeleton } from "./spend-chart";
import { CampaignsTable } from "./campaigns-table";
import { CampaignDetail } from "./campaign-detail";
import { HookBattleView } from "./hook-battle-view";
import {
  formatNumber,
  formatPercent,
  formatSignedPercent,
  formatSignedPp,
  pluralSr,
} from "@/lib/format";
import { deltaPct, deltaPp } from "@/lib/metrics";
import {
  Unplug,
  TrendingUp,
  Target,
  BarChart3,
  ChartNoAxesColumn,
  Megaphone,
  Plus,
  Swords,
  Pin,
} from "lucide-react";

import { formatMetric } from "@/convex/lib/metaAdsFormat";
import { resolveMetric } from "@/convex/lib/metaAdsCatalog";

const spendDef = resolveMetric("spend")!;
const cpaDef = resolveMetric("costPerResult")!;
const formatRoas = (v: number) => `${v.toFixed(2)}x`;

const DESCRIPTION =
  "Potrošnja, rezultati i cena po rezultatu kroz kampanje, ad setove i oglase.";

const INFO =
  "Klik na kampanju otvara hijerarhiju ad setova i oglasa, analizu video kreativa (Hook i Hold rate) i demografsku raspodelu. Poređenje je sa prethodnim periodom iste dužine.";

function AdsHeader({ canCreate }: { canCreate: boolean }) {
  return (
    <PageHeader
      variant="module"
      description={DESCRIPTION}
      info={INFO}
      actions={
        canCreate && (
          <Button
            variant="primary"
            render={<Link href="/ads/nova-kampanja" />}
            nativeButton={false}
          >
            <Plus aria-hidden />
            Nova kampanja
          </Button>
        )
      }
    />
  );
}

/**
 * Oglasi. Fokus je Potrošnja, sa valutom; primarno dugme je „Nova kampanja" u
 * zaglavlju. Za potrošnju i CPA je pad dobra vest, pa im je pilula promene
 * obrnuto obojena (`higherIsBetter={false}`).
 */
export function AdsDashboard() {
  const { range } = useDateRange();
  const connections = useQuery(api.connections.list);
  const [selectedCampaignId, setSelectedCampaignId] = useState<Id<"adCampaigns"> | null>(null);
  const [selectedBattleAdSetId, setSelectedBattleAdSetId] = useState<Id<"adSets"> | null>(null);

  const report = useQuery(api.metaAdsStore.getCampaignsReport, {
    from: range.from,
    to: range.to,
  });
  // Isti upit za prethodni period iste dužine — jedini izvor poređenja.
  const previousReport = useQuery(api.metaAdsStore.getCampaignsReport, {
    from: range.prevFrom,
    to: range.prevTo,
  });

  const pinnedBattles = useQuery(api.metaAdsStore.listPinnedBattles);

  const metaSync = useChannelSync("meta_ads");
  const googleSync = useChannelSync("google_ads");

  const adsConnected =
    connections === undefined ||
    connections.some((c) => c.provider === "meta_ads" || c.provider === "google_ads");

  const loading = connections === undefined || report === undefined;

  // F11: iznos bez valute nije iznos. Upit vraća valutu samo kad svi nalozi
  // dele jednu; kad je nema, čita se sa kampanja. Više valuta se ne sabira u
  // jedan broj — tada pločica nosi crticu i razlog, ne zbir u „nečemu".
  const campaignCurrencies = [
    ...new Set(
      (report?.campaigns ?? [])
        .map((c) => c.currency?.trim())
        .filter((c): c is string => Boolean(c)),
    ),
  ];
  const currency =
    report?.totals.currency ??
    (campaignCurrencies.length === 1 ? campaignCurrencies[0] : undefined);
  const mixedCurrencies = currency === undefined && campaignCurrencies.length > 1;
  const currencyNote = mixedCurrencies
    ? `više valuta (${campaignCurrencies.join(", ")}) — vidi po kampanji`
    : currency === undefined
      ? "valuta naloga nije poznata"
      : undefined;

  // Poređenje iznosa ima smisla samo u istoj valuti; relativna promena je tada
  // bez jedinice. Kad prethodni period nije stigao ili je nula, poređenja nema.
  const prevTotals = previousReport?.totals;
  const sameCurrency =
    !mixedCurrencies &&
    prevTotals !== undefined &&
    (prevTotals.currency === undefined || prevTotals.currency === currency);
  const compareLabel = `vs prethodnih ${range.days} d`;

  const synced =
    (metaSync?.lastSyncAt ?? null) !== null ||
    (googleSync?.lastSyncAt ?? null) !== null;

  return (
    <div className="flex flex-1 flex-col gap-6">
      <AdsHeader canCreate={adsConnected} />

      <div className="flex flex-wrap items-center justify-between gap-4 empty:hidden">
        {/* Prečice do prikačenih duela kreativa — jedini ulaz u njih sa ovog
            ekrana kada nijedna kampanja nije otvorena. */}
        {pinnedBattles && pinnedBattles.length > 0 && !selectedBattleAdSetId && (
          <div className="flex items-center gap-1.5 overflow-x-auto py-1">
            <span className="mr-1 inline-flex items-center gap-1 text-meta font-medium text-text-muted">
              <Pin className="size-3 fill-mod text-mod" aria-hidden />
              <span>Pinovano:</span>
            </span>
            {pinnedBattles.map((b) => (
              <Chip
                key={b._id}
                icon={Swords}
                onClick={() => setSelectedBattleAdSetId(b.adSetId)}
                className="shrink-0"
              >
                {b.adSetName}{" "}
                <span className="font-mono text-text-muted">
                  ({b.adsCount} v)
                </span>
              </Chip>
            ))}
          </div>
        )}
      </div>

      {!adsConnected ? (
        <EmptyState
          icon={Unplug}
          variant="mission"
          title="Poveži nalog za oglase"
          steps={[
            { label: "Poveži Meta Ads ili Google Ads nalog u Podešavanjima" },
            { label: "Prva sinhronizacija povlači kampanje i potrošnju" },
            { label: "Napravi prvu kampanju — kreira se pauzirana" },
          ]}
          action={
            <Button
              variant="primary"
              render={<Link href="/settings" />}
              nativeButton={false}
            >
              Poveži nalog
            </Button>
          }
        >
          Posle povezivanja ovde stižu potrošnja, rezultati i kampanje.
        </EmptyState>
      ) : loading ? (
        <AdsDashboardBodySkeleton />
      ) : selectedBattleAdSetId ? (
        <HookBattleView
          adSetId={selectedBattleAdSetId}
          from={range.from}
          to={range.to}
          onBack={() => setSelectedBattleAdSetId(null)}
        />
      ) : selectedCampaignId ? (
        <CampaignDetail
          campaignId={selectedCampaignId}
          from={range.from}
          to={range.to}
          onBack={() => setSelectedCampaignId(null)}
          onOpenBattle={(adSetId) => setSelectedBattleAdSetId(adSetId)}
        />
      ) : report.campaigns.length === 0 && report.totals.totalSpend === 0 ? (
        <>
          <EmptyState
            icon={ChartNoAxesColumn}
            variant="line"
            title="Još nema podataka za ovaj period."
          >
            Nijedna kampanja nije trošila budžet u izabranom periodu.
          </EmptyState>
          <EmptyState
            icon={Megaphone}
            variant="mission"
            size="sm"
            title="Pokreni oglase"
            steps={[
              {
                label: "Poveži Meta Ads ili Google Ads nalog u Podešavanjima",
                done: true,
              },
              {
                label: "Prva sinhronizacija povlači kampanje i potrošnju",
                done: synced,
              },
              { label: "Napravi prvu kampanju — kreira se pauzirana" },
            ]}
          >
            Nalog je povezan. Brojevi stižu kad prva kampanja počne da troši.
          </EmptyState>
        </>
      ) : (
        <>
          {/* Četiri mere koje odlučuju: koliko je otišlo, šta je stiglo, po
              kojoj ceni i sa kakvim povratom. Potrošnja je fokus ekrana. */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-[2fr_1fr_1fr_1fr] [&>*:last-child]:col-span-2 lg:[&>*:last-child]:col-span-1">
            <div className="col-span-2 lg:col-span-1">
              <ChannelFocus
                className="h-full"
                label="Potrošnja"
                value={mixedCurrencies ? undefined : report.totals.totalSpend}
                format={(v: number) => formatMetric(v, spendDef, currency)}
                delta={
                  sameCurrency
                    ? deltaPct(report.totals.totalSpend, prevTotals?.totalSpend)
                    : null
                }
                formatDelta={formatSignedPercent}
                compareLabel={compareLabel}
                higherIsBetter={false}
                reason={currencyNote}
                footnote={
                  <>
                    kroz {formatNumber(report.totals.campaignsCount)}{" "}
                    {pluralSr(
                      report.totals.campaignsCount,
                      "kampanju",
                      "kampanje",
                      "kampanja",
                    )}
                    {currencyNote && !mixedCurrencies ? ` · ${currencyNote}` : ""}
                  </>
                }
              />
            </div>
            <KpiTile
              label="Rezultati"
              icon={Target}
              value={report.totals.totalResults}
              format={formatNumber}
              delta={{
                kind: "pct",
                value: deltaPct(
                  report.totals.totalResults,
                  prevTotals?.totalResults,
                ),
              }}
              formatDelta={formatSignedPercent}
              compareLabel={compareLabel}
              note="konverzija / ciljeva"
              state={
                report.totals.totalResults === undefined ? "unavailable" : "value"
              }
              reason="Nijedna kampanja nema zabeležen rezultat u periodu."
            />
            <KpiTile
              label="Prosečan CPA"
              shortLabel="CPA"
              icon={TrendingUp}
              value={mixedCurrencies ? undefined : report.totals.overallCpa}
              format={(v: number) => formatMetric(v, cpaDef, currency)}
              delta={{
                kind: "pct",
                value: sameCurrency
                  ? deltaPct(report.totals.overallCpa, prevTotals?.overallCpa)
                  : null,
              }}
              formatDelta={formatSignedPercent}
              compareLabel={compareLabel}
              higherIsBetter={false}
              note={currencyNote ?? "cena po konverziji"}
              state={
                mixedCurrencies || report.totals.overallCpa === undefined
                  ? "unavailable"
                  : "value"
              }
              reason={
                mixedCurrencies
                  ? currencyNote
                  : "Bez rezultata u periodu nema cene po rezultatu."
              }
            />
            {report.totals.hasConversionValue ? (
              <KpiTile
                label="Prosečan ROAS"
                shortLabel="ROAS"
                icon={BarChart3}
                value={report.totals.overallRoas}
                format={formatRoas}
                delta={{
                  kind: "pct",
                  value: deltaPct(
                    report.totals.overallRoas,
                    prevTotals?.overallRoas,
                  ),
                }}
                formatDelta={formatSignedPercent}
                compareLabel={compareLabel}
                note="povrat na uloženi budžet"
              />
            ) : (
              <KpiTile
                label="Prosečan CTR"
                shortLabel="CTR"
                icon={BarChart3}
                value={report.totals.overallCtr}
                format={formatPercent}
                delta={{
                  kind: "pp",
                  value:
                    prevTotals && prevTotals.totalImpressions > 0
                      ? deltaPp(report.totals.overallCtr, prevTotals.overallCtr)
                      : null,
                }}
                formatDelta={formatSignedPp}
                compareLabel={compareLabel}
                note="procenat klikova na oglas"
              />
            )}
          </div>

          {/* Kuda je budžet otišao kroz period — pre nego što se gleda po
              kojoj kampanji. */}
          <ChartErrorBoundary>
            <SpendChart
              campaigns={report.campaigns}
              currency={currency}
            />
          </ChartErrorBoundary>

          <CampaignsTable
            campaigns={report.campaigns}
            onSelectCampaign={(id) => setSelectedCampaignId(id)}
          />
        </>
      )}
    </div>
  );
}

function AdsDashboardBodySkeleton() {
  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-[2fr_1fr_1fr_1fr] [&>*:last-child]:col-span-2 lg:[&>*:last-child]:col-span-1">
        <div className="col-span-2 lg:col-span-1">
          <ChannelFocusSkeleton />
        </div>
        <KpiTileSkeleton />
        <KpiTileSkeleton />
        <KpiTileSkeleton />
      </div>
      <SpendChartSkeleton />
      {/* Silueta tabele kampanja — skelet ima oblik sadržaja koji stiže, ne
          jedan sivi pravougaonik. */}
      <div className="overflow-hidden rounded-lg border border-line">
        <div className="border-b border-line px-4 py-3">
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="divide-y divide-line-soft">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3.5">
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="hidden h-4 w-16 sm:block" />
              <Skeleton className="hidden h-4 w-16 sm:block" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/** Zaglavlje je isto kao na učitanom ekranu, pa podaci ništa ne pomeraju. */
export function AdsDashboardSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <AdsHeader canCreate={false} />
      <AdsDashboardBodySkeleton />
    </div>
  );
}
