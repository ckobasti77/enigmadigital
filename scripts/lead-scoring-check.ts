/**
 * ============================================================================
 * PROVERA OCENJIVANJA LEADOVA (LM6)
 * ============================================================================
 *
 * Pokretanje:
 *   npx tsx scripts/lead-scoring-check.ts
 *
 * Svrha: pusti `scoreLead` nad izmišljenim ali realnim ulazima i proveri
 * ponašanja koja se ČITANJEM koda lako previde:
 *   - nula signala nije isto što i izmerena hladna nula
 *   - intent se gasi sa vremenom, fit se ne gasi
 *   - isti signal viđen više puta broji se jednom, po najskorijem opažaju
 *   - pravilo koje ne može da se primeni se PRIJAVLJUJE, ne guta
 *   - signal koji nijedno pravilo ne pokriva se prijavljuje
 *
 * Vreme je fiksirano (NOW), da rezultat ne zavisi od dana kad se pokreće.
 * ============================================================================
 */

import process from "node:process";
import { scoreLead, type LeadIcpRuleInput } from "../convex/lib/leadScoring";

const NOW = 1_756_000_000_000; // fiksan trenutak
const DAN = 24 * 60 * 60 * 1000;

const PRAVILA: LeadIcpRuleInput[] = [
  { name: "Nema sajt", axis: "fit", signalKind: "nema_sajt", weight: 30, isActive: true },
  { name: "Visok broj recenzija", axis: "fit", signalKind: "visok_broj_recenzija", weight: 20, isActive: true },
  { name: "Pitao za cenu", axis: "intent", signalKind: "pitao_cenu", weight: 40, isActive: true },
  { name: "Komentar", axis: "intent", signalKind: "komentar", weight: 10, isActive: true },
  // namerno pokvarena pravila
  { name: "Izmišljen signal", axis: "fit", signalKind: "ima_dobar_logo", weight: 50, isActive: true },
  { name: "Nulta težina", axis: "intent", signalKind: "dm", weight: 0, isActive: true },
  { name: "Isključeno pravilo", axis: "fit", signalKind: "samo_instagram", weight: 99, isActive: false },
];

let pao = 0;
function proveri(naziv: string, uslov: boolean, detalj: string): void {
  if (uslov) {
    console.log(`  OK   ${naziv}`);
  } else {
    pao++;
    console.log(`  PAO  ${naziv} -> ${detalj}`);
  }
}

async function main(): Promise<void> {
  console.log("=".repeat(78));
  console.log("PROVERA OCENJIVANJA LEADOVA");
  console.log("=".repeat(78));

  console.log("\n1. Firma bez ijednog signala");
  const prazna = scoreLead([], PRAVILA, NOW);
  proveri("fit.points je 0", prazna.fit.points === 0, String(prazna.fit.points));
  proveri("fit.signalsCounted je 0 (ništa nije izmereno)", prazna.fit.signalsCounted === 0, String(prazna.fit.signalsCounted));
  proveri("fit.maxPoints je 50 (30+20, bez pokvarenih i isključenih)", prazna.fit.maxPoints === 50, String(prazna.fit.maxPoints));
  proveri("intent.maxPoints je 50 (40+10, nulta težina ne ulazi)", prazna.intent.maxPoints === 50, String(prazna.intent.maxPoints));

  console.log("\n2. Pokvarena pravila se prijavljuju, ne gutaju");
  proveri("dva nevalidna pravila", prazna.invalidRules.length === 2, JSON.stringify(prazna.invalidRules));
  proveri("razlog nepoznat_signal", prazna.invalidRules.some((r) => r.razlog === "nepoznat_signal"), "");
  proveri("razlog nevalidna_tezina", prazna.invalidRules.some((r) => r.razlog === "nevalidna_tezina"), "");

  console.log("\n3. Sveža namera (pitao cenu juče)");
  const svez = scoreLead([{ kind: "pitao_cenu", observedAt: NOW - 1 * DAN }], PRAVILA, NOW);
  proveri("intent.points je 40 (faktor 1.0)", svez.intent.points === 40, String(svez.intent.points));
  proveri("intent.signalsCounted je 1", svez.intent.signalsCounted === 1, String(svez.intent.signalsCounted));

  console.log("\n4. Ista namera od pre 200 dana");
  const star = scoreLead([{ kind: "pitao_cenu", observedAt: NOW - 200 * DAN }], PRAVILA, NOW);
  proveri("intent.points je 4 (faktor 0.1)", star.intent.points === 4, String(star.intent.points));

  console.log("\n5. Fit se ne gasi — nema sajt od pre 400 dana");
  const fitStar = scoreLead([{ kind: "nema_sajt", observedAt: NOW - 400 * DAN }], PRAVILA, NOW);
  proveri("fit.points je 30 (bez slabljenja)", fitStar.fit.points === 30, String(fitStar.fit.points));

  console.log("\n6. Deset komentara iste osobe ne prave deset puta vruć lead");
  const deset = scoreLead(
    Array.from({ length: 10 }, (_, i) => ({ kind: "komentar", observedAt: NOW - (i + 1) * DAN })),
    PRAVILA,
    NOW,
  );
  proveri("intent.points je 10 (broji se jednom)", deset.intent.points === 10, String(deset.intent.points));
  proveri("uzet je najskoriji opažaj", deset.intent.contributions[0]?.observedAt === NOW - 1 * DAN, String(deset.intent.contributions[0]?.observedAt));

  console.log("\n7. Signal koji nijedno pravilo ne pokriva");
  const nepokriven = scoreLead([{ kind: "mention", observedAt: NOW }], PRAVILA, NOW);
  proveri("mention je u unmatchedSignalKinds", nepokriven.unmatchedSignalKinds.includes("mention"), JSON.stringify(nepokriven.unmatchedSignalKinds));
  proveri("unmatched stoji na leadu, ne na osi", !("unmatchedSignalKinds" in nepokriven.fit), "još uvek je na osi");

  console.log("\n8. Opažaj u budućnosti (greška u podacima) ostaje vidljiv");
  const buduci = scoreLead([{ kind: "pitao_cenu", observedAt: NOW + 5 * DAN }], PRAVILA, NOW);
  proveri("faktor je 1.0", buduci.intent.contributions[0]?.recencyFactor === 1.0, String(buduci.intent.contributions[0]?.recencyFactor));
  proveri("observedAt nije tiho popravljen na sada", buduci.intent.contributions[0]?.observedAt === NOW + 5 * DAN, String(buduci.intent.contributions[0]?.observedAt));

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
