/**
 * ============================================================================
 * DOKAZ: zod šema `/generate-leads/ingest` propušta ispravno i odbija neispravno
 * ============================================================================
 *
 * Pokretanje:
 *   npm run verify:gl-ingest
 *   (ili: node --import ./scripts/ts-hooks.mjs scripts/generate-leads-ingest-check.ts)
 *
 * Zašto postoji: `POST /generate-leads/ingest` je jedini put kojim podaci ulaze
 * u aplikaciju bez ijednog klika, i jedini na kome je greška nevidljiva —
 * skill je na drugoj mašini, u tri ujutru, i vidi samo „400". Ovde se, bez
 * tokena i bez mreže, proverava da šema:
 *
 *   1. PROPUŠTA pun, ispravan zahtev (jedan red sa svim GL1 poljima).
 *   2. ODBIJA prazan `redovi` — skill koji je pao i skill koji je našao nula
 *      firmi su dva ishoda sa dve poruke (§0 pravilo 3); prazan uvoz nema šta
 *      da se pregleda i ne sme da napravi red u istoriji.
 *   3. ODBIJA red sa četiri osobe — plan §4.4 dozvoljava najviše tri, već
 *      rangirane; četvrta bi u tabeli bila tiho odsečena.
 *
 * DODATNE PROVERE (isti razlog, ista cena):
 *   4. ODBIJA osobu koja ima I broj procene I `nijeMoguceProceniti: true` —
 *      procena je ILI broj ILI izričito odustajanje, nikad oboje.
 *   5. ODBIJA telefon bez `telefonSourceUrl` — identitet bez izvora ne sme ni
 *      da nastane (ZZPL/GDPR §8).
 *
 * GL13 — DOKAZ DA OCENA STIŽE DO REDA I DO `leadSiteAudits`:
 *   Zod-slučajevi (1–14) dokazuju samo da telo PARSIRA `sajtOcena`. To nije
 *   bilo dovoljno: GL10/GL12 su prošli parse a ocena je i dalje nestajala, jer
 *   ju je `createImportCore` izostavljao pri sastavljanju `parsed` literala.
 *   Zato se ovde, nad lažnim `ctx`-om (in-memory baza, bez mreže), pušta PRAVI
 *   put:
 *     A) telo → `createImportFromIngest` (→ `createImportCore`) → upisan
 *        `leadImportRows.parsed.sajtOcena` NOSI `lighthouse`, `claude` i
 *        `snimci` (ID-jevi iz `/generate-leads/snimak`);
 *     B) `upisiOcenuSajta` (jedina radnja koju `attachSkillData` pokreće za
 *        ocenu) upisuje TAČNO JEDAN red u `leadSiteAudits` i postavlja
 *        `poslednjaOcenaSajtaId` na firmi;
 *     C) ČUVAR (GL13 §2): svako polje iz `parsedLeadRowValidator` osim `sirovo`
 *        zaista postoji u upisanom `parsed` — novo polje ne može tiho da ispadne.
 *
 * PRAVILO PRIVATNOSTI (§0 pravilo 6): svi podaci su očigledno izmišljeni
 * („Test Salon 1", „+381 60 000 0000"), a skripta nikad ne ispisuje vrednost
 * iz tela — samo putanje polja koje bi ruta vratila u 400.
 * ============================================================================
 */

import process from "node:process";
import {
  generateLeadsIngestSchema,
  greskeValidacije,
} from "../convex/lib/generateLeadsIngest";
import {
  POLJA_PARSED,
  createImportFromIngest,
  parsedLeadRowValidator,
  upisiOcenuSajta,
} from "../convex/leadImportStore";
import type { ParsedLeadRow } from "../convex/lib/leadImportParse";

type Slucaj = {
  naziv: string;
  telo: unknown;
  ocekujem: "prolazi" | "pada";
  /** Kad pada: putanja polja koja MORA da se pojavi u odgovoru. */
  ocekivanoPolje?: string;
};

const OKVIR = {
  verzija: 1,
  upit: {
    grad: "Beograd",
    nisa: "frizerski-saloni",
    brojTrazen: 3,
    filterSajt: "nema",
  },
  izvor: {
    skill: "generate-leads",
    verzijaSkilla: "1.0.0",
    pokrenutAt: 1_757_000_000_000,
  },
  izvestaj: {
    nadjeno: 1,
    trazeno: 3,
    iscrpljen: true,
    placesPozivi: 4,
    nedostupniIzvori: ["011info"],
    napomena: "Beograd iscrpljen za ovaj upit.",
  },
};

