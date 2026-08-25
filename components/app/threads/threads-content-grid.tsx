"use client";

import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ExternalLink,
  Eye,
  Heart,
  MessageCircle,
  Quote,
  Repeat2,
  Share2,
  Trophy,
} from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { CountUp } from "@/components/motion/count-up";
import { Arrive, ArrivalScope } from "@/components/motion/arrive";
import { EmptyState } from "@/components/app/empty-state";
import { formatNumber, pluralSr } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ThreadsMediaItem =
  FunctionReturnType<typeof api.threadsStore.mediaList>[number];

export type SortKey = "views" | "likes" | "replies" | "timestamp";
export type SortDirection = "asc" | "desc";

export type SortState = {
  key: SortKey;
  dir: SortDirection;
};

const DEFAULT_SORT: SortState = { key: "timestamp", dir: "desc" };

function formatPostDate(timestamp: string | null): string {
  if (!timestamp) return "—";
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("sr-Latn-RS", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Bedž tipa objave (Dodatak B.7):
 * media_type se prikazuje doslovno onakav kakav je stigao,
 * bez mapiranja u naš enum i bez podrazumevane vrednosti.
 */
function TypeBadge({ type }: { type: string }) {
  return (
    <span className="inline-flex items-center rounded-md bg-bg-950/85 px-2 py-0.5 font-mono text-micro font-semibold text-text-primary backdrop-blur-md">
      {type}
    </span>
  );
}

function compareMedia(
  a: ThreadsMediaItem,
  b: ThreadsMediaItem,
  sort: SortState,
): number {
  if (sort.key === "timestamp") {
    const at = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const bt = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    const res = at < bt ? -1 : at > bt ? 1 : 0;
    return sort.dir === "asc" ? res : -res;
  }

  const av = a.insights?.[sort.key] ?? -1;
  const bv = b.insights?.[sort.key] ?? -1;
  const res = av < bv ? -1 : av > bv ? 1 : 0;
  return sort.dir === "asc" ? res : -res;
}

export function ThreadsContentGrid({ media }: { media: ThreadsMediaItem[] }) {
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);

  const topThree = useMemo(
    () =>
      [...media]
        .sort((a, b) => (b.insights?.views ?? -1) - (a.insights?.views ?? -1))
        .slice(0, 3),
    [media],
  );

  const sortedMedia = useMemo(
    () => [...media].sort((a, b) => compareMedia(a, b, sort)),
    [media, sort],
  );

  const handleSortChange = (key: SortKey) => {
    setSort((prev) => {
      if (prev.key === key) {
        return { key, dir: prev.dir === "desc" ? "asc" : "desc" };
      }
      return { key, dir: "desc" };
    });
  };

  if (media.length === 0) {
    return (
      <EmptyState icon={MessageCircle}>
        Nema zabeleženih Threads objava za ovaj radni prostor.
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {/* ── Top Sadržaj (Top 3 by Views) ─────────────────────────────────── */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-accent-400/10 text-accent-400">
              <Trophy className="size-4" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">
                Top sadržaj
              </h2>
              <p className="text-xs text-text-muted">
                Najuspešnije 3 objave po ukupnom broju prikaza (views)
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {topThree.map((item, idx) => (
            <TopThreadsPostCard key={item._id} item={item} rank={idx + 1} />
          ))}
        </div>
      </div>

      {/* ── Sve objave sa kontrolama sortiranja ───────────────────────────── */}
      <ArrivalScope resetKey={`${sort.key}|${sort.dir}`}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-6">
            <div>
              <h2 className="text-base font-semibold text-foreground">
                Sve objave
              </h2>
              <p className="font-mono text-xs tabular-nums text-text-muted">
                Prikazano {formatNumber(sortedMedia.length)}{" "}
                {pluralSr(sortedMedia.length, "objava", "objave", "objava")}
              </p>
            </div>

            {/* Sort Controls */}
            <div className="flex items-center gap-1.5 rounded-lg border border-line bg-surface p-1 text-xs">
              <span className="px-2 py-1 text-text-muted">Sortiraj po:</span>
              <SortButton
                label="Prikazi"
                active={sort.key === "views"}
                dir={sort.dir}
                onClick={() => handleSortChange("views")}
              />
              <SortButton
                label="Lajkovi"
                active={sort.key === "likes"}
                dir={sort.dir}
                onClick={() => handleSortChange("likes")}
              />
              <SortButton
                label="Odgovori"
                active={sort.key === "replies"}
                dir={sort.dir}
                onClick={() => handleSortChange("replies")}
              />
              <SortButton
                label="Datum"
                active={sort.key === "timestamp"}
                dir={sort.dir}
                onClick={() => handleSortChange("timestamp")}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sortedMedia.map((item) => (
              <Arrive key={item._id} id={item.mediaId} className="h-full">
                <ThreadsPostCard item={item} />
              </Arrive>
            ))}
          </div>
        </div>
      </ArrivalScope>
    </div>
  );
}

function SortButton({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: SortDirection;
  onClick: () => void;
}) {
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      className={cn(
        "h-7 gap-1 px-2.5 text-xs font-medium transition-colors",
        active
          ? "bg-surface-raised text-accent-400 font-semibold shadow-xs"
          : "text-text-muted hover:text-foreground",
      )}
    >
      <span>{label}</span>
      <Icon className="size-3" aria-hidden="true" />
    </Button>
  );
}

/**
 * Top Threads Post Card
 */
function TopThreadsPostCard({
  item,
  rank,
}: {
  item: ThreadsMediaItem;
  rank: number;
}) {
  const views = item.insights?.views;
  const likes = item.insights?.likes;
  const replies = item.insights?.replies;
  const reposts = item.insights?.reposts;
  const quotes = item.insights?.quotes;
  const shares = item.insights?.shares;

  return (
    <Card
      className={cn(
        "group relative flex flex-col justify-between overflow-hidden p-0 shadow-card hover-lift",
        rank === 1
          ? "border-accent-400/40 bg-gradient-to-b from-surface-raised to-surface"
          : "border-line bg-surface",
      )}
    >
      <div className="flex flex-1 flex-col p-5">
        {/* Header: Rank, Type & Date */}
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold shadow-xs",
              rank === 1
                ? "bg-accent-400 text-text-inverse"
                : "border border-line-strong bg-surface-raised text-foreground",
            )}
          >
            #{rank} Top prikazi
          </span>
          <div className="flex items-center gap-2">
            <TypeBadge type={item.mediaType} />
            <span className="font-mono text-micro text-text-muted">
              {formatPostDate(item.timestamp)}
            </span>
          </div>
        </div>

        {/* Post Text */}
        <p className="mt-4 line-clamp-3 text-xs leading-relaxed text-foreground/90 min-h-12">
          {item.text ? (
            item.text
          ) : (
            <span className="text-text-muted italic">Bez tekstualnog sadržaja</span>
          )}
        </p>

        {/* Highlighted Views Stat */}
        <div className="mt-4 flex items-baseline justify-between rounded-lg border border-line-soft bg-surface-raised/60 px-3 py-2">
          <span className="text-xs font-medium text-text-muted">
            Ukupno prikaza (views)
          </span>
          {views !== null && views !== undefined ? (
            <span className="font-mono text-lg font-bold tabular-nums text-accent-400">
              {formatNumber(views)}
            </span>
          ) : (
            <span className="font-mono text-base font-medium text-text-muted">
              —
            </span>
          )}
        </div>

        {/* Engagement Grid (6 metrics from §5.3) */}
        <div className="mt-3 grid grid-cols-5 gap-1 border-t border-line-soft pt-3 text-center">
          <div>
            <span className="flex items-center justify-center gap-1 text-micro text-text-muted">
              <Heart className="size-3 text-danger/80" /> Lajk
            </span>
            <p className="mt-0.5 font-mono text-xs font-semibold tabular-nums text-foreground">
              {likes !== null && likes !== undefined ? formatNumber(likes) : "—"}
            </p>
          </div>
          <div>
            <span className="flex items-center justify-center gap-1 text-micro text-text-muted">
              <MessageCircle className="size-3 text-accent-400/80" /> Odg
            </span>
            <p className="mt-0.5 font-mono text-xs font-semibold tabular-nums text-foreground">
              {replies !== null && replies !== undefined ? formatNumber(replies) : "—"}
            </p>
          </div>
          <div>
            <span className="flex items-center justify-center gap-1 text-micro text-text-muted">
              <Repeat2 className="size-3 text-success/80" /> Repost
            </span>
            <p className="mt-0.5 font-mono text-xs font-semibold tabular-nums text-foreground">
              {reposts !== null && reposts !== undefined ? formatNumber(reposts) : "—"}
            </p>
          </div>
          <div>
            <span className="flex items-center justify-center gap-1 text-micro text-text-muted">
              <Quote className="size-3 text-warning/80" /> Citat
            </span>
            <p className="mt-0.5 font-mono text-xs font-semibold tabular-nums text-foreground">
              {quotes !== null && quotes !== undefined ? formatNumber(quotes) : "—"}
            </p>
          </div>
          <div>
            <span className="flex items-center justify-center gap-1 text-micro text-text-muted">
              <Share2 className="size-3 text-text-secondary" /> Delj
            </span>
            <p className="mt-0.5 font-mono text-xs font-semibold tabular-nums text-foreground">
              {shares !== null && shares !== undefined ? formatNumber(shares) : "—"}
            </p>
          </div>
        </div>

        {/* External Link */}
        {item.permalink && (
          <div className="mt-4 flex items-center justify-end border-t border-line-soft pt-3">
            <a
              href={item.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-text-muted hover:text-accent-400 transition-colors"
            >
              <span>Otvori na Threads</span>
              <ExternalLink className="size-3" aria-hidden="true" />
            </a>
          </div>
        )}
      </div>
    </Card>
  );
}

