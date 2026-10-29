"use client";

// Preneto iz Devotion apps/web/components/workspace/files/file-viewer-dialog.tsx (main @ c05c40f), SPAJANJE S11.
import { useState } from "react";
import { ChevronLeft, ChevronRight, Download, FileQuestion } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogPopup,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  fileKindLabel,
  formatFileSize,
  type PageFileCategory,
} from "@/lib/prostor/web/vrste-stranica";

/**
 * Pregledač je veliki prozor: ceo ekran na telefonu, do 64 rem na računaru.
 * (Devotion `workspaceItemDialogContentClass`, prepisan na Enigmine tokene.)
 */
const PREGLEDAC_KLASA =
  "left-0 top-0 h-dvh max-h-dvh w-screen max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-none border-0 p-0 sm:left-1/2 sm:top-1/2 sm:h-[min(90dvh,56rem)] sm:max-h-[min(90dvh,56rem)] sm:w-[calc(100%-2rem)] sm:max-w-5xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:border";

export type ViewableFile = {
  _id: string;
  name: string;
  contentType: string;
  size: number;
  category: PageFileCategory;
  url: string | null;
};

function FileBody({ file }: { file: ViewableFile }) {
  // Pregledač koji ne ume da dekodira medij (HEIC/HEVC van Safarija) sruši
  // `<img>`/`<video>` — tada ostaje kartica sa preuzimanjem. Potpisani URL-ovi
  // rotiraju; novi URL zaslužuje nov pokušaj, pa se stanje poravnava tokom
  // rendera umesto kroz efekat.
  const [previewFailed, setPreviewFailed] = useState(false);
  const [failedForUrl, setFailedForUrl] = useState(file.url);
  if (failedForUrl !== file.url) {
    setFailedForUrl(file.url);
    setPreviewFailed(false);
  }
  if (file.url === null) {
    return (
      <p className="rounded-xl border border-dashed border-line-soft px-4 py-10 text-center text-ui text-text-secondary">
        Fajl više nije dostupan u skladištu.
      </p>
    );
  }
  if (previewFailed && (file.category === "image" || file.category === "video")) {
    return (
      <div className="grid place-items-center gap-3 rounded-xl border border-dashed border-line-soft px-4 py-12 text-center">
        <FileQuestion className="size-8 text-text-muted" aria-hidden="true" />
        <p className="text-ui text-text-secondary">
          Pregled nije podržan u ovom pregledaču. Preuzmi fajl da bi ga otvorio.
        </p>
      </div>
    );
  }
  if (file.category === "image") {
    return (
      // Slike su korisnički prilozi sa udaljenog Convex URL-a; `next/image` se
      // u ovom projektu ne koristi (vidi `components/ui/avatar.tsx`).
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={file.url}
        alt={file.name}
        onError={() => setPreviewFailed(true)}
        className="mx-auto max-h-[70vh] w-auto max-w-full rounded-xl object-contain"
      />
    );
  }
  if (file.category === "video") {
    return (
      <video
        src={file.url}
        controls
        onError={() => setPreviewFailed(true)}
        className="mx-auto max-h-[70vh] w-full rounded-xl bg-background"
      >
        <track kind="captions" />
      </video>
    );
  }
  if (file.category === "audio") {
    return <audio src={file.url} controls className="w-full" />;
  }
  if (file.category === "pdf") {
    // CSP u `next.config.ts` ima `object-src 'none'`, pa `<embed>`/`<object>`
    // ovde ne rade — `<iframe>` je jedini prikaz koji prolazi.
    return (
      <iframe
        src={file.url}
        title={file.name}
        className="h-[70vh] w-full rounded-xl border border-line-soft bg-card"
      />
    );
  }
  return (
    <div className="grid place-items-center gap-3 rounded-xl border border-dashed border-line-soft px-4 py-12 text-center">
      <FileQuestion className="size-8 text-text-muted" aria-hidden="true" />
      <p className="text-ui text-text-secondary">
        Ovaj tip se ne prikazuje u pregledu. Preuzmi ga da bi ga otvorio.
      </p>
    </div>
  );
}

/**
 * Veliki prozor sa galerijom priloga jedne stranice. Otvoreni fajl je u
 * propu — modal nema sopstveno stanje indeksa, pa ne može da odluta od liste
 * kad se prilozi promene ispod njega.
 */
export function FileViewerDialog({
  files,
  openFileId,
  onOpenChange,
}: {
  files: ViewableFile[];
  openFileId: string | null;
  onOpenChange: (fileId: string | null) => void;
}) {
  const index = files.findIndex((candidate) => candidate._id === openFileId);
  const file = index >= 0 ? files[index] : undefined;
  const open = openFileId !== null && file !== undefined;
  const step = (delta: number) => {
    if (files.length === 0) return;
    const next = (index + delta + files.length) % files.length;
    onOpenChange(files[next]._id);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onOpenChange(null);
      }}
    >
      <DialogPopup className={PREGLEDAC_KLASA}>
        {file ? (
          <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto]">
            <DialogHeader className="border-b border-line-soft px-5 py-4 pr-14 sm:px-6 sm:pr-16">
              <DialogTitle className="truncate">{file.name}</DialogTitle>
              <DialogDescription>
                {fileKindLabel(file.category)} · {formatFileSize(file.size)}
                {files.length > 1 ? ` · ${index + 1} od ${files.length}` : ""}
              </DialogDescription>
            </DialogHeader>
            <div className="scrollbar-thin min-h-0 overflow-y-auto px-5 py-5 sm:px-6">
              <FileBody file={file} />
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-line-soft px-5 py-4 sm:px-6">
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={files.length < 2}
                  aria-label="Prethodni fajl"
                  onClick={() => step(-1)}
                >
                  <ChevronLeft aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={files.length < 2}
                  aria-label="Sledeći fajl"
                  onClick={() => step(1)}
                >
                  <ChevronRight aria-hidden="true" />
                </Button>
              </div>
              {file.url ? (
                <Button variant="outline" nativeButton={false} render={<a href={file.url} download={file.name} />}>
                  <Download aria-hidden="true" /> Preuzmi
                </Button>
              ) : null}
            </div>
            <DialogClose />
          </div>
        ) : null}
      </DialogPopup>
    </Dialog>
  );
}
