import { v } from "convex/values";

/**
 * Uloge po projektu (P9). `owner` vodi projekat (veze, brisanje, članovi,
 * podešavanja), `urednik` radi posao (leadovi, objave, poruke), a
 * `client_viewer` samo gleda — nikad ne menja podatke projekta.
 *
 * Čist modul: uvozi ga i front (tip `Uloga`, nazivi), pa ne sme da povuče
 * ništa iz `_generated/server`.
 */
export const ulogaValidator = v.union(
  v.literal("owner"),
  v.literal("urednik"),
  v.literal("client_viewer"),
);

export type Uloga = "owner" | "urednik" | "client_viewer";

const RANG: Record<Uloga, number> = { client_viewer: 0, urednik: 1, owner: 2 };

/** Da li `uloga` sme ono što traži `minimalna`. */
export function imaUlogu(uloga: Uloga, minimalna: Uloga): boolean {
  return RANG[uloga] >= RANG[minimalna];
}

export const NAZIV_ULOGE: Record<Uloga, string> = {
  owner: "Vlasnik",
  urednik: "Urednik",
  client_viewer: "Pregled",
};
