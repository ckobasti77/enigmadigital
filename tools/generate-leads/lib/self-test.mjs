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

import { ispisi, ispisiGresku } from "./izlaz.mjs";
import { NISE, nadjiNisu, normalizujSlug, upitiNise } from "./nise.mjs";
import { klasifikuj, proveriSajt } from "./sajt.mjs";
import { oceniTelefonOsobe, oceniOsobe, traka } from "./skor.mjs";
import { validirajTelo } from "./schema.mjs";

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
  upit: { grad: "Beograd", nisa: "frizerski-saloni", brojTrazen: 5, filterSajt: "nema" },
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
  await testSema(prijavi, strogo);
  await testSajt(prijavi);

  ispisi("");
  if (pali.length === 0) {
    ispisi(`Sve provere prolaze: ${prosao}.`);
    return 0;
  }

  ispisiGresku(`Palo provera: ${pali.length} (prošlo ${prosao}).`);
  for (const poruka of pali) ispisiGresku(`  ✗ ${poruka}`);
  return 1;
}
