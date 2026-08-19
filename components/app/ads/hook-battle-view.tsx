"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HookLabelEditor } from "./hook-label-editor";
import { RetentionStrip } from "./retention-strip";
import {
  EvidenceMeter,
  DEFAULT_THRESHOLD_IMPRESSIONS,
  DEFAULT_THRESHOLD_CLICKS,
} from "./evidence-meter";
import {
  evaluateHookBattle,
  type VersionBattleStats,
} from "./battle-verdict";
import { AdDrilldownPanel } from "./ad-drilldown-panel";
import {
  formatDecimal,
  formatNumber,
  formatPercent,
  formatDateSpan,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Crown,
  Pin,
  PinOff,
  SlidersHorizontal,
  Swords,
  Play,
  Pause,
  TrendingUp,
  Layers,
  ChevronRightSquare,
  Sparkles,
  Info,
} from "lucide-react";
import {
  AdActionDialog,
  type AdActionType,
  type AdTargetType,
} from "./ad-action-dialog";
import { NewHookVersionDialog } from "./new-hook-version-dialog";

interface HookBattleViewProps {
  adSetId: Id<"adSets">;
  from: string;
  to: string;
  onBack: () => void;
}

export function HookBattleView({
  adSetId,
  from,
  to,
  onBack,
}: HookBattleViewProps) {
  const [thresholdImp, setThresholdImp] = useState(
    DEFAULT_THRESHOLD_IMPRESSIONS,
  );
  const [thresholdClicks, setThresholdClicks] = useState(
    DEFAULT_THRESHOLD_CLICKS,
  );
  const [selectedAdId, setSelectedAdId] = useState<Id<"ads"> | null>(null);
  const [isPinning, setIsPinning] = useState(false);
  const [actionDialogState, setActionDialogState] = useState<{
    targetType: AdTargetType;
    targetId: string;
    targetName: string;
    currentStatus?: string;
    currentDailyBudget?: number;
    actionType: AdActionType;
  } | null>(null);
  const [newHookState, setNewHookState] = useState<{
    sourceAdId: string;
    sourceAdName: string;
    sourceHookLabel?: string;
    sourcePrimaryText?: string;
    sourceHeadline?: string;
    thumbnailUrl?: string;
  } | null>(null);

  const data = useQuery(api.metaAdsStore.getHookBattle, {
    adSetId,
    from,
    to,
  });

  const pinBattleMutation = useMutation(api.metaAdsStore.pinBattle);
  const unpinBattleMutation = useMutation(api.metaAdsStore.unpinBattle);

  const handleTogglePin = async (currentPinned: boolean) => {
    try {
      setIsPinning(true);
      if (currentPinned) {
        await unpinBattleMutation({ adSetId, from, to });
      } else {
        await pinBattleMutation({ adSetId, from, to });
      }
    } catch (err) {
      console.error("Greška pri pinovanju bitke:", err);
    } finally {
      setIsPinning(false);
    }
  };

  const rawVersions = data?.versions;
  const versions = useMemo(() => rawVersions ?? [], [rawVersions]);

  // Evaluate battle using deterministic rules
  const evaluation = useMemo(() => {
    return evaluateHookBattle(
      versions as unknown as VersionBattleStats[],
      thresholdImp,
      thresholdClicks,
    );
  }, [versions, thresholdImp, thresholdClicks]);

  // Identify worst performing active ad for "Pauziraj gubitnika"
  const loserVersion = useMemo(() => {
    const activeNonLeaders = versions.filter(
      (v) =>
        v.status === "ACTIVE" &&
        v.impressions > 0 &&
        v._id !== evaluation.leaderId,
    );
    if (activeNonLeaders.length === 0) return null;
    return [...activeNonLeaders].sort((a, b) => {
      if (a.results > 0 && b.results > 0) {
        return b.costPerResult - a.costPerResult;
      }
      if (a.results === 0 && b.results > 0) return 1;
      if (b.results === 0 && a.results > 0) return -1;
      return a.hookRate - b.hookRate;
    })[0];
  }, [versions, evaluation.leaderId]);

  if (data === undefined) {
    return <HookBattleSkeleton />;
  }

  if (data === null) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center py-24 text-center">
        <p className="text-sm text-text-muted">Ad Set nije pronađen.</p>
        <Button variant="outline" size="sm" onClick={onBack} className="mt-4">
          <ArrowLeft className="size-4" />
          <span>Nazad</span>
        </Button>
      </div>
    );
  }

  const { adSet, campaign, isPinned } = data;

  return (
    <div className="flex flex-1 flex-col gap-6">
      {/* Top Header & Context */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="group inline-flex items-center gap-1.5 text-xs font-medium text-text-muted hover:text-accent-400 transition-colors"
          >
            <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" />
            <span>Nazad na kampanju ({campaign.name})</span>
          </button>

          {/* Quick Date Range & Pin controls */}
          <div className="flex items-center gap-2">
            {/* Threshold config popover */}
            <Popover>
              <PopoverTrigger
                render={
                  <Button
                    variant="outline"
                    size="xs"
                    className="h-7 text-xs text-text-muted hover:text-foreground border-line-soft bg-surface"
                  />
                }
              >
                <SlidersHorizontal className="size-3" />
                <span>Pragovi ({formatNumber(thresholdImp)}/{thresholdClicks})</span>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-72 border-line bg-surface-raised p-4 shadow-xl"
              >
                <PopoverHeader>
                  <PopoverTitle className="text-xs font-semibold text-foreground">
                    Podešavanje statističkih pragova
                  </PopoverTitle>
                  <PopoverDescription className="text-micro text-text-muted mt-1">
                    Verzije ispod ovog praga označavaju se sa &ldquo;Rano za
                    zaključak&rdquo; i ne mogu biti krunisane kao pobednik.
                  </PopoverDescription>
                </PopoverHeader>
                <div className="mt-3 space-y-3">
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs text-text-muted">
                      Min. impresija
                    </Label>
                    <Input
                      type="number"
                      value={thresholdImp}
                      min={100}
                      step={100}
                      onChange={(e) =>
                        setThresholdImp(Math.max(10, Number(e.target.value)))
                      }
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs text-text-muted">
                      Min. klikova
                    </Label>
                    <Input
                      type="number"
                      value={thresholdClicks}
                      min={10}
                      step={10}
                      onChange={(e) =>
                        setThresholdClicks(Math.max(5, Number(e.target.value)))
                      }
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div className="flex justify-between pt-1">
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => {
                        setThresholdImp(DEFAULT_THRESHOLD_IMPRESSIONS);
                        setThresholdClicks(DEFAULT_THRESHOLD_CLICKS);
                      }}
                      className="text-micro text-text-muted"
                    >
                      Resetuj na podrazumevano
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            {/* Pin Button */}
            <Button
              variant={isPinned ? "default" : "outline"}
              size="xs"
              onClick={() => handleTogglePin(isPinned)}
              disabled={isPinning}
              className={cn(
                "h-7 text-xs transition-colors",
                isPinned
                  ? "bg-accent-400 text-slate-950 hover:bg-accent-300 font-semibold"
                  : "border-line-soft bg-surface text-text-muted hover:text-foreground",
              )}
            >
              {isPinned ? (
                <>
                  <Pin className="size-3 fill-current" />
                  <span>Pinovano</span>
                </>
              ) : (
                <>
                  <PinOff className="size-3" />
                  <span>Pinuj bitku</span>
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex size-7 items-center justify-center rounded-lg bg-accent-400/10 text-accent-400 border border-accent-400/20">
                <Swords className="size-4" />
              </span>
              <div>
                <p className="heading-caps text-[0.625rem] font-medium text-accent-400">
                  Hook Battle · Poređenje kreativa
                </p>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  {adSet.name}
                </h1>
              </div>
            </div>
            {adSet.targetingSummary && (
              <p className="mt-1 text-xs text-text-muted">
                Publika: <span className="text-foreground/80">{adSet.targetingSummary}</span>
              </p>
            )}
          </div>

          <div className="flex items-center gap-3 text-xs font-mono text-text-muted">
            <span className="inline-flex items-center gap-1 rounded bg-surface-raised px-2.5 py-1 border border-line">
              <Layers className="size-3 text-accent-400" />
              <span>{versions.length} verzije kreativa</span>
            </span>
            <span className="tabular-nums">
              {formatDateSpan(from, to)}
            </span>
          </div>
        </div>
      </div>

      {/* Battle Summary Line & Criterion Banner */}
      <Card className="gap-0 py-0 shadow-card border border-accent-400/30 bg-gradient-to-r from-accent-400/[0.06] via-surface-raised/40 to-surface/30 p-4 sm:p-5">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft/60 pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-accent-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-accent-400">
                Presuda analize
              </span>
            </div>

            {/* Active Criterion Badge */}
            <div className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-0.5 text-micro text-text-muted">
              <Info className="size-3 text-accent-400" />
              <span>Kriterijum: <strong className="text-foreground font-medium">{evaluation.criterion}</strong></span>
            </div>
          </div>

          {/* Verdict Text */}
          <div className="flex flex-col gap-1.5">
            <p className="text-sm sm:text-base font-semibold leading-relaxed text-foreground">
              {evaluation.verdict}
            </p>
            {evaluation.recommendation && (
              <p className="text-xs text-text-muted font-medium flex items-center gap-1.5">
                <TrendingUp className="size-3.5 text-accent-400 shrink-0" />
                <span>{evaluation.recommendation}</span>
              </p>
            )}
          </div>

          {/* Quick Battle Action Triggers */}
          <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-line-soft/60">
            {loserVersion && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setActionDialogState({
                    targetType: "ad",
                    targetId: loserVersion.externalId,
                    targetName: loserVersion.displayName || loserVersion.name,
                    currentStatus: loserVersion.status,
                    actionType: "pause",
                  })
                }
                className="h-8 gap-1.5 text-xs border-danger/40 bg-danger/10 text-danger hover:bg-danger/20 hover:text-danger font-medium"
              >
                <Pause className="size-3.5" />
                <span>Pauziraj gubitnika ({loserVersion.displayName || loserVersion.name})</span>
              </Button>
            )}

            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                setActionDialogState({
                  targetType: "adset",
                  targetId: adSet.externalId,
                  targetName: adSet.name,
                  currentStatus: adSet.status,
                  currentDailyBudget: adSet.dailyBudget,
                  actionType: "budget_change",
                })
              }
              className="h-8 gap-1.5 text-xs border-accent-400/40 bg-accent-400/10 text-accent-400 hover:bg-accent-400/20 hover:text-accent-300 font-medium"
            >
              <TrendingUp className="size-3.5" />
              <span>Podigni budžet lidera ({adSet.name})</span>
            </Button>
          </div>
        </div>
      </Card>

      {/* Empty State */}
      {versions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line p-12 text-center text-sm text-text-muted">
          Nema pronađenih verzija oglasa unutar ovog Ad Seta.
        </div>
      ) : (
        /* Side-by-Side Hook Battle Columns */
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between text-xs text-text-muted">
            <span className="font-medium text-foreground">
              Uporedni pregled po verzijama ({versions.length})
            </span>
            <span className="hidden sm:inline">
              Cijan okvir označava trenutnog lidera
            </span>
          </div>

          {/* Horizontal scroll container for 375px mobile responsiveness */}
          <div className="overflow-x-auto pb-4 -mx-4 px-4 sm:mx-0 sm:px-0">
            <div
              className="grid gap-4 min-w-[700px] sm:min-w-0"
              style={{
                gridTemplateColumns: `repeat(${Math.max(versions.length, 1)}, minmax(240px, 1fr))`,
              }}
            >
              {versions.map((version, index) => {
                const isLeader = evaluation.leaderId === version._id;
                const rankNumber = index + 1;

                return (
                  <Card
                    key={version._id}
                    className={cn(
                      "flex flex-col gap-0 py-0 shadow-card transition-all duration-200 relative overflow-hidden border",
                      isLeader
                        ? "border-accent-400 ring-2 ring-accent-400/40 bg-accent-400/[0.03]"
                        : "border-line bg-card hover:border-line-strong",
                    )}
                  >
                    {/* Leader Top Ribbon */}
                    {isLeader && (
                      <div className="bg-accent-400 text-slate-950 text-micro font-bold py-1 px-3 flex items-center justify-center gap-1.5 uppercase tracking-wider">
                        <Crown className="size-3.5 fill-current" />
                        <span>Vodeći hook</span>
                      </div>
                    )}

                    {/* Column Header: Thumbnail + Name + Inline HookLabel */}
                    <div className="p-4 border-b border-line-soft flex flex-col gap-3">
                      {/* Thumbnail Preview with Status */}
                      <div className="relative aspect-video w-full rounded-md border border-line overflow-hidden bg-surface flex items-center justify-center">
                        {version.thumbnailUrl ? (
                          <Image
                            src={version.thumbnailUrl}
                            alt={version.name}
                            fill
                            sizes="(max-width: 768px) 100vw, 300px"
                            className="object-cover"
                            unoptimized
                          />
                        ) : (
                          <div className="flex flex-col items-center gap-1 text-text-muted">
                            <Play className="size-6 text-text-muted/60" />
                            <span className="text-[0.625rem]">Video kreativa</span>
                          </div>
                        )}

                        <div className="absolute top-2 left-2 flex items-center gap-1.5 rounded bg-slate-950/85 px-2 py-0.5 text-[0.625rem] font-medium text-foreground backdrop-blur-xs border border-white/10">
                          <span
                            className={cn(
                              "size-1.5 rounded-full",
                              version.status === "ACTIVE"
                                ? "bg-success"
                                : "bg-amber-400 animate-pulse",
                            )}
                          />
                          <span>
                            {version.status === "ACTIVE"
                              ? "ACTIVE"
                              : "Čeka aktivaciju"}
                          </span>
                        </div>

                        {!isLeader && (
                          <div className="absolute top-2 right-2 rounded bg-slate-950/80 px-1.5 py-0.5 text-[0.625rem] font-mono text-text-muted border border-white/10">
                            #{rankNumber}
                          </div>
                        )}
                      </div>

                      {/* Hook Label / Ad Name */}
                      <div className="flex flex-col gap-1 min-w-0">
                        <HookLabelEditor
                          adId={version._id}
                          currentLabel={version.hookLabel}
                          fallbackName={version.name}
                        />
                        <p
                          className="text-xs text-text-muted truncate"
                          title={version.name}
                        >
                          {version.name}
                        </p>
                      </div>
                    </div>

                    {/* Aligned Metric Rows */}
                    <div className="flex flex-col divide-y divide-line-soft text-xs">
                      {/* 1. HERO METRIC: HOOK RATE */}
                      <div className="p-4 bg-surface/30 flex flex-col gap-1">
                        <span className="heading-caps text-[0.625rem] font-semibold text-text-muted">
                          Hook Rate (3s / Impresije)
                        </span>
                        <div className="flex items-baseline justify-between">
                          <span className="font-mono text-3xl font-bold tracking-tight text-accent-400">
                            {formatPercent(version.hookRate)}
                          </span>
                          <span className="font-mono text-xs text-text-muted">
                            {formatNumber(version.video3s)} / {formatNumber(version.impressions)}
                          </span>
                        </div>
                      </div>

                      {/* 2. Statistical Evidence Meter */}
                      <div className="p-3.5">
                        <EvidenceMeter
                          impressions={version.impressions}
                          clicks={version.clicks}
                          thresholdImpressions={thresholdImp}
                          thresholdClicks={thresholdClicks}
                          status={version.status}
                        />
                      </div>

                      {/* 3. Video Retention Strip */}
                      <div className="p-3.5">
                        <RetentionStrip
                          retention={version.videoRetention}
                          impressions={version.impressions}
                        />
                      </div>

                      {/* 4. Hold Rate */}
                      <div className="px-4 py-2.5 flex items-center justify-between">
                        <span className="text-text-muted">Hold Rate (ThruPlay / 3s)</span>
                        <span className="font-mono font-medium text-foreground">
                          {version.video3s > 0
                            ? formatPercent(version.holdRate)
                            : "—"}
                        </span>
                      </div>

                      {/* 5. CTR */}
                      <div className="px-4 py-2.5 flex items-center justify-between">
                        <span className="text-text-muted">CTR (Klikovnost)</span>
                        <span className="font-mono font-medium text-foreground">
                          {formatPercent(version.ctr)}
                        </span>
                      </div>

                      {/* 6. CPA / ROAS */}
                      <div className="px-4 py-2.5 flex items-center justify-between">
                        <span className="text-text-muted">
                          {version.hasConversionValue ? "CPA / ROAS" : "CPA (Cena / rez.)"}
                        </span>
                        <div className="text-right font-mono">
                          <span
                            className={cn(
                              "font-bold",
                              version.costPerResult > 0
                                ? "text-foreground"
                                : "text-text-muted",
                            )}
                          >
                            {version.costPerResult > 0
                              ? `${formatNumber(version.costPerResult)} €`
                              : "—"}
                          </span>
                          {version.hasConversionValue && (
                            <span className="block text-[0.625rem] text-success font-semibold">
                              {version.roas.toFixed(2)}x
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 7. Potrošnja & Rezultati */}
                      <div className="px-4 py-2.5 flex items-center justify-between">
                        <span className="text-text-muted">Potrošnja (Rezultati)</span>
                        <div className="text-right font-mono">
                          <span className="font-medium text-foreground">
                            {formatNumber(version.spend)} €
                          </span>
                          <span className="block text-[0.625rem] text-text-muted">
                            ({version.results} konv.)
                          </span>
                        </div>
                      </div>

                      {/* 8. Impresije & Frekvencija */}
                      <div className="px-4 py-2.5 flex items-center justify-between">
                        <span className="text-text-muted">Impresije (Frekvencija)</span>
                        <div className="text-right font-mono text-foreground">
                          <span>{formatNumber(version.impressions)}</span>
                          <span className="text-text-muted ml-1 text-micro">
                            ({formatDecimal(version.frequency)})
                          </span>
                        </div>
                      </div>

                      {/* 9. Actions & Drilldown */}
                      <div className="p-3 bg-surface/20 flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              setActionDialogState({
                                targetType: "ad",
                                targetId: version.externalId,
                                targetName: version.name,
                                currentStatus: version.status,
                                actionType:
                                  version.status === "ACTIVE"
                                    ? "pause"
                                    : "resume",
                              })
                            }
                            title={
                              version.status === "ACTIVE"
                                ? "Pauziraj oglas"
                                : "Aktiviraj oglas"
                            }
                            className={cn(
                              "flex size-6 items-center justify-center rounded border transition-colors",
                              version.status === "ACTIVE"
                                ? "border-line-soft bg-surface text-text-muted hover:border-danger/40 hover:bg-danger/10 hover:text-danger"
                                : "border-success/30 bg-success/10 text-success hover:bg-success/20",
                            )}
                          >
                            {version.status === "ACTIVE" ? (
                              <Pause className="size-3" />
                            ) : (
                              <Play className="size-3" />
                            )}
                          </button>

                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            onClick={() =>
                              setNewHookState({
                                sourceAdId: version.externalId,
                                sourceAdName: version.name,
                                sourceHookLabel: version.hookLabel,
                                sourcePrimaryText: version.primaryText,
                                sourceHeadline: version.headline,
                                thumbnailUrl: version.thumbnailUrl,
                              })
                            }
                            title="Kreiraj novu verziju hook-a sa izmenjenim tekstom"
                            className="h-6 text-micro px-2 border-accent-400/40 bg-accent-400/10 text-accent-400 hover:bg-accent-400/20 hover:text-accent-300 font-medium gap-1"
                          >
                            <Sparkles className="size-3" />
                            <span>Nova verzija</span>
                          </Button>
                        </div>

                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={() => setSelectedAdId(version._id)}
                          className="h-6 text-micro px-2 text-text-muted hover:text-accent-400 hover:bg-surface-raised gap-1"
                        >
                          <span>Detalji</span>
                          <ChevronRightSquare className="size-3" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        </div>
      )}

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

      {/* New Hook Version Creation Dialog */}
      {newHookState && (
        <NewHookVersionDialog
          open={newHookState !== null}
          onOpenChange={(open) => !open && setNewHookState(null)}
          sourceAdId={newHookState.sourceAdId}
          sourceAdName={newHookState.sourceAdName}
          sourceHookLabel={newHookState.sourceHookLabel}
          sourcePrimaryText={newHookState.sourcePrimaryText}
          sourceHeadline={newHookState.sourceHeadline}
          thumbnailUrl={newHookState.thumbnailUrl}
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

export function HookBattleSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <Skeleton className="h-4 w-36" />
      <div className="flex justify-between items-center">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-8 w-32" />
      </div>
      <Skeleton className="h-28 w-full rounded-lg" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Skeleton className="h-96 rounded-lg" />
        <Skeleton className="h-96 rounded-lg" />
        <Skeleton className="h-96 rounded-lg" />
      </div>
    </div>
  );
}
