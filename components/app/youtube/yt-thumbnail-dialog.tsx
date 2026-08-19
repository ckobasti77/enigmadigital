"use client";

import { useEffect, useRef, useState } from "react";
import { useAction, useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { AlertTriangle, Image as ImageIcon, Loader2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  THUMBNAIL_ACCEPT_ATTRIBUTE,
  THUMBNAIL_MAX_BYTES,
  THUMBNAIL_RECOMMENDED_HEIGHT,
  THUMBNAIL_RECOMMENDED_WIDTH,
  checkThumbnailFile,
  formatThumbnailSize,
  thumbnailSizeWarning,
} from "@/convex/lib/ytThumbnail";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { VideoItem } from "./youtube-videos-grid";
import { cn } from "@/lib/utils";

/**
 * Setting a custom thumbnail (Y8).
 *
 * Ceo ekran je jedan okvir 16:9 — isti odnos u kom YouTube prikazuje sličicu —
 * i slika se u njemu vidi cela (`object-contain`), sa crnim trakama tamo gde
 * je neće biti dovoljno. To je jedina poštena provera pre slanja: sve što u
 * ovom okviru izgleda iseceno biće iseceno i u plejeru.
 *
 * Sve što se može proveriti pre slanja proverava se ovde (lib/ytThumbnail.ts),
 * jer `thumbnails.set` košta 50 jedinica i naplaćuje se i kad ne uspe. Jedina
 * provera koja NE zaustavlja slanje je širina ispod 640 px — to je preporuka,
 * ne pravilo, pa se kaže i pusti.
 */

function convexMessage(err: unknown, fallback: string): string {
  if (err instanceof ConvexError) {
    const data = err.data as { message?: string } | undefined;
    if (data && typeof data.message === "string") return data.message;
  }
  if (err instanceof Error && err.message.length > 0) return err.message;
  return fallback;
}

/** What the browser read out of the chosen image. Zeroes until it loads. */
type Dimensions = { width: number; height: number };

export function YtThumbnailDialog({
  open,
  video,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  video: VideoItem;
  onOpenChange: (open: boolean) => void;
  /** Told when a thumbnail actually reached YouTube, so callers can say so. */
  onDone?: () => void;
}) {
  // Remounted on every open: a form still holding the previous image would
  // suggest that upload never finished.
  const [instance, setInstance] = useState(0);
  const [busy, setBusy] = useState(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // A send in flight keeps the dialog open — the request is already
        // costing units and closing would leave nothing on screen to report it.
        if (!next && busy) return;
        if (!next) setInstance((n) => n + 1);
        onOpenChange(next);
      }}
    >
      <DialogPopup className="max-w-lg sm:max-w-lg">
        <YtThumbnailForm
          key={instance}
          video={video}
          onBusyChange={setBusy}
          onClose={() => onOpenChange(false)}
          onDone={onDone}
        />
      </DialogPopup>
    </Dialog>
  );
}

