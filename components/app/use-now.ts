"use client";

import { useSyncExternalStore } from "react";

/**
 * „Sada” kao spoljašnji izvor, ne kao `Date.now()` usred crtanja.
 *
 * Ekrani koji računaju hitnost (zaostao korak, sastanak danas, dani bez
 * dodira) moraju da porede sa trenutnim vremenom — ali komponenta mora da
 * ostane čista, a broj mora da ide napred i kad iz Convex-a ništa novo ne
 * stigne: rok koji istekne u 10:00 treba da pocrveni u 10:00, ne pri sledećoj
 * promeni podataka. Otkucaj na minut je dovoljno fin za rokove na sat.
 */
const TICK_MS = 60_000;

const listeners = new Set<() => void>();
let current = Date.now();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (timer === null) {
    // Prvi pretplatnik: osveži odmah, da snimak ne bude star koliko i modul.
    current = Date.now();
    timer = setInterval(() => {
      current = Date.now();
      for (const l of listeners) l();
    }, TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function getSnapshot(): number {
  return current;
}

export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
