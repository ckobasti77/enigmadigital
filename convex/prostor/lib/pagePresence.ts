// Preneto iz Devotion packages/backend/convex/lib/pagePresence.ts (main @ c05c40f), SPAJANJE S02.
/**
 * Namerno nula uvoza — kao `chatPresence.ts`, ovaj modul uvoze backend, web i
 * RN bundle (mobilni).
 *
 * Prisustvo na stranici (PROSTOR P23): „<Ime> uređuje". Klijent šalje otkucaj
 * dok je stranica otvorena; upit vraća `expiresAt`, a klijent sam odbacuje
 * istekle (upit ne čita sat). Isti brojevi kao `CHAT_PRESENCE_*`.
 */

/** Koliko dugo posle poslednjeg otkucaja osoba i dalje važi kao prisutna. */
export const PAGE_PRESENCE_TTL_MS = 45_000;
/** Klijentski interval otkucaja — TTL/3, da jedan promašaj ne ugasi prisustvo. */
export const PAGE_PRESENCE_REFRESH_MS = 15_000;

/** Da li red iz `presence.listForPage` još važi u trenutku `now`. */
export function isPresenceFresh(expiresAt: number, now: number): boolean {
  return expiresAt > now;
}
