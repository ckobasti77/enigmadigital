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

type Traffic = FunctionReturnType<typeof api.analytics.traffic>;
type Row = Traffic["rows"][number];

type SortKey = "source" | "medium" | "campaign" | "sessions" | "keyEvents";
type Sort = { key: SortKey; dir: "asc" | "desc" };

const DEFAULT_SORT: Sort = { key: "sessions", dir: "desc" };

function compare(a: Row, b: Row, { key, dir }: Sort): number {
  const av = a[key];
  const bv = b[key];
  const c =
    typeof av === "number" && typeof bv === "number"
      ? av - bv
      : String(av).localeCompare(String(bv), "sr-Latn");
  return dir === "asc" ? c : -c;
}

/**
 * Top 20 source / medium / campaign tuples for the period, sortable on every
 * column, with a share bar (sessions ÷ all sessions in the period — the
 * denominator includes rows beyond the top 20).
 */
export function TrafficTable({ traffic }: { traffic: Traffic }) {
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT);
  const rows = useMemo(
    () => [...traffic.rows].sort((a, b) => compare(a, b, sort)),
    [traffic.rows, sort],
  );

  const toggle = (key: SortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "desc" ? "asc" : "desc" }
        : {
            key,
            dir: key === "sessions" || key === "keyEvents" ? "desc" : "asc",
          },
    );

  return (
    <Card className="gap-0 py-0 shadow-card ring-line">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-5 pb-3">
        <p className="text-sm font-medium text-foreground">Izvori saobraćaja</p>
        <p className="font-mono text-xs tabular-nums text-text-muted">
          Top {rows.length} od {formatNumber(traffic.tupleCount)} ·{" "}
          {formatNumber(traffic.totalSessions)} sesija
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="border-t border-line-soft px-5 py-8 text-center text-sm text-muted-foreground">
          Nema saobraćaja u izabranom periodu.
        </p>
      ) : (
        <Table className="text-sm">
          <TableHeader>
            <TableRow className="border-line-soft hover:bg-transparent">
              <SortableHead
                label="Izvor / medij"
                active={sort.key === "source"}
                dir={sort.dir}
                onClick={() => toggle("source")}
                className="pl-5"
              />
              <SortableHead
                label="Kampanja"
                active={sort.key === "campaign"}
                dir={sort.dir}
                onClick={() => toggle("campaign")}
                className="hidden md:table-cell"
              />
              <SortableHead
                label="Sesije"
                active={sort.key === "sessions"}
                dir={sort.dir}
                onClick={() => toggle("sessions")}
                align="right"
              />
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
                traffic.totalSessions > 0
                  ? row.sessions / traffic.totalSessions
                  : 0;
              const count = row.keyEvents;
              return (
                <TableRow
                  key={`${row.source}|${row.medium}|${row.campaign}`}
                  className="border-line-soft hover:bg-surface-raised/40"
                >
                  <TableCell className="max-w-56 truncate py-2.5 pl-5">
                    <span className="text-foreground">{row.source}</span>
                    <span className="text-text-muted"> / {row.medium}</span>
                    <span className="block truncate text-xs text-text-muted md:hidden">
                      {row.campaign}
                    </span>
                  </TableCell>
                  <TableCell className="hidden max-w-48 truncate py-2.5 text-muted-foreground md:table-cell">
                    {row.campaign}
                  </TableCell>
                  <TableCell className="py-2.5 text-right font-mono tabular-nums text-foreground">
                    {formatNumber(row.sessions)}
                  </TableCell>
                  <TableCell className="py-2.5 pr-5 text-right font-mono tabular-nums text-foreground md:pr-2">
                    {formatNumber(count)}
                  </TableCell>
                  <TableCell className="hidden py-2.5 pr-5 md:table-cell">
                    <div className="flex items-center justify-end gap-2">
                      <span className="font-mono text-xs tabular-nums text-text-muted">
                        {formatPercent(share)}
                      </span>
                      <span
                        className="h-1.5 w-16 overflow-hidden rounded-full bg-line-soft"
                        aria-hidden
                      >
                        <span
                          className="block h-full rounded-full bg-foreground/50"
                          style={{ width: `${Math.max(2, share * 100)}%` }}
                        />
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
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
  dir: Sort["dir"];
  onClick: () => void;
  align?: "left" | "right";
  className?: string;
}) {
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      className={cn("h-9 text-xs font-medium", className)}
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

const SKELETON_ROWS = 8;

export function TrafficTableSkeleton() {
  return (
    <Card className="gap-0 py-0 shadow-card ring-line">
      <div className="flex items-baseline justify-between px-5 pt-5 pb-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-40" />
      </div>
      <div className="border-t border-line-soft">
        {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b border-line-soft px-5 py-3 last:border-0"
          >
            <Skeleton className="h-3.5 flex-1" />
            <Skeleton className="h-3.5 w-12" />
            <Skeleton className="h-3.5 w-10" />
            <Skeleton className="hidden h-1.5 w-16 md:block" />
          </div>
        ))}
      </div>
    </Card>
  );
}
