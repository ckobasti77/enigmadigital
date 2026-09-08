#!/usr/bin/env node
/**
 * ============================================================================
 * /generate-leads — deterministički deo skilla (plan §10.3, §10.4)
 * ============================================================================
 *
 * Ovde je sve što se može uraditi bez čitanja stranica: Places otkrivanje,
 * provera sajta, geokodiranje, skor po §6, validacija i slanje. Čitanje sajta,
 * CompanyWall-a, 011info-a i javnih profila radi Claude u skillu i rezultat
 * upisuje u `out/<run-id>/firme.json` (oblik je u README-u i u SKILL.md).
 *
 * Bez ijedne zavisnosti van Node-a 20+ (`fetch` je ugrađen). Jedini izuzetak je
 * `self-test`, koji uvozi zod šemu iz `convex/lib/generateLeadsIngest.ts` da bi
 * dokazao da se dve kopije šeme nisu razišle — i to samo kad se pokreće iz
 * repoa.
 *
 * Komande:
 *   proveri-env                          sve četiri promenljive (§10.1)
 *   discover --grad --nisa --broj [--sajt] [--upiti] [--faktor] [--max-strana]
 *   check-site --run <id>                status sajta za svaku firmu (§3.8)
 *   geocode --run <id>                   koordinate iz Nominatima (§3.6)
 *   score --run <id>                     verovatnoća telefona po §6
 *   send --run <id> [--dry-run]          slanje u staging (§5)
 *   self-test                            §10.5, bez mreže i bez ključeva
 *
 * NIŠTA IZ TELA SE NE ISPISUJE: ni telefon, ni email, ni ime osobe (§0 pravilo
 * 6). U izlazu su brojevi, domeni i statusi.
 */

import process from "node:process";

import * as env from "./lib/env.mjs";
import * as izlaz from "./lib/izlaz.mjs";
import { nadjiNisu, normalizujSlug, upitiNise } from "./lib/nise.mjs";
import { alijasiGrada } from "./lib/gradovi.mjs";
import { otkrijKandidate, PlacesGreska } from "./lib/places.mjs";
import { geokodiraj, RAZMAK_MS, sacekaj, userAgent } from "./lib/nominatim.mjs";
import { proveriSajt } from "./lib/sajt.mjs";
import { oceniOsobe, traka } from "./lib/skor.mjs";
import { validirajTelo } from "./lib/schema.mjs";
import { objasniStatus, posalji } from "./lib/ingest.mjs";
import { pokreniSelfTest } from "./lib/self-test.mjs";
import { ucitajFajl } from "./lib/tabela.mjs";
import { promenjeneFirme } from "./lib/obogati.mjs";
import { basename } from "node:path";

/** Verzija skilla — ide u `izvor.verzijaSkilla` i u User-Agent. */
export const VERZIJA = "1.0.0";

const { ispisi, ispisiGresku } = izlaz;

// ─────────────────────────────────────────────────────────────────────────────
// Argumenti
// ─────────────────────────────────────────────────────────────────────────────

function parsirajArgumente(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const deo = argv[i];
    if (!deo.startsWith("--")) {
      args._.push(deo);
      continue;
    }
    const kljuc = deo.slice(2);
    const sledeci = argv[i + 1];
    if (sledeci === undefined || sledeci.startsWith("--")) {
      args[kljuc] = true;
      continue;
    }
    args[kljuc] = sledeci;
    i += 1;
  }
  return args;
}

function trazenArgument(args, ime) {
  const vrednost = args[ime];
  if (typeof vrednost !== "string" || vrednost.trim().length === 0) {
    throw new Error(`Nedostaje --${ime}.`);
  }
  return vrednost.trim();
}

/** Filter sajta je opcion; izostavljen znači `svejedno` (plan §10.2). */
function filterSajta(args) {
  const vrednost = typeof args.sajt === "string" ? args.sajt.trim() : "svejedno";
  if (!["ima", "nema", "svejedno"].includes(vrednost)) {
    throw new Error(`--sajt mora biti ima, nema ili svejedno (dobijeno: ${vrednost}).`);
  }
  return vrednost;
}

// ─────────────────────────────────────────────────────────────────────────────
// proveri-env
// ─────────────────────────────────────────────────────────────────────────────

