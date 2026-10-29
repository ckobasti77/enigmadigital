"use client";

// Preneto iz Devotion apps/web/components/workspace/files/note-attachments.tsx (main @ c05c40f), SPAJANJE S11.
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { toast } from "@/lib/toast";

import { FileViewerDialog, type ViewableFile } from "@/components/app/prostor/prilozi/file-viewer-dialog";
import {
  NoteAttachmentsContext,
  type NoteAttachmentRow,
} from "@/components/app/prostor/editor/prilozi-kontekst";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { uploadPageFile, type AttachedPageFile } from "@/lib/prostor/web/page-files";
import { useProjekatMutation } from "@/components/app/projekat-provider";

export type { NoteAttachmentRow };

/**
 * Prilozi u telu beleške: puni kontekst uređivača (`editor/prilozi-kontekst`)
 * spiskom iz `pageFiles.list` i otvara pregledač fajlova umesto nove kartice.
 * Prikazi blokova žive u portalima ispod `EditorContent`, pa ih kontekst oko
 * `RichTextEditor`-a dosegne.
 */
export function NoteAttachmentsProvider({
  files,
  children,
}: {
  files: NoteAttachmentRow[] | undefined;
  children: ReactNode;
}) {
  const [openFileId, setOpenFileId] = useState<string | null>(null);
  const openFile = useCallback((fileId: string) => setOpenFileId(fileId), []);
  const value = useMemo(() => ({ files, openFile }), [files, openFile]);

  return (
    <NoteAttachmentsContext.Provider value={value}>
      {children}
      <FileViewerDialog
        files={(files ?? []) as ViewableFile[]}
        openFileId={openFileId}
        onOpenChange={setOpenFileId}
      />
    </NoteAttachmentsContext.Provider>
  );
}

/**
 * Otpremanje priloga za telo beleške. Vraća `null` umesto funkcije kad stranica
 * ne prima fajlove (nema je još, ili korisnik ne sme da menja telo) — uređivač
 * tada ne nudi otpremanje. Greške javlja sam, u istom obliku kao panel fajlova.
 */
export function useNoteFileUpload(pageId: Id<"pages"> | null) {
  const generateUploadUrl = useProjekatMutation(api.prostor.pageFiles.generateUploadUrl);
  const attach = useProjekatMutation(api.prostor.pageFiles.attach);

  return useMemo(() => {
    if (pageId === null) return null;
    return async (file: File): Promise<AttachedPageFile | null> => {
      try {
        return await uploadPageFile({ pageId, file, generateUploadUrl, attach });
      } catch (error) {
        toast.error(
          error instanceof Error ? `„${file.name}“: ${error.message}` : `„${file.name}“ nije dodat.`,
        );
        return null;
      }
    };
  }, [pageId, generateUploadUrl, attach]);
}
