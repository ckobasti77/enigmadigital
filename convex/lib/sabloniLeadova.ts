import { v } from "convex/values";
import type { LeadSignalKind } from "./leadNormalize";

/**
 * ============================================================================
 * ŠABLONI LEADOVA (PROJEKTI-PLAN §10, plan C10 §3, C14)
 * ============================================================================
 *
 * Šablon je skup ICP pravila i niša sa kojim projekat kreće:
 * - „Web agencija“: tačno dosadašnja Enigma pravila (pre C14 su bila zakucana
 *   u `convex/leadScoringStore.ts` kao `DEFAULT_ICP_RULES`) i Enigmine ciljne
 *   niše;
 * - „QR za lokale“ (ScanMe): lokali kojima QR nosi meni, cenovnik ili ponudu;
 * - „Prazno“: bez pravila i niša.
 *
 * Projekat pamti šablon u `workspaces.sablonLeadova`. Bez vrednosti važi
 * „Web agencija“: tako Enigma (i svaki projekat napravljen pre C14) dobija
 * isti podrazumevani skup kao do sada. Novi projekat kreće kao „Prazno“ dok
 * se šablon ne izabere (`kreirajProjekat`).
 *
 * Čist modul (bez Convex servera), pa ga uvoze i čarobnjak i ekran.
 * ============================================================================
 */

export const SABLONI_LEADOVA = [
  {
    kljuc: "web_agencija",
    naziv: "Web agencija",
    opis: "Sajtovi i digitalni marketing za male firme: frizeri, kozmetika, turističke agencije, butici.",
  },
  {
    kljuc: "qr_lokali",
    naziv: "QR za lokale",
    opis: "Kafići, restorani, hoteli, saloni, auto saloni i izlagači na sajmovima.",
  },
  {
    kljuc: "prazno",
    naziv: "Prazno",
    opis: "Bez pravila ocenjivanja i niša; dodaješ ih sam.",
  },
] as const;

export type SablonLeadova = (typeof SABLONI_LEADOVA)[number]["kljuc"];

export const sablonLeadovaValidator = v.union(
  v.literal("web_agencija"),
  v.literal("qr_lokali"),
  v.literal("prazno"),
);

/** Šablon projekta; bez vrednosti „Web agencija“ (vidi zaglavlje). */
export function sablonProjekta(ws: {
  sablonLeadova?: SablonLeadova;
}): SablonLeadova {
  return ws.sablonLeadova ?? "web_agencija";
}

export type PraviloSablona = {
  name: string;
  axis: "fit" | "intent";
  signalKind: LeadSignalKind;
  weight: number;
  comment: string;
};

export type NisaSablona = {
  slug: string;
  naziv: string;
  sifreDelatnosti?: readonly string[];
  /** Samo gde je odluka poznata (`tools/generate-leads/lib/nise.mjs`). */
  trebaZakazivanje?: boolean;
};

// ── Web agencija ────────────────────────────────────────────────────────────

/**
 * Podrazumevani skup ICP pravila za Enigma IT digitalne usluge u Srbiji.
 *
 * Ciljna grupa: male firme i preduzetnici (turističke agencije, frizerski/kozmetički
 * saloni sa zakazivanjem i webshopom, online butici i trgovina).
 */
