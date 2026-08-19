"use client";

import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Film,
  Image as ImageIcon,
  Link2,
  MessageCircle,
  MousePointerClick,
  Share2,
  ThumbsUp,
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
import { EmptyState } from "@/components/app/empty-state";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FbPostCommentsPanel } from "./fb-post-comments-panel";

export type FbPostItem =
  FunctionReturnType<typeof api.facebookStore.postsList>[number];

type SortKey = "impressions" | "likes" | "publishedAt";
type SortDirection = "asc" | "desc";
type SortState = { key: SortKey; dir: SortDirection };

const DEFAULT_SORT: SortState = { key: "publishedAt", dir: "desc" };

function formatPostDate(timestamp: number): string {
  if (!timestamp) return "—";
  return new Date(timestamp).toLocaleDateString("sr-Latn-RS", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Meta's `status_type` in a word a person recognises.
 *
 * The raw values are things like `added_photos` and `shared_story`, which are
 * accurate and unreadable. Anything not in the list keeps its own name rather
 * than being flattened into "Objava" — a type we have not met before is
 * information, not noise.
 */
const STATUS_LABELS: Record<string, string> = {
  added_photos: "Slika",
  added_video: "Video",
  mobile_status_update: "Status",
  shared_story: "Deljeno",
  created_note: "Beleška",
  published_story: "Objava",
};

function TypeBadge({ statusType }: { statusType: string }) {
  const label = STATUS_LABELS[statusType] ?? statusType;
  const Icon =
    statusType === "added_video"
      ? Film
      : statusType === "added_photos"
        ? ImageIcon
        : statusType === "shared_story"
          ? Link2
          : FileText;

  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-bg-950/80 px-2 py-0.5 text-micro font-semibold text-text-primary backdrop-blur-md">
      <Icon className="size-3 text-accent-400" aria-hidden />
      {label}
    </span>
  );
}

/**
 * The picture of a post.
 *
 * `full_picture` is an ordinary Facebook link that keeps working, unlike
 * Instagram's signed CDN URLs — so this renders it directly and there is no
 * `/fb-media/` proxy to write.
 */
function PostImage({ src, alt }: { src?: string; alt: string }) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    src ? "loading" : "error",
  );

  return (
    <>
      {src && status !== "error" && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("error")}
          className={cn(
            "size-full object-cover transition-transform duration-300 group-hover:scale-105",
            status === "loading" && "opacity-0",
          )}
        />
      )}

      {status === "loading" && (
        <Skeleton className="absolute inset-0 size-full rounded-none" />
      )}

      {status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center overflow-hidden bg-gradient-to-br from-bg-900 via-surface to-bg-950 p-4">
          <div className="flex size-10 items-center justify-center rounded-xl border border-line bg-surface-raised/60 text-text-muted transition-colors group-hover:border-line-strong group-hover:text-accent-400">
            <FileText className="size-5" aria-hidden />
          </div>
        </div>
      )}
    </>
  );
}

/**
 * The post is gone from Facebook, and the row stays anyway — its numbers are
 * still a true statement about the past. The date is when we first noticed, not
 * when it was taken down; Facebook never tells us the latter.
 */
function DeletedNotice({ at }: { at: number }) {
  return (
    <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-bg-950/85 px-2.5 py-1 backdrop-blur-md">
      <Trash2 className="size-3 shrink-0 text-danger" aria-hidden />
      <span className="text-micro font-semibold text-danger">
        Obrisano sa Facebook-a
      </span>
      <span className="ml-auto shrink-0 font-mono text-micro tabular-nums text-text-muted">
        {formatPostDate(at)}
      </span>
    </div>
  );
}

function DeletedEdge() {
  return (
    <span aria-hidden className="absolute inset-y-0 left-0 z-10 w-1 bg-danger" />
  );
}

function GonePost({ className }: { className?: string }) {
  return (
    <span className={cn("text-xs font-medium text-text-muted", className)}>
      Objava više ne postoji
    </span>
  );
}

function compare(a: FbPostItem, b: FbPostItem, sort: SortState): number {
  const av = a[sort.key] ?? 0;
  const bv = b[sort.key] ?? 0;
  const res = av < bv ? -1 : av > bv ? 1 : 0;
  return sort.dir === "asc" ? res : -res;
}

