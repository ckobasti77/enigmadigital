/**
 * ============================================================================
 * MERENJE UMESTO UKUSA: raznolikost kolona tabele leadova (A3 §3, plan §4/2)
 * ============================================================================
 *
 * Pokretanje:
 *   npm run verify:leads-ui
 *   npm run verify:leads-ui -- --json nocni-run/ux/leads-presek.json
 *
 * Šta dokazuje:
 *   1. Nijedna kolona (osim naziva firme) nema ISTU vrednost u više od 90 %
 *      redova — merено nad istim funkcijama iz `lead-columns.ts` kojima tabela
 *      crta ćelije, ne nad procenom.
 *   2. Uklonjene kolone (Intent, Faza, Poslednji dodir, „N signala",
 *      Temperatura kao `<select>`) se ne vraćaju: `LEAD_COLUMNS` ih ne sadrži,
 *      a izvor tabele ne crta njihova zaglavlja ni `TemperatureSelect`.
 *   3. Za poređenje se izmeri i STARI skup kolona nad istim redovima — brojem,
 *      ne pričom (na produkciji 9.9.2026: 100 % u šest kolona).
 *
 * Ulaz: podrazumevano sintetički redovi razvojnog prikaza (`app/dev-ux/
 * fixtures.ts`, 25 firmi kalibrisanih na izmereno stanje produkcije). Uz
 * `--json <fajl>` čita stvarni presek: `{ items: LeadRowItem[], scores:
 * Record<companyId, LeadScore>, now?: number }` — oblik koji vraćaju
 * `listLeadsFiltered` i `scoreCompanies`. Skript ne ide na mrežu i ne
 * ispisuje imena ni brojeve — samo udele.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { getFunctionName } from "convex/server";
import { api } from "../convex/_generated/api";
import type { LeadScore } from "../convex/lib/leadScoring";
import { resolveFixture } from "../app/dev-ux/fixtures";
import type { LeadRowItem } from "../components/app/leadovi/lead-urgency";
import {
  ENTROPY_EXEMPT,
  LEAD_COLUMNS,
  LEAD_COLUMN_LABEL,
  MAX_SAME_SHARE,
  REMOVED_COLUMNS,
  columnValues,
  legacyColumnValues,
} from "../components/app/leadovi/lead-columns";

let pao = 0;
function proveri(naziv: string, uslov: boolean, detalj: string): void {
  if (uslov) console.log(`  OK   ${naziv}`);
  else {
    pao++;
    console.log(`  PAO  ${naziv} -> ${detalj}`);
  }
}

const argv = process.argv.slice(2);
const jsonIdx = argv.indexOf("--json");
const jsonPath = jsonIdx !== -1 ? argv[jsonIdx + 1] : null;

type Ulaz = { items: LeadRowItem[]; scores: Record<string, LeadScore>; now?: number; selfUserId?: string };

function ucitaj(): { ulaz: Ulaz; izvor: string } {
  if (jsonPath) {
    const raw = JSON.parse(readFileSync(jsonPath, "utf8")) as Ulaz;
    return { ulaz: raw, izvor: `stvarni presek iz ${jsonPath}` };
  }
  const lista = resolveFixture(getFunctionName(api.leadFiltersStore.listLeadsFiltered), {}) as {
    items: LeadRowItem[];
    now: number;
  };
  const scores = resolveFixture(getFunctionName(api.leadScoringStore.scoreCompanies), {
    companyIds: lista.items.map((i) => i.company?._id),
  }) as Record<string, LeadScore>;
  return {
    ulaz: { items: lista.items, scores, now: lista.now },
    izvor: "sintetički redovi razvojnog prikaza (app/dev-ux/fixtures.ts)",
  };
}

const { ulaz, izvor } = ucitaj();
const now = ulaz.now ?? Date.now();
const redova = ulaz.items.length;

console.log(`Tabela leadova — raznolikost kolona\n  izvor: ${izvor}\n  redova: ${redova}\n`);

if (redova === 0) {
  console.log("  PAO  nema redova za merenje");
  process.exit(1);
}

type Udeo = { vrednost: string; udeo: number; razlicitih: number };

function najcesca(vrednosti: string[]): Udeo {
  const brojaci = new Map<string, number>();
  for (const v of vrednosti) brojaci.set(v, (brojaci.get(v) ?? 0) + 1);
  let top: [string, number] = ["", 0];
  for (const par of brojaci) if (par[1] > top[1]) top = par;
  return { vrednost: top[0], udeo: top[1] / vrednosti.length, razlicitih: brojaci.size };
}

const pct = (x: number) => `${Math.round(x * 100)} %`;

// ── 1. Nove kolone ───────────────────────────────────────────────────────────
console.log("Nove kolone (A3):");
const novi = ulaz.items.map((item) =>
  columnValues(item, item.company ? ulaz.scores[item.company._id] : undefined, now, ulaz.selfUserId),
);
const izmereno: Record<string, Udeo> = {};
for (const kolona of LEAD_COLUMNS) {
  const u = najcesca(novi.map((r) => r[kolona]));
  izmereno[kolona] = u;
  const izuzeta = ENTROPY_EXEMPT.includes(kolona);
  const naziv = `${LEAD_COLUMN_LABEL[kolona].padEnd(14)} najčešće ${pct(u.udeo).padStart(5)} · ${u.razlicitih} različitih`;
  if (izuzeta) console.log(`  --   ${naziv} (identitet reda, ne meri se)`);
  else if (kolona === "vlasnik" && u.udeo > MAX_SAME_SHARE)
    // Vlasnik SME da bude jednoličan — zato se crta samo kad ima > 1 člana.
    console.log(`  --   ${naziv} (crta se samo uz > 1 člana radnog prostora)`);
  else proveri(naziv, u.udeo <= MAX_SAME_SHARE, `preko ${pct(MAX_SAME_SHARE)} istih vrednosti — mrtva kolona`);
}

// ── 2. Uklonjene kolone se ne vraćaju ────────────────────────────────────────
console.log("\nUklonjene kolone:");
const vracene = (REMOVED_COLUMNS as readonly string[]).filter((k) => (LEAD_COLUMNS as readonly string[]).includes(k));
proveri("nijedna uklonjena kolona nije u LEAD_COLUMNS", vracene.length === 0, vracene.join(", "));

const tabelaSrc = readFileSync(
  fileURLToPath(new URL("../components/app/leadovi/leads-table.tsx", import.meta.url)),
  "utf8",
);
proveri("tabela ne crta <select> temperature u redu", !tabelaSrc.includes("TemperatureSelect"), "TemperatureSelect je vraćen u leads-table.tsx");
for (const natpis of ["Poslednji dodir", ">Faza<", ">Temperatura<"]) {
  proveri(
    `tabela nema zaglavlje „${natpis.replace(/[<>]/g, "")}”`,
    !tabelaSrc.includes(natpis),
    `„${natpis}” je vraćen u leads-table.tsx`,
  );
}
proveri(
  "kolona „Vlasnik” je uslovna (showOwner)",
  /showOwner\s*&&\s*<TableHead/.test(tabelaSrc),
  "zaglavlje Vlasnik se crta bezuslovno",
);

// ── 3. Stare kolone nad istim redovima — dokaz zašto su uklonjene ───────────
console.log("\nStare kolone nad istim redovima (pre A3):");
const stari = ulaz.items.map((item) =>
  legacyColumnValues(item, item.company ? ulaz.scores[item.company._id] : undefined, now),
);
const NATPIS_STARI: Record<(typeof REMOVED_COLUMNS)[number], string> = {
  intent: "Intent",
  faza: "Faza",
  poslednjiDodir: "Poslednji dodir",
  signaliBroj: "Signali (broj)",
  temperatura: "Temperatura",
};
for (const kolona of REMOVED_COLUMNS) {
  const u = najcesca(stari.map((r) => r[kolona]));
  console.log(`  --   ${NATPIS_STARI[kolona].padEnd(16)} najčešće ${pct(u.udeo).padStart(5)} · ${u.razlicitih} različitih`);
}

console.log("");
if (pao > 0) {
  console.log(`NEUSPEH: ${pao} ${pao === 1 ? "provera" : "provere"} pala.`);
  process.exit(1);
}
console.log("Sve provere prolaze.");
