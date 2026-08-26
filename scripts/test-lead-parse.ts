/**
 * ============================================================================
 * TEST: DETALJNA PROVERA PARSIRANJA LIDOVA I SVIH 5 ZAMKI (§5.1, §5.2, §6)
 * ============================================================================
 */

import * as XLSX from "xlsx";
import { parseRating, deriveSignalsFromNote, parseLeadWorkbook } from "../convex/lib/leadImportParse";
import { LEAD_SIGNAL_KINDS } from "../convex/lib/leadNormalize";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    process.exit(1);
  } else {
    console.log(`[PASS] ${message}`);
  }
}

async function main(): Promise<void> {
  console.log("================================================================================");
  console.log("POKREĆEM TESTOVE ZA LEAD IMPORT PARSER");
  console.log("================================================================================\n");

  // ── TEST 1: Parsiranje ocena (§5.1 zamka 5) ──────────────────────────────────
  console.log("--- 1. Provera parseRating ---");

  // 1a: Google ocena
  const r1 = parseRating("5.0 (Google, 53 rec.)");
  assert(r1?.vrednost === 5.0, "r1.vrednost === 5.0");
  assert(r1?.skala === 5, "r1.skala === 5");
  assert(r1?.brojRecenzija === 53, "r1.brojRecenzija === 53");
  assert(r1?.izvor === "google", "r1.izvor === 'google'");

  // 1b: SrediMe 9.7/10
  const r2 = parseRating("9.7/10 (SrediMe, 133 rec.)");
  assert(r2?.vrednost === 9.7, "r2.vrednost === 9.7");
  assert(r2?.skala === 10, "r2.skala === 10");
  assert(r2?.brojRecenzija === 133, "r2.brojRecenzija === 133");
  assert(r2?.izvor === "sredime", "r2.izvor === 'sredime'");

  // 1c: SrediMe 9.4/10
  const r3 = parseRating("9.4/10 (SrediMe, 143 rec.)");
  assert(r3?.vrednost === 9.4, "r3.vrednost === 9.4");
  assert(r3?.skala === 10, "r3.skala === 10");
  assert(r3?.brojRecenzija === 143, "r3.brojRecenzija === 143");
  assert(r3?.izvor === "sredime", "r3.izvor === 'sredime'");

  // 1d: Na 011info
  const r4 = parseRating("Na 011info");
  assert(r4?.izvor === "011info", "r4.izvor === '011info'");
  assert(r4?.vrednost === undefined, "r4.vrednost === undefined");
  assert(r4?.skala === undefined, "r4.skala === undefined");
  assert(r4?.brojRecenzija === undefined, "r4.brojRecenzija === undefined");

  // 1e: FB lajkovi — NIJE ocena
  const r5 = parseRating("468 FB lajkova");
  assert(r5 === undefined, "r5 === undefined (468 FB lajkova nije ocena)");

  // 1f: Goli broj bez skale i izvora
  const r6 = parseRating("4.5");
  assert(r6 === undefined, "r6 === undefined (broj bez skale se ne vraća)");

  // ── TEST 2: Izvedeni signali (§5.2) ──────────────────────────────────────────
  console.log("\n--- 2. Provera deriveSignalsFromNote ---");

  const s1 = deriveSignalsFromNote("Nema sajt, vlasnik radi sam");
  assert(s1.includes("nema_sajt"), "s1 includes 'nema_sajt'");
  assert(!s1.includes("ostalo"), "s1 ne izmišlja 'ostalo'");

  const s2 = deriveSignalsFromNote("koristi Setmore za zakazivanje");
  assert(s2.includes("koristi_third_party_booking"), "s2 includes 'koristi_third_party_booking'");

  const s3 = deriveSignalsFromNote("ima samo Facebook stranicu");
  assert(s3.includes("samo_facebook"), "s3 includes 'samo_facebook'");

  const s4 = deriveSignalsFromNote("133 pozitivne recenzije na platformi");
  assert(s4.includes("visok_broj_recenzija"), "s4 includes 'visok_broj_recenzija'");

  const s5 = deriveSignalsFromNote("Novootvoreni salon u centru grada");
  assert(s5.includes("novootvorena_firma"), "s5 includes 'novootvorena_firma'");

  // Proveri da su svi signali samo iz dozvoljene liste
  for (const s of [...s1, ...s2, ...s3, ...s4, ...s5]) {
    assert(LEAD_SIGNAL_KINDS.includes(s as (typeof LEAD_SIGNAL_KINDS)[number]), `Signal '${s}' je u LEAD_SIGNAL_KINDS`);
  }

  // ── TEST 3: XLSX radna sveska sa svim zamkama ──────────────────────────────
  console.log("\n--- 3. Provera XLSX radne sveske sa svim zamkama ---");

  const wb = XLSX.utils.book_new();

  // Sheet 1: Master sheet ("Svi lidovi (100)")
  const masterData = [
    ["Beogradski saloni 2026 — Naslovni red iznad zaglavlja"], // Red 0 (Zamka B: zaglavlje u redu 1)
    ["Ime_Salona", "Lokacija", "Telefon", "Ime_osobe", "Pozicija", "Ocena", "Napomena_za_prodaju", "Izvor_podataka"], // Red 1
    ["BATCH 1 — Lidovi 1-15 (top kvalitet)"], // Red 2 (Zamka C: red-razdelnik)
    [
      "Salon Lepote 'Adaleta'",
      "Požeška 42, Čukarica, Beograd (proveriti adresu)",
      "011/397-9965",
      "Ana Marković",
      "vlasnik",
      "5.0 (Google, 53 rec.)",
      "Nema sajt, koristi Setmore",
      "https://www.companywall.rs/firma/salon-adaleta/MM1234, Google Maps",
    ],
    [
      "Frizerski Salon Žaklina",
      "Jurija Gagarina 22, Novi Beograd",
      "Proveriti na 011info", // Zamka D: rečenica u telefonu
      "",
      "",
      "9.7/10 (SrediMe, 133 rec.)",
      "ima samo Facebook, 133 pozitivne recenzije",
      "SrediMe, CompanyWall (aproks.)",
    ],
    [
      "Studio Glamur",
      "Knez Mihailova 10, Beograd",
      "060/123-4567",
      "Jelena",
      "menadzer",
      "Na 011info",
      "Novootvoreni salon",
      "011info",
    ],
  ];

  const wsMaster = XLSX.utils.aoa_to_sheet(masterData);
  XLSX.utils.book_append_sheet(wb, wsMaster, "Svi lidovi (100)");

  // Sheet 2: Batch 1 (Zamka A: isti leadovi u više sheetova)
  const batch1Data = [
    ["Ime_Salona", "Lokacija", "Telefon", "Ime_osobe", "Pozicija", "Ocena", "Napomena_za_prodaju", "Izvor_podataka"],
    [
      "Salon Lepote 'Adaleta'",
      "Požeška 42, Čukarica, Beograd",
      "011/397-9965",
      "Ana Marković",
      "vlasnik",
      "5.0 (Google, 53 rec.)",
      "Nema sajt, koristi Setmore",
      "https://www.companywall.rs/firma/salon-adaleta/MM1234",
    ],
  ];

  const wsBatch1 = XLSX.utils.aoa_to_sheet(batch1Data);
  XLSX.utils.book_append_sheet(wb, wsBatch1, "Batch 1");

  const wbBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const result = parseLeadWorkbook(wbBuffer);

  // Provere:
  // a) Listovi i preklapanja
  assert(result.sheets.length === 2, "result.sheets.length === 2");
  const masterSheetInfo = result.sheets.find((s) => s.name === "Svi lidovi (100)");
  const batch1SheetInfo = result.sheets.find((s) => s.name === "Batch 1");
  assert(masterSheetInfo?.looksLikeDuplicateOf === undefined, "Master sheet nije označen kao duplikat");
  assert(batch1SheetInfo?.looksLikeDuplicateOf === "Svi lidovi (100)", "Batch 1 je označen kao preklapanje 'Svi lidovi (100)'");

  // b) Indeks zaglavlja
  assert(result.headerRowIndex === 1, "result.headerRowIndex === 1 (red 2 u Excelu)");

  // c) Redovi-razdelnici u skipped
  assert(result.skipped.length === 1, "result.skipped.length === 1");
  assert(result.skipped[0].rowIndex === 3, "Preskočen red 3 (BATCH 1)");
  assert(result.skipped[0].razlog.includes("Red-razdelnik"), "Razlog sadrži 'Red-razdelnik'");

  // d) Parsirani redovi
  assert(result.rows.length === 3, "result.rows.length === 3");

  // Red 1:
  const row1 = result.rows[0];
  assert(row1.nazivFirme === "Salon Lepote 'Adaleta'", "row1.nazivFirme");
  assert(row1.ulica === "Požeška 42", "row1.ulica === 'Požeška 42'");
  assert(row1.opstina === "Čukarica", "row1.opstina === 'Čukarica'");
  assert(row1.grad === "Beograd", "row1.grad === 'Beograd'");
  assert(row1.telefon === "+381113979965", "row1.telefon === '+381113979965'");
  assert(row1.telefonNapomena === undefined, "row1.telefonNapomena === undefined");
  assert(row1.ocena?.vrednost === 5.0 && row1.ocena?.skala === 5, "row1.ocena");
  assert(row1.companyWallUrl === "companywall.rs/firma/salon-adaleta/MM1234", "row1.companyWallUrl normalizovan");
  assert(row1.companyWallTacnost === "tacno", "row1.companyWallTacnost === 'tacno'");
  assert(row1.derivedSignals.includes("nema_sajt"), "row1.derivedSignals nema_sajt");
  assert(row1.derivedSignals.includes("koristi_third_party_booking"), "row1.derivedSignals koristi_third_party_booking");

  // Red 2:
  const row2 = result.rows[1];
  assert(row2.nazivFirme === "Frizerski Salon Žaklina", "row2.nazivFirme");
  assert(row2.telefon === undefined, "row2.telefon === undefined (rečenica nije u polju za telefon)");
  assert(row2.telefonNapomena === "Proveriti na 011info", "row2.telefonNapomena === 'Proveriti na 011info'");
  assert(row2.companyWallTacnost === "priblizno", "row2.companyWallTacnost === 'priblizno' (CompanyWall aproks.)");
  assert(row2.derivedSignals.includes("samo_facebook"), "row2.derivedSignals samo_facebook");
  assert(row2.derivedSignals.includes("visok_broj_recenzija"), "row2.derivedSignals visok_broj_recenzija");

  // Red 3:
  const row3 = result.rows[2];
  assert(row3.ocena?.izvor === "011info" && row3.ocena?.vrednost === undefined, "row3.ocena izvor 011info bez vrednosti");
  assert(row3.derivedSignals.includes("novootvorena_firma"), "row3.derivedSignals novootvorena_firma");

  // ── TEST 4: Kanonski CSV (§6) ────────────────────────────────────────────────
  console.log("\n--- 4. Provera kanonskog CSV formata ---");

  const csvContent = [
    "naziv_firme,ulica,opstina,grad,telefon,email,sajt,ime_osobe,uloga,ocena_vrednost,ocena_skala,ocena_broj_recenzija,ocena_izvor,companywall_url,pib,maticni_broj,sifra_delatnosti,napomena,izvori",
    "Auto Servis Brzi,Bulevar oslobođenja 50,Voždovac,Beograd,+381641112233,kontakt@brzi.rs,https://brzi.rs,Marko,vlasnik,4.9,5,85,google,https://www.companywall.rs/firma/brzi/123,101234567,08123456,45.20,koristi dikidi,google;dikidi;companywall",
  ].join("\n");

  const csvResult = parseLeadWorkbook(csvContent);
  assert(csvResult.rows.length === 1, "csvResult.rows.length === 1");
  const csvRow = csvResult.rows[0];
  assert(csvRow.nazivFirme === "Auto Servis Brzi", "csvRow.nazivFirme");
  assert(csvRow.pib === "101234567", "csvRow.pib === '101234567'");
  assert(csvRow.maticniBroj === "08123456", "csvRow.maticniBroj === '08123456'");
  assert(csvRow.ocena?.vrednost === 4.9 && csvRow.ocena?.skala === 5, "csvRow.ocena");
  assert(csvRow.derivedSignals.includes("koristi_third_party_booking"), "csvRow.derivedSignals koristi_third_party_booking");

  console.log("\n================================================================================");
  console.log("SVI TESTOVI SU USPEŠNO PROŠLI (100% PASS)!");
  console.log("================================================================================");
}

main().catch((err) => {
  console.error("Test pao sa greškom:", err);
  process.exit(1);
});
