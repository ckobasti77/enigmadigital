/**
 * ============================================================================
 * ČITANJE POSTOJEĆE TABELE / IZVOZA (režim „obogati", GL8, plan §1, §2)
 * ============================================================================
 *
 * Drugi ulaz u skill: umesto Placesa, kreće od redova koje Jovan već ima —
 * XLSX/CSV tabele salona ili „Izvezi CSV" iz same aplikacije. Rezultat je
 * `firme.json` u ISTOM obliku koji Claude popunjava u `discover` toku, pa dalji
 * tok (check-site, geocode, score, send) ostaje nepromenjen.
 *
 * Mapiranje kolona je PRENETO iz aplikacije (`convex/lib/leadImportParse.ts`),
 * ne izmišljeno: isti sinonimi zaglavlja, isto razlaganje `Lokacija` po zarezu,
 * isti razdelnik ocene. Aplikacija tu logiku ne može da uveze ovde (njeni
 * relativni `.ts` uvozi ne prolaze kroz Node koji skida tipove), pa je pravilo
 * prepisano — i `self-test` drži oba pod istim primerima.
 *
 * XLSX se čita paketom `xlsx` koji već postoji u repou (dinamički uvoz — CSV
 * put i `self-test` ne zavise od njega). Nijedna nova zavisnost se ne dodaje.
 *
 * NIŠTA IZ SADRŽAJA SE NE ISPISUJE (§0 pravilo 6): ni telefon, ni ime osobe.
 */

import { basename, extname } from "node:path";
import { readFileSync } from "node:fs";

// ── Beogradske opštine (za razlaganje `Lokacija`, kao u aplikaciji) ───────────
const BEOGRADSKE_OPSTINE = new Set([
  "novi beograd", "zemun", "zvezdara", "vracar", "stari grad", "palilula",
  "vozdovac", "cukarica", "rakovica", "savski venac", "surcin", "grocka",
  "mladenovac", "obrenovac", "lazarevac", "sopot", "barajevo",
]);

const GRADOVI_KAO_GRAD = new Set(["beograd", "novi sad", "nis"]);

/** Isti normalizator zaglavlja kao `leadImportParse.normalizeHeaderToken`. */
function normZaglavlje(token) {
  return String(token ?? "")
    .toLowerCase()
    .replace(/[_\-\s.]+/g, "")
    .replace(/č|ć/g, "c")
    .replace(/š/g, "s")
    .replace(/ž/g, "z")
    .replace(/đ/g, "dj");
}

/**
 * Sinonimi zaglavlja → kanonski ključ. Skup je proširen kanonskim kolonama
 * izvoza aplikacije (`company_id`, `ocena_vrednost`…), da isti parser čita i
 * `--fajl` (Jovanova tabela) i `--izvoz` (CSV iz aplikacije).
 */
function mapKolonu(token) {
  const n = normZaglavlje(token);
  if ([
    "nazivfirme", "imesalona", "salon", "firma", "preduzece", "kompanija",
    "naziv", "companyname", "businessname",
  ].includes(n)) return "nazivFirme";

  if (n === "ocenavrednost") return "ocenaVrednost";
  if (n === "ocenaskala") return "ocenaSkala";
  if (n === "ocenabrojrecenzija" || n === "brojrecenzija") return "ocenaBrojRecenzija";
  if (n === "ocenaizvor") return "ocenaIzvor";
  if (n === "ocena" || n === "rejting" || n === "rating" || n === "recenzije" || n === "stars") return "ocena";

  if (n === "lokacija" || n === "location" || n === "sediste") return "lokacija";
  if (n === "ulica" || n === "street" || n === "adresa" || n === "address") return "ulica";
  if (n === "opstina" || n === "municipality") return "opstina";
  if (n === "grad" || n === "city" || n === "mesto" || n === "town") return "grad";

  if (["telefon", "tel", "phone", "mobilni", "fiksni", "kontakttelefon"].includes(n)) return "telefon";
  if (n === "email" || n === "mejl" || n === "mail") return "email";
  if (["sajt", "site", "website", "web", "url", "link"].includes(n)) return "sajt";

  if (["imeosobe", "kontaktosoba", "osoba", "vlasnikime", "kontakt", "personname"].includes(n)) return "imeOsobe";
  if (["uloga", "pozicija", "funkcija", "role", "position"].includes(n)) return "uloga";

  if (n === "companywallurl" || n === "companywall" || n === "companywalllink") return "companyWallUrl";
  if (n === "pib" || n === "vatnumber" || n === "poreskibroj") return "pib";
  if (n === "maticnibroj" || n === "mb" || n === "registrationnumber") return "maticniBroj";
  if (n === "sifradelatnosti" || n === "delatnost" || n === "activitycode") return "sifraDelatnosti";
  if (["napomenazaprodaju", "napomena", "komentar", "opis", "notes", "note"].includes(n)) return "napomena";
  if (["izvorpodataka", "izvori", "izvor", "sources", "source"].includes(n)) return "izvori";

  // GL8: kolona iz izvoza aplikacije koja nosi ID postojeće firme (plan §2).
  if (n === "companyid" || n === "firmaid" || n === "idfirme") return "postojecaFirmaId";
  return undefined;
}

