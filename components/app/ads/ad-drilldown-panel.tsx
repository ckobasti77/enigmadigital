"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AgeGenderHeatTable } from "./age-gender-heat-table";
import { PlacementBreakdown } from "./placement-breakdown";
import { HourlyChart } from "./hourly-chart";
import { AdPreviewDialog } from "./ad-preview-dialog";
import { TabNav, TabPanel } from "@/components/app/tab-nav";
import { formatDecimal, formatNumber, formatPercent } from "@/lib/format";
import { deriveRate } from "@/convex/lib/metaAdsCatalog";
import { cn } from "@/lib/utils";
import {
  X,
  Play,
  Award,
  BarChart3,
  Layers,
  Clock,
  ExternalLink,
} from "lucide-react";
import Image from "next/image";
import { formatMetric, formatRanking } from "@/convex/lib/metaAdsFormat";
import { resolveMetric } from "@/convex/lib/metaAdsCatalog";

const spendDef = resolveMetric("spend")!;
const cpaDef = resolveMetric("costPerResult")!;
const cpcDef = resolveMetric("cpc")!;
const cpmDef = resolveMetric("cpm")!;

function formatRankingBadge(type: "Kvalitet" | "Angažovanje" | "Konverzija", rawRanking?: string) {
  const { label, known } = formatRanking(rawRanking);

  if (!known) {
    return (
      <span
        title="Meta još nema dovoljno podataka za rangiranje"
        className="inline-flex items-center gap-1 rounded border border-line bg-surface-raised px-2 py-0.5 text-micro font-medium text-text-muted cursor-help"
      >
        <Award className="size-3 shrink-0" />
        <span>{type}: {label}</span>
      </span>
    );
  }

  let toneClass = "bg-surface-raised text-text-primary border-line";
  if (rawRanking === "ABOVE_AVERAGE") {
    toneClass = "bg-success/15 text-success border-success/30";
  } else if (rawRanking === "AVERAGE") {
    toneClass = "bg-surface-raised text-text-primary border-line";
  } else if (rawRanking === "BELOW_AVERAGE_35") {
    toneClass = "bg-warning/15 text-warning border-warning/30";
  } else if (rawRanking === "BELOW_AVERAGE_20" || rawRanking === "BELOW_AVERAGE_10") {
    toneClass = "bg-danger/15 text-danger border-danger/30";
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-2 py-0.5 text-micro font-medium",
        toneClass,
      )}
    >
      <Award className="size-3 shrink-0" />
      <span>{type}: {label}</span>
    </span>
  );
}

/**
 * Bočni panel se ponaša kao panel, ne kao dijalog: nema zatamnjenje iza sebe,
 * jer ne prekida rad — sadržaj iza njega ostaje čitljiv i ostaje kontekst.
 *
 * Ali sve što se otvori mora da se zatvori Escape-om, i fokus mora da ima gde
 * da uđe i gde da se vrati. Bez ovoga se panel otvori, a tastatura ostane
 * zaglavljena u tabeli iza njega.
 */
function usePanelDismiss(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      // Fokus se vraća tamo odakle je panel otvoren — inače se posle
      // zatvaranja nastavlja od vrha stranice.
      opener?.focus?.();
    };
  }, [onClose]);

  return ref;
}

