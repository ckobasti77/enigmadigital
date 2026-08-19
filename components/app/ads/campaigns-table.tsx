"use client";

import { useMemo, useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { formatDecimal, formatNumber, formatPercent } from "@/lib/format";
import { activatable } from "@/lib/activate";
import { cn } from "@/lib/utils";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Flame,
  ChevronRight,
  Target,
  Clock,
  Pause,
  Play,
  TrendingUp,
} from "lucide-react";
import {
  AdActionDialog,
  type AdActionType,
} from "./ad-action-dialog";

export type CampaignRow = {
  _id: Id<"adCampaigns">;
  externalId: string;
  name: string;
  provider?: "meta_ads" | "google_ads" | "meta" | "google" | string;
  accountName?: string;
  objective?: string;
  status: string;
  dailyBudget?: number;
  lifetimeBudget?: number;
  searchImpressionShare?: number;
  syncPriority: "hot" | "cold";
  syncedAt?: number;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  results: number;
  conversionValue: number;
  costPerResult: number;
  roas: number;
  hasConversionValue: boolean;
  ctr: number;
  cpc: number;
  cpm: number;
  frequency: number;
  video3s: number;
  thruplay: number;
  dailySpend: Array<{ date: string; spend: number }>;
  adSetsCount: number;
  adsCount: number;
};

type SortKey =
  | "name"
  | "status"
  | "spend"
  | "results"
  | "costPerResult"
  | "roas"
  | "ctr"
  | "frequency"
  | "syncedAt";

type Sort = { key: SortKey; dir: "asc" | "desc" };

const DEFAULT_SORT: Sort = { key: "spend", dir: "desc" };

function compare(a: CampaignRow, b: CampaignRow, { key, dir }: Sort): number {
  const av = a[key];
  const bv = b[key];
  let c = 0;
  if (av === null || av === undefined) {
    c = bv === null || bv === undefined ? 0 : -1;
  } else if (bv === null || bv === undefined) {
    c = 1;
  } else if (typeof av === "number" && typeof bv === "number") {
    c = av - bv;
  } else {
    c = String(av ?? "").localeCompare(String(bv ?? ""), "sr-Latn");
  }
  return dir === "asc" ? c : -c;
}