export const PRAVILA_WEB_AGENCIJA: ReadonlyArray<PraviloSablona> = [
  // --------------------------------------------------------------------------
  // FIT PRAVILA — koliko firma strukturno odgovara našim uslugama
  // --------------------------------------------------------------------------
  {
    name: "Nema sajt",
    axis: "fit",
    signalKind: "nema_sajt",
    weight: 30,
    // Firma bez sajta ima primarnu i najočigledniju potrebu za izradom web prezentacije, što je bazična usluga agencije.
    comment: "Firma bez sajta ima primarnu i najočigledniju potrebu za izradom web prezentacije, što je bazična usluga agencije.",
  },
  {
    name: "Sajt ne radi ili je parkiran",
    axis: "fit",
    signalKind: "sajt_ne_radi",
    weight: 28,
    // Firma je nekad platila domen i sajt, pa je danas mrtav ili parkiran — potreba je ista kao kod firme bez sajta, a razgovor je lakši jer je odluka o ulaganju već jednom doneta.
    comment: "Firma je nekad platila domen i sajt, pa je danas mrtav ili parkiran — potreba je ista kao kod firme bez sajta, a razgovor je lakši jer je odluka o ulaganju već jednom doneta.",
  },
  {
    name: "Sajt bez HTTPS-a",
    axis: "fit",
    signalKind: "sajt_bez_https",
    weight: 12,
    // Sajt bez sertifikata pretraživači i pregledači izričito označavaju kao nebezbedan, što je merljiva šteta po ugled firme i konkretan, proverljiv povod za poziv.
    comment: "Sajt bez sertifikata pretraživači i pregledači izričito označavaju kao nebezbedan, što je merljiva šteta po ugled firme i konkretan, proverljiv povod za poziv.",
  },
  // GL10 (sajt-ocena-plan.md §2.3): sajt postoji, ali ga treba popraviti.
  // Težine su ispod „Nema sajt" (30) i „Sajt ne radi" (28): postojeći sajt
  // je slabiji povod od nikakvog, ali je razgovor konkretniji — ima šta da se
  // pokaže. Sve se može prekalibrisati sa ekrana „Ocenjivanje" bez deploy-a.
  {
    name: "Sajt je spor na mobilnom",
    axis: "fit",
    signalKind: "sajt_spor",
    weight: 18,
    comment: "Lighthouse mobilni performance ispod 50 znači da se sajt na telefonu učitava sekundama — merljiv gubitak poziva i prvi konkretan argument za redizajn ili ubrzanje.",
  },
  {
    name: "Sajt ima loš SEO",
    axis: "fit",
    signalKind: "sajt_los_seo",
    weight: 14,
    comment: "Lighthouse SEO ispod 60 znači da sajt nema osnovne naslove, opise i meta oznake, pa ga Google slabo prikazuje — firma plaća sajt koji niko ne nalazi.",
  },
  {
    name: "Sajt je slabo upotrebljiv",
    axis: "fit",
    signalKind: "sajt_slab_ux",
    weight: 20,
    comment: "Prosek Claudeovih ocena (prvi utisak, jasnoća ponude, put do kontakta, mobilna upotrebljivost, ažurnost) do 2,5 od 5 — posetilac ne razume šta firma nudi ni kako da je pozove.",
  },
  {
    name: "Sajt nema jasan put do kontakta",
    axis: "fit",
    signalKind: "sajt_bez_puta_do_kontakta",
    weight: 16,
    comment: "Telefon, forma ili termin su tri i više klikova od početne, ili ih Claude nije našao — sajt koji ne vodi ka kontaktu ne donosi posao, a popravka je mala i vidljiva.",
  },
  {
    name: "Sajt na zastareloj tehnologiji",
    axis: "fit",
    signalKind: "sajt_zastarela_tehnologija",
    weight: 22,
    comment: "Joomla 3, Drupal 7, Flash, stranica bez responsive rasporeda ili tabelarni HTML — tehnologija bez zakrpa i bez mobilne verzije, gde je nov sajt jeftiniji od popravke.",
  },
  {
    name: "Nema zakazivanja u niši koja ga traži",
    axis: "fit",
    signalKind: "sajt_bez_zakazivanja",
    weight: 20,
    comment: "Frizeri, kozmetika, stomatolozi i teretane žive od termina, a sajt nema ni alat ni formu za zakazivanje — svaki termin ide preko telefona i poruka, što je tačno ono što Enigma prodaje.",
  },
  {
    name: "Koristi booking treće strane",
    axis: "fit",
    signalKind: "koristi_third_party_booking",
    weight: 20,
    // Firma već prepoznaje vrednost digitalnog zakazivanja i plaća eksterna rešenja (Setmore, Dikidi), pa je idealan kandidat za sopstveni integrisani sistem bez provizija.
    comment: "Firma već prepoznaje vrednost digitalnog zakazivanja i plaća eksterna rešenja (Setmore, Dikidi), pa je idealan kandidat za sopstveni integrisani sistem bez provizija.",
  },
  {
    name: "Samo Facebook",
    axis: "fit",
    signalKind: "samo_facebook",
    weight: 15,
    // Prisustvo isključivo na Facebook-u pokazuje digitalnu svest ali i ranjivost bez sopstvenog domena i profesionalnog brendinga.
    comment: "Prisustvo isključivo na Facebook-u pokazuje digitalnu svest ali i ranjivost bez sopstvenog domena i profesionalnog brendinga.",
  },
  {
    name: "Samo Instagram",
    axis: "fit",
    signalKind: "samo_instagram",
    weight: 15,
    // Aktivnost samo na Instagramu dokazuje postojanje vizuelnog sadržaja i baze pratilaca, ali nedostatak webshopa ili sajta ograničava direktnu prodaju.
    comment: "Aktivnost samo na Instagramu dokazuje postojanje vizuelnog sadržaja i baze pratilaca, ali nedostatak webshopa ili sajta ograničava direktnu prodaju.",
  },
  {
    name: "Visok broj recenzija",
    axis: "fit",
    signalKind: "visok_broj_recenzija",
    weight: 20,
    // Veliki broj recenzija (100+) uz dobru ocenu dokazuje stabilan obim posla, stalne mušterije i budžet za ulaganje u digitalni rast.
    comment: "Veliki broj recenzija (100+) uz dobru ocenu dokazuje stabilan obim posla, stalne mušterije i budžet za ulaganje u digitalni rast.",
  },
  {
    name: "Novootvorena firma",
    axis: "fit",
    signalKind: "novootvorena_firma",
    weight: 10,
    // Novootvoreni biznisi grade svoj vizuelni identitet i digitalne kanale od nule, pa im je potreban kompletan paket usluga.
    comment: "Novootvoreni biznisi grade svoj vizuelni identitet i digitalne kanale od nule, pa im je potreban kompletan paket usluga.",
  },

  // --------------------------------------------------------------------------
  // INTENT PRAVILA — trenutna zainteresovanost i angažovanje na tržištu
  // --------------------------------------------------------------------------
  {
    name: "Pitao za cenu",
    axis: "intent",
    signalKind: "pitao_cenu",
    weight: 40,
    // Direktan upit za cenu je najjasniji signal trenutne kupovne namere i spremnosti za momentalni razgovor o saradnji.
    comment: "Direktan upit za cenu je najjasniji signal trenutne kupovne namere i spremnosti za momentalni razgovor o saradnji.",
  },
  {
    name: "Kliknuo /r/ link",
    axis: "intent",
    signalKind: "r_link_clicked",
    weight: 25,
    // Klik na praćeni link u poruci ili ponudi dokazuje aktivnu radoznalost i angažovanje donosioca odluke.
    comment: "Klik na praćeni link u poruci ili ponudi dokazuje aktivnu radoznalost i angažovanje donosioca odluke.",
  },
  {
    name: "Otvorio landing stranicu",
    axis: "intent",
    signalKind: "landing_opened",
    weight: 20,
    // Otvaranje pripremljene demo/besplatne stranice potvrđuje da je klijent pogledao naš predlog neposredno pre sastanka.
    comment: "Otvaranje pripremljene demo/besplatne stranice potvrđuje da je klijent pogledao naš predlog neposredno pre sastanka.",
  },
  {
    name: "Poslao DM",
    axis: "intent",
    signalKind: "dm",
    weight: 15,
    // Privatna poruka na društvenim mrežama predstavlja direktnu dvosmernu komunikaciju i visok nivo proaktivnog interesovanja.
    comment: "Privatna poruka na društvenim mrežama predstavlja direktnu dvosmernu komunikaciju i visok nivo proaktivnog interesovanja.",
  },
  {
    name: "Ostavio komentar",
    axis: "intent",
    signalKind: "komentar",
    weight: 10,
    // Komentar na objavi pokazuje interesovanje za ponuđeni sadržaj, temu ili ponudu agencije.
    comment: "Komentar na objavi pokazuje interesovanje za ponuđeni sadržaj, temu ili ponudu agencije.",
  },
  {
    name: "Pominjanje (mention)",
    axis: "intent",
    signalKind: "mention",
    weight: 10,
    // Javno pominjanje profila ili usluga agencije ukazuje na svest o brendu i preporuku.
    comment: "Javno pominjanje profila ili usluga agencije ukazuje na svest o brendu i preporuku.",
  },
];

