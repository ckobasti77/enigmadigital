/**
 * ============================================================================
 * ULTRA: nijedan tekst ispod 12 px i mono samo gde ima smisla (plan T08 §4.6, §6.4; P2, P6)
 * ============================================================================
 *
 *   npm run verify:ultra-tipografija
 *   node --import ./scripts/ts-hooks.mjs scripts/verify-ultra-tipografija.ts
 *
 * Pravila T1–T4 i M1–M3 su u `lib/tipografija-cuvar.ts` (test pored). Pada kad
 * klasa, `fontSize` (i osa Recharts grafikona), SVG tekst ili korak skale
 * padne ispod 12 px, kad `font-mono` stoji uz fokus broj ili u sistemskoj
 * komponenti, ili kad broj `font-mono` pređe plafon.
 */
import process from "node:process";
import { join } from "node:path";

import {
  PLAFON_MONO,
  brojMono,
  brojiMono,
  proveriCss,
  proveriTipografiju,
  type NalazTipografije,
} from "../lib/tipografija-cuvar";
import { KOREN, fajloviKoda, procitaj, rel } from "../lib/izvorni-kod.pomoc";

const nalazi: NalazTipografije[] = [];
nalazi.push(...proveriCss("app/globals.css", procitaj(join(KOREN, "app/globals.css"))));

const fajlovi = fajloviKoda(["components", "app"]).filter((f) => !rel(f).startsWith("app/api/"));

// Pod (T13): prazan ili pogrešan skup fajlova ne sme da prođe kao „čisto".
if (fajlovi.length < 300) {
  console.log(`verify:ultra-tipografija: pregledano samo ${fajlovi.length} fajlova (očekivano bar 300)`);
  process.exit(1);
}

let mono = 0;
for (const f of fajlovi) {
  const r = rel(f);
  const tekst = procitaj(f);
  nalazi.push(...proveriTipografiju(r, tekst));
  if (brojiMono(r)) mono += brojMono(r, tekst);
}

if (mono > PLAFON_MONO) {
  nalazi.push({
    putanja: "lib/tipografija-cuvar.ts",
    linija: 1,
    pravilo: "M3",
    poruka: `font-mono u kodu: ${mono} > plafon ${PLAFON_MONO}`,
  });
}

console.log(`Pregledano fajlova: ${fajlovi.length} (+ app/globals.css). font-mono: ${mono} (plafon ${PLAFON_MONO}).`);
if (mono < PLAFON_MONO) console.log(`  Napomena: broj je pao — spusti PLAFON_MONO na ${mono}.`);
if (nalazi.length === 0) {
  console.log("verify:ultra-tipografija: prolazi (T1–T4, M1–M3).");
  process.exit(0);
}
for (const n of nalazi) console.log(`  PAO  ${n.putanja}:${n.linija}  ${n.pravilo}  ${n.poruka}`);
console.log(`verify:ultra-tipografija: ${nalazi.length} nalaza.`);
process.exit(1);
