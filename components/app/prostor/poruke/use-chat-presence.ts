"use client";


// Preneto iz Devotion apps/web/components/workspace/chat/use-chat-presence.ts (main @ c05c40f), SPAJANJE S15.
import { useEffect, useRef } from "react";
import { useMutation } from "convex/react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CHAT_PRESENCE_REFRESH_MS } from "@/convex/prostor/lib/chatPresence";

/**
 * Prijavljuje serveru „gledam ovaj kanal i stojim na dnu" — jedini slučaj u kome
 * poruka ne pravi obaveštenje (`docs/mobile/lanac5/PLAN.md` §1.3).
 *
 * `active` je AND tri uslova koje zna pozivalac: kanal je otvoren, lista je na dnu
 * (`nearBottomRef` u `message-list.tsx`) — a treći, vidljivost prozora, dodaje ovaj
 * hook. Prebačen u drugi tab je „ne gleda", isto kao skrolovan gore.
 *
 * Gašenje je EKSPLICITNO na svaku promenu (blur, skrol gore, zatvaranje, unmount);
 * serverski TTL je samo mreža za pad pregledača i pucanje mreže.
 */
export function useChatPresence(
  channelId: Id<"chatChannels">,
  active: boolean,
) {
  const setPresence = useMutation(api.prostor.chat.setPresence);
  // Šta je server poslednje čuo — da se ista vrednost ne šalje dvaput.
  const reportedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const send = (present: boolean) => {
      if (cancelled) return;
      if (reportedRef.current === present && !present) return;
      reportedRef.current = present;
      // Tiho: prisustvo je optimizacija obaveštenja, a ne radnja korisnika —
      // greška ovde ne sme da prekine čitanje razgovora.
      void setPresence({ channelId, present }).catch(() => {});
    };

    const visible = () =>
      typeof document === "undefined" || document.visibilityState === "visible";

    const tick = () => send(active && visible());

    tick();
    const interval = window.setInterval(tick, CHAT_PRESENCE_REFRESH_MS);
    // `visibilitychange` pokriva prelazak u drugi tab, `pagehide` zatvaranje i
    // bfcache (`beforeunload` na mobilnom Safari-ju ne stiže pouzdano).
    const onVisibility = () => tick();
    const onHide = () => send(false);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onHide);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onHide);
      // Odlazak sa razgovora gasi prisustvo ODMAH — inače bi do isteka TTL-a
      // korisnik na drugom ekranu ostao bez obaveštenja iz ovog kanala.
      if (reportedRef.current) {
        reportedRef.current = false;
        void setPresence({ channelId, present: false }).catch(() => {});
      }
    };
  }, [active, channelId, setPresence]);
}