function YtThumbnailForm({
  video,
  onBusyChange,
  onClose,
  onDone,
}: {
  video: VideoItem;
  onBusyChange: (busy: boolean) => void;
  onClose: () => void;
  onDone?: () => void;
}) {
  const generateUploadUrl = useMutation(
    api.ytThumbnails.generateThumbnailUploadUrl,
  );
  const setThumbnail = useAction(api.ytThumbnails.setThumbnail);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<Dimensions | null>(null);
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // One object URL at a time, released as soon as it is replaced. A dialog
  // that leaked these would hold every image the operator tried until reload.
  const objectUrl = useRef<string | null>(null);
  useEffect(() => {
    return () => {
      if (objectUrl.current !== null) URL.revokeObjectURL(objectUrl.current);
    };
  }, []);

  const chooseFile = (chosen: File | null) => {
    if (objectUrl.current !== null) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = chosen === null ? null : URL.createObjectURL(chosen);
    setFile(chosen);
    setPreviewUrl(objectUrl.current);
    setDimensions(null);
    setErrorMsg(null);
  };

  const problem =
    file === null
      ? null
      : checkThumbnailFile({ size: file.size, type: file.type });
  const warning =
    dimensions === null ? null : thumbnailSizeWarning(dimensions);
  const tooBig = file !== null && file.size > THUMBNAIL_MAX_BYTES;

  const handleSubmit = async () => {
    if (file === null || problem !== null) return;
    setSubmitting(true);
    onBusyChange(true);
    setErrorMsg(null);
    try {
      // Into Convex storage first; the action reads it from there, sends it to
      // YouTube and deletes it. The image never carries a YouTube token.
      const url = await generateUploadUrl();
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!res.ok) {
        throw new Error("Slika nije stigla do servera. Pokušaj ponovo.");
      }
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };

      await setThumbnail({ videoId: video.videoId, storageId });
      onDone?.();
      onClose();
    } catch (err) {
      setErrorMsg(convexMessage(err, "Slanje sličice nije uspelo."));
    } finally {
      setSubmitting(false);
      onBusyChange(false);
    }
  };

  return (
    <div className="space-y-4">
      <DialogHeader>
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg border border-accent-400/20 bg-accent-400/10 text-accent-400">
            <ImageIcon className="size-4" />
          </div>
          <div>
            <DialogTitle>Postavi sličicu</DialogTitle>
            <DialogDescription>
              Zamenjuje trenutnu sličicu videa na YouTube-u. Stara se ne čuva.
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      {errorMsg && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-xs leading-relaxed text-danger">
          {errorMsg}
        </div>
      )}

      <div
        onDragOver={(e) => {
          if (submitting) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          if (submitting) return;
          e.preventDefault();
          setDragging(false);
          chooseFile(e.dataTransfer.files?.[0] ?? null);
        }}
        className={cn(
          "relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl border border-dashed bg-bg-950 transition-colors",
          dragging
            ? "border-accent-400/60 bg-accent-400/5"
            : problem !== null
              ? "border-danger/40"
              : "border-line",
        )}
      >
        {previewUrl !== null ? (
          <>
            {/* Contained, not cropped: the black bars are the point. Whatever
                does not fill this frame will be cut or letterboxed by YouTube,
                and this is the last moment to see it. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="Pregled sličice"
              onLoad={(e) =>
                setDimensions({
                  width: e.currentTarget.naturalWidth,
                  height: e.currentTarget.naturalHeight,
                })
              }
              className="size-full object-contain"
            />
            <span className="absolute left-2 top-2 rounded bg-bg-950/80 px-1.5 py-0.5 font-mono text-micro text-text-muted backdrop-blur-md">
              16:9
            </span>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 px-6 text-center">
            <ImageIcon className="size-5 text-text-muted" aria-hidden />
            <p className="text-xs text-text-muted">
              Prevuci sliku ovde ili je izaberi sa računara
            </p>
            <p className="font-mono text-micro tabular-nums text-text-muted/70">
              JPG ili PNG · {THUMBNAIL_RECOMMENDED_WIDTH}×
              {THUMBNAIL_RECOMMENDED_HEIGHT} · do 2 MB
            </p>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            {file === null ? (
              <p className="text-xs text-text-muted">Nije izabrana nijedna slika.</p>
            ) : (
              <>
                <p className="truncate font-mono text-xs text-foreground">
                  {file.name}
                </p>
                <p className="mt-0.5 font-mono text-xs tabular-nums">
                  <span className={tooBig ? "text-danger" : "text-text-muted"}>
                    {formatThumbnailSize(file.size)}
                  </span>
                  {dimensions !== null && (
                    <span className="text-text-muted">
                      {" · "}
                      {dimensions.width}×{dimensions.height} px
                    </span>
                  )}
                </p>
              </>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={submitting}
            onClick={() => document.getElementById("yt-thumbnail-file")?.click()}
            className="shrink-0 border-line-soft text-text-secondary hover:border-line-strong hover:text-foreground"
          >
            {file === null ? "Izaberi sliku" : "Izaberi drugu"}
          </Button>
          <input
            id="yt-thumbnail-file"
            type="file"
            accept={THUMBNAIL_ACCEPT_ATTRIBUTE}
            disabled={submitting}
            onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
            className="sr-only"
          />
        </div>

        {problem !== null && (
          <Note tone="danger">{problem}</Note>
        )}
        {problem === null && warning !== null && (
          <Note tone="warning">{warning}</Note>
        )}
      </div>

      <DialogFooter className="items-center gap-2 border-t border-line pt-3 sm:justify-between">
        <span className="font-mono text-xs tabular-nums text-text-muted">
          50 jedinica kvote
        </span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={submitting}
          >
            Otkaži
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSubmit}
            disabled={submitting || file === null || problem !== null}
            className="bg-accent-400 font-semibold text-surface-dark hover:bg-accent-400/90"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                <span>Šaljem…</span>
              </>
            ) : (
              "Postavi"
            )}
          </Button>
        </div>
      </DialogFooter>
    </div>
  );
}

/** A refusal or a caution, told apart by colour and nothing else. */
function Note({
  tone,
  children,
}: {
  tone: "danger" | "warning";
  children: React.ReactNode;
}) {
  return (
    <p
      className={cn(
        "flex items-start gap-1.5 text-xs leading-relaxed",
        tone === "danger" ? "text-danger" : "text-warning",
      )}
    >
      <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