export function FacebookContentGrid({ posts }: { posts: FbPostItem[] }) {
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);
  // Off by default on purpose: what disappeared is information, not noise.
  const [hideDeleted, setHideDeleted] = useState(false);

  const deletedCount = useMemo(
    () => posts.filter((p) => p.deletedAt !== undefined).length,
    [posts],
  );

  const visible = useMemo(
    () => (hideDeleted ? posts.filter((p) => p.deletedAt === undefined) : posts),
    [posts, hideDeleted],
  );

  const topThree = useMemo(
    () =>
      [...visible]
        .sort((a, b) => (b.impressions ?? 0) - (a.impressions ?? 0))
        .slice(0, 3),
    [visible],
  );

  const sorted = useMemo(
    () => [...visible].sort((a, b) => compare(a, b, sort)),
    [visible, sort],
  );

  const handleSortChange = (key: SortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "desc" ? "asc" : "desc" }
        : { key, dir: "desc" },
    );
  };

  if (posts.length === 0) return null;

  return (
    <div className="flex flex-col gap-8">
      {/* ── Top sadržaj (3 najprikazivanije objave) ───────────────────────── */}
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
                Najuspešnije 3 objave po broju prikaza
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
            Sve objave iz ovog izbora su obrisane sa Facebook-a. Isključi filter
            da bi ih video.
          </EmptyState>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {topThree.map((post, idx) => (
              <TopPostCard key={post._id} post={post} rank={idx + 1} />
            ))}
          </div>
        )}
      </div>

      {/* ── Sve objave ───────────────────────────────────────────────────── */}
      {visible.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-6">
            <div>
              <h2 className="text-base font-semibold text-foreground">
                Sve objave
              </h2>
              <p className="font-mono text-xs tabular-nums text-text-muted">
                Prikazano {formatNumber(sorted.length)}{" "}
                {sorted.length === 1
                  ? "objava"
                  : sorted.length >= 2 && sorted.length <= 4
                    ? "objave"
                    : "objava"}
              </p>
            </div>

            <div className="flex items-center gap-1.5 rounded-lg border border-line bg-surface p-1 text-xs">
              <span className="px-2 py-1 text-text-muted">Sortiraj po:</span>
              <SortButton
                label="Prikazi"
                active={sort.key === "impressions"}
                dir={sort.dir}
                onClick={() => handleSortChange("impressions")}
              />
              <SortButton
                label="Lajkovi"
                active={sort.key === "likes"}
                dir={sort.dir}
                onClick={() => handleSortChange("likes")}
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
            {sorted.map((post) => (
              <PostCard key={post._id} post={post} />
            ))}
          </div>
        </div>
      )}
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
          ? "bg-surface-raised font-semibold text-accent-400 shadow-xs"
          : "text-text-muted hover:text-foreground",
      )}
    >
      <span>{label}</span>
      <Icon className="size-3" aria-hidden />
    </Button>
  );
}

function PostCaption({ message }: { message: string }) {
  return (
    <p className="line-clamp-2 min-h-8 text-xs leading-relaxed text-foreground/90">
      {message ? (
        message
      ) : (
        <span className="italic text-text-muted">Bez opisa</span>
      )}
    </p>
  );
}

