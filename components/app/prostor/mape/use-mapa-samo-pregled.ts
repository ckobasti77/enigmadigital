"use client";

import { useSyncExternalStore } from "react";

/**
 * Mapa na telefonu je samo pregled: dodir na kartici bi inače povukao karticu
 * (i sačuvao novu poziciju) dok korisnik pokušava da skroluje stranu. Važi samo
 * za dodir ispod `md`; miš i tablet u punoj širini ostaju kakvi su bili.
 */
const UPIT = "(max-width: 767px) and (pointer: coarse)";

function pretplati(onPromena: () => void) {
  const mq = window.matchMedia(UPIT);
  mq.addEventListener("change", onPromena);
  return () => mq.removeEventListener("change", onPromena);
}

export function useMapaSamoPregled() {
  return useSyncExternalStore(
    pretplati,
    () => window.matchMedia(UPIT).matches,
    () => false,
  );
}