/**
 * Standard Threads Post Card
 */
function ThreadsPostCard({ item }: { item: ThreadsMediaItem }) {
  const views = item.insights?.views;
  const likes = item.insights?.likes;
  const replies = item.insights?.replies;
  const reposts = item.insights?.reposts;
  const quotes = item.insights?.quotes;
  const shares = item.insights?.shares;

  return (
    <Card className="group relative flex h-full flex-col justify-between overflow-hidden p-5 shadow-card hover-lift">
      <div>
        {/* Top bar: Type badge & Date */}
        <div className="flex items-center justify-between gap-2">
          <TypeBadge type={item.mediaType} />
          <span className="font-mono text-micro text-text-muted">
            {formatPostDate(item.timestamp)}
          </span>
        </div>

        {/* Text */}
        <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-foreground/90 min-h-12">
          {item.text ? (
            item.text
          ) : (
            <span className="text-text-muted italic">Bez tekstualnog sadržaja</span>
          )}
        </p>

        {/* Key stats row */}
        <div className="mt-4 grid grid-cols-3 gap-2 rounded-lg border border-line-soft bg-surface-raised/40 p-2 text-center">
          <div>
            <div className="flex items-center justify-center gap-1 text-micro text-text-muted">
              <Eye className="size-3 text-accent-400" />
              <span>Prikazi</span>
            </div>
            <p className="mt-0.5 font-mono text-xs font-semibold tabular-nums text-foreground">
              {views !== null && views !== undefined ? formatNumber(views) : "—"}
            </p>
          </div>

          <div>
            <div className="flex items-center justify-center gap-1 text-micro text-text-muted">
              <Heart className="size-3 text-danger" />
              <span>Lajkovi</span>
            </div>
            <p className="mt-0.5 font-mono text-xs font-semibold tabular-nums text-foreground">
              {likes !== null && likes !== undefined ? formatNumber(likes) : "—"}
            </p>
          </div>

          <div>
            <div className="flex items-center justify-center gap-1 text-micro text-text-muted">
              <MessageCircle className="size-3 text-text-muted" />
              <span>Odgovori</span>
            </div>
            <p className="mt-0.5 font-mono text-xs font-semibold tabular-nums text-foreground">
              {replies !== null && replies !== undefined ? formatNumber(replies) : "—"}
            </p>
          </div>
        </div>
      </div>

      {/* Footer bar: Secondary stats & External Link */}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-line-soft pt-3 text-xs">
        <div className="flex items-center gap-3 text-text-muted">
          <span
            className="inline-flex items-center gap-1 font-mono tabular-nums"
            title="Repostovi"
          >
            <Repeat2 className="size-3 text-success/80" />
            {reposts !== null && reposts !== undefined ? formatNumber(reposts) : "—"}
          </span>
          <span
            className="inline-flex items-center gap-1 font-mono tabular-nums"
            title="Citati"
          >
            <Quote className="size-3 text-warning/80" />
            {quotes !== null && quotes !== undefined ? formatNumber(quotes) : "—"}
          </span>
          <span
            className="inline-flex items-center gap-1 font-mono tabular-nums"
            title="Deljenja"
          >
            <Share2 className="size-3 text-text-secondary" />
            {shares !== null && shares !== undefined ? formatNumber(shares) : "—"}
          </span>
        </div>

        {item.permalink && (
          <a
            href={item.permalink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-text-muted hover:text-foreground transition-colors"
            title="Otvori na Threads"
          >
            <span className="text-micro">Threads</span>
            <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        )}
      </div>
    </Card>
  );
}

export function ThreadsContentGridSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <Skeleton className="h-6 w-36" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-5 shadow-card space-y-4">
              <div className="flex justify-between">
                <Skeleton className="h-5 w-24 rounded-full" />
                <Skeleton className="h-4 w-20" />
              </div>
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-6 w-full" />
            </Card>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4 border-t border-line-soft pt-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="p-5 shadow-card space-y-4">
              <div className="flex justify-between">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-16" />
              </div>
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-4 w-full" />
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
