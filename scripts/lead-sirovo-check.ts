/**
 * ============================================================================
 * DOKAZ: parser zadržava SVE sirove ćelije u izvornom redosledu kolona (§2, §3)
 * ============================================================================
 *
 * Pokretanje:
 *
 *   node --import ./scripts/ts-hooks.mjs scripts/lead-sirovo-check.ts
 *
 * Dokazuje:
 *   1. Parser vraća ISTI broj ćelija u `sirovo` koliko fajl ima kolona.
 *   2. Prazne ćelije su uključene sa vrednošću `""`.
 *   3. Kolone koje mapiranje ne prepoznaje su zadržane u `sirovo` sa tačnim
 *      nazivom i vrednošću u izvornom redosledu.
 *   4. Mapirana polja (`parsed`) ostaju ispravna i netaknuta pored `sirovo`.
 *   5. Redovi sa manje ćelija od broja kolona se ispravno popunjavaju praznim stringom.
 */

import * as XLSX from "xlsx";
import { parseLeadWorkbook } from "../convex/lib/leadImportParse";

let failures = 0;

function check(label: string, condition: boolean) {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    console.error(`  ✗ ${label}`);
    failures++;
  }
}

// ── Priprema test radne sveske ───────────────────────────────────────────────

const HEADERS = [
  "Naziv firme",               // [0] prepoznato: nazivFirme
  "Kontakt telefon",           // [1] prepoznato: telefon
  "Lokacija",                  // [2] prepoznato: lokacija (razlaže se u ulica, opstina, grad)
  "Neprepoznata kolona A",     // [3] NEPOZNATO — mora ostati u sirovo
  "Ocena",                     // [4] prepoznato: ocena
  "Prilagodjeni status CRM",   // [5] NEPOZNATO — mora ostati u sirovo
  "Prazno polje",              // [6] NEPOZNATO — prazno u većini redova
  "Napomena za prodaju",       // [7] prepoznato: napomena
  "Interni ID partnera",       // [8] NEPOZNATO — mora ostati u sirovo
];

const DATA_ROWS = [
  // Red 1: sve ćelije popunjene
  [
    "Salon Lepote Aurora",
    "011/222-3333",
    "Jurija Gagarina 14, Novi Beograd",
    "Vrednost A1",
    "5.0 (Google, 50 rec.)",
    "Kontaktiran",
    "Test 1",
    "Zainteresovani za sajt",
    "EXT-1001",
  ],
  // Red 2: prazne ćelije u sredini (telefon prazan, prilagođeni status prazan, prazno polje prazno)
  [
    "Frizerski Studio Glamur",
    "",
    "Glavna 10, Zemun",
    "Vrednost A2",
    "4.8 (Google, 20 rec.)",
    "",
    "",
    "Zvati popodne",
    "EXT-1002",
  ],
  // Red 3: kraći niz podataka (manje elemenata od zaglavlja)
  [
    "Kozmetika Dan i Noc",
    "064/123-4567",
    "Njegoseva 5, Vracar",
    "Vrednost A3",
  ],
  // Red 4: samo naziv i neprepoznata kolona, ostalo prazno
  [
    "Auto Servis Brzina",
    "",
    "",
    "Vrednost A4",
    "",
    "",
    "",
    "",
    "EXT-1004",
  ],
  // Red-razdelnik (jedna popunjena ćelija) — parser mora da ga preskoči
  ["--- BATCH 2 ---", "", "", "", "", "", "", "", ""],
  // Prazan red — parser mora da ga preskoči
  ["", "", "", "", "", "", "", "", ""],
];

const sheetData = [HEADERS, ...DATA_ROWS];
const ws = XLSX.utils.aoa_to_sheet(sheetData);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "Leadovi");

const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

// ── Izvršavanje parsera ──────────────────────────────────────────────────────

console.log("Pokrećem proveru parsera sirovih ćelija...\n");

const result = parseLeadWorkbook(buffer, { fileName: "test-leadovi.xlsx" });

const numColumns = HEADERS.length; // 9

// 1. Provera broja prepoznatih kolona i parsiranih redova
check(`Broj kolona u zaglavlju je ${numColumns}`, result.columns.length === numColumns);
check("Parsirana su tačno 4 validna reda (razdelnik i prazan red preskočeni)", result.rows.length === 4);
check("Preskočena su tačno 2 reda (razdelnik i prazan red)", result.skipped.length === 2);

