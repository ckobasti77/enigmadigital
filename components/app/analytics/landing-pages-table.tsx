"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Navigation } from "lucide-react";
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

type LandingData = FunctionReturnType<typeof api.analytics.landingPages>;
type LandingRow = LandingData["rows"][number];

type SortKey =
  | "landingPage"
  | "sessions"
  | "engagedSessions"
  | "engagementRate"
  | "bounceRate"
  | "keyEvents";

type Sort = { key: SortKey; dir: "asc" | "desc" };

const DEFAULT_SORT: Sort = { key: "sessions", dir: "desc" };

function compare(a: LandingRow, b: LandingRow, { key, dir }: Sort): number {
  const av = a[key] ?? 0;
  const bv = b[key] ?? 0;
  const c =
    typeof av === "number" && typeof bv === "number"
      ? av - bv
      : String(av).localeCompare(String(bv), "sr-Latn");
  return dir === "asc" ? c : -c;
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
          "inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider transition-colors hover:text-foreground",
          active ? "text-foreground" : "text-muted-foreground",
          align === "right" && "flex-row-reverse",
        )}
      >
        <span>{label}</span>
        <Icon className="h-3 w-3 shrink-0" aria-hidden />
      </button>
    </TableHead>
  );
}

export function LandingPagesTable({ data }: { data: LandingData }) {
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT);

  const { rows, remainder } = useMemo(() => {
    const sorted = [...data.rows].sort((a, b) => compare(a, b, sort));

    const topSessionsSum = data.rows.reduce(
      (sum, r) => sum + r.sessions,
      0,
    );
    const topEngagedSum = data.rows.reduce(
      (sum, r) => sum + r.engagedSessions,
      0,
    );
    const topKeyEventsSum = data.rows.reduce(
      (sum, r) => sum + r.keyEvents,
      0,
    );

    const remainderSessions = Math.max(
      0,
      data.totals.sessions - topSessionsSum,
    );
    const remainderEngaged = Math.max(
      0,
      data.totals.engagedSessions - topEngagedSum,
    );
    const remainderKeyEvents = Math.max(
      0,
      data.totals.keyEvents - topKeyEventsSum,
    );
    const remainderRate =
      remainderSessions > 0 ? remainderEngaged / remainderSessions : 0;

    const hasRemainder =
      data.pageCount > data.rows.length && remainderSessions > 0;

    return {
      rows: sorted,
      remainder: hasRemainder
        ? {
            landingPage: `Ostale ulazne stranice (${data.pageCount - data.rows.length})`,
            sessions: remainderSessions,
            engagedSessions: remainderEngaged,
            engagementRate: remainderRate,
            bounceRate: 1 - remainderRate,
            keyEvents: remainderKeyEvents,
          }
        : null,
    };
  }, [data, sort]);

  function handleSort(key: SortKey) {
    setSort((cur) => {
      if (cur.key === key) {
        return { key, dir: cur.dir === "asc" ? "desc" : "asc" };
      }
      return { key, dir: "desc" };
    });
  }

  const denominator = data.totals.sessions;

  return (
    <Card className="flex flex-col overflow-hidden rounded-2xl border border-line bg-card shadow-sm">
      <div className="flex flex-col gap-1 border-b border-line px-6 py-4">
        <div className="flex items-center gap-2">
          <Navigation className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            Ulazne stranice (Landing Pages)
          </h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Prva stranica na koju korisnici dospevaju prilikom dolaska na sajt (Top{" "}
          {data.rows.length} od ukupno {data.pageCount}).
        </p>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow className="border-line hover:bg-transparent">
              <SortableHead
                label="Ulazna stranica"
                active={sort.key === "landingPage"}
                dir={sort.dir}
                onClick={() => handleSort("landingPage")}
                align="left"
                className="w-[40%]"
              />
              <SortableHead
                label="Sesije"
                active={sort.key === "sessions"}
                dir={sort.dir}
                onClick={() => handleSort("sessions")}
                align="right"
                className="w-[15%]"
              />
              <SortableHead
                label="Angažovane"
                active={sort.key === "engagedSessions"}
                dir={sort.dir}
                onClick={() => handleSort("engagedSessions")}
                align="right"
                className="w-[15%]"
              />
              <SortableHead
                label="Stopa angažovanja"
                active={sort.key === "engagementRate"}
                dir={sort.dir}
                onClick={() => handleSort("engagementRate")}
                align="right"
                className="w-[15%]"
              />
              <SortableHead
                label="Događaji"
                active={sort.key === "keyEvents"}
                dir={sort.dir}
                onClick={() => handleSort("keyEvents")}
                align="right"
                className="w-[15%]"
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-12 text-center text-sm text-muted-foreground"
                >
                  Nema zabeleženih ulaznih sesija u izabranom periodu.
                </TableCell>
              </TableRow>
            ) : (
              <>
                {rows.map((r, idx) => {
                  const sharePct =
                    denominator > 0 ? (r.sessions / denominator) * 100 : 0;
                  return (
                    <TableRow
                      key={`${r.landingPage}-${idx}`}
                      className="border-line/60 transition-colors hover:bg-muted/30"
                    >
                      <TableCell className="py-3 font-medium">
                        <div className="flex flex-col gap-1.5">
                          <span
                            className="truncate text-xs font-mono text-foreground"
                            title={r.landingPage}
                          >
                            {r.landingPage}
                          </span>
                          <div className="h-1.5 w-full max-w-[200px] overflow-hidden rounded-full bg-line/60">
                            <div
                              className="h-full rounded-full bg-primary/70 transition-all duration-300"
                              style={{
                                width: `${Math.min(100, Math.max(2, sharePct))}%`,
                              }}
                            />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-mono text-xs text-foreground">
                        <div>{formatNumber(r.sessions)}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {formatPercent(sharePct / 100)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-mono text-xs text-foreground">
                        {formatNumber(r.engagedSessions)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-mono text-xs text-muted-foreground">
                        <div>{formatPercent(r.engagementRate)}</div>
                        <div className="text-[10px] text-muted-foreground/70">
                          odskok {formatPercent(r.bounceRate)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-mono text-xs text-foreground">
                        {formatNumber(r.keyEvents)}
                      </TableCell>
                    </TableRow>
                  );
                })}

                {remainder && (
                  <TableRow className="border-line/60 bg-muted/10 font-normal italic text-muted-foreground hover:bg-muted/20">
                    <TableCell className="py-3 text-xs">
                      {remainder.landingPage}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-mono text-xs">
                      <div>{formatNumber(remainder.sessions)}</div>
                      <div className="text-[10px]">
                        {formatPercent(
                          denominator > 0 ? remainder.sessions / denominator : 0,
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-mono text-xs">
                      {formatNumber(remainder.engagedSessions)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-mono text-xs">
                      {formatPercent(remainder.engagementRate)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-mono text-xs">
                      {formatNumber(remainder.keyEvents)}
                    </TableCell>
                  </TableRow>
                )}

                <TableRow className="border-t-2 border-line bg-muted/20 font-semibold">
                  <TableCell className="py-3 text-xs uppercase tracking-wider text-foreground">
                    Ukupno ({data.pageCount} stranica)
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-mono text-xs text-foreground">
                    <div>{formatNumber(data.totals.sessions)}</div>
                    <div className="text-[10px] text-muted-foreground">100%</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-mono text-xs text-foreground">
                    {formatNumber(data.totals.engagedSessions)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-mono text-xs text-foreground">
                    <div>{formatPercent(data.totals.engagementRate)}</div>
                    <div className="text-[10px] text-muted-foreground/70">
                      odskok {formatPercent(data.totals.bounceRate)}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-mono text-xs text-foreground">
                    {formatNumber(data.totals.keyEvents)}
                  </TableCell>
                </TableRow>
              </>
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

export function LandingPagesTableSkeleton() {
  return (
    <Card className="flex flex-col gap-4 rounded-2xl border border-line p-6 shadow-sm">
      <Skeleton className="h-5 w-48 rounded" />
      <div className="space-y-3">
        <Skeleton className="h-8 w-full rounded" />
        <Skeleton className="h-10 w-full rounded" />
        <Skeleton className="h-10 w-full rounded" />
        <Skeleton className="h-10 w-full rounded" />
      </div>
    </Card>
  );
}
