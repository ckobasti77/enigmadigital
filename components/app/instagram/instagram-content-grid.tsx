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
  EyeOff,
  Film,
  Heart,
  Layers,
  MessageCircle,
  Share2,
  Trash2,
  Trophy,
} from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { CountUp } from "@/components/motion/count-up";
import { Arrive, ArrivalScope } from "@/components/motion/arrive";
import { EmptyState } from "@/components/app/empty-state";
import { formatNumber, pluralSr } from "@/lib/format";
import { igMediaSrc } from "@/lib/ig-media";
import { cn } from "@/lib/utils";
import { CarouselSwiper } from "./carousel-swiper";
import { PostCommentsPanel } from "./post-comments-panel";
import {
  MediaFallback,
  PostImage,
  normalizeMediaType,
  type MediaVariant,
} from "./post-media";

export type MediaItem =
  FunctionReturnType<typeof api.instagramStore.mediaList>[number];

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

function TypeBadge({ type }: { type: string }) {
  const kind = normalizeMediaType(type);
  const Icon = kind === "REEL" ? Film : kind === "CAROUSEL" ? Layers : Camera;

  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-bg-950/80 px-2 py-0.5 text-micro font-semibold text-text-primary backdrop-blur-md">
      <Icon className="size-3 text-accent-400" aria-hidden />
      {kind}
    </span>
  );
}

/**
 * The picture area of a post: a swiper for a carousel, a single picture
 * otherwise, and a dimmed placeholder for a post Instagram no longer has.
 *
 * Nothing here ever points at a stored Instagram CDN link — every request goes
 * through the /ig-media/ proxy, which refreshes the signed link on demand.
 */
function PostVisual({
  item,
  variant,
}: {
  item: MediaItem;
  variant: MediaVariant;
}) {
  const slides = item.children ?? [];
  const isCarousel =
    normalizeMediaType(item.mediaType) === "CAROUSEL" && slides.length > 1;

  // A deleted post is not even requested: the link is gone, and asking would
  // trade the placeholder for a broken image.
  if (item.deletedAt !== undefined) {
    return (
      <div className="absolute inset-0 opacity-50">
        <MediaFallback type={item.mediaType} variant={variant} />
      </div>
    );
  }

  if (isCarousel) {
    return (
      <CarouselSwiper
        mediaId={item.mediaId}
        slides={slides}
        caption={item.caption}
        variant={variant}
      />
    );
  }

  return (
    <PostImage
      src={igMediaSrc(item.mediaId)}
      alt={item.caption || "Instagram objava"}
      type={item.mediaType}
      variant={variant}
      zoomOnHover
    />
  );
}

/**
 * The post is gone from Instagram, and the row stays anyway — its numbers are
 * still a true statement about the past. The date is when we first noticed,
 * not when it was taken down; Instagram never tells us the latter.
 */
function DeletedNotice({ at }: { at: number }) {
  return (
    <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-bg-950/85 px-2.5 py-1 backdrop-blur-md">
      <Trash2 className="size-3 shrink-0 text-danger" aria-hidden />
      <span className="text-micro font-semibold text-danger">
        Obrisano sa Instagrama
      </span>
      <span className="ml-auto shrink-0 font-mono text-micro tabular-nums text-text-muted">
        {formatPostDate(at)}
      </span>
    </div>
  );
}

/** The red edge that marks the whole card, not just its picture. */
function DeletedEdge() {
  return (
    <span aria-hidden className="absolute inset-y-0 left-0 z-10 w-1 bg-danger" />
  );
}