/**
 * Niše šablona „Web agencija“: ciljna grupa iz zaglavlja pravila iznad. Slug,
 * naziv, šifre i zakazivanje su iz `tools/generate-leads/lib/nise.mjs`, pa
 * skill upisuje firme baš u ove niše (upsert po slugu).
 */
export const NISE_WEB_AGENCIJA: ReadonlyArray<NisaSablona> = [
  { slug: "frizerski-saloni", naziv: "Frizerski saloni", sifreDelatnosti: ["9602"], trebaZakazivanje: true },
  { slug: "kozmeticki-saloni", naziv: "Kozmetički saloni", sifreDelatnosti: ["9602", "9604"], trebaZakazivanje: true },
  { slug: "turisticke-agencije", naziv: "Turističke agencije", sifreDelatnosti: ["7911", "7912", "7990"], trebaZakazivanje: false },
  { slug: "butici", naziv: "Butici i prodavnice odeće", sifreDelatnosti: ["4771"], trebaZakazivanje: false },
];

// ── QR za lokale (ScanMe) ───────────────────────────────────────────────────

/**
 * Pravila šablona „QR za lokale“. Koriste samo signale koje sistem već ume, i
 * jedan nov: `ciljna_nisa`. Njegov podatak je niša firme (`nicheId`), koju
 * upisuju uvoz i generate-leads (`upit.nisa`, `nisa` u redu); ciljnu nišu
 * označava šablon ili čovek (`niches.ciljna`).
 *
 * Signali o kvalitetu sajta (brzina, SEO, UX, tehnologija, zakazivanje) i
 * booking treće strane nisu ovde: to su povodi za prodaju sajta, ne QR-a.
 */
