"use client";

// Preneto iz Devotion apps/web/hooks/use-push-notifications.ts (main @ c05c40f), SPAJANJE S17.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";

import { api } from "@/convex/_generated/api";
import { accessErrorMessage } from "@/lib/prostor/web/greske";
import { base64UrlUBajtove, pushPodesen, stanjePusha, type PushState } from "@/lib/prostor/web/push";

const SERVICE_WORKER_PATH = "/sw.js";

/**
 * Javni VAPID ključ (ugrađuje se pri buildu). Bez njega web push nije podešen:
 * prekidač se ne crta i radnik se ne registruje.
 */
export const VAPID_JAVNI_KLJUC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

/** Da li prekidač za web push uopšte postoji u ovom buildu. */
export const PUSH_PODESEN = pushPodesen(VAPID_JAVNI_KLJUC);

function readKeys(subscription: PushSubscription) {
  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!p256dh || !auth) throw new Error("bez-kljuceva");
  return { p256dh, auth };
}

/**
 * Greška pregledača (DOMException na engleskom) se ne prikazuje sirova: poruka
 * servera ide kroz `accessErrorMessage`, ostalo dobija srpski tekst.
 */
function porukaGreske(cause: unknown, rezerva: string): string {
  const jeServer =
    cause instanceof Error && ((cause as Error & { data?: unknown }).data !== undefined || /Convex/i.test(cause.message));
  return jeServer ? accessErrorMessage(cause, rezerva) : rezerva;
}

/**
 * Web push na ovom uređaju: dozvola, servis radnik, pretplata i njen upis na
 * server. Dozvola se traži i radnik registruje ISKLJUČIVO iz klika
 * (`enable`) — pregledač tiho odbija zahtev bez neposredne radnje, a
 * učitavanje strane nikad ništa ne registruje.
 */
export function usePushNotifications() {
  const savePushSubscription = useMutation(api.prostor.pushSubscriptions.save);
  const removePushSubscription = useMutation(api.prostor.pushSubscriptions.remove);

  const [state, setState] = useState<PushState>("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supported = useMemo(
    () =>
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window,
    [],
  );

  const readCurrentState = useCallback(async (): Promise<PushState> => {
    const osnova = stanjePusha({
      podrzano: supported,
      javniKljuc: VAPID_JAVNI_KLJUC,
      dozvola: supported ? Notification.permission : "default",
      pretplacen: false,
    });
    if (osnova !== "permitted") return osnova;
    // Samo čitanje: postojeća registracija, bez nove.
    const registration = await navigator.serviceWorker.getRegistration(SERVICE_WORKER_PATH);
    const subscription = await registration?.pushManager.getSubscription();
    return subscription ? "enabled" : "permitted";
  }, [supported]);

  useEffect(() => {
    let active = true;
    readCurrentState()
      .then((next) => {
        if (active) setState(next);
      })
      .catch(() => {
        if (active) setState("idle");
      });
    return () => {
      active = false;
    };
  }, [readCurrentState]);

  const enable = useCallback(async () => {
    if (!supported || !PUSH_PODESEN) return false;

    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission === "denied") {
        setState("blocked");
        return false;
      }
      if (permission !== "granted") {
        setState("idle");
        return false;
      }

      const registration = await navigator.serviceWorker.register(SERVICE_WORKER_PATH);
      await navigator.serviceWorker.ready;

      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          // Bez ovoga Chrome odbija pretplatu: svako obaveštenje mora da bude vidljivo.
          userVisibleOnly: true,
          applicationServerKey: base64UrlUBajtove(VAPID_JAVNI_KLJUC),
        }));

      const keys = readKeys(subscription);
      await savePushSubscription({
        endpoint: subscription.endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: navigator.userAgent,
      });

      setState("enabled");
      return true;
    } catch (cause) {
      setError(porukaGreske(cause, "Uključivanje obaveštenja nije uspelo. Pokušaj ponovo."));
      setState(await readCurrentState().catch((): PushState => "idle"));
      return false;
    } finally {
      setBusy(false);
    }
  }, [readCurrentState, savePushSubscription, supported]);

  const disable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.getRegistration(SERVICE_WORKER_PATH);
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await removePushSubscription({ endpoint: subscription.endpoint });
        await subscription.unsubscribe();
      }
      setState("permitted");
    } catch (cause) {
      setError(porukaGreske(cause, "Isključivanje obaveštenja nije uspelo. Pokušaj ponovo."));
    } finally {
      setBusy(false);
    }
  }, [removePushSubscription]);

  return { state, busy, error, enable, disable };
}