/**
 * Detekcija reda zaglavlja (plan §1): prvi red (u prvih 15) koji ima ≥ 4
 * popunjene ćelije i bar jednu koja je „Ime"/„Naziv"/„Telefon". Vraća indeks i
 * mapu kolona. Naslovni red iznad zaglavlja (kao „Svi lidovi (100)") se tako
 * preskače sam.
 */
function nadjiZaglavlje(matrica) {
  const doReda = Math.min(matrica.length, 15);
  for (let r = 0; r < doReda; r += 1) {
    const red = matrica[r];
    if (!Array.isArray(red)) continue;
    const popunjene = red.filter((c) => String(c ?? "").trim().length > 0).length;
    if (popunjene < 4) continue;

    const mapa = new Map();
    let imaSidro = false;
    red.forEach((c, i) => {
      const kljuc = mapKolonu(c);
      if (!kljuc) return;
      mapa.set(i, kljuc);
      if (kljuc === "nazivFirme" || kljuc === "telefon") imaSidro = true;
    });
    if (imaSidro && mapa.size >= 3) {
      return { red: r, mapa, kolone: red.map((c) => String(c ?? "").trim()) };
    }
  }
  throw new Error(
    "Ne mogu da nađem red sa zaglavljem (treba bar 4 popunjene ćelije, jedna Ime/Naziv/Telefon). Proveri fajl ili prosledi tačan list preko --list.",
  );
}

/** Ocena iz teksta: „4,8 (120 recenzija)" → {vrednost, brojRecenzija}; „4,8/5" → +skala. */
export function parsirajOcenu(sirovo) {
  if (sirovo === undefined || sirovo === null) return undefined;
  const t = String(sirovo).trim();
  if (!t) return undefined;
  if (/lajk|like|pratilac|follower/i.test(t)) return undefined;

  const saSkalom = t.match(/^(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)/);
  if (saSkalom) {
    const vrednost = parseFloat(saSkalom[1].replace(",", "."));
    const skala = parseFloat(saSkalom[2].replace(",", "."));
    const rec = t.match(/(\d+)\s*(?:rec\.?|recenzij[aei]?|reviews?)/i);
    const o = {};
    if (Number.isFinite(vrednost)) o.vrednost = vrednost;
    if (Number.isFinite(skala)) o.skala = skala;
    if (rec) o.brojRecenzija = parseInt(rec[1], 10);
    return Object.keys(o).length > 0 ? o : undefined;
  }

  const broj = t.match(/^(\d+(?:[.,]\d+)?)/);
  if (!broj) return undefined;
  const vrednost = parseFloat(broj[1].replace(",", "."));
  const rec = t.match(/(\d+)\s*(?:rec\.?|recenzij[aei]?|reviews?)/i);
  const o = {};
  if (Number.isFinite(vrednost)) o.vrednost = vrednost;
  if (rec) o.brojRecenzija = parseInt(rec[1], 10);
  return Object.keys(o).length > 0 ? o : undefined;
}

/** Razlaganje `Lokacija` po zarezu (kao aplikacija): ulica, opština, grad. */
function razloziLokaciju(sirovo) {
  const t = String(sirovo ?? "").replace(/\s*\(\s*proveriti\s+[^)]+\)/gi, "").trim();
  if (!t) return {};
  const delovi = t.split(",").map((d) => d.trim()).filter(Boolean);
  if (delovi.length >= 3) {
    return { ulica: delovi[0], opstina: delovi[1], grad: delovi.slice(2).join(", ") };
  }
  if (delovi.length === 2) {
    const drugi = delovi[1].toLowerCase();
    if (BEOGRADSKE_OPSTINE.has(drugi)) return { ulica: delovi[0], opstina: delovi[1], grad: "Beograd" };
    if (GRADOVI_KAO_GRAD.has(drugi) || drugi === "niš") return { ulica: delovi[0], grad: delovi[1] };
    return { ulica: delovi[0], opstina: delovi[1] };
  }
  const jedini = delovi[0].toLowerCase();
  if (GRADOVI_KAO_GRAD.has(jedini) || jedini === "niš") return { grad: delovi[0] };
  if (BEOGRADSKE_OPSTINE.has(jedini)) return { opstina: delovi[0], grad: "Beograd" };
  return { ulica: delovi[0] };
}

