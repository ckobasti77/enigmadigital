"use client";

// Preneto iz Devotion apps/web/components/collab/use-page-presence.ts (main @ c05c40f), SPAJANJE S11.
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PAGE_PRESENCE_REFRESH_MS } from "@/convex/prostor/lib/pagePresence";
import { okruzenjePregledaca, pokreniOtkucaje } from "@/lib/prostor/web/otkucaj-prisustva";

import { activeEditors } from "@/lib/prostor/modeli/collab-model";
import { useProjekatMutation } from "@/components/app/projekat-provider";
import { useProjekatQueryTolerant } from "@/components/app/prostor/podaci/projekat";

/** Prvo kucanje posle tišine šalje otkucaj odmah, ali ne češće od ovoga. */
const EAGER_HEARTBEAT_GAP_MS = 3_000;

/**
 * „<Ime> uređuje" (PROSTOR P23, plan K07 §6.4). Dok je stranica otvorena i
 * kartica vidljiva, šalje `presence.heartbeat` odmah i na
 * `PAGE_PRESENCE_REFRESH_MS` (15 s); sakrivena kartica zaustavlja sat
 * (`lib/prostor/web/otkucaj-prisustva`). `editing` je pravo izmene ∧ aktivnost
 * (fokus, kucanje) u `region` u poslednjih 15 s. Na odlasku `presence.leave`.
 * Upit ne čita sat: sveže redove bira klijent (`activeEditors`) sa satom koji
 * tiče na 15 s. Greška prisustva se tiho preskače — nije radnja korisnika.
 */
export function usePagePresence(
  pageId: Id<"pages">,
  { canEdit, region }: { canEdit: boolean; region: RefObject<HTMLElement | null> },
) {
  const heartbeat = useProjekatMutation(api.prostor.presence.heartbeat);
  const leave = useProjekatMutation(api.prostor.presence.leave);
  const rows = useProjekatQueryTolerant(api.prostor.presence.listForPage, { pageId });
  const [now, setNow] = useState(() => Date.now());
  const lastActivityRef = useRef(0);
  const reportedEditingRef = useRef(false);
  const lastSentRef = useRef(0);
  const canEditRef = useRef(canEdit);
  useEffect(() => {
    canEditRef.current = canEdit;
  }, [canEdit]);

  useEffect(() => {
    let cancelled = false;
    const visible = () => document.visibilityState === "visible";
    const isEditing = () =>
      canEditRef.current && Date.now() - lastActivityRef.current < PAGE_PRESENCE_REFRESH_MS;

    const send = () => {
      if (cancelled || !visible()) return;
      const editing = isEditing();
      reportedEditingRef.current = editing;
      lastSentRef.current = Date.now();
      void heartbeat({ pageId, editing }).catch(() => {});
    };

    const onActivity = (event: Event) => {
      const element = region.current;
      const target = event.target;
      if (!element || !(target instanceof HTMLElement) || !element.contains(target)) return;
      // Tab preko dugmadi nije uređivanje: računa se samo polje za pisanje.
      const writable =
        target.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
      if (!writable) return;
      lastActivityRef.current = Date.now();
      if (
        !reportedEditingRef.current &&
        canEditRef.current &&
        Date.now() - lastSentRef.current > EAGER_HEARTBEAT_GAP_MS
      ) {
        send();
      }
    };

    const stopHeartbeats = pokreniOtkucaje({
      intervalMs: PAGE_PRESENCE_REFRESH_MS,
      posalji: send,
      naTik: () => setNow(Date.now()),
      okruzenje: okruzenjePregledaca(),
    });
    const onHide = () => void leave({ pageId }).catch(() => {});
    document.addEventListener("focusin", onActivity);
    document.addEventListener("input", onActivity, true);
    window.addEventListener("pagehide", onHide);

    return () => {
      cancelled = true;
      stopHeartbeats();
      document.removeEventListener("focusin", onActivity);
      document.removeEventListener("input", onActivity, true);
      window.removeEventListener("pagehide", onHide);
      reportedEditingRef.current = false;
      void leave({ pageId }).catch(() => {});
    };
  }, [heartbeat, leave, pageId, region]);

  const editors = useMemo(() => activeEditors(rows, now), [rows, now]);
  return { editors };
}
