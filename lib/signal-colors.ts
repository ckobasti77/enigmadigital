import type { LeadSignalKind } from "@/convex/lib/leadNormalize";

/**
 * ============================================================================
 * BOJA KATEGORIJE — jedno mesto za signale i niše (UI Boost §3.6)
 * ============================================================================
 *
 * Čipovi signala i monogrami niša koriste validiranu kategorijalnu paletu
 * `--chart-1..6`, istu koju koriste serije grafikona. Ovde je jedino mesto
 * koje zna koji signal ide u koju boju; komponenta dobije broj slota i stavi
 * ga u `data-cat`, a boje stižu iz `app/globals.css` (`[data-cat]`).
 *
 * Slot 4 (amber) se ne koristi: preblizu je zlatnoj, a zlatna je u ovom
 * sistemu rezervisana za nagradu.
 */
export const CATEGORY_SLOTS = [1, 2, 3, 5, 6] as const;

export type CategorySlot = (typeof CATEGORY_SLOTS)[number];

export type SignalCategory =
  | "sajt"
  | "reputacija"
  | "zakazivanje"
  | "mreze"
  | "nova"
  | "ostalo";

/** `null` = neutralan čip, bez boje kategorije. */
export const CATEGORY_SLOT: Record<SignalCategory, CategorySlot | null> = {
  sajt: 2, // narandžasta
  reputacija: 6, // ljubičasta
  zakazivanje: 3, // zelena
  mreze: 5, // magenta
  nova: 1, // cijan
  ostalo: null,
};

export const CATEGORY_LABEL: Record<SignalCategory, string> = {
  sajt: "Sajt",
  reputacija: "Reputacija i recenzije",
  zakazivanje: "Zakazivanje i tuđi sistem",
  mreze: "Društvene mreže",
  nova: "Nova firma",
  ostalo: "Ostalo",
};

/**
 * Iscrpno po tipu: nova vrsta signala u `LEAD_SIGNAL_KINDS` ne prolazi
 * typecheck dok ovde ne dobije kategoriju.
 */
export const SIGNAL_CATEGORY: Record<LeadSignalKind, SignalCategory> = {
  nema_sajt: "sajt",
  sajt_ne_radi: "sajt",
  sajt_bez_https: "sajt",
  sajt_spor: "sajt",
  sajt_los_seo: "sajt",
  sajt_slab_ux: "sajt",
  sajt_bez_puta_do_kontakta: "sajt",
  sajt_zastarela_tehnologija: "sajt",
  sajt_bez_zakazivanja: "zakazivanje",
  koristi_third_party_booking: "zakazivanje",
  samo_facebook: "mreze",
  samo_instagram: "mreze",
  visok_broj_recenzija: "reputacija",
  novootvorena_firma: "nova",
  // Niša nije nijedna od kategorija iznad; neutralan čip.
  ciljna_nisa: "ostalo",
  landing_opened: "ostalo",
  r_link_clicked: "ostalo",
  komentar: "ostalo",
  dm: "ostalo",
  mention: "ostalo",
  pitao_cenu: "ostalo",
  ostalo: "ostalo",
};

/** Kategorija signala; nepoznata vrsta je „ostalo", nikad greška. */
export function signalCategory(kind: string): SignalCategory {
  return (SIGNAL_CATEGORY as Record<string, SignalCategory>)[kind] ?? "ostalo";
}

/** Slot boje za signal, ili `null` za neutralan čip. */
export function signalSlot(kind: string): CategorySlot | null {
  return CATEGORY_SLOT[signalCategory(kind)];
}

/**
 * Slot boje za nišu (monogram firme): deterministički heš naziva, pa ista
 * niša ima istu boju u tabeli, kartici i profilu. Prazan naziv pada na prvi
 * slot — monogram bez niše i dalje ima boju.
 */
export function nicheSlot(seed: string): CategorySlot {
  const text = seed.trim().toLocaleLowerCase("sr-Latn");
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return CATEGORY_SLOTS[hash % CATEGORY_SLOTS.length];
}
