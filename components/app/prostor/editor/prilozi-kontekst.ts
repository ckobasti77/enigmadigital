"use client";

import { createContext, useContext } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import type { PageFileCategory } from "@/lib/prostor/web/vrste-stranica";

/**
 * Prilozi u telu beleške (izdvojeno iz Devotion
 * `workspace/files/note-attachments.tsx`, SPAJANJE S10).
 *
 * Kontekst je ovde, a ne kod priloga, da uređivač ne bi zavisio od panela
 * fajlova: blok priloga (`note-file-node.tsx`) samo čita spisak. Stranica ga
 * puni iz `pageFiles.list`; pregled i otpremanje dodaje modul priloga.
 */

/** Red iz `pageFiles.list` — onoliko koliko treba prikazu u telu beleške. */
export type NoteAttachmentRow = {
  _id: Id<"pageFiles">;
  name: string;
  contentType: string;
  size: number;
  category: PageFileCategory;
  url: string | null;
  canManage: boolean;
};

/** Otpremljen prilog koji uređivač ubacuje kao blok (`noteFile`). */
export type AttachedPageFile = {
  fileId: Id<"pageFiles">;
  name: string;
  size: number;
  category: PageFileCategory;
};

export type NoteAttachmentsContextValue = {
  /** `undefined` dok se spisak još učitava. */
  files: NoteAttachmentRow[] | undefined;
  openFile: (fileId: string) => void;
};

/**
 * Prikazi blokova žive u portalima ispod `EditorContent`, pa kontekst oko
 * `RichTextEditor`-a stiže do njih. Bez provajdera (npr. dijalog za novu
 * stranicu) prilozi se prikazuju kao nedostupni.
 */
export const NoteAttachmentsContext = createContext<NoteAttachmentsContextValue | null>(null);

export function useNoteAttachments() {
  return useContext(NoteAttachmentsContext);
}