/** Jedan pun red — sve što skill ume da pošalje, sa lažnim podacima. */
const PUN_RED = {
  nazivFirme: "Test Salon 1",
  ulica: "Izmisljena 1",
  grad: "Beograd",
  opstina: "Vracar",
  telefon: "+381 60 000 0000",
  email: "test1@primer-nepostojeci.rs",
  sajt: "https://primer-nepostojeci.rs",
  pib: "100000001",
  izvori: ["companywall"],
  derivedSignals: [],
  placeId: "TEST_PLACE_ID_1",
  nisa: "frizerski-saloni",
  imaSajt: "da",
  sajtStatus: "ne_radi",
  sajtHttps: false,
  sajtProverenAt: 1_757_000_000_000,
  sajtNapomena: "timeout posle 8 s",
  koordinate: { lat: 44.8, lng: 20.46, izvor: "nominatim" },
  platforme: [
    {
      vrsta: "instagram",
      url: "https://instagram.com/test_salon_1_nepostojeci",
      sourceUrl: "https://instagram.com/test_salon_1_nepostojeci",
    },
    {
      vrsta: "tiktok",
      url: "https://tiktok.com/@test_salon_1_nepostojeci",
      sourceUrl: "https://tiktok.com/@test_salon_1_nepostojeci",
    },
  ],
  osobe: [
    {
      ime: "Test Osoba Jedan",
      uloga: "vlasnik",
      ulogaIzvor: "companywall",
      telefon: "+381 60 000 0001",
      telefonSourceUrl: "https://www.companywall.rs/firma/test-nepostojeca",
      verovatnoca: 75,
      obrazlozenje:
        "Broj je u zapisu preduzetnika na to ime. Isti broj nije prijavljen kao broj salona.",
      rang: 1,
    },
    {
      ime: "Test Osoba Dva",
      uloga: "menadzer",
      ulogaIzvor: "sajt firme",
      nijeMoguceProceniti: true,
      rang: 2,
    },
  ],
  izvestajSkilla: "nadjeno na: sajt, CompanyWall; 011info nedostupan",
};

/** GL10: puna ocena sajta — sva tri izvora, izmišljeni ID-jevi snimaka. */
const PUNA_OCENA = {
  url: "https://primer-nepostojeci.rs/",
  auditedAt: 1_757_000_000_000,
  verzijaSkilla: "1.0.0",
  lighthouse: {
    mobile: { performance: 40, accessibility: 80, bestPractices: 70, seo: 60, lcpMs: 4200, cls: 0.12, tbtMs: 600 },
    desktop: { performance: 90, accessibility: 85, bestPractices: 75, seo: 65 },
    terenski: { lcpMs: 3000, cls: 0.1, inpMs: 250, ocena: "AVERAGE" },
  },
  tehnologije: [
    { ime: "WordPress", kategorija: "CMS", verzija: "6.5.2", pouzdanost: 100 },
    { ime: "jQuery", kategorija: "JavaScript libraries", pouzdanost: 100 },
  ],
  cms: "WordPress",
  formaZaTermin: false,
  claude: {
    model: "test-model",
    ocene: {
      prviUtisak: { ocena: 4, obrazlozenje: "Naslovna slika i aktuelna ponuda." },
      jasnocaPonude: { ocena: 4, obrazlozenje: "Cenovnik na pocetnoj." },
      putDoKontakta: { ocena: 4, obrazlozenje: "Telefon u zaglavlju." },
      mobilnaUpotrebljivost: { ocena: 4, obrazlozenje: "Meni radi, tekst citljiv." },
      azurnost: { ocena: 4, obrazlozenje: "Tekuca godina u podnozju." },
    },
    glavneMane: ["Slike se sporo ucitavaju na mobilnom."],
    prilikaZaEnigmu: "Ubrzanje sajta i forma za termin.",
    preporucenaPonuda: "brzina",
    klikovaDoKontakta: 1,
  },
  snimci: { desktopId: "kg2test0000000000000000000desk", mobilniId: "kg2test0000000000000000000mobi" },
  greske: ["PSI desktop: timeout posle 60 s"],
};

