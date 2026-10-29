"use client";

import { useJaNalog } from "@/components/app/podaci-ljuske";

/**
 * Devotion „admin“ u porukama je Enigmin vlasnik platforme (SPAJANJE S06,
 * ODLUKA 2): pravi i arhivira kanale tima, upravlja članovima kanala i briše
 * tuđe poruke u kanalima projekta. Server proverava isto
 * (`jeVlasnikPlatforme`); ovo samo krije radnje koje bi server odbio.
 *
 * Čita se iz naloga (`projekti.ja`, ista pretplata kao ljuska), pa radi i u
 * „Ja“ i u projektu. Dok se nalog čita, odgovor je `false`.
 */
export function useVlasnikPlatforme(): boolean {
  return useJaNalog()?.platformaVlasnik === true;
}

/** Uloga u obliku koji čitaju deljena pravila četa (`lib/prostor/chat-hub`). */
export function ulogaCeta(vlasnikPlatforme: boolean): "admin" | "member" {
  return vlasnikPlatforme ? "admin" : "member";
}
