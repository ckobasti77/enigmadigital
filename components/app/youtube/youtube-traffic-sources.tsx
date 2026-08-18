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
import { formatNumber, formatPercent, formatWatchTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type TrafficSourceRow = FunctionReturnType<
  typeof api.youtubeStore.trafficSources
>[number];

/**
 * `insightTrafficSourceType` values the Analytics API returns. Anything not
 * listed falls back to a prettified raw key, so a new source type shows up
 * readable instead of disappearing.
 */
const SOURCE_LABELS: Record<string, string> = {
  ADVERTISING: "Oglasi",
  ANNOTATION: "Napomene",
  CAMPAIGN_CARD: "Kartica kampanje",
  END_SCREEN: "Završni ekran",
  EXT_URL: "Spoljni sajtovi",
  HASHTAGS: "Heštegovi",
  IMMERSIVE: "Immersive",
  LIVE_REDIRECT: "Preusmerenje uživo",
  NO_LINK_EMBEDDED: "Ugrađeni plejer",
  NO_LINK_OTHER: "Direktno / nepoznato",
  NOTIFICATION: "Obaveštenja",
  PLAYLIST: "Plejliste",
  PRODUCT_PAGE: "Stranica proizvoda",
  PROMOTED: "Promovisano",
  RELATED_VIDEO: "Povezani video",
  SHORTS: "Shorts feed",
  SOUND_PAGE: "Stranica zvuka",
  SUBSCRIBER: "Feed pretplatnika",
  SUGGESTED_VIDEO: "Predloženi video",
  VIDEO_REMIXES: "Remiksovi",
  YT_CHANNEL: "Stranice kanala",
  YT_OTHER_PAGE: "Ostale YouTube stranice",
  YT_PLAYLIST_PAGE: "Stranica plejliste",
  YT_SEARCH: "YouTube pretraga",
};

function sourceLabel(sourceType: string): string {
  const known = SOURCE_LABELS[sourceType];
  if (known) return known;
  const words = sourceType.toLowerCase().split("_").join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

type SortKey = "sourceType" | "views" | "estimatedMinutesWatched";
type Sort = { key: SortKey; dir: "asc" | "desc" };

const DEFAULT_SORT: Sort = { key: "views", dir: "desc" };

function compare(
  a: TrafficSourceRow,
  b: TrafficSourceRow,
  { key, dir }: Sort,
): number {
  const c =
    key === "sourceType"
      ? sourceLabel(a.sourceType).localeCompare(
          sourceLabel(b.sourceType),
          "sr-Latn",
        )
      : a[key] - b[key];
  return dir === "asc" ? c : -c;
}

/**
 * Where the views came from over the whole period, sortable on every column,
 * with a share bar (this source's views ÷ every synced source's views).
 */
export function YouTubeTrafficSources({
  sources,
}: {
  sources: TrafficSourceRow[];
}) {
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT);

  const rows = useMemo(
    () => [...sources].sort((a, b) => compare(a, b, sort)),
    [sources, sort],
  );

  const totalViews = useMemo(
    () => sources.reduce((acc, s) => acc + s.views, 0),
    [sources],
  );

  const toggle = (key: SortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "desc" ? "asc" : "desc" }
        : { key, dir: key === "sourceType" ? "asc" : "desc" },
    );

  return (
    <Card className="gap-0 py-0 shadow-card ring-line">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-5 pb-3">
        <p className="text-sm font-medium text-foreground">Izvori pregleda</p>
        <p className="font-mono text-xs tabular-nums text-text-muted">
          {rows.length} {rows.length === 1 ? "izvor" : "izvora"} ·{" "}
          {formatNumber(totalViews)} pregleda
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="border-t border-line-soft px-5 py-8 text-center text-sm text-muted-foreground">
          Nema izvora pregleda u izabranom periodu.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table className="text-sm">
            <TableHeader>
              <TableRow className="border-line-soft hover:bg-transparent">
                <SortableHead
                  label="Izvor"
                  active={sort.key === "sourceType"}
                  dir={sort.dir}
                  onClick={() => toggle("sourceType")}
                  className="pl-5"
                />
                <SortableHead
                  label="Pregledi"
                  active={sort.key === "views"}
                  dir={sort.dir}
                  onClick={() => toggle("views")}
                  align="right"
                />
                <SortableHead
                  label="Vreme gledanja"
                  active={sort.key === "estimatedMinutesWatched"}
                  dir={sort.dir}
                  onClick={() => toggle("estimatedMinutesWatched")}
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
                const share = totalViews > 0 ? row.views / totalViews : 0;
                return (
                  <TableRow
                    key={row.sourceType}
                    className="border-line-soft hover:bg-surface-raised/40"
                  >
                    <TableCell className="max-w-56 truncate py-2.5 pl-5 text-foreground">
                      {sourceLabel(row.sourceType)}
                      <span className="block text-xs text-text-muted md:hidden">
                        {formatPercent(share)} pregleda
                      </span>
                    </TableCell>
                    <TableCell className="py-2.5 text-right font-mono tabular-nums text-foreground">
                      {formatNumber(row.views)}
                    </TableCell>
                    <TableCell className="py-2.5 pr-5 text-right font-mono tabular-nums text-muted-foreground md:pr-2">
                      {formatWatchTime(row.estimatedMinutesWatched)}
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

export function YouTubeTrafficSourcesSkeleton() {
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
            <Skeleton className="h-3.5 w-14" />
            <Skeleton className="hidden h-1.5 w-16 md:block" />
          </div>
        ))}
      </div>
    </Card>
  );
}
