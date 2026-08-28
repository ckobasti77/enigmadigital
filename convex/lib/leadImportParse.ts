/**
 * ============================================================================
 * LEAD IMPORT PARSER (§0, §5, §6)
 * ============================================================================
 *
 * Čiste funkcije za parsiranje fajlova sa lidovima (XLSX i CSV).
 * Ne uvozi Convex, bazu podataka niti UI. Ulaz je bafer fajla, izlaz je
 * memorijska struktura sa pripremljenim podacima i izveštajem o parsiranju.
 *
 * Rešava PET ZAMKI iz §5.1:
 * 1. Isti leadovi u više sheetova (detekcija preklapanja po sadržaju).
 * 2. Zaglavlje nije u prvom redu (automatsko pronalaženje reda sa zaglavljem).
 * 3. Redovi-razdelnici unutar podataka (preskakanje uz beleženje u skipped).
 * 4. Rečenica u polju za telefon (preusmeravanje u telefonNapomena).
 * 5. Ocena sa četiri različite skale (razlaganje na vrednost, skalu, broj recenzija i izvor).
 * ============================================================================
 */

import * as XLSX from "xlsx";
import {
  normalizeCompanyName,
  normalizePhoneRs,
  normalizeCompanyWallUrl,
  LEAD_SIGNAL_KINDS,
} from "./leadNormalize";
import { deriveSignalsFromInboundText } from "./leadInboundDerive";

// ── Tipovi podataka ──────────────────────────────────────────────────────────

export interface ParsedLeadRating {
  vrednost?: number;
  skala?: number;
  brojRecenzija?: number;
  izvor?: string;
}

export interface ParsedLeadRow {
  nazivFirme?: string;
  ulica?: string;
  opstina?: string;
  grad?: string;
  telefon?: string;
  telefonNapomena?: string;
  email?: string;
  sajt?: string;
  imeOsobe?: string;
  uloga?: string;
  ocena?: ParsedLeadRating;
  companyWallUrl?: string;
  companyWallTacnost?: "tacno" | "priblizno";
  pib?: string;
  maticniBroj?: string;
  sifraDelatnosti?: string;
  napomena?: string;
  izvori: string[];
  derivedSignals: string[];
  /**
   * Imena polja koja parser NIJE pročitao iz tabele nego ih je ZAKLJUČIO.
   *
   * Jedini slučaj danas: `grad` izveden iz beogradske opštine — iz „Jurija
   * Gagarina 14lj, Novi Beograd" sledi grad „Beograd", što u fajlu ne piše.
   *
   * Postoji zato što je LM4 do sada POGAĐAO šta je izvedeno, heuristikom
   * `opstina && grad === "Beograd"`. Poreklo podatka ne sme da bude nagađanje:
   * onaj ko je zaključio mora i da kaže da je zaključio. `leadFieldProvenance`
   * ovim poljima daje `confidence: "priblizno"`, nikada `"tacno"`.
   */
  derivedFields: string[];
}

export interface ParsedSheetInfo {
  name: string;
  rowCount: number;
  looksLikeDuplicateOf?: string;
}

export interface SkippedRowInfo {
  rowIndex: number;
  razlog: string;
}

export type SheetSelectionReason =
  | "trazen"
  | "jedini"
  | "najveci_bez_preklapanja"
  | "najveci_iako_sve_preklapa";

export interface LeadWorkbookParseResult {
  sheets: ParsedSheetInfo[];
  /**
   * Naziv lista iz kojeg su `rows` zaista pročitani.
   *
   * Postoji zato što je UI ranije PONAVLJAO pravilo izbora lista da bi
   * pogodio šta je parser izabrao. Dva mesta sa istim pravilom znače da
   * jedno pre ili kasnije počne da laže, a `leadImportRows.sourceSheet`
   * je poreklo podatka — poreklo se ne pogađa. Ko je izabrao, taj i kaže.
   */
  selectedSheet: string;
  /** Zašto je baš taj list izabran — UI ovo ispisuje doslovno. */
  selectionReason: SheetSelectionReason;
  headerRowIndex: number;
  columns: string[];
  rows: ParsedLeadRow[];
  skipped: SkippedRowInfo[];
  warnings: string[];
}

export interface ParseLeadWorkbookOptions {
  fileName?: string;
  sheetName?: string;
}

// ── Poznate beogradske opštine za razlaganje lokacije ────────────────────────

const BEOGRADSKE_OPSTINE = new Set([
  "novi beograd",
  "zemun",
  "zvezdara",
  "vracar",
  "vračar",
  "stari grad",
  "palilula",
  "vozdovac",
  "voždovac",
  "cukarica",
  "čukarica",
  "rakovica",
  "savski venac",
  "surcin",
  "surčin",
  "grocka",
  "mladenovac",
  "obrenovac",
  "lazarevac",
  "sopot",
  "barajevo",
]);

// ── 1. Parsiranje ocena (§5.1 zamka 5) ───────────────────────────────────────

