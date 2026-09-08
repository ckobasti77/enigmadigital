/**
 * ============================================================================
 * KOPIRA MAPLIBRE WORKER U `public/maplibre/` (GL6 §1)
 * ============================================================================
 *
 * ZAŠTO: `maplibre-gl@6.8.0` (ESM) izvodi URL svog web-workera iz
 * `import.meta.url` glavnog modula:
 *   new URL("./maplibre-gl-worker.mjs", import.meta.url)
 * U Next/Turbopack bundlu `import.meta.url` pokazuje na
 * `/_next/static/chunks/<chunk>.js`, pa worker traži
 * `/_next/static/chunks/maplibre-gl-worker.mjs` — fajl koji ne postoji.
 * Worker se pravi kroz Blob sa `import "<taj url>"`, pa 404 ostaje TIH: mapa
 * učita stil i sprite, ali nijedna pločica ni glif se ne parsira (worker ne
 * odgovara), a platno ostane prazno bez ijedne greške.
 *
 * POPRAVKA: kopiramo worker (i shared modul koji on uvozi relativno) u
 * `public/maplibre/`, pa `leads-map-canvas.tsx` pozove
 * `setWorkerUrl("/maplibre/maplibre-gl-worker.mjs")` pre prvog `new Map(...)`.
 *
 * Ovo se pokreće kroz `prebuild` (pre `next build`, tj. i na Vercelu) i
 * `postinstall` (da `next dev` posle `npm install` ima fajlove). `public/
 * maplibre/` je generisan i stoji u `.gitignore` — verzija prati
 * `package-lock`, ne git.
 *
 * Skripta PADA ako izvorni fajl ne postoji: tiho preskakanje bi vratilo baš
 * onaj prazan-platno bag koji rešava.
 */

import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OVDE = dirname(fileURLToPath(import.meta.url));
const KOREN = resolve(OVDE, "..");
const IZVOR = join(KOREN, "node_modules", "maplibre-gl", "dist");
const CILJ = join(KOREN, "public", "maplibre");

// Worker + shared (worker ga uvozi kao `from "./maplibre-gl-shared.mjs"`, pa
// mora da stoji pored njega). NE kopiraju se `-dev` varijante.
const FAJLOVI = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

function main() {
  mkdirSync(CILJ, { recursive: true });

  for (const ime of FAJLOVI) {
    const izvor = join(IZVOR, ime);
    if (!existsSync(izvor)) {
      console.error(
        `[copy-maplibre-worker] Nema ${izvor}. ` +
          "Da li je maplibre-gl instaliran (npm install)? Bez ovog fajla mapa " +
          "ostaje prazno platno, pa build namerno pada.",
      );
      process.exit(1);
    }
    copyFileSync(izvor, join(CILJ, ime));
    console.log(`[copy-maplibre-worker] ${ime} → public/maplibre/`);
  }
}

main();
