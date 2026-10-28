/**
 * ============================================================================
 * ULTRA: uloge dugmeta i jedna boja radnje (plan T08 §2.5, P6)
 * ============================================================================
 *
 *   npm run verify:ultra-dugmad
 *   node --import ./scripts/ts-hooks.mjs scripts/verify-ultra-dugmad.ts
 *
 * Pravila D1–D7 su u `lib/dugmad-cuvar.ts` (test pored). Pada kad postoji
 * dugme bez uloge ili sa `default`, ručno obojeno primarno dugme, boja modula
 * u shadcn sloju, ili kad boja modula u kodu pređe plafon.
 */
import process from "node:process";
import { join } from "node:path";

import {
  PLAFON_BOJE_MODULA,
  bojaModulaDozvoljena,
  brojBojeModula,
  proveriDugmad,
  proveriGlobals,
  proveriPrimitiv,
  type NalazDugmadi,
} from "../lib/dugmad-cuvar";
import { KOREN, fajloviKoda, procitaj, rel } from "../lib/izvorni-kod.pomoc";

const nalazi: NalazDugmadi[] = [];

nalazi.push(
  ...proveriPrimitiv("components/ui/button.tsx", procitaj(join(KOREN, "components/ui/button.tsx"))),
);
nalazi.push(...proveriGlobals(procitaj(join(KOREN, "app/globals.css"))));

const fajlovi = fajloviKoda(["components", "app"]).filter((f) => {
  const r = rel(f);
  return /\.tsx?$/.test(r) && !r.startsWith("app/api/") && r !== "components/ui/button.tsx";
});

let bojaModula = 0;
for (const f of fajlovi) {
  const r = rel(f);
  const tekst = procitaj(f);
  nalazi.push(...proveriDugmad(r, tekst));
  if (!bojaModulaDozvoljena(r)) bojaModula += brojBojeModula(r, tekst);
}

if (bojaModula > PLAFON_BOJE_MODULA) {
  nalazi.push({
    putanja: "lib/dugmad-cuvar.ts",
    linija: 1,
    pravilo: "D6",
    poruka: `boja modula u kodu: ${bojaModula} > plafon ${PLAFON_BOJE_MODULA}`,
  });
}

console.log(`Pregledano fajlova: ${fajlovi.length}. Boja modula van tri mesta: ${bojaModula} (plafon ${PLAFON_BOJE_MODULA}).`);
if (bojaModula < PLAFON_BOJE_MODULA) {
  console.log(`  Napomena: broj je pao — spusti PLAFON_BOJE_MODULA na ${bojaModula}.`);
}
if (nalazi.length === 0) {
  console.log("verify:ultra-dugmad: prolazi (D1–D7).");
  process.exit(0);
}
for (const n of nalazi) console.log(`  PAO  ${n.putanja}:${n.linija}  ${n.pravilo}  ${n.poruka}`);
console.log(`verify:ultra-dugmad: ${nalazi.length} nalaza.`);
process.exit(1);