/**
 * Parsira sirovi tekst ocene u strukturiran objekat:
 * `{ vrednost?, skala?, brojRecenzija?, izvor? }`.
 *
 * Pravila:
 * - `5.0 (Google, 53 rec.)`        -> 5.0 / skala 5 / 53 / google
 * - `9.7/10 (SrediMe, 133 rec.)`   -> 9.7 / skala 10 / 133 / sredime
 * - `9.4/10 (SrediMe, 143 rec.)`   -> 9.4 / skala 10 / 143 / sredime
 * - `Na 011info`                   -> SVE prazno, ali `izvor: "011info"`
 * - `468 FB lajkova`               -> undefined (ovo NIJE ocena)
 *
 * KRITIČNO PRAVILO (§0, §5.1):
 * Kad skala nije poznata, `vrednost` se NE SME vratiti sama — broj bez skale
 * nema značenje i 9.4/10 bi izgledalo bolje od 5.0/5.
 */
export function parseRating(raw?: string | null): ParsedLeadRating | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  // 1. Provera za lajkove / pratioce — ovo NIJE ocena
  if (/lajk|like|pratilac|followers/i.test(trimmed)) {
    return undefined;
  }

  // 2. Provera za tekstualne izvore bez brojčane ocene (npr. "Na 011info")
  if (/^(?:na\s+)?011\s*info/i.test(trimmed)) {
    return { izvor: "011info" };
  }
  if (/^(?:na\s+)?(?:google(?:\s*maps)?|gmaps)/i.test(trimmed) && !/\d/.test(trimmed)) {
    return { izvor: "google" };
  }
  if (/^(?:na\s+)?sredime/i.test(trimmed) && !/\d/.test(trimmed)) {
    return { izvor: "sredime" };
  }

  // 3. Eksplicitna skala: npr. "9.7/10 (SrediMe, 133 rec.)" ili "4.8/5"
  const explicitScaleMatch = trimmed.match(
    /^(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)(?:\s*\(([^)]+)\))?/i,
  );

  if (explicitScaleMatch) {
    const rawVal = parseFloat(explicitScaleMatch[1].replace(",", "."));
    const rawScale = parseFloat(explicitScaleMatch[2].replace(",", "."));
    const bracketContent = explicitScaleMatch[3]?.trim();

    let brojRecenzija: number | undefined;
    let izvor: string | undefined;

    if (bracketContent) {
      const recMatch = bracketContent.match(/(\d+)\s*(?:rec\.?|recenzij[aei]?|reviews?)/i);
      if (recMatch) {
        brojRecenzija = parseInt(recMatch[1], 10);
      }

      if (/google/i.test(bracketContent)) izvor = "google";
      else if (/sredime/i.test(bracketContent)) izvor = "sredime";
      else if (/011\s*info/i.test(bracketContent)) izvor = "011info";
      else if (/facebook|fb/i.test(bracketContent)) izvor = "facebook";
      else if (/yandex/i.test(bracketContent)) izvor = "yandex";
    }

    return {
      vrednost: isNaN(rawVal) ? undefined : rawVal,
      skala: isNaN(rawScale) ? undefined : rawScale,
      brojRecenzija,
      izvor,
    };
  }

  // 4. Implicitna skala sa poznatim izvorom: npr. "5.0 (Google, 53 rec.)"
  const implicitSourceMatch = trimmed.match(
    /^(\d+(?:[.,]\d+)?)\s*(?:zvezdic[ae]|stars?)?\s*\(([^)]+)\)/i,
  );

  if (implicitSourceMatch) {
    const rawVal = parseFloat(implicitSourceMatch[1].replace(",", "."));
    const bracketContent = implicitSourceMatch[2].trim();

    let brojRecenzija: number | undefined;
    let izvor: string | undefined;
    let skala: number | undefined;

    const recMatch = bracketContent.match(/(\d+)\s*(?:rec\.?|recenzij[aei]?|reviews?)/i);
    if (recMatch) {
      brojRecenzija = parseInt(recMatch[1], 10);
    }

    if (/google/i.test(bracketContent)) {
      izvor = "google";
      skala = 5;
    } else if (/sredime/i.test(bracketContent)) {
      izvor = "sredime";
      skala = 10;
    } else if (/011\s*info/i.test(bracketContent)) {
      izvor = "011info";
    } else if (/facebook|fb/i.test(bracketContent)) {
      izvor = "facebook";
      skala = 5;
    } else if (/yandex/i.test(bracketContent)) {
      izvor = "yandex";
      skala = 5;
    }

    // Ako skala nije poznata, NE vraćamo vrednost samu za sebe
    if (skala === undefined) {
      return izvor || brojRecenzija !== undefined
        ? { izvor, brojRecenzija }
        : undefined;
    }

    return {
      vrednost: isNaN(rawVal) ? undefined : rawVal,
      skala,
      brojRecenzija,
      izvor,
    };
  }

  return undefined;
}

// ── 2. Razlaganje signala iz napomene (§5.2) ──────────────────────────────────