/** Replaces the Instagram link on a deleted post — the permalink 404s now. */
function GonePost({ className }: { className?: string }) {
  return (
    <span className={cn("text-xs font-medium text-text-muted", className)}>
      Objava više ne postoji
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
  // Off by default on purpose: what disappeared is information, not noise.
  const [hideDeleted, setHideDeleted] = useState(false);

  const deletedCount = useMemo(
    () => media.filter((m) => m.deletedAt !== undefined).length,
    [media],
  );

  const visible = useMemo(
    () => (hideDeleted ? media.filter((m) => m.deletedAt === undefined) : media),
    [media, hideDeleted],
  );

  const topThree = useMemo(
    () => [...visible].sort((a, b) => b.reach - a.reach).slice(0, 3),
    [visible],
  );

  const sortedMedia = useMemo(
    () => [...visible].sort((a, b) => compareMedia(a, b, sort)),
    [visible, sort],
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
    return null;
  }

  return (
    <div className="flex flex-col gap-8">
      {/* ── Top Sadržaj (Top 3 by Reach) Strip ───────────────────────────── */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
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

          {deletedCount > 0 && (
            <Toggle
              variant="outline"
              size="sm"
              pressed={hideDeleted}
              onPressedChange={setHideDeleted}
              className="gap-1.5 text-text-muted aria-pressed:text-foreground"
            >
              <EyeOff className="size-3.5" aria-hidden />
              <span>Sakrij obrisane</span>
              <CountUp
                value={deletedCount}
                format={formatNumber}
                className="font-mono text-text-muted"
              />
            </Toggle>
          )}
        </div>

        {visible.length === 0 ? (
          <EmptyState icon={EyeOff}>
            Sve objave iz ovog izbora su obrisane sa Instagrama. Isključi filter
            da bi ih video.
          </EmptyState>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {topThree.map((item, idx) => (
              <TopContentCard key={item._id} item={item} rank={idx + 1} />
            ))}
          </div>
        )}
      </div>

      {/* ── All Posts Grid with Sort Controls ────────────────────────────── */}
      {/* Scope stoji IZNAD grane sa praznim stanjem: kad se filter „sakrij
          obrisane" isprazni pa ponovo napuni, to nije pedeset dolazaka nego
          ponovo nacrtan ekran. `resetKey` isto to radi za promenu sortiranja i
          filtera — pamćenje viđenih redova kreće ispočetka, i ništa ne leti. */}
      <ArrivalScope resetKey={`${sort.key}|${sort.dir}|${String(hideDeleted)}`}>
      {visible.length > 0 && (
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

          {/* Objava koja stigne dok je ekran otvoren ulazi kratkim uvodom, ne
              punim reveal-om: nov podatak ne sme da izgleda kao da se stranica
              ponovo učitala. Kartice iz prvog kadra pripadaju ekranu i njih
              otkriva <Reveal> iznad. Dolazak se vezuje za `mediaId`, ne za
              montiranje: kartica koja je već bila na ekranu ne animira se
              ponovo ni posle promene sortiranja. */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sortedMedia.map((item) => (
              <Arrive key={item._id} id={item.mediaId} className="h-full">
                <PostCard item={item} />
              </Arrive>
            ))}
          </div>
        </div>
      )}
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
      <Icon className="size-3" aria-hidden />
    </Button>
  );
}

/**
 * Top Content Card: visually elevated card with rank pill, prominent reach,
 * and high-impact metrics.
 */
function TopContentCard({ item, rank }: { item: MediaItem; rank: number }) {
  const deleted = item.deletedAt !== undefined;

  return (
    <Card
      className={cn(
        "group relative flex flex-col justify-between overflow-hidden p-0 shadow-card hover-lift",
        deleted
          ? "ring-danger/40 bg-surface"
          : rank === 1
            ? "border-accent-400/40 bg-gradient-to-b from-surface-raised to-surface"
            : "border-line bg-surface",
      )}
    >
      {deleted && <DeletedEdge />}

      {/* Visual Header / Placeholder */}
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-bg-900 border-b border-line-soft">
        <PostVisual item={item} variant="top" />

        {/* Rank Badge */}
        <div className="absolute top-3 left-3">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold shadow-md",
              rank === 1 && !deleted
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

        {deleted ? (
          <DeletedNotice at={item.deletedAt ?? 0} />
        ) : (
          <div className="absolute bottom-2 left-3">
            <span className="text-micro font-mono text-text-muted bg-bg-950/70 backdrop-blur-xs px-2 py-0.5 rounded">
              {formatPostDate(item.publishedAt)}
            </span>
          </div>
        )}
      </div>

      {/* Card Content */}
      <div className="flex flex-1 flex-col p-4">
        {/* Caption */}
        <p className="line-clamp-2 text-xs leading-relaxed text-foreground/90">
          {item.caption ? (
            item.caption
          ) : (
            <span className="text-text-muted italic">Bez opisa</span>
          )}
        </p>

        {/* Highlighted Reach Stat — still exact, so never struck through */}
        <div className="mt-4 flex items-baseline justify-between rounded-lg bg-surface-raised/60 border border-line-soft px-3 py-2">
          <span className="text-xs font-medium text-text-muted">
            Ukupan doseg
          </span>
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

        {/* Link Button — nothing to open once the post is gone */}
        {deleted ? (
          <span className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-md border border-line-soft bg-surface-raised/20 py-1.5">
            <GonePost />
          </span>
        ) : (
          item.permalink && (
            <a
              href={item.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-md border border-line-soft bg-surface-raised/40 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-line-strong hover:bg-surface-raised hover:text-foreground"
            >
              <span>Pogledaj na Instagramu</span>
              <ExternalLink className="size-3" aria-hidden />
            </a>
          )
        )}
      </div>
    </Card>
  );
}

/**
 * Standard Post Card for the 30-post grid.
 */
function PostCard({ item }: { item: MediaItem }) {
  const deleted = item.deletedAt !== undefined;

  return (
    <Card
      className={cn(
        "group relative flex h-full flex-col justify-between overflow-hidden p-0 shadow-card hover-lift",
        deleted && "ring-danger/40",
      )}
    >
      {deleted && <DeletedEdge />}

      {/* Header Visual / Placeholder */}
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-bg-900 border-b border-line-soft">
        <PostVisual item={item} variant="grid" />

        {/* Badges on Visual */}
        <div className="absolute top-2.5 left-2.5">
          <TypeBadge type={item.mediaType} />
        </div>

        <div className="absolute top-2.5 right-2.5">
          <span className="rounded bg-bg-950/80 px-2 py-0.5 font-mono text-micro text-text-muted backdrop-blur-md">
            {formatPostDate(item.publishedAt)}
          </span>
        </div>

        {deleted && <DeletedNotice at={item.deletedAt ?? 0} />}
      </div>

      {/* Post Body */}
      <div className="flex flex-1 flex-col p-4">
        <p className="line-clamp-2 min-h-8 text-xs leading-relaxed text-foreground/90">
          {item.caption ? (
            item.caption
          ) : (
            <span className="text-text-muted italic">Bez opisa</span>
          )}
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
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-line-soft pt-3 text-xs">
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

          {deleted ? (
            <GonePost />
          ) : (
            item.permalink && (
              <a
                href={item.permalink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-text-secondary hover:text-accent-400 transition-colors"
              >
                <span>Otvori</span>
                <ExternalLink className="size-3" aria-hidden />
              </a>
            )
          )}
        </div>

        {/* Moderation, on the post it is about (F4). */}
        <PostCommentsPanel
          mediaId={item.mediaId}
          commentCount={item.comments}
          commentsEnabled={item.commentsEnabled}
          deleted={deleted}
        />
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
