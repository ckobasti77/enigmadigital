/**
 * ============================================================================
 * ULTRA: kontrast teksta — puni tokeni, bez providnosti (plan T08 §5.6, P6)
 * ============================================================================
 *
 *   npm run verify:ultra-kontrast
 *   node --import ./scripts/ts-hooks.mjs scripts/verify-ultra-kontrast.ts
 *
 * K1 pušta `scripts/contrast-check.mjs --strogo` (izmereni parovi tokena),
 * K2–K4 su statička pravila iz `lib/kontrast-cuvar.ts` (test pored): nema
 * `text-<token>/NN`, gole `opacity-*` ni sirove palete na tekstu.
 */
import { spawnSync } from "node:child_process";
import process from "node:process";
import { join } from "node:path";

import { procitajKontrast, proveriKontrast, uOpsegu, type NalazKontrasta } from "../lib/kontrast-cuvar";
import { KOREN, fajloviKoda, procitaj, rel } from "../lib/izvorni-kod.pomoc";

const nalazi: NalazKontrasta[] = [];

const k1 = spawnSync(process.execPath, [join(KOREN, "scripts/contrast-check.mjs"), "--strogo"], {
  encoding: "utf8",
});
const zbir = procitajKontrast(k1.stdout ?? "");
if (k1.status !== 0 || !zbir || zbir.pada > 0) {
  nalazi.push({
    putanja: "scripts/contrast-check.mjs",
    linija: 1,
    pravilo: "K1",
    poruka: zbir ? `pada ${zbir.pada} od ${zbir.ukupno} parova` : `izlaz nije pročitan (kod ${k1.status})`,
  });
}

const fajlovi = fajloviKoda(["components", "app"]).filter((f) => uOpsegu(rel(f)));
for (const f of fajlovi) nalazi.push(...proveriKontrast(rel(f), procitaj(f)));

console.log(
  `Kontrast tokena: ${zbir ? `pada ${zbir.pada} od ${zbir.ukupno}` : "nepoznato"}. Pregledano fajlova: ${fajlovi.length}.`,
);
if (nalazi.length === 0) {
  console.log("verify:ultra-kontrast: prolazi (K1–K4).");
  process.exit(0);
}
for (const n of nalazi) console.log(`  PAO  ${n.putanja}:${n.linija}  ${n.pravilo}  ${n.poruka}`);
console.log(`verify:ultra-kontrast: ${nalazi.length} nalaza.`);
process.exit(1);