/**
 * Razlaže vrstu signala iz napomene i drugih metapodataka leada.
 * Vraća ISKLJUČIVO vrednosti koje se nalaze u `LEAD_SIGNAL_KINDS`.
 * Sve što se ne prepoznaje ostaje u napomeni — NE izmišlja se signal.
 */
export function deriveSignalsFromNote(
  napomena?: string,
  extra?: {
    sajt?: string;
    ocena?: ParsedLeadRating;
    izvori?: string[];
  },
): string[] {
  const baseSignals = deriveSignalsFromInboundText(napomena);
  const signals = new Set<string>(baseSignals);

  // Dodatne provere iz strukturiranih kolona (booking provajderi u izvorima, broj recenzija iz ocene)
  if (
    extra?.izvori?.some((izvor) =>
      ["setmore", "dikidi", "fresha", "treatwell"].includes(izvor.toLowerCase()),
    )
  ) {
    signals.add("koristi_third_party_booking");
  }

  if (extra?.ocena?.brojRecenzija !== undefined && extra.ocena.brojRecenzija >= 100) {
    signals.add("visok_broj_recenzija");
  }

  // Filtriraj strogo po LEAD_SIGNAL_KINDS (bez izmišljanja 'ostalo')
  const allowed = new Set<string>(LEAD_SIGNAL_KINDS);
  return Array.from(signals).filter((s) => allowed.has(s));
}

// ── 3. Razlaganje složene kolone Lokacija ─────────────────────────────────────

function parseLocationField(rawLokacija?: string): {
  ulica?: string;
  opstina?: string;
  grad?: string;
  /** Polja koja su ZAKLJUČENA, ne pročitana — vidi `ParsedLeadRow.derivedFields`. */
  derived?: string[];
} {
  if (!rawLokacija) return {};

  let cleaned = rawLokacija.trim();
  if (!cleaned) return {};

  // Ukloni tekstove napomena poput "(proveriti adresu)" ili "(proveriti lokaciju)"
  cleaned = cleaned.replace(/\s*\(\s*proveriti\s+[^)]+\)/gi, "").trim();

  // Ako ima zareze, razdvoj po delovima
  const parts = cleaned.split(",").map((p) => p.trim()).filter(Boolean);

  if (parts.length >= 3) {
    return {
      ulica: parts[0] || undefined,
      opstina: parts[1] || undefined,
      grad: parts.slice(2).join(", ") || undefined,
    };
  }

  if (parts.length === 2) {
    const part0 = parts[0];
    const part1 = parts[1];
    const part1Lower = part1.toLowerCase();

    if (BEOGRADSKE_OPSTINE.has(part1Lower)) {
      return {
        ulica: part0 || undefined,
        opstina: part1 || undefined,
        grad: "Beograd",
        derived: ["grad"],
      };
    }

    if (part1Lower === "beograd" || part1Lower === "novi sad" || part1Lower === "nis" || part1Lower === "niš") {
      return {
        ulica: part0 || undefined,
        grad: part1 || undefined,
      };
    }

    return {
      ulica: part0 || undefined,
      opstina: part1 || undefined,
    };
  }

  if (parts.length === 1) {
    const partLower = parts[0].toLowerCase();
    if (partLower === "beograd" || partLower === "novi sad" || partLower === "nis" || partLower === "niš") {
      return { grad: parts[0] };
    }
    if (BEOGRADSKE_OPSTINE.has(partLower)) {
      return { opstina: parts[0], grad: "Beograd", derived: ["grad"] };
    }
    return { ulica: parts[0] };
  }

  return {};
}

// ── 4. Prepoznavanje i mapiranje kolona zaglavlja ─────────────────────────────

type CanonicalColumnKey =
  | "nazivFirme"
  | "lokacija"
  | "ulica"
  | "opstina"
  | "grad"
  | "telefon"
  | "email"
  | "sajt"
  | "imeOsobe"
  | "uloga"
  | "ocena"
  | "ocenaVrednost"
  | "ocenaSkala"
  | "ocenaBrojRecenzija"
  | "ocenaIzvor"
  | "companyWallUrl"
  | "pib"
  | "maticniBroj"
  | "sifraDelatnosti"
  | "napomena"
  | "izvori";

function normalizeHeaderToken(token: string): string {
  return token
    .toLowerCase()
    .replace(/[_\-\s\.]+/g, "")
    .replace(/č|ć/g, "c")
    .replace(/š/g, "s")
    .replace(/ž/g, "z")
    .replace(/đ/g, "dj");
}

