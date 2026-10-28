/**
 * ============================================================================
 * ULTRA: jedan izbor i jedan format (plan T08 §7.4 i §8.4, P6)
 * ============================================================================
 *
 *   npm run verify:ultra-format
 *   node --import ./scripts/ts-hooks.mjs scripts/verify-ultra-format.ts
 *
 * F1 nema izvornog `<select>`, F2 svaki `<Select>` ima ime, F3 nema
 * `toLocale*String`/`Intl.*` u kodu ekrana, F4 `.toFixed()` ne ide u tekst,
 * F5 nema `{x}%` u JSX tekstu. Pravila su u `lib/format-cuvar.ts`.
 */
import process from "node:process";

import { proveriFormat, uOpsegu, type NalazFormata } from "../lib/format-cuvar";
import { fajloviKoda, procitaj, rel } from "../lib/izvorni-kod.pomoc";

const fajlovi = fajloviKoda(["components", "app"]).filter((f) => uOpsegu(rel(f)));
// Pod (T13): prazan ili pogrešan skup fajlova ne sme da prođe kao „čisto".
if (fajlovi.length < 300) {
  console.log(`verify:ultra-format: pregledano samo ${fajlovi.length} fajlova (očekivano bar 300)`);
  process.exit(1);
}

const nalazi: NalazFormata[] = [];
for (const f of fajlovi) nalazi.push(...proveriFormat(rel(f), procitaj(f)));

console.log(`Pregledano fajlova: ${fajlovi.length}.`);
if (nalazi.length === 0) {
  console.log("verify:ultra-format: prolazi (F1–F5).");
  process.exit(0);
}
for (const n of nalazi) console.log(`  PAO  ${n.putanja}:${n.linija}  ${n.pravilo}  ${n.poruka}`);
console.log(`verify:ultra-format: ${nalazi.length} nalaza.`);
process.exit(1);
