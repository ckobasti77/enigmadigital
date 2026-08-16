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
import { StatusPill } from "@/components/app/settings/status-pill";
import { formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

type CampaignRow = FunctionReturnType<typeof api.openreplyStore.campaigns>[number];

type SortKey =
  | "name"
  | "keyword"
  | "active"
  | "dmsSent"
  | "dmsFailed"
  | "linkClicks"
  | "ctr";

type Sort = { key: SortKey; dir: "asc" | "desc" };

const DEFAULT_SORT: Sort = { key: "dmsSent", dir: "desc" };

function compare(a: CampaignRow, b: CampaignRow, { key, dir }: Sort): number {
  const av = a[key];
  const bv = b[key];
  let c = 0;
  if (typeof av === "boolean" && typeof bv === "boolean") {
    c = Number(av) - Number(bv);
  } else if (typeof av === "number" && typeof bv === "number") {
    c = av - bv;
  } else {
    c = String(av ?? "").localeCompare(String(bv ?? ""), "sr-Latn");
  }
  return dir === "asc" ? c : -c;
}

export function CampaignsTable({
  campaigns,
}: {
  campaigns: CampaignRow[];
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

  const toggle = (key: SortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "desc" ? "asc" : "desc" }
        : {
            key,
            dir:
              key === "dmsSent" ||
              key === "dmsFailed" ||
              key === "linkClicks" ||
              key === "ctr"
                ? "desc"
                : "asc",
          },
    );

  return (
    <Card className="gap-0 py-0 shadow-card ring-line">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-5 pb-3">
        <p className="text-sm font-medium text-foreground">Kampanje</p>
        <p className="font-mono text-xs tabular-nums text-text-muted">
          {rows.length} {rows.length === 1 ? "kampanja" : "kampanja"} ·{" "}
          {formatNumber(totalDms)} poslatih DM-ova
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="border-t border-line-soft px-5 py-8 text-center text-sm text-muted-foreground">
          Nema pronađenih kampanja.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table className="text-sm">
            <TableHeader>
              <TableRow className="border-line-soft hover:bg-transparent">
                <SortableHead
                  label="Naziv kampanje"
                  active={sort.key === "name"}
                  dir={sort.dir}
                  onClick={() => toggle("name")}
                  className="pl-5"
                />
                <SortableHead
                  label="Ključna reč"
                  active={sort.key === "keyword"}
                  dir={sort.dir}
                  onClick={() => toggle("keyword")}
                  className="hidden sm:table-cell"
                />
                <SortableHead
                  label="Status"
                  active={sort.key === "active"}
                  dir={sort.dir}
                  onClick={() => toggle("active")}
                  className="hidden md:table-cell"
                />
                <SortableHead
                  label="Poslati DM"
                  active={sort.key === "dmsSent"}
                  dir={sort.dir}
                  onClick={() => toggle("dmsSent")}
                  align="right"
                />
                <SortableHead
                  label="Neuspeli"
                  active={sort.key === "dmsFailed"}
                  dir={sort.dir}
                  onClick={() => toggle("dmsFailed")}
                  align="right"
                  className="hidden lg:table-cell"
                />
                <SortableHead
                  label="Klikovi"
                  active={sort.key === "linkClicks"}
                  dir={sort.dir}
                  onClick={() => toggle("linkClicks")}
                  align="right"
                />
                <SortableHead
                  label="CTR"
                  active={sort.key === "ctr"}
                  dir={sort.dir}
                  onClick={() => toggle("ctr")}
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
                const ctrPct = Math.min(100, Math.max(0, row.ctr * 100));
                return (
                  <TableRow
                    key={row.orCampaignId}
                    className="border-line-soft hover:bg-surface-raised/40"
                  >
                    <TableCell className="max-w-56 truncate py-3 pl-5">
                      <span className="font-medium text-foreground">
                        {row.name}
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-xs text-text-muted sm:hidden">
                        <span>{row.keyword || "—"}</span>
                        <span>·</span>
                        <span
                          className={
                            row.active ? "text-success" : "text-text-muted"
                          }
                        >
                          {row.active ? "Aktivno" : "Neaktivno"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden max-w-44 truncate py-3 font-mono text-xs text-muted-foreground sm:table-cell">
                      {row.keyword || "—"}
                    </TableCell>
                    <TableCell className="hidden py-3 md:table-cell">
                      {row.active ? (
                        <StatusPill tone="success">Aktivno</StatusPill>
                      ) : (
                        <StatusPill tone="muted">Neaktivno</StatusPill>
                      )}
                    </TableCell>
                    <TableCell className="py-3 text-right font-mono tabular-nums text-foreground">
                      {formatNumber(row.dmsSent)}
                    </TableCell>
                    <TableCell className="hidden py-3 text-right font-mono tabular-nums text-text-muted lg:table-cell">
                      {formatNumber(row.dmsFailed)}
                    </TableCell>
                    <TableCell className="py-3 text-right font-mono tabular-nums text-foreground">
                      {formatNumber(row.linkClicks)}
                    </TableCell>
                    <TableCell className="py-3 pr-5 text-right font-mono tabular-nums text-foreground md:pr-2">
                      {formatPercent(row.ctr)}
                    </TableCell>
                    <TableCell className="hidden py-3 pr-5 md:table-cell">
                      <div className="flex items-center justify-end gap-2">
                        <span className="font-mono text-xs tabular-nums text-text-muted">
                          {formatPercent(row.ctr)}
                        </span>
                        <span
                          className="h-1.5 w-16 overflow-hidden rounded-full bg-line-soft"
                          aria-hidden
                        >
                          <span
                            className="block h-full rounded-full bg-accent-400"
                            style={{ width: `${Math.max(row.ctr > 0 ? 4 : 0, ctrPct)}%` }}
                          />
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
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

const SKELETON_ROWS = 6;

export function CampaignsTableSkeleton() {
  return (
    <Card className="gap-0 py-0 shadow-card ring-line">
      <div className="flex items-baseline justify-between px-5 pt-5 pb-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3 w-36" />
      </div>
      <div className="border-t border-line-soft">
        {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b border-line-soft px-5 py-3.5 last:border-0"
          >
            <Skeleton className="h-3.5 flex-1" />
            <Skeleton className="hidden h-3.5 w-20 sm:block" />
            <Skeleton className="hidden h-5 w-16 md:block" />
            <Skeleton className="h-3.5 w-12" />
            <Skeleton className="h-3.5 w-12" />
            <Skeleton className="h-3.5 w-12" />
            <Skeleton className="hidden h-1.5 w-16 md:block" />
          </div>
        ))}
      </div>
    </Card>
  );
}