export const PRAVILA_QR_LOKALI: ReadonlyArray<PraviloSablona> = [
  // --------------------------------------------------------------------------
  // FIT PRAVILA — koliko lokal odgovara QR ponudi
  // --------------------------------------------------------------------------
  {
    name: "Lokal iz ciljne niše",
    axis: "fit",
    signalKind: "ciljna_nisa",
    weight: 30,
    comment: "Kafić, restoran, hotel, salon, auto salon ili štand na sajmu svakog dana pokazuje meni, cenovnik ili ponudu ljudima koji stoje ispred — tu QR radi posao bez objašnjavanja.",
  },
  {
    name: "Visok broj recenzija",
    axis: "fit",
    signalKind: "visok_broj_recenzija",
    weight: 25,
    comment: "Sto i više recenzija znači stalan protok gostiju: više stolova i više skeniranja, a lokal koji toliko radi ima i budžet za štampu.",
  },
  {
    name: "Novootvoren lokal",
    axis: "fit",
    signalKind: "novootvorena_firma",
    weight: 20,
    comment: "Nov lokal tek pravi meni, stolove i štampani materijal, pa QR ulazi u prvi tiraž umesto da menja postojeći.",
  },
  {
    name: "Nema sajt",
    axis: "fit",
    signalKind: "nema_sajt",
    weight: 15,
    comment: "Bez sajta gost nema gde da vidi meni ili ponudu pre dolaska; stranica iza QR koda im postaje mesto na internetu.",
  },
  {
    name: "Sajt ne radi ili je parkiran",
    axis: "fit",
    signalKind: "sajt_ne_radi",
    weight: 12,
    comment: "Lokal je već jednom platio sajt koji danas ne radi, pa je ažuran meni iza QR koda konkretan povod za razgovor.",
  },
  {
    name: "Samo Instagram",
    axis: "fit",
    signalKind: "samo_instagram",
    weight: 12,
    comment: "Ponuda živi u objavama koje gost za stolom ne nalazi; QR može da vodi na meni i na profil zajedno.",
  },
  {
    name: "Samo Facebook",
    axis: "fit",
    signalKind: "samo_facebook",
    weight: 10,
    comment: "Meni na Fejsbuku je obično star i težak za čitanje na telefonu; QR sa ažurnim menijem je vidljivo poboljšanje.",
  },

  // --------------------------------------------------------------------------
  // INTENT PRAVILA — iste težine kao „Web agencija“: namera ne zavisi od ponude
  // --------------------------------------------------------------------------
  {
    name: "Pitao za cenu",
    axis: "intent",
    signalKind: "pitao_cenu",
    weight: 40,
    comment: "Direktan upit za cenu je najjasniji signal da je vlasnik lokala spreman za razgovor sada.",
  },
  {
    name: "Kliknuo /r/ link",
    axis: "intent",
    signalKind: "r_link_clicked",
    weight: 25,
    comment: "Klik na praćeni link u poruci ili ponudi pokazuje da je neko iz lokala pogledao šta nudimo.",
  },
  {
    name: "Otvorio landing stranicu",
    axis: "intent",
    signalKind: "landing_opened",
    weight: 20,
    comment: "Otvorena pripremljena stranica (npr. primer menija za taj lokal) znači da je predlog viđen pre sastanka.",
  },
  {
    name: "Poslao DM",
    axis: "intent",
    signalKind: "dm",
    weight: 15,
    comment: "Privatna poruka je dvosmeran razgovor koji je započeo lokal, ne mi.",
  },
  {
    name: "Ostavio komentar",
    axis: "intent",
    signalKind: "komentar",
    weight: 10,
    comment: "Komentar na objavi pokazuje interesovanje za temu ili ponudu.",
  },
  {
    name: "Pominjanje (mention)",
    axis: "intent",
    signalKind: "mention",
    weight: 10,
    comment: "Javno pominjanje profila znači da lokal zna za nas.",
  },
];

