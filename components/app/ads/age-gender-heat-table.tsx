"use client";

import { useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNumber, formatPercent } from "@/lib/format";
import { formatMetric } from "@/convex/lib/metaAdsFormat";
import { resolveMetric } from "@/convex/lib/metaAdsCatalog";
import { cn } from "@/lib/utils";

const spendDef = resolveMetric("spend")!;

type CellMetric = "spend" | "impressions" | "ctr" | "results";

export type AgeGenderRow = {
  age: string;
  female: { spend: number; impressions: number; clicks: number; results: number; ctr: number };
  male: { spend: number; impressions: number; clicks: number; results: number; ctr: number };
  unknown: { spend: number; impressions: number; clicks: number; results: number; ctr: number };
  total: { spend: number; impressions: number; clicks: number; results: number; ctr: number };
};

export function AgeGenderHeatTable({
  data,
  currencyCode,
}: {
  data: AgeGenderRow[];
  currencyCode?: string;
}) {
  const [metric, setMetric] = useState<CellMetric>("spend");

  const maxValue = useMemo(() => {
    let max = 0;
    for (const row of data) {
      const fVal = row.female[metric];
      const mVal = row.male[metric];
      const uVal = row.unknown[metric];
      if (fVal > max) max = fVal;
      if (mVal > max) max = mVal;
      if (uVal > max) max = uVal;
    }
    return max > 0 ? max : 1;
  }, [data, metric]);

  const formatVal = (val: number) => {
    if (metric === "spend") return formatMetric(val, spendDef, currencyCode);
    if (metric === "ctr") return formatPercent(val);
    return formatNumber(val);
  };

  const getHeatStyle = (val: number) => {
    if (val <= 0) return { backgroundColor: "transparent" };
    const ratio = Math.min(1, Math.max(0.06, val / maxValue));
    return {
      backgroundColor: `rgba(56, 189, 248, ${(ratio * 0.28).toFixed(3)})`,
    };
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-text-muted">
          Prikaz raspodele po starosnim grupama i polu.
        </p>
        <div className="flex items-center gap-1 rounded-lg border border-line bg-card p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setMetric("spend")}
            className={cn(
              "rounded px-2 py-1 transition-colors",
              metric === "spend"
                ? "bg-surface-raised font-medium text-accent-400"
                : "text-text-muted hover:text-foreground",
            )}
          >
            Potrošnja
          </button>
          <button
            type="button"
            onClick={() => setMetric("impressions")}
            className={cn(
              "rounded px-2 py-1 transition-colors",
              metric === "impressions"
                ? "bg-surface-raised font-medium text-accent-400"
                : "text-text-muted hover:text-foreground",
            )}
          >
            Impresije
          </button>
          <button
            type="button"
            onClick={() => setMetric("ctr")}
            className={cn(
              "rounded px-2 py-1 transition-colors",
              metric === "ctr"
                ? "bg-surface-raised font-medium text-accent-400"
                : "text-text-muted hover:text-foreground",
            )}
          >
            CTR
          </button>
          <button
            type="button"
            onClick={() => setMetric("results")}
            className={cn(
              "rounded px-2 py-1 transition-colors",
              metric === "results"
                ? "bg-surface-raised font-medium text-accent-400"
                : "text-text-muted hover:text-foreground",
            )}
          >
            Rezultati
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-line-soft">
        <Table className="text-xs">
          <TableHeader>
            <TableRow className="border-line-soft bg-surface-raised/40 hover:bg-transparent">
              <TableHead className="w-28 pl-4 text-text-muted">Starost</TableHead>
              <TableHead className="text-right text-text-muted">Žene</TableHead>
              <TableHead className="text-right text-text-muted">Muškarci</TableHead>
              <TableHead className="text-right text-text-muted">Nepoznato</TableHead>
              <TableHead className="pr-4 text-right font-medium text-foreground">Ukupno</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-text-muted">
                  Nema podataka o starosti i polu za izabrani period.
                </TableCell>
              </TableRow>
            ) : (
              data.map((row) => {
                const fVal = row.female[metric];
                const mVal = row.male[metric];
                const uVal = row.unknown[metric];
                const tVal = row.total[metric];

                return (
                  <TableRow key={row.age} className="border-line-soft/60 hover:bg-surface-raised/30">
                    <TableCell className="pl-4 font-mono font-medium text-foreground">
                      {row.age}
                    </TableCell>
                    <TableCell
                      className="text-right font-mono tabular-nums text-foreground transition-colors"
                      style={getHeatStyle(fVal)}
                    >
                      {fVal > 0 ? formatVal(fVal) : "—"}
                    </TableCell>
                    <TableCell
                      className="text-right font-mono tabular-nums text-foreground transition-colors"
                      style={getHeatStyle(mVal)}
                    >
                      {mVal > 0 ? formatVal(mVal) : "—"}
                    </TableCell>
                    <TableCell
                      className="text-right font-mono tabular-nums text-text-muted transition-colors"
                      style={getHeatStyle(uVal)}
                    >
                      {uVal > 0 ? formatVal(uVal) : "—"}
                    </TableCell>
                    <TableCell className="pr-4 text-right font-mono font-semibold tabular-nums text-foreground bg-surface-raised/20">
                      {tVal > 0 ? formatVal(tVal) : "—"}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
