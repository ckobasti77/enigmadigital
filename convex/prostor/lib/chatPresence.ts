// Preneto iz Devotion packages/backend/convex/lib/chatPresence.ts (main @ c05c40f), SPAJANJE S02.
/**
 * Namerno nula uvoza — ovaj modul uvoze i backend, i web bundle, i RN bundle
 * (mobilni). Bilo koji uvoz ovde bi se vukao u sva tri, pa konstante moraju da
 * žive u fajlu bez runtime zavisnosti.
 */

/**
 * Koliko dugo posle poslednjeg otkucaja korisnik i dalje važi kao „gleda ovaj
 * kanal i stoji na dnu" — jedini slučaj u kome poruka ne pravi obaveštenje.
 *
 * Ovo je MREŽA ZA PAD, ne primarni mehanizam: klijent prisustvo gasi eksplicitno
 * (blur, odlazak sa ekrana, skrol gore). TTL pokriva samo nasilno gašenje app-a i
 * pucanje mreže — i zato mora da postoji: bez njega bi takav korisnik ostao
 * „prisutan" zauvek i više nikad ne bi dobio obaveštenje iz tog kanala.
 */
export const CHAT_PRESENCE_TTL_MS = 45_000;
/** Klijentski interval obnavljanja prisustva — TTL/3, da jedan promašaj ne gasi. */
export const CHAT_PRESENCE_REFRESH_MS = 15_000;
