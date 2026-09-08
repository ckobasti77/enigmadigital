import { z } from "zod";

/**
 * ============================================================================
 * TELO ZAHTEVA ZA `POST /generate-leads/ingest` (GL1, plan §5)
 * ============================================================================
 *
 * Ovo je JEDINA definicija oblika koji skill šalje. Skill (`tools/generate-
 * leads/`) je uvozi ili generiše iz nje — dve nezavisne kopije iste šeme se
 * razilaze prvog dana kad se doda polje, i to se vidi tek kao „400 bez razloga"
 * na Jovanovoj mašini u tri ujutru.
 *
 * PRAVILA KOJA OVA ŠEMA ČUVA:
 *
 * 1. Nepoznato ≠ nula (§0 pravilo 1, 4). Zato je gotovo sve `optional`, a
 *    ništa nema podrazumevanu vrednost: polje koje skill nije mogao da utvrdi
 *    prosto ne postoji u telu. `imaSajt: "nepoznato"` je izričita tvrdnja
 *    („proveravano, izvor nedostupan"), a odsustvo polja je druga tvrdnja
 *    („nije ni proveravano").
 * 2. Verovatnoća telefona je ILI broj ILI `nijeMoguceProceniti: true`, nikada
 *    oboje i nikada 50 kao „srednja procena" (§0 pravilo 4, plan §6).
 * 3. Gornje granice (200 redova, 3 osobe, 10 platformi) postoje zato što je
 *    jedan zahtev jedna Convex mutacija — telo bez granice ruši mutaciju na
 *    limitu, a taj pad ne kaže pozivaocu šta je poslao pogrešno.
 *
 * NIŠTA IZ TELA SE NE LOGUJE. Greška validacije vraća SAMO putanje polja
 * (`redovi.3.osobe.0.telefon`), nikad vrednosti (§0 pravilo 6).
 */

/** Najviše redova u jednom zahtevu — jedna mutacija mora da ih upiše sve. */
export const MAX_INGEST_ROWS = 200;

/** Najviše osoba po firmi. Skill ih već rangira (plan §6); 3 je gornja granica. */
export const MAX_PEOPLE_PER_ROW = 3;

/** Platforme po firmi: sajt + IG + FB + TikTok + Threads i nešto rezerve. */
export const MAX_PLATFORMS_PER_ROW = 10;

const neprazan = z.string().trim().min(1);

/** Ocena firme: vrednost i skala odvojeno, nikad već izračunata stopa (§0). */
const ocenaSchema = z.object({
  vrednost: z.number().optional(),
  skala: z.number().optional(),
  brojRecenzija: z.number().int().nonnegative().optional(),
  izvor: neprazan.optional(),
});

const platformaSchema = z.object({
  vrsta: z.enum(["instagram", "facebook", "tiktok", "website", "threads"]),
  url: neprazan,
  // OBAVEZAN: `leadIdentities.sourceUrl` je obavezan po ZZPL/GDPR (§8). Ovde
  // se traži zato što identitet bez izvora ne sme ni da nastane — a ako se
  // traži tek u `applyImport`, otkrije se posle pregleda, ne pre.
  sourceUrl: neprazan,
});

const osobaSchema = z
  .object({
    ime: neprazan,
    uloga: neprazan,
    // Odakle znamo ulogu. CompanyWall/APR daje `roleConfidence: "potvrdjeno"`,
    // sve ostalo „verovatno" — zato je izvor obavezan, ne opcion.
    ulogaIzvor: neprazan,
    telefon: neprazan.optional(),
    telefonSourceUrl: neprazan.optional(),
    verovatnoca: z.number().min(0).max(95).optional(),
    nijeMoguceProceniti: z.boolean().optional(),
    obrazlozenje: neprazan.optional(),
    rang: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  })
  .refine(
    (o) => !(o.verovatnoca !== undefined && o.nijeMoguceProceniti === true),
    {
      message:
        "verovatnoca i nijeMoguceProceniti se isključuju — procena je ili broj ili izričito odustajanje",
      path: ["verovatnoca"],
    },
  )
  .refine((o) => o.telefon === undefined || o.telefonSourceUrl !== undefined, {
    message: "telefon bez telefonSourceUrl ne sme da uđe u bazu (ZZPL §8)",
    path: ["telefonSourceUrl"],
  });

