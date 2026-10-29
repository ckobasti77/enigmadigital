/**
 * ============================================================================
 * ČUVAR DIZAJN SISTEMA RADNOG DELA (SPAJANJE S27, P2, P3, P11, P12, P25)
 * ============================================================================
 *
 *   npm run verify:prostor-dizajn
 *   node --import ./scripts/ts-hooks.mjs scripts/verify-prostor-dizajn.ts
 *
 * Ceo front (`components/`, `app/`, `lib/`): bez Radixa, `framer-motion`-a,
 * `sonner`-a, `next-themes`-a i pisma Geist. Radni deo (`components/app/prostor`,
 * `lib/prostor` i ljuska „Ja“): samo tokeni, bez boje modula, bez svetle teme,
 * bez nadnaslova i kartice u kartici. `app/globals.css`: samo tamna tema.
 * Pravila su u `lib/prostor-dizajn-cuvar.ts` (test pored).
 */
import process from "node:process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  RADNI_DEO_FASCIKLE,
  proveriCssRadnogDela,
  proveriGlobalsTemu,
  proveriKod,
  proveriPakete,
  uRadnomDelu,
  type NalazDizajna,
} from "../lib/prostor-dizajn-cuvar";
import { KOREN, fajloviKoda, procitaj, rel } from "../lib/izvorni-kod.pomoc";

// Čuvari opisuju zabranjene obrasce, pa sebe ne proveravaju.
const fajlovi = fajloviKoda(["components", "app", "lib"]).filter((f) => {
  const r = rel(f);
  return !r.startsWith("app/api/") && !/-cuvar\.ts$/.test(r);
});
const radni = fajlovi.filter((f) => uRadnomDelu(rel(f)));

// Pod: prazan ili pogrešan skup fajlova ne sme da prođe kao „čisto".
if (fajlovi.length < 600 || radni.length < 250) {
  console.log(
    `verify:prostor-dizajn: pregledano samo ${fajlovi.length} fajlova (radni deo ${radni.length}; očekivano bar 600 i 250)`,
  );
  process.exit(1);
}

function cssFajlovi(dir: string, izlaz: string[]): string[] {
  for (const ime of readdirSync(dir)) {
    const puna = join(dir, ime);
    if (statSync(puna).isDirectory()) cssFajlovi(puna, izlaz);
    else if (ime.endsWith(".css")) izlaz.push(puna);
  }
  return izlaz;
}

const nalazi: NalazDizajna[] = [];
for (const f of fajlovi) nalazi.push(...proveriKod(rel(f), procitaj(f)));

const css = RADNI_DEO_FASCIKLE.flatMap((p) => cssFajlovi(join(KOREN, p), []));
for (const f of css) nalazi.push(...proveriCssRadnogDela(rel(f), procitaj(f)));

nalazi.push(...proveriGlobalsTemu("app/globals.css", procitaj(join(KOREN, "app/globals.css"))));
nalazi.push(...proveriPakete(JSON.parse(procitaj(join(KOREN, "package.json")))));

console.log(
  `Pregledano: ${fajlovi.length} fajlova koda (radni deo ${radni.length}), ${css.length} CSS fajlova radnog dela, app/globals.css, package.json.`,
);
if (nalazi.length === 0) {
  console.log("verify:prostor-dizajn: prolazi (PD1–PD8).");
  process.exit(0);
}
for (const n of nalazi) console.log(`  PAO  ${n.putanja}:${n.linija}  ${n.pravilo}  ${n.poruka}`);
console.log(`verify:prostor-dizajn: ${nalazi.length} nalaza.`);
process.exit(1);
