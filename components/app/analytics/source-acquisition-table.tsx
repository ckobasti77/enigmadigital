"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
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
import { formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

type SourceData = FunctionReturnType<typeof api.analytics.acquisitionBySource>;
type SourceRow = SourceData["rows"][number];

type SortKey =
  | "source"
  | "medium"
  | "primaryValue"
  | "secondaryValue"
  | "keyEvents"
  | "engagementRate";

type Sort = { key: SortKey; dir: "asc" | "desc" };

const DEFAULT_SORT: Sort = { key: "primaryValue", dir: "desc" };

function compare(a: SourceRow, b: SourceRow, { key, dir }: Sort): number {
  const av = a[key] ?? 0;
  const bv = b[key] ?? 0;
  const c =
    typeof av === "number" && typeof bv === "number"
      ? av - bv
      : String(av).localeCompare(String(bv), "sr-Latn");
  return dir === "asc" ? c : -c;
}

export function SourceAcquisitionTable({
  data,
  scope,
  onScopeChange,
}: {
  data: SourceData;
  scope: "first" | "session";
  onScopeChange: (next: "first" | "session") => void;
}) {
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT);

  const { rows, remainder } = useMemo(() => {
    const sorted = [...data.rows].sort((a, b) => compare(a, b, sort));

    const topPrimarySum = data.rows.reduce(
      (sum, r) => sum + r.primaryValue,
      0,
    );
    const topSecondarySum = data.rows.reduce(
      (sum, r) => sum + r.secondaryValue,
      0,
    );
    const topKeyEventsSum = data.rows.reduce(
      (sum, r) => sum + r.keyEvents,
      0,
    );

    const remainderPrimary = Math.max(0, data.totalPrimary - topPrimarySum);
    const remainderSecondary = Math.max(0, data.totalSecondary - topSecondarySum);
    const remainderKeyEvents = Math.max(0, data.totalKeyEvents - topKeyEventsSum);
    const remainderEngagementRate =
      remainderPrimary > 0 ? remainderSecondary / remainderPrimary : undefined;

    const hasRemainder = data.pairCount > data.rows.length && remainderPrimary > 0;

    return {
      rows: sorted,
      remainder: hasRemainder
        ? {
            source: "Ostalo",
            medium: "—",
            primaryValue: remainderPrimary,
            secondaryValue: remainderSecondary,
            keyEvents: remainderKeyEvents,
            engagementRate: remainderEngagementRate,
          }
        : null,
    };
  }, [data, sort]);

  const toggle = (key: SortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "desc" ? "asc" : "desc" }
        : {
            key,
            dir:
              key === "primaryValue" ||
              key === "secondaryValue" ||
              key === "keyEvents" ||
              key === "engagementRate"
                ? "desc"
                : "asc",
          },
    );

  const isFirst = scope === "first";

  return (
    <Card className="gap-0 py-0 shadow-card ring-line">
      {/* Header with Title and Scope Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-5 pt-5 pb-3">
        <div>
          <p className="text-sm font-medium text-foreground">
            Izvori i medijumi saobraćaja
          </p>
          <p className="mt-0.5 text-xs text-text-muted">
            Top {data.rows.length} od {formatNumber(data.pairCount)} parova ·{" "}
            {formatNumber(data.totalPrimary)}{" "}
            {isFirst ? "novih korisnika" : "sesija"} ukupno
          </p>
        </div>

        {/* Scope Toggle */}
        <div className="inline-flex rounded-lg bg-surface-raised p-1 text-xs">
          <button
            type="button"
            onClick={() => onScopeChange("first")}
            className={cn(
              "rounded-md px-3 py-1.5 font-medium transition-colors",
              isFirst
                ? "bg-surface-elevated text-foreground shadow-xs"
                : "text-text-muted hover:text-foreground",
            )}
          >
            Prvi dodir (Korisnik)
          </button>
          <button
            type="button"
            onClick={() => onScopeChange("session")}
            className={cn(
              "rounded-md px-3 py-1.5 font-medium transition-colors",
              !isFirst
                ? "bg-surface-elevated text-foreground shadow-xs"
                : "text-text-muted hover:text-foreground",
            )}
          >
            Ova poseta (Sesija)
          </button>
        </div>
      </div>

      {data.rows.length === 0 ? (
        <p className="border-t border-line-soft px-5 py-8 text-center text-sm text-muted-foreground">
          Nema podataka o izvorima u izabranom periodu.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table className="text-sm">
            <TableHeader>
              <TableRow className="border-line-soft hover:bg-transparent">
                <SortableHead
                  label="Izvor / medijum"
                  active={sort.key === "source"}
                  dir={sort.dir}
                  onClick={() => toggle("source")}
                  className="pl-5 min-w-44"
                />
                <SortableHead
                  label={isFirst ? "Novi korisnici" : "Sesije"}
                  active={sort.key === "primaryValue"}
                  dir={sort.dir}
                  onClick={() => toggle("primaryValue")}
                  align="right"
                />
                <SortableHead
                  label={isFirst ? "Ukupno korisnika" : "Angažovane sesije"}
                  active={sort.key === "secondaryValue"}
                  dir={sort.dir}
                  onClick={() => toggle("secondaryValue")}
                  align="right"
                />
                {!isFirst && (
                  <SortableHead
                    label="Stopa angaž."
                    active={sort.key === "engagementRate"}
                    dir={sort.dir}
                    onClick={() => toggle("engagementRate")}
                    align="right"
                  />
                )}
                <SortableHead
                  label="Ključni događaji"
                  active={sort.key === "keyEvents"}
                  dir={sort.dir}
                  onClick={() => toggle("keyEvents")}
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
                const share =
                  data.totalPrimary > 0
                    ? row.primaryValue / data.totalPrimary
                    : 0;

                return (
                  <TableRow
                    key={`${row.source}-${row.medium}`}
                    className="border-line-soft hover:bg-surface-raised/40"
                  >
                    <TableCell className="py-3 pl-5 font-mono text-xs text-foreground">
                      <span className="font-semibold">{row.source}</span>
                      <span className="text-text-muted"> / </span>
                      <span className="text-text-muted">{row.medium}</span>
                    </TableCell>

                    <TableCell className="py-3 text-right font-mono tabular-nums text-foreground font-medium">
                      {formatNumber(row.primaryValue)}
                    </TableCell>

                    <TableCell className="py-3 text-right font-mono tabular-nums text-text-muted">
                      {formatNumber(row.secondaryValue)}
                    </TableCell>

                    {!isFirst && (
                      <TableCell className="py-3 text-right font-mono tabular-nums text-foreground">
                        {row.engagementRate !== undefined
                          ? formatPercent(row.engagementRate)
                          : "—"}
                      </TableCell>
                    )}

                    <TableCell className="py-3 text-right font-mono tabular-nums text-foreground">
                      {formatNumber(row.keyEvents)}
                    </TableCell>

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
                            className={cn(
                              "block h-full rounded-full",
                              isFirst ? "bg-[var(--chart-1)]" : "bg-[var(--chart-2)]",
                            )}
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
                    <span>{remainder.source}</span>
                    <span className="text-micro"> ({data.pairCount - data.rows.length} parova)</span>
                  </TableCell>

                  <TableCell className="py-3 text-right font-mono tabular-nums text-text-muted font-medium">
                    {formatNumber(remainder.primaryValue)}
                  </TableCell>

                  <TableCell className="py-3 text-right font-mono tabular-nums text-text-muted">
                    {formatNumber(remainder.secondaryValue)}
                  </TableCell>

                  {!isFirst && (
                    <TableCell className="py-3 text-right font-mono tabular-nums text-text-muted">
                      {remainder.engagementRate !== undefined
                        ? formatPercent(remainder.engagementRate)
                        : "—"}
                    </TableCell>
                  )}

                  <TableCell className="py-3 text-right font-mono tabular-nums text-text-muted">
                    {formatNumber(remainder.keyEvents)}
                  </TableCell>

                  <TableCell className="hidden py-3 pr-5 text-right font-mono tabular-nums text-text-muted md:table-cell">
                    <div className="flex items-center justify-end gap-2">
                      <span className="w-12 text-right">
                        {formatPercent(
                          data.totalPrimary > 0
                            ? remainder.primaryValue / data.totalPrimary
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
                              remainder.primaryValue > 0 ? 4 : 0,
                              (remainder.primaryValue / data.totalPrimary) * 100,
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
                  Ukupno (svi izvori)
                </TableCell>
                <TableCell className="py-3 text-right font-mono tabular-nums text-foreground">
                  {formatNumber(data.totalPrimary)}
                </TableCell>
                <TableCell className="py-3 text-right font-mono tabular-nums text-foreground">
                  {formatNumber(data.totalSecondary)}
                </TableCell>
                {!isFirst && (
                  <TableCell className="py-3 text-right font-mono tabular-nums text-foreground">
                    {data.totalPrimary > 0
                      ? formatPercent(data.totalSecondary / data.totalPrimary)
                      : "—"}
                  </TableCell>
                )}
                <TableCell className="py-3 text-right font-mono tabular-nums text-foreground">
                  {formatNumber(data.totalKeyEvents)}
                </TableCell>
                <TableCell className="hidden py-3 pr-5 text-right font-mono tabular-nums text-text-muted md:table-cell">
                  100%
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}
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

export function SourceAcquisitionSkeleton() {
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
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex justify-between items-center">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </Card>
  );
}