function komandaProveriEnv() {
  const imena = Object.keys(env.PROMENLJIVE);
  const nedostaju = imena.filter((ime) => !env.postoji(ime));

  for (const ime of imena) {
    ispisi(`${env.postoji(ime) ? "  postavljeno " : "  NEDOSTAJE   "} ${ime}`);
  }
  ispisi("");

  if (nedostaju.length > 0) throw new env.EnvGreska(nedostaju);
  ispisi("Sve četiri promenljive postoje. (Vrednosti se namerno ne prikazuju.)");
  return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// discover
// ─────────────────────────────────────────────────────────────────────────────

async function komandaDiscover(args) {
  const { GOOGLE_PLACES_API_KEY } = env.trazi(["GOOGLE_PLACES_API_KEY"]);

  // Grad: `alijasiGrada` daje kanonski naziv (ide u upit i u telo) i ugrađene
  // alijase (egzonimi + beogradske opštine — GL6 §3). „Zemun|Beograd" i dalje
  // radi: prvi deo se razrešava kroz alijase, ostali se DODAJU kao ručni
  // alijasi prihvatljivi u adresi.
  const gradUnos = trazenArgument(args, "grad");
  const [prviDeo, ...rucniAlijasi] = gradUnos.split("|").map((d) => d.trim()).filter(Boolean);
  const { kanonski: grad, alijasi: ugradjeniAlijasi } = alijasiGrada(prviDeo);
  const gradAlijasi = [...new Set([...ugradjeniAlijasi, ...rucniAlijasi])];

  const nisaUnos = trazenArgument(args, "nisa");
  const broj = Number(trazenArgument(args, "broj"));
  if (!Number.isInteger(broj) || broj < 1 || broj > 50) {
    throw new Error("--broj mora biti ceo broj između 1 i 50.");
  }
  const filterSajt = filterSajta(args);

  const nisa = nadjiNisu(nisaUnos);
  const rucniUpiti =
    typeof args.upiti === "string"
      ? args.upiti.split(",").map((u) => u.trim()).filter(Boolean)
      : [];

  if (!nisa && rucniUpiti.length === 0) {
    // §10.2: nepoznata niša se NE pogađa. Ovo je jedino pitanje koje skill sme
    // da postavi — pogrešan upit troši tuđu Places kvotu na pogrešne firme.
    throw new Error(
      `Niša „${nisaUnos}" nije u lib/nise.mjs.\n` +
        "Pitaj Jovana za 2–3 Places upita na srpskom i engleskom i prosledi ih:\n" +
        '  --upiti "prvi upit,drugi upit,third query"\n' +
        "Kad se niša ustali, dodaj je u lib/nise.mjs (slug, upiti, šifre delatnosti, opis).",
    );
  }

  const nisaSlug = nisa ? nisa.slug : normalizujSlug(nisaUnos);
  if (!nisaSlug) {
    throw new Error("Od naziva niše ne može da se napravi slug. Napiši je slovima ili ciframa.");
  }

  const upiti = rucniUpiti.length > 0 ? rucniUpiti : upitiNise(nisa);
  const faktor = Number(args.faktor ?? 3);
  const maxStrana = Number(args["max-strana"] ?? 3);
  const ciljKandidata = Math.max(broj, Math.ceil(broj * (Number.isFinite(faktor) ? faktor : 3)));

  const pokrenutAt = Date.now();
  const runId =
    typeof args.run === "string" && args.run.trim().length > 0
      ? args.run.trim()
      : izlaz.napraviRunId(new Date(pokrenutAt), normalizujSlug(grad), nisaSlug);

  // Dva `discover`-a istog dana u isti folder su prepisala run.json i
  // kandidati.json preko runa koji je već imao popunjen firme.json (GL6 §4).
  // Zato: ako firme.json postoji i NIJE prazan, discover odbija bez `--force`.
  if (!args.force && izlaz.postojiFajl(runId, "firme.json")) {
    const postojece = izlaz.citajJson(runId, "firme.json");
    if (Array.isArray(postojece) && postojece.length > 0) {
      throw new Error(
        `out/${runId}/ već ima popunjen firme.json (${postojece.length} firmi). ` +
          "discover bi prepisao run.json i kandidati.json preko tog runa i izgubio ga. " +
          "Dodaj --force da svesno prepišeš, ili --run <nov-id> za nov folder.",
      );
    }
  }

  ispisi(`Run: ${runId}`);
  ispisi(`Grad: ${grad}${gradAlijasi.length > 0 ? ` (adresa sme da glasi i: ${gradAlijasi.join(", ")})` : ""}`);
  ispisi(`Niša: ${nisaSlug}${nisa ? "" : " (ručni upiti)"}  ·  upiti: ${upiti.join(" / ")}`);
  ispisi(`Cilj: ${broj} firmi, filter sajta: ${filterSajt}. Skupljam do ${ciljKandidata} kandidata.`);
  ispisi("");

  let rezultat;
  try {
    rezultat = await otkrijKandidate({
      apiKey: GOOGLE_PLACES_API_KEY,
      upiti,
      grad,
      gradAlijasi,
      ciljKandidata,
      maxStrana,
      log: ispisi,
    });
  } catch (err) {
    if (err instanceof PlacesGreska) {
      // §3.7: pad Placesa zaustavlja run. Nastavak bez otkrivanja bi u
      // aplikaciji izgledao isto kao „grad nema takvih firmi".
      throw new Error(
        `Places nije odgovorio kako treba (${err.message}). Poziva do pada: ${err.pozivi ?? 0}. ` +
          "Run je zaustavljen — prazan rezultat i neuspela pretraga nisu isto. " +
          "Proveri ključ, kvotu i mrežu, pa ponovi.",
      );
    }
    throw err;
  }

  const stanje = {
    runId,
    verzijaSkilla: VERZIJA,
    pokrenutAt,
    grad: { kanonski: grad, alijasi: gradAlijasi },
    nisa: {
      slug: nisaSlug,
      naziv: nisa ? nisa.naziv : nisaUnos,
      upiti,
      opis: nisa ? nisa.opis : null,
      sifreDelatnosti: nisa ? nisa.sifreDelatnosti : [],
    },
    brojTrazen: broj,
    filterSajt,
    places: {
      pozivi: rezultat.pozivi,
      kandidata: rezultat.kandidati.length,
      vanGrada: rezultat.vanGrada,
      zatvoreniTrajno: rezultat.zatvoreni,
      iscrpljeno: rezultat.iscrpljeno,
    },
    nedostupniIzvori: [],
    koraci: { discover: pokrenutAt },
  };

  izlaz.upisiJson(runId, "run.json", stanje);
  izlaz.upisiJson(runId, "kandidati.json", rezultat.kandidati);
  if (!izlaz.postojiFajl(runId, "firme.json")) izlaz.upisiJson(runId, "firme.json", []);

  ispisi("");
  ispisi(`Places poziva: ${rezultat.pozivi}`);
  ispisi(`Kandidata u gradu: ${rezultat.kandidati.length}`);
  ispisi(`Odbačeno van grada: ${rezultat.vanGrada}  ·  trajno zatvoreno: ${rezultat.zatvoreni}`);
  ispisi(
    rezultat.iscrpljeno
      ? "Places je iscrpeo sve upite — više kandidata za ovaj grad i nišu nema."
      : "Places NIJE iscrpljen (stalo se na cilju ili na kapi strana).",
  );

  // Kad grad odbaci većinu pregledanih, uzrok je gotovo uvek pogrešno napisan
  // grad ili nedostajući alijas — a ne „grad nema takvih firmi" (GL6 §3).
  // Prikaz prva tri odbačena oblika adrese (bez imena firme) štedi sat traženja.
  if (rezultat.pregledano > 0 && rezultat.vanGrada * 2 > rezultat.pregledano) {
    ispisi("");
    ispisi(
      `UPOZORENJE: filter grada je odbacio ${rezultat.vanGrada} od ${rezultat.pregledano} pregledanih (> 50 %).`,
    );
    ispisi(
      `Adresa mora da sadrži „${grad}"` +
        (gradAlijasi.length > 0 ? ` ili alijas (${gradAlijasi.join(", ")})` : "") +
        ". Prva tri odbačena oblika adrese:",
    );
    for (const adresa of rezultat.primeriVanGrada) ispisi(`  ${adresa}`);
  }

  if (rezultat.kandidati.length === 0) {
    ispisi("");
    ispisi(
      "0 kandidata. To NIJE greška skripte — Places je odgovorio, ali nijedan rezultat " +
        `nije u gradu „${grad}". Proveri naziv grada ili dodaj alijas: --grad "${grad}|Beograd".`,
    );
  }

  ispisi("");
  ispisi(`Dalje: pročitaj out/${runId}/kandidati.json i popuni out/${runId}/firme.json.`);
  return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// ucitaj (režim „obogati", GL8 §1, §2)
// ─────────────────────────────────────────────────────────────────────────────

/** Najčešći neprazan grad iz učitanih firmi (za `upit.grad`). */
function najcesciGrad(firme) {
  const brojac = new Map();
  for (const f of firme) {
    const g = typeof f.grad === "string" ? f.grad.trim() : "";
    if (g) brojac.set(g, (brojac.get(g) ?? 0) + 1);
  }
  let najbolji = "";
  let najvise = 0;
  for (const [g, n] of brojac.entries()) {
    if (n > najvise) { najvise = n; najbolji = g; }
  }
  return najbolji;
}

async function komandaUcitaj(args) {
  // Ulaz je ILI postojeća tabela (`--fajl`) ILI izvoz iz aplikacije (`--izvoz`).
  const putanja =
    typeof args.fajl === "string" && args.fajl.trim()
      ? args.fajl.trim()
      : typeof args.izvoz === "string" && args.izvoz.trim()
        ? args.izvoz.trim()
        : null;
  if (!putanja) {
    throw new Error(
      'Nedostaje ulaz. Prosledi --fajl "<putanja.xlsx|.csv>" ili --izvoz "<csv iz aplikacije>".',
    );
  }

  // Niša ne postoji u tabeli; skill je prosleđuje (STOP tačka u SKILL.md).
  const nisaUnos = trazenArgument(args, "nisa");
  const nisa = nadjiNisu(nisaUnos);
  const nisaSlug = nisa ? nisa.slug : normalizujSlug(nisaUnos);
  if (!nisaSlug) {
    throw new Error("Od naziva niše ne može da se napravi slug. Napiši je slovima ili ciframa.");
  }

  const list = typeof args.list === "string" ? args.list.trim() : undefined;

  const { firme: sveFirme, izvestaj } = await ucitajFajl(putanja, { list });
  if (sveFirme.length === 0) {
    throw new Error(
      `Nijedna firma nije pročitana iz „${basename(putanja)}". Proveri da fajl ima red zaglavlja sa „Ime/Naziv" i „Telefon".`,
    );
  }

  // Serije: --od/--do (1-indeksirano, uključivo) da se 100 firmi radi u delovima.
  const od = args.od !== undefined ? Number(args.od) : 1;
  const doK = args.do !== undefined ? Number(args.do) : sveFirme.length;
  if (!Number.isInteger(od) || !Number.isInteger(doK) || od < 1 || doK < od) {
    throw new Error(`--od/--do moraju biti celi brojevi, 1 ≤ od ≤ do (dobijeno od=${args.od}, do=${args.do}).`);
  }
  const serija = od > 1 || doK < sveFirme.length;
  const firme = sveFirme.slice(od - 1, doK);
  if (firme.length === 0) {
    throw new Error(`Opseg --od ${od} --do ${doK} je van tabele (ima ${sveFirme.length} firmi).`);
  }

  const grad = typeof args.grad === "string" && args.grad.trim()
    ? args.grad.trim()
    : najcesciGrad(firme);
  if (!grad) {
    throw new Error(
      "Ne mogu da odredim grad iz tabele (nijedan red nema grad). Dodaj --grad \"<grad>\".",
    );
  }

  const naziv = basename(putanja);
  const nazivBezExt = naziv.replace(/\.[^.]+$/, "");
  const pokrenutAt = Date.now();
  const osnovniRunId = izlaz.napraviRunId(new Date(pokrenutAt), "obogati", normalizujSlug(nazivBezExt) || "tabela");
  const runId =
    typeof args.run === "string" && args.run.trim()
      ? args.run.trim()
      : serija
        ? `${osnovniRunId}-${od}-${doK}`
        : osnovniRunId;

  // Kolizija sa već popunjenim runom (isto pravilo kao discover, GL6 §4).
  if (!args.force && izlaz.postojiFajl(runId, "firme.json")) {
    const postojece = izlaz.citajJson(runId, "firme.json");
    if (Array.isArray(postojece) && postojece.length > 0) {
      throw new Error(
        `out/${runId}/ već ima popunjen firme.json (${postojece.length} firmi). ` +
          "Dodaj --force da svesno prepišeš, ili --run <nov-id> za nov folder.",
      );
    }
  }

  const stanje = {
    runId,
    verzijaSkilla: VERZIJA,
    pokrenutAt,
    rezim: "obogati",
    izvorFajl: naziv,
    grad: { kanonski: grad, alijasi: [] },
    nisa: {
      slug: nisaSlug,
      naziv: nisa ? nisa.naziv : nisaUnos,
      upiti: [],
      opis: nisa ? nisa.opis : null,
      sifreDelatnosti: nisa ? nisa.sifreDelatnosti : [],
    },
    brojTrazen: firme.length,
    filterSajt: "svejedno",
    places: { pozivi: 0, kandidata: firme.length, vanGrada: 0, zatvoreni: 0, iscrpljeno: false },
    nedostupniIzvori: [],
    koraci: { ucitaj: pokrenutAt },
  };

  izlaz.upisiJson(runId, "run.json", stanje);
  izlaz.upisiJson(runId, "firme.json", firme);
  // Snimak stanja posle učitavanja — `send` po njemu zna šta je Claude dopunio.
  izlaz.upisiJson(runId, "firme.ulaz.json", firme);

  ispisi(`Run: ${runId}  (režim: obogati)`);
  ispisi(`Fajl: ${naziv}${list ? ` · list „${list}"` : ""}`);
  ispisi(`Grad (najčešći u tabeli): ${grad}  ·  niša: ${nisaSlug}`);
  ispisi("");
  ispisi(`Firmi u fajlu: ${izvestaj.redova}${serija ? ` · ova serija: ${firme.length} (redovi ${od}–${doK})` : ""}.`);
  ispisi(`  sa osobom iz tabele: ${izvestaj.saOsobom}`);
  ispisi(`  sa CompanyWall linkom: ${izvestaj.saCompanyWall}`);
  ispisi(`  sa telefonom: ${izvestaj.saTelefonom}`);
  if (izvestaj.preskoceniBezNaziva.length > 0) {
    ispisi(
      `  UPOZORENJE: ${izvestaj.preskoceniBezNaziva.length} redova bez naziva je preskočeno (redovi: ${izvestaj.preskoceniBezNaziva.join(", ")}).`,
    );
  }
  ispisi("");
  ispisi(
    `Sada za svaku firmu uradi ISTO što i u discover toku (sajt sa tri izvora, ` +
      `CompanyWall/APR, 011info, profili) i dopuni out/${runId}/firme.json. ` +
      `Vrednosti iz tabele PROVERI i upiši dokaze; ništa iz tabele ne briši.`,
  );
  ispisi(
    `Zatim: check-site → geocode → score → send --run ${runId} ` +
      `(send šalje samo redove sa promenom; --sve šalje sve).`,
  );
  return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// check-site
// ─────────────────────────────────────────────────────────────────────────────

function domenOd(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "(neispravan URL)";
  }
}

async function komandaCheckSite(args) {
  const runId = trazenArgument(args, "run");
  const { ENIGMA_CONTACT_EMAIL } = env.trazi(["ENIGMA_CONTACT_EMAIL"]);
  const stanje = izlaz.citajJson(runId, "run.json");
  const firme = izlaz.citajJson(runId, "firme.json");

  if (!Array.isArray(firme) || firme.length === 0) {
    throw new Error(`out/${runId}/firme.json je prazan. Prvo popuni firme, pa proveravaj sajtove.`);
  }

  const ua = userAgent(ENIGMA_CONTACT_EMAIL, VERZIJA);
  const brojac = {};
  let proverenih = 0;
  let tvrdiDaImaBezUrl = 0;

  for (const firma of firme) {
    const sajt = typeof firma.sajt === "string" ? firma.sajt.trim() : "";
    if (!sajt) {
      if (firma.imaSajt === "da") tvrdiDaImaBezUrl += 1;
      // Firma bez sajta nema šta da se proverava. `imaSajt` je Claudeova
      // tvrdnja iz §3.4 i ovde se NE dira — „nema sajt" se ne izvodi iz toga
      // što polje `sajt` nije popunjeno.
      continue;
    }

    const rezultat = await proveriSajt(sajt, { userAgent: ua });
    firma.sajtStatus = rezultat.sajtStatus;
    firma.sajtNapomena = rezultat.sajtNapomena;
    firma.sajtProverenAt = rezultat.sajtProverenAt;
    if (typeof rezultat.sajtHttps === "boolean") firma.sajtHttps = rezultat.sajtHttps;

    brojac[rezultat.sajtStatus] = (brojac[rezultat.sajtStatus] ?? 0) + 1;
    proverenih += 1;
    ispisi(`  ${domenOd(sajt)} → ${rezultat.sajtStatus} (${rezultat.sajtNapomena})`);
  }

  stanje.koraci = { ...stanje.koraci, checkSite: Date.now() };
  izlaz.upisiJson(runId, "run.json", stanje);
  izlaz.upisiJson(runId, "firme.json", firme);

  ispisi("");
  ispisi(`Provereno sajtova: ${proverenih} od ${firme.length} firmi.`);
  for (const [status, koliko] of Object.entries(brojac).sort()) {
    ispisi(`  ${status}: ${koliko}`);
  }
  const bezSajta = firme.length - proverenih;
  if (bezSajta > 0) ispisi(`  bez upisanog sajta (nije proveravano): ${bezSajta}`);
  if (tvrdiDaImaBezUrl > 0) {
    // `imaSajt: "da"` bez URL-a je protivrečnost u firme.json: tvrdnja da sajt
    // postoji, a nema šta da se proveri ni da se pošalje kao `sajt`.
    ispisi(
      `  PAŽNJA: ${tvrdiDaImaBezUrl} firmi ima „imaSajt: da" bez upisanog polja „sajt" — dopuni URL pa ponovi.`,
    );
  }
  return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// geocode
// ─────────────────────────────────────────────────────────────────────────────

function adresaZaGeokodiranje(firma) {
  if (typeof firma.adresaZaGeokodiranje === "string" && firma.adresaZaGeokodiranje.trim()) {
    return firma.adresaZaGeokodiranje.trim();
  }
  const delovi = [firma.ulica, firma.opstina, firma.grad, "Srbija"]
    .map((d) => (typeof d === "string" ? d.trim() : ""))
    .filter(Boolean);
  // Bez ulice adresa pokazuje na centar grada — to nije koordinata firme.
  if (!firma.ulica) return "";
  return delovi.join(", ");
}

async function komandaGeocode(args) {
  const runId = trazenArgument(args, "run");
  const { ENIGMA_CONTACT_EMAIL } = env.trazi(["ENIGMA_CONTACT_EMAIL"]);
  const stanje = izlaz.citajJson(runId, "run.json");
  const firme = izlaz.citajJson(runId, "firme.json");

  if (!Array.isArray(firme) || firme.length === 0) {
    throw new Error(`out/${runId}/firme.json je prazan.`);
  }

  const ua = userAgent(ENIGMA_CONTACT_EMAIL, VERZIJA);
  let nadjeno = 0;
  let bezAdrese = 0;
  let bezRezultata = 0;
  let pao = false;

  for (let i = 0; i < firme.length; i += 1) {
    const firma = firme[i];
    if (firma.koordinate) continue;

    const adresa = adresaZaGeokodiranje(firma);
    if (!adresa) {
      bezAdrese += 1;
      continue;
    }

    try {
      const tacka = await geokodiraj(adresa, { userAgent: ua });
      if (tacka) {
        firma.koordinate = { lat: tacka.lat, lng: tacka.lng, izvor: "nominatim" };
        nadjeno += 1;
        ispisi(`  firma ${i + 1}: koordinate nađene`);
      } else {
        bezRezultata += 1;
        ispisi(`  firma ${i + 1}: Nominatim nema pogodak za tu adresu`);
      }
    } catch (err) {
      // Pad servisa NIJE „firma nema koordinate" (§0 pravilo 3) — upisuje se
      // kao nedostupan izvor i vidi se iznad tabele u pregledu uvoza.
      pao = true;
      ispisi(`  firma ${i + 1}: Nominatim nedostupan (${err.message})`);
    }

    await sacekaj(RAZMAK_MS);
  }

  stanje.nedostupniIzvori = stanje.nedostupniIzvori ?? [];
  if (pao && !stanje.nedostupniIzvori.includes("Nominatim (geokodiranje)")) {
    stanje.nedostupniIzvori.push("Nominatim (geokodiranje)");
  }
  stanje.koraci = { ...stanje.koraci, geocode: Date.now() };
  izlaz.upisiJson(runId, "run.json", stanje);
  izlaz.upisiJson(runId, "firme.json", firme);

  const saKoordinatama = firme.filter((f) => f.koordinate).length;
  ispisi("");
  ispisi(`Koordinate: ${saKoordinatama} od ${firme.length} firmi (novih: ${nadjeno}).`);
  if (bezAdrese > 0) ispisi(`  bez ulice, nije ni traženo: ${bezAdrese}`);
  if (bezRezultata > 0) ispisi(`  adresa poslata, Nominatim nema pogodak: ${bezRezultata}`);
  ispisi("Podaci o koordinatama: © OpenStreetMap contributors.");
  return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// score
// ─────────────────────────────────────────────────────────────────────────────

function komandaScore(args) {
  const runId = trazenArgument(args, "run");
  const stanje = izlaz.citajJson(runId, "run.json");
  const firme = izlaz.citajJson(runId, "firme.json");

  if (!Array.isArray(firme) || firme.length === 0) {
    throw new Error(`out/${runId}/firme.json je prazan.`);
  }

  const zbir = { osoba: 0, saTelefonom: 0, saProcenom: 0, bezProcene: 0, visoko: 0, srednje: 0, nisko: 0 };

  for (const firma of firme) {
    if (!Array.isArray(firma.osobe) || firma.osobe.length === 0) continue;

    firma.osobe = oceniOsobe(firma.osobe);

    for (const osoba of firma.osobe) {
      zbir.osoba += 1;
      if (osoba.telefon) zbir.saTelefonom += 1;
      if (typeof osoba.verovatnoca === "number") {
        zbir.saProcenom += 1;
        zbir[traka(osoba.verovatnoca)] += 1;
      } else if (osoba.nijeMoguceProceniti === true) {
        zbir.bezProcene += 1;
      }
    }
  }

  stanje.koraci = { ...stanje.koraci, score: Date.now() };
  izlaz.upisiJson(runId, "run.json", stanje);
  izlaz.upisiJson(runId, "firme.json", firme);

  ispisi(`Osoba: ${zbir.osoba} (sa telefonom: ${zbir.saTelefonom}).`);
  ispisi(`  sa procenom: ${zbir.saProcenom} — visoko ${zbir.visoko}, srednje ${zbir.srednje}, nisko ${zbir.nisko}`);
  ispisi(`  „nije moguće proceniti": ${zbir.bezProcene}`);
  ispisi("");
  ispisi("Procena je pravilo iz plana §6 nad dokazima koje si upisao, ne procena modela.");
  return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// send
// ─────────────────────────────────────────────────────────────────────────────

/** Polja koja ingest šema poznaje. Sve ostalo iz `firme.json` je radni materijal. */
const POLJA_REDA = [
  "nazivFirme",
  "ulica",
  "opstina",
  "grad",
  "telefon",
  "telefonNapomena",
  "email",
  "sajt",
  "imeOsobe",
  "uloga",
  "ocena",
  "companyWallUrl",
  "companyWallTacnost",
  "pib",
  "maticniBroj",
  "sifraDelatnosti",
  "napomena",
  "izvori",
  "derivedSignals",
  "derivedFields",
  "placeId",
  "nisa",
  "imaSajt",
  "imaSajtNapomena",
  "sajtStatus",
  "sajtHttps",
  "sajtProverenAt",
  "sajtNapomena",
  "koordinate",
  "platforme",
  "osobe",
  "izvestajSkilla",
  // GL8: ID postojeće firme iz izvoza aplikacije (režim „obogati").
  "postojecaFirmaId",
];

const POLJA_OSOBE = [
  "ime",
  "uloga",
  "ulogaIzvor",
  "telefon",
  "telefonSourceUrl",
  "verovatnoca",
  "nijeMoguceProceniti",
  "obrazlozenje",
  "rang",
];

/** Prazan string bi pao na `neprazan` u šemi; odsustvo polja je ispravan zapis
 *  za „ne znamo" (§0 pravilo 1). */
function ociscen(vrednost) {
  if (typeof vrednost === "string") {
    const t = vrednost.trim();
    return t.length > 0 ? t : undefined;
  }
  return vrednost === null ? undefined : vrednost;
}

function uzmi(izvor, kljucevi) {
  const cilj = {};
  for (const kljuc of kljucevi) {
    const vrednost = ociscen(izvor[kljuc]);
    if (vrednost !== undefined) cilj[kljuc] = vrednost;
  }
  return cilj;
}

function napraviRed(firma, nisaSlug) {
  const red = uzmi(firma, POLJA_REDA);

  red.nisa = red.nisa ?? nisaSlug;
  red.izvori = Array.isArray(firma.izvori) ? firma.izvori.map(ociscen).filter(Boolean) : [];
  red.derivedSignals = [];

  if (Array.isArray(firma.platforme)) {
    red.platforme = firma.platforme
      .map((p) => uzmi(p, ["vrsta", "url", "sourceUrl"]))
      .filter((p) => p.vrsta && p.url && p.sourceUrl);
    if (red.platforme.length === 0) delete red.platforme;
  }

  if (Array.isArray(firma.osobe)) {
    // `dokazi` su ulaz za skor i ostaju na disku — u telo ide samo rezultat.
    red.osobe = firma.osobe.map((o) => uzmi(o, POLJA_OSOBE));
    if (red.osobe.length === 0) delete red.osobe;
  }

  if (firma.ocena && typeof firma.ocena === "object") {
    const ocena = uzmi(firma.ocena, ["vrednost", "skala", "brojRecenzija", "izvor"]);
    if (Object.keys(ocena).length > 0) red.ocena = ocena;
    else delete red.ocena;
  }

  return red;
}

function rezimeKontakata(redovi) {
  let telefona = 0;
  let saProcenom = 0;
  let mejlova = 0;
  let platformi = 0;
  let bezKontakta = 0;

  for (const red of redovi) {
    const osobe = red.osobe ?? [];
    const imaTelefon = Boolean(red.telefon) || osobe.some((o) => o.telefon);
    if (red.telefon) telefona += 1;
    telefona += osobe.filter((o) => o.telefon).length;
    saProcenom += osobe.filter((o) => typeof o.verovatnoca === "number").length;
    if (red.email) mejlova += 1;
    platformi += (red.platforme ?? []).length;
    // „Bez kontakta" (§10.3 k. 4) znači da nema nijednog puta do firme: ni
    // telefona, ni mejla, ni profila, ni sajta. Firma i dalje ostaje u uvozu —
    // ime, adresa i koordinate su lead za obilazak.
    const imaPut =
      imaTelefon || Boolean(red.email) || Boolean(red.sajt) || (red.platforme ?? []).length > 0;
    if (!imaPut) bezKontakta += 1;
  }

  return { telefona, saProcenom, mejlova, platformi, bezKontakta };
}

async function komandaSend(args) {
  const runId = trazenArgument(args, "run");
  const suvo = args["dry-run"] === true || args["dry-run"] === "true";

  const stanje = izlaz.citajJson(runId, "run.json");
  const firme = izlaz.citajJson(runId, "firme.json");

  if (!Array.isArray(firme)) throw new Error(`out/${runId}/firme.json nije lista.`);

  // Star ili ručno pravljen `run.json` ne sme da obori komandu na `undefined`.
  stanje.places = stanje.places ?? {};
  stanje.nedostupniIzvori = stanje.nedostupniIzvori ?? [];

  // Režim „obogati" (GL8 §3): šalju se SAMO redovi sa bar jednom novom ili
  // promenjenom vrednošću u odnosu na snimak posle `ucitaj` (`firme.ulaz.json`).
  // `--sve` šalje sve. Red bez promene se ne šalje — nema šta da doda firmi.
  const jeObogati = stanje.rezim === "obogati";
  const posaljiSve = args.sve === true || args.sve === "true";
  let firmeZaSlanje = firme;
  let bezPromene = 0;
  if (jeObogati && !posaljiSve) {
    let ulaz = [];
    try {
      ulaz = izlaz.citajJson(runId, "firme.ulaz.json");
    } catch {
      ulaz = [];
    }
    const razlika = promenjeneFirme(Array.isArray(ulaz) ? ulaz : [], firme);
    firmeZaSlanje = razlika.promenjeni;
    bezPromene = razlika.bezPromene;
  }

  // `rang` upisuje `score`. Bez njega bi validacija pala na putanji koja ne
  // kaže šta je uzrok — ovo kaže. Proverava se samo ono što se stvarno šalje.
  const bezRanga = firmeZaSlanje.some((f) =>
    (f.osobe ?? []).some((o) => o.rang !== 1 && o.rang !== 2 && o.rang !== 3),
  );
  if (bezRanga) {
    throw new Error(
      `Bar jedna osoba nema rang. Pokreni prvo: node run.mjs score --run ${runId}`,
    );
  }

  // Prazno u režimu „obogati" nije greška: nijedan red nije promenjen.
  if (jeObogati && !posaljiSve && firmeZaSlanje.length === 0 && firme.length > 0) {
    ispisi(`Nijedna firma nema novu ili promenjenu vrednost (bez promene: ${bezPromene}).`);
    ispisi("Ništa se ne šalje. Za slanje svih redova bez obzira na promenu dodaj --sve.");
    return 0;
  }

  const redovi = firmeZaSlanje.map((firma) => napraviRed(firma, stanje.nisa.slug));

  // 0 firmi nije greška i nema šta da se šalje: prazan uvoz ne sme da napravi
  // red u istoriji (GL1, zod `redovi.min(1)`).
  if (redovi.length === 0) {
    ispisi(`0 od ${stanje.brojTrazen} firmi.`);
    ispisi(
      stanje.places.iscrpljeno
        ? `Places je iscrpeo grad „${stanje.grad.kanonski}" za nišu „${stanje.nisa.slug}" — nema šta da se pošalje.`
        : "Nijedna firma nije upisana u firme.json — pretraga je našla kandidate, ali nijedan nije obrađen.",
    );
    return 0;
  }

  const nedostupni = new Set(stanje.nedostupniIzvori ?? []);
  for (const firma of firme) {
    for (const izvor of firma.nedostupniIzvori ?? []) nedostupni.add(izvor);
  }

  const neobradjeni = Math.max(0, (stanje.places.kandidata ?? 0) - redovi.length);
  const iscrpljen = redovi.length < stanje.brojTrazen && Boolean(stanje.places.iscrpljeno);

  const napomene = [];
  if (!jeObogati && redovi.length < stanje.brojTrazen && !iscrpljen) {
    napomene.push(
      `Poslato ${redovi.length} od ${stanje.brojTrazen} traženih; Places nije iscrpljen, ` +
        `neobrađenih kandidata: ${neobradjeni}.`,
    );
  }
  if (jeObogati && bezPromene > 0) {
    napomene.push(`Bez promene (nije poslato): ${bezPromene}.`);
  }
  if (stanje.nisa.opis) {
    // Opis niše sada putuje sa uvozom (GL6 §4) i upisuje se pri „Primeni",
    // samo ako niša još nema opis (kao opisAutor „claude"). Lokalna kopija
    // ostaje u nisa-opis.txt.
    napomene.push(
      `Opis niše „${stanje.nisa.naziv}" putuje sa uvozom i upisuje se u nišu pri „Primeni" ` +
        `(samo ako niša još nema opis). Kopija: tools/generate-leads/out/${runId}/nisa-opis.txt.`,
    );
  }

  const telo = {
    verzija: 1,
    upit: {
      grad: stanje.grad.kanonski,
      nisa: stanje.nisa.slug,
      brojTrazen: stanje.brojTrazen,
      filterSajt: stanje.filterSajt,
      // Opis niše putuje sa uvozom (GL6 §4). Granica šeme je 1200 znakova.
      ...(stanje.nisa.opis
        ? { nisaOpis: stanje.nisa.opis.trim().slice(0, 1200) }
        : {}),
      // Režim „obogati" (GL8 §3): aplikacija po ovome crta bedževe „+N polja"
      // i „sukob" u pregledu uvoza i pravi naziv „obogati · <fajl>".
      ...(stanje.rezim ? { rezim: stanje.rezim } : {}),
      ...(stanje.izvorFajl ? { izvorFajl: stanje.izvorFajl } : {}),
    },
    izvor: {
      skill: "generate-leads",
      verzijaSkilla: stanje.verzijaSkilla ?? VERZIJA,
      pokrenutAt: stanje.pokrenutAt,
    },
    redovi,
    izvestaj: {
      nadjeno: redovi.length,
      trazeno: stanje.brojTrazen,
      iscrpljen,
      placesPozivi: stanje.places.pozivi ?? 0,
      nedostupniIzvori: [...nedostupni],
      ...(napomene.length > 0 ? { napomena: napomene.join(" ") } : {}),
    },
  };

  const provera = validirajTelo(telo);
  if (!provera.ok) {
    const putanja = izlaz.upisiJson(runId, "payload.json", telo);
    ispisiGresku("Telo ne odgovara ingest šemi. Aplikacija bi vratila 400 sa istim spiskom:");
    for (const polje of provera.polja) ispisiGresku(`  ${polje}`);
    ispisiGresku("");
    ispisiGresku(`Ništa nije poslato. Telo je sačuvano: ${putanja}`);
    ispisiGresku("Vrednosti se namerno ne prikazuju — popravi polja u firme.json po putanjama iznad.");
    return 1;
  }

  if (stanje.nisa.opis) {
    izlaz.upisiTekst(
      runId,
      "nisa-opis.txt",
      `${stanje.nisa.naziv} (${stanje.nisa.slug})\n\n${stanje.nisa.opis}\n`,
    );
  }

  const kontakti = rezimeKontakata(redovi);

  if (suvo) {
    const putanja = izlaz.upisiJson(runId, "payload.json", telo);
    ispisi(`Proba (--dry-run). Ništa nije poslato.`);
    ispisi(`Telo: ${putanja}`);
    ispisi("");
    ispisiRezime(telo, kontakti, stanje);
    ispisi("");
    ispisi("kandidati.json je i dalje tu — briše se tek posle stvarnog slanja.");
    return 0;
  }

  const { ENIGMA_INGEST_URL, ENIGMA_INGEST_TOKEN } = env.trazi([
    "ENIGMA_INGEST_URL",
    "ENIGMA_INGEST_TOKEN",
  ]);

  const odgovor = await posalji({
    url: ENIGMA_INGEST_URL,
    token: ENIGMA_INGEST_TOKEN,
    telo,
  });

  if (!odgovor.ok) {
    // §10.3 k. 7: run ne sme da propadne. JSON ostaje na disku, pa se slanje
    // ponavlja bez ijednog novog Places poziva.
    const putanja = izlaz.upisiJson(runId, "payload.json", telo);
    ispisiGresku(`Slanje nije uspelo (status ${odgovor.status || "bez odgovora"}).`);
    ispisiGresku(objasniStatus(odgovor.status));
    if (Array.isArray(odgovor.odgovor?.polja) && odgovor.odgovor.polja.length > 0) {
      ispisiGresku("Polja koja aplikacija odbija:");
      for (const polje of odgovor.odgovor.polja) ispisiGresku(`  ${polje}`);
    }
    ispisiGresku(`Telo je sačuvano: ${putanja}`);
    return 1;
  }

  stanje.koraci = { ...stanje.koraci, send: Date.now() };
  stanje.importId = odgovor.odgovor?.importId ?? null;
  izlaz.upisiJson(runId, "run.json", stanje);

  // §3, §O3: Places podaci ne žive posle runa.
  const obrisano = izlaz.obrisiKandidate(runId);

  ispisiRezime(telo, kontakti, stanje);
  ispisi("");
  ispisi(`Otvori: ${odgovor.odgovor?.url ?? "(aplikacija nije vratila URL)"}`);
  ispisi(
    obrisano
      ? "kandidati.json je obrisan (Places podaci se ne čuvaju)."
      : "kandidati.json nije postojao — nema šta da se briše.",
  );
  return 0;
}

function ispisiRezime(telo, kontakti, stanje) {
  ispisi(
    `Poslato ${telo.izvestaj.nadjeno} redova (traženo ${telo.izvestaj.trazeno}). ` +
      `Places poziva: ${telo.izvestaj.placesPozivi}.`,
  );
  ispisi(
    `Telefona: ${kontakti.telefona}, sa procenom: ${kontakti.saProcenom}. ` +
      `Mejlova: ${kontakti.mejlova}. Platformi: ${kontakti.platformi}. Bez ikakvog kontakta: ${kontakti.bezKontakta}.`,
  );
  ispisi(
    `Nedostupni izvori: ${
      telo.izvestaj.nedostupniIzvori.length > 0 ? telo.izvestaj.nedostupniIzvori.join(", ") : "nema"
    }.`,
  );
  if (telo.izvestaj.iscrpljen) {
    ispisi(
      `Grad „${stanje.grad.kanonski}" je iscrpljen za ovaj upit — nijedna firma nije dopunjena iz drugog grada.`,
    );
  }
  if (telo.izvestaj.napomena) ispisi(telo.izvestaj.napomena);
}

// ─────────────────────────────────────────────────────────────────────────────
// Ulazna tačka
// ─────────────────────────────────────────────────────────────────────────────

const POMOC = `/generate-leads — deterministički deo (v${VERZIJA})

  node run.mjs proveri-env
  node run.mjs discover --grad "Beograd" --nisa frizeri --broj 25 --sajt nema
  node run.mjs ucitaj   --fajl "tabela.xlsx" --nisa frizeri [--list "Svi lidovi (100)"]
  node run.mjs ucitaj   --izvoz "izvoz.csv"  --nisa frizeri
  node run.mjs check-site --run <run-id>
  node run.mjs geocode   --run <run-id>
  node run.mjs score     --run <run-id>
  node run.mjs send      --run <run-id> [--dry-run] [--sve]
  node run.mjs self-test

Opcije za ucitaj (režim „obogati"):
  --fajl "putanja.xlsx|.csv"   postojeća tabela salona
  --izvoz "izvoz.csv"          CSV „Izvezi" iz aplikacije (nosi company_id)
  --nisa frizeri               niša za upit (tabela je nema)
  --list "Svi lidovi (100)"    tačan list u XLSX-u (podrazumevano prvi)
  --grad "Beograd"             preglasi grad (podrazumevano najčešći iz tabele)
  --od 1 --do 25               rad u serijama; svaka serija je svoj run-id

Opcije za discover:
  --grad "Zemun|Beograd"   prvi je kanonski naziv, ostali se prihvataju u adresi
  --sajt ima|nema|svejedno podrazumevano svejedno
  --upiti "a,b,c"          Places upiti za nišu koje lib/nise.mjs ne poznaje
  --faktor 3               koliko kandidata po traženoj firmi (kvota!)
  --max-strana 3           gornja granica strana po upitu

Radni folder: tools/generate-leads/out/<run-id>/ (nije u gitu).`;

async function glavna() {
  const [, , komanda, ...ostatak] = process.argv;
  const args = parsirajArgumente(ostatak);

  switch (komanda) {
    case "proveri-env":
      return komandaProveriEnv();
    case "discover":
      return await komandaDiscover(args);
    case "ucitaj":
      return await komandaUcitaj(args);
    case "check-site":
      return await komandaCheckSite(args);
    case "geocode":
      return await komandaGeocode(args);
    case "score":
      return komandaScore(args);
    case "send":
      return await komandaSend(args);
    case "self-test":
      return await pokreniSelfTest({ strogo: args.strogo === true });
    case "--pomoc":
    case "-h":
    case "--help":
    case undefined:
      ispisi(POMOC);
      return komanda === undefined ? 1 : 0;
    default:
      ispisiGresku(`Nepoznata komanda: ${komanda}\n`);
      ispisiGresku(POMOC);
      return 1;
  }
}

glavna()
  .then((kod) => {
    process.exitCode = kod ?? 0;
  })
  .catch((err) => {
    // Greška skripte NIKAD ne sme da liči na prazan rezultat (§0 pravilo 3).
    ispisiGresku("");
    ispisiGresku(`NEUSPEH: ${err.message}`);
    process.exitCode = 1;
  });
