"use client";

// Preneto iz Devotion apps/web/components/workspace/page/use-page-autosave.ts (main @ c05c40f), SPAJANJE S10.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { htmlToPlainText } from "@/lib/prostor/revisions";
import { toast } from "@/lib/toast";

import {
  activatePageRevision,
  createPageRevisionLedger,
  readPageRevision,
  resolvePageRevision,
  type PageRevisionLedger,
} from "@/lib/prostor/modeli/task-instructions-draft";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { accessErrorMessage } from "@/lib/prostor/web/greske";

import {
  AUTOSAVE_MAX_RETRIES,
  autosaveDelay,
  conflictFromError,
  createSerialQueue,
  shouldAcceptRemote,
  stateAfterEdit,
  stateAfterFailure,
  stateAfterSuccess,
  type ConflictInfo,
  type PageEditorSaveState,
} from "@/lib/prostor/modeli/page-autosave-model";
import { useProjekatMutation } from "@/components/app/projekat-provider";

/** Vadi id-jeve priloga iz HTML tela beleške (`data-file-id` na `noteFile` blokovima). */
export function extractNoteFileIds(html: string): string[] {
  if (!html.includes("data-note-file")) return [];
  const parsed = new DOMParser().parseFromString(html, "text/html");
  return Array.from(parsed.querySelectorAll("[data-note-file]"))
    .map((element) => element.getAttribute("data-file-id") ?? "")
    .filter((id) => id !== "");
}

export type AutosavePage = {
  _id: Id<"pages">;
  kind: string;
  title: string;
  content: string;
  revision: number;
  permissions: { canEdit: boolean };
};

type Draft = { title: string; content: string };

/**
 * Automatsko čuvanja naslova i tela stranice (PROSTOR K10, izdvojeno iz
 * `page-editor-view.tsx` bez promene logike): jedan red poziva, 650 ms posle
 * poslednjeg kucanja, `areasV2.updatePage({ expectedRevision })`. Konflikt
 * zaustavlja čuvanje i čeka odluku („Učitaj najnoviju" / „Prepiši"); greška se
 * ponavlja posle pauze. Za beleške posle uspeha sklanja priloge izbačene iz
 * tela (`pageFiles.prune`, server ih ne briše). Zadatak kroz `runPageUpdate`
 * deli isti red i istu reviziju (osobine zadatka).
 */
