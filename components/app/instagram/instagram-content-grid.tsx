"use client";

import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Bookmark,
  Camera,
  ExternalLink,
  Eye,
  Film,
  Heart,
  Layers,
  MessageCircle,
  Share2,
  Trophy,
} from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export type MediaItem =
  FunctionReturnType<typeof api.instagramStore.mediaList>[number] & {
    thumbnailUrl?: string;
  };

export type SortKey = "reach" | "saves" | "publishedAt";
export type SortDirection = "asc" | "desc";

export type SortState = {
  key: SortKey;
  dir: SortDirection;
};

const DEFAULT_SORT: SortState = { key: "publishedAt", dir: "desc" };

function formatPostDate(timestamp: number): string {
  if (!timestamp) return "—";
  return new Date(timestamp).toLocaleDateString("sr-Latn-RS", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function normalizeMediaType(type: string): "REEL" | "CAROUSEL" | "POST" {
  const upper = (type || "").toUpperCase();
  if (upper.includes("REEL") || upper.includes("VIDEO")) return "REEL";
  if (upper.includes("CAROUSEL") || upper.includes("ALBUM")) return "CAROUSEL";
  return "POST";
}

function TypeBadge({ type }: { type: string }) {
  const normalized = normalizeMediaType(type);
  const Icon =
    normalized === "REEL"
      ? Film
      : normalized === "CAROUSEL"
        ? Layers
        : Camera;

  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-bg-950/80 px-2 py-0.5 text-micro font-semibold text-text-primary backdrop-blur-md">
      <Icon className="size-3 text-accent-400" aria-hidden />
      {normalized}
    </span>
  );
}

function compareMedia(a: MediaItem, b: MediaItem, sort: SortState): number {
  const av = a[sort.key] ?? 0;
  const bv = b[sort.key] ?? 0;
  const res = av < bv ? -1 : av > bv ? 1 : 0;
  return sort.dir === "asc" ? res : -res;
}

export function InstagramContentGrid({ media }: { media: MediaItem[] }) {
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);

  const topThree = useMemo(() => {
    return [...media].sort((a, b) => b.reach - a.reach).slice(0, 3);
  }, [media]);

  const sortedMedia = useMemo(() => {
    return [...media].sort((a, b) => compareMedia(a, b, sort));
  }, [media, sort]);

  const handleSortChange = (key: SortKey) => {
    setSort((prev) => {
      if (prev.key === key) {
        return { key, dir: prev.dir === "desc" ? "asc" : "desc" };
      }
      return { key, dir: "desc" };
    });
  };

  if (media.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-8">
      {/* ── Top Sadržaj (Top 3 by Reach) Strip ───────────────────────────── */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-accent-400/10 text-accent-400">
              <Trophy className="size-4" aria-hidden />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">
                Top sadržaj
              </h2>
              <p className="text-xs text-text-muted">
                Najuspešnije 3 objave po ukupnom dosegu (reach)
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {topThree.map((item, idx) => (
            <TopContentCard
              key={item._id}
              item={item}
              rank={idx + 1}
            />
          ))}
        </div>
      </div>

      {/* ── All Posts Grid with Sort Controls ────────────────────────────── */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-6">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Sve objave
            </h2>
            <p className="font-mono text-xs tabular-nums text-text-muted">
              Prikazano {formatNumber(sortedMedia.length)}{" "}
              {sortedMedia.length === 1
                ? "objava"
                : sortedMedia.length >= 2 && sortedMedia.length <= 4
                  ? "objave"
                  : "objava"}
            </p>
          </div>

          {/* Sort Controls */}
          <div className="flex items-center gap-1.5 rounded-lg border border-line bg-surface p-1 text-xs">
            <span className="px-2 py-1 text-text-muted">Sortiraj po:</span>
            <SortButton
              label="Doseg"
              active={sort.key === "reach"}
              dir={sort.dir}
              onClick={() => handleSortChange("reach")}
            />
            <SortButton
              label="Sačuvano"
              active={sort.key === "saves"}
              dir={sort.dir}
              onClick={() => handleSortChange("saves")}
            />
            <SortButton
              label="Datum"
              active={sort.key === "publishedAt"}
              dir={sort.dir}
              onClick={() => handleSortChange("publishedAt")}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sortedMedia.map((item) => (
            <PostCard key={item._id} item={item} />
          ))}
        </div>
      </div>
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
      <Icon className="size-3" aria-hidden />
    </Button>
  );
}

/**
 * Top Content Card: visually elevated card with rank pill, prominent reach,
 * and high-impact metrics.
 */
function TopContentCard({
  item,
  rank,
}: {
  item: MediaItem;
  rank: number;
}) {
  const normalizedType = normalizeMediaType(item.mediaType);

  return (
    <Card
      className={cn(
        "group relative flex flex-col justify-between overflow-hidden p-0 shadow-card hover-lift",
        rank === 1
          ? "border-accent-400/40 bg-gradient-to-b from-surface-raised to-surface"
          : "border-line bg-surface",
      )}
    >
      {/* Visual Header / Placeholder */}
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-bg-900 border-b border-line-soft">
        {item.thumbnailUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={item.thumbnailUrl}
            alt={item.caption || "Instagram objava"}
            className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="relative flex size-full flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-bg-900 via-surface to-bg-950 p-4">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(88,196,255,0.08),transparent_50%)]" />
            <div className="flex size-12 items-center justify-center rounded-xl bg-surface-raised/80 border border-line text-accent-400 shadow-inner">
              {normalizedType === "REEL" ? (
                <Film className="size-6" />
              ) : normalizedType === "CAROUSEL" ? (
                <Layers className="size-6" />
              ) : (
                <Camera className="size-6" />
              )}
            </div>
          </div>
        )}

        {/* Rank Badge */}
        <div className="absolute top-3 left-3">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold shadow-md",
              rank === 1
                ? "bg-accent-400 text-text-inverse"
                : "bg-surface-raised/95 border border-line-strong text-foreground backdrop-blur-md",
            )}
          >
            #{rank} Top doseg
          </span>
        </div>

        {/* Type & Date badges */}
        <div className="absolute top-3 right-3 flex items-center gap-1.5">
          <TypeBadge type={item.mediaType} />
        </div>

        <div className="absolute bottom-2 left-3">
          <span className="text-micro font-mono text-text-muted bg-bg-950/70 backdrop-blur-xs px-2 py-0.5 rounded">
            {formatPostDate(item.publishedAt)}
          </span>
        </div>
      </div>

      {/* Card Content */}
      <div className="flex flex-1 flex-col p-4">
        {/* Caption */}
        <p className="line-clamp-2 text-xs leading-relaxed text-foreground/90">
          {item.caption ? item.caption : <span className="text-text-muted italic">Bez opisa</span>}
        </p>

        {/* Highlighted Reach Stat */}
        <div className="mt-4 flex items-baseline justify-between rounded-lg bg-surface-raised/60 border border-line-soft px-3 py-2">
          <span className="text-xs font-medium text-text-muted">Ukupan doseg</span>
          <span className="font-mono text-lg font-bold tabular-nums text-accent-400">
            {formatNumber(item.reach)}
          </span>
        </div>

        {/* Engagement Grid */}
        <div className="mt-3 grid grid-cols-4 gap-2 border-t border-line-soft pt-3 text-center">
          <div>
            <span className="flex items-center justify-center gap-1 text-micro text-text-muted">
              <Heart className="size-3 text-danger/80" /> Lajkovi
            </span>
            <p className="font-mono text-xs font-semibold tabular-nums text-foreground mt-0.5">
              {formatNumber(item.likes)}
            </p>
          </div>
          <div>
            <span className="flex items-center justify-center gap-1 text-micro text-text-muted">
              <Bookmark className="size-3 text-warning/80" /> Sačuvano
            </span>
            <p className="font-mono text-xs font-semibold tabular-nums text-foreground mt-0.5">
              {formatNumber(item.saves)}
            </p>
          </div>
          <div>
            <span className="flex items-center justify-center gap-1 text-micro text-text-muted">
              <MessageCircle className="size-3 text-text-muted" /> Komentari
            </span>
            <p className="font-mono text-xs font-semibold tabular-nums text-foreground mt-0.5">
              {formatNumber(item.comments)}
            </p>
          </div>
          <div>
            <span className="flex items-center justify-center gap-1 text-micro text-text-muted">
              <Share2 className="size-3 text-success/80" /> Deljenja
            </span>
            <p className="font-mono text-xs font-semibold tabular-nums text-foreground mt-0.5">
              {formatNumber(item.shares)}
            </p>
          </div>
        </div>

        {/* Link Button */}
        {item.permalink && (
          <a
            href={item.permalink}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-md border border-line-soft bg-surface-raised/40 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-line-strong hover:bg-surface-raised hover:text-foreground"
          >
            <span>Pogledaj na Instagramu</span>
            <ExternalLink className="size-3" aria-hidden />
          </a>
        )}
      </div>
    </Card>
  );
}