/** CompanyWall URL iz slobodnog teksta „Izvor podataka". */
function izvuciCompanyWall(tekst) {
  const t = String(tekst ?? "");
  const m = t.match(/https?:\/\/[^\s;,]*companywall\.rs[^\s;,]*/i) ||
    t.match(/companywall\.rs\/firma\/[^\s;,]+/i);
  return m ? m[0] : undefined;
}

function jeUrl(tekst) {
  return /^https?:\/\//i.test(String(tekst ?? "").trim());
}

/**
 * Matrica (niz redova, red je niz ćelija) → { firme, izvestaj }.
 *
 * Svaka firma dobija `poreklo: "tabela"` i `izvori` čiji je prvi element
 * `tabela:<naziv fajla>#<red>` — to je poreklo koje aplikacija prikazuje kao
 * „iz tabele". Vrednosti se NE potvrđuju ovde: to radi Claude u toku obogaćivanja.
 */
export function ucitajMatricu(matrica, { izvorFajl } = {}) {
  const { red: redZaglavlja, mapa } = nadjiZaglavlje(matrica);
  const fajl = izvorFajl ?? "tabela";

  const firme = [];
  const preskoceni = [];
  let saOsobom = 0;
  let saCompanyWall = 0;
  let saTelefonom = 0;

  for (let r = redZaglavlja + 1; r < matrica.length; r += 1) {
    const red = matrica[r];
    if (!Array.isArray(red)) continue;
    const redniBroj = r + 1; // 1-indeksiran red u fajlu

    const polja = {};
    for (const [i, kljuc] of mapa.entries()) {
      const v = String(red[i] ?? "").trim();
      if (v) polja[kljuc] = v;
    }

    const popunjenih = Object.keys(polja).length;
    if (popunjenih === 0) continue; // prazan red
    if (!polja.nazivFirme) {
      preskoceni.push(redniBroj);
      continue;
    }

    // Lokacija → ulica/opština/grad (samo ono što nije eksplicitno u kolonama).
    let { ulica, opstina, grad } = polja;
    if (polja.lokacija) {
      const loc = razloziLokaciju(polja.lokacija);
      ulica = ulica ?? loc.ulica;
      opstina = opstina ?? loc.opstina;
      grad = grad ?? loc.grad;
    }

    // Ocena: ili spojena kolona, ili razložene kolone iz izvoza aplikacije.
    let ocena = polja.ocena ? parsirajOcenu(polja.ocena) : undefined;
    if (!ocena && (polja.ocenaVrednost || polja.ocenaBrojRecenzija || polja.ocenaSkala)) {
      const o = {};
      if (polja.ocenaVrednost) {
        const v = parseFloat(polja.ocenaVrednost.replace(",", "."));
        if (Number.isFinite(v)) o.vrednost = v;
      }
      if (polja.ocenaSkala) {
        const s = parseFloat(polja.ocenaSkala.replace(",", "."));
        if (Number.isFinite(s)) o.skala = s;
      }
      if (polja.ocenaBrojRecenzija) {
        const br = parseInt(polja.ocenaBrojRecenzija, 10);
        if (Number.isFinite(br)) o.brojRecenzija = br;
      }
      if (polja.ocenaIzvor) o.izvor = polja.ocenaIzvor;
      if (Object.keys(o).length > 0) ocena = o;
    }

    // Izvor podataka → companyWallUrl (ako je CompanyWall URL) ili u `izvori`.
    const izvori = [`tabela:${fajl}#${redniBroj}`];
    let companyWallUrl = polja.companyWallUrl;
    const izvorTekst = polja.izvori;
    if (izvorTekst) {
      const cw = izvuciCompanyWall(izvorTekst);
      if (cw && !companyWallUrl) companyWallUrl = cw;
      // Razdvoj po ; i , i zadrži ne-URL, ne-companywall tokene kao izvore.
      for (const tok of izvorTekst.split(/[;,]/).map((s) => s.trim()).filter(Boolean)) {
        if (/companywall/i.test(tok)) continue;
        if (jeUrl(tok) || tok.length > 0) izvori.push(tok);
      }
    }

    const firma = {
      nazivFirme: polja.nazivFirme,
      poreklo: "tabela",
      sourceUrl: `tabela:${fajl}#${redniBroj}`,
      izvori: [...new Set(izvori)],
    };
    if (ulica) firma.ulica = ulica;
    if (opstina) firma.opstina = opstina;
    if (grad) firma.grad = grad;
    if (polja.telefon) { firma.telefon = polja.telefon; firma.telefonNapomena = "iz tabele"; saTelefonom += 1; }
    if (polja.email) firma.email = polja.email;
    if (polja.sajt && !/^nema/i.test(polja.sajt)) firma.sajt = polja.sajt;
    if (ocena) firma.ocena = ocena;
    if (companyWallUrl) { firma.companyWallUrl = companyWallUrl; saCompanyWall += 1; }
    if (polja.pib) firma.pib = polja.pib;
    if (polja.maticniBroj) firma.maticniBroj = polja.maticniBroj;
    if (polja.sifraDelatnosti) firma.sifraDelatnosti = polja.sifraDelatnosti;
    if (polja.napomena) firma.napomena = polja.napomena;
    if (polja.postojecaFirmaId) firma.postojecaFirmaId = polja.postojecaFirmaId;

    // Ime_osobe + Pozicija → osoba sa `ulogaIzvor: "tabela"` (plan §1). Uloga
    // koje nema u tabeli je „nepoznato" — ne izmišlja se.
    if (polja.imeOsobe) {
      firma.osobe = [{
        ime: polja.imeOsobe,
        uloga: polja.uloga ?? "nepoznato",
        ulogaIzvor: "tabela",
        rang: 1,
      }];
      saOsobom += 1;
    }

    firme.push(firma);
  }

  return {
    firme,
    izvestaj: {
      redova: firme.length,
      saOsobom,
      saCompanyWall,
      saTelefonom,
      preskoceniBezNaziva: preskoceni,
    },
  };
}