function matchHeaderColumn(token: string): CanonicalColumnKey | undefined {
  const norm = normalizeHeaderToken(token);

  if (
    norm === "nazivfirme" ||
    norm === "imesalona" ||
    norm === "salon" ||
    norm === "firma" ||
    norm === "preduzece" ||
    norm === "kompanija" ||
    norm === "naziv" ||
    norm === "companyname" ||
    norm === "businessname"
  ) {
    return "nazivFirme";
  }

  if (norm === "ocenavrednost" || norm === "ocena") {
    if (norm === "ocenavrednost") return "ocenaVrednost";
    return "ocena";
  }
  if (norm === "ocenaskala") return "ocenaSkala";
  if (norm === "ocenabrojrecenzija" || norm === "brojrecenzija") return "ocenaBrojRecenzija";
  if (norm === "ocenaizvor") return "ocenaIzvor";

  if (
    norm === "rejting" ||
    norm === "rating" ||
    norm === "recenzije" ||
    norm === "stars"
  ) {
    return "ocena";
  }

  if (norm === "lokacija" || norm === "location" || norm === "sediste") {
    return "lokacija";
  }
  if (norm === "ulica" || norm === "street" || norm === "adresa" || norm === "address") {
    return "ulica";
  }
  if (norm === "opstina" || norm === "municipality") {
    return "opstina";
  }
  if (norm === "grad" || norm === "city" || norm === "mesto" || norm === "town") {
    return "grad";
  }

  if (
    norm === "telefon" ||
    norm === "tel" ||
    norm === "phone" ||
    norm === "mobilni" ||
    norm === "fiksni" ||
    norm === "kontakttelefon"
  ) {
    return "telefon";
  }

  if (norm === "email" || norm === "mejl" || norm === "mail") {
    return "email";
  }

  if (norm === "sajt" || norm === "site" || norm === "website" || norm === "web" || norm === "url" || norm === "link") {
    return "sajt";
  }

  if (
    norm === "imeosobe" ||
    norm === "kontaktosoba" ||
    norm === "osoba" ||
    norm === "vlasnikime" ||
    norm === "kontakt" ||
    norm === "personname"
  ) {
    return "imeOsobe";
  }

  if (norm === "uloga" || norm === "pozicija" || norm === "funkcija" || norm === "role" || norm === "position") {
    return "uloga";
  }

  if (
    norm === "companywallurl" ||
    norm === "companywall" ||
    norm === "companywalllink"
  ) {
    return "companyWallUrl";
  }

  if (norm === "pib" || norm === "vatnumber" || norm === "poreskibroj") {
    return "pib";
  }

  if (norm === "maticnibroj" || norm === "mb" || norm === "registrationnumber") {
    return "maticniBroj";
  }

  if (norm === "sifradelatnosti" || norm === "delatnost" || norm === "activitycode") {
    return "sifraDelatnosti";
  }

  if (
    norm === "napomenazaprodaju" ||
    norm === "napomena" ||
    norm === "komentar" ||
    norm === "opis" ||
    norm === "notes" ||
    norm === "note"
  ) {
    return "napomena";
  }

  if (
    norm === "izvorpodataka" ||
    norm === "izvori" ||
    norm === "izvor" ||
    norm === "sources" ||
    norm === "source"
  ) {
    return "izvori";
  }

  return undefined;
}

// ── 5. Pronalaženje reda zaglavlja (§5.1 zamka 2) ────────────────────────────

function findHeaderRow(rows: unknown[][]): {
  headerRowIndex: number;
  columnMap: Map<number, CanonicalColumnKey>;
  rawColumns: string[];
} {
  let bestIndex = -1;
  let bestScore = -1;
  let bestMap = new Map<number, CanonicalColumnKey>();
  let bestRawColumns: string[] = [];

  const maxCheckRows = Math.min(rows.length, 15);

  for (let r = 0; r < maxCheckRows; r++) {
    const row = rows[r];
    if (!Array.isArray(row) || row.length === 0) continue;

    let score = 0;
    let hasNameOrSalon = false;
    const currentMap = new Map<number, CanonicalColumnKey>();
    const currentRawCols: string[] = [];

    for (let c = 0; c < row.length; c++) {
      const cell = String(row[c] ?? "").trim();
      currentRawCols.push(cell);
      if (!cell) continue;

      const matched = matchHeaderColumn(cell);
      if (matched) {
        currentMap.set(c, matched);
        score += 2;
        if (matched === "nazivFirme") {
          hasNameOrSalon = true;
        }
      }
    }

    // Zaglavlje mora imati barem naziv firme/salona i još neku prepoznatu kolonu,
    // ili barem 3 prepoznata koncepta kolona
    if ((hasNameOrSalon && score >= 4) || score >= 6) {
      if (score > bestScore) {
        bestScore = score;
        bestIndex = r;
        bestMap = currentMap;
        bestRawColumns = currentRawCols;
      }
    }
  }

  if (bestIndex === -1 || bestMap.size === 0) {
    throw new Error(
      "Nije moguće pouzdano pronaći red sa zaglavljem u tabeli. Proverite nazive kolona.",
    );
  }

  // Očisti završne prazne kolone iz prikaza
  while (bestRawColumns.length > 0 && !bestRawColumns[bestRawColumns.length - 1]) {
    bestRawColumns.pop();
  }

  return {
    headerRowIndex: bestIndex,
    columnMap: bestMap,
    rawColumns: bestRawColumns,
  };
}

// ── 6. Pomoćne funkcije za čišćenje i izvore ─────────────────────────────────