function formatObjective(objective?: string): string {
  if (!objective) return "Kampanja";
  switch (objective) {
    case "OUTCOME_LEADS":
    case "LEADS":
      return "Leads";
    case "OUTCOME_SALES":
    case "SALES":
      return "Sales";
    case "OUTCOME_TRAFFIC":
    case "TRAFFIC":
      return "Traffic";
    case "OUTCOME_AWARENESS":
    case "AWARENESS":
      return "Awareness";
    case "OUTCOME_ENGAGEMENT":
    case "ENGAGEMENT":
      return "Engagement";
    case "OUTCOME_APP_PROMOTION":
    case "APP_PROMOTION":
      return "App Promo";
    case "SEARCH":
      return "Search";
    case "PERFORMANCE_MAX":
      return "PMax";
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

const SPARK_W = 72;
const SPARK_H = 22;

function SpendSparkline({ values, className }: { values: number[]; className?: string }) {
  const max = Math.max(1, ...values);
  const n = values.length;
  const pts = values.map((v, i) => {
    const x = n === 1 ? SPARK_W / 2 : (i / (n - 1)) * SPARK_W;
    const y = SPARK_H - 2 - (v / max) * (SPARK_H - 4);
    return [x, y] as const;
  });
  const line = pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const area =
    pts.length > 0
      ? `M0,${SPARK_H} L${line.replace(/ /g, " L")} L${SPARK_W},${SPARK_H} Z`
      : "";

  return (
    <svg
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      preserveAspectRatio="none"
      className={cn("h-6 w-18", className)}
      aria-hidden
    >
      {pts.length > 1 && (
        <>
          <path d={area} fill="currentColor" fillOpacity={0.12} />
          <polyline
            points={line}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </>
      )}
    </svg>
  );
}

export function CampaignsTable({
  campaigns,
  onSelectCampaign,
}: {
  campaigns: CampaignRow[];
  onSelectCampaign: (id: Id<"adCampaigns">) => void;
}) {
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT);
  const [platformFilter, setPlatformFilter] = useState<"all" | "meta" | "google">("all");
  const [activeAction, setActiveAction] = useState<{
    campaign: CampaignRow;
    actionType: AdActionType;
  } | null>(null);

  const [optimisticOverrides, setOptimisticOverrides] = useState<
    Record<string, { status?: string; dailyBudget?: number }>
  >({});

  const metaCount = useMemo(
    () => campaigns.filter((c) => c.provider !== "google_ads" && c.provider !== "google").length,
    [campaigns],
  );
  const googleCount = useMemo(
    () => campaigns.filter((c) => c.provider === "google_ads" || c.provider === "google").length,
    [campaigns],
  );

  const rows = useMemo(() => {
    return campaigns
      .filter((c) => {
        if (platformFilter === "all") return true;
        if (platformFilter === "google") {
          return c.provider === "google_ads" || c.provider === "google";
        }
        return c.provider !== "google_ads" && c.provider !== "google";
      })
      .map((c) => {
        const override = optimisticOverrides[c.externalId];
        if (!override) return c;
        return {
          ...c,
          status: override.status ?? c.status,
          dailyBudget: override.dailyBudget ?? c.dailyBudget,
        };
      })
      .sort((a, b) => compare(a, b, sort));
  }, [campaigns, optimisticOverrides, platformFilter, sort]);

  const toggleSort = (key: SortKey) => {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "name" ? "asc" : "desc" },
    );
  };

  const renderSortIcon = (key: SortKey) => {
    if (sort.key !== key) {
      return <ArrowUpDown className="size-3 text-text-muted/60 opacity-0 group-hover:opacity-100" />;
    }
    return sort.dir === "asc" ? (
      <ArrowUp className="size-3 text-accent-400" />
    ) : (
      <ArrowDown className="size-3 text-accent-400" />
    );
  };

  return (
    <>
      <div className="flex flex-col gap-3">
        {/* Platform Filter Tabs (All / Meta / Google) */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1 rounded-lg border border-line bg-surface/60 p-1">
            <button
              type="button"
              onClick={() => setPlatformFilter("all")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors",
                platformFilter === "all"
                  ? "bg-surface-raised text-foreground shadow-sm"
                  : "text-text-muted hover:text-foreground",
              )}
            >
              <span>Sve platforme</span>
              <span className="font-mono text-micro text-text-muted">
                ({campaigns.length})
              </span>
            </button>

            <button
              type="button"
              onClick={() => setPlatformFilter("meta")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors",
                platformFilter === "meta"
                  ? "bg-surface-raised text-foreground shadow-sm"
                  : "text-text-muted hover:text-foreground",
              )}
            >
              <span className="size-1.5 rounded-full bg-chart-1" />
              <span>Meta Ads</span>
              <span className="font-mono text-micro text-text-muted">
                ({metaCount})
              </span>
            </button>

            <button
              type="button"
              onClick={() => setPlatformFilter("google")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors",
                platformFilter === "google"
                  ? "bg-surface-raised text-foreground shadow-sm"
                  : "text-text-muted hover:text-foreground",
              )}
            >
              <span className="size-1.5 rounded-full bg-chart-2" />
              <span>Google Ads</span>
              <span className="font-mono text-micro text-text-muted">
                ({googleCount})
              </span>
            </button>
          </div>
        </div>

        <Card className="gap-0 py-0 shadow-card ring-line border border-line overflow-hidden">
        <div className="overflow-x-auto">
          <Table className="text-xs">
            <TableHeader>
              <TableRow className="border-line-soft bg-surface-raised/40 hover:bg-transparent">
                <TableHead className="pl-5 min-w-64 text-text-muted">
                  <button
                    type="button"
                    onClick={() => toggleSort("name")}
                    className="group flex items-center gap-1.5 font-medium hover:text-foreground transition-colors"
                  >
                    <span>Kampanja</span>
                    {renderSortIcon("name")}
                  </button>
                </TableHead>

                <TableHead className="text-right text-text-muted min-w-28">
                  <button
                    type="button"
                    onClick={() => toggleSort("spend")}
                    className="group ml-auto flex items-center gap-1.5 font-medium hover:text-foreground transition-colors"
                  >
                    <span>Potrošnja</span>
                    {renderSortIcon("spend")}
                  </button>
                </TableHead>

                <TableHead className="text-center text-text-muted w-24">
                  <span>Dnevni trend</span>
                </TableHead>

                <TableHead className="text-right text-text-muted min-w-24">
                  <button
                    type="button"
                    onClick={() => toggleSort("results")}
                    className="group ml-auto flex items-center gap-1.5 font-medium hover:text-foreground transition-colors"
                  >
                    <span>Rezultati</span>
                    {renderSortIcon("results")}
                  </button>
                </TableHead>

                <TableHead className="text-right text-text-muted min-w-28">
                  <button
                    type="button"
                    onClick={() => toggleSort("costPerResult")}
                    className="group ml-auto flex items-center gap-1.5 font-medium hover:text-foreground transition-colors"
                  >
                    <span>CPA / ROAS</span>
                    {renderSortIcon("costPerResult")}
                  </button>
                </TableHead>

                <TableHead className="text-right text-text-muted min-w-20">
                  <button
                    type="button"
                    onClick={() => toggleSort("ctr")}
                    className="group ml-auto flex items-center gap-1.5 font-medium hover:text-foreground transition-colors"
                  >
                    <span>CTR</span>
                    {renderSortIcon("ctr")}
                  </button>
                </TableHead>

                <TableHead className="text-right text-text-muted min-w-20">
                  <button
                    type="button"
                    onClick={() => toggleSort("frequency")}
                    className="group ml-auto flex items-center gap-1.5 font-medium hover:text-foreground transition-colors"
                  >
                    <span>Frekvencija</span>
                    {renderSortIcon("frequency")}
                  </button>
                </TableHead>

                <TableHead className="pr-5 text-right text-text-muted min-w-32">
                  <span>Akcije & Ad setovi</span>
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center text-text-muted">
                    Nema pronađenih kampanja za izabrani period.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => {
                  const sparkValues = row.dailySpend.map((d) => d.spend);
                  return (
                    <TableRow
                      key={row._id}
                      {...activatable(() => onSelectCampaign(row._id))}
                      aria-label={`Otvori kampanju ${row.name}`}
                      className="group cursor-pointer border-line-soft/60 hover:bg-surface-raised/50 transition-colors"
                    >
                      {/* Name, Status dot, Provider badge, Objective, Freshness, Impression Share */}
                      <TableCell className="pl-5 py-3.5">
                        <div className="flex items-start gap-2.5">
                          <span
                            className={cn(
                              "mt-1 size-2 rounded-full shrink-0",
                              row.status === "ACTIVE" ? "bg-success" : "bg-text-muted",
                            )}
                            aria-label={`Status: ${row.status}`}
                          />

                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-foreground truncate max-w-sm group-hover:text-accent-400 transition-colors">
                                {row.name}
                              </span>

                              {/* Provider Badge */}
                              {row.provider === "google_ads" || row.provider === "google" ? (
                                <span className="inline-flex items-center gap-1 rounded border border-chart-2/40 bg-chart-2/10 px-1.5 py-0.5 text-micro font-semibold text-foreground shrink-0">
                                  Google
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded border border-chart-1/40 bg-chart-1/10 px-1.5 py-0.5 text-micro font-semibold text-foreground shrink-0">
                                  Meta
                                </span>
                              )}

                              {row.syncPriority === "hot" && (
                                <span
                                  className="inline-flex items-center gap-0.5 rounded border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-micro font-medium text-warning shrink-0"
                                  title="Hot kampanja (15 min sync)"
                                >
                                  <Flame className="size-2.5" />
                                  Hot
                                </span>
                              )}
                            </div>

                            <div className="mt-1 flex flex-wrap items-center gap-2 text-micro text-text-muted">
                              <span className="inline-flex items-center gap-1 rounded bg-surface px-1.5 py-0.5 text-text-secondary">
                                <Target className="size-2.5 text-accent-400" />
                                {formatObjective(row.objective)}
                              </span>
                              <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                                <Clock className="size-2.5" />
                                {formatFreshness(row.syncedAt, row.syncPriority)}
                              </span>
                              {row.searchImpressionShare !== undefined && (
                                <span className="inline-flex items-center gap-1 text-micro font-mono text-accent-400 bg-accent-400/10 border border-accent-400/20 px-1.5 py-0.5 rounded">
                                  IS: {formatPercent(row.searchImpressionShare)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </TableCell>

                      {/* Spend */}
                      <TableCell className="text-right font-mono font-semibold tabular-nums text-foreground">
                        {formatNumber(row.spend)} €
                      </TableCell>

                      {/* Sparkline of daily spend */}
                      <TableCell className="text-center">
                        <div className="flex justify-center">
                          <SpendSparkline
                            values={sparkValues}
                            className="text-accent-400/80 group-hover:text-accent-400"
                          />
                        </div>
                      </TableCell>

                      {/* Results */}
                      <TableCell className="text-right font-mono tabular-nums text-foreground">
                        {formatNumber(row.results)}
                      </TableCell>

                      {/* CPA / ROAS (ROAS ONLY when conversionValue > 0) */}
                      <TableCell className="text-right font-mono tabular-nums">
                        <div>
                          <span className="text-foreground">
                            {row.costPerResult > 0 ? `${formatNumber(row.costPerResult)} €` : "—"}
                          </span>
                          {row.hasConversionValue && (
                            <span className="block text-micro font-semibold text-success">
                              {row.roas.toFixed(2)}x
                            </span>
                          )}
                        </div>
                      </TableCell>

                      {/* CTR */}
                      <TableCell className="text-right font-mono tabular-nums text-foreground">
                        {formatPercent(row.ctr)}
                      </TableCell>

                      {/* Frequency */}
                      <TableCell className="text-right font-mono tabular-nums text-foreground">
                        {formatDecimal(row.frequency)}
                      </TableCell>

                      {/* Quick Action Buttons & Ad Sets count */}
                      <TableCell className="pr-5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {/* Row Actions (Stop propagation to prevent row click) */}
                          {row.provider !== "google_ads" && row.provider !== "google" ? (
                            <div
                              className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  setActiveAction({
                                    campaign: row,
                                    actionType:
                                      row.status === "ACTIVE" ? "pause" : "resume",
                                  })
                                }
                                title={
                                  row.status === "ACTIVE"
                                    ? "Pauziraj kampanju"
                                    : "Aktiviraj kampanju"
                                }
                                className={cn(
                                  "flex size-6 items-center justify-center rounded border transition-colors",
                                  row.status === "ACTIVE"
                                    ? "border-line-soft bg-surface text-text-muted hover:border-danger/40 hover:bg-danger/10 hover:text-danger"
                                    : "border-success/30 bg-success/10 text-success hover:bg-success/20",
                                )}
                              >
                                {row.status === "ACTIVE" ? (
                                  <Pause className="size-3" />
                                ) : (
                                  <Play className="size-3" />
                                )}
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  setActiveAction({
                                    campaign: row,
                                    actionType: "budget_change",
                                  })
                                }
                                title="Promeni budžet"
                                className="flex size-6 items-center justify-center rounded border border-line-soft bg-surface text-text-muted hover:border-accent-400/40 hover:bg-accent-400/10 hover:text-accent-400 transition-colors"
                              >
                                <TrendingUp className="size-3" />
                              </button>
                            </div>
                          ) : (
                            <span className="text-micro text-text-muted/60 font-mono px-1">
                              read-only
                            </span>
                          )}

                          <div className="flex items-center gap-1 text-text-muted group-hover:text-foreground transition-colors pl-1 border-l border-line-soft/60">
                            <span className="font-mono tabular-nums text-micro">
                              {row.adSetsCount} {row.adSetsCount === 1 ? (row.provider === "google_ads" ? "grupa" : "set") : (row.provider === "google_ads" ? "grupa" : "setova")}
                            </span>
                            <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
      </div>

      {/* Confirmation & Execution Dialog */}
      {activeAction && (
        <AdActionDialog
          open={activeAction !== null}
          onOpenChange={(open) => !open && setActiveAction(null)}
          actionType={activeAction.actionType}
          targetType="campaign"
          targetId={activeAction.campaign.externalId}
          targetName={activeAction.campaign.name}
          currentStatus={activeAction.campaign.status}
          currentDailyBudget={activeAction.campaign.dailyBudget}
          onOptimisticUpdate={(data) => {
            setOptimisticOverrides((prev) => ({
              ...prev,
              [activeAction.campaign.externalId]: {
                ...prev[activeAction.campaign.externalId],
                ...data,
              },
            }));
          }}
          onRollback={() => {
            setOptimisticOverrides((prev) => {
              const copy = { ...prev };
              delete copy[activeAction.campaign.externalId];
              return copy;
            });
          }}
        />
      )}
    </>
  );
}
