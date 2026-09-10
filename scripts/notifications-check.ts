/**
 * ============================================================================
 * DOKAZ: „Šta me čeka" ne izmišlja posao i ne vodi u prazno (A2 §6)
 * ============================================================================
 *
 * Pokretanje:
 *   npm run verify:obavestenja
 *   (ili: node --import ./scripts/ts-hooks.mjs scripts/notifications-check.ts)
 *
 * Zašto postoji: zadaci se IZVODE pri čitanju i nigde se ne skladište, pa
 * greška u proizvođaču ne ostavlja trag ni u jednoj tabeli — samo bi se u
 * zvonu tiho pojavila stavka „0 zaostalih koraka" ili dugme koje vodi na
 * stranicu koje nema. Ovde se, bez baze i bez mreže, dokazuje:
 *
 *   1. zadatak sa brojem 0 se NE pravi — ni za jednog proizvođača;
 *   2. svaki proizvođač ume da napravi svoj zadatak kad posla ima, i tada
 *      pravi TAČNO njega (ne budi susede);
 *   3. odlaganje sakriva stavku do datuma, i vraća je posle njega;
 *   4. sakrivanje traje dok posao ne naraste — sakriveno „39" se vraća na 40;
 *   5. svaka veza vodi na rutu koja POSTOJI na disku, a svaki bedž na stavku
 *      koja postoji u navigaciji;
 *   6. lokalni dan i sat se računaju iz pomeraja, pa termin u 23:30 UTC nije
 *      „danas" za operatera koji je na +02:00;
 *   7. svaki ključ koji proizvođači naprave mutacije priznaju (`jePoznatKljuc`),
 *      i nijedan drugi.
 *
 * Svi podaci su izmišljeni („Test Salon 1"). Nema mreže, nema ključeva.
 */

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import process from "node:process";
import {
  bedzeviOd,
  jePoznatKljuc,
  lokalniSat,
  napraviZadatke,
  podeliPoStanju,
  pocetakLokalnogDana,
  type Snimak,
  type Zadatak,
} from "../convex/lib/notifications";

let pao = 0;
function proveri(naziv: string, uslov: boolean, detalj: string): void {
  if (uslov) {
    console.log(`  OK   ${naziv}`);
  } else {
    pao++;
    console.log(`  PAO  ${naziv} -> ${detalj}`);
  }
}

const KOREN = new URL("../", import.meta.url);
const SAT = 3_600_000;
const DAN = 24 * SAT;
const NOW = Date.UTC(2026, 8, 10, 9, 0, 0); // 10.9.2026, 11:00 po Beogradu
const POMERAJ = 120; // +02:00

/** Snimak u kome NIŠTA ne čeka — polazna tačka za pravilo o nuli. */
function prazanSnimak(): Snimak {
  return {
    now: NOW,
    pomerajMin: POMERAJ,
    uvoziUPregledu: [],
    uvoziSaNerazresenim: [],
    uvoziOdseceni: false,
    integracijeUKvaru: [],
    zaostaliKoraci: 0,
    zaostaliOdsecen: false,
    sastanciDanas: [],
    sastanciProsliBezIshoda: 0,
    nikadDodirnut: 0,
    ukupnoDodela: 178,
    dodeleOdsecene: false,
    bezTelefona: 0,
    ukupnoFirmi: 210,
    firmeOdsecene: false,
    neocenjenSajt: 0,
    kanali: [],
  };
}

/**
 * Po jedan „upali samo ovog proizvođača" slučaj. Isti spisak služi i pravilu o
 * nuli (kad se ne upali nijedan) i pravilu o vezama (svaki zadatak koji sistem
 * ume da napravi mora imati vezu koja postoji).
 */
