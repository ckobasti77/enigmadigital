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
];

function main(): void {
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

  console.log("");

  if (problemi.length > 0) {
    console.error("NEUSPEH:");
    for (const p of problemi) console.error(`  - ${p}`);
    process.exit(1);
  }

  console.log(
    `✓ ${SLUCAJEVI.length} slucajeva, sema propusta ispravno i odbija neispravno.`,
  );
}

main();