// ── CSV parser (ručno, bez zavisnosti) ────────────────────────────────────────

/** RFC-4180-ish: navodnici, udvojeni navodnici, zarez, CRLF/LF, BOM. */
export function parsirajCsv(tekst) {
  const s = String(tekst).replace(/^﻿/, "");
  const redovi = [];
  let polje = "";
  let red = [];
  let uNavodnicima = false;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (uNavodnicima) {
      if (c === '"') {
        if (s[i + 1] === '"') { polje += '"'; i += 1; }
        else uNavodnicima = false;
      } else polje += c;
      continue;
    }
    if (c === '"') { uNavodnicima = true; continue; }
    if (c === ",") { red.push(polje); polje = ""; continue; }
    if (c === "\n") { red.push(polje); redovi.push(red); red = []; polje = ""; continue; }
    if (c === "\r") continue;
    polje += c;
  }
  if (polje.length > 0 || red.length > 0) { red.push(polje); redovi.push(red); }
  return redovi;
}

/**
 * Čita fajl sa diska (.csv ili .xlsx) i vraća `{ firme, izvestaj }`.
 * Za XLSX se čita SAMO prvi list (ili `list` ako je dat) — ostali listovi u
 * Jovanovoj tabeli su podskupovi (batchevi).
 */
export async function ucitajFajl(putanja, { list } = {}) {
  const fajl = basename(putanja);
  const ext = extname(putanja).toLowerCase();

  let matrica;
  if (ext === ".csv" || ext === ".tsv" || ext === ".txt") {
    matrica = parsirajCsv(readFileSync(putanja, "utf8"));
  } else if (ext === ".xlsx" || ext === ".xls" || ext === ".xlsm") {
    let XLSX;
    try {
      XLSX = await import("xlsx");
    } catch {
      throw new Error(
        "Za .xlsx treba paket xlsx (postoji u repou). Pokreni skill iz repoa, ili prvo sačuvaj tabelu kao .csv i prosledi taj fajl.",
      );
    }
    const wb = XLSX.read(readFileSync(putanja), { type: "buffer" });
    const imeLista = list ?? wb.SheetNames[0];
    const sheet = wb.Sheets[imeLista];
    if (!sheet) {
      throw new Error(`List „${imeLista}" ne postoji u fajlu. Listovi: ${wb.SheetNames.join(", ")}.`);
    }
    matrica = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", blankrows: true });
  } else {
    throw new Error(`Nepodržan tip fajla „${ext}". Podržani su .xlsx i .csv.`);
  }

  return ucitajMatricu(matrica, { izvorFajl: fajl });
}
