"use client";

import dynamic from "next/dynamic";
import { EditorSkeleton } from "./editor-skeleton";

/**
 * ============================================================================
 * ULAZ UREĐIVAČA (SPAJANJE S10, plan S07 §7.1 i §11)
 * ============================================================================
 *
 * Tiptap (StarterKit, tabele, liste zadataka) je najveći komad radnog dela i
 * čita `window`, pa se učitava samo ovde, dinamički i bez SSR-a. Ljuska,
 * meni i stablo ga nikad ne uvoze; `rich-text-editor.tsx` se ne uvozi
 * direktno ni iz jednog drugog fajla.
 */
export const RichTextEditor = dynamic(
  () => import("./rich-text-editor").then((m) => m.RichTextEditor),
  { ssr: false, loading: () => <EditorSkeleton /> },
);