function parseSources(
  rawIzvori?: string,
  rawCompanyWall?: string,
): {
  izvori: string[];
  cwTacnost?: "tacno" | "priblizno";
  extractedCwUrl?: string;
} {
  const sourcesSet = new Set<string>();
  let cwTacnost: "tacno" | "priblizno" | undefined;
  let extractedCwUrl: string | undefined;

  const combined = [rawIzvori, rawCompanyWall].filter(Boolean).join(" ; ");
  if (!combined.trim()) {
    return { izvori: [] };
  }

  // Provera za aproksimaciju u izvorima (npr. "CompanyWall (aproks.)")
  if (/aproks|pribli[zž]no/i.test(combined)) {
    cwTacnost = "priblizno";
  }

  // Proveri da li se unutra nalazi CompanyWall URL
  const cwMatch = combined.match(/https?:\/\/[^\s;,]+companywall\.rs[^\s;,]*/i) ||
    combined.match(/companywall\.rs\/firma\/[^\s;,]+/i);
  if (cwMatch) {
    extractedCwUrl = cwMatch[0];
    sourcesSet.add("companywall");
  }

  // Razdvoji po tačka-zarezu ili zarezu
  const tokens = combined.split(/[;,]/).map((t) => t.trim()).filter(Boolean);

  for (const token of tokens) {
    const tokenLower = token.toLowerCase();

    if (/companywall/i.test(tokenLower)) {
      sourcesSet.add("companywall");
      if (cwTacnost === undefined) {
        cwTacnost = "tacno";
      }
    } else if (/google(?:\s*maps)?|gmaps/i.test(tokenLower)) {
      sourcesSet.add("google");
    } else if (/sredime/i.test(tokenLower)) {
      sourcesSet.add("sredime");
    } else if (/011\s*info/i.test(tokenLower)) {
      sourcesSet.add("011info");
    } else if (/facebook|fb/i.test(tokenLower)) {
      sourcesSet.add("facebook");
    } else if (/instagram|ig/i.test(tokenLower)) {
      sourcesSet.add("instagram");
    } else if (/apr/i.test(tokenLower)) {
      sourcesSet.add("apr");
    } else if (/setmore/i.test(tokenLower)) {
      sourcesSet.add("setmore");
    } else if (/dikidi/i.test(tokenLower)) {
      sourcesSet.add("dikidi");
    } else if (/fresha/i.test(tokenLower)) {
      sourcesSet.add("fresha");
    } else if (/treatwell/i.test(tokenLower)) {
      sourcesSet.add("treatwell");
    } else if (/yandex/i.test(tokenLower)) {
      sourcesSet.add("yandex");
    } else if (!tokenLower.includes("http") && !tokenLower.includes("aproks")) {
      // Zadrži kanonski jednostavan naziv izvora
      const cleanToken = tokenLower.replace(/[^\w\s-]/g, "").trim();
      if (cleanToken) {
        sourcesSet.add(cleanToken);
      }
    }
  }

  return {
    izvori: Array.from(sourcesSet),
    cwTacnost,
    extractedCwUrl,
  };
}

// ── 7. Parsiranje pojedinačnog reda podataka ──────────────────────────────────

