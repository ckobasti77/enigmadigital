/**
 * Šabloni leadova za novi projekat (PROJEKTI-PLAN §10, plan C10 §3).
 *
 * Za sada postoji samo „Prazno“: projekat kreće bez pravila ocenjivanja i
 * niša. Šablone „Web agencija“ i „QR za lokale“ i mutaciju koja ih primenjuje
 * dodaje C14. Čarobnjak korak sa šablonima prikazuje tek kad ih ima više od
 * jednog (nema izbora sa jednom opcijom).
 */
export const SABLONI_LEADOVA = [
  {
    kljuc: "prazno",
    naziv: "Prazno",
    opis: "Bez pravila ocenjivanja i niša; dodaješ ih sam.",
  },
] as const;

export type SablonLeadova = (typeof SABLONI_LEADOVA)[number]["kljuc"];
