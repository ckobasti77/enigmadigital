"use client";

import { useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Film,
  GripVertical,
  ImagePlus,
  X,
} from "lucide-react";
import {
  CAROUSEL_MAX,
  acceptAttribute,
  formatBytes,
  formatSeconds,
  itemRange,
  type PublishKind,
} from "@/convex/lib/igPublish";
import type { PickedKind } from "@/lib/ig-upload";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Picking the files, and — for a carousel — deciding what order they go in.
 *
 * The picker box and the list of picked files are separate boxes on purpose.
 * Dropping a file INTO a list whose rows are themselves draggable means every
 * drag has two plausible meanings, and the browser resolves that ambiguity
 * differently depending on where the pointer happened to be. Two boxes, two
 * unambiguous gestures.
 */

export type PickedItem = {
  /** Stable across reorders; the File object itself is not a usable key. */
  id: string;
  file: File;
  /** Object URL, released by the composer that created it. */
  previewUrl: string;
  kind: PickedKind;
  width?: number;
  height?: number;
  durationSeconds?: number;
};

export function PublishDropzone({
  kind,
  items,
  problems,
  disabled = false,
  onAdd,
  onRemove,
  onReorder,
}: {
  kind: PublishKind;
  items: PickedItem[];
  /** One entry per item, aligned by index; `null` when the file is fine. */
  problems: (string | null)[];
  disabled?: boolean;
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
  onReorder: (from: number, to: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const { max } = itemRange(kind);
  const full = items.length >= max;

  const openPicker = () => {
    if (disabled) return;
    inputRef.current?.click();
  };

  return (
    <div className="space-y-3">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        onClick={openPicker}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openPicker();
          }
        }}
        onDragOver={(event) => {
          if (disabled) return;
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          if (disabled) return;
          event.preventDefault();
          setDragging(false);
          onAdd(Array.from(event.dataTransfer.files ?? []));
        }}
        className={cn(
          "flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-8 text-center transition-colors",
          dragging
            ? "border-accent-400/60 bg-accent-400/5"
            : "border-line bg-bg-950 hover:border-line-strong",
          disabled && "pointer-events-none opacity-50",
        )}
      >
        <ImagePlus className="size-5 text-text-muted" aria-hidden />
        <p className="text-xs text-text-muted">
          {full
            ? `Dodato je najviše fajlova (${max}).`
            : "Prevuci fajl ovde ili ga izaberi sa računara"}
        </p>
        <p className="font-mono text-micro tabular-nums text-text-muted/70">
          {describeAccepted(kind)}
        </p>

        <input
          ref={inputRef}
          type="file"
          // Out of the tab order on purpose: the surrounding box IS the button
          // and answers Enter and Space. Two stops for one control reads as a
          // dead key press to anyone using a keyboard.
          tabIndex={-1}
          className="sr-only"
          accept={acceptAttribute(kind)}
          multiple={kind === "CAROUSEL"}
          onChange={(event) => {
            onAdd(Array.from(event.target.files ?? []));
            // Cleared so picking the same file twice in a row still fires.
            event.target.value = "";
          }}
        />
      </div>

      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((item, index) => (
            <PickedRow
              key={item.id}
              item={item}
              index={index}
              total={items.length}
              problem={problems[index] ?? null}
              reorderable={kind === "CAROUSEL" && items.length > 1}
              disabled={disabled}
              onRemove={() => onRemove(item.id)}
              onReorder={onReorder}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function describeAccepted(kind: PublishKind): string {
  if (kind === "IMAGE") return "JPEG · 4:5 do 1.91:1 · do 8 MB";
  if (kind === "REEL") return "MP4 ili MOV · 3 s do 15 min · do 1 GB";
  if (kind === "STORY") return "JPEG ili MP4/MOV · video do 60 s";
  return `JPEG ili MP4/MOV · 2 do ${CAROUSEL_MAX} fajlova`;
}

function PickedRow({
  item,
  index,
  total,
  problem,
  reorderable,
  disabled,
  onRemove,
  onReorder,
}: {
  item: PickedItem;
  index: number;
  total: number;
  problem: string | null;
  reorderable: boolean;
  disabled: boolean;
  onRemove: () => void;
  onReorder: (from: number, to: number) => void;
}) {
  const [dropSide, setDropSide] = useState<"none" | "over">("none");

  return (
    <li
      draggable={reorderable && !disabled}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", String(index));
      }}
      onDragOver={(event) => {
        if (!reorderable) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setDropSide("over");
      }}
      onDragLeave={() => setDropSide("none")}
      onDrop={(event) => {
        if (!reorderable) return;
        event.preventDefault();
        setDropSide("none");
        const from = Number(event.dataTransfer.getData("text/plain"));
        if (Number.isInteger(from) && from !== index) onReorder(from, index);
      }}
      className={cn(
        "flex items-center gap-3 rounded-xl border bg-surface p-2 transition-colors",
        problem !== null ? "border-danger/40" : "border-line",
        dropSide === "over" && "border-accent-400/60 bg-accent-400/5",
      )}
    >
      {reorderable && (
        <GripVertical
          className="size-4 shrink-0 cursor-grab text-text-muted"
          aria-hidden
        />
      )}

      <div className="relative size-12 shrink-0 overflow-hidden rounded-lg border border-line-soft bg-bg-900">
        {item.kind === "image" ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={item.previewUrl}
            alt=""
            className="size-full object-cover"
            draggable={false}
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
        {item.kind === "video" && (
          <span className="absolute bottom-0.5 right-0.5 rounded bg-bg-950/85 p-0.5">
            <Film className="size-2.5 text-text-primary" aria-hidden />
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-foreground">
          {reorderable && (
            <span className="mr-1.5 font-mono text-micro text-text-muted">
              {index + 1}.
            </span>
          )}
          {item.file.name}
        </p>
        <p className="font-mono text-micro tabular-nums text-text-muted">
          {describeItem(item)}
        </p>
        {problem !== null && (
          <p className="mt-1 text-micro leading-relaxed text-danger">
            {problem}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        {reorderable && (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              disabled={disabled || index === 0}
              onClick={() => onReorder(index, index - 1)}
              aria-label={`Pomeri ${index + 1}. fajl unapred`}
            >
              <ChevronUp />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              disabled={disabled || index === total - 1}
              onClick={() => onReorder(index, index + 1)}
              aria-label={`Pomeri ${index + 1}. fajl unazad`}
            >
              <ChevronDown />
            </Button>
          </>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          disabled={disabled}
          onClick={onRemove}
          aria-label={`Ukloni ${item.file.name}`}
          className="text-text-muted hover:text-danger"
        >
          <X />
        </Button>
      </div>
    </li>
  );
}

function describeItem(item: PickedItem): string {
  const parts = [formatBytes(item.file.size)];
  if (item.width && item.height) parts.push(`${item.width}×${item.height}`);
  if (item.durationSeconds) parts.push(formatSeconds(item.durationSeconds));
  return parts.join(" · ");
}
