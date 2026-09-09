import { v } from "convex/values";

/**
 * ============================================================================
 * OCENA SAJTA — deljeni validatori (GL10, sajt-ocena-plan.md §2)
 * ============================================================================
 *
 * Isti oblik na tri mesta: tabela `leadSiteAudits` (schema.ts), red uvoza
 * (`leadImportRows.parsed.sajtOcena` + `parsedLeadRowValidator`) i telo
 * ingesta (zod kopija u `generateLeadsIngest.ts`). Validator je ovde JEDNOM,
 * da šema i staging ne mogu da se raziđu; zod kopija se poredi u
 * `verify:gl-ingest` i `verify:gl-skill`.
 *
 * TRI IZVORA, TRI VRSTE ISTINE (plan §1): Lighthouse (brojevi sa Googleovih
 * servera), tehnologije (otisci nad HTML-om) i Claudeov sud (nad snimcima).
 * Nijedan se ne izvodi iz drugog i svaki je opcion — PSI ume da ne vrati
 * kategoriju, snimak ume da padne. ODSUSTVO ≠ NULA (§0 pravilo 1): broj koga
 * nema se ne upisuje, a ekran ga piše kao „—".
 *
 * Ukupna ocena (`kvalitetSajta`) se NIKAD ne skladišti — računa se pri
 * čitanju u `siteScore.ts` (§0 pravilo 2).
 */

/** Lighthouse kategorije 0–100 i laboratorijske metrike; svaki broj opcion. */
export const lighthouseKategorijeValidator = v.object({
  performance: v.optional(v.number()),
  accessibility: v.optional(v.number()),
  bestPractices: v.optional(v.number()),
  seo: v.optional(v.number()),
  lcpMs: v.optional(v.number()),
  cls: v.optional(v.number()),
  inpMs: v.optional(v.number()),
  tbtMs: v.optional(v.number()),
});

/**
 * Terenski CWV (CrUX) — postoje samo za sajtove sa dovoljno posetilaca, što
 * za male firme skoro nikad nije slučaj. `ocena` je Googleova zbirna presuda.
 */
export const lighthouseTerenskiValidator = v.object({
  lcpMs: v.optional(v.number()),
  cls: v.optional(v.number()),
  inpMs: v.optional(v.number()),
  ocena: v.optional(
    v.union(v.literal("FAST"), v.literal("AVERAGE"), v.literal("SLOW")),
  ),
});

export const lighthouseValidator = v.object({
  mobile: v.optional(lighthouseKategorijeValidator),
  desktop: v.optional(lighthouseKategorijeValidator),
  terenski: v.optional(lighthouseTerenskiValidator),
});

/** Jedna prepoznata tehnologija. `pouzdanost` je 0–100 iz otisaka. */
export const tehnologijaValidator = v.object({
  ime: v.string(),
  kategorija: v.string(),
  verzija: v.optional(v.string()),
  pouzdanost: v.number(),
});

/** Jedna Claudeova ocena 1–5 sa obaveznom rečenicom (plan §3). */
export const claudeOcenaValidator = v.object({
  ocena: v.number(),
  obrazlozenje: v.string(),
});

export const PREPORUCENE_PONUDE = [
  "nov_sajt",
  "redizajn",
  "webshop",
  "zakazivanje",
  "seo",
  "brzina",
  "nista",
] as const;

export type PreporucenaPonuda = (typeof PREPORUCENE_PONUDE)[number];

export const preporucenaPonudaValidator = v.union(
  v.literal("nov_sajt"),
  v.literal("redizajn"),
  v.literal("webshop"),
  v.literal("zakazivanje"),
  v.literal("seo"),
  v.literal("brzina"),
  v.literal("nista"),
);

/** Claudeov sud nad snimcima (plan §2.1, §3). Bez snimka ne sme da postoji. */
export const claudeSudValidator = v.object({
  model: v.string(),
  ocene: v.object({
    prviUtisak: claudeOcenaValidator,
    jasnocaPonude: claudeOcenaValidator,
    putDoKontakta: claudeOcenaValidator,
    mobilnaUpotrebljivost: claudeOcenaValidator,
    azurnost: claudeOcenaValidator,
  }),
  // Najviše 3, svaka jedna rečenica, svaka vidljiva na snimku.
  glavneMane: v.array(v.string()),
  prilikaZaEnigmu: v.string(),
  preporucenaPonuda: preporucenaPonudaValidator,
  klikovaDoKontakta: v.optional(v.number()),
  ocenjenoAt: v.optional(v.number()),
});

/**
 * Sadržaj jedne ocene — ono što skill šalje u redu uvoza. Tabela dodaje
 * `workspaceId`, `companyId` i `izvor`.
 */
export const sajtOcenaFields = {
  // Konačni URL posle redirekcija.
  url: v.string(),
  auditedAt: v.number(),
  verzijaSkilla: v.string(),
  lighthouse: v.optional(lighthouseValidator),
  tehnologije: v.optional(v.array(tehnologijaValidator)),
  // Izvedeno IZ liste tehnologija pri upisu (dozvoljeno: ime, ne metrika).
  cms: v.optional(v.string()),
  eCommerce: v.optional(v.string()),
  booking: v.optional(v.string()),
  // Da li HTML nosi formu koja liči na zakazivanje termina (skill, iz teksta
  // stranice). OPCIONO NAMERNO: odsustvo = nije gledano, ne „nema forme".
  formaZaTermin: v.optional(v.boolean()),
  claude: v.optional(claudeSudValidator),
  snimci: v.optional(
    v.object({
      desktopId: v.optional(v.id("_storage")),
      mobilniId: v.optional(v.id("_storage")),
    }),
  ),
  // Npr. „PSI mobile: timeout", „snimak: Chromium nije instaliran".
  greske: v.optional(v.array(v.string())),
};

export const sajtOcenaValidator = v.object(sajtOcenaFields);
