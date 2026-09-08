/**
 * ============================================================================
 * SELF-TEST (plan §10.5) — bez mreže, bez ključeva, bez Places kvote
 * ============================================================================
 *
 * Pokreće se i iz repoa (`npm run verify:gl-skill`) i sa Jovanove mašine
 * (`node run.mjs self-test`). Proverava četiri stvari koje se inače otkriju tek
 * na živim podacima, u tri ujutru:
 *
 *   1. SKOR (§6) — 8 slučajeva, uključujući dva „nije moguće proceniti".
 *   2. NIŠE — 10 mapiranja slobodnog teksta i stabilnost slugova (slug mora da
 *      preživi `normalizeNicheSlug` iz Convexa, jer se po njemu radi upsert).
 *   3b. FILTER GRADA (GL6 §3) — 6 oblika adrese (latinica, ćirilica, engleski,
 *      opština, drugi grad, prazno) kroz `uGradu` + `alijasiGrada`.
 *   3. ŠEMA — 3 JSON primera kroz OBE kopije šeme (`lib/schema.mjs` i zod iz
 *      `convex/lib/generateLeadsIngest.ts`); presude i putanje polja moraju da
 *      se poklope. Ovo je jedina odbrana od dve kopije koje se razilaze.
 *   4. STATUS SAJTA (§3.8) — 6 lažnih odgovora kroz čistu `klasifikuj`.
 *
 * SVI PODACI SU OČIGLEDNO LAŽNI („Test Salon 1", „+381 60 000 0000",
 * `primer-nepostojeci.rs`). Nijedan stvarni telefon, mejl ni ime ne sme da uđe
 * u repo (§0 pravilo 6).
 */

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

import { ispisi, ispisiGresku } from "./izlaz.mjs";
import { ucitajMatricu, parsirajOcenu, ucitajFajl } from "./tabela.mjs";
import { promenjeneFirme, firmaPromenjena } from "./obogati.mjs";
import { NISE, nadjiNisu, normalizujSlug, upitiNise } from "./nise.mjs";
import { klasifikuj, proveriSajt } from "./sajt.mjs";
import { oceniTelefonOsobe, oceniOsobe, traka } from "./skor.mjs";
import { validirajTelo } from "./schema.mjs";
import { prihvatljiviGradovi, uGradu } from "./places.mjs";
import { alijasiGrada } from "./gradovi.mjs";

const TELEFON = "+381 60 000 0000";

// ─────────────────────────────────────────────────────────────────────────────
// 1. Skor (§6)
// ─────────────────────────────────────────────────────────────────────────────

const SKOR_SLUCAJEVI = [
  {
    naziv: "PR zapis u APR-u + mobilni broj",
    osoba: {
      telefon: TELEFON,
      uloga: "vlasnik",
      dokazi: { brojUAprZapisuOsobe: true, vrstaBroja: "mobilni", pravniOblik: "pr" },
    },
    ocekujem: { verovatnoca: 70, traka: "visoko" },
  },
  {
    naziv: "Broj samo na agregatoru, bez veze sa imenom",
    osoba: {
      telefon: TELEFON,
      uloga: "vlasnik",
      dokazi: { samoNaAgregatoru: true, vrstaBroja: "mobilni" },
    },
    ocekujem: { nijeMoguceProceniti: true },
  },
  {
    naziv: "Isti broj kao broj salona (fiksni)",
    osoba: {
      telefon: TELEFON,
      uloga: "vlasnik",
      dokazi: {
        brojUBiouSalonaJedinaOsoba: true,
        vrstaBroja: "fiksni",
        istiBrojKaoSalon: true,
      },
    },
    // 15 − 20 − 25 = −30, a pod je 0: procena POSTOJI i kaže „skoro sigurno
    // nije njen lični broj". To nije isto što i „nije moguće proceniti".
    ocekujem: { verovatnoca: 0, traka: "nisko" },
  },
  {
    naziv: "DOO sa više osnivača + fiksni broj uz ime na sajtu",
    osoba: {
      telefon: TELEFON,
      uloga: "direktor",
      dokazi: {
        brojUzImeNaSajtu: true,
        vrstaBroja: "fiksni",
        pravniOblik: "doo_vise_osnivaca",
      },
    },
    ocekujem: { verovatnoca: 5, traka: "nisko" },
  },
  {
    naziv: "Mobilni u biografiji ličnog IG profila",
    osoba: {
      telefon: TELEFON,
      uloga: "vlasnica",
      dokazi: { brojUBiouLicnogProfila: true, vrstaBroja: "mobilni" },
    },
    // 25 + 15 = 40. Prompt je ovaj slučaj nazvao „srednje-visoko"; pravilo iz
    // §6 daje tačno 40, što je donja ivica žute trake. Pravilo je izvor istine.
    ocekujem: { verovatnoca: 40, traka: "srednje" },
  },
  {
    naziv: "Vlasnik bez telefona — nema šta da se procenjuje",
    osoba: { uloga: "vlasnik", dokazi: { pravniOblik: "pr" } },
    ocekujem: { bezPolja: true },
  },
  {
    naziv: "Svi dokazi zajedno — kap je 95, nikad 100",
    osoba: {
      telefon: TELEFON,
      uloga: "vlasnik",
      dokazi: {
        brojUAprZapisuOsobe: true,
        brojUzImeNaSajtu: true,
        brojUBiouLicnogProfila: true,
        brojUBiouSalonaJedinaOsoba: true,
        vrstaBroja: "mobilni",
        istiBrojKaoSalon: true,
        samoNaAgregatoru: true,
        pravniOblik: "pr",
        dvaNezavisnaIzvora: true,
      },
    },
    ocekujem: { verovatnoca: 95, traka: "visoko" },
  },
  {
    naziv: "Mobilni + PR + dva izvora, ali nijedan dokaz grupe A",
    osoba: {
      telefon: TELEFON,
      uloga: "vlasnik",
      dokazi: { vrstaBroja: "mobilni", pravniOblik: "pr", dvaNezavisnaIzvora: true },
    },
    ocekujem: { nijeMoguceProceniti: true },
  },
];

