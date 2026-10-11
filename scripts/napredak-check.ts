/**
 * ============================================================================
 * DOKAZ: Napredak se izvodi iz događaja i ne izmišlja XP (B4, §6)
 * ============================================================================
 *
 * Pokretanje:
 *   npm run verify:napredak
 *   (ili: node --import ./scripts/ts-hooks.mjs scripts/napredak-check.ts)
 *
 * Zašto postoji: XP, nivo, niz i dostignuća se nigde ne upisuju rukom — sve je
 * zbir nad događajima. Greška u pravilu zato ne ostavlja trag ni u jednoj
 * tabeli; samo bi se u ljusci tiho pojavio pogrešan broj. Ovde se, bez baze i
 * bez mreže, dokazuje:
 *
 *    1. kape — drugi dodir iste firme istog dana ne donosi XP;
 *    2. ponoć po Beogradu — 23:59 i 00:01 su dva dana, leti i zimi;
 *    3. beogradsko vreme se poklapa sa `lib/belgrade-time.ts` (2024–2030);
 *    4. vikend ne prekida niz kad je opcija uključena, a prekida kad nije;
 *    5. kriva nivoa — nivo 10 = 2.340 XP, 20 = 8.740, 30 = 19.140;
 *    6. misija ne nestaje kad se završi, a sve tri daju bonus;
 *    7. generator ne pravi misiju bez posla i najviše jednu po oblasti;
 *    8. isključen Napredak vraća stanje bez ijednog XP polja;
 *    9. „Zatvarač" se otključava na prvom `dobijen`, i samo jednom po firmi;
 *   10. događaj bez autora (i tuđ događaj) ne daje XP;
 *   11. zakasneli upis — dan unazad da, dva dana ne;
 *   12. redosled događaja ne menja rezultat;
 *   13. zaključavanje dan po dan daje isto što i izvođenje odjednom;
 *   14. sastanak — otkazan istog dana ne vredi, pomeren vredi jednom;
 *   15. proslave — viđeno se ne ponavlja, nepoznat ključ se odbija;
 *   16. niz „u opasnosti" od 17:00 po Beogradu;
 *   17. fixture za razvojni prikaz stvarno daje nivo 7, niz 4, 2 od 3 misije;
 *   18. povratna informacija (B5) — toast samo za NOVU radnju, proslava jednom,
 *       skriven tab je ne troši, a ništa se ne pali pri otvaranju.
 *
 * Svi podaci su izmišljeni. Nema mreže, nema ključeva.
 */

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { getFunctionName } from "convex/server";
import { api } from "../convex/_generated/api";
import { resolveFixture } from "../app/dev-ux/fixtures";
import { belgradeInputsFor, belgradeToEpoch } from "../lib/belgrade-time";
import {
  DUZE_MS,
  izdvojiNagrade,
  novoPamcenje,
} from "../components/app/napredak/nagrade";
import {
  BONUS_XP,
  DOSTIGNUCA,
  KLJUCEVI_MISIJA,
  PODRAZUMEVANO,
  PRAVILA_XP,
  danKljuc,
  dodajDane,
  generisiMisije,
  izvedi,
  izvediProfil,
  jeVikend,
  lokalnoUEpohu,
  nivoZaXp,
  nizUOpasnosti,
  obracunajDan,
  oceniMisije,
  parsirajProslavu,
  pocetakDana,
  pomerajMin,
  ponedeljak,
  pragNivoa,
  praznaOsnova,
  primeniDan,
  prstenovi,
  rangZaNivo,
  vezaMisije,
  xpZaPrelaz,
  zvanjeZaNivo,
  type Dogadjaj,
  type MisijaDef,
  type Osnova,
  type Podesavanja,
  type Stanje,
  type UlazIzvedi,
  type UlazMisija,
} from "../convex/lib/napredak";

let pao = 0;
let ukupno = 0;
function proveri(naziv: string, uslov: boolean, detalj: string): void {
  ukupno++;
  if (uslov) {
    console.log(`  OK   ${naziv}`);
  } else {
    pao++;
    console.log(`  PAO  ${naziv} -> ${detalj}`);
  }
}

const KOREN = new URL("../", import.meta.url);
const JA = "korisnik_test_1";
const DRUGI = "korisnik_test_2";
const MIN = 60_000;

/** Radni dani u oktobru 2026: 12. je ponedeljak. */
const PON = "2026-10-12";
const UTO = "2026-10-13";
const SRE = "2026-10-14";
const CET = "2026-10-15";
const PET = "2026-10-16";
const SUB = "2026-10-17";
const NED = "2026-10-18";
const PON2 = "2026-10-19";

let redni = 0;
function dog(
  vrsta: Dogadjaj["vrsta"],
  at: number,
  ostalo: Partial<Dogadjaj> = {},
): Dogadjaj {
  redni++;
  return {
    id: `e${String(redni).padStart(5, "0")}`,
    vrsta,
    at,
    upisanAt: at,
    autor: JA,
    ...ostalo,
  };
}

/** Trenutak „dan u sat:min" po Beogradu. */
function u(dan: string, sat: number, min = 0): number {
  return lokalnoUEpohu(dan, sat) + min * MIN;
}

function xpDana(dogadjaji: Dogadjaj[], dan: string): number {
  return obracunajDan(dogadjaji, JA, dan).xp;
}

function ulaz(deo: Partial<UlazIzvedi>): UlazIzvedi {
  return {
    korisnik: JA,
    sidro: PON,
    prviDan: false,
    odseceno: false,
    osnova: { ...praznaOsnova(), do: dodajDane(deo.sidro ?? PON, -2) },
    dogadjaji: [],
    misijePoDanu: {},
    naOtvaranjuPoDanu: {},
    aktivnoPraviloAt: null,
    podesavanja: PODRAZUMEVANO,
    potvrde: { dnevne: [], trajne: [], nivo: 1 },
    ...deo,
  };
}

function ukljuceno(s: Stanje): Extract<Stanje, { ukljucen: true }> {
  if (!s.ukljucen) throw new Error("Očekivano uključeno stanje.");
  return s;
}

/** Postoji li stranica za ovu putanju (deo pre upitnika)? */
function rutaPostoji(veza: string): boolean {
  const putanja = veza.split("?")[0];
  const delovi = putanja.split("/").filter((d) => d.length > 0);
  return existsSync(
    fileURLToPath(new URL(`app/(app)/${delovi.join("/")}/page.tsx`, KOREN)),
  );
}

function prazanUlazMisija(): UlazMisija {
  return {
    zoviSada: 0,
    bezPozivaDoSad: false,
    ukupnoDodela: 0,
    zaostali: { broj: 0 },
    nereseniRedovi: { broj: 0 },
    uvoziUPregledu: { broj: 0 },
    bezTelefona: { broj: 0 },
    komentari: { broj: 0 },
    mozeObjava: false,
    danaOdObjave: null,
    sastanciNedelje: 0,
    ciljSastanci: 3,
  };
}

function punUlazMisija(): UlazMisija {
  return {
    zoviSada: 12,
    bezPozivaDoSad: false,
    ukupnoDodela: 178,
    zaostali: { broj: 7, hitnost: "visoka", veza: "/leadovi?tab=overdue" },
    nereseniRedovi: { broj: 41, hitnost: "srednja", veza: "/leadovi/uvoz" },
    uvoziUPregledu: { broj: 2, hitnost: "visoka", veza: "/leadovi/uvoz" },
    bezTelefona: { broj: 39, hitnost: "niska", veza: "/leadovi?tab=gaps" },
    komentari: { broj: 5, hitnost: "srednja", veza: "/instagram/komentari" },
    mozeObjava: true,
    danaOdObjave: 9,
    sastanciNedelje: 0,
    ciljSastanci: 3,
  };
}

