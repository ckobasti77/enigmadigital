/**
 * ============================================================================
 * PROVERA KANONSKOG CSV IZVOZA (LM12, §6)
 * ============================================================================
 *
 * Pokretanje:
 *   npx tsx scripts/lead-export-check.ts
 *
 * Proverava ono što se čitanjem koda previdi, a u Excel-u razbije fajl:
 *  - srpski telefon (+381…) ne sme da bude protumačen kao formula
 *  - napomena iz tuđe tabele ne sme da se izvrši kao formula (CSV injection)
 *  - prazno ostaje prazno, ali NULA ostaje nula
 *  - zarezi i navodnici u napomeni ne razbijaju kolone
 * ============================================================================
 */

import process from "node:process";
import {
  buildLeadCsv,
  escapeCsvField,
  CANONICAL_CSV_COLUMNS,
  type CanonicalLeadExportRow,
} from "../convex/lib/leadExport";

let pao = 0;
function proveri(naziv: string, uslov: boolean, detalj: string): void {
  if (uslov) console.log(`  OK   ${naziv}`);
  else {
    pao++;
    console.log(`  PAO  ${naziv} -> ${detalj}`);
  }
}

async function main(): Promise<void> {
  console.log("=".repeat(78));
  console.log("ZAŠTITA OD FORMULA");
  console.log("=".repeat(78));

  const tel = escapeCsvField("+381641234567");
  proveri("telefon ne počinje sa +", !tel.startsWith("+"), tel);
  proveri("telefon je sačuvan u celosti", tel.includes("381641234567"), tel);

  for (const opasno of ["=1+1", "-2+3", "@SUM(A1)", "=cmd|'/c calc'!A1"]) {
    const out = escapeCsvField(opasno);
    proveri(
      `napomena „${opasno.slice(0, 14)}" nije formula`,
      !/^[=+\-@]/.test(out.replace(/^"/, "")),
      out,
    );
  }

  console.log("\n" + "=".repeat(78));
  console.log("PRAZNO NASPRAM NULE");
  console.log("=".repeat(78));
  proveri("undefined je prazno", escapeCsvField(undefined) === "", escapeCsvField(undefined));
  proveri("null je prazno", escapeCsvField(null) === "", escapeCsvField(null));
  proveri("prazan string je prazno", escapeCsvField("   ") === "", "|" + escapeCsvField("   ") + "|");
  proveri("nula je NULA, ne prazno", escapeCsvField(0) === "0", "|" + escapeCsvField(0) + "|");
  proveri("nema izmisljenog N/A", !escapeCsvField(undefined).includes("N/A"), "");

  console.log("\n" + "=".repeat(78));
  console.log("ZAREZI, NAVODNICI I PRELOMI REDA");
  console.log("=".repeat(78));
  const zarez = escapeCsvField("Jurija Gagarina 14lj, Novi Beograd");
  proveri("polje sa zarezom je pod navodnicima", zarez.startsWith('"') && zarez.endsWith('"'), zarez);
  const navod = escapeCsvField('Rekao je "ne zovite me"');
  proveri("unutrašnji navodnici su udvojeni", navod.includes('""ne zovite me""'), navod);
  const prelom = escapeCsvField("prvi red\nдrugi red");
  proveri("prelom reda je pod navodnicima", prelom.startsWith('"'), JSON.stringify(prelom));

  console.log("\n" + "=".repeat(78));
  console.log("CEO FAJL");
  console.log("=".repeat(78));
  const redovi: CanonicalLeadExportRow[] = [
    {
      naziv_firme: "Šljivić DOO",
      ulica: "Jurija Gagarina 14lj",
      opstina: "Novi Beograd",
      grad: "Beograd",
      telefon: "+381641234567",
      email: null,
      sajt: null,
      ime_osobe: "Bojan Lalić",
      uloga: "vlasnik",
      ocena_vrednost: 9.4,
      ocena_skala: 10,
      ocena_broj_recenzija: 0,
      ocena_izvor: "sredime",
      companywall_url: null,
      pib: null,
      maticni_broj: null,
      sifra_delatnosti: "9602",
      napomena: "=HYPERLINK(\"http://zlo\",\"klikni\")",
      izvori: "companywall;google_maps",
    },
  ];

  const csv = buildLeadCsv(redovi);
  const linije = csv.split("\r\n");

  proveri("fajl počinje UTF-8 BOM-om", csv.charCodeAt(0) === 0xfeff, String(csv.charCodeAt(0)));
  proveri("zaglavlje ima 19 kanonskih kolona", linije[0].replace(/^﻿/, "").split(",").length === CANONICAL_CSV_COLUMNS.length, linije[0]);
  proveri("red podataka ima isti broj kolona", (linije[1].match(/,/g) ?? []).length >= CANONICAL_CSV_COLUMNS.length - 1, String((linije[1].match(/,/g) ?? []).length));
  proveri("nula recenzija je u fajlu kao 0", linije[1].includes(",0,"), linije[1]);
  proveri("dijakritika je očuvana", csv.includes("Šljivić"), "");
  proveri("napomena-formula je neutralisana", !linije[1].includes(",=HYPERLINK"), linije[1].slice(-90));

  console.log("\nPrimer reda:");
  console.log("  " + linije[1]);

  console.log("\n" + "=".repeat(78));
  if (pao > 0) {
    console.log(`NEUSPELO PROVERA: ${pao}`);
    process.exitCode = 1;
  } else {
    console.log("SVE PROVERE PROŠLE.");
  }
  console.log("=".repeat(78));
}

void main();