function osobaSaRangom(rang: 1 | 2 | 3) {
  return {
    ime: `Test Osoba ${rang}`,
    uloga: "vlasnik",
    ulogaIzvor: "sajt firme",
    rang,
  };
}

const SLUCAJEVI: Slucaj[] = [
  {
    naziv: "1. Validan zahtev sa jednim punim redom",
    telo: { ...OKVIR, redovi: [PUN_RED] },
    ocekujem: "prolazi",
  },
  {
    naziv: "2. Prazan `redovi`",
    telo: { ...OKVIR, redovi: [] },
    ocekujem: "pada",
    ocekivanoPolje: "redovi",
  },
  {
    naziv: "3. Red sa cetiri osobe (granica je tri)",
    telo: {
      ...OKVIR,
      redovi: [
        {
          ...PUN_RED,
          osobe: [
            osobaSaRangom(1),
            osobaSaRangom(2),
            osobaSaRangom(3),
            // Cetvrta: rang van 1|2|3 i preko granice od tri.
            { ...osobaSaRangom(3), ime: "Test Osoba Cetiri" },
          ],
        },
      ],
    },
    ocekujem: "pada",
    ocekivanoPolje: "redovi.0.osobe",
  },
  {
    naziv: "4. Osoba sa procenom I sa `nijeMoguceProceniti`",
    telo: {
      ...OKVIR,
      redovi: [
        {
          ...PUN_RED,
          osobe: [
            {
              ...osobaSaRangom(1),
              verovatnoca: 60,
              nijeMoguceProceniti: true,
            },
          ],
        },
      ],
    },
    ocekujem: "pada",
    ocekivanoPolje: "redovi.0.osobe.0.verovatnoca",
  },
  {
    naziv: "5. Telefon osobe bez `telefonSourceUrl`",
    telo: {
      ...OKVIR,
      redovi: [
        {
          ...PUN_RED,
          osobe: [{ ...osobaSaRangom(1), telefon: "+381 60 000 0002" }],
        },
      ],
    },
    ocekujem: "pada",
    ocekivanoPolje: "redovi.0.osobe.0.telefonSourceUrl",
  },
  {
    // GL8 (plan §5, §2): režim „obogati" sa `izvorFajl` u upitu i redom koji
    // nosi `postojecaFirmaId` iz izvoza aplikacije. Zod ovo PROPUŠTA; provera
    // da ID zaista pripada radnom prostoru je u mutaciji (`matchRowToExisting-
    // Company` → `ctx.db.normalizeId` + poređenje `workspaceId`), pa se NE može
    // dokazati bez baze. Ručno na produkciji: pošalji `postojecaFirmaId` iz
    // TUĐEG radnog prostora — red mora da padne na „nova_firma" (ne spoji se),
    // jer provera vlasništva odbija strani ID.
    naziv: "6. Rezim obogati sa postojecaFirmaId (zod propusta)",
    telo: {
      ...OKVIR,
      upit: { ...OKVIR.upit, rezim: "obogati", izvorFajl: "Belgrade_Salon_Leads.xlsx" },
      redovi: [{ ...PUN_RED, postojecaFirmaId: "k1234567890abcdefghij000" }],
    },
    ocekujem: "prolazi",
  },
  {
    naziv: "7. Nepoznat rezim se odbija",
    telo: {
      ...OKVIR,
      upit: { ...OKVIR.upit, rezim: "nesto" },
      redovi: [PUN_RED],
    },
    ocekujem: "pada",
    ocekivanoPolje: "upit.rezim",
  },
  {
    // GL9 §4: „obogati --polja" — podskup polja koje aplikacija dopunjuje.
    naziv: "8. obogati sa upit.polja (podskup, zod propusta)",
    telo: {
      ...OKVIR,
      upit: { ...OKVIR.upit, rezim: "obogati", polja: ["sajt", "osobe"] },
      redovi: [PUN_RED],
    },
    ocekujem: "prolazi",
  },
  {
    naziv: "9. Nepoznato polje u upit.polja se odbija",
    telo: {
      ...OKVIR,
      upit: { ...OKVIR.upit, rezim: "obogati", polja: ["sajt", "nesto"] },
      redovi: [PUN_RED],
    },
    ocekujem: "pada",
    ocekivanoPolje: "upit.polja",
  },
  {
    // GL10 (sajt-ocena-plan.md §4.4): puna ocena sajta sa ID-jevima snimaka iz
    // `/generate-leads/snimak`, `--polja sajtOcena` i `nisaTrebaZakazivanje`.
    naziv: "10. sajtOcena: puna ocena sa snimcima + polja sajtOcena (zod propusta)",
    telo: {
      ...OKVIR,
      upit: { ...OKVIR.upit, rezim: "obogati", polja: ["sajt", "sajtOcena"], nisaTrebaZakazivanje: true },
      redovi: [{ ...PUN_RED, sajtStatus: "radi", sajtOcena: PUNA_OCENA }],
    },
    ocekujem: "prolazi",
  },
  {
    naziv: "11. sajtOcena: Claudeov sud bez snimka se odbija (plan §3)",
    telo: {
      ...OKVIR,
      redovi: [{ ...PUN_RED, sajtOcena: { ...PUNA_OCENA, snimci: undefined } }],
    },
    ocekujem: "pada",
    ocekivanoPolje: "redovi.0.sajtOcena.claude",
  },
  {
    naziv: "12. sajtOcena: ocena van 1-5 se odbija",
    telo: {
      ...OKVIR,
      redovi: [
        {
          ...PUN_RED,
          sajtOcena: {
            ...PUNA_OCENA,
            claude: {
              ...PUNA_OCENA.claude,
              ocene: { ...PUNA_OCENA.claude.ocene, azurnost: { ocena: 0, obrazlozenje: "x" } },
            },
          },
        },
      ],
    },
    ocekujem: "pada",
    ocekivanoPolje: "redovi.0.sajtOcena.claude.ocene.azurnost.ocena",
  },
  {
    naziv: "13. sajtOcena: samo Lighthouse, bez Claudea i bez snimaka (prolazi)",
    telo: {
      ...OKVIR,
      redovi: [
        {
          ...PUN_RED,
          sajtOcena: {
            url: "https://primer-nepostojeci.rs/",
            auditedAt: 1_757_000_000_000,
            verzijaSkilla: "1.0.0",
            lighthouse: { mobile: { performance: 35, seo: 55 } },
            greske: ["snimak: Chromium nije instaliran"],
          },
        },
      ],
    },
    ocekujem: "prolazi",
  },
  {
    // GL12 §1: TAČAN oblik tela iz pale GL10 run-e — `sajtOcena` sa Lighthouse i
    // `tehnologije`, a `claude: 0` i `snimci: 0` (sud i snimci su ispali pre
    // slanja). Ovo šema PROPUŠTA i, što je ključno, NE odbacuje `sajtOcena`.
    // Zaključak (dokazan `assertOcenaPreziviParse` ispod): ako je isto telo
    // stiglo na produkciju a `leadSiteAudits` je ostao prazan, uzrok NIJE šema
    // — nego to što produkcioni Convex nije bio na GL10 kodu (deploy nije prošao),
    // pa je STARA zod šema tiho odbacila nepoznat `sajtOcena`.
    naziv: "14. sajtOcena: incident GL10 (Lighthouse + tehnologije, bez suda i snimaka) prolazi",
    telo: {
      ...OKVIR,
      redovi: [
        {
          ...PUN_RED,
          sajtOcena: {
            url: "https://primer-nepostojeci.rs/",
            auditedAt: 1_757_000_000_000,
            verzijaSkilla: "1.0.0",
            lighthouse: { mobile: { performance: 40, seo: 60 }, desktop: { performance: 90 } },
            tehnologije: [{ ime: "WordPress", kategorija: "CMS", pouzdanost: 100 }],
            cms: "WordPress",
          },
        },
      ],
    },
    ocekujem: "prolazi",
  },
];