const PROIZVODJACI: Array<{
  kljuc: string;
  upali: (s: Snimak) => void;
}> = [
  {
    kljuc: "uvoz.u_pregledu",
    upali: (s) => {
      s.uvoziUPregledu = [
        { id: "imp_test_1", fileName: "test-tabela-1.xlsx", uploadedAt: NOW - 13 * DAN },
        { id: "imp_test_2", fileName: "test-tabela-2.xlsx", uploadedAt: NOW - 8 * DAN },
        { id: "imp_test_3", fileName: "test-tabela-3.xlsx", uploadedAt: NOW - 7 * DAN },
      ];
    },
  },
  {
    kljuc: "uvoz.nerazreseni",
    upali: (s) => {
      s.uvoziSaNerazresenim = [
        { id: "imp_test_4", fileName: "test-tabela-4.xlsx", broj: 41, odsecen: false },
        { id: "imp_test_5", fileName: "test-tabela-5.xlsx", broj: 21, odsecen: false },
        { id: "imp_test_6", fileName: "test-tabela-6.xlsx", broj: 9, odsecen: false },
        { id: "imp_test_7", fileName: "test-tabela-7.xlsx", broj: 3, odsecen: false },
        { id: "imp_test_8", fileName: "test-tabela-8.xlsx", broj: 3, odsecen: false },
        { id: "imp_test_9", fileName: "test-tabela-9.xlsx", broj: 1, odsecen: false },
      ];
    },
  },
  {
    kljuc: "sinhronizacija.greska:ga4",
    upali: (s) => {
      s.integracijeUKvaru = [
        {
          provider: "ga4",
          razlog: "greska",
          posledniUspehAt: NOW - 3 * DAN,
          primecenAt: NOW - 3 * DAN,
        },
      ];
    },
  },
  {
    kljuc: "leadovi.zaostali",
    upali: (s) => {
      s.zaostaliKoraci = 7;
    },
  },
  {
    kljuc: "leadovi.sastanci",
    upali: (s) => {
      s.sastanciDanas = [{ at: NOW + 3 * SAT, firma: "Test Salon 1" }];
    },
  },
  {
    kljuc: "leadovi.nikad_dodirnut",
    upali: (s) => {
      s.nikadDodirnut = 178;
    },
  },
  {
    kljuc: "leadovi.bez_telefona",
    upali: (s) => {
      s.bezTelefona = 39;
    },
  },
  {
    kljuc: "leadovi.neocenjen_sajt",
    upali: (s) => {
      s.neocenjenSajt = 94;
    },
  },
  {
    kljuc: "kanali.bez_odgovora:ig_komentari",
    upali: (s) => {
      s.kanali = [
        {
          kljuc: "ig_komentari",
          naslov: "4 komentara bez odgovora na Instagramu",
          broj: 4,
          veza: "/instagram/komentari",
          radnja: "Odgovori",
          bedz: "/instagram",
          imenilac: "u poslednjih 250 komentara",
          odsecen: false,
        },
      ];
    },
  },
];

/** Snimak u kome čeka SVE — izmereno stanje produkcije 9.9.2026 (§1.1). */
function punSnimak(): Snimak {
  const s = prazanSnimak();
  for (const p of PROIZVODJACI) p.upali(s);
  return s;
}

// ── rute na disku ────────────────────────────────────────────────────────────

/**
 * Postoji li stranica za ovu putanju? Traži se `page.tsx` u grupi `(app)`,
 * uključujući dinamičke segmente (`[companyId]`).
 */
function rutaPostoji(putanja: string): boolean {
  const delovi = putanja.split("/").filter((d) => d.length > 0);
  const kandidati = [`app/(app)/${delovi.join("/")}/page.tsx`];
  if (delovi.length === 0) kandidati.push("app/(app)/page.tsx");
  return kandidati.some((rel) =>
    existsSync(fileURLToPath(new URL(rel, KOREN))),
  );
}

/** Href-ovi koji postoje u bočnoj navigaciji — izvor bedževa. */
function navHrefovi(): Set<string> {
  const izvor = readFileSync(
    fileURLToPath(new URL("components/app/nav-items.ts", KOREN)),
    "utf8",
  );
  const out = new Set<string>();
  for (const m of izvor.matchAll(/href:\s*"([^"]+)"/g)) out.add(m[1]);
  return out;
}

// ── provere ──────────────────────────────────────────────────────────────────

