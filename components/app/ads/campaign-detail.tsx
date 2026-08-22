"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { AdDrilldownPanel } from "./ad-drilldown-panel";
import { HookLabelEditor } from "./hook-label-editor";
import {
  formatDecimal,
  formatNumber,
  formatPercent,
} from "@/lib/format";
import { activatable } from "@/lib/activate";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Flame,
  Play,
  Pause,
  Target,
  Clock,
  Layers,
  ChevronRightSquare,
  Swords,
  TrendingUp,
  Copy,
} from "lucide-react";
import Image from "next/image";
import {
  AdActionDialog,
  type AdActionType,
  type AdTargetType,
} from "./ad-action-dialog";
import { formatMetric, formatRanking } from "@/convex/lib/metaAdsFormat";
import { resolveMetric } from "@/convex/lib/metaAdsCatalog";

const spendDef = resolveMetric("spend")!;
const cpaDef = resolveMetric("costPerResult")!;

function formatRatingBadge(rawRanking?: string) {
  const { label, known } = formatRanking(rawRanking);
  if (!known) {
    return (
      <span
        title="Meta još nema dovoljno podataka za rangiranje"
        className="text-text-muted cursor-help"
      >
        —
      </span>
    );
  }
  if (rawRanking === "ABOVE_AVERAGE") {
    return <span className="text-success font-medium">{label}</span>;
  }
  if (rawRanking === "AVERAGE") {
    return <span className="text-text-secondary font-medium">{label}</span>;
  }
  return <span className="text-danger font-medium">{label}</span>;
}

