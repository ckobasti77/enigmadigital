"use client";

import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  AlertTriangle,
  HelpCircle,
} from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { StatusPill } from "@/components/app/settings/status-pill";
import { formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

type AttributionReport = FunctionReturnType<typeof api.attribution.report>;
type CampaignFunnelRow = AttributionReport["campaigns"][number];

type SortKey =
  | "name"
  | "dmsSent"
  | "linkClicks"
  | "ctr"
  | "ga4Sessions"
  | "ga4KeyEvents"
  | "overallConvRate";

type Sort = { key: SortKey; dir: "asc" | "desc" };

const DEFAULT_SORT: Sort = { key: "dmsSent", dir: "desc" };

function compare(
  a: CampaignFunnelRow,
  b: CampaignFunnelRow,
  { key, dir }: Sort,
): number {
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

export function FunnelTable({
  campaigns,
}: {
  campaigns: CampaignFunnelRow[];
}) {
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT);
  const rows = useMemo(
    () => [...campaigns].sort((a, b) => compare(a, b, sort)),
    [campaigns, sort],
  );

  const totalDms = useMemo(
    () => campaigns.reduce((acc, c) => acc + c.dmsSent, 0),
    [campaigns],
  );
  const totalClicks = useMemo(
    () => campaigns.reduce((acc, c) => acc + c.linkClicks, 0),
    [campaigns],
  );
  const totalSessions = useMemo(
    () => campaigns.reduce((acc, c) => acc + c.ga4Sessions, 0),
    [campaigns],
  );
  const totalConversions = useMemo(
    () => campaigns.reduce((acc, c) => acc + c.ga4KeyEvents, 0),
    [campaigns],
  );

  const toggle = (key: SortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "desc" ? "asc" : "desc" }
        : {
            key,
            dir: key === "name" ? "asc" : "desc",
          },
    );

  return (
    <TooltipProvider delay={150}>
      <Card className="gap-0 py-0 shadow-card ring-line">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-5 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-foreground">
                Levak konverzije po kampanjama
              </p>
              <Tooltip>
                <TooltipTrigger>
                  <span className="inline-flex cursor-help text-text-muted hover:text-foreground">
                    <HelpCircle className="size-3.5" aria-hidden />
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  Spaja OpenReply kampanje sa GA4 sesijama preko utm_campaign
                  sluga i utm_medium=openreply-dm parametra.
                </TooltipContent>
              </Tooltip>
            </div>
            <p className="mt-0.5 text-xs text-text-muted">
              DM poruke → Link klikovi (CTR) → GA4 sesije → Web konverzije
            </p>
          </div>
          <p className="font-mono text-xs tabular-nums text-text-muted">
            {formatNumber(rows.length)}{" "}
            {rows.length === 1
              ? "kampanja"
              : rows.length >= 2 && rows.length <= 4
                ? "kampanje"
                : "kampanja"}{" "}
            · {formatNumber(totalDms)} DM · {formatNumber(totalClicks)} klikova ·{" "}
            {formatNumber(totalSessions)} sesija ·{" "}
            {formatNumber(totalConversions)} konverzija
          </p>
        </div>

        {rows.length === 0 ? (
          <p className="border-t border-line-soft px-5 py-8 text-center text-sm text-muted-foreground">
            Nema pronađenih kampanja u sistemu.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table className="text-sm">
              <TableHeader>
                <TableRow className="border-line-soft hover:bg-transparent">
                  <SortableHead
                    label="Kampanja i slug"
                    active={sort.key === "name"}
                    dir={sort.dir}
                    onClick={() => toggle("name")}
                    className="pl-5 min-w-48"
                  />
                  <SortableHead
                    label="1. DM poruke"
                    active={sort.key === "dmsSent"}
                    dir={sort.dir}
                    onClick={() => toggle("dmsSent")}
                    align="right"
                  />
                  <SortableHead
                    label="2. Klikovi (CTR)"
                    active={sort.key === "linkClicks"}
                    dir={sort.dir}
                    onClick={() => toggle("linkClicks")}
                    align="right"
                  />
                  <SortableHead
                    label="3. GA4 sesije"
                    active={sort.key === "ga4Sessions"}
                    dir={sort.dir}
                    onClick={() => toggle("ga4Sessions")}
                    align="right"
                  />
                  <SortableHead
                    label="4. Ključni događaji (GA4)"
                    active={sort.key === "ga4KeyEvents"}
                    dir={sort.dir}
                    onClick={() => toggle("ga4KeyEvents")}
                    align="right"
                  />
                  <SortableHead
                    label="Ukupna stopa"
                    active={sort.key === "overallConvRate"}
                    dir={sort.dir}
                    onClick={() => toggle("overallConvRate")}
                    align="right"
                    className="pr-5"
                  />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  return (
                    <TableRow
                      key={row.orCampaignId}
                      className="border-line-soft hover:bg-surface-raised/40"
                    >
                      {/* Campaign details & slug */}
                      <TableCell className="py-3.5 pl-5">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-foreground">
                              {row.name}
                            </span>
                            {row.active ? (
                              <StatusPill tone="success">Aktivno</StatusPill>
                            ) : (
                              <StatusPill tone="muted">Neaktivno</StatusPill>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 font-mono text-xs text-text-muted">
                            <span className="rounded bg-surface-raised px-1.5 py-0.5 text-micro text-accent-400">
                              {row.slug}
                            </span>
                            {row.keyword && (
                              <>
                                <span>·</span>
                                <span>#{row.keyword}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </TableCell>

                      {/* Stage 1: DM Messages Sent */}
                      <TableCell className="py-3.5 text-right font-mono tabular-nums text-foreground">
                        <div>
                          <span>{formatNumber(row.dmsSent)}</span>
                          <span className="block text-micro text-text-muted">
                            poslato
                          </span>
                        </div>
                      </TableCell>

                      {/* Stage 2: Link Clicks + CTR */}
                      <TableCell className="py-3.5 text-right">
                        <div className="flex flex-col items-end">
                          <span className="font-mono tabular-nums text-foreground">
                            {formatNumber(row.linkClicks)}
                          </span>
                          <span className="font-mono text-micro tabular-nums text-accent-400">
                            {formatPercent(row.ctr)} CTR
                          </span>
                        </div>
                      </TableCell>

                      {/* Stage 3: GA4 Sessions + Drop-off / Mismatch */}
                      <TableCell className="py-3.5 text-right">
                        {row.hasMismatch ? (
                          <div className="flex flex-col items-end gap-1">
                            <span className="font-mono tabular-nums text-text-muted">
                              0
                            </span>
                            <Tooltip>
                              <TooltipTrigger>
                                <span className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-micro font-medium text-warning transition-colors hover:bg-warning/25">
                                  <AlertTriangle className="size-3 shrink-0" />
                                  UTM neslaganje?
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="text-left">
                                <p className="font-medium text-foreground">
                                  Nisu pronađene GA4 sesije
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Kampanja beleži {formatNumber(row.linkClicks)}{" "}
                                  {row.linkClicks === 1
                                    ? "klik"
                                    : row.linkClicks >= 2 && row.linkClicks <= 4
                                      ? "klika"
                                      : "klikova"}{" "}
                                  u OpenReply-u, ali GA4 nema sesije sa{" "}
                                  <code className="rounded bg-surface px-1 text-accent-400">
                                    utm_campaign={row.slug}
                                  </code>{" "}
                                  i{" "}
                                  <code className="rounded bg-surface px-1 text-accent-400">
                                    utm_medium=openreply-dm
                                  </code>
                                  . Proverite link u automatizovanoj poruci.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        ) : !row.hasGa4Data && row.linkClicks === 0 ? (
                          <div className="flex flex-col items-end">
                            <span className="font-mono tabular-nums text-text-muted">
                              —
                            </span>
                            <span className="text-micro text-text-muted">
                              nema klikova
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-end">
                            <span className="font-mono tabular-nums text-foreground">
                              {formatNumber(row.ga4Sessions)}
                            </span>
                            <span className="font-mono text-micro tabular-nums text-text-muted">
                              {row.clickToSessionRate !== null ? (
                                <span className="inline-flex items-center gap-0.5 text-success">
                                  <ArrowRight className="size-2.5" />
                                  {formatPercent(row.clickToSessionRate)}
                                </span>
                              ) : (
                                "—"
                              )}
                            </span>
                          </div>
                        )}
                      </TableCell>

                      {/* Stage 4: GA4 Ključni događaji + Conversion Rate */}
                      <TableCell className="py-3.5 text-right">
                        {!row.hasGa4Data && row.linkClicks === 0 ? (
                          <div className="flex flex-col items-end">
                            <span className="font-mono tabular-nums text-text-muted">
                              —
                            </span>
                            <span className="text-micro text-text-muted">
                              —
                            </span>
                          </div>
                        ) : row.ga4Sessions === 0 ? (
                          <div className="flex flex-col items-end">
                            <span className="font-mono tabular-nums text-text-muted">
                              —
                            </span>
                            <span className="text-micro text-text-muted">
                              0 sesija
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-end">
                            <span
                              className={cn(
                                "font-mono tabular-nums",
                                row.ga4KeyEvents > 0
                                  ? "font-semibold text-accent-400"
                                  : "text-foreground",
                              )}
                            >
                              {formatNumber(row.ga4KeyEvents)}
                            </span>
                            <span className="font-mono text-micro tabular-nums text-text-muted">
                              {row.sessionToConvRate !== null
                                ? `${formatPercent(row.sessionToConvRate)} CR`
                                : "—"}
                            </span>
                          </div>
                        )}
                      </TableCell>

                      {/* Overall Funnel Efficiency: DM -> Conversion */}
                      <TableCell className="py-3.5 pr-5 text-right">
                        {row.overallConvRate !== null && row.dmsSent > 0 ? (
                          <div className="flex flex-col items-end">
                            <span className="font-mono font-medium tabular-nums text-foreground">
                              {formatPercent(row.overallConvRate)}
                            </span>
                            <span className="text-micro text-text-muted">
                              DM → Cilj
                            </span>
                          </div>
                        ) : (
                          <span className="font-mono tabular-nums text-text-muted">
                            —
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </TooltipProvider>
  );
}

function SortableHead({
  label,
  active,
  dir,
  onClick,
  align = "left",
  className,
}: {
  label: string;
  active: boolean;
  dir: Sort["dir"];
  onClick: () => void;
  align?: "left" | "right";
  className?: string;
}) {
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      className={cn("h-10 text-xs font-medium", className)}
    >
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex w-full items-center gap-1 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          align === "right" ? "justify-end" : "justify-start",
          active ? "text-foreground" : "text-text-muted hover:text-foreground",
        )}
      >
        {align === "right" && <Icon className="size-3" aria-hidden />}
        {label}
        {align === "left" && <Icon className="size-3" aria-hidden />}
      </button>
    </TableHead>
  );
}

export function FunnelTableSkeleton() {
  return (
    <Card className="gap-0 py-0 shadow-card ring-line">
      <div className="flex items-baseline justify-between px-5 pt-5 pb-3">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-3 w-48" />
      </div>
      <div className="border-t border-line-soft">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b border-line-soft px-5 py-4 last:border-0"
          >
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </Card>
  );
}