function parseRowData(
  row: unknown[],
  columnMap: Map<number, CanonicalColumnKey>,
  rowIndexDisplay: number,
): {
  parsed?: ParsedLeadRow;
  skipped?: SkippedRowInfo;
} {
  // 1. Provera praznog reda
  const cellStrings = row.map((c) => String(c ?? "").trim());
  const nonEmptyCells = cellStrings.filter(Boolean);

  if (nonEmptyCells.length === 0) {
    return {
      skipped: {
        rowIndex: rowIndexDisplay,
        razlog: "Prazan red",
      },
    };
  }

  // 2. Provera reda-razdelnika (§5.1 zamka 3: samo jedna popunjena ćelija, npr. BATCH 1)
  if (nonEmptyCells.length === 1) {
    const singleVal = nonEmptyCells[0];
    return {
      skipped: {
        rowIndex: rowIndexDisplay,
        razlog: `Red-razdelnik (popunjena samo prva ćelija: "${singleVal}")`,
      },
    };
  }

  // Prikupi vrednosti po kolonama
  const fieldValues: Partial<Record<CanonicalColumnKey, string>> = {};
  for (const [colIdx, colKey] of columnMap.entries()) {
    const rawVal = row[colIdx];
    if (rawVal !== undefined && rawVal !== null) {
      const strVal = String(rawVal).trim();
      if (strVal) {
        fieldValues[colKey] = strVal;
      }
    }
  }

  // 3. Provera naziva firme — obavezno polje leada
  const rawNaziv = fieldValues["nazivFirme"];
  if (!rawNaziv) {
    return {
      skipped: {
        rowIndex: rowIndexDisplay,
        razlog: "Nedostaje naziv firme",
      },
    };
  }

  let nazivFirme = rawNaziv.trim();
  if (
    (nazivFirme.startsWith('"') && nazivFirme.endsWith('"')) ||
    (nazivFirme.startsWith("'") && nazivFirme.endsWith("'"))
  ) {
    nazivFirme = nazivFirme.slice(1, -1).trim();
  }

  // 4. Lokacija (ulica, opstina, grad)
  let ulica = fieldValues["ulica"];
  let opstina = fieldValues["opstina"];
  let grad = fieldValues["grad"];

  // Polja koja su ZAKLJUČENA, ne pročitana. Beleže se ovde a ne pogađaju
  // kasnije, da bi `leadFieldProvenance` mogao da im da nižu pouzdanost.
  const derivedFields: string[] = [];

  if (fieldValues["lokacija"]) {
    const parsedLoc = parseLocationField(fieldValues["lokacija"]);
    if (!ulica && parsedLoc.ulica) ulica = parsedLoc.ulica;
    if (!opstina && parsedLoc.opstina) opstina = parsedLoc.opstina;
    if (!grad && parsedLoc.grad) {
      grad = parsedLoc.grad;
      // Samo ako je grad STVARNO preuzet odavde — ako je kolona `grad` već bila
      // popunjena, vrednost je pročitana i ne sme se označiti kao izvedena.
      if (parsedLoc.derived?.includes("grad")) derivedFields.push("grad");
    }
  }

  // 5. Telefon i telefonNapomena (§5.1 zamka 4)
  let telefon: string | undefined;
  let telefonNapomena: string | undefined;

  const rawPhone = fieldValues["telefon"];
  if (rawPhone) {
    const normalizedPhone = normalizePhoneRs(rawPhone);
    if (normalizedPhone) {
      telefon = normalizedPhone;
    } else {
      // Nije validan broj (npr. "Proveriti na 011info") -> prebaci u telefonNapomena
      const cleanedPhoneNote = rawPhone.trim();
      if (
        cleanedPhoneNote &&
        !["-", "/", "n/a", "na", "null", "none", "nepoznato"].includes(
          cleanedPhoneNote.toLowerCase(),
        )
      ) {
        telefonNapomena = cleanedPhoneNote;
      }
      telefon = undefined;
    }
  }

  // 6. Email i Sajt
  let email = fieldValues["email"]?.toLowerCase();
  if (email && (!email.includes("@") || email === "n/a" || email === "-")) {
    email = undefined;
  }

  let sajt = fieldValues["sajt"];
  if (sajt && (/^nema/i.test(sajt) || sajt === "-" || sajt.toLowerCase() === "n/a")) {
    sajt = undefined;
  }

  // 7. Ime osobe i uloga
  let imeOsobe = fieldValues["imeOsobe"];
  if (imeOsobe && (/^nema/i.test(imeOsobe) || imeOsobe === "-" || imeOsobe.toLowerCase() === "n/a")) {
    imeOsobe = undefined;
  }

  let uloga = fieldValues["uloga"];
  if (uloga && (uloga === "-" || uloga.toLowerCase() === "n/a")) {
    uloga = undefined;
  }

  // 8. Ocena (§5.1 zamka 5 i §6 kanonske kolone)
  let ocena: ParsedLeadRating | undefined;

  if (fieldValues["ocena"]) {
    ocena = parseRating(fieldValues["ocena"]);
  } else if (
    fieldValues["ocenaVrednost"] !== undefined ||
    fieldValues["ocenaSkala"] !== undefined ||
    fieldValues["ocenaBrojRecenzija"] !== undefined ||
    fieldValues["ocenaIzvor"] !== undefined
  ) {
    const rawValStr = fieldValues["ocenaVrednost"];
    const rawScaleStr = fieldValues["ocenaSkala"];
    const rawRecStr = fieldValues["ocenaBrojRecenzija"];
    const rawIzvorStr = fieldValues["ocenaIzvor"];

    const rawVal = rawValStr ? parseFloat(rawValStr.replace(",", ".")) : undefined;
    const rawScale = rawScaleStr ? parseFloat(rawScaleStr.replace(",", ".")) : undefined;
    const brojRecenzija = rawRecStr ? parseInt(rawRecStr, 10) : undefined;
    const izvor = rawIzvorStr ? rawIzvorStr.trim().toLowerCase() : undefined;

    // PRAVILO: ako skala nije poznata, vrednost se NE SME vratiti sama
    if (rawScale !== undefined && rawVal !== undefined && !isNaN(rawVal) && !isNaN(rawScale)) {
      ocena = {
        vrednost: rawVal,
        skala: rawScale,
        brojRecenzija: isNaN(brojRecenzija!) ? undefined : brojRecenzija,
        izvor,
      };
    } else if (izvor || (brojRecenzija !== undefined && !isNaN(brojRecenzija))) {
      ocena = {
        brojRecenzija: isNaN(brojRecenzija!) ? undefined : brojRecenzija,
        izvor,
      };
    }
  }

  // 9. CompanyWall URL, tačnost i izvori
  const sourcesInfo = parseSources(
    fieldValues["izvori"],
    fieldValues["companyWallUrl"],
  );

  let companyWallUrl: string | undefined;
  const rawCw = fieldValues["companyWallUrl"] || sourcesInfo.extractedCwUrl;
  if (rawCw) {
    companyWallUrl = normalizeCompanyWallUrl(rawCw);
  }

  let companyWallTacnost: "tacno" | "priblizno" | undefined = sourcesInfo.cwTacnost;
  if (!companyWallTacnost && companyWallUrl) {
    companyWallTacnost = "tacno";
  }

  // 10. PIB, Matični broj, Šifra delatnosti
  let pib = fieldValues["pib"]?.replace(/\D/g, "");
  if (pib) {
    if (pib.length === 8) {
      // Excel često odbaci vodeću nulu za 9-cifreni PIB
      pib = pib.padStart(9, "0");
    } else if (pib.length !== 9) {
      pib = undefined;
    }
  }

  let maticniBroj = fieldValues["maticniBroj"]?.replace(/\D/g, "");
  if (maticniBroj) {
    if (maticniBroj.length === 7) {
      // Excel često odbaci vodeću nulu za 8-cifreni matični broj
      maticniBroj = maticniBroj.padStart(8, "0");
    } else if (maticniBroj.length !== 8) {
      maticniBroj = undefined;
    }
  }

  const sifraDelatnosti = fieldValues["sifraDelatnosti"]?.trim() || undefined;
  const napomena = fieldValues["napomena"]?.trim() || undefined;

  // 11. Izvedeni signali (derivedSignals)
  const derivedSignals = deriveSignalsFromNote(napomena, {
    sajt,
    ocena,
    izvori: sourcesInfo.izvori,
  });

  const parsedRow: ParsedLeadRow = {
    nazivFirme,
    ulica: ulica || undefined,
    opstina: opstina || undefined,
    grad: grad || undefined,
    telefon,
    telefonNapomena,
    email: email || undefined,
    sajt: sajt || undefined,
    imeOsobe: imeOsobe || undefined,
    uloga: uloga || undefined,
    ocena,
    companyWallUrl,
    companyWallTacnost,
    pib: pib || undefined,
    maticniBroj: maticniBroj || undefined,
    sifraDelatnosti,
    napomena,
    izvori: sourcesInfo.izvori,
    derivedSignals,
    derivedFields,
  };

  return { parsed: parsedRow };
}