/**
 * GL12 §1: dokaz da tekuća šema NE guta `sajtOcena` (za razliku od stare šeme na
 * produkciji, koja bi je odbacila kao nepoznato polje). Parsira incident-telo i
 * potvrđuje da `parsed.data.redovi[0].sajtOcena` i dalje nosi Lighthouse i
 * tehnologije — tj. da bi `applyImport` dobio ocenu i upisao red u `leadSiteAudits`.
 */
function assertOcenaPreziviParse(problemi: string[]): void {
  const incident = SLUCAJEVI.find((s) => s.naziv.startsWith("14."));
  if (!incident) {
    problemi.push("assertOcenaPreziviParse: slučaj 14 (incident) nije nađen.");
    return;
  }
  const rez = generateLeadsIngestSchema.safeParse(incident.telo);
  if (!rez.success) {
    problemi.push("assertOcenaPreziviParse: incident-telo bi trebalo da prođe, ali pada.");
    return;
  }
  const oc = rez.data.redovi[0]?.sajtOcena;
  const ok =
    oc !== undefined &&
    oc.lighthouse?.mobile?.performance === 40 &&
    (oc.tehnologije?.length ?? 0) === 1 &&
    oc.claude === undefined;
  if (!ok) {
    problemi.push(
      "assertOcenaPreziviParse: `sajtOcena` je izgubljen ili izmenjen kroz parse — šema guta ocenu.",
    );
    return;
  }
  console.log(
    "  ✓ incident-telo: `sajtOcena` (Lighthouse + tehnologije) preživi parse → applyImport bi upisao leadSiteAudits.",
  );
  console.log(
    "    (Prazan leadSiteAudits na produkciji za isto telo => prod Convex nije na GL10 kodu, ne greška šeme.)",
  );
}

