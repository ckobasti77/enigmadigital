/**
 * ============================================================================
 * GRADOVI — ugrađeni alijasi imena grada (GL6 §3)
 * ============================================================================
 *
 * Filter grada u `places.mjs` poredi `uprosti(formattedAddress)` sa nazivom
 * grada. Problem iz prvog stvarnog runa: „Beograd" ne prolazi kroz „Belgrade"
 * (Places ume da vrati engleski egzonim), a beogradske opštine („Zemun",
 * „Novi Beograd") Places često piše kao „…, Beograd" — pa je pretraga po
 * opštini praznila sve kandidate.
 *
 * Ovaj modul za dati unos vraća KANONSKO ime (ide u Places upit i u telo) i
 * DODATNE nazive prihvatljive u adresi:
 *
 *   alijasiGrada("Beograd")  → { kanonski: "Beograd", alijasi: ["Belgrade", <opštine>] }
 *   alijasiGrada("Zemun")    → { kanonski: "Zemun",   alijasi: ["Beograd", "Belgrade"] }
 *   alijasiGrada("Kruševac") → { kanonski: "Kruševac", alijasi: [] }   // nepoznat, doslovno
 *
 * `--grad "A|B"` u CLI-ju ostaje kao DOPUNA: ručni alijasi se dodaju na ove.
 *
 * Ćirilica se NE navodi kao alijas: `uprosti` je transliteruje, pa „Београд" i
 * „Beograd" već daju isti ključ. Navedeni su samo egzonimi (Belgrade, Nis,
 * Nish) i, za Beograd, opštine.
 */

import { uprosti } from "./places.mjs";

/** Beogradske opštine — pripadaju Beogradu (Places im adresu piše kao „Beograd"). */
export const BEOGRAD_OPSTINE = [
  "Zemun",
  "Novi Beograd",
  "Zvezdara",
  "Vračar",
  "Voždovac",
  "Palilula",
  "Čukarica",
  "Rakovica",
  "Stari Grad",
  "Savski venac",
  "Grocka",
  "Surčin",
  "Obrenovac",
  "Lazarevac",
  "Mladenovac",
  "Sopot",
  "Barajevo",
];

/**
 * Poznati gradovi: kanonski naziv + egzonimi/varijante prihvatljive u adresi.
 * Beograd dobija sve opštine kao alijase — pretraga „Beograd" prihvata i
 * adresu koja glasi samo „…, Zemun".
 */
const GRADOVI = [
  { kanonski: "Beograd", alijasi: ["Belgrade", ...BEOGRAD_OPSTINE] },
  { kanonski: "Novi Sad", alijasi: [] },
  { kanonski: "Niš", alijasi: ["Nis", "Nish"] },
  { kanonski: "Kragujevac", alijasi: [] },
  { kanonski: "Subotica", alijasi: [] },
  { kanonski: "Zrenjanin", alijasi: [] },
  { kanonski: "Pančevo", alijasi: [] },
  { kanonski: "Čačak", alijasi: [] },
  { kanonski: "Kraljevo", alijasi: [] },
  { kanonski: "Novi Pazar", alijasi: [] },
];

/** Ključ opštine (uprošćen) → njeno pravo ime. */
const OPSTINE_PO_KLJUCU = new Map(BEOGRAD_OPSTINE.map((o) => [uprosti(o), o]));

/**
 * Za dati unos vraća `{ kanonski, alijasi }`.
 *
 * @param {string} unos  grad ili opština kako ga je čovek uneo
 * @returns {{ kanonski: string, alijasi: string[] }}
 */
export function alijasiGrada(unos) {
  const ime = String(unos ?? "").trim();
  const kljuc = uprosti(ime);
  if (!kljuc) return { kanonski: ime, alijasi: [] };

  // 1. Beogradska opština uneta kao grad: ONA je kanonska (upit „frizer Zemun"),
  //    a „Beograd" je alijas jer Places njenu adresu piše kao „…, Beograd".
  const opstina = OPSTINE_PO_KLJUCU.get(kljuc);
  if (opstina) return { kanonski: opstina, alijasi: ["Beograd", "Belgrade"] };

  // 2. Poznat grad — po kanonskom nazivu ili egzonimu.
  for (const g of GRADOVI) {
    if (uprosti(g.kanonski) === kljuc || g.alijasi.some((a) => uprosti(a) === kljuc)) {
      return { kanonski: g.kanonski, alijasi: [...g.alijasi] };
    }
  }

  // 3. Nepoznat grad — koristi se doslovno, bez ugrađenih alijasa (`--grad "A|B"`
  //    i dalje radi kao dopuna).
  return { kanonski: ime, alijasi: [] };
}
