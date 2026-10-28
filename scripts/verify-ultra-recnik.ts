/**
 * ============================================================================
 * ULTRA: rečnik i sirovi nazivi (plan T08 §9.6, O15, P6)
 * ============================================================================
 *
 *   npm run verify:ultra-recnik
 *   node --import ./scripts/ts-hooks.mjs scripts/verify-ultra-recnik.ts
 *
 * R1–R8 nad vidljivim tekstom u `components/` i `app/` (bez API ruta,
 * fikstura i pravnih strana), R9 nad porukama grešaka u `convex/`. Pravila su
 * u `lib/recnik-cuvar.ts`.
 */
import process from "node:process";

import {
  DODATNA_ENV_IMENA,
  IZUZECI,
  izuzeciBezRazloga,
  proveriRecnik,
  proveriServer,
  uOpsegu,
  type NalazRecnika,
} from "../lib/recnik-cuvar";
import { envCitanja, fajloviKoda, procitaj, rel } from "../lib/izvorni-kod.pomoc";

const envImena = new Set<string>(DODATNA_ENV_IMENA);
for (const f of fajloviKoda(["convex", "lib"])) {
  for (const t of envCitanja(f, procitaj(f))) envImena.add(t.tekst);
}
// NODE_ENV nije podešavanje servera nego ime okruženja; ne pojavljuje se u tekstu.
envImena.delete("NODE_ENV");

const ekrani = fajloviKoda(["components", "app"]).filter((f) => uOpsegu(rel(f)));
const server = fajloviKoda(["convex"]);
const nalazi: NalazRecnika[] = [];
for (const f of ekrani) nalazi.push(...proveriRecnik(rel(f), procitaj(f), envImena));
for (const f of server) nalazi.push(...proveriServer(rel(f), procitaj(f), envImena));

const losi = izuzeciBezRazloga(IZUZECI);
for (const i of losi) console.log(`  PAO  izuzetak bez razloga: ${i.fajl}`);

console.log(
  `Pregledano: ${ekrani.length} fajlova ekrana, ${server.length} fajlova servera; env imena: ${envImena.size}.`,
);
if (nalazi.length === 0 && losi.length === 0) {
  console.log("verify:ultra-recnik: prolazi (R1–R9).");
  process.exit(0);
}
for (const n of nalazi) console.log(`  PAO  ${n.putanja}:${n.linija}  ${n.pravilo}  ${n.isecak}`);
console.log(`verify:ultra-recnik: ${nalazi.length + losi.length} nalaza.`);
process.exit(1);