// ── GL13: lažni `ctx` (in-memory baza) ───────────────────────────────────────
//
// Dovoljno da createImportCore + upisiOcenuSajta rade: insert/get/patch i
// query preko `withIndex(...).first()/.collect()`. Tabele su prazne, pa svaki
// pogled („da li firma već postoji", „da li je pod zabranom") vraća prazno →
// red dobija `nova_firma`, bez mreže i bez pravog Convexa.
type FakeDoc = Record<string, unknown> & { _id: string };

class FakeDb {
  store: Record<string, FakeDoc[]> = {};
  private brojac = 0;
  private poId = new Map<string, FakeDoc>();

  async insert(tabela: string, doc: Record<string, unknown>): Promise<string> {
    const _id = `${tabela}_${++this.brojac}`;
    const pun: FakeDoc = { ...doc, _id, _creationTime: Date.now() };
    (this.store[tabela] ??= []).push(pun);
    this.poId.set(_id, pun);
    return _id;
  }

  async get(id: string): Promise<FakeDoc | null> {
    return this.poId.get(id) ?? null;
  }

  async patch(id: string, polja: Record<string, unknown>): Promise<null> {
    const doc = this.poId.get(id);
    if (doc) Object.assign(doc, polja);
    return null;
  }

  // `normalizeId` u testu: prihvata samo ID koji već postoji u bazi. Nepoznat
  // string (npr. `postojecaFirmaId` iz tuđeg deploya) vraća null, kao pravi.
  normalizeId(_tabela: string, id: string): string | null {
    return this.poId.has(id) ? id : null;
  }

  query(tabela: string) {
    const svi = () => this.store[tabela] ?? [];
    const rezultat = (preds: Array<[string, unknown]>) => {
      const filtrirano = svi().filter((r) =>
        preds.every(([f, val]) => r[f] === val),
      );
      return {
        first: async () => filtrirano[0] ?? null,
        unique: async () => filtrirano[0] ?? null,
        collect: async () => filtrirano,
      };
    };
    return {
      withIndex: (_ime: string, fn?: (q: unknown) => unknown) => {
        const preds: Array<[string, unknown]> = [];
        const q = {
          eq: (f: string, val: unknown) => {
            preds.push([f, val]);
            return q;
          },
        };
        if (fn) fn(q);
        return rezultat(preds);
      },
      collect: async () => svi(),
      first: async () => svi()[0] ?? null,
    };
  }
}

/** Pun red: SVAKO polje iz `parsedLeadRowValidator` (osim `sirovo`) je popunjeno
 *  stvarnom vrednošću, da čuvar (C) pokaže da nijedno ne ispada. */
const PUN_RED_SA_OCENOM: ParsedLeadRow = {
  ...(PUN_RED as unknown as ParsedLeadRow),
  telefonNapomena: "Broj iz zaglavlja sajta.",
  imeOsobe: "Test Osoba Jedan",
  uloga: "vlasnik",
  ocena: { vrednost: 4.6, skala: 5, brojRecenzija: 120, izvor: "google" },
  companyWallUrl: "https://www.companywall.rs/firma/test-nepostojeca",
  companyWallTacnost: "tacno",
  maticniBroj: "20000001",
  sifraDelatnosti: "9602",
  napomena: "Radno vreme: pon-pet 9-17.",
  derivedFields: ["grad"],
  imaSajtNapomena: "Sajt radi, HTTPS ispravan.",
  postojecaFirmaId: "k1234567890abcdefghij000",
  sajtOcena: PUNA_OCENA as unknown as ParsedLeadRow["sajtOcena"],
};

