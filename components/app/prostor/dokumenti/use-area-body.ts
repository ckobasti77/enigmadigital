"use client";

// Preneto iz Devotion apps/web/components/workspace/area/use-area-body.ts (main @ c05c40f), SPAJANJE S10.
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/lib/toast";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

import {
  areaBodyEdit,
  areaBodyFromServer,
  areaBodyLoadLatest,
  areaBodyOverwrite,
  areaBodyRetriesExhausted,
  areaBodySaveDelay,
  areaBodySaveFailed,
  areaBodySaveSucceeded,
  areaBodyStartSave,
  areaBodyStatus,
  createAreaBodyDraft,
  type AreaBodyDraft,
  type AreaBodyServer,
  type AreaBodySubmission,
} from "@/lib/prostor/modeli/area-model";
import { useProjekatMutation } from "@/components/app/projekat-provider";

/**
 * Opis oblasti kao dokument tima (PROSTOR P1, P2, P23; K07 §5.5): nacrt koji
 * se čuva 1 s posle kucanja i na blur kroz `areasV2.updateAreaBody` sa
 * `expectedRevision`. Konflikt zaustavlja čuvanje do odluke („Učitaj
 * najnoviju" / „Prepiši"); druga greška se ponavlja posle 5 s, najviše tri puta.
 */
export function useAreaBody({
  areaId,
  server,
}: {
  areaId: Id<"areas">;
  /** `areasV2.getAreaBody` (sadržaj i revizija); `undefined` dok stiže. */
  server: AreaBodyServer | undefined;
}) {
  const update = useProjekatMutation(api.prostor.areasV2.updateAreaBody);
  const [draft, setDraftState] = useState<AreaBodyDraft | null>(() =>
    server ? createAreaBodyDraft(server) : null,
  );
  const draftRef = useRef(draft);
  const serverRef = useRef(server);

  const setDraft = useCallback((next: AreaBodyDraft | null) => {
    draftRef.current = next;
    setDraftState(next);
  }, []);

  useEffect(() => {
    serverRef.current = server;
    if (!server) return;
    const current = draftRef.current;
    const next = current === null ? createAreaBodyDraft(server) : areaBodyFromServer(current, server);
    if (next !== current) setDraft(next);
  }, [server, setDraft]);

  const run = useCallback(
    async (submission: AreaBodySubmission) => {
      try {
        const result = await update({
          areaId,
          content: submission.value,
          expectedRevision: submission.expectedRevision,
        });
        const current = draftRef.current;
        if (current === null || current.areaId !== areaId) return;
        setDraft(areaBodySaveSucceeded(current, submission, result.revision));
      } catch (error) {
        const current = draftRef.current;
        if (current === null || current.areaId !== areaId) return;
        const failed = areaBodySaveFailed(current, error);
        // Toast samo za prvu grešku u nizu; konflikt ima svoj dijalog.
        if (failed.conflict === null && current.failures === 0) toast.error("Opis oblasti nije sačuvan.");
        setDraft(failed);
      }
    },
    [areaId, update, setDraft],
  );

  const saveNow = useCallback(() => {
    const current = draftRef.current;
    if (current === null) return;
    const started = areaBodyStartSave(current);
    if (started.submission === null) return;
    setDraft(started.draft);
    void run(started.submission);
  }, [run, setDraft]);

  const status = draft ? areaBodyStatus(draft) : "saved";
  const failures = draft?.failures ?? 0;
  const value = draft?.value;

  // Raspored čuvanja: pauza posle kucanja (svaki znak je pomera), ponovni
  // pokušaj posle greške. Kucanje tokom čuvanja ostavlja nacrt `dirty`, pa ga
  // isti efekat uhvati posle uspeha.
  useEffect(() => {
    const delay = areaBodySaveDelay(status, failures, false);
    if (delay === null) return;
    const timer = window.setTimeout(saveNow, delay);
    return () => window.clearTimeout(timer);
  }, [status, failures, value, saveNow]);

  function edit(next: string) {
    const current = draftRef.current;
    if (current === null) return;
    setDraft(areaBodyEdit(current, next));
  }

  /** Blur i „Pokušaj ponovo": čuvaj odmah (ponovni pokušaji kreću iz početka). */
  function flush() {
    const current = draftRef.current;
    if (current === null) return;
    const currentStatus = areaBodyStatus(current);
    if (currentStatus !== "dirty" && currentStatus !== "error") return;
    if (current.failures > 0) setDraft({ ...current, failures: 0 });
    saveNow();
  }

  /** „Učitaj najnoviju": odbacuje nacrt; `false` dok verzija sa servera još ne stiže. */
  function loadLatest(): boolean {
    const latest = serverRef.current;
    const current = draftRef.current;
    if (!latest || current === null) return false;
    setDraft(areaBodyLoadLatest(current, latest));
    return true;
  }

  /** „Prepiši": isti tekst preko tuđe verzije (ona ostaje u Istoriji izmena). */
  function overwrite() {
    const current = draftRef.current;
    if (current === null) return;
    const latestRevision = serverRef.current?.revision ?? current.baseRevision;
    const started = areaBodyOverwrite(current, latestRevision);
    setDraft(started.draft);
    void run(started.submission);
  }

  /** „Kopiraj moju verziju" (pre „Učitaj najnoviju"). */
  async function copyDraft() {
    const text = draftRef.current?.value ?? "";
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Tvoja verzija je kopirana.");
    } catch {
      toast.error("Kopiranje nije uspelo.");
    }
  }

  return {
    ready: draft !== null,
    value: draft?.value ?? "",
    status,
    conflict: draft?.conflict ?? null,
    exhausted: draft ? areaBodyRetriesExhausted(draft) : false,
    edit,
    flush,
    loadLatest,
    overwrite,
    copyDraft,
  };
}