// ── 8. Detekcija preklapanja sheetova (§5.1 zamka 1) ──────────────────────────

interface SheetInspection {
  name: string;
  headerRowIndex: number;
  columns: string[];
  rows: ParsedLeadRow[];
  skipped: SkippedRowInfo[];
  identifiers: Set<string>;
}

function inspectSheet(sheet: XLSX.WorkSheet, sheetName: string): SheetInspection {
  const rawRows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    blankrows: true,
  }) as unknown[][];

  if (!rawRows || rawRows.length === 0) {
    return {
      name: sheetName,
      headerRowIndex: -1,
      columns: [],
      rows: [],
      skipped: [],
      identifiers: new Set(),
    };
  }

  let headerInfo: {
    headerRowIndex: number;
    columnMap: Map<number, CanonicalColumnKey>;
    rawColumns: string[];
  };

  try {
    headerInfo = findHeaderRow(rawRows);
  } catch {
    return {
      name: sheetName,
      headerRowIndex: -1,
      columns: [],
      rows: [],
      skipped: [],
      identifiers: new Set(),
    };
  }

  const parsedRows: ParsedLeadRow[] = [];
  const skippedList: SkippedRowInfo[] = [];
  const identifiers = new Set<string>();

  for (let r = headerInfo.headerRowIndex + 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    const { parsed, skipped } = parseRowData(row, headerInfo.columnMap, r + 1);

    if (skipped) {
      skippedList.push(skipped);
    } else if (parsed) {
      parsedRows.push(parsed);
      const nameKey = normalizeCompanyName(parsed.nazivFirme);
      if (nameKey) {
        const fullKey = `${nameKey}|${(parsed.grad ?? "").toLowerCase()}`;
        identifiers.add(fullKey);
      }
    }
  }

  return {
    name: sheetName,
    headerRowIndex: headerInfo.headerRowIndex,
    columns: headerInfo.rawColumns,
    rows: parsedRows,
    skipped: skippedList,
    identifiers,
  };
}

function detectSheetDuplicates(inspections: SheetInspection[]): ParsedSheetInfo[] {
  const result: ParsedSheetInfo[] = [];

  for (let i = 0; i < inspections.length; i++) {
    const curr = inspections[i];
    let looksLikeDuplicateOf: string | undefined;

    if (curr.identifiers.size > 0) {
      for (let j = 0; j < inspections.length; j++) {
        if (i === j) continue;
        const other = inspections[j];
        if (other.identifiers.size === 0) continue;

        // Proveri preklapanje identifikatora
        let matchCount = 0;
        for (const id of curr.identifiers) {
          if (other.identifiers.has(id)) {
            matchCount++;
          }
        }

        const overlapRatio = matchCount / curr.identifiers.size;

        // Ako je >= 80% leadova ovog sheeta sadržano u drugom većem (ili prethodnom istom) sheetu
        if (overlapRatio >= 0.8) {
          if (other.rows.length > curr.rows.length || (other.rows.length === curr.rows.length && j < i)) {
            looksLikeDuplicateOf = other.name;
            break;
          }
        }
      }
    }

    result.push({
      name: curr.name,
      rowCount: curr.rows.length,
      looksLikeDuplicateOf,
    });
  }

  return result;
}

