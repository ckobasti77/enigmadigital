"use client";

import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Clock,
  ExternalLink,
  Captions,
  Eye,
  Gauge,
  Heart,
  MessageCircle,
  Pencil,
  PlayCircle,
  Trophy,
} from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { formatNumber, formatPercent, formatWatchTime } from "@/lib/format";
import { YtVideoEditDialog } from "./yt-video-edit-dialog";
import { YtCaptionsPanel } from "./yt-captions-panel";
import { cn } from "@/lib/utils";

export type VideoItem = FunctionReturnType<
  typeof api.youtubeStore.videos
>[number];

export type SortKey = "views" | "estimatedMinutesWatched" | "publishedAt";
export type SortDirection = "asc" | "desc";

export type SortState = {
  key: SortKey;
  dir: SortDirection;
};

const DEFAULT_SORT: SortState = { key: "publishedAt", dir: "desc" };

function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

function formatPublishedAt(timestamp: number): string {
  if (!timestamp) return "—";
  return new Date(timestamp).toLocaleDateString("sr-Latn-RS", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** ISO 8601 duration from the Data API ("PT1H2M33S") → "1:02:33". */
function formatDuration(duration: string | undefined): string | null {
  if (!duration) return null;
  const match = /^P(?:\d+D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(duration);
  if (!match) return null;
  const [hours, minutes, seconds] = [match[1], match[2], match[3]].map((part) =>
    part ? Number(part) : 0,
  );
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`;
}

/** `averageViewPercentage` is 0..100 in the store; `formatPercent` wants 0..1. */
function retention(item: VideoItem): string {
  return item.averageViewPercentage === undefined
    ? "—"
    : formatPercent(item.averageViewPercentage / 100);
}

function watchTime(item: VideoItem): string {
  return item.estimatedMinutesWatched === undefined
    ? "—"
    : formatWatchTime(item.estimatedMinutesWatched);
}

function compareVideos(a: VideoItem, b: VideoItem, sort: SortState): number {
  const av = a[sort.key] ?? 0;
  const bv = b[sort.key] ?? 0;
  const res = av < bv ? -1 : av > bv ? 1 : 0;
  return sort.dir === "asc" ? res : -res;
}

export function YouTubeVideosGrid({ videos }: { videos: VideoItem[] }) {
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);
  const [editing, setEditing] = useState<VideoItem | null>(null);
  const [captioning, setCaptioning] = useState<VideoItem | null>(null);

  const topThree = useMemo(
    () => [...videos].sort((a, b) => b.views - a.views).slice(0, 3),
    [videos],
  );

  const sortedVideos = useMemo(
    () => [...videos].sort((a, b) => compareVideos(a, b, sort)),
    [videos, sort],
  );

  const handleSortChange = (key: SortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "desc" ? "asc" : "desc" }
        : { key, dir: "desc" },
    );
  };

  if (videos.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-8">
      {/* ── Top videi (Top 3 by views) ───────────────────────────────────── */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-accent-400/10 text-accent-400">
            <Trophy className="size-4" aria-hidden />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Top videi
            </h2>
            <p className="text-xs text-text-muted">
              Tri videa sa najviše ukupnih pregleda
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {topThree.map((item, idx) => (
            <TopVideoCard
              key={item._id}
              item={item}
              rank={idx + 1}
              onEdit={() => setEditing(item)}
              onCaptions={() => setCaptioning(item)}
            />
          ))}
        </div>
      </div>

      {/* ── All videos with sort controls ────────────────────────────────── */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-6">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Svi videi
            </h2>
            <p className="font-mono text-xs tabular-nums text-text-muted">
              Prikazano {formatNumber(sortedVideos.length)}{" "}
              {sortedVideos.length === 1
                ? "video"
                : sortedVideos.length >= 2 && sortedVideos.length <= 4
                  ? "videa"
                  : "videa"}
            </p>
          </div>

          <div className="flex items-center gap-1.5 rounded-lg border border-line bg-surface p-1 text-xs">
            <span className="px-2 py-1 text-text-muted">Sortiraj po:</span>
            <SortButton
              label="Pregledi"
              active={sort.key === "views"}
              dir={sort.dir}
              onClick={() => handleSortChange("views")}
            />
            <SortButton
              label="Vreme gledanja"
              active={sort.key === "estimatedMinutesWatched"}
              dir={sort.dir}
              onClick={() => handleSortChange("estimatedMinutesWatched")}
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
          {sortedVideos.map((item) => (
            <VideoCard
              key={item._id}
              item={item}
              onEdit={() => setEditing(item)}
              onCaptions={() => setCaptioning(item)}
            />
          ))}
        </div>
      </div>

      <YtVideoEditDialog
        video={editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      />

      <YtCaptionsPanel
        video={captioning}
        onOpenChange={(open) => {
          if (!open) setCaptioning(null);
        }}
      />
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

/** Thumbnail with a duration chip, or a neutral placeholder when none synced. */
function Thumbnail({
  item,
  size = "md",
}: {
  item: VideoItem;
  size?: "md" | "lg";
}) {
  const duration = formatDuration(item.duration);
  return (
    <div className="relative aspect-video w-full overflow-hidden border-b border-line-soft bg-bg-900">
      {item.thumbnailUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={item.thumbnailUrl}
          alt={item.title}
          className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      ) : (
        <div className="relative flex size-full items-center justify-center overflow-hidden bg-gradient-to-br from-bg-900 via-surface to-bg-950 p-4">
          <div
            className={cn(
              "flex items-center justify-center rounded-xl border border-line bg-surface-raised/70 text-text-muted transition-colors group-hover:border-accent-400/30 group-hover:text-accent-400",
              size === "lg" ? "size-12" : "size-10",
            )}
          >
            <PlayCircle className={size === "lg" ? "size-6" : "size-5"} />
          </div>
        </div>
      )}

      {duration && (
        <span className="absolute bottom-2 right-2 rounded bg-bg-950/80 px-1.5 py-0.5 font-mono text-micro tabular-nums text-text-primary backdrop-blur-md">
          {duration}
        </span>
      )}
    </div>
  );
}

/**
 * Top video card: elevated, rank pill, views pulled out as the headline stat.
 */
function TopVideoCard({
  item,
  rank,
  onEdit,
  onCaptions,
}: {
  item: VideoItem;
  rank: number;
  onEdit: () => void;
  onCaptions: () => void;
}) {
  return (
    <Card
      className={cn(
        "group relative flex flex-col justify-between overflow-hidden p-0 shadow-card hover-lift",
        rank === 1
          ? "border-accent-400/40 bg-gradient-to-b from-surface-raised to-surface"
          : "border-line bg-surface",
      )}
    >
      <div className="relative">
        <Thumbnail item={item} size="lg" />

        <div className="absolute left-3 top-3">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold shadow-md",
              rank === 1
                ? "bg-accent-400 text-text-inverse"
                : "border border-line-strong bg-surface-raised/95 text-foreground backdrop-blur-md",
            )}
          >
            #{rank} Najgledaniji
          </span>
        </div>

        <div className="absolute left-3 bottom-2">
          <span className="rounded bg-bg-950/70 px-2 py-0.5 font-mono text-micro text-text-muted backdrop-blur-xs">
            {formatPublishedAt(item.publishedAt)}
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <p className="line-clamp-2 text-xs font-medium leading-relaxed text-foreground/90">
          {item.title}
        </p>

        <div className="mt-4 flex items-baseline justify-between rounded-lg border border-line-soft bg-surface-raised/60 px-3 py-2">
          <span className="text-xs font-medium text-text-muted">
            Ukupno pregleda
          </span>
          <span className="font-mono text-lg font-bold tabular-nums text-accent-400">
            {formatNumber(item.views)}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-4 gap-2 border-t border-line-soft pt-3 text-center">
          <MiniStat
            icon={<Clock className="size-3 text-text-muted" />}
            label="Gledanje"
            value={watchTime(item)}
          />
          <MiniStat
            icon={<Gauge className="size-3 text-warning/80" />}
            label="Odgledano"
            value={retention(item)}
          />
          <MiniStat
            icon={<Heart className="size-3 text-danger/80" />}
            label="Lajkovi"
            value={formatNumber(item.likes)}
          />
          <MiniStat
            icon={<MessageCircle className="size-3 text-text-muted" />}
            label="Komentari"
            value={formatNumber(item.comments)}
          />
        </div>

        <div className="mt-4 flex items-center gap-2">
          <a
            href={watchUrl(item.videoId)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-line-soft bg-surface-raised/40 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-line-strong hover:bg-surface-raised hover:text-foreground"
          >
            <span>Pogledaj na YouTube-u</span>
            <ExternalLink className="size-3" aria-hidden />
          </a>
          <EditVideoButton onEdit={onEdit} title={item.title} />
          <CaptionsButton onOpen={onCaptions} title={item.title} />
        </div>
      </div>
    </Card>
  );
}

function MiniStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div>
      <span className="flex items-center justify-center gap-1 text-micro text-text-muted">
        {icon} {label}
      </span>
      <p className="mt-0.5 font-mono text-xs font-semibold tabular-nums text-foreground">
        {value}
      </p>
    </div>
  );
}

/** Standard card for the full video list. */
function VideoCard({
  item,
  onEdit,
  onCaptions,
}: {
  item: VideoItem;
  onEdit: () => void;
  onCaptions: () => void;
}) {
  return (
    <Card className="group relative flex flex-col justify-between overflow-hidden p-0 shadow-card hover-lift">
      <div className="relative">
        <Thumbnail item={item} />
        <div className="absolute right-2.5 top-2.5">
          <span className="rounded bg-bg-950/80 px-2 py-0.5 font-mono text-micro text-text-muted backdrop-blur-md">
            {formatPublishedAt(item.publishedAt)}
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <p className="line-clamp-2 min-h-8 text-xs font-medium leading-relaxed text-foreground/90">
          {item.title}
        </p>

        <div className="mt-4 grid grid-cols-3 gap-2 rounded-lg border border-line-soft bg-surface-raised/40 p-2.5 text-center">
          <MiniStat
            icon={<Eye className="size-3 text-accent-400" />}
            label="Pregledi"
            value={formatNumber(item.views)}
          />
          <MiniStat
            icon={<Clock className="size-3 text-text-muted" />}
            label="Gledanje"
            value={watchTime(item)}
          />
          <MiniStat
            icon={<Gauge className="size-3 text-warning" />}
            label="Odgledano"
            value={retention(item)}
          />
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-line-soft pt-3 text-xs">
          <div className="flex items-center gap-3 text-text-muted">
            <span className="inline-flex items-center gap-1 font-mono tabular-nums">
              <Heart className="size-3.5" />
              {formatNumber(item.likes)}
            </span>
            <span className="inline-flex items-center gap-1 font-mono tabular-nums">
              <MessageCircle className="size-3.5" />
              {formatNumber(item.comments)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={watchUrl(item.videoId)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-text-secondary transition-colors hover:text-accent-400"
            >
              <span>Otvori</span>
              <ExternalLink className="size-3" aria-hidden />
            </a>
            <EditVideoButton onEdit={onEdit} title={item.title} />
            <CaptionsButton onOpen={onCaptions} title={item.title} />
          </div>
        </div>
      </div>
    </Card>
  );
}

/**
 * The way into the edit dialog. Named for the video it opens, because a grid
 * of identical pencils tells a screen reader nothing about which one.
 */
function EditVideoButton({
  onEdit,
  title,
}: {
  onEdit: () => void;
  title: string;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onEdit}
      aria-label={`Izmeni video ${title}`}
      className="h-7 gap-1 border-line-soft px-2 text-xs text-text-secondary hover:border-line-strong hover:text-foreground"
    >
      <Pencil className="size-3" aria-hidden />
      <span>Izmeni</span>
    </Button>
  );
}

/**
 * The way into the caption panel.
 *
 * Its own button rather than a tab inside the edit dialog: opening it costs 50
 * quota units, so it has to be a deliberate click and not something the
 * operator lands on while editing a title.
 */
function CaptionsButton({
  onOpen,
  title,
}: {
  onOpen: () => void;
  title: string;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onOpen}
      aria-label={`Titlovi za video ${title}`}
      className="h-7 gap-1 border-line-soft px-2 text-xs text-text-secondary hover:border-line-strong hover:text-foreground"
    >
      <Captions className="size-3" aria-hidden />
      <span>Titlovi</span>
    </Button>
  );
}

export function YouTubeVideosGridSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <Skeleton className="h-6 w-32" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-0 shadow-card">
              <Skeleton className="aspect-video w-full" />
              <div className="space-y-3 p-4">
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
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-8 w-56" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="p-0 shadow-card">
              <Skeleton className="aspect-video w-full" />
              <div className="space-y-3 p-4">
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
