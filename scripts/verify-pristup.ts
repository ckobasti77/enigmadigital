/**
 * ============================================================================
 * ČUVAR PRISTUPA: nijedna javna Convex funkcija bez provere pozivaoca
 * ============================================================================
 *
 * Pokretanje:
 *
 *   npm run verify:pristup
 *   node --import ./scripts/ts-hooks.mjs scripts/verify-pristup.ts
 *
 * Prolazi kroz sve `.ts` fajlove u `convex/` (bez `_generated/` i testova) i
 * pada za svaku javnu `query` / `mutation` / `action` koja ne proverava ko je
 * poziva i nema komentar `// javno: <razlog>` u liniji tačno iznad definicije.
 * Pravila su u `lib/pristup-cuvar.ts` (i testirana u `lib/pristup-cuvar.test.ts`).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { convexPreskace, proveriPristup, type IzvorniFajl } from "../lib/pristup-cuvar";

const koren = fileURLToPath(new URL("../convex/", import.meta.url));

function skupi(dir: string, izlaz: IzvorniFajl[]): void {
  for (const ulaz of readdirSync(dir, { withFileTypes: true })) {
    const puna = join(dir, ulaz.name);
    if (ulaz.isDirectory()) {
      if (ulaz.name === "_generated" || ulaz.name === "node_modules") continue;
      skupi(puna, izlaz);
      continue;
    }
    if (!/\.tsx?$/.test(ulaz.name)) continue;
    if (/\.(test|spec)\.tsx?$/.test(ulaz.name) || ulaz.name.endsWith(".d.ts")) continue;
    // Convex ne deployuje fajl sa više tačaka u imenu (npr. `*.pomoc.ts`).
    if (convexPreskace(ulaz.name)) continue;
    izlaz.push({
      putanja: relative(koren, puna).replace(/\\/g, "/"),
      tekst: readFileSync(puna, "utf8"),
    });
  }
}

const fajlovi: IzvorniFajl[] = [];
skupi(koren, fajlovi);
const rezultat = proveriPristup(fajlovi);

const ukupno =
  rezultat.omotacem.length +
  rezultat.proverene.length +
  rezultat.javne.length +
  rezultat.pale.length;
console.log(
  `Javnih Convex funkcija: ${ukupno} (omotačem ${rezultat.omotacem.length}, ` +
    `sa proverom ${rezultat.proverene.length}, ` +
    `označene kao javne ${rezultat.javne.length}, bez provere ${rezultat.pale.length}).`,
);
for (const j of rezultat.javne) {
  console.log(`  javno  convex/${j.putanja}:${j.linija} ${j.ime} — ${j.obrazlozenje}`);
}

if (rezultat.pale.length > 0) {
  console.error("\nJavne funkcije bez provere pristupa:");
  for (const p of rezultat.pale) {
    console.error(`  convex/${p.putanja}:${p.linija} ${p.ime} (${p.vrsta}) — ${p.razlog}`);
  }
  console.error(
    "\nDodaj proveru prijave i članstva, pretvori funkciju u internu, ili (samo kad " +
      "funkcija namerno radi bez prijave) dodaj `// javno: <razlog>` u liniju iznad.",
  );
  process.exit(1);
}
console.log("\nČuvar pristupa: sve javne funkcije proveravaju pozivaoca ili su označene.");
