/**
 * ============================================================================
 * DOKAZ: tok uvoza broji jednom i za sve (A5 §2)
 * ============================================================================
 *
 * Pokretanje:
 *   npm run verify:uvoz
 *   (ili: node --import ./scripts/ts-hooks.mjs scripts/import-flow-check.ts)
 *
 * Zašto postoji: „78 nerazrešenih redova" je do A5 bio broj koji su tri mesta
 * računala svako za sebe — zvono (`notificationsStore`), istorija uvoza
 * (`listImports`) i sam pregled. Zvono i istorija su brojali i redove koje je
 * čovek SKLONIO iz uvoza, pregled nije. Ovde se, bez baze i bez mreže,
 * dokazuje:
 *
 *   1. sklonjen red ne čeka presudu — ni u jednom od tri brojača;
 *   2. podela redova je isključiva i potpuna (zbir kanti = broj redova), pa
 *      rezime „Primenjeno N · novih X · spojeno Y · preskočeno Z ·
 *      nerazrešeno W" ne može ni da preklopi ni da izgubi red;
 *   3. koraci toka (Učitano → Rešeno N/M → Primeni → Šta je nastalo) prate
 *      stvarno stanje: primenjen uvoz sa nerazrešenim redovima STOJI na
 *      koraku „Rešeno", ne prikazuje se kao gotov;
 *   4. „Rešeno N/M" ima imenilac koji isključuje sklonjene redove;
 *   5. uvoz „U pregledu" je zaglavljen po ISTOM pragu po kom zvono podiže
 *      hitnost (24 h), a primenjen uvoz nikad nije zaglavljen;
 *   6. nijedan tekst koraka ne tvrdi nešto što brojevi ne kažu (npr. „nova
 *      firma" u jednini uz broj 5).
 *
 * Svi podaci su izmišljeni („test-tabela-1.xlsx"). Nema mreže, nema ključeva.
 */

import process from "node:process";
import {
  brojNerazresenih,
  cekaPrimenu,
  jeNerazresen,
  jePreskocen,
  jeResen,
  jeSklonjen,
  jeZastaoUPregledu,
  koraciUvoza,
  stanjeUvoza,
  PRAG_HITNO_MS,
  type Korak,
  type RedUvoza,
} from "../convex/lib/importFlow";

let pao = 0;
function proveri(naziv: string, uslov: boolean, detalj: string): void {
  if (uslov) {
    console.log(`  OK   ${naziv}`);
  } else {
    pao++;
    console.log(`  PAO  ${naziv} -> ${detalj}`);
  }
}

const SAT = 3_600_000;
const DAN = 24 * SAT;
const NOW = Date.UTC(2026, 8, 10, 9, 0, 0);

function red(
  decision: string,
  extra: { obrisan?: boolean; primenjenAt?: number } = {},
): RedUvoza {
  return { decision, ...extra };
}

function korak(koraci: Korak[], kljuc: Korak["kljuc"]): Korak {
  const k = koraci.find((x) => x.kljuc === kljuc);
  if (!k) throw new Error(`korak ${kljuc} ne postoji`);
  return k;
}