/**
 * Standard Post Card for the 30-post grid.
 */
function PostCard({ item }: { item: MediaItem }) {
  const normalizedType = normalizeMediaType(item.mediaType);

  return (
    <Card className="group relative flex flex-col justify-between overflow-hidden p-0 shadow-card hover-lift">
      {/* Header Visual / Placeholder */}
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-bg-900 border-b border-line-soft">
        {item.thumbnailUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={item.thumbnailUrl}
            alt={item.caption || "Instagram objava"}
            className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="relative flex size-full flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-bg-900 via-surface to-bg-950 p-4">
            <div className="flex size-10 items-center justify-center rounded-lg bg-surface-raised/60 border border-line text-text-muted group-hover:text-accent-400 group-hover:border-accent-400/30 transition-colors">
              {normalizedType === "REEL" ? (
                <Film className="size-5" />
              ) : normalizedType === "CAROUSEL" ? (
                <Layers className="size-5" />
              ) : (
                <Camera className="size-5" />
              )}
            </div>
          </div>
        )}

        {/* Badges on Visual */}
        <div className="absolute top-2.5 left-2.5">
          <TypeBadge type={item.mediaType} />
        </div>

        <div className="absolute top-2.5 right-2.5">
          <span className="rounded bg-bg-950/80 px-2 py-0.5 font-mono text-micro text-text-muted backdrop-blur-md">
            {formatPostDate(item.publishedAt)}
          </span>
        </div>
      </div>

      {/* Post Body */}
      <div className="flex flex-1 flex-col p-4">
        <p className="line-clamp-2 min-h-8 text-xs leading-relaxed text-foreground/90">
          {item.caption ? item.caption : <span className="text-text-muted italic">Bez opisa</span>}
        </p>

        {/* Stats Grid */}
        <div className="mt-4 grid grid-cols-3 gap-2 rounded-lg bg-surface-raised/40 border border-line-soft p-2.5 text-center">
          <div>
            <div className="flex items-center justify-center gap-1 text-micro text-text-muted">
              <Eye className="size-3 text-accent-400" />
              <span>Doseg</span>
            </div>
            <p className="mt-0.5 font-mono text-xs font-semibold tabular-nums text-foreground">
              {formatNumber(item.reach)}
            </p>
          </div>

          <div>
            <div className="flex items-center justify-center gap-1 text-micro text-text-muted">
              <Bookmark className="size-3 text-warning" />
              <span>Sačuvano</span>
            </div>
            <p className="mt-0.5 font-mono text-xs font-semibold tabular-nums text-foreground">
              {formatNumber(item.saves)}
            </p>
          </div>

          <div>
            <div className="flex items-center justify-center gap-1 text-micro text-text-muted">
              <Heart className="size-3 text-danger" />
              <span>Lajkovi</span>
            </div>
            <p className="mt-0.5 font-mono text-xs font-semibold tabular-nums text-foreground">
              {formatNumber(item.likes)}
            </p>
          </div>
        </div>

        {/* Secondary Stats & Link */}
        <div className="mt-3 flex items-center justify-between border-t border-line-soft pt-3 text-xs">
          <div className="flex items-center gap-3 text-text-muted">
            <span className="inline-flex items-center gap-1 font-mono tabular-nums">
              <MessageCircle className="size-3.5" />
              {formatNumber(item.comments)}
            </span>
            <span className="inline-flex items-center gap-1 font-mono tabular-nums">
              <Share2 className="size-3.5" />
              {formatNumber(item.shares)}
            </span>
          </div>

          {item.permalink && (
            <a
              href={item.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-text-secondary hover:text-accent-400 transition-colors"
            >
              <span>Otvori</span>
              <ExternalLink className="size-3" aria-hidden />
            </a>
          )}
        </div>
      </div>
    </Card>
  );
}

export function InstagramContentGridSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <Skeleton className="h-6 w-36" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-0 shadow-card">
              <Skeleton className="aspect-[16/9] w-full" />
              <div className="p-4 space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
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
            <Card key={i} className="p-0 shadow-card">
              <Skeleton className="aspect-[16/10] w-full" />
              <div className="p-4 space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-6 w-full" />
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
