"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNumber, formatPercent } from "@/lib/format";
import { Smartphone, Sparkles, Video, Globe, LayoutGrid } from "lucide-react";

export type PlacementRow = {
  placement: string;
  platform: string;
  spend: number;
  impressions: number;
  clicks: number;
  results: number;
  ctr: number;
  cpc: number;
  cpa: number;
};

function formatPlacementName(platform: string, placement: string): { name: string; icon: typeof Smartphone } {
  const p = platform.toLowerCase();
  const pl = placement.toLowerCase();

  if (p.includes("instagram") || p === "ig") {
    if (pl.includes("reel")) return { name: "Instagram Reels", icon: Video };
    if (pl.includes("story") || pl.includes("stories")) return { name: "Instagram Stories", icon: Sparkles };
    if (pl.includes("feed")) return { name: "Instagram Feed", icon: LayoutGrid };
    if (pl.includes("explore")) return { name: "Instagram Explore", icon: Globe };
    return { name: `Instagram · ${placement}`, icon: Smartphone };
  }

  if (p.includes("facebook") || p === "fb") {
    if (pl.includes("feed")) return { name: "Facebook Feed", icon: LayoutGrid };
    if (pl.includes("reel")) return { name: "Facebook Reels", icon: Video };
    if (pl.includes("story") || pl.includes("stories")) return { name: "Facebook Stories", icon: Sparkles };
    if (pl.includes("video")) return { name: "Facebook Video Feeds", icon: Video };
    return { name: `Facebook · ${placement}`, icon: Smartphone };
  }

  if (p.includes("audience")) {
    return { name: "Audience Network", icon: Globe };
  }

  return { name: `${platform} / ${placement}`, icon: Smartphone };
}

export function PlacementBreakdown({ data }: { data: PlacementRow[] }) {
  const totalSpend = data.reduce((acc, r) => acc + r.spend, 0);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-text-muted">
        Učinak po platformama i pozicijama plasiranja.
      </p>

      <div className="overflow-x-auto rounded-lg border border-line-soft">
        <Table className="text-xs">
          <TableHeader>
            <TableRow className="border-line-soft bg-surface-raised/40 hover:bg-transparent">
              <TableHead className="pl-4 min-w-44 text-text-muted">Pozicija / Platforma</TableHead>
              <TableHead className="text-right text-text-muted">Potrošnja</TableHead>
              <TableHead className="text-right text-text-muted">Udeo</TableHead>
              <TableHead className="text-right text-text-muted">Impresije</TableHead>
              <TableHead className="text-right text-text-muted">Klikovi</TableHead>
              <TableHead className="text-right text-text-muted">CTR</TableHead>
              <TableHead className="text-right text-text-muted">CPC</TableHead>
              <TableHead className="pr-4 text-right text-text-muted">Rezultati (CPA)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-text-muted">
                  Nema podataka o pozicijama za izabrani period.
                </TableCell>
              </TableRow>
            ) : (
              data.map((row, idx) => {
                const { name, icon: Icon } = formatPlacementName(row.platform, row.placement);
                const share = totalSpend > 0 ? (row.spend / totalSpend) * 100 : 0;

                return (
                  <TableRow key={`${row.platform}-${row.placement}-${idx}`} className="border-line-soft/60 hover:bg-surface-raised/30">
                    <TableCell className="pl-4">
                      <div className="flex items-center gap-2">
                        <Icon className="size-3.5 shrink-0 text-accent-400" />
                        <span className="font-medium text-foreground">{name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-foreground">
                      {formatNumber(row.spend)} €
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-text-muted">
                      <div className="flex items-center justify-end gap-1.5">
                        <div className="h-1.5 w-12 overflow-hidden rounded-full bg-surface-raised">
                          <div
                            className="h-full bg-accent-400"
                            style={{ width: `${Math.min(100, Math.max(0, share))}%` }}
                          />
                        </div>
                        <span>{share.toFixed(1)}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-foreground">
                      {formatNumber(row.impressions)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-foreground">
                      {formatNumber(row.clicks)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-foreground">
                      {formatPercent(row.ctr)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-text-muted">
                      {row.cpc > 0 ? `${formatNumber(row.cpc)} €` : "—"}
                    </TableCell>
                    <TableCell className="pr-4 text-right font-mono tabular-nums text-foreground">
                      {row.results > 0 ? (
                        <span>
                          {formatNumber(row.results)} ·{" "}
                          <span className="text-text-muted">{formatNumber(row.cpa)} €</span>
                        </span>
                      ) : (
                        "0"
                      )}
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