export const parsedLeadRowSchema = z.object({
  nazivFirme: neprazan.optional(),
  ulica: neprazan.optional(),
  opstina: neprazan.optional(),
  grad: neprazan.optional(),
  telefon: neprazan.optional(),
  telefonNapomena: neprazan.optional(),
  email: neprazan.optional(),
  sajt: neprazan.optional(),
  imeOsobe: neprazan.optional(),
  uloga: neprazan.optional(),
  ocena: ocenaSchema.optional(),
  companyWallUrl: neprazan.optional(),
  companyWallTacnost: z.enum(["tacno", "priblizno"]).optional(),
  pib: neprazan.optional(),
  maticniBroj: neprazan.optional(),
  sifraDelatnosti: neprazan.optional(),
  napomena: neprazan.optional(),
  izvori: z.array(neprazan).default([]),
  derivedSignals: z.array(neprazan).default([]),
  derivedFields: z.array(neprazan).optional(),

  // ── GL1 dopune (plan §4.4) ────────────────────────────────────────────────
  placeId: neprazan.optional(),
  nisa: neprazan.optional(),
  imaSajt: z.enum(["da", "ne", "nepoznato"]).optional(),
  imaSajtNapomena: neprazan.optional(),
  sajtStatus: z
    .enum(["radi", "ne_radi", "parkiran", "preusmerava_na_drustvene", "nepoznato"])
    .optional(),
  sajtHttps: z.boolean().optional(),
  sajtProverenAt: z.number().optional(),
  sajtNapomena: neprazan.optional(),
  koordinate: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      izvor: z.literal("nominatim"),
    })
    .optional(),
  platforme: z.array(platformaSchema).max(MAX_PLATFORMS_PER_ROW).optional(),
  osobe: z.array(osobaSchema).max(MAX_PEOPLE_PER_ROW).optional(),
  izvestajSkilla: neprazan.optional(),

  // ── GL8 (režim „obogati", plan §5, §2) ─────────────────────────────────────
  // ID postojeće firme iz izvoza aplikacije (`company_id` kolona). Ostaje
  // string — `matchRowToExistingCompany` ga kroz `ctx.db.normalizeId` pretvara
  // u Id i proverava da firma pripada radnom prostoru pre spajanja.
  postojecaFirmaId: neprazan.optional(),
});

export const generateLeadsIngestSchema = z.object({
  verzija: z.literal(1),
  upit: z.object({
    grad: neprazan,
    nisa: neprazan,
    brojTrazen: z.number().int().min(1).max(50),
    filterSajt: z.enum(["ima", "nema", "svejedno"]),
    // Predlog opisa niše (GL6 §4). `applyImport` ga upisuje u nišu samo ako
    // niša još nema opis; opis čoveka se ne prepisuje. Granica 1200 znakova
    // = jedna mutacija ne sme da primi „roman" umesto opisa.
    nisaOpis: z.string().trim().min(1).max(1200).optional(),
    // Režim skilla (GL8, plan §5). Odsustvo se čita kao „otkrivanje" (klasičan
    // Places tok); „obogati" je dopuna postojeće tabele/izvoza.
    rezim: z.enum(["otkrivanje", "obogati"]).optional(),
    // Naziv fajla iz kojeg je „obogati" tok krenuo (GL8) — samo za prikaz
    // porekla i za `fileName` uvoza u istoriji.
    izvorFajl: neprazan.optional(),
  }),
  izvor: z.object({
    skill: z.literal("generate-leads"),
    verzijaSkilla: neprazan,
    pokrenutAt: z.number(),
  }),
  // `min(1)`: skill koji je pao i skill koji je našao nula firmi su dva ishoda
  // (§0 pravilo 3). Prazan uvoz nema šta da se pregleda, pa se odbija sa 400 —
  // skill tu ispisuje „0 od N, grad iscrpljen", a ne pravi prazan red u istoriji.
  redovi: z.array(parsedLeadRowSchema).min(1).max(MAX_INGEST_ROWS),
  izvestaj: z.object({
    nadjeno: z.number().int().nonnegative(),
    trazeno: z.number().int().nonnegative(),
    iscrpljen: z.boolean(),
    placesPozivi: z.number().int().nonnegative(),
    nedostupniIzvori: z.array(neprazan).default([]),
    napomena: neprazan.optional(),
  }),
});

export type GenerateLeadsIngestBody = z.infer<typeof generateLeadsIngestSchema>;
export type GenerateLeadsIngestRow = z.infer<typeof parsedLeadRowSchema>;

/**
 * Putanje polja koja nisu prošla validaciju, bez ijedne vrednosti iz tela.
 *
 * Poruka greške koja citira vrednost („očekivan broj, dobijeno '+381 60…'")
 * je telefon u HTTP odgovoru i, preko skillovog izlaza, u terminalu i u logu.
 * Zato odavde izlazi samo putanja i tip problema.
 */
export function greskeValidacije(error: z.ZodError): string[] {
  const putanje = new Set<string>();
  for (const issue of error.issues) {
    const putanja = issue.path.length > 0 ? issue.path.join(".") : "(koren tela)";
    putanje.add(`${putanja}: ${issue.code}`);
  }
  return [...putanje].sort();
}
