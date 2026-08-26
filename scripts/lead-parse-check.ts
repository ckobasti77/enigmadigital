/**
 * ============================================================================
 * PROVERA PARSIRANJA TABELE LIDOVA (CSV / XLSX)
 * ============================================================================
 *
 * Pokretanje:
 *   node --import ./scripts/ts-hooks.mjs scripts/lead-parse-check.ts <putanja-do-fajla>
 *   (ili: npx tsx scripts/lead-parse-check.ts <putanja-do-fajla>)
 *
 * Svrha:
 *   Učitava XLSX ili CSV fajl, pokreće `parseLeadWorkbook` i ispisuje rezime:
 *   - Broj listova (sheetova) i prepoznata preklapanja
 *   - Indeks reda sa zaglavljem i prepoznate kolone
 *   - Ukupan broj uspešno parsiranih redova
 *   - Broj preskočenih redova sa razlozima
 *   - Prvih 5 redova (uz STRIKTNU zaštitu privatnosti)
 *
 * PRAVILO PRIVATNOSTI (§0, §5):
 *   Skripta NIKADA ne ispisuje sirov telefon, email niti ime osobe.
 *   Prikazuje se isključivo oznaka prisustva ([postoji] ili [nema]).
 * ============================================================================
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { parseLeadWorkbook, type ParsedLeadRow } from "../convex/lib/leadImportParse";

function maskLeadRowForDisplay(row: ParsedLeadRow): Record<string, unknown> {
  return {
    nazivFirme: row.nazivFirme ?? "[nema]",
    ulica: row.ulica ?? "[nema]",
    opstina: row.opstina ?? "[nema]",
    grad: row.grad ?? "[nema]",
    // Zaštita privatnosti: nikada sirov telefon, email ni ime osobe
    telefon: row.telefon ? "[postoji]" : "[nema]",
    telefonNapomena: row.telefonNapomena ?? "[nema]",
    email: row.email ? "[postoji]" : "[nema]",
    sajt: row.sajt ?? "[nema]",
    imeOsobe: row.imeOsobe ? "[postoji]" : "[nema]",
    uloga: row.uloga ?? "[nema]",
    ocena: row.ocena ?? "[nema]",
    companyWallUrl: row.companyWallUrl ?? "[nema]",
    companyWallTacnost: row.companyWallTacnost ?? "[nema]",
    pib: row.pib ?? "[nema]",
    maticniBroj: row.maticniBroj ?? "[nema]",
    sifraDelatnosti: row.sifraDelatnosti ?? "[nema]",
    napomena: row.napomena ?? "[nema]",
    izvori: row.izvori.length > 0 ? row.izvori : "[prazno]",
    derivedSignals: row.derivedSignals.length > 0 ? row.derivedSignals : "[nema]",
  };
}

async function main(): Promise<void> {
  const filePathArg = process.argv[2]?.trim();

  if (!filePathArg) {
    console.error("================================================================================");
    console.error("GRESKA: Nije navedena putanja do fajla sa lidovima.");
    console.error("Primer pokretanja:");
    console.error("  npx tsx scripts/lead-parse-check.ts putanja/do/fajla.xlsx");
    console.error("  npx tsx scripts/lead-parse-check.ts putanja/do/fajla.csv");
    console.error("================================================================================");
    process.exit(1);
  }

  const resolvedPath = path.resolve(process.cwd(), filePathArg);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`GRESKA: Fajl nije pronađen na lokaciji: ${resolvedPath}`);
    process.exit(1);
  }

  console.log("================================================================================");
  console.log(`UČITAVANJE FAJLA: ${path.basename(resolvedPath)}`);
  console.log("================================================================================");

  const fileBuffer = fs.readFileSync(resolvedPath);
  const result = parseLeadWorkbook(fileBuffer, { fileName: path.basename(resolvedPath) });

  console.log("\n1. LISTOVI (SHEETOVI) I PREKLAPANJA:");
  console.log(`   Ukupno listova: ${result.sheets.length}`);
  for (const sheet of result.sheets) {
    if (sheet.looksLikeDuplicateOf) {
      console.log(`   - "${sheet.name}": ${sheet.rowCount} redova -> [PREKLAPANJE: podskup lista "${sheet.looksLikeDuplicateOf}"]`);
    } else {
      console.log(`   - "${sheet.name}": ${sheet.rowCount} redova -> [MASTER / JEDINSTVEN]`);
    }
  }

  console.log("\n2. ZAGLAVLJE I KOLONE:");
  console.log(`   Indeks reda sa zaglavljem: ${result.headerRowIndex} (red ${result.headerRowIndex + 1})`);
  console.log(`   Prepoznate kolone (${result.columns.length}): [${result.columns.join(", ")}]`);

  console.log("\n3. REZIME PARSIRANJA:");
  console.log(`   Uspešno parsiranih redova: ${result.rows.length}`);
  console.log(`   Preskočenih redova: ${result.skipped.length}`);

  if (result.skipped.length > 0) {
    console.log("\n4. SPISAK PRESKOČENIH REDOVA I RAZLOZI:");
    for (const sk of result.skipped) {
      console.log(`   - Red ${sk.rowIndex}: ${sk.razlog}`);
    }
  }

  if (result.warnings.length > 0) {
    console.log("\n5. UPOZORENJA:");
    for (const w of result.warnings) {
      console.log(`   - ${w}`);
    }
  }

  console.log("\n6. PRVIH 5 PARSIRANIH REDOVA (sa maskiranim ličnim podacima):");
  const sampleRows = result.rows.slice(0, 5);
  for (let i = 0; i < sampleRows.length; i++) {
    console.log(`\n--- Red #${i + 1} ---`);
    console.log(JSON.stringify(maskLeadRowForDisplay(sampleRows[i]), null, 2));
  }

  console.log("\n================================================================================");
  console.log("PROVERA PARSIRANJA USPEŠNO ZAVRŠENA.");
  console.log("================================================================================");
}

main().catch((err: unknown) => {
  console.error("GRESKA pri parsiranju fajla:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
