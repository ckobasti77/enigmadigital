"use client";

// Preneto iz Devotion apps/web/components/workspace/files/page-files-panel.tsx (main @ c05c40f), SPAJANJE S11.
import { useRef, useState } from "react";
import {
  LoaderCircle,
  Pencil,
  Table2,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "@/lib/toast";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FileViewerDialog,
  type ViewableFile,
} from "@/components/app/prostor/prilozi/file-viewer-dialog";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  MAX_FILE_BYTES,
  MAX_FILES,
  MAX_MEDIA_BYTES,
  uploadPageFile,
} from "@/lib/prostor/web/page-files";
import {
  formatFileSize,
  PAGE_FILE_CATEGORY_LABELS,
  PAGE_KIND_META,
} from "@/lib/prostor/web/vrste-stranica";
import { accessErrorMessage } from "@/lib/prostor/web/greske";
import { cn } from "@/lib/utils";
import { SectionHeading } from "@/components/app/prostor/zajednicko/radni-ui";
import { useProjekatMutation, useProjekatQuery } from "@/components/app/projekat-provider";

/** Radnja reda se vidi na prelaz ili fokus; na dodir uvek. */
const RADNJA_REDA =
  "text-text-secondary opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100";

/**
 * Stranica-fajl (PROSTOR P19, K07 §5.6): prilozi stranice sa prevlačenjem,
 * pregledom, preimenovanjem i uklanjanjem u Korpu (uz „Poništi"). Granice su
 * iz `lib/prostor/ogranicenja` (iste kao na serveru).
 */