function main(): void {
  console.log("=".repeat(78));
  console.log("PROVERA OBAVESTENJA - Sta me ceka (A2)");
  console.log("=".repeat(78));

  // 1 ─ pravilo o nuli
  console.log("\n1. Zadatak sa brojem 0 se NE pravi");
  const prazno = napraviZadatke(prazanSnimak());
  proveri(
    "prazan snimak ne pravi nijedan zadatak",
    prazno.length === 0,
    `dobijeno: ${prazno.map((z) => z.kljuc).join(", ") || "(ništa)"}`,
  );

  // Nula se proverava i po proizvođaču: „0 zaostalih koraka" i „0 sastanaka"
  // su tačno one stavke koje bi se same od sebe pojavile da pravilo negde
  // ispadne, jer njihovi proizvođači nemaju `if` iznad sebe.
  const nula = prazanSnimak();
  nula.zaostaliKoraci = 0;
  nula.nikadDodirnut = 0;
  nula.bezTelefona = 0;
  nula.neocenjenSajt = 0;
  nula.sastanciProsliBezIshoda = 0;
  nula.kanali = [
    {
      kljuc: "ig_komentari",
      naslov: "0 komentara bez odgovora na Instagramu",
      broj: 0,
      veza: "/instagram/komentari",
      radnja: "Odgovori",
      bedz: "/instagram",
      imenilac: null,
      odsecen: false,
    },
  ];
  const izNule = napraviZadatke(nula);
  proveri(
    "izričite nule (koraci, dodiri, telefoni, sajtovi, kanal) ne prave stavke",
    izNule.length === 0,
    `dobijeno: ${izNule.map((z) => z.kljuc).join(", ")}`,
  );
  proveri(
    "nijedan zadatak nikada nema broj ≤ 0",
    napraviZadatke(punSnimak()).every((z) => z.broj > 0),
    "neki zadatak ima broj ≤ 0",
  );

  // 2 ─ svaki proizvođač ume da napravi svoj zadatak, i samo svoj
  console.log("\n2. Svaki proizvođač pravi tačno svoj zadatak");
  for (const p of PROIZVODJACI) {
    const s = prazanSnimak();
    p.upali(s);
    const z = napraviZadatke(s);
    proveri(
      `${p.kljuc} — jedan zadatak i to taj`,
      z.length === 1 && z[0].kljuc === p.kljuc,
      `dobijeno: ${z.map((x) => x.kljuc).join(", ") || "(ništa)"}`,
    );
  }

  const svi = napraviZadatke(punSnimak());
  proveri(
    `pun snimak daje svih ${PROIZVODJACI.length} zadataka`,
    svi.length === PROIZVODJACI.length,
    `dobijeno ${svi.length}`,
  );

  // 3 ─ redosled i hitnost
  console.log("\n3. Redosled: hitno pre svega, pa veći posao");
  const rang = { visoka: 0, srednja: 1, niska: 2 } as const;
  let redosledOk = true;
  for (let i = 1; i < svi.length; i++) {
    if (rang[svi[i - 1].hitnost] > rang[svi[i].hitnost]) redosledOk = false;
  }
  proveri("hitnost ne opada kroz spisak", redosledOk, svi.map((z) => z.hitnost).join(" "));
  proveri(
    "uvoz koji stoji 13 dana je hitan (prag 24 h)",
    svi.find((z) => z.kljuc === "uvoz.u_pregledu")?.hitnost === "visoka",
    String(svi.find((z) => z.kljuc === "uvoz.u_pregledu")?.hitnost),
  );
  const svez = prazanSnimak();
  svez.uvoziUPregledu = [
    { id: "imp_test_10", fileName: "test-tabela-10.xlsx", uploadedAt: NOW - 2 * SAT },
  ];
  proveri(
    "uvoz star 2 h nije hitan",
    napraviZadatke(svez)[0].hitnost === "srednja",
    String(napraviZadatke(svez)[0].hitnost),
  );

  // 4 ─ naslov integracije nosi ime i vreme (§5)
  console.log("\n4. Kvar sinhronizacije ima ime integracije i vreme");
  const sinh = svi.find((z) => z.kljuc === "sinhronizacija.greska:ga4");
  proveri(
    "naslov je: GA4 ne sinhronizuje se 3 dana",
    sinh?.naslov === "GA4 ne sinhronizuje se 3 dana",
    String(sinh?.naslov),
  );
  const bezUspeha = prazanSnimak();
  bezUspeha.integracijeUKvaru = [
    { provider: "youtube", razlog: "greska", posledniUspehAt: null, primecenAt: NOW - 2 * DAN },
  ];
  proveri(
    "integracija bez ijednog uspeha ne dobija izmišljen broj dana",
    napraviZadatke(bezUspeha)[0].naslov === "YouTube nije nijednom sinhronizovan",
    napraviZadatke(bezUspeha)[0].naslov,
  );
  const istekao = prazanSnimak();
  istekao.integracijeUKvaru = [
    { provider: "meta_ig", razlog: "istekao_token", posledniUspehAt: NOW - DAN, primecenAt: NOW - DAN },
  ];
  proveri(
    "istekao pristup traži obnovu, ne sinhronizaciju",
    napraviZadatke(istekao)[0].radnja === "Obnovi pristup",
    napraviZadatke(istekao)[0].radnja,
  );

  // 5 ─ odlaganje
  console.log("\n5. Odlaganje sakriva stavku DO datuma");
  const zaostali = svi.filter((z) => z.kljuc === "leadovi.zaostali");
  const odlozeno = podeliPoStanju(
    svi,
    [{ kljuc: "leadovi.zaostali", odlozenoDo: NOW + DAN }],
    NOW,
  );
  proveri(
    "odložena stavka nije među vidljivima",
    odlozeno.zadaci.every((z) => z.kljuc !== "leadovi.zaostali") && zaostali.length === 1,
    "i dalje je vidljiva",
  );
  proveri(
    "odlozena stavka stoji medju sklonjenima, sa datumom",
    odlozeno.sklonjeni.some(
      (z) => z.kljuc === "leadovi.zaostali" && z.odlozenoDo === NOW + DAN,
    ),
    "nema je u sklonjenima",
  );
  const posleRoka = podeliPoStanju(
    svi,
    [{ kljuc: "leadovi.zaostali", odlozenoDo: NOW - 1 }],
    NOW,
  );
  proveri(
    "posle datuma se vraća sama",
    posleRoka.zadaci.some((z) => z.kljuc === "leadovi.zaostali"),
    "ostala je sklonjena",
  );
  proveri(
    "odlaganje jedne stavke ne dira ostale",
    odlozeno.zadaci.length === svi.length - 1,
    `vidljivo ${odlozeno.zadaci.length} od ${svi.length}`,
  );

  // 6 ─ sakrivanje
  console.log("\n6. Sakriveno se vraća čim posao naraste");
  const sakriveno = podeliPoStanju(
    svi,
    [{ kljuc: "leadovi.bez_telefona", sakrivenoAt: NOW - SAT, brojPriSakrivanju: 39 }],
    NOW,
  );
  proveri(
    "sakriveno (39 firmi bez broja) se ne vidi",
    sakriveno.zadaci.every((z) => z.kljuc !== "leadovi.bez_telefona"),
    "vidi se",
  );
  const naraslo = punSnimak();
  naraslo.bezTelefona = 40;
  const posleRasta = podeliPoStanju(
    napraviZadatke(naraslo),
    [{ kljuc: "leadovi.bez_telefona", sakrivenoAt: NOW - SAT, brojPriSakrivanju: 39 }],
    NOW,
  );
  proveri(
    "na 40 firmi se vraća samo",
    posleRasta.zadaci.some((z) => z.kljuc === "leadovi.bez_telefona"),
    "i dalje je sakriveno",
  );

  // 7 ─ veze i bedževi
  console.log("\n7. Svaka veza vodi na rutu koja postoji");
  const hrefovi = navHrefovi();
  for (const zadatak of svi) {
    const putanja = zadatak.veza.split("?")[0];
    proveri(
      `${zadatak.kljuc} → ${zadatak.veza}`,
      zadatak.veza.startsWith("/") && rutaPostoji(putanja),
      `nema stranice za ${putanja}`,
    );
    proveri(
      `${zadatak.kljuc} → bedž ${zadatak.bedz} postoji u navigaciji`,
      hrefovi.has(zadatak.bedz),
      `${zadatak.bedz} nije stavka navigacije`,
    );
  }
  proveri(
    "svaki zadatak ima natpis radnje i naslov",
    svi.every((z) => z.radnja.trim().length > 0 && z.naslov.trim().length > 0),
    "neki zadatak nema radnju ili naslov",
  );

  // 8 ─ bedževi
  console.log("\n8. Bedževi broje vrste posla i nikad nulu");
  const bedzevi = bedzeviOd(svi);
  proveri(
    "nijedan bedž nije 0",
    Object.values(bedzevi).every((n) => n > 0),
    JSON.stringify(bedzevi),
  );
  proveri(
    "zbir bedževa je broj zadataka",
    Object.values(bedzevi).reduce((a, b) => a + b, 0) === svi.length,
    JSON.stringify(bedzevi),
  );
  proveri(
    "prazan spisak ne pravi nijedan bedž",
    Object.keys(bedzeviOd([])).length === 0,
    JSON.stringify(bedzeviOd([])),
  );

  // 9 ─ lokalno vreme
  console.log("\n9. Danas i 14:30 su lokalni pojmovi, ne UTC");
  proveri(
    "23:30 UTC uz +02:00 je 01:30",
    lokalniSat(Date.UTC(2026, 8, 10, 23, 30), 120) === "01:30",
    lokalniSat(Date.UTC(2026, 8, 10, 23, 30), 120),
  );
  const pocetak = pocetakLokalnogDana(Date.UTC(2026, 8, 10, 23, 30), 120);
  proveri(
    "lokalni dan za 23:30 UTC (+02:00) počinje 10.9. u 22:00 UTC",
    pocetak === Date.UTC(2026, 8, 10, 22, 0),
    new Date(pocetak).toISOString(),
  );
  proveri(
    "isti trenutak u UTC pripada prethodnom lokalnom danu",
    pocetakLokalnogDana(Date.UTC(2026, 8, 10, 23, 30), 0) ===
      Date.UTC(2026, 8, 10, 0, 0),
    new Date(pocetakLokalnogDana(Date.UTC(2026, 8, 10, 23, 30), 0)).toISOString(),
  );
  const jedan = prazanSnimak();
  jedan.sastanciDanas = [{ at: Date.UTC(2026, 8, 10, 12, 30), firma: "Test Salon 1" }];
  proveri(
    "jedan sastanak nosi svoje vreme i ime firme",
    napraviZadatke(jedan)[0].naslov === "Sastanak danas u 14:30 — Test Salon 1",
    napraviZadatke(jedan)[0].naslov,
  );

  // 10 ─ ključevi koje mutacije priznaju
  console.log("\n10. Mutacije priznaju svaki proizvedeni ključ i nijedan drugi");
  proveri(
    "svi proizvedeni ključevi su poznati",
    svi.every((z) => jePoznatKljuc(z.kljuc)),
    svi.filter((z) => !jePoznatKljuc(z.kljuc)).map((z) => z.kljuc).join(", "),
  );
  proveri(
    "izmišljen ključ se odbija",
    !jePoznatKljuc("leadovi.izmisljeno") && !jePoznatKljuc(""),
    "prihvaćen je ključ koji nijedan proizvođač ne pravi",
  );

  // 11 ─ odsecanje
  console.log("\n11. Odsečeno brojanje se prijavljuje, ne prećutkuje");
  const odsecen = punSnimak();
  odsecen.firmeOdsecene = true;
  const saOdsecenim = napraviZadatke(odsecen);
  proveri(
    "zadatak bez telefona nosi zastavicu odsecanja",
    saOdsecenim.find((z) => z.kljuc === "leadovi.bez_telefona")?.odsecen === true,
    "zastavica nije preneta",
  );
  proveri(
    "ostali zadaci nisu proglašeni odsečenim",
    saOdsecenim.filter((z) => z.odsecen).length === 1,
    String(saOdsecenim.filter((z) => z.odsecen).map((z) => z.kljuc)),
  );

  console.log("\n" + "=".repeat(78));
  if (pao === 0) {
    console.log(`✓ Sve provere prolaze (${PROIZVODJACI.length} proizvođača).`);
  } else {
    console.log(`✗ ${pao} ${pao === 1 ? "provera pala" : "provera palo"}.`);
    process.exitCode = 1;
  }
}

main();

export type { Zadatak };
