"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Sparkles } from "lucide-react";
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
import { formatDecimal, formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

type EventsData = FunctionReturnType<typeof api.analytics.eventsByName>;
type EventRow = EventsData["rows"][number];

type SortKey = "eventName" | "eventCount" | "totalUsers" | "eventsPerUser";

type Sort = { key: SortKey; dir: "asc" | "desc" };

const DEFAULT_SORT: Sort = { key: "eventCount", dir: "desc" };

function compare(a: EventRow, b: EventRow, { key, dir }: Sort): number {
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

export function EventsTable({ data }: { data: EventsData }) {
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT);

  const { rows, remainder } = useMemo(() => {
    const sorted = [...data.rows].sort((a, b) => compare(a, b, sort));

    const topCountSum = data.rows.reduce((sum, r) => sum + r.eventCount, 0);
    const topUsersSum = data.rows.reduce((sum, r) => sum + r.totalUsers, 0);
    const topValueSum = data.rows.reduce((sum, r) => sum + r.eventValue, 0);

    const remainderCount = Math.max(0, data.totals.eventCount - topCountSum);
    const remainderUsers = Math.max(0, data.totals.totalUsers - topUsersSum);
    const remainderValue = Math.max(0, data.totals.eventValue - topValueSum);
    const hasRemainder =
      data.eventTypesCount > data.rows.length && remainderCount > 0;

    return {
      rows: sorted,
      remainder: hasRemainder
        ? {
            eventName: `Ostali događaji (${data.eventTypesCount - data.rows.length})`,
            eventCount: remainderCount,
            totalUsers: remainderUsers,
            eventValue: remainderValue,
            eventsPerUser:
              remainderUsers > 0 ? remainderCount / remainderUsers : 0,
            isKeyEvent: false,
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

  const denominator = data.totals.eventCount;

  return (
    <Card className="flex flex-col overflow-hidden rounded-2xl border border-line bg-card shadow-sm">
      <div className="flex flex-col gap-1 border-b border-line px-6 py-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            Događaji
          </h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Broj zabeleženih događaja, korisnici i prosek po korisniku (Top{" "}
          {data.rows.length} od ukupno {data.eventTypesCount}).
        </p>
      </div>

      <div className="border-b border-line bg-surface-raised/20 px-6 py-2.5 text-xs text-muted-foreground">
        Događaj označen kao ključni ulazi u metriku &apos;Ključni događaji&apos;
        na svim ekranima.
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow className="border-line hover:bg-transparent">
              <SortableHead
                label="Naziv događaja"
                active={sort.key === "eventName"}
                dir={sort.dir}
                onClick={() => handleSort("eventName")}
                align="left"
                className="w-[45%]"
              />
              <SortableHead
                label="Broj"
                active={sort.key === "eventCount"}
                dir={sort.dir}
                onClick={() => handleSort("eventCount")}
                align="right"
                className="w-[18%]"
              />
              <SortableHead
                label="Korisnici"
                active={sort.key === "totalUsers"}
                dir={sort.dir}
                onClick={() => handleSort("totalUsers")}
                align="right"
                className="w-[15%]"
              />
              <SortableHead
                label="Događaja po korisniku"
                active={sort.key === "eventsPerUser"}
                dir={sort.dir}
                onClick={() => handleSort("eventsPerUser")}
                align="right"
                className="w-[22%]"
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="py-12 text-center text-sm text-muted-foreground"
                >
                  Nema zabeleženih događaja u izabranom periodu.
                </TableCell>
              </TableRow>
            ) : (
              <>
                {rows.map((r, idx) => {
                  const sharePct =
                    denominator > 0 ? (r.eventCount / denominator) * 100 : 0;
                  return (
                    <TableRow
                      key={`${r.eventName}-${idx}`}
                      className="border-line/60 transition-colors hover:bg-muted/30"
                    >
                      <TableCell className="py-3 font-medium">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-2">
                            <span
                              className="truncate text-xs font-mono text-foreground"
                              title={r.eventName}
                            >
                              {r.eventName}
                            </span>
                            {r.isKeyEvent && (
                              <span className="inline-flex items-center rounded border border-line bg-muted/60 px-1.5 py-0.5 text-[10px] font-sans font-medium text-foreground">
                                Ključni
                              </span>
                            )}
                          </div>
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
                        <div>{formatNumber(r.eventCount)}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {formatPercent(sharePct / 100)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-mono text-xs text-foreground">
                        {formatNumber(r.totalUsers)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-mono text-xs text-foreground">
                        {formatDecimal(r.eventsPerUser)}
                      </TableCell>
                    </TableRow>
                  );
                })}

                {remainder && (
                  <TableRow className="border-line/60 bg-muted/10 font-normal italic text-muted-foreground hover:bg-muted/20">
                    <TableCell className="py-3 text-xs">
                      {remainder.eventName}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-mono text-xs">
                      <div>{formatNumber(remainder.eventCount)}</div>
                      <div className="text-[10px]">
                        {formatPercent(
                          denominator > 0
                            ? remainder.eventCount / denominator
                            : 0,
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-mono text-xs">
                      {formatNumber(remainder.totalUsers)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-mono text-xs">
                      {formatDecimal(remainder.eventsPerUser)}
                    </TableCell>
                  </TableRow>
                )}

                <TableRow className="border-t-2 border-line bg-muted/20 font-semibold">
                  <TableCell className="py-3 text-xs uppercase tracking-wider text-foreground">
                    Ukupno ({data.eventTypesCount} događaja)
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-mono text-xs text-foreground">
                    <div>{formatNumber(data.totals.eventCount)}</div>
                    <div className="text-[10px] text-muted-foreground">100%</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-mono text-xs text-foreground">
                    {formatNumber(data.totals.totalUsers)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-mono text-xs text-foreground">
                    {formatDecimal(data.totals.eventsPerUser)}
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

export function EventsTableSkeleton() {
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
