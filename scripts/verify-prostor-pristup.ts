/**
 * ============================================================================
 * ČUVAR PRISTUPA RADNOG DELA (SPAJANJE, plan S01 §3.7, P25)
 * ============================================================================
 *
 *   npm run verify:prostor-pristup
 *   node --import ./scripts/ts-hooks.mjs scripts/verify-prostor-pristup.ts
 *
 * Prolazi kroz `convex/prostor/**` (bez testova i `*.pomoc.ts`) i pada kad
 * projektni omotač nema `uloga: "urednik"`/`"owner"`, kad postoji `// javno:`,
 * `.unique()` nad `members`, čitanje `role === "admin"` ili Devotion tabela.
 * Pravila su u `lib/prostor-pristup-cuvar.ts` (test pored).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { proveriProstor, type NalazProstora } from "../lib/prostor-pristup-cuvar";
import { convexPreskace, type IzvorniFajl } from "../lib/pristup-cuvar";

const koren = fileURLToPath(new URL("../", import.meta.url));
const korenConvex = join(koren, "convex");
const prostor = join(korenConvex, "prostor");

function skupi(dir: string, izlaz: IzvorniFajl[]): void {
  for (const ulaz of readdirSync(dir, { withFileTypes: true })) {
    const puna = join(dir, ulaz.name);
    if (ulaz.isDirectory()) {
      skupi(puna, izlaz);
      continue;
    }
    if (!/\.ts$/.test(ulaz.name) || ulaz.name.endsWith(".d.ts")) continue;
    if (/\.(test|spec)\.ts$/.test(ulaz.name) || convexPreskace(ulaz.name)) continue;
    izlaz.push({
      putanja: relative(korenConvex, puna).replace(/\\/g, "/"),
      tekst: readFileSync(puna, "utf8"),
    });
  }
}

if (!existsSync(prostor)) {
  console.log("verify:prostor-pristup: fascikla convex/prostor ne postoji.");
  process.exit(1);
}

const fajlovi: IzvorniFajl[] = [];
skupi(prostor, fajlovi);
// Pod: prazan skup fajlova ne sme da prođe kao „čisto“.
if (fajlovi.length < 5) {
  console.log(`verify:prostor-pristup: pregledano samo ${fajlovi.length} fajlova (očekivano bar 5).`);
  process.exit(1);
}

const nalazi: NalazProstora[] = fajlovi.flatMap((f) => proveriProstor(f));
console.log(`Pregledano fajlova radnog dela: ${fajlovi.length}.`);
if (nalazi.length === 0) {
  console.log("verify:prostor-pristup: prolazi (P1–P5).");
  process.exit(0);
}
for (const n of nalazi) console.log(`  PAO  convex/${n.putanja}:${n.linija}  ${n.pravilo}  ${n.poruka}`);
console.log(`verify:prostor-pristup: ${nalazi.length} nalaza.`);
process.exit(1);
