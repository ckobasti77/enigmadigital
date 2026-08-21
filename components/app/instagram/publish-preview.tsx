"use client";

import { Camera, CircleDashed, Clock, Film, Layers } from "lucide-react";
import type { ComponentType } from "react";
import {
  KIND_LABELS,
  acceptsCaption,
  type PublishKind,
} from "@/convex/lib/igPublish";
import { Card } from "@/components/ui/card";
import { formatBelgrade } from "@/lib/belgrade-time";
import { cn } from "@/lib/utils";
import type { PickedItem } from "./publish-dropzone";

/**
 * How the post will look — the same card the panel draws, fed from the files
 * still sitting on the operator's machine.
 *
 * The picture is CONTAINED, never cropped to fill. Anything that does not fill
 * the frame is what Instagram is going to cut off, and this is the last moment
 * anyone can see it. A preview that quietly crops to look tidy is a preview
 * that hides the one thing it exists to show.
 */

const KIND_ICONS: Record<PublishKind, ComponentType<{ className?: string }>> = {
  IMAGE: Camera,
  REEL: Film,
  STORY: CircleDashed,
  CAROUSEL: Layers,
};

/** Story is the full screen; everything else sits in the feed's tallest frame. */
function frameClass(kind: PublishKind): string {
  return kind === "STORY" ? "aspect-[9/16]" : "aspect-[4/5]";
}

export function PublishPreview({
  kind,
  items,
  caption,
  scheduledFor,
  userTags,
  audioName,
  locationId,
  isPlacingTag,
  onImageClick,
}: {
  kind: PublishKind;
  items: PickedItem[];
  caption: string;
  scheduledFor: number | null;
  userTags?: Array<{ username: string; x?: number; y?: number }>;
  audioName?: string;
  locationId?: string;
  isPlacingTag?: boolean;
  onImageClick?: (coords: { x: number; y: number }) => void;
}) {
  const Icon = KIND_ICONS[kind];
  const first = items[0];

  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onImageClick || first?.kind !== "image") return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    onImageClick({
      x: Math.round(x * 1000) / 1000,
      y: Math.round(y * 1000) / 1000,
    });
  };

  return (
    <Card className="overflow-hidden p-0 shadow-card">
      <div className="flex items-center justify-between gap-2 border-b border-line-soft px-4 py-2.5">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
          <Icon className="size-3.5 text-accent-400" aria-hidden />
          {KIND_LABELS[kind]}
        </span>
        <span className="font-mono text-micro tabular-nums text-text-muted">
          {scheduledFor === null ? "odmah" : formatBelgrade(scheduledFor)}
        </span>
      </div>

      <div
        onClick={handleContainerClick}
        className={cn(
          "relative w-full overflow-hidden bg-bg-950",
          frameClass(kind),
          isPlacingTag && "cursor-crosshair ring-2 ring-accent-400/50 ring-inset",
        )}
      >
        {first === undefined ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-bg-900 via-surface to-bg-950 px-6 text-center">
            <div className="flex size-10 items-center justify-center rounded-xl border border-line bg-surface-raised/60 text-text-muted">
              <Icon className="size-5" aria-hidden />
            </div>
            <p className="text-micro text-text-muted">
              Pregled se pojavljuje čim dodaš fajl
            </p>
          </div>
        ) : first.kind === "image" ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={first.previewUrl}
              alt="Pregled objave"
              draggable={false}
              className="size-full object-contain pointer-events-none"
            />
            {userTags &&
              userTags.map((tag, idx) => {
                if (typeof tag.x !== "number" || typeof tag.y !== "number") {
                  return null;
                }
                const leftPct = Math.max(4, Math.min(96, tag.x * 100));
                const topPct = Math.max(4, Math.min(96, tag.y * 100));
                return (
                  <div
                    key={`${tag.username}-${idx}`}
                    style={{ left: `${leftPct}%`, top: `${topPct}%` }}
                    className="pointer-events-none absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full border border-white/20 bg-bg-950/85 px-2 py-0.5 text-micro font-medium text-white shadow-md backdrop-blur-sm"
                  >
                    <span className="size-1.5 rounded-full bg-accent-400" />
                    <span>@{tag.username.replace(/^@/, "")}</span>
                  </div>
                );
              })}
            {isPlacingTag && (
              <div className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-bg-950/80 px-2 py-1 text-micro text-accent-400 backdrop-blur-md">
                Klikni na sliku za postavljanje oznake
              </div>
            )}
          </>
        ) : (
          <video
            src={first.previewUrl}
            controls
            muted
            playsInline
            preload="metadata"
            className="size-full object-contain"
          />
        )}

        {items.length > 1 && (
          <span className="absolute right-2.5 top-2.5 rounded-md bg-bg-950/80 px-2 py-0.5 font-mono text-micro tabular-nums text-text-primary backdrop-blur-md">
            1 / {items.length}
          </span>
        )}
      </div>

      {items.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto border-b border-line-soft px-4 py-2.5">
          {items.map((item, index) => (
            <span
              key={item.id}
              className={cn(
                "relative size-9 shrink-0 overflow-hidden rounded-md border",
                index === 0 ? "border-accent-400/60" : "border-line-soft",
              )}
            >
              {item.kind === "image" ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={item.previewUrl}
                  alt=""
                  draggable={false}
                  className="size-full object-cover"
                />
              ) : (
                <video
                  src={item.previewUrl}
                  muted
                  playsInline
                  preload="metadata"
                  className="size-full object-cover"
                />
              )}
            </span>
          ))}
        </div>
      )}

      {(locationId || audioName) && (
        <div className="flex flex-wrap gap-2 border-b border-line-soft px-4 py-2 text-micro text-text-muted">
          {locationId && (
            <span className="inline-flex items-center gap-1 font-mono">
              📍 ID lokacije: {locationId}
            </span>
          )}
          {audioName && (
            <span className="inline-flex items-center gap-1">
              🎵 Zvuk: {audioName}
            </span>
          )}
        </div>
      )}

      <div className="px-4 py-3">
        {acceptsCaption(kind) ? (
          caption.trim().length > 0 ? (
            <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground/90">
              {highlightHashtags(caption)}
            </p>
          ) : (
            <p className="text-xs italic text-text-muted">Bez opisa</p>
          )
        ) : (
          <p className="inline-flex items-center gap-1.5 text-xs text-text-muted">
            <Clock className="size-3.5" aria-hidden />
            Story nestaje posle 24 h i nema opis.
          </p>
        )}
      </div>
    </Card>
  );
}

/**
 * Hashtags in the accent colour, as Instagram itself renders them.
 *
 * Split rather than replaced: the caption is somebody's text and must survive
 * the trip through the preview unchanged, angle brackets and all.
 */
function highlightHashtags(caption: string) {
  const pieces = caption.split(/(#[\p{L}\p{N}_]+)/gu);
  return pieces.map((piece, index) =>
    piece.startsWith("#") ? (
      <span key={index} className="text-accent-400">
        {piece}
      </span>
    ) : (
      <span key={index}>{piece}</span>
    ),
  );
}