/** Deterministični „slučajni" brojevi — isti test svaki put. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function main(): void {
  console.log("=".repeat(78));
  console.log("PROVERA NAPRETKA - XP, nivoi, misije, niz, dostignuca (B4)");
  console.log("=".repeat(78));

  // 1 ─ kape
  console.log("\n1. Kape: ponavljanje ne donosi XP");
  {
    const dva = [
      dog("dodir", u(PON, 10), { firma: "A", podvrsta: "poziv" }),
      dog("dodir", u(PON, 11), { firma: "A", podvrsta: "poziv" }),
    ];
    const o = obracunajDan(dva, JA, PON);
    proveri("drugi dodir iste firme istog dana = 0 XP", o.xp === 10, `xp=${o.xp}`);
    proveri(
      "drugi dodir nosi razlog „kapa“",
      o.stavke[1]?.xp === 0 && o.stavke[1]?.razlog === "kapa",
      JSON.stringify(o.stavke[1]),
    );
    proveri(
      "dodir druge firme istog dana donosi XP",
      xpDana([...dva, dog("dodir", u(PON, 12), { firma: "B", podvrsta: "poziv" })], PON) === 20,
      "očekivano 20",
    );
    const sutra = [...dva, dog("dodir", u(UTO, 10), { firma: "A", podvrsta: "poziv" })];
    proveri("ista firma sutradan ponovo donosi XP", xpDana(sutra, UTO) === 10, `xp=${xpDana(sutra, UTO)}`);

    proveri(
      "beleška (kanal „beleska“) nije dodir",
      xpDana([dog("dodir", u(PON, 9), { firma: "C", podvrsta: "beleska" })], PON) === 0,
      "beleška je donela XP",
    );
    proveri(
      "ishod i sledeći korak: po jednom po firmi dnevno",
      xpDana(
        [
          dog("ishod", u(PON, 9), { firma: "A", podvrsta: "zainteresovan" }),
          dog("ishod", u(PON, 10), { firma: "A", podvrsta: "preskupo" }),
          dog("sledeci_korak", u(PON, 11), { firma: "A" }),
          dog("sledeci_korak", u(PON, 12), { firma: "A" }),
        ],
        PON,
      ) === 20,
      "očekivano 15 + 5",
    );

    const moderacije = Array.from({ length: 25 }, (_, i) =>
      dog("moderacija", u(PON, 9, i), { podvrsta: "hide", meta: `ig:k${i}` }),
    );
    proveri("moderacija: najviše 20 dnevno", xpDana(moderacije, PON) === 100, `xp=${xpDana(moderacije, PON)}`);
    proveri(
      "isti komentar sakriven dvaput = jedna moderacija",
      xpDana(
        [
          dog("moderacija", u(PON, 9), { podvrsta: "hide", meta: "ig:x" }),
          dog("moderacija", u(PON, 10), { podvrsta: "hide", meta: "ig:x" }),
        ],
        PON,
      ) === 5,
      "očekivano 5",
    );
    const oglasi = Array.from({ length: 14 }, (_, i) => dog("oglas", u(PON, 9, i)));
    proveri("oglasi: najviše 10 dnevno", xpDana(oglasi, PON) === 100, `xp=${xpDana(oglasi, PON)}`);
    const redovi = Array.from({ length: 120 }, (_, i) => dog("red", u(PON, 9) + i * 1000));
    proveri("redovi uvoza: najviše 100 dnevno", xpDana(redovi, PON) === 300, `xp=${xpDana(redovi, PON)}`);

    proveri(
      "tabela pravila se poklapa sa §6.2",
      PRAVILA_XP.dodir.xp === 10 &&
        PRAVILA_XP.ishod.xp === 15 &&
        PRAVILA_XP.sledeci_korak.xp === 5 &&
        PRAVILA_XP.sastanak.xp === 50 &&
        PRAVILA_XP.ponuda.xp === 40 &&
        PRAVILA_XP.dobijen.xp === 250 &&
        PRAVILA_XP.uvoz.xp === 20 &&
        PRAVILA_XP.red.xp === 3 &&
        PRAVILA_XP.objava.xp === 30 &&
        PRAVILA_XP.clanak.xp === 60 &&
        PRAVILA_XP.moderacija.xp === 5 &&
        PRAVILA_XP.oglas.xp === 10 &&
        PRAVILA_XP.pravilo.xp === 20 &&
        BONUS_XP === 100,
      "neka vrednost odstupa",
    );
  }

  // 2 ─ ponoć
  console.log("\n2. Ponoć po Beogradu");
  for (const [naziv, dan] of [
    ["zimi (UTC+1)", "2026-01-14"],
    ["leti (UTC+2)", "2026-07-14"],
    ["na dan prelaska na letnje vreme", "2026-03-29"],
    ["na dan povratka na zimsko vreme", "2026-10-25"],
  ] as const) {
    const sutra = dodajDane(dan, 1);
    const pre = dog("dodir", pocetakDana(sutra) - MIN, { firma: "A", podvrsta: "poziv" });
    const posle = dog("dodir", pocetakDana(sutra) + MIN, { firma: "A", podvrsta: "poziv" });
    proveri(
      `23:59 i 00:01 su dva dana ${naziv}`,
      danKljuc(pre.at) === dan &&
        danKljuc(posle.at) === sutra &&
        xpDana([pre, posle], dan) === 10 &&
        xpDana([pre, posle], sutra) === 10,
      `${danKljuc(pre.at)} / ${danKljuc(posle.at)}`,
    );
  }

  // 3 ─ vreme ukršteno sa lib/belgrade-time.ts
  console.log("\n3. Beogradsko vreme = lib/belgrade-time.ts");
  {
    let razlikaDan = 0;
    let razlikaPonoc = 0;
    let razlika17 = 0;
    let dana = 0;
    const kraj = Date.UTC(2031, 0, 1);
    for (let t = Date.UTC(2024, 0, 1); t < kraj; t += 6 * 3_600_000 + 7 * MIN) {
      if (danKljuc(t) !== belgradeInputsFor(t).date) razlikaDan++;
    }
    for (let dan = "2024-01-01"; dan <= "2030-12-31"; dan = dodajDane(dan, 1)) {
      dana++;
      if (pocetakDana(dan) !== belgradeToEpoch(dan, "00:00")) razlikaPonoc++;
      if (lokalnoUEpohu(dan, 17) !== belgradeToEpoch(dan, "17:00")) razlika17++;
    }
    proveri("datum trenutka se poklapa (2024–2030, na ~6 h)", razlikaDan === 0, `${razlikaDan} razlika`);
    proveri(`ponoć se poklapa za svih ${dana} dana`, razlikaPonoc === 0, `${razlikaPonoc} razlika`);
    proveri("17:00 se poklapa za sve dane", razlika17 === 0, `${razlika17} razlika`);
    proveri(
      "pomeraj je 120 min leti i 60 min zimi",
      pomerajMin(Date.UTC(2026, 6, 14, 12)) === 120 && pomerajMin(Date.UTC(2026, 0, 14, 12)) === 60,
      "pogrešan pomeraj",
    );
    proveri(
      "ponedeljak i vikend",
      ponedeljak(CET) === PON && ponedeljak(NED) === PON && ponedeljak(PON) === PON && jeVikend(SUB) && jeVikend(NED) && !jeVikend(PET),
      `${ponedeljak(CET)} / ${ponedeljak(NED)}`,
    );
  }

  // 4 ─ vikend i niz
  console.log("\n4. Niz: vikend ne prekida kad je opcija uključena");
  {
    const triDogadjaja = (dan: string): Dogadjaj[] => [
      dog("dodir", u(dan, 10), { firma: `${dan}-A`, podvrsta: "poziv" }),
      dog("dodir", u(dan, 11), { firma: `${dan}-B`, podvrsta: "poziv" }),
      dog("dodir", u(dan, 12), { firma: `${dan}-C`, podvrsta: "poziv" }),
    ];
    const svi = [...triDogadjaja(CET), ...triDogadjaja(PET), ...triDogadjaja(PON2)];
    const nizPosle = (pod: Podesavanja, dani: string[], dogadjaji: Dogadjaj[]): Osnova => {
      let o: Osnova = { ...praznaOsnova(), do: dodajDane(dani[0], -1) };
      for (const dan of dani) {
        o = primeniDan(o, {
          dan,
          obracun: obracunajDan(dogadjaji, JA, dan),
          misije: [],
          naOtvaranju: null,
          podesavanja: pod,
          finalan: true,
          aktivnoPraviloAt: null,
        }).osnova;
      }
      return o;
    };
    const dani = [CET, PET, SUB, NED, PON2];
    const saOpcijom = nizPosle(PODRAZUMEVANO, dani, svi);
    const bezOpcije = nizPosle({ ...PODRAZUMEVANO, vikendNePrekida: false }, dani, svi);
    proveri("čet + pet + (vikend bez rada) + pon = niz 3", saOpcijom.niz === 3, `niz=${saOpcijom.niz}`);
    proveri("bez opcije vikend prekida: niz 1", bezOpcije.niz === 1, `niz=${bezOpcije.niz}`);
    proveri("najduži niz ostaje zapamćen i posle prekida", bezOpcije.najduziNiz === 2, `najduzi=${bezOpcije.najduziNiz}`);

    const saSubotom = nizPosle(PODRAZUMEVANO, dani, [...svi, ...triDogadjaja(SUB)]);
    proveri("rad u subotu produžava niz (4)", saSubotom.niz === 4, `niz=${saSubotom.niz}`);

    const propustenRadni = nizPosle(PODRAZUMEVANO, [SRE, CET, PET], [...triDogadjaja(SRE), ...triDogadjaja(PET)]);
    proveri("propušten radni dan prekida niz", propustenRadni.niz === 1, `niz=${propustenRadni.niz}`);

    const dvaDogadjaja = nizPosle(PODRAZUMEVANO, [PON], triDogadjaja(PON).slice(0, 2));
    proveri("dva događaja nisu dovoljna za dan", dvaDogadjaja.niz === 0, `niz=${dvaDogadjaja.niz}`);

    // Današnji dan koji još nije uračunat ne prekida niz.
    const danasNijeKraj = primeniDan(
      { ...praznaOsnova(), do: CET, niz: 5, nizDo: CET, najduziNiz: 5 },
      {
        dan: PET,
        obracun: obracunajDan([], JA, PET),
        misije: [],
        naOtvaranju: null,
        podesavanja: PODRAZUMEVANO,
        finalan: false,
        aktivnoPraviloAt: null,
      },
    ).osnova;
    proveri("današnji dan bez rada još ne prekida niz", danasNijeKraj.niz === 5, `niz=${danasNijeKraj.niz}`);
  }

  // 5 ─ kriva
  console.log("\n5. Kriva nivoa, zvanja i rangovi");
  {
    proveri("nivo 10 = 2.340 XP", pragNivoa(10) === 2340, String(pragNivoa(10)));
    proveri("nivo 20 = 8.740 XP", pragNivoa(20) === 8740, String(pragNivoa(20)));
    proveri("nivo 30 = 19.140 XP", pragNivoa(30) === 19140, String(pragNivoa(30)));
    proveri("prelaz 1 → 2 traži 100 XP, 2 → 3 traži 140", xpZaPrelaz(1) === 100 && xpZaPrelaz(2) === 140, "pogrešan prelaz");
    let zbir = 0;
    let slaganje = true;
    for (let n = 1; n <= 40; n++) {
      if (pragNivoa(n) !== zbir) slaganje = false;
      zbir += xpZaPrelaz(n);
    }
    proveri("prag nivoa je zbir prelaza (1–40)", slaganje, "prag i zbir prelaza se razilaze");
    proveri("2.339 XP je nivo 9, 2.340 je nivo 10", nivoZaXp(2339).broj === 9 && nivoZaXp(2340).broj === 10, `${nivoZaXp(2339).broj}/${nivoZaXp(2340).broj}`);
    const n7 = nivoZaXp(1370);
    proveri(
      "1.370 XP = nivo 7, 170 od 340",
      n7.broj === 7 && n7.xpOd === 1200 && n7.xpDo === 1540 && n7.uNivou === 170 && n7.zaSledeci === 170 && n7.procenat === 50,
      JSON.stringify(n7),
    );
    proveri("0 XP je nivo 1", nivoZaXp(0).broj === 1 && nivoZaXp(0).zaSledeci === 100, JSON.stringify(nivoZaXp(0)));
    const zvanja: Array<[number, string]> = [
      [1, "Regrut"], [2, "Regrut"], [3, "Kadet"], [4, "Kadet"], [5, "Operativac"], [7, "Operativac"],
      [8, "Agent"], [10, "Agent"], [11, "Specijalac"], [14, "Specijalac"], [15, "Strateg"], [19, "Strateg"],
      [20, "Komandant"], [24, "Komandant"], [25, "General"], [29, "General"], [30, "Enigma"], [45, "Enigma"],
    ];
    const loseZvanje = zvanja.filter(([n, z]) => zvanjeZaNivo(n) !== z);
    proveri("zvanja po granicama iz §6.3", loseZvanje.length === 0, JSON.stringify(loseZvanje));
    const rangovi: Array<[number, string]> = [
      [1, "bronze"], [4, "bronze"], [5, "silver"], [10, "silver"], [11, "gold"], [19, "gold"],
      [20, "platinum"], [29, "platinum"], [30, "diamond"],
    ];
    const losRang = rangovi.filter(([n, r]) => rangZaNivo(n) !== r);
    proveri("rangovi po granicama iz §6.3", losRang.length === 0, JSON.stringify(losRang));
  }

  // 6 ─ misije: ne nestaju, bonus
  console.log("\n6. Misije: završena ostaje, sve tri daju bonus");
  {
    const misije: MisijaDef[] = [
      { kljuc: "pozovi", cilj: 2, xp: 60, oblast: "pozivi", veza: "/leadovi" },
      { kljuc: "zaostali", cilj: 1, xp: 50, oblast: "tok", veza: "/leadovi?tab=overdue" },
      { kljuc: "komentari", cilj: 1, xp: 30, oblast: "kanali", veza: "/instagram/komentari" },
    ];
    const pozivi = [
      dog("dodir", u(PON, 9), { firma: "A", podvrsta: "poziv" }),
      dog("ishod", u(PON, 10), { firma: "B", podvrsta: "nije_se_javio" }),
    ];
    const s1 = ukljuceno(izvedi(ulaz({ dogadjaji: pozivi, misijePoDanu: { [PON]: misije } })));
    const prva = s1.misije.find((m) => m.kljuc === "pozovi");
    proveri("posle završetka misija je i dalje u spisku", s1.misije.length === 3 && prva !== undefined, `misija=${s1.misije.length}`);
    proveri(
      "završena misija: zavrsena = true, napredak = cilj, preostalo 0",
      prva?.zavrsena === true && prva.napredak === 2 && prva.preostalo === 0,
      JSON.stringify(prva),
    );
    proveri("„nije se javio“ se broji kao poziv", prva?.napredak === 2, `napredak=${prva?.napredak}`);
    proveri("XP dana = događaji (25) + misija (60)", s1.xp.danas === 85, `danas=${s1.xp.danas}`);
    proveri("bonus nije osvojen sa 1 od 3", !s1.bonus.osvojen && s1.bonus.moguc && s1.bonus.preostaloMisija === 2, JSON.stringify(s1.bonus));

    const josPoziv = [...pozivi, dog("dodir", u(PON, 11), { firma: "C", podvrsta: "poziv" })];
    const s2 = ukljuceno(izvedi(ulaz({ dogadjaji: josPoziv, misijePoDanu: { [PON]: misije } })));
    proveri(
      "treći poziv ne skida završenu misiju i ne prebacuje napredak preko cilja",
      s2.misije.find((m) => m.kljuc === "pozovi")?.napredak === 2 && s2.misije.find((m) => m.kljuc === "pozovi")?.zavrsena === true,
      JSON.stringify(s2.misije[0]),
    );

    const sveTri = [
      ...pozivi,
      dog("sledeci_korak", u(PON, 12), { firma: "A", podvrsta: "zaostao" }),
      dog("moderacija", u(PON, 13), { podvrsta: "reply", meta: "ig:k1" }),
    ];
    const s3 = ukljuceno(izvedi(ulaz({ dogadjaji: sveTri, misijePoDanu: { [PON]: misije } })));
    proveri("sve tri završene → bonus osvojen", s3.bonus.osvojen && s3.bonus.preostaloMisija === 0, JSON.stringify(s3.bonus));
    proveri(
      "XP dana = događaji (35) + misije (140) + bonus (100)",
      s3.xp.danas === 35 + 140 + BONUS_XP,
      `danas=${s3.xp.danas}`,
    );
    proveri(
      "bonus stoji u toku XP-a posle misije koja ga je zatvorila",
      s3.poslednji[0]?.vrsta === "bonus" && s3.poslednji[1]?.vrsta === "misija",
      JSON.stringify(s3.poslednji.slice(0, 2).map((p) => p.vrsta)),
    );

    const dveMisije = oceniMisije(misije.slice(0, 2), obracunajDan(sveTri, JA, PON));
    proveri("dan sa dve misije nema bonus ni kad su obe završene", !dveMisije.bonus.moguc && !dveMisije.bonus.osvojen, JSON.stringify(dveMisije.bonus));

    proveri(
      "sledeći korak koji NIJE bio zaostao ne čisti zaostale",
      oceniMisije([misije[1]], obracunajDan([dog("sledeci_korak", u(PON, 9), { firma: "Z" })], JA, PON)).misije[0].zavrsena === false,
      "misija se završila bez zaostalog koraka",
    );
  }

  // 7 ─ generator
  console.log("\n7. Generator misija");
  {
    proveri("bez posla nema nijedne misije", generisiMisije(prazanUlazMisija(), PON).length === 0, "napravljena misija bez posla");

    const pune = generisiMisije(punUlazMisija(), PON);
    proveri("kad posla ima, tačno tri misije", pune.length === 3, `misija=${pune.length}`);
    proveri("najviše jedna misija po oblasti", new Set(pune.map((m) => m.oblast)).size === pune.length, JSON.stringify(pune.map((m) => m.oblast)));
    proveri(
      "isti dan i isto stanje daju iste misije",
      JSON.stringify(generisiMisije(punUlazMisija(), PON)) === JSON.stringify(pune),
      "izbor nije determinističan",
    );
    proveri(
      "hitne misije idu pre ostalih",
      pune.every((m) => ["pozovi", "zaostali", "uvoz_pregled"].includes(m.kljuc)),
      JSON.stringify(pune.map((m) => m.kljuc)),
    );
    proveri(
      "cilj poziva je min(5, dostupno)",
      pune.find((m) => m.kljuc === "pozovi")?.cilj === 5 &&
        generisiMisije({ ...punUlazMisija(), zoviSada: 2 }, PON).find((m) => m.kljuc === "pozovi")?.cilj === 2,
      "pogrešan cilj",
    );
    proveri(
      "prvi poziv ikad: cilj je jedan",
      generisiMisije({ ...punUlazMisija(), bezPozivaDoSad: true }, PON).find((m) => m.kljuc === "pozovi")?.cilj === 1,
      "cilj nije 1",
    );

    // Svaka misija se pravi samo kad baš njen posao postoji.
    const upali: Array<[string, (s: UlazMisija) => void]> = [
      ["pozovi", (s) => { s.zoviSada = 4; }],
      ["ishodi", (s) => { s.ukupnoDodela = 10; s.sastanciNedelje = 9; }],
      ["uvoz_redovi", (s) => { s.nereseniRedovi = { broj: 6 }; }],
      ["uvoz_pregled", (s) => { s.uvoziUPregledu = { broj: 1 }; }],
      ["zaostali", (s) => { s.zaostali = { broj: 2 }; }],
      ["dopuni", (s) => { s.bezTelefona = { broj: 8 }; }],
      ["komentari", (s) => { s.komentari = { broj: 1 }; }],
      ["objavi", (s) => { s.mozeObjava = true; s.danaOdObjave = 8; }],
      ["sastanak", (s) => { s.ukupnoDodela = 10; s.sastanciNedelje = 0; }],
    ];
    for (const [kljuc, ukljuci] of upali) {
      const s = prazanUlazMisija();
      ukljuci(s);
      const rez = generisiMisije(s, PON);
      proveri(`misija „${kljuc}“ nastaje kad njen posao postoji`, rez.some((m) => m.kljuc === kljuc), JSON.stringify(rez.map((m) => m.kljuc)));
    }
    proveri(
      "objava u poslednjih 7 dana gasi misiju „objavi“",
      generisiMisije({ ...prazanUlazMisija(), mozeObjava: true, danaOdObjave: 3 }, PON).length === 0,
      "misija nastala uprkos svežoj objavi",
    );
    proveri(
      "pun nedeljni cilj sastanaka gasi misiju „sastanak“",
      !generisiMisije({ ...prazanUlazMisija(), ukupnoDodela: 5, sastanciNedelje: 3 }, PON).some((m) => m.kljuc === "sastanak"),
      "misija nastala uprkos ispunjenom cilju",
    );

    let raznolikost = new Set<string>();
    for (let i = 0; i < 14; i++) {
      for (const m of generisiMisije({ ...punUlazMisija(), zaostali: { broj: 0 }, uvoziUPregledu: { broj: 0 }, zoviSada: 0 }, dodajDane(PON, i))) {
        raznolikost.add(m.kljuc);
      }
    }
    proveri("jednako hitne misije se smenjuju po datumu", raznolikost.size >= 4, `viđeno: ${[...raznolikost].join(", ")}`);
    raznolikost = new Set();

    const bezRute = KLJUCEVI_MISIJA.filter((k) => !rutaPostoji(vezaMisije(k)));
    proveri("svaka misija vodi na rutu koja postoji na disku", bezRute.length === 0, bezRute.join(", "));
    const xpVanOpsega = pune.filter((m) => m.xp < 30 || m.xp > 80);
    proveri("XP misije je u opsegu 30–80", xpVanOpsega.length === 0, JSON.stringify(xpVanOpsega));
  }

  // 8 ─ isključeno
  console.log("\n8. Isključen Napredak");
  {
    const dogadjaji = [dog("dobijen", u(PON, 9), { firma: "A" })];
    const iskljuceno = izvedi(ulaz({ dogadjaji, podesavanja: { ...PODRAZUMEVANO, ukljucen: false } }));
    proveri("ukljucen = false", iskljuceno.ukljucen === false, JSON.stringify(iskljuceno));
    proveri(
      "stanje nema nijedno XP polje (samo ukljucen i podesavanja)",
      Object.keys(iskljuceno).sort().join(",") === "podesavanja,ukljucen",
      Object.keys(iskljuceno).join(","),
    );
    const profilIskljucen = izvediProfil({ ...ulaz({ dogadjaji, podesavanja: { ...PODRAZUMEVANO, ukljucen: false } }), zakljuceniDani: [] });
    proveri("profil isključenog nema ništa osim zastavice", Object.keys(profilIskljucen).join(",") === "ukljucen", Object.keys(profilIskljucen).join(","));
  }

  // 9 ─ Zatvarač
  console.log("\n9. „Zatvarač“ na prvom dobijenom poslu");
  {
    const at = u(PON, 14, 30);
    const prvi = ukljuceno(izvedi(ulaz({ dogadjaji: [dog("dobijen", at, { firma: "A" })] })));
    proveri("prvi „dobijen“ donosi 250 XP", prvi.xp.ukupno === 250, `xp=${prvi.xp.ukupno}`);
    const proslava = prvi.proslave.find((p) => p.kljuc === "dostignuce:zatvarac");
    proveri(
      "„Zatvarač“ je otključan, legendaran, sa vremenom tog događaja",
      proslava !== undefined && proslava.retkost === "legendary" && proslava.at === at,
      JSON.stringify(proslava),
    );
    const profil = izvediProfil({ ...ulaz({ dogadjaji: [dog("dobijen", at, { firma: "A" })] }), zakljuceniDani: [] });
    proveri(
      "u profilu „Zatvarač“ nosi vreme otključavanja",
      profil.ukljucen && profil.dostignuca.find((d) => d.kljuc === "zatvarac")?.otkljucanoAt === at,
      "nema vremena",
    );
    proveri(
      "bez događaja „Zatvarač“ ostaje zaključan",
      !ukljuceno(izvedi(ulaz({}))).proslave.some((p) => p.kljuc === "dostignuce:zatvarac"),
      "otključan bez događaja",
    );
    proveri(
      "ista firma dobijena ponovo (prelaz već postoji) = 0 XP",
      xpDana([dog("dobijen", at, { firma: "A", ranije: true })], PON) === 0,
      "ponovljen prelaz je doneo XP",
    );
    proveri(
      "dva „dobijen“ iste firme istog dana = 250, ne 500",
      xpDana([dog("dobijen", at, { firma: "A" }), dog("dobijen", at + MIN, { firma: "A" })], PON) === 250,
      "duplikat je doneo XP",
    );
    proveri(
      "tuđ „dobijen“ ne otključava moj „Zatvarač“",
      !ukljuceno(izvedi(ulaz({ dogadjaji: [dog("dobijen", at, { firma: "A", autor: DRUGI })] }))).proslave.some((p) => p.kljuc === "dostignuce:zatvarac"),
      "otključan tuđim događajem",
    );
    proveri("katalog ima 23 dostignuća sa jedinstvenim ključevima", DOSTIGNUCA.length === 23 && new Set(DOSTIGNUCA.map((d) => d.kljuc)).size === 23, String(DOSTIGNUCA.length));
  }

  // 10 ─ autor
  console.log("\n10. Događaj bez autora i tuđ događaj");
  {
    const bez = obracunajDan([dog("dodir", u(PON, 9), { firma: "A", podvrsta: "poziv", autor: null })], JA, PON);
    proveri("bez autora = 0 XP, razlog „bez_autora“", bez.xp === 0 && bez.stavke[0]?.razlog === "bez_autora", JSON.stringify(bez.stavke[0]));
    proveri("bez autora se ne broji ni u brojače", bez.brojevi.dodiri === 0 && bez.brojevi.pozivi === 0 && bez.brojevi.dogadjaji === 0, JSON.stringify(bez.brojevi));
    const tudj = obracunajDan([dog("objava", u(PON, 9), { autor: DRUGI })], JA, PON);
    proveri("tuđ događaj = 0 XP za mene", tudj.xp === 0 && tudj.stavke[0]?.razlog === "tudj", JSON.stringify(tudj.stavke[0]));
    proveri("isti događaj donosi XP svom autoru", obracunajDan([dog("objava", u(PON, 9), { autor: DRUGI })], DRUGI, PON).xp === 30, "autor nije dobio XP");
    const sveBezAutora = (Object.keys(PRAVILA_XP) as Array<Dogadjaj["vrsta"]>).map((vrsta, i) =>
      dog(vrsta, u(PON, 9, i), { firma: `F${i}`, autor: null }),
    );
    proveri("nijedna vrsta događaja ne daje XP bez autora", xpDana(sveBezAutora, PON) === 0, `xp=${xpDana(sveBezAutora, PON)}`);
  }

  // 11 ─ zakasneli upis
  console.log("\n11. Zakasneli upis");
  {
    const juce = dog("dodir", u(PON, 16), { firma: "A", podvrsta: "poziv", upisanAt: u(UTO, 8) });
    proveri("poziv od juče upisan jutros donosi XP juče", xpDana([juce], PON) === 10 && xpDana([juce], UTO) === 0, `${xpDana([juce], PON)}/${xpDana([juce], UTO)}`);
    const davno = dog("dodir", u(PON, 16), { firma: "A", podvrsta: "poziv", upisanAt: u(SRE, 8) });
    const o = obracunajDan([davno], JA, PON);
    proveri("upis dva dana kasnije = 0 XP, razlog „zakasnelo“", o.xp === 0 && o.stavke[0]?.razlog === "zakasnelo", JSON.stringify(o.stavke[0]));
    const zakazana = dog("objava", u(SRE, 18), { upisanAt: u(PON, 9) });
    proveri("objava zakazana ranije a objavljena kasnije nije „zakasnela“", xpDana([zakazana], SRE) === 30, "zakazana objava nije donela XP");
  }

  // 12 ─ redosled
  console.log("\n12. Redosled događaja ne menja rezultat");
  {
    const rand = lcg(7);
    const dogadjaji: Dogadjaj[] = [];
    for (let i = 0; i < 60; i++) {
      const vrste: Array<Dogadjaj["vrsta"]> = ["dodir", "ishod", "sledeci_korak", "moderacija", "red", "oglas"];
      const vrsta = vrste[Math.floor(rand() * vrste.length)];
      dogadjaji.push(
        dog(vrsta, u(PON, 8) + Math.floor(rand() * 600) * MIN, {
          firma: `F${Math.floor(rand() * 8)}`,
          podvrsta: vrsta === "dodir" ? "poziv" : vrsta === "moderacija" ? "hide" : undefined,
          meta: vrsta === "moderacija" ? `ig:k${Math.floor(rand() * 10)}` : undefined,
        }),
      );
    }
    const osnovni = obracunajDan(dogadjaji, JA, PON);
    const obrnuto = obracunajDan([...dogadjaji].reverse(), JA, PON);
    const izmesano = obracunajDan([...dogadjaji].sort(() => rand() - 0.5), JA, PON);
    proveri("obrnut redosled daje isti XP i iste brojače", obrnuto.xp === osnovni.xp && JSON.stringify(obrnuto.brojevi) === JSON.stringify(osnovni.brojevi), `${obrnuto.xp} vs ${osnovni.xp}`);
    proveri("izmešan redosled daje isti XP i iste brojače", izmesano.xp === osnovni.xp && JSON.stringify(izmesano.brojevi) === JSON.stringify(osnovni.brojevi), `${izmesano.xp} vs ${osnovni.xp}`);
    proveri("isti poziv dvaput daje potpuno isti izlaz", JSON.stringify(obracunajDan(dogadjaji, JA, PON)) === JSON.stringify(osnovni), "izlaz nije stabilan");
  }

  // 13 ─ dan po dan = odjednom
  console.log("\n13. Zaključavanje dan po dan = izvođenje odjednom");
  {
    const rand = lcg(11);
    const prvi = "2026-09-01";
    const brojDana = 40;
    const dogadjaji: Dogadjaj[] = [];
    const misijePoDanu: Record<string, MisijaDef[]> = {};
    for (let i = 0; i < brojDana; i++) {
      const dan = dodajDane(prvi, i);
      if (jeVikend(dan) && rand() < 0.8) continue;
      const n = Math.floor(rand() * 9);
      for (let j = 0; j < n; j++) {
        const firma = `F${Math.floor(rand() * 30)}`;
        dogadjaji.push(dog("dodir", u(dan, 9, j * 7), { firma, podvrsta: "poziv" }));
        if (rand() < 0.7) dogadjaji.push(dog("ishod", u(dan, 9, j * 7 + 2), { firma, podvrsta: "zainteresovan" }));
        if (rand() < 0.15) dogadjaji.push(dog("sastanak", u(dan, 9, j * 7 + 3), { firma, meta: `t${i}-${j}` }));
      }
      if (rand() < 0.3) dogadjaji.push(dog("objava", u(dan, 18)));
      if (rand() < 0.5) {
        misijePoDanu[dan] = [
          { kljuc: "pozovi", cilj: 3, xp: 60, oblast: "pozivi", veza: "/leadovi" },
          { kljuc: "objavi", cilj: 1, xp: 60, oblast: "kanali", veza: "/instagram/objavi" },
          { kljuc: "sastanak", cilj: 1, xp: 80, oblast: "tok", veza: "/leadovi?tab=meetings" },
        ];
      }
    }
    const sviDani = Array.from({ length: brojDana }, (_, i) => dodajDane(prvi, i));
    const slozi = (kroz: boolean): Osnova => {
      let o: Osnova = { ...praznaOsnova(), do: dodajDane(prvi, -1) };
      for (const dan of sviDani) {
        // „Dan po dan": događaji samo tog dana, a zbir prolazi kroz JSON kao kroz bazu.
        const ulazni = kroz ? dogadjaji.filter((e) => danKljuc(e.at) === dan) : dogadjaji;
        o = primeniDan(o, {
          dan,
          obracun: obracunajDan(ulazni, JA, dan),
          misije: misijePoDanu[dan] ?? [],
          naOtvaranju: null,
          podesavanja: PODRAZUMEVANO,
          finalan: true,
          aktivnoPraviloAt: null,
        }).osnova;
        if (kroz) o = JSON.parse(JSON.stringify(o)) as Osnova;
      }
      return o;
    };
    const danPoDan = slozi(true);
    const odjednom = slozi(false);
    proveri("zbir je isti (XP, niz, brojači, dostignuća)", JSON.stringify(danPoDan) === JSON.stringify(odjednom), `${danPoDan.xp} vs ${odjednom.xp}`);
    proveri("test ima smisla: XP > 0 i bar jedno dostignuće", odjednom.xp > 500 && Object.keys(odjednom.otkljucano).length > 0, `xp=${odjednom.xp}`);

    // Zbir do prekjuče + dva otvorena dana = zbir svih dana.
    const sidro = sviDani[brojDana - 1];
    let doPrekjuce: Osnova = { ...praznaOsnova(), do: dodajDane(prvi, -1) };
    for (const dan of sviDani.slice(0, brojDana - 2)) {
      doPrekjuce = primeniDan(doPrekjuce, {
        dan,
        obracun: obracunajDan(dogadjaji, JA, dan),
        misije: misijePoDanu[dan] ?? [],
        naOtvaranju: null,
        podesavanja: PODRAZUMEVANO,
        finalan: true,
        aktivnoPraviloAt: null,
      }).osnova;
    }
    const otvoreni = dogadjaji.filter((e) => danKljuc(e.at) >= dodajDane(sidro, -1));
    const uzivo = ukljuceno(izvedi(ulaz({ sidro, osnova: doPrekjuce, dogadjaji: otvoreni, misijePoDanu })));
    proveri("zbir do prekjuče + otvoreni dani = ukupan XP", uzivo.xp.ukupno === odjednom.xp, `${uzivo.xp.ukupno} vs ${odjednom.xp}`);
    proveri("stanje je „spremno“ kad zbir pokriva do prekjuče", uzivo.spremno === true, "spremno=false");
    const zaostalo = ukljuceno(izvedi(ulaz({ sidro, osnova: { ...praznaOsnova(), do: dodajDane(sidro, -9) }, dogadjaji: otvoreni, misijePoDanu })));
    proveri("zbir koji kasni: „spremno“ = false i nema proslava", zaostalo.spremno === false && zaostalo.proslave.length === 0, JSON.stringify(zaostalo.proslave));
    proveri("pre prvog zamrzavanja: nema dana, nivo 1, nije spremno", (() => {
      const s = ukljuceno(izvedi(ulaz({ sidro: null, osnova: praznaOsnova(), dogadjaji })));
      return s.dan === null && s.nivo.broj === 1 && s.xp.ukupno === 0 && !s.spremno && s.misije.length === 0;
    })(), "stanje bez sidra nije prazno");
  }

  // 14 ─ sastanak
  console.log("\n14. Sastanak: otkazan i pomeren");
  {
    const dogovoren = dog("sastanak", u(PON, 10), { firma: "A", meta: "t1" });
    proveri("dogovoren sastanak = 50 XP", xpDana([dogovoren], PON) === 50, "nije 50");
    const otkazan = dog("sastanak_otkazan", u(PON, 11), { firma: "A", meta: "t1" });
    proveri("otkazan istog dana = 0 XP", xpDana([dogovoren, otkazan], PON) === 0, `xp=${xpDana([dogovoren, otkazan], PON)}`);
    const pomeren = dog("sastanak", u(PON, 12), { firma: "A", meta: "t2" });
    proveri("pomeren termin (dva „dogovoren“) = 50, ne 100", xpDana([dogovoren, pomeren], PON) === 50, `xp=${xpDana([dogovoren, pomeren], PON)}`);
    proveri("dogovoren → otkazan → ponovo dogovoren = 50", xpDana([dogovoren, otkazan, pomeren], PON) === 50, `xp=${xpDana([dogovoren, otkazan, pomeren], PON)}`);
    const otkazanSutra = dog("sastanak_otkazan", u(UTO, 9), { firma: "A", meta: "t1" });
    proveri("otkazan sutradan ne poništava jučerašnji XP", xpDana([dogovoren, otkazanSutra], PON) === 50, "poništen");
  }

  // 15 ─ proslave
  console.log("\n15. Proslave i potvrde");
  {
    const misije: MisijaDef[] = [{ kljuc: "pozovi", cilj: 1, xp: 60, oblast: "pozivi", veza: "/leadovi" }];
    const dogadjaji = [dog("dodir", u(PON, 9), { firma: "A", podvrsta: "poziv" })];
    const novo = ukljuceno(izvedi(ulaz({ dogadjaji, misijePoDanu: { [PON]: misije } })));
    const kljucevi = novo.proslave.map((p) => p.kljuc);
    proveri(
      "prvi poziv: misija i „Prvi kontakt“ čekaju proslavu",
      kljucevi.includes(`misija:${PON}:pozovi`) && kljucevi.includes("dostignuce:prvi_kontakt"),
      kljucevi.join(", "),
    );
    proveri("prvi poziv sa ciljem 1 donosi 70 XP (10 + 60)", novo.xp.ukupno === 70 && novo.nivo.zaSledeci === 30, `xp=${novo.xp.ukupno}`);
    const vidjeno = ukljuceno(
      izvedi(
        ulaz({
          dogadjaji,
          misijePoDanu: { [PON]: misije },
          potvrde: { dnevne: ["misija:pozovi"], trajne: ["dostignuce:prvi_kontakt"], nivo: 1 },
        }),
      ),
    );
    proveri("potvrđeno se ne ponavlja", vidjeno.proslave.length === 0, JSON.stringify(vidjeno.proslave));

    const nivo3 = ukljuceno(izvedi(ulaz({ osnova: { ...praznaOsnova(), do: dodajDane(PON, -2), xp: 250 } })));
    proveri("nov nivo čeka proslavu dok se ne potvrdi", nivo3.proslave.some((p) => p.kljuc === "nivo:3"), JSON.stringify(nivo3.proslave));
    const nivo3Vidjen = ukljuceno(izvedi(ulaz({ osnova: { ...praznaOsnova(), do: dodajDane(PON, -2), xp: 250 }, potvrde: { dnevne: [], trajne: [], nivo: 3 } })));
    proveri("potvrđen nivo se ne slavi ponovo", !nivo3Vidjen.proslave.some((p) => p.vrsta === "nivo"), JSON.stringify(nivo3Vidjen.proslave));

    const ispravni = [`misija:${PON}:pozovi`, `bonus:${PON}`, "nivo:7", "dostignuce:zatvarac"];
    proveri("svaki ključ koji sistem pravi mutacija prepoznaje", ispravni.every((k) => parsirajProslavu(k) !== null), ispravni.filter((k) => parsirajProslavu(k) === null).join(", "));
    const neispravni = ["", "misija:pozovi", `misija:${PON}:izmisljena`, "bonus:juce", "nivo:1", "nivo:abc", "dostignuce:nepostojece", "nesto:drugo"];
    proveri("ključ koji sistem ne pravi se odbija", neispravni.every((k) => parsirajProslavu(k) === null), neispravni.filter((k) => parsirajProslavu(k) !== null).join(", "));
    proveri(
      "nivo se pamti trajno, misija uz svoj dan",
      parsirajProslavu("nivo:7")?.opseg === "trajno" && parsirajProslavu("nivo:7")?.vrednost === 7 && parsirajProslavu(`misija:${PON}:pozovi`)?.opseg === PON,
      "pogrešan opseg",
    );

    proveri(
      "najbliže zaključano dostignuće se nudi kao sledeći cilj",
      novo.sledece !== null && novo.sledece.vrednost < novo.sledece.cilj,
      JSON.stringify(novo.sledece),
    );
  }

  // 16 ─ niz u opasnosti i prstenovi
  console.log("\n16. Niz „u opasnosti“ i nedeljni prstenovi");
  {
    const saNizom = { ...praznaOsnova(), do: dodajDane(SRE, -2), niz: 3, nizDo: dodajDane(SRE, -2), najduziNiz: 3 };
    const triJuce = [
      dog("dodir", u(UTO, 10), { firma: "A", podvrsta: "poziv" }),
      dog("dodir", u(UTO, 11), { firma: "B", podvrsta: "poziv" }),
      dog("dodir", u(UTO, 12), { firma: "C", podvrsta: "poziv" }),
    ];
    const s = ukljuceno(izvedi(ulaz({ sidro: SRE, osnova: saNizom, dogadjaji: triJuce })));
    proveri("niz 4 (3 + juče), danas još nije uračunat", s.niz.dani === 4 && !s.niz.danasUracunat, JSON.stringify(s.niz));
    proveri("granica opasnosti je 17:00 po Beogradu", s.niz.opasnostOd === belgradeToEpoch(SRE, "17:00"), String(s.niz.opasnostOd));
    proveri(
      "u 16:59 nije u opasnosti, u 17:00 jeste",
      !nizUOpasnosti(s.niz, u(SRE, 16, 59)) && nizUOpasnosti(s.niz, u(SRE, 17)),
      "pogrešna granica",
    );
    const triDanas = [
      dog("dodir", u(SRE, 10), { firma: "A", podvrsta: "poziv" }),
      dog("dodir", u(SRE, 11), { firma: "B", podvrsta: "poziv" }),
      dog("dodir", u(SRE, 12), { firma: "C", podvrsta: "poziv" }),
    ];
    const uracunat = ukljuceno(izvedi(ulaz({ sidro: SRE, osnova: saNizom, dogadjaji: [...triJuce, ...triDanas] })));
    proveri("uračunat dan: niz 5 i nema opasnosti", uracunat.niz.dani === 5 && uracunat.niz.opasnostOd === null, JSON.stringify(uracunat.niz));
    const subota = ukljuceno(izvedi(ulaz({ sidro: SUB, osnova: { ...saNizom, do: dodajDane(SUB, -2), nizDo: dodajDane(SUB, -2) }, dogadjaji: triJuce.map((e) => ({ ...e, at: u(PET, 10) + (e.at % 1000), upisanAt: u(PET, 10) })) })));
    proveri("vikendom (opcija uključena) niz nije u opasnosti", subota.niz.opasnostOd === null, JSON.stringify(subota.niz));
    const bezNiza = ukljuceno(izvedi(ulaz({ sidro: SRE })));
    proveri("bez niza nema šta da bude u opasnosti", bezNiza.niz.dani === 0 && bezNiza.niz.opasnostOd === null, JSON.stringify(bezNiza.niz));

    const p = prstenovi({ pozivi: 10, sastanci: 3, objave: 5 }, PODRAZUMEVANO);
    proveri(
      "prsten nosi i broj i procenat, a procenat staje na 100",
      p[0].vrednost === 10 && p[0].cilj === 25 && p[0].procenat === 40 && !p[0].pun && p[1].pun && p[1].procenat === 100 && p[2].procenat === 100 && p[2].vrednost === 5,
      JSON.stringify(p),
    );
    proveri("prstenovi broje pozive, sastanke i objave ove nedelje", s.prstenovi.find((r) => r.kljuc === "pozivi")?.vrednost === 3, JSON.stringify(s.prstenovi));
    proveri(
      "nova nedelja kreće od nule",
      ukljuceno(izvedi(ulaz({ sidro: PON2, osnova: { ...praznaOsnova(), do: dodajDane(PON2, -2), nedelja: { pon: PON, pozivi: 20, sastanci: 2, objave: 1 } } }))).prstenovi.every((r) => r.vrednost === 0),
      "prsten je preneo prošlu nedelju",
    );
  }

  // 17 ─ fixture
  console.log("\n17. Fixture za razvojni prikaz");
  {
    const stanje = resolveFixture(getFunctionName(api.napredak.stanje), {}) as Stanje;
    proveri("fixture `napredak.stanje` postoji i uključen je", stanje !== undefined && stanje.ukljucen === true, "nema fixture-a");
    if (stanje?.ukljucen) {
      proveri("nivo 7", stanje.nivo.broj === 7 && stanje.nivo.zvanje === "Operativac" && stanje.nivo.rang === "silver", JSON.stringify(stanje.nivo));
      proveri("1.370 XP ukupno", stanje.xp.ukupno === 1370, `xp=${stanje.xp.ukupno}`);
      proveri("niz 4", stanje.niz.dani === 4, `niz=${stanje.niz.dani}`);
      const zavrsene = stanje.misije.filter((m) => m.zavrsena).length;
      proveri("2 od 3 misije završene", stanje.misije.length === 3 && zavrsene === 2, `${zavrsene}/${stanje.misije.length}`);
      proveri("bonus još nije osvojen", stanje.bonus.moguc && !stanje.bonus.osvojen && stanje.bonus.preostaloMisija === 1, JSON.stringify(stanje.bonus));
      proveri("razvojni prikaz ne kreće proslavom", stanje.proslave.length === 0 && stanje.spremno, JSON.stringify(stanje.proslave));
    }
    const profil = resolveFixture(getFunctionName(api.napredak.profil), {}) as ReturnType<typeof izvediProfil>;
    proveri(
      "fixture `napredak.profil`: 23 dostignuća, mapa od 84 dana",
      profil !== undefined && profil.ukljucen === true && profil.dostignuca.length === 23 && profil.mapa.dani.length === 84 && profil.otkljucano >= 4,
      profil?.ukljucen ? `${profil.dostignuca.length} / ${profil.mapa.dani.length}` : "nema fixture-a",
    );
    const prazno = resolveFixture(getFunctionName(api.napredak.stanje), {}, true) as Stanje;
    proveri(
      "prazan nalog: nivo 1, bez XP-a i bez misija",
      prazno?.ukljucen === true && prazno.nivo.broj === 1 && prazno.xp.ukupno === 0 && prazno.misije.length === 0,
      JSON.stringify(prazno),
    );
  }

  // 18 ─ povratna informacija
  console.log("\n18. Povratna informacija: šta se pali kad se stanje promeni");
  {
    const misije: MisijaDef[] = [
      { kljuc: "pozovi", cilj: 2, xp: 60, oblast: "pozivi", veza: "/leadovi" },
    ];
    type Potvrdjeno = { dnevne: string[]; trajne: string[]; nivo: number };
    const nista: Potvrdjeno = { dnevne: [], trajne: [], nivo: 1 };
    // „Prvi kontakt" je već viđen, da se u prvim koracima gleda samo +XP.
    const vidjeno: Potvrdjeno = { dnevne: [], trajne: ["dostignuce:prvi_kontakt"], nivo: 1 };
    const stanjeZa = (dogadjaji: Dogadjaj[], potvrde: Potvrdjeno = nista) =>
      ukljuceno(izvedi(ulaz({ dogadjaji, misijePoDanu: { [PON]: misije }, potvrde })));
    const prviPoziv = dog("dodir", u(PON, 9), { firma: "A", podvrsta: "poziv" });
    const drugiPoziv = dog("dodir", u(PON, 10), { firma: "B", podvrsta: "poziv" });
    const ishod = dog("ishod", u(PON, 9, 30), { firma: "A", podvrsta: "zainteresovan" });

    const pamcenje = novoPamcenje();
    const otvaranje = izdvojiNagrade(stanjeZa([prviPoziv], vidjeno), pamcenje, true);
    proveri("pri otvaranju se ne pali ništa za ono što je već tu", otvaranje.toasts.length === 0 && otvaranje.nivo === null && otvaranje.potvrdi.length === 0, JSON.stringify(otvaranje));

    const isto = izdvojiNagrade(stanjeZa([prviPoziv], vidjeno), pamcenje, true);
    proveri("isto stanje drugi put ne pali ništa", isto.toasts.length === 0, JSON.stringify(isto.toasts));

    const posleIshoda = izdvojiNagrade(stanjeZa([prviPoziv, ishod], vidjeno), pamcenje, true);
    proveri(
      "nova radnja = jedan toast „+15 XP · Ishod zabeležen“",
      posleIshoda.toasts.length === 1 && posleIshoda.toasts[0].xp === 15 && posleIshoda.toasts[0].title === "Ishod zabeležen" && posleIshoda.toasts[0].duration === undefined,
      JSON.stringify(posleIshoda.toasts),
    );

    const posleMisije = izdvojiNagrade(stanjeZa([prviPoziv, ishod, drugiPoziv], vidjeno), pamcenje, true);
    const misijaToast = posleMisije.toasts.find((t) => t.ikona.tip === "misija");
    proveri(
      "poziv koji zatvara misiju: +10 XP za poziv i jedan toast misije od +60 XP",
      posleMisije.toasts.length === 2 && posleMisije.toasts[0].xp === 10 && misijaToast?.xp === 60 && misijaToast.duration === DUZE_MS && misijaToast.ikona.kljuc === "pozovi",
      JSON.stringify(posleMisije.toasts),
    );
    proveri("misija se ne javlja dvaput (i kao događaj i kao proslava)", posleMisije.toasts.filter((t) => t.xp === 60).length === 1, JSON.stringify(posleMisije.toasts));
    proveri("viđena misija se šalje serveru na potvrdu", posleMisije.potvrdi.join() === `misija:${PON}:pozovi`, posleMisije.potvrdi.join());
    proveri("ključ koji hook šalje mutacija prepoznaje", posleMisije.potvrdi.every((k) => parsirajProslavu(k) !== null), posleMisije.potvrdi.join());
    const ponovo = izdvojiNagrade(stanjeZa([prviPoziv, ishod, drugiPoziv], vidjeno), pamcenje, true);
    proveri("ista proslava se u sesiji ne ponavlja", ponovo.toasts.length === 0 && ponovo.potvrdi.length === 0, JSON.stringify(ponovo));

    // Skriven tab: +XP se tiho upiše kao viđen, proslave čekaju.
    const skriveno = novoPamcenje();
    izdvojiNagrade(stanjeZa([]), skriveno, true);
    const uPozadini = izdvojiNagrade(stanjeZa([prviPoziv, drugiPoziv]), skriveno, false);
    proveri("skriven tab ne pali ništa i ne troši proslave", uPozadini.toasts.length === 0 && uPozadini.potvrdi.length === 0, JSON.stringify(uPozadini));
    const povratak = izdvojiNagrade(stanjeZa([prviPoziv, drugiPoziv]), skriveno, true);
    proveri(
      "po povratku stižu proslave (misija, dostignuće), a stari +XP ne",
      povratak.toasts.length === 2 && povratak.toasts.every((t) => t.ikona.tip !== "dogadjaj") && povratak.potvrdi.includes("dostignuce:prvi_kontakt"),
      JSON.stringify(povratak.toasts.map((t) => t.title)),
    );
    const dostignuce = povratak.toasts.find((t) => t.ikona.tip === "dostignuce");
    proveri("toast dostignuća nosi naziv i nema XP", dostignuce?.title === "Novo dostignuće: Prvi kontakt" && dostignuce.xp === undefined && dostignuce.tone === "achievement", JSON.stringify(dostignuce));

    // Tri i više novih događaja odjednom je jedan zbirni toast.
    const zbirno = novoPamcenje();
    izdvojiNagrade(ukljuceno(izvedi(ulaz({ potvrde: vidjeno }))), zbirno, true);
    const mnogo = [0, 1, 2, 3].map((i) => dog("red", u(PON, 11, i)));
    const zbir = izdvojiNagrade(ukljuceno(izvedi(ulaz({ dogadjaji: mnogo, potvrde: vidjeno }))), zbirno, true);
    proveri("četiri nova događaja odjednom = jedan zbirni toast od +12 XP", zbir.toasts.length === 1 && zbir.toasts[0].xp === 12 && zbir.toasts[0].title === "4 radnje", JSON.stringify(zbir.toasts));

    // Nov nivo ide u traku, ne u toast.
    const saNivoom = izdvojiNagrade(
      ukljuceno(izvedi(ulaz({ osnova: { ...praznaOsnova(), do: dodajDane(PON, -2), xp: 2400 } }))),
      novoPamcenje(),
      true,
    );
    proveri(
      "nov nivo: traka sa nivoom, zvanjem i rangom, i ključ za potvrdu",
      saNivoom.nivo?.level === 10 && saNivoom.nivo.rank === "Agent" && saNivoom.nivo.tier === "silver" && saNivoom.potvrdi.includes("nivo:10") && saNivoom.toasts.length === 0,
      JSON.stringify(saNivoom),
    );

    // Stanje koje nije spremno ne pali ništa i ne pamti ništa.
    const nespremno = novoPamcenje();
    const kasni = izdvojiNagrade({ ...stanjeZa([prviPoziv]), spremno: false }, nespremno, true);
    proveri("stanje koje nije spremno ne pali ništa", kasni.toasts.length === 0 && kasni.potvrdi.length === 0 && nespremno.vidjeni === null, JSON.stringify(kasni));
  }

  console.log("\n" + "=".repeat(78));
  if (pao === 0) {
    console.log(`✓ Sve provere prolaze (${ukupno}).`);
  } else {
    console.log(`✗ ${pao} od ${ukupno} ${pao === 1 ? "provera pala" : "provera palo"}.`);
    process.exitCode = 1;
  }
}

main();

export type { Stanje };