export function usePageAutosave({
  pageId,
  page,
  noteFileCount = 0,
}: {
  pageId: Id<"pages">;
  page: AutosavePage | undefined;
  noteFileCount?: number;
}) {
  const updatePage = useProjekatMutation(api.prostor.areasV2.updatePage);
  const pruneNoteFiles = useProjekatMutation(api.prostor.pageFiles.prune);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [draftPageId, setDraftPageId] = useState<Id<"pages"> | null>(null);
  const [saveState, setSaveState] = useState<PageEditorSaveState>("saved");
  const [conflict, setConflict] = useState<ConflictInfo | null>(null);
  const [autosaveTick, setAutosaveTick] = useState(0);
  // Neuspesi zaredom (ponovni pokušaj staje posle `AUTOSAVE_MAX_RETRIES`).
  const [failures, setFailures] = useState(0);
  const loadedPageId = useRef<string | null>(null);
  const activePageIdRef = useRef<string>(pageId);
  const baseRevisionRef = useRef(0);
  const localVersionRef = useRef(0);
  const saveInFlightRef = useRef(false);
  const saveQueuedRef = useRef(false);
  const saveNowRef = useRef(false);
  const failureStreakRef = useRef(0);
  const enqueueRef = useRef(createSerialQueue());
  const ledgerRef = useRef<PageRevisionLedger>(createPageRevisionLedger(pageId, 0));
  const latestDraftRef = useRef<Draft>({ title: "", content: "" });
  // Ogledalo za efekat čuvanja — broj priloga ne sme da mu širi zavisnosti.
  const noteFileCountRef = useRef(noteFileCount);
  useEffect(() => {
    noteFileCountRef.current = noteFileCount;
  }, [noteFileCount]);

  const enqueuePageUpdate = useCallback(
    <Result,>(operation: () => Promise<Result>) => enqueueRef.current(operation),
    [],
  );

  useLayoutEffect(() => {
    activePageIdRef.current = pageId;
    activatePageRevision(ledgerRef.current, pageId);
  }, [pageId]);

  useEffect(() => {
    if (!page) return;

    if (loadedPageId.current !== page._id) {
      loadedPageId.current = page._id;
      activePageIdRef.current = page._id;
      activatePageRevision(ledgerRef.current, page._id, page.revision);
      baseRevisionRef.current = readPageRevision(ledgerRef.current, page._id, page.revision);
      localVersionRef.current = 0;
      saveQueuedRef.current = false;
      failureStreakRef.current = 0;
      setFailures(0);
      const remoteDraft = { title: page.title, content: page.content };
      latestDraftRef.current = remoteDraft;
      setTitle(remoteDraft.title);
      setContent(remoteDraft.content);
      setDraftPageId(page._id);
      setSaveState("saved");
      setConflict(null);
      return;
    }

    if (
      !shouldAcceptRemote({
        saveState,
        baseRevision: baseRevisionRef.current,
        remote: { revision: page.revision, title: page.title, content: page.content },
        draft: latestDraftRef.current,
      })
    ) {
      return;
    }
    activatePageRevision(ledgerRef.current, page._id, page.revision);
    baseRevisionRef.current = readPageRevision(ledgerRef.current, page._id, page.revision);
    const remoteDraft = { title: page.title, content: page.content };
    latestDraftRef.current = remoteDraft;
    setTitle(remoteDraft.title);
    setContent(remoteDraft.content);
  }, [page, saveState]);

  useEffect(() => {
    if (!page || !page.permissions.canEdit) return;
    const delay = autosaveDelay(saveState, saveNowRef.current, failures);
    if (delay === null) return;
    const timer = window.setTimeout(async () => {
      saveNowRef.current = false;
      if (saveInFlightRef.current) {
        saveQueuedRef.current = true;
        return;
      }

      const snapshot = {
        title: latestDraftRef.current.title.trim(),
        content: latestDraftRef.current.content,
      };
      if (!snapshot.title) return;

      const requestPageId = pageId;
      const fallbackRevision = baseRevisionRef.current;
      const snapshotVersion = localVersionRef.current;
      saveInFlightRef.current = true;
      saveQueuedRef.current = false;
      setSaveState("saving");
      let conflictDetected = false;

      try {
        const result = await enqueuePageUpdate(() =>
          updatePage({
            pageId: requestPageId,
            title: snapshot.title,
            content: snapshot.content,
            expectedRevision: readPageRevision(ledgerRef.current, requestPageId, fallbackRevision),
          }),
        );
        const activeRevision = resolvePageRevision(ledgerRef.current, requestPageId, result.revision);
        if (activePageIdRef.current !== requestPageId) return;

        if (activeRevision !== null) baseRevisionRef.current = activeRevision;
        failureStreakRef.current = 0;
        setFailures(0);
        setConflict(null);
        setSaveState(stateAfterSuccess(localVersionRef.current, snapshotVersion));
        // Tek posle uspešnog čuvanja se sklanjaju prilozi izbačeni iz tela. Unija
        // sačuvanog snimka i živog nacrta štiti upload koji je stigao posle
        // snimka; server dodatno ne dira redove mlađe od grace perioda.
        if (page.kind === "note" && noteFileCountRef.current > 0) {
          const keepFileIds = Array.from(
            new Set([
              ...extractNoteFileIds(snapshot.content),
              ...extractNoteFileIds(latestDraftRef.current.content),
            ]),
          );
          void pruneNoteFiles({ pageId: requestPageId, keepFileIds }).catch(() => {
            // Sklanjanje ne sme da prekine tok čuvanja; sledeće čuvanje pokušava opet.
          });
        }
      } catch (error) {
        if (activePageIdRef.current !== requestPageId) return;
        const found = conflictFromError(error);
        if (found !== null) {
          conflictDetected = true;
          saveQueuedRef.current = false;
          setConflict(found);
          setSaveState("conflict");
        } else {
          const next = stateAfterFailure(localVersionRef.current, snapshotVersion);
          setSaveState(next);
          // Jedna poruka po nizu neuspeha; tekst stanja kaže da se pokušava ponovo.
          if (failureStreakRef.current === 0) {
            toast.error(accessErrorMessage(error, "Izmene nisu sačuvane."));
          }
          failureStreakRef.current += 1;
          setFailures(failureStreakRef.current);
        }
      } finally {
        saveInFlightRef.current = false;
        if (!conflictDetected && saveQueuedRef.current) {
          saveQueuedRef.current = false;
          setAutosaveTick((tick) => tick + 1);
        }
      }
    }, delay);
    return () => window.clearTimeout(timer);
  }, [autosaveTick, content, enqueuePageUpdate, failures, page, pageId, pruneNoteFiles, saveState, title, updatePage]);

  function markDraftChanged(nextDraft: Draft) {
    latestDraftRef.current = nextDraft;
    localVersionRef.current += 1;
    setSaveState((current) => stateAfterEdit(current, nextDraft.title));
  }

  function editTitle(nextTitle: string) {
    setTitle(nextTitle);
    markDraftChanged({ ...latestDraftRef.current, title: nextTitle });
  }

  function editContent(html: string) {
    setContent(html);
    markDraftChanged({ ...latestDraftRef.current, content: html });
  }

  /** Ctrl/⌘ S: sačuvaj odmah ono što čeka. */
  function saveNow() {
    if (saveState !== "dirty" && saveState !== "error") return;
    saveNowRef.current = true;
    setAutosaveTick((tick) => tick + 1);
  }

  /** „Učitaj najnoviju": tvoj nacrt se odbacuje, polje dobija verziju tima. */
  function loadLatest(): boolean {
    if (!page || page.revision <= baseRevisionRef.current) {
      toast.info("Najnovija verzija još stiže. Pokušaj ponovo za trenutak.");
      return false;
    }
    return discardDraft();
  }

  /**
   * Nacrt se odbacuje bez provere revizije — npr. stranica je zaključana dok si
   * kucao (zaključavanje ne podiže reviziju, pa „najnovija" nije novija).
   */
  function discardDraft(): boolean {
    if (!page) return false;
    const remoteDraft = { title: page.title, content: page.content };
    activatePageRevision(ledgerRef.current, page._id, page.revision);
    baseRevisionRef.current = readPageRevision(ledgerRef.current, page._id, page.revision);
    localVersionRef.current += 1;
    latestDraftRef.current = remoteDraft;
    saveQueuedRef.current = false;
    failureStreakRef.current = 0;
    setFailures(0);
    setTitle(remoteDraft.title);
    setContent(remoteDraft.content);
    setConflict(null);
    setSaveState("saved");
    toast.success("Učitana je najnovija verzija.");
    return true;
  }

  /**
   * „Prepiši": isti poziv sa revizijom koju je server prijavio — tvoja verzija
   * ide preko, a tuđa ostaje u Istoriji izmena kao njena revizija.
   */
  function overwrite() {
    if (!page) return;
    const target = conflict?.currentRevision ?? page.revision;
    activatePageRevision(ledgerRef.current, page._id, target);
    baseRevisionRef.current = readPageRevision(ledgerRef.current, page._id, target);
    failureStreakRef.current = 0;
    setFailures(0);
    setConflict(null);
    saveNowRef.current = true;
    setSaveState(latestDraftRef.current.title.trim() ? "dirty" : "invalid");
    setAutosaveTick((tick) => tick + 1);
  }

  async function copyDraft() {
    const draft = latestDraftRef.current;
    // Pasusi i stavke liste ostaju u svojim redovima.
    const text = [draft.title.trim(), htmlToPlainText(draft.content)].filter(Boolean).join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Tvoja verzija je kopirana.");
    } catch {
      toast.error("Kopiranje nije uspelo. Obeleži tekst i kopiraj ga ručno.");
    }
  }

  /**
   * Drugi upis iste stranice (osobine zadatka) kroz isti red i istu reviziju.
   * `call` dobija `expectedRevision` i vraća novu reviziju.
   */
  async function runPageUpdate<Result extends { revision: number }>(
    call: (expectedRevision: number) => Promise<Result>,
  ): Promise<Result> {
    const requestPageId = pageId;
    const fallbackRevision = baseRevisionRef.current;
    const result = await enqueuePageUpdate(() =>
      call(readPageRevision(ledgerRef.current, requestPageId, fallbackRevision)),
    );
    const activeRevision = resolvePageRevision(ledgerRef.current, requestPageId, result.revision);
    if (activeRevision !== null && activePageIdRef.current === requestPageId) {
      baseRevisionRef.current = activeRevision;
    }
    return result;
  }

  return {
    /** Polje je napunjeno verzijom ove stranice (Tiptap se ne montira sa praznim podrazumevanim). */
    draftReady: page !== undefined && page._id === pageId && draftPageId === page._id,
    title,
    content,
    editTitle,
    editContent,
    saveState,
    conflict,
    /** Ponovni pokušaj je stao posle više neuspeha (traži „Pokušaj ponovo"). */
    retriesExhausted: saveState === "error" && failures >= AUTOSAVE_MAX_RETRIES,
    saveNow,
    loadLatest,
    discardDraft,
    overwrite,
    copyDraft,
    runPageUpdate,
  };
}

/** Upozorenje pregledača pri zatvaranju taba dok nešto nije sačuvano. */
export function useBeforeUnloadGuard(state: PageEditorSaveState) {
  useEffect(() => {
    if (state === "saved") return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [state]);
}