// ── 9. Glavna funkcija za parsiranje radne sveske ─────────────────────────────

function loadWorkbook(input: ArrayBuffer | Uint8Array | Buffer | string): XLSX.WorkBook {
  if (typeof input === "string") {
    return XLSX.read(input, { type: "string", raw: false, codepage: 65001 });
  }
  if (input instanceof Uint8Array || Buffer.isBuffer(input)) {
    return XLSX.read(input, { type: "buffer", raw: false, codepage: 65001 });
  }
  if (input instanceof ArrayBuffer) {
    return XLSX.read(new Uint8Array(input), { type: "array", raw: false, codepage: 65001 });
  }
  throw new Error("Nepodržan tip ulaznog bafera za tabelu.");
}

/**
 * Parsira XLSX ili CSV bafer sa lidovima.
 * Vraća detaljan izveštaj sa svim listovima, detektovanim preklapanjima,
 * preskočenim redovima i normalizovanim redovima leada.
 */
export function parseLeadWorkbook(
  buffer: ArrayBuffer | Uint8Array | Buffer | string,
  opts?: ParseLeadWorkbookOptions,
): LeadWorkbookParseResult {
  const workbook = loadWorkbook(buffer);
  const sheetNames = workbook.SheetNames;

  if (!sheetNames || sheetNames.length === 0) {
    throw new Error("Fajl ne sadrži nijedan list (sheet).");
  }

  // 1. Analiziraj sve listove u radnoj svesci
  const sheetInspections: SheetInspection[] = [];
  for (const sName of sheetNames) {
    const sheet = workbook.Sheets[sName];
    if (sheet) {
      sheetInspections.push(inspectSheet(sheet, sName));
    }
  }

  // 2. Detektuj preklapanja po sadržaju među sheetovima (§5.1 zamka 1)
  const sheetsSummary = detectSheetDuplicates(sheetInspections);

  // 3. Izaberi sheet koji se parsira
  let selectedInspection: SheetInspection | undefined;

  let selectionReason: SheetSelectionReason;

  if (opts?.sheetName) {
    selectedInspection = sheetInspections.find((s) => s.name === opts.sheetName);
    if (!selectedInspection) {
      throw new Error(`Traženi list "${opts.sheetName}" ne postoji u fajlu.`);
    }
    selectionReason = "trazen";
  } else {
    // Podrazumevano: izaberi list koji NIJE duplikat i ima najviše redova (master sheet)
    const nonDuplicates = sheetInspections.filter(
      (insp) => !sheetsSummary.find((s) => s.name === insp.name)?.looksLikeDuplicateOf,
    );

    if (nonDuplicates.length > 0) {
      // Sortiraj po broju redova opadajuće
      nonDuplicates.sort((a, b) => b.rows.length - a.rows.length);
      selectedInspection = nonDuplicates[0];
      selectionReason =
        sheetInspections.length === 1 ? "jedini" : "najveci_bez_preklapanja";
    } else if (sheetInspections.length > 0) {
      // Ako su svi označeni kao preklapanja, uzmi list sa najviše redova
      sheetInspections.sort((a, b) => b.rows.length - a.rows.length);
      selectedInspection = sheetInspections[0];
      selectionReason = "najveci_iako_sve_preklapa";
    } else {
      selectionReason = "jedini";
    }
  }

  if (!selectedInspection || selectedInspection.headerRowIndex === -1) {
    throw new Error(
      "Nije moguće pouzdano pronaći red sa zaglavljem u tabeli. Proverite nazive kolona.",
    );
  }

  const warnings: string[] = [];

  // Ako je zaglavlje ispod prvog reda, zabeleži u upozorenjima
  if (selectedInspection.headerRowIndex > 0) {
    warnings.push(
      `Zaglavlje se nalazi u redu ${selectedInspection.headerRowIndex + 1} (indeks ${selectedInspection.headerRowIndex}). Redovi iznad su preskočeni.`,
    );
  }

  // Prijavi sheetove koji izgledaju kao preklapanja
  for (const s of sheetsSummary) {
    if (s.looksLikeDuplicateOf) {
      warnings.push(
        `List "${s.name}" (${s.rowCount} redova) sadrži iste lidove kao list "${s.looksLikeDuplicateOf}".`,
      );
    }
  }

  return {
    sheets: sheetsSummary,
    selectedSheet: selectedInspection.name,
    selectionReason,
    headerRowIndex: selectedInspection.headerRowIndex,
    columns: selectedInspection.columns,
    rows: selectedInspection.rows,
    skipped: selectedInspection.skipped,
    warnings,
  };
}
