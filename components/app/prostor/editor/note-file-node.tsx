"use client";

// Preneto iz Devotion apps/web/components/workspace/files/note-file-node.tsx (main @ c05c40f), SPAJANJE S10.
import { useState } from "react";
import {
  mergeAttributes,
  Node,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import {
  Download,
  Eye,
  FileQuestion,
  FileText,
  GripVertical,
  Table2,
  X,
} from "lucide-react";

import { useNoteAttachments } from "@/components/app/prostor/editor/prilozi-kontekst";
import { fileKindLabel, formatFileSize, type PageFileCategory } from "@/lib/prostor/web/vrste-stranica";

const KNOWN_CATEGORIES = new Set<PageFileCategory>([
  "image",
  "video",
  "pdf",
  "audio",
  "sheet",
  "document",
]);

function parseCategory(value: string | null): PageFileCategory | null {
  return value !== null && KNOWN_CATEGORIES.has(value as PageFileCategory)
    ? (value as PageFileCategory)
    : null;
}

const CARD_ICONS: Partial<
  Record<PageFileCategory, React.ComponentType<{ className?: string }>>
> = {
  pdf: FileText,
  sheet: Table2,
  document: FileText,
};

function UnavailableCard({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed border-line-soft bg-muted/20 px-4 py-3">
      <FileQuestion
        className="size-5 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{name || "Prilog"}</p>
        <p className="text-xs text-muted-foreground">Fajl nije dostupan.</p>
      </div>
    </div>
  );
}

/**
 * Prikaz jednog priloga u telu beleške. URL nikad nije u dokumentu — čita se
 * iz `NoteAttachmentsContext` (reaktivan `pageFiles.list`), pa važi i posle
 * ponovnog učitavanja. Bez providera ili bez reda u spisku (sadržaj nalepljen
 * iz druge beleške, obrisan prilog vraćen undo-om) prikazuje se zamena.
 */
function NoteFileView({ node, editor, deleteNode }: NodeViewProps) {
  const attachments = useNoteAttachments();
  const fileId =
    typeof node.attrs.fileId === "string" ? node.attrs.fileId : null;
  const row =
    fileId !== null && attachments?.files !== undefined
      ? attachments.files.find((file) => file._id === fileId)
      : undefined;
  const loading = attachments !== null && attachments.files === undefined;

  const category = row?.category ?? parseCategory(node.attrs.category ?? null);
  const name = String(row?.name ?? node.attrs.name ?? "");
  const size = Number(row?.size ?? node.attrs.size ?? 0);
  const url = row?.url ?? null;
  // Pregledač koji ne ume da dekodira medij (HEIC/HEVC van Safarija) sruši
  // `<img>`/`<video>` — tada se prikazuje generička kartica sa preuzimanjem.
  // Potpisani URL-ovi rotiraju; novi URL zaslužuje nov pokušaj prikaza, pa se
  // stanje poravnava tokom rendera umesto kroz efekat.
  const [previewFailed, setPreviewFailed] = useState(false);
  const [failedForUrl, setFailedForUrl] = useState(url);
  if (failedForUrl !== url) {
    setFailedForUrl(url);
    setPreviewFailed(false);
  }

  let body: React.ReactNode;
  if (row === undefined && loading) {
    body = <div className="h-16 animate-pulse rounded-xl bg-muted/40" />;
  } else if (row === undefined) {
    body = <UnavailableCard name={name} />;
  } else if (category === "image" && url !== null && !previewFailed) {
    body = (
      <button
        type="button"
        className="block w-full cursor-zoom-in rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Otvori pregled: ${name}`}
        onClick={() => attachments?.openFile(row._id)}
      >
        {/* Prilozi stižu sa udaljenog Convex URL-a; `next/image` se u projektu
            ne koristi (vidi `file-viewer-dialog.tsx`). */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={name}
          loading="lazy"
          onError={() => setPreviewFailed(true)}
          className="mx-auto max-h-[28rem] w-auto max-w-full rounded-xl border border-line-soft object-contain"
        />
      </button>
    );
  } else if (category === "video" && url !== null && !previewFailed) {
    body = (
      <video
        src={url}
        controls
        preload="metadata"
        onError={() => setPreviewFailed(true)}
        className="mx-auto max-h-[28rem] w-full rounded-xl bg-background"
      >
        <track kind="captions" />
      </video>
    );
  } else if (category === "audio" && url !== null) {
    body = (
      <div className="rounded-xl border border-line-soft bg-card px-3 py-2.5">
        <p className="mb-1.5 truncate text-xs font-semibold">{name}</p>
        <audio src={url} controls className="w-full" />
      </div>
    );
  } else if (
    (category === "image" || category === "video" || category === "audio") &&
    url === null
  ) {
    // Medij bez URL-a — blob je nestao iz skladišta.
    body = <UnavailableCard name={name} />;
  } else {
    const Icon = (category !== null ? CARD_ICONS[category] : null) ?? FileQuestion;
    body = (
      <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-line-soft bg-card px-3 py-2.5">
        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{name}</span>
          <span className="text-meta text-muted-foreground">
            {previewFailed
              ? "Pregled nije podržan u ovom pregledaču."
              : `${fileKindLabel(category)} · ${formatFileSize(size)}`}
          </span>
        </span>
        <button
          type="button"
          className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-control-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Otvori pregled: ${name}`}
          title="Otvori pregled"
          onClick={() => attachments?.openFile(row._id)}
        >
          <Eye className="size-4" />
        </button>
        {url !== null ? (
          <a
            href={url}
            download={name}
            className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-control-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Preuzmi: ${name}`}
            title="Preuzmi"
          >
            <Download className="size-4" />
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <NodeViewWrapper
      className="group relative my-3.5"
      data-note-file-view=""
    >
      {editor.isEditable ? (
        <div
          className="absolute -right-1 -top-2.5 z-10 flex items-center gap-0.5 rounded-lg border border-line-soft bg-background/95 p-0.5 opacity-0 shadow-sm backdrop-blur transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [@media(pointer:coarse)]:opacity-100"
          contentEditable={false}
        >
          <span
            data-drag-handle
            className="inline-flex size-7 cursor-grab items-center justify-center rounded-md text-muted-foreground hover:bg-surface-control-hover hover:text-foreground"
            title="Prevuci prilog"
            aria-hidden="true"
          >
            <GripVertical className="size-3.5" />
          </span>
          <button
            type="button"
            className="inline-flex size-7 items-center justify-center rounded-md pointer-coarse:size-11 text-muted-foreground hover:bg-surface-control-hover hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Ukloni iz beleške"
            title="Ukloni iz beleške"
            onClick={() => deleteNode()}
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : null}
      {body}
    </NodeViewWrapper>
  );
}

/**
 * Atom blok za prilog u telu beleške. U HTML se upisuju samo `data-*` atributi
 * (id, kategorija, ime, veličina) — nikad URL. Ime je i tekstualno dete, pa ga
 * `canvasPreview`/`pageEntryDisplayText` (koji samo skidaju tagove) zadrže.
 */
export const NoteFile = Node.create({
  name: "noteFile",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      fileId: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-file-id"),
        renderHTML: (attrs: { fileId?: string | null }) =>
          attrs.fileId ? { "data-file-id": attrs.fileId } : {},
      },
      category: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          parseCategory(element.getAttribute("data-category")),
        renderHTML: (attrs: { category?: string | null }) =>
          attrs.category ? { "data-category": attrs.category } : {},
      },
      name: {
        default: "",
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-name") ?? element.textContent ?? "",
        renderHTML: (attrs: { name?: string }) => ({
          "data-name": attrs.name ?? "",
        }),
      },
      size: {
        default: 0,
        parseHTML: (element: HTMLElement) =>
          Number(element.getAttribute("data-size")) || 0,
        renderHTML: (attrs: { size?: number }) => ({
          "data-size": String(attrs.size ?? 0),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-note-file]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes({ "data-note-file": "" }, HTMLAttributes),
      String(node.attrs.name ?? ""),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(NoteFileView);
  },
});