function TopPostCard({ post, rank }: { post: FbPostItem; rank: number }) {
  const deleted = post.deletedAt !== undefined;

  return (
    <Card
      className={cn(
        "group relative flex flex-col justify-between overflow-hidden p-0 shadow-card hover-lift",
        deleted
          ? "bg-surface ring-danger/40"
          : rank === 1
            ? "border-accent-400/40 bg-gradient-to-b from-surface-raised to-surface"
            : "border-line bg-surface",
      )}
    >
      {deleted && <DeletedEdge />}

      <div className="relative aspect-[16/9] w-full overflow-hidden border-b border-line-soft bg-bg-900">
        {deleted ? (
          <div className="absolute inset-0 opacity-50">
            <PostImage alt="" />
          </div>
        ) : (
          <PostImage
            src={post.pictureUrl}
            alt={post.message || "Facebook objava"}
          />
        )}

        <div className="absolute top-3 left-3">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold shadow-md",
              rank === 1 && !deleted
                ? "bg-accent-400 text-text-inverse"
                : "border border-line-strong bg-surface-raised/95 text-foreground backdrop-blur-md",
            )}
          >
            #{rank} Najviše prikaza
          </span>
        </div>

        <div className="absolute top-3 right-3">
          <TypeBadge statusType={post.statusType} />
        </div>

        {deleted ? (
          <DeletedNotice at={post.deletedAt ?? 0} />
        ) : (
          <div className="absolute bottom-2 left-3">
            <span className="rounded bg-bg-950/70 px-2 py-0.5 font-mono text-micro text-text-muted backdrop-blur-xs">
              {formatPostDate(post.publishedAt)}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <PostCaption message={post.message} />

        <div className="mt-4 flex items-baseline justify-between rounded-lg border border-line-soft bg-surface-raised/60 px-3 py-2">
          <span className="text-xs font-medium text-text-muted">
            Ukupno prikaza
          </span>
          <span className="font-mono text-lg font-bold tabular-nums text-accent-400">
            {post.impressions === undefined
              ? "—"
              : formatNumber(post.impressions)}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-4 gap-2 border-t border-line-soft pt-3 text-center">
          <Stat icon={ThumbsUp} label="Lajkovi" value={post.likes} />
          <Stat icon={MessageCircle} label="Komentari" value={post.comments} />
          <Stat icon={Share2} label="Deljenja" value={post.shares} />
          <Stat
            icon={MousePointerClick}
            label="Klikovi"
            value={post.clicks}
          />
        </div>

        {deleted ? (
          <span className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-md border border-line-soft bg-surface-raised/20 py-1.5">
            <GonePost />
          </span>
        ) : (
          post.permalink && (
            <a
              href={post.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-md border border-line-soft bg-surface-raised/40 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-line-strong hover:bg-surface-raised hover:text-foreground"
            >
              <span>Pogledaj na Facebook-u</span>
              <ExternalLink className="size-3" aria-hidden />
            </a>
          )
        )}
      </div>
    </Card>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof ThumbsUp;
  label: string;
  value?: number;
}) {
  return (
    <div>
      <span className="flex items-center justify-center gap-1 text-micro text-text-muted">
        <Icon className="size-3" aria-hidden /> {label}
      </span>
      <p className="mt-0.5 font-mono text-xs font-semibold tabular-nums text-foreground">
        {value === undefined ? "—" : formatNumber(value)}
      </p>
    </div>
  );
}

function PostCard({ post }: { post: FbPostItem }) {
  const deleted = post.deletedAt !== undefined;

  return (
    <Card
      className={cn(
        "group relative flex flex-col justify-between overflow-hidden p-0 shadow-card hover-lift",
        deleted && "ring-danger/40",
      )}
    >
      {deleted && <DeletedEdge />}

      <div className="relative aspect-[16/10] w-full overflow-hidden border-b border-line-soft bg-bg-900">
        {deleted ? (
          <div className="absolute inset-0 opacity-50">
            <PostImage alt="" />
          </div>
        ) : (
          <PostImage
            src={post.pictureUrl}
            alt={post.message || "Facebook objava"}
          />
        )}

        <div className="absolute top-2.5 left-2.5">
          <TypeBadge statusType={post.statusType} />
        </div>

        <div className="absolute top-2.5 right-2.5">
          <span className="rounded bg-bg-950/80 px-2 py-0.5 font-mono text-micro text-text-muted backdrop-blur-md">
            {formatPostDate(post.publishedAt)}
          </span>
        </div>

        {deleted && <DeletedNotice at={post.deletedAt ?? 0} />}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <PostCaption message={post.message} />

        <div className="mt-4 grid grid-cols-3 gap-2 rounded-lg border border-line-soft bg-surface-raised/40 p-2.5 text-center">
          <div>
            <div className="flex items-center justify-center gap-1 text-micro text-text-muted">
              <Eye className="size-3 text-accent-400" />
              <span>Prikazi</span>
            </div>
            <p className="mt-0.5 font-mono text-xs font-semibold tabular-nums text-foreground">
              {post.impressions === undefined
                ? "—"
                : formatNumber(post.impressions)}
            </p>
          </div>

          <div>
            <div className="flex items-center justify-center gap-1 text-micro text-text-muted">
              <Eye className="size-3 text-warning" />
              <span>Doseg</span>
            </div>
            <p className="mt-0.5 font-mono text-xs font-semibold tabular-nums text-foreground">
              {post.reach === undefined ? "—" : formatNumber(post.reach)}
            </p>
          </div>

          <div>
            <div className="flex items-center justify-center gap-1 text-micro text-text-muted">
              <ThumbsUp className="size-3 text-success" />
              <span>Lajkovi</span>
            </div>
            <p className="mt-0.5 font-mono text-xs font-semibold tabular-nums text-foreground">
              {formatNumber(post.likes)}
            </p>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2 border-t border-line-soft pt-3 text-xs">
          <div className="flex items-center gap-3 text-text-muted">
            <span className="inline-flex items-center gap-1 font-mono tabular-nums">
              <MessageCircle className="size-3.5" />
              {formatNumber(post.comments)}
            </span>
            <span className="inline-flex items-center gap-1 font-mono tabular-nums">
              <Share2 className="size-3.5" />
              {formatNumber(post.shares)}
            </span>
          </div>

          {deleted ? (
            <GonePost />
          ) : (
            post.permalink && (
              <a
                href={post.permalink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-text-secondary transition-colors hover:text-accent-400"
              >
                <span>Otvori</span>
                <ExternalLink className="size-3" aria-hidden />
              </a>
            )
          )}
        </div>

        {/* Moderacija i lajk stranice, na objavi na koju se odnose. */}
        <FbPostCommentsPanel
          postId={post.postId}
          commentCount={post.comments}
          likedByUs={post.likedByUs}
          deleted={deleted}
        />
      </div>
    </Card>
  );
}

export function FacebookContentGridSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <Skeleton className="h-6 w-36" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-0 shadow-card">
              <Skeleton className="aspect-[16/9] w-full" />
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
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="p-0 shadow-card">
              <Skeleton className="aspect-[16/10] w-full" />
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