/**
 * GL13 §3 (obavezno po kriterijumu gotovosti): telo → createImportCore →
 * upisan red nosi `sajtOcena` → `upisiOcenuSajta` → jedan red u
 * `leadSiteAudits` + pokazivač na firmi. Bez ovoga popravka nije dokazana.
 */
async function dokaziOcenaStizeDoReda(problemi: string[]): Promise<void> {
  console.log("");
  console.log("GL13: ocena stiže do reda i do leadSiteAudits (lažni ctx)");

  const db = new FakeDb();
  const ctx = { db } as unknown as Parameters<typeof upisiOcenuSajta>[0];
  const workspaceId = "ws_test_gl13" as never;

  // A) Pravi put uvoza iz skilla: createImportFromIngest → createImportCore.
  const handler = (
    createImportFromIngest as unknown as {
      _handler: (ctx: unknown, args: unknown) => Promise<unknown>;
    }
  )._handler;
  await handler(ctx, {
    workspaceId,
    uploadedBy: "user_test_gl13",
    fileName: "generate-leads · Beograd · frizerski-saloni · test",
    rows: [PUN_RED_SA_OCENOM],
    warnings: [],
    rezim: "obogati",
    polja: ["sajt", "sajtOcena"],
    nisaTrebaZakazivanje: true,
  });

  const redovi = db.store["leadImportRows"] ?? [];
  if (redovi.length !== 1) {
    problemi.push(`GL13: očekivan tačno 1 upisan red, dobijeno ${redovi.length}.`);
    console.log(`  ✗ upisan red uvoza (dobijeno ${redovi.length})`);
    return;
  }
  const parsed = redovi[0].parsed as ParsedLeadRow;
  const oc = parsed.sajtOcena;

  const ocenaUReduOk =
    oc !== undefined &&
    oc.lighthouse?.mobile?.performance === 40 &&
    oc.claude?.model === "test-model" &&
    oc.snimci?.desktopId === "kg2test0000000000000000000desk" &&
    oc.snimci?.mobilniId === "kg2test0000000000000000000mobi";
  if (!ocenaUReduOk) {
    problemi.push(
      "GL13: `leadImportRows.parsed.sajtOcena` NE nosi lighthouse/claude/snimci — ocena je ispala pri upisu reda (regresija GL13).",
    );
    console.log("  ✗ parsed.sajtOcena nosi lighthouse + claude + snimci");
  } else {
    console.log("  ✓ parsed.sajtOcena nosi lighthouse + claude + snimci (ID-jevi)");
  }

  // C) Čuvar: svako polje validatora osim `sirovo` je stvarno u `parsed`.
  const ocekivana = Object.keys(parsedLeadRowValidator.fields).filter(
    (k) => k !== "sirovo",
  );
  const nedostaju = ocekivana.filter(
    (k) => !Object.prototype.hasOwnProperty.call(parsed, k),
  );
  if (nedostaju.length > 0) {
    problemi.push(
      `GL13 čuvar: polja iz validatora nedostaju u upisanom \`parsed\`: ${nedostaju.join(", ")}.`,
    );
    console.log(`  ✗ čuvar skupa ključeva (nedostaju: ${nedostaju.join(", ")})`);
  } else if (Object.prototype.hasOwnProperty.call(parsed, "sirovo")) {
    problemi.push("GL13 čuvar: `sirovo` ne sme da bude u `parsed` (ima svoju kolonu).");
    console.log("  ✗ čuvar: `sirovo` je zalutao u `parsed`");
  } else {
    console.log(
      `  ✓ čuvar: svih ${ocekivana.length} polja validatora (osim sirovo) je u parsed`,
    );
  }
  // Da POLJA_PARSED i validator ne mogu tiho da se raziđu.
  if (POLJA_PARSED.length !== ocekivana.length) {
    problemi.push(
      `GL13 čuvar: POLJA_PARSED (${POLJA_PARSED.length}) ≠ validator−sirovo (${ocekivana.length}).`,
    );
    console.log("  ✗ čuvar: POLJA_PARSED se razišao od validatora");
  }

  // B) upisiOcenuSajta: nov red u leadSiteAudits + pokazivač na firmi.
  const companyId = await db.insert("leadCompanies", {
    workspaceId,
    name: "Test Salon 1",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  if (oc) {
    await upisiOcenuSajta(ctx, {
      workspaceId,
      companyId: companyId as never,
      ocena: oc as NonNullable<typeof oc>,
      now: Date.now(),
    });
  }
  const auditi = db.store["leadSiteAudits"] ?? [];
  if (auditi.length !== 1) {
    problemi.push(`GL13: očekivan tačno 1 red u leadSiteAudits, dobijeno ${auditi.length}.`);
    console.log(`  ✗ jedan red u leadSiteAudits (dobijeno ${auditi.length})`);
  } else {
    console.log("  ✓ tačno jedan red u leadSiteAudits");
  }
  const firma = await db.get(companyId);
  const pokazivacOk =
    firma !== null &&
    auditi.length === 1 &&
    firma.poslednjaOcenaSajtaId === auditi[0]._id;
  if (!pokazivacOk) {
    problemi.push("GL13: `poslednjaOcenaSajtaId` na firmi nije postavljen na novi audit.");
    console.log("  ✗ poslednjaOcenaSajtaId postavljen na firmi");
  } else {
    console.log("  ✓ poslednjaOcenaSajtaId postavljen na novi audit");
  }
  // Audit nosi i sud i snimke (spoj `...ocena`) — ne samo Lighthouse.
  const audit = auditi[0] as (ParsedLeadRow["sajtOcena"] & { _id: string }) | undefined;
  const auditPunOk =
    audit !== undefined &&
    audit.claude?.model === "test-model" &&
    audit.snimci?.desktopId === "kg2test0000000000000000000desk";
  if (!auditPunOk) {
    problemi.push("GL13: red u leadSiteAudits ne nosi Claudeov sud i snimke.");
    console.log("  ✗ leadSiteAudits red nosi sud + snimke");
  } else {
    console.log("  ✓ leadSiteAudits red nosi Claudeov sud + snimke");
  }
}

async function main(): Promise<void> {
  const problemi: string[] = [];

  console.log(
    "================================================================================",
  );
  console.log("PROVERA ZOD SEME ZA /generate-leads/ingest");
  console.log(
    "================================================================================",
  );

  for (const slucaj of SLUCAJEVI) {
    const rezultat = generateLeadsIngestSchema.safeParse(slucaj.telo);
    const proslo = rezultat.success;
    const ocekivanoProslo = slucaj.ocekujem === "prolazi";

    if (proslo !== ocekivanoProslo) {
      problemi.push(
        `${slucaj.naziv}: ocekivano „${slucaj.ocekujem}", dobijeno „${
          proslo ? "prolazi" : "pada"
        }".`,
      );
      console.log(`  ✗ ${slucaj.naziv}`);
      if (!proslo) {
        // Samo putanje polja, nikad vrednosti.
        console.log(`      polja: ${greskeValidacije(rezultat.error).join(", ")}`);
      }
      continue;
    }

    if (!proslo) {
      const polja = greskeValidacije(rezultat.error);
      const pogodak =
        slucaj.ocekivanoPolje === undefined ||
        polja.some((p) => p.startsWith(slucaj.ocekivanoPolje!));

      if (!pogodak) {
        problemi.push(
          `${slucaj.naziv}: greska se ne odnosi na „${slucaj.ocekivanoPolje}" nego na ${polja.join(", ")}.`,
        );
        console.log(`  ✗ ${slucaj.naziv}`);
        continue;
      }

      console.log(`  ✓ ${slucaj.naziv} -> 400, polja: ${polja.join(", ")}`);
      continue;
    }

    console.log(
      `  ✓ ${slucaj.naziv} -> 200, redova: ${rezultat.data.redovi.length}`,
    );
  }

  assertOcenaPreziviParse(problemi);

  await dokaziOcenaStizeDoReda(problemi);

  console.log("");

  if (problemi.length > 0) {
    console.error("NEUSPEH:");
    for (const p of problemi) console.error(`  - ${p}`);
    process.exit(1);
  }

  console.log(
    `✓ ${SLUCAJEVI.length} zod slucajeva + GL13 dokaz (ocena stiže do reda i leadSiteAudits).`,
  );
}

void main();