function testSkor(prijavi) {
  for (const slucaj of SKOR_SLUCAJEVI) {
    const rezultat = oceniTelefonOsobe(slucaj.osoba);

    if (slucaj.ocekujem.bezPolja) {
      prijavi(
        Object.keys(rezultat).length === 0,
        `skor: ${slucaj.naziv}`,
        `očekivan prazan rezultat, dobijeno: ${Object.keys(rezultat).join(", ") || "(prazno)"}`,
      );
      continue;
    }

    if (slucaj.ocekujem.nijeMoguceProceniti) {
      prijavi(
        rezultat.nijeMoguceProceniti === true && rezultat.verovatnoca === undefined,
        `skor: ${slucaj.naziv}`,
        `očekivano „nije moguće proceniti" bez broja, dobijeno: ${JSON.stringify({
          verovatnoca: rezultat.verovatnoca,
          nijeMoguceProceniti: rezultat.nijeMoguceProceniti,
        })}`,
      );
    } else {
      prijavi(
        rezultat.verovatnoca === slucaj.ocekujem.verovatnoca &&
          rezultat.nijeMoguceProceniti === undefined,
        `skor: ${slucaj.naziv}`,
        `očekivano ${slucaj.ocekujem.verovatnoca}, dobijeno ${rezultat.verovatnoca}`,
      );
      prijavi(
        traka(rezultat.verovatnoca) === slucaj.ocekujem.traka,
        `skor: ${slucaj.naziv} — traka`,
        `očekivano ${slucaj.ocekujem.traka}, dobijeno ${traka(rezultat.verovatnoca)}`,
      );
    }

    // Obrazloženje: tačno dve rečenice (§6) i nijedna cifra — sirov broj se u
    // obrazloženju ne ponavlja (§0 pravilo 6).
    const recenica = (rezultat.obrazlozenje?.match(/\.(\s|$)/g) ?? []).length;
    prijavi(
      recenica === 2,
      `skor: ${slucaj.naziv} — dve rečenice`,
      `očekivane 2 rečenice, dobijeno ${recenica}`,
    );
    prijavi(
      !/\d/.test(rezultat.obrazlozenje ?? ""),
      `skor: ${slucaj.naziv} — bez cifara u obrazloženju`,
      "obrazloženje sadrži cifru; sirov broj ne sme da se ponavlja",
    );
  }

  // Rangiranje: vlasnik pre direktora, najviše tri osobe, rang 1..3.
  const poredjane = oceniOsobe([
    { ime: "Test Osoba 3", uloga: "menadžer", telefon: TELEFON, dokazi: { brojUzImeNaSajtu: true } },
    { ime: "Test Osoba 1", uloga: "vlasnik" },
    { ime: "Test Osoba 2", uloga: "direktor", telefon: TELEFON, dokazi: { brojUAprZapisuOsobe: true } },
    { ime: "Test Osoba 4", uloga: "recepcija" },
  ]);
  prijavi(poredjane.length === 3, "skor: najviše tri osobe", `dobijeno ${poredjane.length}`);
  prijavi(
    poredjane[0]?.ime === "Test Osoba 1",
    "skor: vlasnik bez telefona ide prvi",
    `prvi je ${poredjane[0]?.ime}`,
  );
  prijavi(
    poredjane.every((o, i) => o.rang === i + 1),
    "skor: rang je 1, 2, 3",
    `dobijeno ${poredjane.map((o) => o.rang).join(", ")}`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Niše
// ─────────────────────────────────────────────────────────────────────────────

const NISA_MAPIRANJA = [
  ["frizeri", "frizerski-saloni"],
  ["kozmeticki salon", "kozmeticki-saloni"],
  ["turistička agencija", "turisticke-agencije"],
  ["zubar", "stomatoloske-ordinacije"],
  ["teretana", "teretane"],
  ["restoran", "restorani"],
  ["auto servis", "auto-servisi"],
  ["cvećara", "cvecare"],
  ["pekara", "pekare"],
  ["butik", "butici"],
];

function testNise(prijavi) {
  prijavi(NISE.length === 10, "niše: ima ih 10", `dobijeno ${NISE.length}`);

  const slugovi = new Set();
  for (const nisa of NISE) {
    prijavi(
      normalizujSlug(nisa.slug) === nisa.slug,
      `niše: slug „${nisa.slug}" preživljava normalizaciju`,
      `normalizacija daje „${normalizujSlug(nisa.slug)}"`,
    );
    prijavi(!slugovi.has(nisa.slug), `niše: slug „${nisa.slug}" je jedinstven`, "duplikat sluga");
    slugovi.add(nisa.slug);

    prijavi(
      nisa.upiti.sr.length >= 2 && nisa.upiti.en.length >= 1,
      `niše: „${nisa.slug}" ima upite na oba jezika`,
      `sr: ${nisa.upiti.sr.length}, en: ${nisa.upiti.en.length}`,
    );
    prijavi(
      typeof nisa.opis === "string" && nisa.opis.length > 150,
      `niše: „${nisa.slug}" ima opis`,
      `dužina opisa: ${nisa.opis?.length ?? 0}`,
    );
    prijavi(
      Array.isArray(nisa.sifreDelatnosti) && nisa.sifreDelatnosti.length > 0,
      `niše: „${nisa.slug}" ima šifre delatnosti`,
      "prazan spisak šifara",
    );
    prijavi(
      upitiNise(nisa).length === nisa.upiti.sr.length + nisa.upiti.en.length,
      `niše: „${nisa.slug}" spaja upite`,
      "spajanje upita ne vraća sve",
    );
  }

  for (const [unos, ocekivano] of NISA_MAPIRANJA) {
    const nadjena = nadjiNisu(unos);
    prijavi(
      nadjena?.slug === ocekivano,
      `niše: „${unos}" → ${ocekivano}`,
      `dobijeno ${nadjena?.slug ?? "null"}`,
    );
  }

  prijavi(
    nadjiNisu("prodavnica tepiha") === null,
    "niše: nepoznata niša vraća null (skill tada pita, ne izmišlja)",
    "nepoznata niša je nešto vratila",
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Šema — 3 JSON primera kroz obe kopije
// ─────────────────────────────────────────────────────────────────────────────

const okvir = (redovi) => ({
  verzija: 1,
  upit: {
    grad: "Beograd",
    nisa: "frizerski-saloni",
    brojTrazen: 5,
    filterSajt: "nema",
    // Opcion opis niše (GL6 §4) — exercise polja kroz obe kopije šeme.
    nisaOpis: "Izmišljeni opis niše za self-test, kraći od 1200 znakova.",
  },
  izvor: { skill: "generate-leads", verzijaSkilla: "1.0.0", pokrenutAt: 1_757_000_000_000 },
  redovi,
  izvestaj: {
    nadjeno: redovi.length,
    trazeno: 5,
    iscrpljen: true,
    placesPozivi: 4,
    nedostupniIzvori: ["011info"],
    napomena: "Primer iz self-testa, izmišljeni podaci.",
  },
});

/** Pun red — namerno nosi SVAKO polje šeme, da ispadanje bilo kog polja padne. */
const PUN_RED = {
  nazivFirme: "Test Salon 1",
  ulica: "Izmišljena 1",
  opstina: "Stari grad",
  grad: "Beograd",
  telefon: TELEFON,
  telefonNapomena: "broj sa izmišljene stranice",
  email: "kontakt@primer-nepostojeci.rs",
  sajt: "https://primer-nepostojeci.rs",
  imeOsobe: "Test Osoba 1",
  uloga: "vlasnik",
  ocena: { vrednost: 4.7, skala: 5, brojRecenzija: 128, izvor: "izmišljeni imenik" },
  companyWallUrl: "https://primer-nepostojeci.rs/companywall",
  companyWallTacnost: "tacno",
  pib: "100000000",
  maticniBroj: "20000000",
  sifraDelatnosti: "9602",
  napomena: "Red iz self-testa.",
  izvori: ["https://primer-nepostojeci.rs/kontakt"],
  derivedSignals: [],
  derivedFields: ["telefon"],
  placeId: "TEST_PLACE_ID_1",
  nisa: "frizerski-saloni",
  imaSajt: "da",
  imaSajtNapomena: "sajt potvrđen sa same stranice",
  sajtStatus: "radi",
  sajtHttps: true,
  sajtProverenAt: 1_757_000_000_000,
  sajtNapomena: "200, stranica se učitava",
  koordinate: { lat: 44.8125, lng: 20.4612, izvor: "nominatim" },
  platforme: [
    { vrsta: "website", url: "https://primer-nepostojeci.rs", sourceUrl: "https://primer-nepostojeci.rs" },
    {
      vrsta: "instagram",
      url: "https://instagram.com/test.salon.1",
      sourceUrl: "https://primer-nepostojeci.rs/kontakt",
    },
    {
      vrsta: "facebook",
      url: "https://facebook.com/test.salon.1",
      sourceUrl: "https://primer-nepostojeci.rs/kontakt",
    },
    {
      vrsta: "tiktok",
      url: "https://tiktok.com/@test.salon.1",
      sourceUrl: "https://primer-nepostojeci.rs/kontakt",
    },
    {
      vrsta: "threads",
      url: "https://threads.net/@test.salon.1",
      sourceUrl: "https://primer-nepostojeci.rs/kontakt",
    },
  ],
  osobe: [
    {
      ime: "Test Osoba 1",
      uloga: "vlasnik",
      ulogaIzvor: "CompanyWall (izmišljeni zapis)",
      telefon: TELEFON,
      telefonSourceUrl: "https://primer-nepostojeci.rs/kontakt",
      verovatnoca: 70,
      obrazlozenje: "Prva rečenica dokaza. Druga rečenica kontra-dokaza.",
      rang: 1,
    },
    {
      ime: "Test Osoba 2",
      uloga: "direktor",
      ulogaIzvor: "izmišljeni imenik",
      telefon: TELEFON,
      telefonSourceUrl: "https://primer-nepostojeci.rs/o-nama",
      nijeMoguceProceniti: true,
      obrazlozenje: "Nijedan izvor ne vezuje broj za ime. Bez veze nema procene.",
      rang: 2,
    },
    { ime: "Test Osoba 3", uloga: "menadžer", ulogaIzvor: "sajt firme", rang: 3 },
  ],
  izvestajSkilla: "nađeno na: sajt, CompanyWall; 011info nedostupan",
};

/** Ostala četiri statusa sajta i ostale vrednosti `imaSajt` — pokrivenost enuma. */
const OSTALI_REDOVI = [
  { nazivFirme: "Test Salon 2", grad: "Beograd", nisa: "frizerski-saloni", imaSajt: "ne", imaSajtNapomena: "sva tri izvora potvrđuju odsustvo" },
  { nazivFirme: "Test Salon 3", grad: "Beograd", nisa: "frizerski-saloni", imaSajt: "nepoznato", sajtStatus: "ne_radi", sajtHttps: false },
  { nazivFirme: "Test Salon 4", grad: "Beograd", nisa: "frizerski-saloni", sajtStatus: "parkiran", companyWallTacnost: "priblizno" },
  { nazivFirme: "Test Salon 5", grad: "Beograd", nisa: "frizerski-saloni", sajtStatus: "preusmerava_na_drustvene" },
  { nazivFirme: "Test Salon 6", grad: "Beograd", nisa: "frizerski-saloni", sajtStatus: "nepoznato" },
];

const PRIMERI = [
  {
    naziv: "1. pun ispravan zahtev (sva polja, svi enumi)",
    telo: okvir([PUN_RED, ...OSTALI_REDOVI]),
    ocekujem: "prolazi",
  },
  {
    naziv: "2. telefon osobe bez telefonSourceUrl",
    telo: okvir([
      {
        nazivFirme: "Test Salon 7",
        grad: "Beograd",
        osobe: [
          {
            ime: "Test Osoba 4",
            uloga: "vlasnik",
            ulogaIzvor: "sajt firme",
            telefon: TELEFON,
            rang: 1,
          },
        ],
      },
    ]),
    ocekujem: "pada",
    polja: ["redovi.0.osobe.0.telefonSourceUrl: custom"],
  },
  {
    naziv: "3. četiri osobe (granica je tri)",
    telo: okvir([
      {
        nazivFirme: "Test Salon 8",
        grad: "Beograd",
        osobe: [1, 2, 3, 3].map((rang, i) => ({
          ime: `Test Osoba ${i + 5}`,
          uloga: "vlasnik",
          ulogaIzvor: "sajt firme",
          rang,
        })),
      },
    ]),
    ocekujem: "pada",
    polja: ["redovi.0.osobe: too_big"],
  },
  {
    naziv: "4. opis niše duži od 1200 znakova",
    telo: (() => {
      const t = okvir([{ nazivFirme: "Test Salon 9", grad: "Beograd", nisa: "frizerski-saloni" }]);
      t.upit.nisaOpis = "x".repeat(1201);
      return t;
    })(),
    ocekujem: "pada",
    polja: ["upit.nisaOpis: too_big"],
  },
  {
    // GL8: režim „obogati" sa `izvorFajl` i redom koji nosi `postojecaFirmaId`.
    naziv: "5. obogati: rezim + izvorFajl + postojecaFirmaId",
    telo: (() => {
      const t = okvir([
        {
          nazivFirme: "Test Salon 10",
          grad: "Beograd",
          nisa: "frizerski-saloni",
          postojecaFirmaId: "k1234567890abcdefghij000",
        },
      ]);
      t.upit.rezim = "obogati";
      t.upit.izvorFajl = "Belgrade_Salon_Leads.xlsx";
      return t;
    })(),
    ocekujem: "prolazi",
  },
  {
    naziv: "6. nepoznat režim se odbija",
    telo: (() => {
      const t = okvir([{ nazivFirme: "Test Salon 11", grad: "Beograd", nisa: "frizerski-saloni" }]);
      t.upit.rezim = "nesto";
      return t;
    })(),
    ocekujem: "pada",
    polja: ["upit.rezim: invalid_value"],
  },
];

/** Zod šema iz Convexa — jedini izvor istine. `null` kad se ne može učitati. */
async function ucitajZodSemu() {
  const url = new URL("../../../convex/lib/generateLeadsIngest.ts", import.meta.url);
  if (!existsSync(fileURLToPath(url))) return null;
  try {
    return await import(url.href);
  } catch (err) {
    return { greska: err };
  }
}

async function testSema(prijavi, strogo) {
  for (const primer of PRIMERI) {
    const rezultat = validirajTelo(primer.telo);
    const prolazi = rezultat.ok === true;

    prijavi(
      prolazi === (primer.ocekujem === "prolazi"),
      `šema (lib/schema.mjs): ${primer.naziv}`,
      prolazi ? "očekivan pad, telo je prošlo" : `odbijena polja: ${rezultat.polja.join(", ")}`,
    );

    if (primer.ocekujem === "pada" && !prolazi) {
      prijavi(
        JSON.stringify(rezultat.polja) === JSON.stringify(primer.polja),
        `šema (lib/schema.mjs): putanje za „${primer.naziv}"`,
        `očekivano ${JSON.stringify(primer.polja)}, dobijeno ${JSON.stringify(rezultat.polja)}`,
      );
    }
  }

  const modul = await ucitajZodSemu();

  if (modul === null || modul.greska) {
    const razlog =
      modul === null
        ? "convex/lib/generateLeadsIngest.ts nije nađen (skill je pokrenut van repoa)"
        : `zod šema se ne učitava: ${modul.greska.message}`;

    if (strogo) {
      prijavi(false, "šema: poređenje sa zod šemom iz Convexa", razlog);
      return;
    }

    ispisi(`  PRESKOČENO  poređenje sa zod šemom — ${razlog}`);
    ispisi("              (pokreni `npm run verify:gl-skill` iz repoa za pun test)");
    return;
  }

  const { generateLeadsIngestSchema, greskeValidacije } = modul;

  for (const primer of PRIMERI) {
    const zodRez = generateLeadsIngestSchema.safeParse(primer.telo);
    const nas = validirajTelo(primer.telo);

    prijavi(
      zodRez.success === nas.ok,
      `šema: ista presuda za „${primer.naziv}"`,
      `zod: ${zodRez.success ? "prolazi" : "pada"}, lib/schema.mjs: ${nas.ok ? "prolazi" : "pada"}`,
    );

    if (!zodRez.success) {
      const zodPolja = greskeValidacije(zodRez.error);
      prijavi(
        JSON.stringify(zodPolja) === JSON.stringify(nas.polja ?? []),
        `šema: iste putanje za „${primer.naziv}"`,
        `zod: ${JSON.stringify(zodPolja)}, lib/schema.mjs: ${JSON.stringify(nas.polja ?? [])}`,
      );
    }
  }

  // Granice moraju da budu isti brojevi u obe kopije — 200/3/10 se ne pogađa.
  const nase = await import("./schema.mjs");
  prijavi(
    modul.MAX_INGEST_ROWS === nase.MAX_INGEST_ROWS &&
      modul.MAX_PEOPLE_PER_ROW === nase.MAX_PEOPLE_PER_ROW &&
      modul.MAX_PLATFORMS_PER_ROW === nase.MAX_PLATFORMS_PER_ROW,
    "šema: iste granice (redovi, osobe, platforme)",
    `Convex: ${modul.MAX_INGEST_ROWS}/${modul.MAX_PEOPLE_PER_ROW}/${modul.MAX_PLATFORMS_PER_ROW}, ` +
      `skill: ${nase.MAX_INGEST_ROWS}/${nase.MAX_PEOPLE_PER_ROW}/${nase.MAX_PLATFORMS_PER_ROW}`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3b. Filter grada (GL6 §3) — 6 oblika adrese, bez mreže
// ─────────────────────────────────────────────────────────────────────────────

function testFilterGrada(prijavi) {
  // Pretraga „Beograd": kanonski + egzonim + opštine kao alijasi.
  const bg = alijasiGrada("Beograd");
  const bgPrihvatljivi = prihvatljiviGradovi(bg.kanonski, bg.alijasi);

  const SLUCAJEVI = [
    { naziv: "latinica", adresa: "Knez Mihailova 1, Beograd, Srbija", ocekujem: true },
    { naziv: "ćirilica", adresa: "Кнез Михаилова 1, Београд, Србија", ocekujem: true },
    { naziv: "engleski egzonim", adresa: "Knez Mihailova 1, Belgrade, Serbia", ocekujem: true },
    { naziv: "opština bez reči Beograd", adresa: "Glavna 5, Zemun", ocekujem: true },
    { naziv: "drugi grad", adresa: "Zmaj Jovina 1, Novi Sad, Srbija", ocekujem: false },
    { naziv: "prazna adresa", adresa: "", ocekujem: false },
  ];

  for (const s of SLUCAJEVI) {
    prijavi(
      uGradu(s.adresa, bgPrihvatljivi) === s.ocekujem,
      `filter grada (Beograd): ${s.naziv}`,
      `očekivano ${s.ocekujem}, dobijeno ${uGradu(s.adresa, bgPrihvatljivi)} za „${s.adresa}"`,
    );
  }

  // Opština uneta kao grad: „Zemun" je kanonski, „Beograd" je alijas —
  // ali čist Novi Sad ne prolazi kroz Zemun.
  const zemun = alijasiGrada("Zemun");
  prijavi(zemun.kanonski === "Zemun", "filter grada: Zemun je kanonski", `dobijeno ${zemun.kanonski}`);
  const zemunPrihvatljivi = prihvatljiviGradovi(zemun.kanonski, zemun.alijasi);
  prijavi(
    uGradu("Glavna 5, Zemun, Beograd", zemunPrihvatljivi) === true,
    `filter grada: Zemun prihvata adresu sa „Beograd"`,
    "adresa opštine sa gradom nije prošla",
  );
  prijavi(
    uGradu("Zmaj Jovina 1, Novi Sad", zemunPrihvatljivi) === false,
    "filter grada: Zemun ne prihvata Novi Sad",
    "drugi grad je prošao kroz opštinu",
  );

  // Egzonim za Niš i transliteracija ćirilice na kanonski.
  const nis = alijasiGrada("Nis");
  prijavi(nis.kanonski === "Niš", `filter grada: „Nis" → kanonski „Niš"`, `dobijeno ${nis.kanonski}`);
  const nisCir = alijasiGrada("Ниш");
  prijavi(nisCir.kanonski === "Niš", `filter grada: „Ниш" → kanonski „Niš"`, `dobijeno ${nisCir.kanonski}`);

  // Nepoznat grad: doslovno, bez ugrađenih alijasa.
  const nepoznat = alijasiGrada("Kruševac");
  prijavi(
    nepoznat.kanonski === "Kruševac" && nepoznat.alijasi.length === 0,
    "filter grada: nepoznat grad se koristi doslovno",
    `dobijeno ${nepoznat.kanonski} / ${JSON.stringify(nepoznat.alijasi)}`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Status sajta (§3.8) — 6 lažnih odgovora, bez mreže
// ─────────────────────────────────────────────────────────────────────────────

const SAJT_SLUCAJEVI = [
  {
    naziv: "200 sa HTML sadržajem",
    odgovor: {
      status: 200,
      finalUrl: "https://primer-nepostojeci.rs/",
      contentType: "text/html; charset=utf-8",
      telo: "<html><body><h1>Test Salon 1</h1><p>Radno vreme</p></body></html>",
    },
    ocekujem: { sajtStatus: "radi", sajtHttps: true },
  },
  {
    naziv: "200 sa potpisom parkirane stranice",
    odgovor: {
      status: 200,
      finalUrl: "http://primer-nepostojeci.rs/",
      contentType: "text/html",
      telo: "<html><body>This domain is for sale. Buy this domain.</body></html>",
    },
    ocekujem: { sajtStatus: "parkiran", sajtHttps: false },
  },
  {
    naziv: "302 na instagram.com",
    odgovor: { status: 302, finalUrl: "https://www.instagram.com/test.salon.1/" },
    ocekujem: { sajtStatus: "preusmerava_na_drustvene", sajtHttps: true },
  },
  {
    naziv: "DNS greška",
    odgovor: { greska: "dns", finalUrl: "https://primer-nepostojeci.rs/" },
    ocekujem: { sajtStatus: "ne_radi" },
  },
  {
    naziv: "timeout posle 8 s",
    odgovor: { greska: "timeout", finalUrl: "https://primer-nepostojeci.rs/" },
    ocekujem: { sajtStatus: "ne_radi" },
  },
  {
    naziv: "503 sa servera",
    odgovor: { status: 503, finalUrl: "https://primer-nepostojeci.rs/" },
    ocekujem: { sajtStatus: "ne_radi" },
  },
];

async function testSajt(prijavi) {
  for (const slucaj of SAJT_SLUCAJEVI) {
    const rezultat = klasifikuj(slucaj.odgovor);
    prijavi(
      rezultat.sajtStatus === slucaj.ocekujem.sajtStatus,
      `sajt: ${slucaj.naziv}`,
      `očekivano ${slucaj.ocekujem.sajtStatus}, dobijeno ${rezultat.sajtStatus} (${rezultat.sajtNapomena})`,
    );
    if (slucaj.ocekujem.sajtHttps !== undefined) {
      prijavi(
        rezultat.sajtHttps === slucaj.ocekujem.sajtHttps,
        `sajt: ${slucaj.naziv} — HTTPS`,
        `očekivano ${slucaj.ocekujem.sajtHttps}, dobijeno ${rezultat.sajtHttps}`,
      );
    }
    prijavi(
      typeof rezultat.sajtNapomena === "string" && rezultat.sajtNapomena.length > 0,
      `sajt: ${slucaj.naziv} — napomena postoji`,
      "napomena je prazna",
    );
  }

  // „nepoznato" mora da postoji kao ishod različit od „ne_radi": mreža sa naše
  // mašine i mrtav sajt nisu ista tvrdnja (§3.8).
  prijavi(
    klasifikuj({ greska: "mreza" }).sajtStatus === "nepoznato",
    "sajt: greška mreže daje nepoznato, ne ne_radi",
    `dobijeno ${klasifikuj({ greska: "mreza" }).sajtStatus}`,
  );
  prijavi(
    klasifikuj({ status: 403, finalUrl: "https://primer-nepostojeci.rs/" }).sajtStatus ===
      "nepoznato",
    "sajt: 403 je blokada provere, ne mrtav sajt",
    "403 je klasifikovan kao nešto drugo",
  );

  // Dve provere pune putanje `proveriSajt` koje NE traže mrežu: literalna IP
  // adresa se ne razrešava, a neispravna šema ne stiže ni do razrešavanja.
  // Postoje zato što je greška pre `fetch`-a (npr. pad razrešavanja imena) umela
  // da izleti kao izuzetak i obori celu komandu umesto da postane status.
  const ua = "EnigmaGenerateLeads/self-test (test@example.com)";

  const lokalna = await proveriSajt("http://127.0.0.1:3000/", { userAgent: ua });
  prijavi(
    lokalna.sajtStatus === "nepoznato" && typeof lokalna.sajtProverenAt === "number",
    "sajt: privatna adresa se odbija, bez izuzetka",
    `dobijeno ${lokalna.sajtStatus} (${lokalna.sajtNapomena})`,
  );

  const losaSema = await proveriSajt("ftp://primer-nepostojeci.rs", { userAgent: ua });
  prijavi(
    losaSema.sajtStatus === "nepoznato" && typeof losaSema.sajtProverenAt === "number",
    "sajt: neispravna adresa daje status, ne izuzetak",
    `dobijeno ${losaSema.sajtStatus} (${losaSema.sajtNapomena})`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Učitavanje tabele (režim „obogati", GL8 §1) — bez mreže
// ─────────────────────────────────────────────────────────────────────────────

/** Matrica kao Jovanova tabela: naslov u redu 1, zaglavlje u redu 2. */
const UZORAK_MATRICA = [
  ["Svi lidovi (5)"],
  ["#", "Ime_Salona", "Lokacija", "Telefon", "Ime_osobe", "Pozicija", "Ocena", "Napomena_za_prodaju", "Izvor_podataka"],
  ["1", "Test Salon 1", "Izmisljena 1, Vracar, Beograd", "+381 60 000 0001", "Test Osoba 1", "vlasnik", "4,8 (120 recenzija)", "nema sajt", "https://www.companywall.rs/firma/test-salon-1"],
  ["2", "Test Salon 2", "Izmisljena 2, Zemun", "+381 60 000 0002", "", "", "4.8", "salon bez sajta", "google maps"],
  ["3", "Test Salon 3", "Novi Sad", "+381 60 000 0003", "Test Osoba 3", "direktor", "", "", "011info"],
  ["4", "Test Salon 4", "Izmisljena 4, Zvezdara, Beograd", "+381 60 000 0004", "Test Osoba 4", "menadzer", "5,0 (10 recenzija)", "hitno pozvati", "sajt firme"],
  ["5", "Test Salon 5", "Izmisljena 5, Nis", "+381 60 000 0005", "", "", "3,9", "", "companywall.rs/firma/test-salon-5"],
];

async function testUcitaj(prijavi, strogo) {
  const { firme, izvestaj } = ucitajMatricu(UZORAK_MATRICA, { izvorFajl: "uzorak.csv" });

  prijavi(firme.length === 5, "ucitaj: 5 firmi iz matrice", `dobijeno ${firme.length}`);
  prijavi(izvestaj.saOsobom === 3, "ucitaj: 3 firme sa osobom", `dobijeno ${izvestaj.saOsobom}`);
  prijavi(izvestaj.saTelefonom === 5, "ucitaj: 5 sa telefonom", `dobijeno ${izvestaj.saTelefonom}`);
  prijavi(izvestaj.saCompanyWall === 2, "ucitaj: 2 sa CompanyWall linkom", `dobijeno ${izvestaj.saCompanyWall}`);

  const f1 = firme[0];
  prijavi(f1.nazivFirme === "Test Salon 1", `ucitaj: naziv iz Ime_Salona`, `dobijeno ${f1.nazivFirme}`);
  prijavi(f1.ulica === "Izmisljena 1" && f1.opstina === "Vracar" && f1.grad === "Beograd",
    `ucitaj: Lokacija razlozena na ulicu/opstinu/grad`,
    `dobijeno ${JSON.stringify({ u: f1.ulica, o: f1.opstina, g: f1.grad })}`);
  prijavi(f1.poreklo === "tabela", `ucitaj: poreklo je „tabela"`, `dobijeno ${f1.poreklo}`);
  prijavi(f1.sourceUrl === "tabela:uzorak.csv#3", `ucitaj: sourceUrl = tabela:<fajl>#<red>`, `dobijeno ${f1.sourceUrl}`);
  prijavi(Array.isArray(f1.izvori) && f1.izvori[0] === "tabela:uzorak.csv#3",
    `ucitaj: izvori nose marker porekla`,
    `dobijeno ${JSON.stringify(f1.izvori)}`);
  prijavi(/companywall\.rs\/firma\/test-salon-1/.test(f1.companyWallUrl ?? ""),
    `ucitaj: CompanyWall URL iz Izvor_podataka`, `dobijeno ${f1.companyWallUrl}`);
  prijavi(Array.isArray(f1.osobe) && f1.osobe[0].ulogaIzvor === "tabela" && f1.osobe[0].rang === 1,
    `ucitaj: Ime_osobe+Pozicija → osoba sa ulogaIzvor „tabela"`,
    `dobijeno ${JSON.stringify(f1.osobe)}`);

  // Ocena regex: „4,8 (120 recenzija)" i implicitni brojevi.
  const o1 = f1.ocena;
  prijavi(o1 && o1.vrednost === 4.8 && o1.brojRecenzija === 120,
    `ucitaj: Ocena „4,8 (120 recenzija)" → {4.8, 120}`, `dobijeno ${JSON.stringify(o1)}`);
  prijavi(firme[1].ocena && firme[1].ocena.vrednost === 4.8 && firme[1].ocena.brojRecenzija === undefined,
    `ucitaj: Ocena „4.8" → samo vrednost`, `dobijeno ${JSON.stringify(firme[1].ocena)}`);
  prijavi(firme[2].ocena === undefined, `ucitaj: prazna Ocena → undefined`, `dobijeno ${JSON.stringify(firme[2].ocena)}`);

  // Direktne provere parsirajOcenu (§5).
  prijavi(JSON.stringify(parsirajOcenu("4,8 (120 recenzija)")) === JSON.stringify({ vrednost: 4.8, brojRecenzija: 120 }),
    `ucitaj: parsirajOcenu „4,8 (120 recenzija)"`, JSON.stringify(parsirajOcenu("4,8 (120 recenzija)")));
  prijavi(JSON.stringify(parsirajOcenu("4.8")) === JSON.stringify({ vrednost: 4.8 }),
    `ucitaj: parsirajOcenu „4.8"`, JSON.stringify(parsirajOcenu("4.8")));
  prijavi(parsirajOcenu("") === undefined, `ucitaj: parsirajOcenu prazno → undefined`, String(parsirajOcenu("")));

  // Red bez naziva se preskače (upozorenje sa brojem reda).
  const saPraznim = [
    UZORAK_MATRICA[1],
    ["9", "", "Neka ulica, Beograd", "+381 60 000 0009", "", "", "", "", ""],
    ["10", "Test Salon X", "Neka ulica, Beograd", "+381 60 000 0010", "", "", "", "", ""],
  ];
  const bezNaziva = ucitajMatricu(saPraznim, { izvorFajl: "x.csv" });
  prijavi(bezNaziva.firme.length === 1 && bezNaziva.izvestaj.preskoceniBezNaziva.length === 1,
    "ucitaj: red bez naziva se preskače i broji",
    `firmi ${bezNaziva.firme.length}, preskočeno ${JSON.stringify(bezNaziva.izvestaj.preskoceniBezNaziva)}`);

  // company_id iz izvoza aplikacije → postojecaFirmaId.
  const izvozMatrica = [
    ["company_id", "naziv_firme", "grad", "telefon", "companywall_url"],
    ["k1234567890abcdefghij000", "Test Salon 1", "Beograd", "+381 60 000 0001", ""],
  ];
  const izvoz = ucitajMatricu(izvozMatrica, { izvorFajl: "izvoz.csv" });
  prijavi(izvoz.firme[0]?.postojecaFirmaId === "k1234567890abcdefghij000",
    "ucitaj: company_id → postojecaFirmaId (za --izvoz)", `dobijeno ${izvoz.firme[0]?.postojecaFirmaId}`);

  // End-to-end nad zapisanim CSV fixture-om (bez mreže, čist Node).
  const fixture = join(dirname(fileURLToPath(import.meta.url)), "..", "test", "uzorak.csv");
  if (existsSync(fixture)) {
    const izFajla = await ucitajFajl(fixture, {});
    prijavi(izFajla.firme.length === 5, "ucitaj: CSV fixture daje 5 firmi", `dobijeno ${izFajla.firme.length}`);
  } else if (strogo) {
    prijavi(false, "ucitaj: CSV fixture postoji", `nema ${fixture}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Razlika ulaz ↔ izlaz („samo promenjeni", GL8 §3)
// ─────────────────────────────────────────────────────────────────────────────

function testObogatiRazlika(prijavi) {
  const ulaz = [
    { nazivFirme: "Test Salon 1", grad: "Beograd", telefon: "+381 60 000 0001", poreklo: "tabela", sourceUrl: "tabela:x#3", izvori: ["tabela:x#3"] },
    { nazivFirme: "Test Salon 2", grad: "Beograd", telefon: "+381 60 000 0002", poreklo: "tabela", sourceUrl: "tabela:x#4", izvori: ["tabela:x#4"] },
  ];
  // Izlaz: prva firma dobila novu vrednost (imaSajt), druga netaknuta.
  const izlaz = [
    { ...ulaz[0], imaSajt: "ne", imaSajtNapomena: "sva tri izvora potvrđuju odsustvo" },
    { ...ulaz[1] },
  ];

  prijavi(firmaPromenjena(ulaz[0], izlaz[0]) === true, "obogati: nova vrednost = promena", "nije prepoznata promena");
  prijavi(firmaPromenjena(ulaz[1], izlaz[1]) === false, "obogati: bez promene = nepromenjeno", "lažna promena");

  const r = promenjeneFirme(ulaz, izlaz);
  prijavi(r.promenjeni.length === 1 && r.bezPromene === 1,
    "obogati: šalje se samo promenjeni red",
    `promenjeni ${r.promenjeni.length}, bez promene ${r.bezPromene}`);

  // Marker porekla (`tabela:...`) i radna polja ne broje se kao promena.
  const samoMarker = { ...ulaz[0], sourceUrl: "tabela:x#3", izvori: ["tabela:x#3"] };
  prijavi(firmaPromenjena(ulaz[0], samoMarker) === false,
    "obogati: isti marker porekla nije promena", "marker se broji kao promena");
}

// ─────────────────────────────────────────────────────────────────────────────
// Pokretanje
// ─────────────────────────────────────────────────────────────────────────────

export async function pokreniSelfTest({ strogo = false } = {}) {
  let prosao = 0;
  const pali = [];

  const prijavi = (uslov, naziv, detalj) => {
    if (uslov) {
      prosao += 1;
      return;
    }
    pali.push(`${naziv} — ${detalj}`);
  };

  ispisi(`self-test skilla /generate-leads${strogo ? " (strogo)" : ""}`);
  ispisi("");

  testSkor(prijavi);
  testNise(prijavi);
  testFilterGrada(prijavi);
  await testSema(prijavi, strogo);
  await testSajt(prijavi);
  await testUcitaj(prijavi, strogo);
  testObogatiRazlika(prijavi);

  ispisi("");
  if (pali.length === 0) {
    ispisi(`Sve provere prolaze: ${prosao}.`);
    return 0;
  }

  ispisiGresku(`Palo provera: ${pali.length} (prošlo ${prosao}).`);
  for (const poruka of pali) ispisiGresku(`  ✗ ${poruka}`);
  return 1;
}
