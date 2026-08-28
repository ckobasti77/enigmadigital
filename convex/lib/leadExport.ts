/**
 * ============================================================================
 * LEAD EXPORT LIB (§6, §8, LM12) — Kanonski CSV format za izvoz leadova
 * ============================================================================
 *
 * ČISTE FUNKCIJE BEZ BAZE I BEZ PROPRATNIH EFEKATA.
 *
 * PRAVILA ZAPISA (§6.1, §6.2):
 * 1. Kolone TAČNO redosledom iz §6.1. Ne dodaju se nove kolone, ne preuređuju se.
 * 2. Prazna ćelija je PRAZNA (""). Nikada „N/A", „nepoznato", „-" ni 0 za nepoznato.
 * 3. Razdvajač je zarez (,), a svako polje sa zarezom, navodnicima ili prelomom
 *    reda se obavija dvostrukim navodnicima uz udvajanje unutrašnjih navodnika.
 * 4. Fajl počinje UTF-8 BOM-om (\uFEFF) kako bi Excel na Windows sistemima
 *    ispravno prikazao srpska slova sa dijakritikom (č, ć, š, ž, đ).
 * 5. Telefon se piše kao tekst u normalizovanom obliku (+381...).
 * 6. Ocena se izvozi u 4 odvojene kolone: vrednost, skala (5/10), broj recenzija i izvor.
 * 7. Izvedena CRM ocena leada (score) se NIKADA ne izvozi (§0).
 * ============================================================================
 */

export const CANONICAL_CSV_COLUMNS = [
  "naziv_firme",
  "ulica",
  "opstina",
  "grad",
  "telefon",
  "email",
  "sajt",
  "ime_osobe",
  "uloga",
  "ocena_vrednost",
  "ocena_skala",
  "ocena_broj_recenzija",
  "ocena_izvor",
  "companywall_url",
  "pib",
  "maticni_broj",
  "sifra_delatnosti",
  "napomena",
  "izvori",
] as const;

export type CanonicalCsvColumn = (typeof CANONICAL_CSV_COLUMNS)[number];

export interface CanonicalLeadExportRow {
  naziv_firme?: string | null;
  ulica?: string | null;
  opstina?: string | null;
  grad?: string | null;
  telefon?: string | null;
  email?: string | null;
  sajt?: string | null;
  ime_osobe?: string | null;
  uloga?: "vlasnik" | "direktor" | "menadzer" | string | null;
  ocena_vrednost?: number | null;
  ocena_skala?: number | null;
  ocena_broj_recenzija?: number | null;
  ocena_izvor?: "google" | "sredime" | "yandex" | "011info" | "facebook" | string | null;
  companywall_url?: string | null;
  pib?: string | null;
  maticni_broj?: string | null;
  sifra_delatnosti?: string | null;
  napomena?: string | null;
  izvori?: string | null;
}

export interface BuildLeadCsvOptions {
  /** Da li uključiti UTF-8 BOM prefiks na početku fajla (podrazumevano: true) */
  includeBom?: boolean;
  /** Razdvajač redova (podrazumevano: \r\n za Excel kompatibilnost na Windowsu) */
  lineBreak?: "\r\n" | "\n";
}

/**
 * Znakovi kojima Excel i LibreOffice počinju FORMULU, ne tekst.
 *
 * Ovo je ozbiljnije nego što izgleda, iz dva razloga:
 *
 * 1. Srpski broj telefona počinje sa `+`. Bez zaštite, `+381641234567`
 *    Excel pokuša da izračuna — ćelija postane `#NAME?` ili broj u naučnoj
 *    notaciji, i telefon je nepovratno pokvaren u fajlu koji se šalje dalje.
 *
 * 2. Napomena za prodaju je slobodan tekst koji dolazi iz tuđe tabele. Ako
 *    počne sa `=`, `+`, `-` ili `@`, otvaranje fajla u Excel-u izvršava je
 *    kao formulu. To je poznat napad (CSV injection): red iz uvezene tabele
 *    postaje kod koji se izvrši na računaru onoga ko fajl otvori.
 *
 * Zaštita je jedan apostrof ispred vrednosti — Excel ga ne prikazuje, ali
 * ćeliju čita kao tekst.
 */
const FORMULA_STARTERS = ["=", "+", "-", "@", "\t", "\r"];

/** Da li bi tabelarni program ovu vrednost pročitao kao formulu. */
export function looksLikeFormula(str: string): boolean {
  return FORMULA_STARTERS.some((z) => str.startsWith(z));
}

/**
 * Eskejpuje jedno CSV polje prema RFC 4180 pravilima, uz zaštitu od toga da
 * tabelarni program vrednost protumači kao formulu.
 *
 * Prazne ili nepostojeće vrednosti ostaju prazan string. Broj 0 NIJE prazna
 * vrednost i piše se kao `0`.
 */
export function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  let str = String(value).trim();
  if (str === "") {
    return "";
  }

  // Zaštita od izvršavanja kao formule. Radi se PRE navodnika, jer navodnici
  // sami po sebi ne sprečavaju Excel da `+381...` protumači kao izraz.
  if (looksLikeFormula(str)) {
    str = `'${str}`;
  }

  // Ako vrednost sadrži zarez, navodnik ili prelom reda, mora biti pod navodnicima
  if (
    str.includes(",") ||
    str.includes('"') ||
    str.includes("\n") ||
    str.includes("\r")
  ) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Gradi kanonski CSV string od niza pripremljenih redova leadova.
 */
export function buildLeadCsv(
  rows: CanonicalLeadExportRow[],
  opts?: BuildLeadCsvOptions,
): string {
  const includeBom = opts?.includeBom ?? true;
  const lineBreak = opts?.lineBreak ?? "\r\n";

  // Zaglavlje sa tačnim redosledom 19 kanonskih kolona
  const header = CANONICAL_CSV_COLUMNS.join(",");

  const lines = rows.map((row) => {
    return CANONICAL_CSV_COLUMNS.map((col) => {
      const val = row[col];
      return escapeCsvField(val);
    }).join(",");
  });

  const csvBody = [header, ...lines].join(lineBreak);
  return includeBom ? `\uFEFF${csvBody}` : csvBody;
}
