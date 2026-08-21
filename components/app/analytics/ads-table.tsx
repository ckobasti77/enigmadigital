"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Info } from "lucide-react";
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
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface AdsTableRow {
  campaign: string;
  keyword?: string;
  cost: number;
  clicks: number;
  impressions?: number;
  sessions: number;
  engagedSessions?: number;
  keyEvents: number;
  costPerClick?: number;
  costPerKeyEvent?: number;
  sessionsPerClick?: number;
}

export interface AdsTableTotals {
  cost: number;
  clicks: number;
  impressions?: number;
  sessions: number;
  engagedSessions?: number;
  keyEvents: number;
  costPerClick?: number;
  costPerKeyEvent?: number;
  sessionsPerClick?: number;
}

type SortKey =
  | "name"
  | "cost"
  | "clicks"
  | "sessions"
  | "sessionsPerClick"
  | "keyEvents"
  | "costPerKeyEvent";

type Sort = { key: SortKey; dir: "asc" | "desc" };

const DEFAULT_SORT: Sort = { key: "cost", dir: "desc" };

function compare(a: AdsTableRow, b: AdsTableRow, { key, dir }: Sort, level: "campaign" | "keyword"): number {
  if (key === "name") {
    const an = level === "keyword" && a.keyword ? `${a.campaign} / ${a.keyword}` : a.campaign;
    const bn = level === "keyword" && b.keyword ? `${b.campaign} / ${b.keyword}` : b.campaign;
    const c = an.localeCompare(bn, "sr-Latn");
    return dir === "asc" ? c : -c;
  }

  const av = a[key] ?? 0;
  const bv = b[key] ?? 0;
  const c = typeof av === "number" && typeof bv === "number" ? av - bv : 0;
  return dir === "asc" ? c : -c;
}