/**
 * Niše šablona „QR za lokale“. Slugovi koji već postoje u
 * `tools/generate-leads/lib/nise.mjs` (restorani, frizerski i kozmetički
 * saloni) su preuzeti da bi skill upisivao firme baš u njih; šifre delatnosti
 * su iz Klasifikacije delatnosti (2010), samo kao pomoć pri pretrazi.
 */
export const NISE_QR_LOKALI: ReadonlyArray<NisaSablona> = [
  { slug: "kafici", naziv: "Kafići i barovi", sifreDelatnosti: ["5630"] },
  { slug: "restorani", naziv: "Restorani", sifreDelatnosti: ["5610"], trebaZakazivanje: false },
  { slug: "hoteli", naziv: "Hoteli i smeštaj", sifreDelatnosti: ["5510", "5520"] },
  { slug: "frizerski-saloni", naziv: "Frizerski saloni", sifreDelatnosti: ["9602"], trebaZakazivanje: true },
  { slug: "kozmeticki-saloni", naziv: "Kozmetički saloni", sifreDelatnosti: ["9602", "9604"], trebaZakazivanje: true },
  { slug: "auto-saloni", naziv: "Auto saloni", sifreDelatnosti: ["4511"] },
  { slug: "izlagaci-na-sajmovima", naziv: "Izlagači na sajmovima" },
];

// ── Spisak po šablonu ───────────────────────────────────────────────────────

export const PRAVILA_SABLONA: Record<SablonLeadova, ReadonlyArray<PraviloSablona>> = {
  web_agencija: PRAVILA_WEB_AGENCIJA,
  qr_lokali: PRAVILA_QR_LOKALI,
  prazno: [],
};

/** Niše šablona; sve su ciljne (`niches.ciljna = true` pri primeni). */
export const NISE_SABLONA: Record<SablonLeadova, ReadonlyArray<NisaSablona>> = {
  web_agencija: NISE_WEB_AGENCIJA,
  qr_lokali: NISE_QR_LOKALI,
  prazno: [],
};

/** Broj pravila šablona po osi (za najavu na ekranu, bez upita). */
export function brojPravilaPoOsi(sablon: SablonLeadova): { fit: number; intent: number } {
  const pravila = PRAVILA_SABLONA[sablon];
  return {
    fit: pravila.filter((p) => p.axis === "fit").length,
    intent: pravila.filter((p) => p.axis === "intent").length,
  };
}