export function PageFilesPanel({
  pageId,
  canManage,
  onCreateTableFromFile,
  className,
}: {
  pageId: Id<"pages">;
  canManage: boolean;
  onCreateTableFromFile?: (file: { fileId: Id<"pageFiles">; name: string }) => void;
  className?: string;
}) {
  const files = useProjekatQuery(api.prostor.pageFiles.list, { pageId });
  const generateUploadUrl = useProjekatMutation(api.prostor.pageFiles.generateUploadUrl);
  const attach = useProjekatMutation(api.prostor.pageFiles.attach);
  const renameFile = useProjekatMutation(api.prostor.pageFiles.rename);
  const removeFile = useProjekatMutation(api.prostor.pageFiles.remove);
  const restoreFromTrash = useProjekatMutation(api.prostor.trash.restore);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });
  const uploading = uploadProgress.total > 0;
  const [dragActive, setDragActive] = useState(false);
  const [openFileId, setOpenFileId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<Id<"pageFiles"> | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  async function uploadMany(selected: FileList | File[]) {
    const list = Array.from(selected);
    if (list.length === 0) return;
    setUploadProgress((progress) => ({
      done: progress.done,
      total: progress.total + list.length,
    }));
    let added = 0;
    try {
      for (const file of list) {
        try {
          await uploadPageFile({ pageId, file, generateUploadUrl, attach });
          added += 1;
        } catch (error) {
          toast.error(
            `„${file.name}“: ${accessErrorMessage(error, "nije dodat.")}`,
          );
        } finally {
          setUploadProgress((progress) => {
            const done = progress.done + 1;
            return done >= progress.total
              ? { done: 0, total: 0 }
              : { done, total: progress.total };
          });
        }
      }
      if (added > 0) {
        toast.success(
          added === 1 ? "Fajl je dodat." : `Dodato fajlova: ${added}.`,
        );
      }
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  // Uklanjanje je meko (Korpa, blob ostaje), pa umesto potvrde nudi „Poništi".
  function removeToTrash(fileId: Id<"pageFiles">, name: string) {
    void removeFile({ fileId })
      .then(() =>
        toast.success(`„${name}“ je u Korpi.`, {
          action: {
            label: "Poništi",
            onClick: () =>
              void restoreFromTrash({ target: { kind: "file", id: fileId } }).catch((error: unknown) =>
                toast.error(accessErrorMessage(error, "Fajl nije vraćen.")),
              ),
          },
        }),
      )
      .catch((error: unknown) => toast.error(accessErrorMessage(error, "Fajl nije uklonjen.")));
  }

  const FileIcon = PAGE_KIND_META.file.icon;

  return (
    <section className={cn("space-y-3", className)} aria-labelledby={`page-files-title-${pageId}`}>
      <SectionHeading
        id={`page-files-title-${pageId}`}
        title="Fajlovi"
        count={files === undefined ? null : `${files.length}/${MAX_FILES}`}
      />

      {canManage ? (
        <div
          className={cn(
            "rounded-xl border border-dashed px-4 py-6 text-center transition-colors",
            dragActive
              ? "border-line-strong bg-surface-control-hover"
              : "border-line-soft bg-card",
          )}
          onDragOver={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragActive(false);
            void uploadMany(event.dataTransfer.files);
          }}
        >
          <input
            ref={inputRef}
            id={`page-files-${pageId}`}
            type="file"
            multiple
            className="sr-only"
            onChange={(event) => {
              if (event.target.files) void uploadMany(event.target.files);
            }}
          />
          <FileIcon
            className="mx-auto mb-2 size-6 text-text-muted"
            aria-hidden="true"
          />
          <p className="text-ui text-text-secondary">
            Prevuci fajlove ovde ili ih izaberi. Najviše {MAX_FILES} po stranici,{" "}
            {Math.round(MAX_FILE_BYTES / (1024 * 1024))} MB po fajlu (
            {Math.round(MAX_MEDIA_BYTES / (1024 * 1024))} MB za video).
          </p>
          <Button
            type="button"
            variant="secondary"
            className="mt-3"
            disabled={uploading || (files?.length ?? 0) >= MAX_FILES}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? (
              <LoaderCircle className="animate-spin" aria-hidden="true" />
            ) : (
              <Upload aria-hidden="true" />
            )}
            {uploading && uploadProgress.total > 1
              ? `Otpremanje ${Math.min(uploadProgress.done + 1, uploadProgress.total)}/${uploadProgress.total}…`
              : uploading
                ? "Otpremanje…"
                : "Dodaj fajlove"}
          </Button>
        </div>
      ) : null}

      {files === undefined ? (
        <div role="status" aria-label="Učitavanje fajlova" className="space-y-1">
          <Skeleton className="h-10 rounded-lg" />
          <Skeleton className="h-10 rounded-lg" />
        </div>
      ) : files.length === 0 ? (
        <p className="px-2 py-2 text-ui text-text-secondary">
          Još nema fajlova.
        </p>
      ) : (
        <ul className="space-y-0.5">
          {files.map((file) => (
            <li
              key={file._id}
              className="group flex min-h-10 items-center gap-2 rounded-lg px-2 transition-colors hover:bg-surface-control-hover focus-within:bg-surface-control-hover"
            >
              <FileIcon className="size-4 shrink-0 text-text-muted" aria-hidden="true" />
              {renamingId === file._id ? (
                <Input
                  autoFocus
                  value={renameDraft}
                  aria-label={`Novo ime fajla: ${file.name}`}
                  maxLength={200}
                  className="h-8 min-w-0 flex-1"
                  onBlur={() => setRenamingId(null)}
                  onChange={(event) => setRenameDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setRenamingId(null);
                    if (event.key === "Enter" && renameDraft.trim()) {
                      void renameFile({
                        fileId: file._id,
                        name: renameDraft,
                      })
                        .then(() => setRenamingId(null))
                        .catch((error: unknown) =>
                          toast.error(accessErrorMessage(error, "Ime nije sačuvano.")),
                        );
                    }
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="flex min-h-8 min-w-0 flex-1 items-center gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11"
                  title="Otvori pregled"
                  onClick={() => setOpenFileId(file._id)}
                >
                  <span className="min-w-0 truncate text-ui font-medium text-foreground">
                    {file.name}
                  </span>
                  <span className="shrink-0 text-meta tabular-nums text-text-muted">
                    {PAGE_FILE_CATEGORY_LABELS[file.category]} · {formatFileSize(file.size)}
                  </span>
                </button>
              )}
              {file.category === "sheet" && onCreateTableFromFile ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className={RADNJA_REDA}
                  aria-label={`Napravi tabelu od fajla: ${file.name}`}
                  title="Napravi tabelu od ovog fajla"
                  onClick={() => onCreateTableFromFile({ fileId: file._id, name: file.name })}
                >
                  <Table2 aria-hidden="true" />
                </Button>
              ) : null}
              {file.canManage && renamingId !== file._id ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className={RADNJA_REDA}
                    aria-label={`Preimenuj fajl: ${file.name}`}
                    title="Preimenuj"
                    onClick={() => {
                      setRenamingId(file._id);
                      setRenameDraft(file.name);
                    }}
                  >
                    <Pencil aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className={cn(RADNJA_REDA, "hover:text-danger")}
                    aria-label={`Ukloni fajl u Korpu: ${file.name}`}
                    title="Ukloni u Korpu"
                    onClick={() => removeToTrash(file._id, file.name)}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <FileViewerDialog
        files={(files ?? []) as ViewableFile[]}
        openFileId={openFileId}
        onOpenChange={setOpenFileId}
      />
    </section>
  );
}
