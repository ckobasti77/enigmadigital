"use client";

import { useMemo } from "react";
import { Globe, MapPin } from "lucide-react";
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

type GeoData = FunctionReturnType<typeof api.analytics.audienceGeo>;

export function GeoRanking({
  data,
  level,
  onLevelChange,
}: {
  data: GeoData;
  level: "country" | "city";
  onLevelChange: (next: "country" | "city") => void;
}) {
  const { rows, remainder } = useMemo(() => {
    const topUsersSum = data.rows.reduce((sum, r) => sum + r.totalUsers, 0);
    const topSessionsSum = data.rows.reduce((sum, r) => sum + r.sessions, 0);
    const topKeyEventsSum = data.rows.reduce(
      (sum, r) => sum + r.keyEvents,
      0,
    );

    const remainderUsers = Math.max(0, data.totals.totalUsers - topUsersSum);
    const remainderSessions = Math.max(
      0,
      data.totals.sessions - topSessionsSum,
    );
    const remainderKeyEvents = Math.max(
      0,
      data.totals.keyEvents - topKeyEventsSum,
    );

    const hasRemainder =
      data.itemCount > data.rows.length && remainderUsers > 0;

    return {
      rows: data.rows,
      remainder: hasRemainder
        ? {
            name: `Ostale lokacije (${data.itemCount - data.rows.length})`,
            totalUsers: remainderUsers,
            sessions: remainderSessions,
            keyEvents: remainderKeyEvents,
          }
        : null,
    };
  }, [data]);

  const denominator = data.totals.totalUsers;

  return (
    <Card className="flex flex-col overflow-hidden rounded-2xl border border-line bg-card shadow-sm">
      <div className="flex flex-col gap-3 border-b border-line px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold tracking-tight text-foreground">
              Geografska distribucija
            </h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Pregled lokacija posetilaca rangiran po broju korisnika (Top{" "}
            {data.rows.length} od ukupno {data.itemCount}).
          </p>
        </div>

        {/* Level Toggle: Država / Grad */}
        <div className="inline-flex rounded-lg border border-line bg-muted/40 p-0.5">
          <button
            type="button"
            onClick={() => onLevelChange("country")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors",
              level === "country"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Globe className="h-3 w-3" />
            <span>Država</span>
          </button>
          <button
            type="button"
            onClick={() => onLevelChange("city")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors",
              level === "city"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <MapPin className="h-3 w-3" />
            <span>Grad</span>
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow className="border-line hover:bg-transparent">
              <TableHead className="w-12 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                #
              </TableHead>
              <TableHead className="w-[45%] text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {level === "country" ? "Država" : "Grad"}
              </TableHead>
              <TableHead className="w-[20%] text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Korisnici
              </TableHead>
              <TableHead className="w-[18%] text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Sesije
              </TableHead>
              <TableHead className="w-[17%] text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Događaji
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-12 text-center text-sm text-muted-foreground"
                >
                  Nema zabeleženih geografskih podataka u izabranom periodu.
                </TableCell>
              </TableRow>
            ) : (
              <>
                {rows.map((r, idx) => {
                  const sharePct =
                    denominator > 0 ? (r.totalUsers / denominator) * 100 : 0;
                  return (
                    <TableRow
                      key={`${r.name}-${idx}`}
                      className="border-line/60 transition-colors hover:bg-muted/30"
                    >
                      <TableCell className="text-center font-mono text-xs text-muted-foreground">
                        {idx + 1}
                      </TableCell>
                      <TableCell className="py-3 font-medium">
                        <div className="flex flex-col gap-1.5">
                          <span className="text-xs font-medium text-foreground">
                            {r.name}
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
                        <div>{formatNumber(r.totalUsers)}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {formatPercent(sharePct / 100)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-mono text-xs text-foreground">
                        {formatNumber(r.sessions)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-mono text-xs text-foreground">
                        {formatNumber(r.keyEvents)}
                      </TableCell>
                    </TableRow>
                  );
                })}

                {remainder && (
                  <TableRow className="border-line/60 bg-muted/10 font-normal italic text-muted-foreground hover:bg-muted/20">
                    <TableCell className="text-center text-xs">—</TableCell>
                    <TableCell className="py-3 text-xs">
                      {remainder.name}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-mono text-xs">
                      <div>{formatNumber(remainder.totalUsers)}</div>
                      <div className="text-[10px]">
                        {formatPercent(
                          denominator > 0
                            ? remainder.totalUsers / denominator
                            : 0,
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-mono text-xs">
                      {formatNumber(remainder.sessions)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-mono text-xs">
                      {formatNumber(remainder.keyEvents)}
                    </TableCell>
                  </TableRow>
                )}

                <TableRow className="border-t-2 border-line bg-muted/20 font-semibold">
                  <TableCell className="text-center text-xs">—</TableCell>
                  <TableCell className="py-3 text-xs uppercase tracking-wider text-foreground">
                    Ukupno ({data.itemCount} {level === "country" ? "država" : "gradova"})
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-mono text-xs text-foreground">
                    <div>{formatNumber(data.totals.totalUsers)}</div>
                    <div className="text-[10px] text-muted-foreground">100%</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-mono text-xs text-foreground">
                    {formatNumber(data.totals.sessions)}
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

      {/* Required Disclaimer Note */}
      <div className="border-t border-line/60 bg-muted/10 px-6 py-2.5 text-[11px] text-muted-foreground">
        * Zbir može biti manji od ukupnog broja korisnika usled zaštite privatnosti ili nepoznatih lokacija.
      </div>
    </Card>
  );
}

export function GeoRankingSkeleton() {
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