// 2. Provera svakog parsiranog reda pojedinačno
for (let i = 0; i < result.rows.length; i++) {
  const row = result.rows[i];
  const rowNum = i + 1;

  check(
    `Red ${rowNum} ima tačno ${numColumns} sirovih ćelija (sirovo.length === ${numColumns})`,
    row.sirovo.length === numColumns,
  );

  // Proveri nazive svih kolona u sirovo
  const allColumnsMatch = row.sirovo.every(
    (cell, colIdx) => cell.kolona === HEADERS[colIdx],
  );
  check(`Red ${rowNum} ima tačna imena kolona u izvornom redosledu`, allColumnsMatch);
}

// 3. Detaljne provere vrednosti ćelija po redovima
// Red 1
{
  const r1 = result.rows[0];
  check("Red 1: parsed.nazivFirme je 'Salon Lepote Aurora'", r1.nazivFirme === "Salon Lepote Aurora");
  check("Red 1: parsed.ulica je 'Jurija Gagarina 14'", r1.ulica === "Jurija Gagarina 14");
  check("Red 1: parsed.opstina je 'Novi Beograd'", r1.opstina === "Novi Beograd");
  check("Red 1: parsed.grad izveden kao 'Beograd'", r1.grad === "Beograd");
  check("Red 1: sirovo[2] ('Lokacija') === 'Jurija Gagarina 14, Novi Beograd'", r1.sirovo[2]?.vrednost === "Jurija Gagarina 14, Novi Beograd");
  check("Red 1: sirovo[3] ('Neprepoznata kolona A') === 'Vrednost A1'", r1.sirovo[3]?.vrednost === "Vrednost A1");
  check("Red 1: sirovo[5] ('Prilagodjeni status CRM') === 'Kontaktiran'", r1.sirovo[5]?.vrednost === "Kontaktiran");
  check("Red 1: sirovo[8] ('Interni ID partnera') === 'EXT-1001'", r1.sirovo[8]?.vrednost === "EXT-1001");
}

// Red 2 (prazne ćelije)
{
  const r2 = result.rows[1];
  check("Red 2: parsed.telefon je undefined jer je prazan", r2.telefon === undefined);
  check("Red 2: sirovo[1] ('Kontakt telefon') je prazan string ''", r2.sirovo[1]?.vrednost === "");
  check("Red 2: sirovo[5] ('Prilagodjeni status CRM') je prazan string ''", r2.sirovo[5]?.vrednost === "");
  check("Red 2: sirovo[6] ('Prazno polje') je prazan string ''", r2.sirovo[6]?.vrednost === "");
  check("Red 2: sirovo[3] ('Neprepoznata kolona A') === 'Vrednost A2'", r2.sirovo[3]?.vrednost === "Vrednost A2");
  check("Red 2: sirovo[8] ('Interni ID partnera') === 'EXT-1002'", r2.sirovo[8]?.vrednost === "EXT-1002");
}

// Red 3 (kraći niz podataka)
{
  const r3 = result.rows[2];
  check("Red 3: parsed.nazivFirme je 'Kozmetika Dan i Noc'", r3.nazivFirme === "Kozmetika Dan i Noc");
  check("Red 3: ima tačno 9 sirovih ćelija iako je ulazni red kraći", r3.sirovo.length === 9);
  check("Red 3: sirovo[4] ('Ocena') je prazan string ''", r3.sirovo[4]?.vrednost === "");
  check("Red 3: sirovo[8] ('Interni ID partnera') je prazan string ''", r3.sirovo[8]?.vrednost === "");
}

// Red 4 (većina kolona prazna)
{
  const r4 = result.rows[3];
  check("Red 4: parsed.nazivFirme je 'Auto Servis Brzina'", r4.nazivFirme === "Auto Servis Brzina");
  check("Red 4: sirovo[3] === 'Vrednost A4'", r4.sirovo[3]?.vrednost === "Vrednost A4");
  check("Red 4: sirovo[8] === 'EXT-1004'", r4.sirovo[8]?.vrednost === "EXT-1004");
  const emptyCount = r4.sirovo.filter((c) => c.vrednost === "").length;
  check("Red 4: ima tačno 6 praznih ćelija", emptyCount === 6);
}

if (failures > 0) {
  console.error(`\n✗ ${failures} provera nije prošlo!`);
  process.exit(1);
}

console.log("\n✓ Sve provere sirovih ćelija uspešno prošle.");