export function AdDrilldownPanel({
  adId,
  from,
  to,
  onClose,
}: {
  adId: Id<"ads">;
  from: string;
  to: string;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"demographics" | "placements" | "hourly">("demographics");
  const [openPreviewDialog, setOpenPreviewDialog] = useState(false);
  const panelRef = usePanelDismiss(onClose);

  const data = useQuery(api.metaAdsStore.getAdDrilldown, {
    adId,
    from,
    to,
  });

  if (data === undefined) {
    return (
      <div
        ref={panelRef}
        tabIndex={-1}
        role="region"
        aria-label="Detalji oglasa"
        className="material-thick material-edge-l fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col p-6 outline-none"
      >
        <div className="flex items-center justify-between pb-4">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="size-8 rounded-full" />
        </div>
        <div className="mt-4 space-y-4">
          <Skeleton className="h-28 w-full rounded-lg" />
          <Skeleton className="h-40 w-full rounded-lg" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  if (data === null) {
    return (
      <div
        ref={panelRef}
        tabIndex={-1}
        role="region"
        aria-label="Detalji oglasa"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col items-center justify-center border-l border-line bg-background p-6 outline-none"
      >
        <p className="text-sm text-text-muted">Oglas nije pronađen.</p>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 rounded-lg bg-surface-raised px-4 py-2 text-xs font-medium text-foreground hover:bg-surface"
        >
          Zatvori
        </button>
      </div>
    );
  }

  const { ad, adSet, campaign, coreMetrics, videoFunnel, rankings, hourlySeries, hasHourlyData, ageGenderMatrix, placementList, currency } = data;

  const hasVideo = Boolean(
    (videoFunnel.video3s !== undefined && videoFunnel.video3s > 0) ||
    (videoFunnel.thruplay !== undefined && videoFunnel.thruplay > 0) ||
    (videoFunnel.videoP25 !== undefined && videoFunnel.videoP25 > 0),
  );

  const isGoogleAds = (data as { provider?: string }).provider === "google_ads" || (data as { provider?: string }).provider === "google";
  const searchImpressionShare = (data as { searchImpressionShare?: number }).searchImpressionShare;

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      role="region"
      aria-label={`Detalji oglasa ${ad.name}`}
      className="material-thick material-edge-l fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col overflow-y-auto outline-none"
    >
      {/* Header */}
      <div className="edge-fade-b sticky top-0 z-10 flex items-center justify-between bg-bg-900 px-6 py-4">
        <div className="flex items-center gap-3 min-w-0 pr-4">
          {ad.thumbnailUrl ? (
            <div className="relative size-12 shrink-0 overflow-hidden rounded-lg border border-line bg-surface">
              <Image
                src={ad.thumbnailUrl}
                alt={ad.name}
                fill
                sizes="48px"
                className="object-cover"
                unoptimized
              />
            </div>
          ) : (
            <div className="flex size-12 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-text-muted">
              <Play className="size-5" />
            </div>
          )}

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  ad.status === "ACTIVE" ? "bg-success" : "bg-text-muted",
                )}
              />
              <h2 className="truncate text-base font-bold text-foreground" title={ad.name}>
                {ad.name}
              </h2>
            </div>
            <p className="mt-0.5 truncate text-xs text-text-muted">
              {campaign?.name} <span className="text-line-strong">/</span> {adSet?.name}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="flex size-8 shrink-0 items-center justify-center rounded-full border border-line bg-surface-raised text-text-muted hover:bg-surface hover:text-foreground transition-colors"
          aria-label="Zatvori panel"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-6 p-6">
        {/* Provider badge, Hook Label & Rankings Badges */}
        <div className="flex flex-wrap items-center gap-2">
          {isGoogleAds ? (
            <span className="inline-flex items-center rounded-full border border-chart-2/40 bg-chart-2/10 px-2.5 py-0.5 text-xs font-semibold text-foreground">
              Google Ads
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full border border-chart-1/40 bg-chart-1/10 px-2.5 py-0.5 text-xs font-semibold text-foreground">
              Meta Ads
            </span>
          )}

          {searchImpressionShare !== undefined && (
            <span className="inline-flex items-center rounded-full border border-accent-400/30 bg-accent-400/10 px-2.5 py-0.5 text-xs font-semibold text-accent-400">
              Impression Share: {formatPercent(searchImpressionShare)}
            </span>
          )}

          {ad.hookLabel && (
            <span className="inline-flex items-center rounded-full border border-accent-400/30 bg-accent-400/10 px-2.5 py-0.5 text-xs font-semibold text-accent-400">
              {ad.hookLabel}
            </span>
          )}
          {formatRankingBadge("Kvalitet", rankings.qualityRanking)}
          {formatRankingBadge("Angažovanje", rankings.engagementRanking)}
          {formatRankingBadge("Konverzija", rankings.conversionRanking)}
          {!isGoogleAds ? (
            <button
              type="button"
              onClick={() => setOpenPreviewDialog(true)}
              className="inline-flex items-center gap-1 text-xs text-accent-400 hover:underline transition-colors ml-auto font-medium"
            >
              <span>Meta pregled</span>
              <ExternalLink className="size-3" />
            </button>
          ) : ad.previewUrl ? (
            <a
              href={ad.previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-accent-400 transition-colors ml-auto"
            >
              <span>Google pregled</span>
              <ExternalLink className="size-3" />
            </a>
          ) : null}
        </div>

        {/* Video Funnel Section */}
        {hasVideo ? (
          <Card className="gap-0 py-0 shadow-card ring-line border border-line bg-surface/60 overflow-hidden">
            <div className="border-b border-line-soft px-5 py-3">
              <div className="flex items-center justify-between">
                <p className="text-micro font-medium heading-caps text-text-muted">
                  Video Funnel &amp; Zadržavanje pažnje
                </p>
                <span className="text-micro text-text-muted">Metrike video kreative</span>
              </div>
            </div>

            <div className="grid grid-cols-2 divide-x divide-line-soft border-b border-line-soft bg-surface-raised/40">
              <div className="p-4 text-center sm:text-left">
                <span className="text-xs text-text-muted">Hook Rate (3s / Impresije)</span>
                {(() => {
                  const hookRate = deriveRate(videoFunnel.video3s, videoFunnel.impressions);
                  return (
                    <p
                      className={cn(
                        "mt-1 font-mono text-2xl sm:text-3xl font-bold tabular-nums",
                        hookRate !== undefined ? "text-accent-400" : "text-text-muted",
                      )}
                      title={hookRate === undefined ? "Nema dovoljno podataka" : undefined}
                    >
                      {hookRate !== undefined ? formatPercent(hookRate) : "—"}
                    </p>
                  );
                })()}
                <p className="mt-1 text-micro text-text-muted">
                  {videoFunnel.video3s !== undefined ? `${formatNumber(videoFunnel.video3s)} pregleda ≥ 3s` : "—"}
                </p>
              </div>

              <div className="p-4 text-center sm:text-left">
                <span className="text-xs text-text-muted">Hold Rate (ThruPlay / 3s)</span>
                {(() => {
                  const holdRate = deriveRate(videoFunnel.thruplay, videoFunnel.video3s);
                  return (
                    <p
                      className={cn(
                        "mt-1 font-mono text-2xl sm:text-3xl font-bold tabular-nums",
                        holdRate !== undefined ? "text-foreground" : "text-text-muted",
                      )}
                      title={holdRate === undefined ? "Nema dovoljno podataka" : undefined}
                    >
                      {holdRate !== undefined ? formatPercent(holdRate) : "—"}
                    </p>
                  );
                })()}
                <p className="mt-1 text-micro text-text-muted">
                  {videoFunnel.thruplay !== undefined ? `${formatNumber(videoFunnel.thruplay)} kompletnih ThruPlay` : "—"}
                </p>
              </div>
            </div>

            {/* Visual Funnel Bar */}
            <div className="p-5">
              <p className="text-xs font-medium text-text-muted mb-3">
                Kriva zadržavanja publike (Video Retention)
              </p>
              <div className="space-y-2.5 text-xs">
                <div>
                  <div className="flex justify-between text-text-muted mb-1 font-mono tabular-nums">
                    <span>25% videa</span>
                    <span className="text-foreground">
                      {videoFunnel.videoP25 !== undefined ? formatNumber(videoFunnel.videoP25) : "—"}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
                    <div
                      className="h-full bg-chart-1"
                      style={{
                        width: `${videoFunnel.impressions > 0 && videoFunnel.videoP25 !== undefined ? Math.min(100, (videoFunnel.videoP25 / videoFunnel.impressions) * 100) : 0}%`,
                      }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-text-muted mb-1 font-mono tabular-nums">
                    <span>50% videa</span>
                    <span className="text-foreground">
                      {videoFunnel.videoP50 !== undefined ? formatNumber(videoFunnel.videoP50) : "—"}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
                    <div
                      className="h-full bg-chart-1/80"
                      style={{
                        width: `${videoFunnel.impressions > 0 && videoFunnel.videoP50 !== undefined ? Math.min(100, (videoFunnel.videoP50 / videoFunnel.impressions) * 100) : 0}%`,
                      }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-text-muted mb-1 font-mono tabular-nums">
                    <span>75% videa</span>
                    <span className="text-foreground">
                      {videoFunnel.videoP75 !== undefined ? formatNumber(videoFunnel.videoP75) : "—"}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
                    <div
                      className="h-full bg-chart-1/60"
                      style={{
                        width: `${videoFunnel.impressions > 0 && videoFunnel.videoP75 !== undefined ? Math.min(100, (videoFunnel.videoP75 / videoFunnel.impressions) * 100) : 0}%`,
                      }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-text-muted mb-1 font-mono tabular-nums">
                    <span>100% videa (Završeno)</span>
                    <span className="text-foreground">
                      {videoFunnel.videoP100 !== undefined ? formatNumber(videoFunnel.videoP100) : "—"}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
                    <div
                      className="h-full bg-chart-1/40"
                      style={{
                        width: `${videoFunnel.impressions > 0 && videoFunnel.videoP100 !== undefined ? Math.min(100, (videoFunnel.videoP100 / videoFunnel.impressions) * 100) : 0}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </Card>
        ) : null}

        {/* Core Metrics Grid */}
        <div>
          <p className="text-micro font-medium heading-caps text-text-muted mb-3">
            Ključne metrike performansi
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-line bg-surface/50 p-3">
              <span className="text-xs text-text-muted">Potrošnja</span>
              <p className="mt-1 font-mono text-lg font-bold tabular-nums text-foreground">
                {formatMetric(coreMetrics.spend, spendDef, currency)}
              </p>
            </div>

            <div className="rounded-lg border border-line bg-surface/50 p-3">
              <span className="text-xs text-text-muted">Impresije</span>
              <p className="mt-1 font-mono text-lg font-bold tabular-nums text-foreground">
                {formatNumber(coreMetrics.impressions)}
              </p>
            </div>

            <div className="rounded-lg border border-line bg-surface/50 p-3">
              <span className="text-xs text-text-muted">CTR (Svi klikovi)</span>
              <p className="mt-1 font-mono text-lg font-bold tabular-nums text-accent-400">
                {formatPercent(coreMetrics.ctr)}
              </p>
            </div>

            <div className="rounded-lg border border-line bg-surface/50 p-3">
              <span className="text-xs text-text-muted">Frekvencija</span>
              <p className="mt-1 font-mono text-lg font-bold tabular-nums text-foreground">
                {formatDecimal(coreMetrics.frequency)}
              </p>
            </div>

            <div className="rounded-lg border border-line bg-surface/50 p-3">
              <span className="text-xs text-text-muted">Rezultati (Konverzije)</span>
              <p className="mt-1 font-mono text-lg font-bold tabular-nums text-foreground">
                {coreMetrics.results !== undefined ? formatNumber(coreMetrics.results) : "—"}
              </p>
            </div>

            <div className="rounded-lg border border-line bg-surface/50 p-3">
              <span className="text-xs text-text-muted">CPA (Cena / rez.)</span>
              <p className="mt-1 font-mono text-lg font-bold tabular-nums text-foreground">
                {coreMetrics.costPerResult !== undefined ? formatMetric(coreMetrics.costPerResult, cpaDef, currency) : "—"}
              </p>
            </div>

            {coreMetrics.hasConversionValue ? (
              <div className="rounded-lg border border-line bg-surface/50 p-3">
                <span className="text-xs text-text-muted">ROAS</span>
                <p className="mt-1 font-mono text-lg font-bold tabular-nums text-success">
                  {coreMetrics.roas !== undefined ? `${coreMetrics.roas.toFixed(2)}x` : "—"}
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-line bg-surface/50 p-3">
                <span className="text-xs text-text-muted">CPC</span>
                <p className="mt-1 font-mono text-lg font-bold tabular-nums text-foreground">
                  {coreMetrics.cpc !== undefined ? formatMetric(coreMetrics.cpc, cpcDef, currency) : "—"}
                </p>
              </div>
            )}

            <div className="rounded-lg border border-line bg-surface/50 p-3">
              <span className="text-xs text-text-muted">CPM</span>
              <p className="mt-1 font-mono text-lg font-bold tabular-nums text-foreground">
                {coreMetrics.cpm !== undefined ? formatMetric(coreMetrics.cpm, cpmDef, currency) : "—"}
              </p>
            </div>
          </div>
        </div>

        {/* Ista traka jezičaka kao na ostalim ekranima — sa strelicama i
            vezom sa panelom, umesto još jednog reda dugmadi. */}
        <div className="flex flex-col gap-3">
          <TabNav
            tabs={[
              { id: "demographics", label: "Starost × Pol", icon: BarChart3 },
              { id: "placements", label: "Pozicije", icon: Layers },
              { id: "hourly", label: "Satna dinamika (24h)", icon: Clock },
            ]}
            active={activeTab}
            onChange={setActiveTab}
            panelId="ad-breakdown-panel"
          />

          <TabPanel id="ad-breakdown-panel" className="pt-2">
            {activeTab === "demographics" && (
              <AgeGenderHeatTable data={ageGenderMatrix} currencyCode={currency} />
            )}
            {activeTab === "placements" && (
              <PlacementBreakdown data={placementList} currencyCode={currency} />
            )}
            {activeTab === "hourly" && (
              <HourlyChart data={hourlySeries} hasHourlyData={hasHourlyData} currencyCode={currency} />
            )}
          </TabPanel>
        </div>

        {/* Ad Preview Modal with 12h caching & sandbox (C2, C3) */}
        <AdPreviewDialog
          open={openPreviewDialog}
          onOpenChange={setOpenPreviewDialog}
          adId={ad._id}
          adName={ad.name}
        />
      </div>
    </div>
  );
}
