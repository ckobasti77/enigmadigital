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
}: {
  kind: PublishKind;
  items: PickedItem[];
  caption: string;
  scheduledFor: number | null;
}) {
  const Icon = KIND_ICONS[kind];
  const first = items[0];

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
        className={cn(
          "relative w-full overflow-hidden bg-bg-950",
          frameClass(kind),
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
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={first.previewUrl}
            alt="Pregled objave"
            draggable={false}
            className="size-full object-contain"
          />
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