export function AdsTable({
  rows: initialRows,
  totals,
  itemCount,
  level,
  onLevelChange,
  currencyCode,
  thresholdedDays = 0,
}: {
  rows: AdsTableRow[];
  totals: AdsTableTotals;
  itemCount: number;
  level: "campaign" | "keyword";
  onLevelChange: (next: "campaign" | "keyword") => void;
  currencyCode?: string;
  thresholdedDays?: number;
}) {
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT);

  const { rows, remainder } = useMemo(() => {
    const sorted = [...initialRows].sort((a, b) => compare(a, b, sort, level));

    const topCostSum = initialRows.reduce((sum, r) => sum + r.cost, 0);
    const topClicksSum = initialRows.reduce((sum, r) => sum + r.clicks, 0);
    const topSessionsSum = initialRows.reduce((sum, r) => sum + r.sessions, 0);
    const topKeyEventsSum = initialRows.reduce((sum, r) => sum + r.keyEvents, 0);

    const remainderCost = Math.max(0, totals.cost - topCostSum);
    const remainderClicks = Math.max(0, totals.clicks - topClicksSum);
    const remainderSessions = Math.max(0, totals.sessions - topSessionsSum);
    const remainderKeyEvents = Math.max(0, totals.keyEvents - topKeyEventsSum);
    const remainderSessionsPerClick =
      thresholdedDays === 0 && remainderClicks > 0
        ? remainderSessions / remainderClicks
        : undefined;
    const remainderCostPerKeyEvent =
      thresholdedDays === 0 && remainderKeyEvents > 0
        ? remainderCost / remainderKeyEvents
        : undefined;

    const hasRemainder = itemCount > initialRows.length && remainderCost > 0;

    return {
      rows: sorted,
      remainder: hasRemainder
        ? {
            campaign: "Ostalo",
            keyword: level === "keyword" ? "—" : undefined,
            cost: remainderCost,
            clicks: remainderClicks,
            sessions: remainderSessions,
            sessionsPerClick: remainderSessionsPerClick,
            keyEvents: remainderKeyEvents,
            costPerKeyEvent: remainderCostPerKeyEvent,
          }
        : null,
    };
  }, [initialRows, totals, itemCount, sort, level, thresholdedDays]);

  const toggle = (key: SortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "desc" ? "asc" : "desc" }
        : {
            key,
            dir: key === "name" ? "asc" : "desc",
          },
    );

  const isCampaign = level === "campaign";

  return (
    <Card className="gap-0 py-0 shadow-card ring-line">
      {/* Header and Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-5 pt-5 pb-3">
        <div>
          <p className="text-sm font-medium text-foreground">
            {isCampaign ? "Učinak po kampanjama" : "Učinak po ključnim rečima"}
          </p>
          <p className="mt-0.5 text-xs text-text-muted">
            Top {initialRows.length} od {formatNumber(itemCount)}{" "}
            {isCampaign ? "kampanja" : "ključnih reči"} ·{" "}
            {formatCurrency(totals.cost, currencyCode)} ukupne potrošnje
          </p>
        </div>

        {/* Level Toggle */}
        <div className="inline-flex rounded-lg bg-surface-raised p-1 text-xs">
          <button
            type="button"
            onClick={() => onLevelChange("campaign")}
            className={cn(
              "rounded-md px-3 py-1.5 font-medium transition-colors",
              isCampaign
                ? "bg-surface-elevated text-foreground shadow-xs"
                : "text-text-muted hover:text-foreground",
            )}
          >
            Kampanje
          </button>
          <button
            type="button"
            onClick={() => onLevelChange("keyword")}
            className={cn(
              "rounded-md px-3 py-1.5 font-medium transition-colors",
              !isCampaign
                ? "bg-surface-elevated text-foreground shadow-xs"
                : "text-text-muted hover:text-foreground",
            )}
          >
            Ključne reči
          </button>
        </div>
      </div>

      {initialRows.length === 0 ? (
        <p className="border-t border-line-soft px-5 py-8 text-center text-sm text-text-muted">
          Nema podataka o plaćenim oglasima u izabranom periodu.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table className="text-sm">
            <TableHeader>
              <TableRow className="border-line-soft hover:bg-transparent">
                <SortableHead
                  label={isCampaign ? "Kampanja" : "Kampanja / Ključna reč"}
                  active={sort.key === "name"}
                  dir={sort.dir}
                  onClick={() => toggle("name")}
                  className="pl-5 min-w-48"
                />
                <SortableHead
                  label="Potrošnja"
                  active={sort.key === "cost"}
                  dir={sort.dir}
                  onClick={() => toggle("cost")}
                  align="right"
                />
                <SortableHead
                  label="Klikovi"
                  active={sort.key === "clicks"}
                  dir={sort.dir}
                  onClick={() => toggle("clicks")}
                  align="right"
                />
                <SortableHead
                  label="Sesije"
                  active={sort.key === "sessions"}
                  dir={sort.dir}
                  onClick={() => toggle("sessions")}
                  align="right"
                />
                <SortableHead
                  label="Sesije / klik"
                  active={sort.key === "sessionsPerClick"}
                  dir={sort.dir}
                  onClick={() => toggle("sessionsPerClick")}
                  align="right"
                />
                <SortableHead
                  label="Klj. događaji"
                  active={sort.key === "keyEvents"}
                  dir={sort.dir}
                  onClick={() => toggle("keyEvents")}
                  align="right"
                />
                <SortableHead
                  label="Cena / klj. dog."
                  active={sort.key === "costPerKeyEvent"}
                  dir={sort.dir}
                  onClick={() => toggle("costPerKeyEvent")}
                  align="right"
                  className="pr-5 md:pr-2"
                />
                <TableHead className="hidden pr-5 text-right text-xs font-medium text-text-muted md:table-cell">
                  Udeo
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const share = totals.cost > 0 ? row.cost / totals.cost : 0;

                return (
                  <TableRow
                    key={`${row.campaign}-${row.keyword ?? ""}`}
                    className="border-line-soft hover:bg-surface-raised/40"
                  >
                    {/* Name */}
                    <TableCell className="py-3 pl-5 font-mono text-xs text-foreground">
                      <span className="font-semibold">{row.campaign}</span>
                      {row.keyword && (
                        <>
                          <span className="text-text-muted"> / </span>
                          <span className="text-text-muted">{row.keyword}</span>
                        </>
                      )}
                    </TableCell>

                    {/* Cost */}
                    <TableCell className="py-3 text-right font-mono tabular-nums text-foreground font-medium">
                      {formatCurrency(row.cost, currencyCode)}
                    </TableCell>

                    {/* Clicks */}
                    <TableCell className="py-3 text-right font-mono tabular-nums text-text-muted">
                      {formatNumber(row.clicks)}
                    </TableCell>

                    {/* Sessions */}
                    <TableCell className="py-3 text-right font-mono tabular-nums text-foreground">
                      {formatNumber(row.sessions)}
                    </TableCell>

                    {/* Sessions per Click */}
                    <TableCell
                      className="py-3 text-right font-mono tabular-nums text-foreground"
                      title={
                        row.sessionsPerClick === undefined && thresholdedDays > 0
                          ? "Deo dana nije dostupan zbog praga"
                          : undefined
                      }
                    >
                      {row.sessionsPerClick !== undefined
                        ? formatPercent(row.sessionsPerClick)
                        : "—"}
                    </TableCell>

                    {/* Key Events */}
                    <TableCell className="py-3 text-right font-mono tabular-nums text-foreground">
                      {formatNumber(row.keyEvents)}
                    </TableCell>

                    {/* Cost per Key Event */}
                    <TableCell
                      className="py-3 text-right font-mono tabular-nums text-foreground"
                      title={
                        row.costPerKeyEvent === undefined && thresholdedDays > 0
                          ? "Deo dana nije dostupan zbog praga"
                          : undefined
                      }
                    >
                      {row.costPerKeyEvent !== undefined
                        ? formatCurrency(row.costPerKeyEvent, currencyCode)
                        : "—"}
                    </TableCell>

                    {/* Share Bar */}
                    <TableCell className="hidden py-3 pr-5 text-right font-mono tabular-nums text-text-muted md:table-cell">
                      <div className="flex items-center justify-end gap-2">
                        <span className="w-12 text-right">
                          {formatPercent(share)}
                        </span>
                        <span
                          className="h-1.5 w-16 overflow-hidden rounded-full bg-line-soft"
                          aria-hidden
                        >
                          <span
                            className="block h-full rounded-full bg-[var(--chart-1)]"
                            style={{
                              width: `${Math.max(
                                share > 0 ? 4 : 0,
                                share * 100,
                              )}%`,
                            }}
                          />
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}

              {/* Remainder row ("Ostalo") */}
              {remainder && (
                <TableRow className="border-line-soft bg-surface-raised/10 italic hover:bg-surface-raised/30">
                  <TableCell className="py-3 pl-5 font-mono text-xs text-text-muted">
                    <span>{remainder.campaign}</span>
                    <span className="text-micro"> ({itemCount - initialRows.length} stavki)</span>
                  </TableCell>

                  <TableCell className="py-3 text-right font-mono tabular-nums text-text-muted font-medium">
                    {formatCurrency(remainder.cost, currencyCode)}
                  </TableCell>

                  <TableCell className="py-3 text-right font-mono tabular-nums text-text-muted">
                    {formatNumber(remainder.clicks)}
                  </TableCell>

                  <TableCell className="py-3 text-right font-mono tabular-nums text-text-muted">
                    {formatNumber(remainder.sessions)}
                  </TableCell>

                  <TableCell className="py-3 text-right font-mono tabular-nums text-text-muted">
                    {remainder.sessionsPerClick !== undefined
                      ? formatPercent(remainder.sessionsPerClick)
                      : "—"}
                  </TableCell>

                  <TableCell className="py-3 text-right font-mono tabular-nums text-text-muted">
                    {formatNumber(remainder.keyEvents)}
                  </TableCell>

                  <TableCell className="py-3 text-right font-mono tabular-nums text-text-muted">
                    {remainder.costPerKeyEvent !== undefined
                      ? formatCurrency(remainder.costPerKeyEvent, currencyCode)
                      : "—"}
                  </TableCell>

                  <TableCell className="hidden py-3 pr-5 text-right font-mono tabular-nums text-text-muted md:table-cell">
                    <div className="flex items-center justify-end gap-2">
                      <span className="w-12 text-right">
                        {formatPercent(
                          totals.cost > 0
                            ? remainder.cost / totals.cost
                            : 0,
                        )}
                      </span>
                      <span
                        className="h-1.5 w-16 overflow-hidden rounded-full bg-line-soft"
                        aria-hidden
                      >
                        <span
                          className="block h-full rounded-full bg-text-muted/50"
                          style={{
                            width: `${Math.max(
                              remainder.cost > 0 ? 4 : 0,
                              (remainder.cost / totals.cost) * 100,
                            )}%`,
                          }}
                        />
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              )}

              {/* Totals Row */}
              <TableRow className="border-t border-line bg-surface-raised/20 font-semibold hover:bg-surface-raised/30">
                <TableCell className="py-3 pl-5 text-foreground">
                  Ukupno (svi oglasi)
                </TableCell>
                <TableCell className="py-3 text-right font-mono tabular-nums text-foreground">
                  {formatCurrency(totals.cost, currencyCode)}
                </TableCell>
                <TableCell className="py-3 text-right font-mono tabular-nums text-foreground">
                  {formatNumber(totals.clicks)}
                </TableCell>
                <TableCell className="py-3 text-right font-mono tabular-nums text-foreground">
                  {formatNumber(totals.sessions)}
                </TableCell>
                <TableCell className="py-3 text-right font-mono tabular-nums text-foreground">
                  {totals.sessionsPerClick !== undefined
                    ? formatPercent(totals.sessionsPerClick)
                    : "—"}
                </TableCell>
                <TableCell className="py-3 text-right font-mono tabular-nums text-foreground">
                  {formatNumber(totals.keyEvents)}
                </TableCell>
                <TableCell className="py-3 text-right font-mono tabular-nums text-foreground">
                  {totals.costPerKeyEvent !== undefined
                    ? formatCurrency(totals.costPerKeyEvent, currencyCode)
                    : "—"}
                </TableCell>
                <TableCell className="hidden py-3 pr-5 text-right font-mono tabular-nums text-text-muted md:table-cell">
                  100%
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}

      {/* Mandatory Disclaimer Note & Currency notice (Section 6.3 e / A7 F3) */}
      <div className="border-t border-line-soft bg-surface-raised/30 px-5 py-3.5 space-y-2">
        {!currencyCode && (
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <Info className="size-3.5 shrink-0" aria-hidden />
            <span>Valuta propertije još nije poznata.</span>
          </div>
        )}
        <div className="flex items-start gap-2.5 text-xs text-text-muted">
          <Info className="mt-0.5 size-3.5 shrink-0 text-text-muted" aria-hidden />
          <p className="leading-relaxed">
            Klikovi ovde dolaze iz Google Ads-a, a sesije iz GA4. Brojevi se neće
            poklapati sa ekranom Oglasi — klik i sesija se broje drugačije. Odnos
            sesija po kliku pokazuje koliko klikova stvarno stigne do sajta.
          </p>
        </div>
      </div>
    </Card>
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
  dir: "asc" | "desc";
  onClick: () => void;
  align?: "left" | "right";
  className?: string;
}) {
  const Icon = active ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <TableHead className={cn(align === "right" && "text-right", className)}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1 text-xs font-medium transition-colors hover:text-foreground",
          active ? "text-foreground" : "text-text-muted",
          align === "right" && "flex-row-reverse",
        )}
      >
        <span>{label}</span>
        <Icon className="size-3 shrink-0" aria-hidden />
      </button>
    </TableHead>
  );
}

export function AdsTableSkeleton() {
  return (
    <Card className="gap-0 py-0 shadow-card ring-line">
      <div className="flex justify-between items-center px-5 pt-5 pb-3">
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-48" />
        </div>
        <Skeleton className="h-8 w-44 rounded-lg" />
      </div>
      <div className="p-5 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex justify-between items-center">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </Card>
  );
}
