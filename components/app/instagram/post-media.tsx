"use client";

import { useState } from "react";
import { Camera, Film, Layers } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Shared visual pieces of an Instagram post: the type it is, the placeholder
 * when there is no picture, and the picture itself. Split out of the content
 * grid so the carousel swiper draws its slides from the same source and the two
 * can never drift apart.
 */

export type MediaKind = "REEL" | "CAROUSEL" | "POST";

/** How big the picture is drawn — the placeholder scales with it. */
export type MediaVariant = "top" | "grid";

export function normalizeMediaType(type: string): MediaKind {
  const upper = (type || "").toUpperCase();
  if (upper.includes("REEL") || upper.includes("VIDEO")) return "REEL";
  if (upper.includes("CAROUSEL") || upper.includes("ALBUM")) return "CAROUSEL";
  return "POST";
}

/**
 * Placeholder shown while there is no picture: before one is known to exist,
 * after the proxy answers with an error, and on a post that Instagram no longer
 * has — a deleted post is never even requested.
 */
export function MediaFallback({
  type,
  variant,
}: {
  type: string;
  variant: MediaVariant;
}) {
  const kind = normalizeMediaType(type);
  const Icon = kind === "REEL" ? Film : kind === "CAROUSEL" ? Layers : Camera;

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-bg-900 via-surface to-bg-950 p-4">
      {variant === "top" && (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,var(--accent-glow),transparent_50%)] opacity-30" />
      )}
      <div
        className={cn(
          "flex items-center justify-center rounded-xl border border-line transition-colors",
          variant === "top"
            ? "size-12 bg-surface-raised/80 text-accent-400 shadow-xs"
            : "size-10 bg-surface-raised/60 text-text-muted group-hover:border-line-strong group-hover:text-accent-400",
        )}
      >
        <Icon className={variant === "top" ? "size-6" : "size-5"} />
      </div>
    </div>
  );
}

/**
 * One picture, with its own loading and failure states.
 *
 * `src` always points at the /ig-media/ proxy, never at a stored Instagram CDN
 * link — those are signed and expire. When it is undefined, or the request
 * fails, the placeholder takes over.
 */
export function PostImage({
  src,
  alt,
  type,
  variant,
  zoomOnHover = false,
}: {
  src: string | undefined;
  alt: string;
  type: string;
  variant: MediaVariant;
  /** The grid's slow push-in on card hover. Off inside a swiper, where the
   *  picture is already following a finger. */
  zoomOnHover?: boolean;
}) {
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
            "size-full object-cover",
            zoomOnHover &&
              "transition-transform duration-300 group-hover:scale-105",
            status === "loading" && "opacity-0",
          )}
        />
      )}

      {status === "loading" && (
        <Skeleton className="absolute inset-0 size-full rounded-none" />
      )}

      {status === "error" && <MediaFallback type={type} variant={variant} />}
    </>
  );
}