function main(): void {
  console.log("=".repeat(78));
  console.log("TOK UVOZA — provera brojanja i koraka (A5)");
  console.log("=".repeat(78));

  // 1 ─ sklonjen red nije posao
  console.log("\n1. Sklonjen red ne čeka presudu (jedan izvor za zvono i ekran)");
  const saSklonjenim: RedUvoza[] = [
    red("nerazreseno"),
    red("nerazreseno"),
    red("nerazreseno", { obrisan: true }),
  ];
  proveri(
    "brojNerazresenih preskače sklonjen red",
    brojNerazresenih(saSklonjenim) === 2,
    `dobijeno ${brojNerazresenih(saSklonjenim)}, očekivano 2`,
  );
  proveri(
    "stanjeUvoza broji isto što i brojNerazresenih",
    stanjeUvoza(saSklonjenim).nerazreseno === brojNerazresenih(saSklonjenim),
    `${stanjeUvoza(saSklonjenim).nerazreseno} ≠ ${brojNerazresenih(saSklonjenim)}`,
  );
  proveri(
    "sklonjen nerazrešen red ide u „preskočeno“",
    stanjeUvoza(saSklonjenim).preskoceno === 1,
    `dobijeno ${stanjeUvoza(saSklonjenim).preskoceno}`,
  );
  proveri(
    "sklonjen red nije ni rešen ni spreman za primenu",
    !jeResen(red("nova_firma", { obrisan: true })) &&
      !cekaPrimenu(red("spoji", { obrisan: true })) &&
      !jeNerazresen(red("nerazreseno", { obrisan: true })) &&
      jeSklonjen(red("nova_firma", { obrisan: true })) &&
      jePreskocen(red("nova_firma", { obrisan: true })),
    "sklonjen red je negde prošao kao posao",
  );

  // 2 ─ podela je isključiva i potpuna
  console.log("\n2. Rezime ne gubi i ne preklapa nijedan red");
  const mesano: RedUvoza[] = [
    red("nova_firma", { primenjenAt: NOW - 2 * DAN }),
    red("nova_firma", { primenjenAt: NOW - 2 * DAN }),
    red("spoji", { primenjenAt: NOW - 2 * DAN }),
    red("preskoci"),
    red("nova_firma", { obrisan: true }),
    red("nerazreseno"),
    red("nerazreseno"),
    red("spoji"), // rešen posle primene — čeka „Primeni preostale"
  ];
  const s = stanjeUvoza(mesano);
  const zbir =
    s.primenjeno + s.preskoceno + s.nerazreseno + s.cekaPrimenu;
  proveri(
    "zbir kanti je broj redova",
    zbir === s.uFajlu && s.uFajlu === mesano.length,
    `${zbir} ≠ ${mesano.length}`,
  );
  proveri(
    "nove firme i spojene čine primenjene",
    s.noveFirme === 2 && s.spojeno === 1 && s.primenjeno === 3,
    `nove ${s.noveFirme}, spojene ${s.spojeno}, primenjeno ${s.primenjeno}`,
  );
  proveri(
    "preskočeno = izričito preskočen + sklonjen",
    s.preskoceno === 2,
    `dobijeno ${s.preskoceno}`,
  );
  proveri(
    "čeka primenu je tačno rešen red bez upisa",
    s.cekaPrimenu === 1 && mesano.filter(cekaPrimenu).length === 1,
    `dobijeno ${s.cekaPrimenu}`,
  );

  // 3 ─ „Rešeno N/M" ima pošten imenilac
  console.log("\n3. „Rešeno N/M“ ne broji sklonjene redove u imenilac");
  proveri(
    "imenilac je broj redova koji traže odluku",
    s.zaOdluku === mesano.length - s.sklonjeno && s.sklonjeno === 1,
    `zaOdluku ${s.zaOdluku}, sklonjeno ${s.sklonjeno}`,
  );
  proveri(
    "brojilac je imenilac minus nerazrešeni",
    s.odluceno === s.zaOdluku - s.nerazreseno,
    `${s.odluceno} ≠ ${s.zaOdluku - s.nerazreseno}`,
  );

  // 4 ─ koraci toka
  console.log("\n4. Koraci toka prate stvarno stanje");
  const primenjenSaNerazresenim = koraciUvoza(
    { status: "primenjen", rowsSkipped: 0 },
    s,
  );
  proveri(
    "primenjen uvoz sa nerazrešenima STOJI na koraku „Rešeno“",
    korak(primenjenSaNerazresenim, "reseno").stanje === "stao",
    korak(primenjenSaNerazresenim, "reseno").stanje,
  );
  proveri(
    "korak „Primeni“ je tekući kad ima rešenih koji čekaju upis",
    korak(primenjenSaNerazresenim, "primeni").stanje === "tekuci" &&
      korak(primenjenSaNerazresenim, "primeni").naslov === "Primeni preostale",
    korak(primenjenSaNerazresenim, "primeni").naslov,
  );
  proveri(
    "korak „Šta je nastalo“ je gotov tek kad je nešto ušlo u bazu",
    korak(primenjenSaNerazresenim, "nastalo").stanje === "gotov",
    korak(primenjenSaNerazresenim, "nastalo").stanje,
  );

  const svezUvoz = stanjeUvoza([
    red("nova_firma"),
    red("nerazreseno"),
    red("preskoci"),
  ]);
  const uPregledu = koraciUvoza({ status: "u_pregledu", rowsSkipped: 2 }, svezUvoz);
  proveri(
    "uvoz u pregledu: „Rešeno“ je tekući korak",
    korak(uPregledu, "reseno").stanje === "tekuci" &&
      korak(uPregledu, "reseno").naslov === "Rešeno 2/3",
    korak(uPregledu, "reseno").naslov,
  );
  proveri(
    "„Primeni“ još nije na redu dok ima nerazrešenih",
    korak(uPregledu, "primeni").stanje === "ceka",
    korak(uPregledu, "primeni").stanje,
  );
  proveri(
    "„Šta je nastalo“ ne tvrdi da je nešto nastalo",
    korak(uPregledu, "nastalo").stanje === "ceka" &&
      korak(uPregledu, "nastalo").detalj === "Ništa još nije ušlo u bazu.",
    korak(uPregledu, "nastalo").detalj,
  );
  proveri(
    "korak „Učitano“ pominje redove preskočene pri parsiranju",
    korak(uPregledu, "ucitano").detalj.includes("2 preskočeno pri parsiranju"),
    korak(uPregledu, "ucitano").detalj,
  );

  const spremanZaPrimenu = koraciUvoza(
    { status: "u_pregledu", rowsSkipped: 0 },
    stanjeUvoza([red("nova_firma"), red("spoji"), red("preskoci")]),
  );
  proveri(
    "bez nerazrešenih „Primeni“ postaje tekući korak",
    korak(spremanZaPrimenu, "reseno").stanje === "gotov" &&
      korak(spremanZaPrimenu, "primeni").stanje === "tekuci",
    `${korak(spremanZaPrimenu, "reseno").stanje} / ${korak(spremanZaPrimenu, "primeni").stanje}`,
  );

  const ponisten = koraciUvoza(
    { status: "ponisten", rowsSkipped: 0 },
    stanjeUvoza([red("nerazreseno"), red("nova_firma")]),
  );
  proveri(
    "poništen uvoz nema tekućih koraka",
    ponisten.every((k) => k.stanje !== "tekuci"),
    ponisten.map((k) => `${k.kljuc}:${k.stanje}`).join(", "),
  );

  // 5 ─ zaglavljen uvoz
  console.log("\n5. Zaglavljen uvoz koristi ISTI prag kao zvono (24 h)");
  proveri(
    "prag je 24 h",
    PRAG_HITNO_MS === DAN,
    `PRAG_HITNO_MS = ${PRAG_HITNO_MS}`,
  );
  proveri(
    "uvoz od pre 13 dana je zaglavljen",
    jeZastaoUPregledu({ status: "u_pregledu", uploadedAt: NOW - 13 * DAN }, NOW),
    "nije prijavljen kao zaglavljen",
  );
  proveri(
    "uvoz od pre 2 sata nije zaglavljen",
    !jeZastaoUPregledu({ status: "u_pregledu", uploadedAt: NOW - 2 * SAT }, NOW),
    "prijavljen je prerano",
  );
  proveri(
    "tačno na 24 h uvoz jeste zaglavljen (granica se ne preskače)",
    jeZastaoUPregledu({ status: "u_pregledu", uploadedAt: NOW - DAN }, NOW),
    "granica nije uključena",
  );
  proveri(
    "primenjen i poništen uvoz nikad nisu zaglavljeni",
    !jeZastaoUPregledu({ status: "primenjen", uploadedAt: NOW - 13 * DAN }, NOW) &&
      !jeZastaoUPregledu({ status: "ponisten", uploadedAt: NOW - 13 * DAN }, NOW),
    "uvoz koji ne čeka pregled je prijavljen kao zaglavljen",
  );

  // 6 ─ tekst prati broj (srpska množina)
  console.log("\n6. Tekst koraka prati broj");
  const jedan = koraciUvoza(
    { status: "primenjen", rowsSkipped: 0 },
    stanjeUvoza([red("nova_firma", { primenjenAt: NOW }), red("nerazreseno")]),
  );
  proveri(
    "jedna nova firma je „1 nova firma“",
    korak(jedan, "nastalo").detalj.startsWith("1 nova firma"),
    korak(jedan, "nastalo").detalj,
  );
  proveri(
    "jedan nerazrešen red je „1 red nije rešen“",
    korak(jedan, "reseno").detalj === "1 red nije rešen",
    korak(jedan, "reseno").detalj,
  );
  const pet = koraciUvoza(
    { status: "primenjen", rowsSkipped: 0 },
    stanjeUvoza([
      ...Array.from({ length: 5 }, () => red("nova_firma", { primenjenAt: NOW })),
      ...Array.from({ length: 5 }, () => red("nerazreseno")),
    ]),
  );
  proveri(
    "pet novih firmi je „5 novih firmi“",
    korak(pet, "nastalo").detalj.startsWith("5 novih firmi"),
    korak(pet, "nastalo").detalj,
  );
  proveri(
    "pet nerazrešenih je „5 redova nije rešeno“",
    korak(pet, "reseno").detalj === "5 redova nije rešeno",
    korak(pet, "reseno").detalj,
  );

  // 7 ─ prazan uvoz ne izmišlja posao
  console.log("\n7. Prazan uvoz ne izmišlja posao");
  const prazan = stanjeUvoza([]);
  proveri(
    "svi brojači su nula",
    Object.values(prazan).every((v) => v === 0),
    JSON.stringify(prazan),
  );
  const koraciPraznog = koraciUvoza({ status: "u_pregledu" }, prazan);
  proveri(
    "korak „Rešeno“ je gotov, a ne „stao“ (nema šta da se reši)",
    korak(koraciPraznog, "reseno").stanje === "gotov",
    korak(koraciPraznog, "reseno").stanje,
  );

  console.log("\n" + "=".repeat(78));
  if (pao === 0) {
    console.log("✓ Sve provere prolaze.");
  } else {
    console.log(`✗ ${pao} ${pao === 1 ? "provera pala" : "provera palo"}.`);
    process.exitCode = 1;
  }
}

main();