function KeywordQualitySection({
  campaignId,
  from,
  to,
  currency,
}: {
  campaignId: Id<"adCampaigns">;
  from: string;
  to: string;
  currency?: string;
}) {
  const report = useQuery(api.googleAdsStore.getKeywordQualityReport, {
    campaignId,
    from,
    to,
  });

  if (report === undefined) {
    return <Skeleton className="h-48 w-full rounded-lg" />;
  }

  if (report.keywords.length === 0) {
    return null;
  }

  return (
    <Card className="gap-0 py-0 shadow-card ring-line border border-line overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft bg-surface-raised/40 px-5 py-3.5">
        <div className="flex items-center gap-2">
          <Target className="size-4 text-text-muted" />
          <h3 className="text-sm font-bold text-foreground">
            Google Ads — Ocena kvaliteta ključnih reči (Quality Score)
          </h3>
          <span className="rounded-full bg-surface px-2 py-0.5 text-micro font-medium text-text-muted">
            {report.totals.totalKeywords} {report.totals.totalKeywords === 1 ? "reč" : "reči"}
          </span>
        </div>
        {report.totals.averageQualityScore && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">Prosečan Quality Score:</span>
            <span className="inline-flex items-center rounded-full border border-chart-2/40 bg-chart-2/10 px-2 py-0.5 text-xs font-bold font-mono text-foreground">
              {report.totals.averageQualityScore} / 10
            </span>
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <Table className="text-xs">
          <TableHeader>
            <TableRow className="border-line-soft bg-surface/20 hover:bg-transparent">
              <TableHead className="pl-5 min-w-56 text-text-muted">Ključna reč</TableHead>
              <TableHead className="text-center text-text-muted">Tip podudaranja</TableHead>
              <TableHead className="text-center text-text-muted">Quality Score</TableHead>
              <TableHead className="text-center text-text-muted">Očekivani CTR</TableHead>
              <TableHead className="text-center text-text-muted">Relevantnost oglasa</TableHead>
              <TableHead className="text-center text-text-muted">Iskustvo na stranici</TableHead>
              <TableHead className="text-right text-text-muted">Impresije</TableHead>
              <TableHead className="text-right text-text-muted">Klikovi</TableHead>
              <TableHead className="text-right text-text-muted">CTR</TableHead>
              <TableHead className="text-right text-text-muted">Potrošnja</TableHead>
              <TableHead className="pr-5 text-right text-text-muted">Konverzije</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.keywords.map((kw) => (
              <TableRow key={kw.keywordId} className="border-line-soft/60 hover:bg-surface-raised/40 transition-colors">
                <TableCell className="pl-5 font-medium text-foreground">
                  {kw.keywordText}
                </TableCell>
                <TableCell className="text-center font-mono text-micro text-text-muted">
                  {kw.matchType}
                </TableCell>
                <TableCell className="text-center">
                  {kw.qualityScore ? (
                    <span
                      className={cn(
                        "inline-flex items-center justify-center size-6 rounded-full font-mono text-xs font-bold",
                        kw.qualityScore >= 7
                          ? "bg-success/15 text-success border border-success/30"
                          : kw.qualityScore >= 5
                          ? "bg-warning/15 text-warning border border-warning/30"
                          : "bg-danger/15 text-danger border border-danger/30",
                      )}
                    >
                      {kw.qualityScore}
                    </span>
                  ) : (
                    <span className="text-text-muted">—</span>
                  )}
                </TableCell>
                <TableCell className="text-center text-micro">
                  {formatRatingBadge(kw.searchPredictedCtr)}
                </TableCell>
                <TableCell className="text-center text-micro">
                  {formatRatingBadge(kw.creativeQualityScore)}
                </TableCell>
                <TableCell className="text-center text-micro">
                  {formatRatingBadge(kw.postClickQualityScore)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums text-foreground">
                  {formatNumber(kw.impressions)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums text-foreground">
                  {formatNumber(kw.clicks)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums text-accent-400">
                  {formatPercent(kw.ctr)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums text-foreground">
                  {formatMetric(kw.cost, spendDef, currency)}
                </TableCell>
                <TableCell className="pr-5 text-right font-mono tabular-nums font-semibold text-foreground">
                  {formatNumber(kw.conversions)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

function formatObjective(objective?: string): string {
  if (!objective) return "Kampanja";
  switch (objective) {
    case "OUTCOME_LEADS":
    case "LEADS":
      return "Generisanje lidova";
    case "OUTCOME_SALES":
    case "SALES":
      return "Prodaja";
    case "OUTCOME_TRAFFIC":
    case "TRAFFIC":
      return "Saobraćaj na sajtu";
    case "OUTCOME_AWARENESS":
    case "AWARENESS":
      return "Prepoznatljivost brenda";
    case "OUTCOME_ENGAGEMENT":
    case "ENGAGEMENT":
      return "Angažovanje";
    case "OUTCOME_APP_PROMOTION":
    case "APP_PROMOTION":
      return "Promocija aplikacije";
    case "SEARCH":
      return "Search mreža";
    case "PERFORMANCE_MAX":
      return "Performance Max";
    default:
      return objective.replace("OUTCOME_", "").toLowerCase();
  }
}

function formatFreshness(syncedAt?: number, syncPriority?: "hot" | "cold"): string {
  if (!syncedAt) return "sinhronizovano";
  const date = new Date(syncedAt);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const timeStr = `podaci od ${hours}:${minutes}`;

  const diffMinutes = Math.floor((Date.now() - syncedAt) / (60 * 1000));
  if (syncPriority === "hot" && diffMinutes < 60) {
    return `${timeStr} (pre ${diffMinutes} min)`;
  }
  return timeStr;
}

export function CampaignDetail({
  campaignId,
  from,
  to,
  onBack,
  onOpenBattle,
}: {
  campaignId: Id<"adCampaigns">;
  from: string;
  to: string;
  onBack: () => void;
  onOpenBattle?: (adSetId: Id<"adSets">) => void;
}) {
  const [selectedAdId, setSelectedAdId] = useState<Id<"ads"> | null>(null);
  const [collapsedSets, setCollapsedSets] = useState<Record<string, boolean>>({});
  const [actionDialogState, setActionDialogState] = useState<{
    targetType: AdTargetType;
    targetId: string;
    targetName: string;
    currentStatus?: string;
    currentDailyBudget?: number;
    actionType: AdActionType;
  } | null>(null);

  const data = useQuery(api.metaAdsStore.getCampaignHierarchy, {
    campaignId,
    from,
    to,
  });

  const toggleSet = (setId: string) => {
    setCollapsedSets((prev) => ({
      ...prev,
      [setId]: !prev[setId],
    }));
  };

  if (data === undefined) {
    return <CampaignDetailSkeleton />;
  }

  if (data === null) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center py-24 text-center">
        <p className="text-sm text-text-muted">Kampanja nije pronađena.</p>
        <button
          type="button"
          onClick={onBack}
          className="mt-4 flex items-center gap-1.5 rounded-lg border border-line bg-surface-raised px-3 py-1.5 text-xs text-foreground hover:bg-surface"
        >
          <ArrowLeft className="size-3.5" />
          <span>Nazad na sve kampanje</span>
        </button>
      </div>
    );
  }

  const { campaign, adSets } = data;
  const isGoogleAds = (campaign as { provider?: string }).provider === "google_ads" || (campaign as { provider?: string }).provider === "google";

  return (
    <div className="flex flex-1 flex-col gap-6">
      {/* Top Breadcrumb & Header */}
      <div>
        <button
          type="button"
          onClick={onBack}
          className="group inline-flex items-center gap-1.5 text-xs font-medium text-text-muted hover:text-accent-400 transition-colors"
        >
          <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" />
          <span>Nazad na sve kampanje</span>
        </button>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  "size-2.5 rounded-full shrink-0",
                  campaign.status === "ACTIVE" ? "bg-success" : "bg-text-muted",
                )}
                aria-label={`Status: ${campaign.status}`}
              />
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
                {campaign.name}
              </h1>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-muted">
              {/* Provider Badge */}
              {isGoogleAds ? (
                <span className="inline-flex items-center gap-1 rounded border border-chart-2/40 bg-chart-2/10 px-2 py-0.5 font-semibold text-foreground">
                  Google Ads
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded border border-chart-1/40 bg-chart-1/10 px-2 py-0.5 font-semibold text-foreground">
                  Meta Ads
                </span>
              )}

              <span className="inline-flex items-center gap-1 rounded bg-surface-raised px-2 py-0.5 font-medium text-foreground">
                <Target className="size-3 text-accent-400" />
                {formatObjective(campaign.objective)}
              </span>

              {campaign.syncPriority === "hot" ? (
                <span className="inline-flex items-center gap-1 rounded border border-warning/30 bg-warning/10 px-2 py-0.5 font-medium text-warning">
                  <Flame className="size-3" />
                  Hot (15 min sync)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded border border-line bg-surface-raised px-2 py-0.5 font-medium text-text-muted">
                  Standard (6h sync)
                </span>
              )}

              <span className="inline-flex items-center gap-1 text-text-muted font-mono tabular-nums">
                <Clock className="size-3" />
                {formatFreshness(campaign.syncedAt, campaign.syncPriority)}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {campaign.dailyBudget && (
              <div className="flex flex-col items-end rounded-lg border border-line bg-surface/40 px-3 py-2">
                <span className="text-micro text-text-muted">Dnevni budžet</span>
                <span className="font-mono text-sm font-semibold text-foreground">
                  {formatMetric(campaign.dailyBudget, spendDef, campaign.currency)} / dan
                </span>
              </div>
            )}

            {/* Campaign Quick Actions (Protected for Google Ads) */}
            {!isGoogleAds ? (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={campaign.status === "ACTIVE" ? "outline" : "default"}
                  onClick={() =>
                    setActionDialogState({
                      targetType: "campaign",
                      targetId: campaign.externalId,
                      targetName: campaign.name,
                      currentStatus: campaign.status,
                      actionType: campaign.status === "ACTIVE" ? "pause" : "resume",
                    })
                  }
                  className={cn(
                    "h-9 gap-1.5 text-xs font-medium",
                    campaign.status === "ACTIVE"
                      ? "border-line-soft text-text-muted hover:border-danger/40 hover:bg-danger/10 hover:text-danger"
                      : "bg-success text-text-inverse hover:bg-success/90",
                  )}
                >
                  {campaign.status === "ACTIVE" ? (
                    <>
                      <Pause className="size-3.5" />
                      <span>Pauziraj kampanju</span>
                    </>
                  ) : (
                    <>
                      <Play className="size-3.5" />
                      <span>Aktiviraj kampanju</span>
                    </>
                  )}
                </Button>

                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setActionDialogState({
                      targetType: "campaign",
                      targetId: campaign.externalId,
                      targetName: campaign.name,
                      currentStatus: campaign.status,
                      currentDailyBudget: campaign.dailyBudget,
                      actionType: "budget_change",
                    })
                  }
                  className="h-9 gap-1.5 text-xs font-medium border-line-soft hover:border-accent-400/40 hover:bg-accent-400/10 hover:text-accent-400"
                >
                  <TrendingUp className="size-3.5" />
                  <span>Promeni budžet</span>
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 rounded-lg border border-line-soft bg-surface-raised/40 px-3 py-2 text-xs text-text-muted">
                <span>Google Ads (Samo za čitanje)</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Campaign Summary KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <div className="rounded-lg border border-line bg-surface/50 p-3">
          <span className="text-xs text-text-muted">Potrošnja</span>
          <p className="mt-1 font-mono text-xl font-bold tabular-nums text-foreground">
            {formatMetric(campaign.spend, spendDef, campaign.currency)}
          </p>
        </div>

        <div className="rounded-lg border border-line bg-surface/50 p-3">
          <span className="text-xs text-text-muted">Rezultati</span>
          <p className="mt-1 font-mono text-xl font-bold tabular-nums text-foreground">
            {campaign.results !== undefined ? formatNumber(campaign.results) : "—"}
          </p>
        </div>

        <div className="rounded-lg border border-line bg-surface/50 p-3">
          <span className="text-xs text-text-muted">CPA (Cena / rez.)</span>
          <p className="mt-1 font-mono text-xl font-bold tabular-nums text-foreground">
            {formatMetric(campaign.costPerResult, cpaDef, campaign.currency)}
          </p>
        </div>

        {campaign.hasConversionValue ? (
          <div className="rounded-lg border border-line bg-surface/50 p-3">
            <span className="text-xs text-text-muted">ROAS</span>
            <p className="mt-1 font-mono text-xl font-bold tabular-nums text-success">
              {campaign.roas !== undefined ? `${campaign.roas.toFixed(2)}x` : "—"}
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-line bg-surface/50 p-3">
            <span className="text-xs text-text-muted">CTR</span>
            <p className="mt-1 font-mono text-xl font-bold tabular-nums text-accent-400">
              {formatPercent(campaign.ctr)}
            </p>
          </div>
        )}

        <div className="rounded-lg border border-line bg-surface/50 p-3">
          <span className="text-xs text-text-muted">Impresije</span>
          <p className="mt-1 font-mono text-xl font-bold tabular-nums text-foreground">
            {formatNumber(campaign.impressions)}
          </p>
        </div>

        {isGoogleAds ? (
          <div className="rounded-lg border border-line bg-surface/50 p-3">
            <span className="text-xs text-text-muted">Search Impr. Share</span>
            <p className="mt-1 font-mono text-xl font-bold tabular-nums text-foreground">
              {(campaign as { searchImpressionShare?: number }).searchImpressionShare !== undefined
                ? formatPercent((campaign as { searchImpressionShare?: number }).searchImpressionShare!)
                : "—"}
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-line bg-surface/50 p-3">
            <span className="text-xs text-text-muted">Frekvencija</span>
            <p className="mt-1 font-mono text-xl font-bold tabular-nums text-foreground">
              {formatDecimal(campaign.frequency)}
            </p>
          </div>
        )}
      </div>

      {/* Google Ads Keyword Quality Score & Search Terms section */}
      {isGoogleAds && (
        <KeywordQualitySection
          campaignId={campaignId}
          from={from}
          to={to}
          currency={campaign.currency}
        />
      )}

      {/* Ad Sets / Ad Groups -> Ads Hierarchy */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="size-4 text-accent-400" />
            <h2 className="text-base font-bold text-foreground">
              {isGoogleAds ? `Grupe oglasa i Oglasi (${adSets.length})` : `Ad Setovi i Oglasi (${adSets.length})`}
            </h2>
          </div>
          <span className="text-xs text-text-muted">
            {isGoogleAds
              ? "Kliknite na oglas za detaljnu analizu i uvid u kvalitet"
              : "Kliknite na oglas za detaljan video funnel i demografiju"}
          </span>
        </div>

        {adSets.length === 0 ? (
          <div className="rounded-lg border border-line-soft bg-surface/30 p-8 text-center text-sm text-text-muted">
            {isGoogleAds ? "Nema pronađenih grupa oglasa za ovu kampanju." : "Nema pronađenih Ad Setova za ovu kampanju."}
          </div>
        ) : (
          adSets.map((set) => {
            const isCollapsed = Boolean(collapsedSets[set._id]);
            return (
              <Card
                key={set._id}
                className="gap-0 py-0 shadow-card ring-line border border-line overflow-hidden"
              >
                {/* AdSet Collapsible Header */}
                {/* Ceo red ostaje klikabilan zbog miša, ali fokus i tastatura
                    idu na pravo dugme unutra — ugnežđena interaktivna polja
                    su i za čitač ekrana i za tastaturu ćorsokak. */}
                <div
                  onClick={() => toggleSet(set._id)}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft bg-surface-raised/40 px-5 py-3.5 cursor-pointer hover:bg-surface-raised/70 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleSet(set._id);
                      }}
                      aria-expanded={!isCollapsed}
                      className="text-text-muted hover:text-foreground transition-transform"
                      aria-label={isCollapsed ? "Prikaži oglase" : "Sakrij oglase"}
                    >
                      {isCollapsed ? (
                        <ChevronRight className="size-4" />
                      ) : (
                        <ChevronDown className="size-4" />
                      )}
                    </button>

                    <span
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        set.status === "ACTIVE" ? "bg-success" : "bg-text-muted",
                      )}
                    />

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground truncate">
                          {set.name}
                        </span>
                        <span className="rounded-full bg-surface px-2 py-0.5 text-micro font-medium text-text-muted">
                          {set.ads.length} {set.ads.length === 1 ? "oglas" : "oglasa"}
                        </span>
                      </div>
                      {set.targetingSummary && (
                        <p className="mt-0.5 text-xs text-text-muted truncate max-w-md">
                          {isGoogleAds ? `Ciljanje: ${set.targetingSummary}` : `Publika: ${set.targetingSummary}`}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex flex-wrap items-center gap-4 text-xs font-mono tabular-nums text-text-muted">
                      <span>
                        Potrošnja: <strong className="text-foreground">{formatMetric(set.spend, spendDef, campaign.currency)}</strong>
                      </span>
                      <span>
                        Rezultati: <strong className="text-foreground">{set.results !== undefined ? formatNumber(set.results) : "—"}</strong>
                      </span>
                      <span>
                        CPA: <strong className="text-foreground">{formatMetric(set.costPerResult, cpaDef, campaign.currency)}</strong>
                      </span>
                      {set.hasConversionValue && set.roas !== undefined && (
                        <span>
                          ROAS: <strong className="text-success">{set.roas.toFixed(2)}x</strong>
                        </span>
                      )}
                      <span>
                        CTR: <strong className="text-accent-400">{formatPercent(set.ctr)}</strong>
                      </span>
                    </div>

                    {/* Ad Set Action Buttons (Protected for Google Ads) */}
                    {!isGoogleAds && (
                      <div
                        className="flex items-center gap-1.5 pl-2 border-l border-line-soft"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setActionDialogState({
                              targetType: "adset",
                              targetId: set.externalId,
                              targetName: set.name,
                              currentStatus: set.status,
                              actionType:
                                set.status === "ACTIVE" ? "pause" : "resume",
                            })
                          }
                          title={
                            set.status === "ACTIVE"
                              ? "Pauziraj Ad Set"
                              : "Aktiviraj Ad Set"
                          }
                          className={cn(
                            "flex size-7 items-center justify-center rounded border transition-colors",
                            set.status === "ACTIVE"
                              ? "border-line-soft bg-surface text-text-muted hover:border-danger/40 hover:bg-danger/10 hover:text-danger"
                              : "border-success/30 bg-success/10 text-success hover:bg-success/20",
                          )}
                        >
                          {set.status === "ACTIVE" ? (
                            <Pause className="size-3.5" />
                          ) : (
                            <Play className="size-3.5" />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setActionDialogState({
                              targetType: "adset",
                              targetId: set.externalId,
                              targetName: set.name,
                              currentStatus: set.status,
                              currentDailyBudget: set.dailyBudget,
                              actionType: "budget_change",
                            })
                          }
                          title="Promeni budžet Ad Seta"
                          className="flex size-7 items-center justify-center rounded border border-line-soft bg-surface text-text-muted hover:border-accent-400/40 hover:bg-accent-400/10 hover:text-accent-400 transition-colors"
                        >
                          <TrendingUp className="size-3.5" />
                        </button>
                      </div>
                    )}

                    {!isGoogleAds && onOpenBattle && (
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenBattle(set._id);
                        }}
                        className="h-7 gap-1.5 border-accent-400/40 bg-accent-400/10 text-accent-400 hover:bg-accent-400/20 hover:text-accent-300 font-medium ml-1"
                        title="Otvori Hook Battle za ovaj Ad Set"
                      >
                        <Swords className="size-3.5" />
                        <span>Uporedi hooks ({set.ads.length})</span>
                      </Button>
                    )}
                  </div>
                </div>

                {/* Ads Table inside AdSet */}
                {!isCollapsed && (
                  <div className="overflow-x-auto">
                    <Table className="text-xs">
                      <TableHeader>
                        <TableRow className="border-line-soft bg-surface/20 hover:bg-transparent">
                          <TableHead className="pl-5 min-w-56 text-text-muted">Oglas / Kreativa</TableHead>
                          <TableHead className="text-right text-text-muted">Potrošnja</TableHead>
                          <TableHead className="text-right text-text-muted">Impresije</TableHead>
                          <TableHead className="text-right text-text-muted">CTR</TableHead>
                          <TableHead className="text-right text-text-muted">Rezultati</TableHead>
                          <TableHead className="text-right text-text-muted">
                            {set.hasConversionValue ? "CPA / ROAS" : "CPA"}
                          </TableHead>
                          <TableHead className="text-right text-text-muted">
                            {isGoogleAds ? "Status" : "Hook / Hold"}
                          </TableHead>
                          <TableHead className="pr-5 text-right text-text-muted min-w-28">Akcije</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {set.ads.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={8} className="py-6 text-center text-text-muted">
                              Nema oglasa unutar ove grupe.
                            </TableCell>
                          </TableRow>
                        ) : (
                          set.ads.map((ad) => {
                            const hasAdVideo = Boolean(
                              (ad.video3s !== undefined && ad.video3s > 0) ||
                              (ad.thruplay !== undefined && ad.thruplay > 0),
                            );
                            return (
                              <TableRow
                                key={ad._id}
                                {...activatable(() => setSelectedAdId(ad._id))}
                                aria-label={`Otvori oglas ${ad.name}`}
                                className="group cursor-pointer border-line-soft/60 hover:bg-surface-raised/40 transition-colors"
                              >
                                <TableCell className="pl-5">
                                  <div className="flex items-center gap-3">
                                    {ad.thumbnailUrl ? (
                                      <div className="relative size-9 shrink-0 overflow-hidden rounded-md border border-line bg-surface">
                                        <Image
                                          src={ad.thumbnailUrl}
                                          alt={ad.name}
                                          fill
                                          sizes="36px"
                                          className="object-cover"
                                          unoptimized
                                        />
                                      </div>
                                    ) : (
                                      <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-text-muted">
                                        <Play className="size-3.5" />
                                      </div>
                                    )}

                                    <div className="min-w-0 flex flex-col gap-0.5">
                                      <div className="flex items-center gap-2">
                                        <span
                                          className={cn(
                                            "size-1.5 shrink-0 rounded-full",
                                            ad.status === "ACTIVE" ? "bg-success" : "bg-text-muted",
                                          )}
                                        />
                                        <span className="font-medium text-foreground truncate max-w-xs group-hover:text-accent-400 transition-colors">
                                          {ad.name}
                                        </span>
                                      </div>
                                      {!isGoogleAds && (
                                        <HookLabelEditor
                                          adId={ad._id}
                                          currentLabel={ad.hookLabel}
                                          fallbackName={ad.name}
                                        />
                                      )}
                                    </div>
                                  </div>
                                </TableCell>

                                <TableCell className="text-right font-mono tabular-nums font-medium text-foreground">
                                  {formatMetric(ad.spend, spendDef, campaign.currency)}
                                </TableCell>

                                <TableCell className="text-right font-mono tabular-nums text-foreground">
                                  {formatNumber(ad.impressions)}
                                </TableCell>

                                <TableCell className="text-right font-mono tabular-nums text-foreground">
                                  {formatPercent(ad.ctr)}
                                </TableCell>

                                <TableCell className="text-right font-mono tabular-nums text-foreground">
                                  {ad.results !== undefined ? formatNumber(ad.results) : "—"}
                                </TableCell>

                                <TableCell className="text-right font-mono tabular-nums">
                                  <div>
                                    <span className="text-foreground">
                                      {formatMetric(ad.costPerResult, cpaDef, campaign.currency)}
                                    </span>
                                    {ad.hasConversionValue && ad.roas !== undefined && (
                                      <span className="block text-micro text-success font-semibold">
                                        {ad.roas.toFixed(2)}x
                                      </span>
                                    )}
                                  </div>
                                </TableCell>

                                <TableCell className="text-right font-mono tabular-nums">
                                  {isGoogleAds ? (
                                    <span className="text-micro font-medium text-text-secondary">
                                      {ad.status === "ACTIVE" ? "Aktivan" : "Pauziran"}
                                    </span>
                                  ) : hasAdVideo ? (
                                    <div className="text-micro">
                                      {ad.hookRate !== undefined ? (
                                        <span className="text-accent-400 font-medium">{formatPercent(ad.hookRate)}</span>
                                      ) : (
                                        <span className="text-text-muted" title="Nema dovoljno podataka">—</span>
                                      )}
                                      <span className="text-text-muted mx-1">/</span>
                                      {ad.holdRate !== undefined ? (
                                        <span className="text-foreground">{formatPercent(ad.holdRate)}</span>
                                      ) : (
                                        <span className="text-text-muted" title="Nema dovoljno podataka">—</span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-text-muted" title="Nema dovoljno podataka">—</span>
                                  )}
                                </TableCell>

                                <TableCell className="pr-5 text-right">
                                  <div
                                    className="flex items-center justify-end gap-1.5"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {!isGoogleAds && (
                                      <>
                                        {/* Quick Pause / Resume */}
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setActionDialogState({
                                              targetType: "ad",
                                              targetId: ad.externalId,
                                              targetName: ad.name,
                                              currentStatus: ad.status,
                                              actionType:
                                                ad.status === "ACTIVE"
                                                  ? "pause"
                                                  : "resume",
                                            })
                                          }
                                          title={
                                            ad.status === "ACTIVE"
                                              ? "Pauziraj oglas"
                                              : "Aktiviraj oglas"
                                          }
                                          className={cn(
                                            "flex size-6 items-center justify-center rounded border transition-colors",
                                            ad.status === "ACTIVE"
                                              ? "border-line-soft bg-surface text-text-muted hover:border-danger/40 hover:bg-danger/10 hover:text-danger"
                                              : "border-success/30 bg-success/10 text-success hover:bg-success/20",
                                          )}
                                        >
                                          {ad.status === "ACTIVE" ? (
                                            <Pause className="size-3" />
                                          ) : (
                                            <Play className="size-3" />
                                          )}
                                        </button>

                                        {/* Duplicate Ad */}
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setActionDialogState({
                                              targetType: "ad",
                                              targetId: ad.externalId,
                                              targetName: ad.name,
                                              currentStatus: ad.status,
                                              actionType: "duplicate",
                                            })
                                          }
                                          title="Dupliraj oglas (kreira se PAUSED)"
                                          className="flex size-6 items-center justify-center rounded border border-line-soft bg-surface text-text-muted hover:border-line hover:text-foreground transition-colors"
                                        >
                                          <Copy className="size-3" />
                                        </button>
                                      </>
                                    )}

                                    {/* Drilldown details */}
                                    <button
                                      type="button"
                                      onClick={() => setSelectedAdId(ad._id)}
                                      className="inline-flex items-center gap-1 rounded border border-line bg-surface-raised px-2 py-0.5 text-micro font-medium text-foreground hover:border-accent-400/50 hover:text-accent-400 transition-colors ml-0.5"
                                    >
                                      <span>Detalji</span>
                                      <ChevronRightSquare className="size-3" />
                                    </button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>

      {/* Action Execution Dialog */}
      {actionDialogState && (
        <AdActionDialog
          open={actionDialogState !== null}
          onOpenChange={(open) => !open && setActionDialogState(null)}
          actionType={actionDialogState.actionType}
          targetType={actionDialogState.targetType}
          targetId={actionDialogState.targetId}
          targetName={actionDialogState.targetName}
          currentStatus={actionDialogState.currentStatus}
          currentDailyBudget={actionDialogState.currentDailyBudget}
        />
      )}

      {/* Per-Ad Drilldown Side Panel */}
      {selectedAdId && (
        <AdDrilldownPanel
          adId={selectedAdId}
          from={from}
          to={to}
          onClose={() => setSelectedAdId(null)}
        />
      )}
    </div>
  );
}

export function CampaignDetailSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <Skeleton className="h-4 w-36" />
      <div className="flex justify-between items-center">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-8 w-32" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
      <Skeleton className="h-64 w-full rounded-lg" />
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  );
}
