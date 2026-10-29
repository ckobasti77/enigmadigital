// S28: od čega je sastavljeno prvo učitavanje rute, po izvornom fajlu.
// Čita `.next/diagnostics/analyze/data/<ruta>/analyze.data` (izlaz `next experimental-analyze --output`).
// Analizator kompajlira sam, pa se imena komada ne poklapaju sa buildom; lenji komadi se zato
// prepoznaju po sadržaju (cilj dinamičkog uvoza), a zbir se poredi sa route-bundle-stats.json.
//
// Upotreba (Git Bash: MSYS_NO_PATHCONV=1): node .nocni-run/spajanje/alati/s28-moduli.mjs [--svi] <ruta> ...
//   --svi  štampa i najveće izvore radnog dela

import { readFileSync, statSync } from "node:fs";
import path from "node:path";

const koren = process.cwd();
const args = process.argv.slice(2);
const svi = args.includes("--svi");
const rute = args.filter((a) => a !== "--svi");
const stats = JSON.parse(readFileSync(path.join(koren, ".next/diagnostics/route-bundle-stats.json"), "utf8"));

// Rezervno, kad ruta nema route-bundle-stats: cilj dinamičkog uvoza ili polifil koji moderni pregledač ne učitava.
const LENJO =
  /prosemirror|@tiptap|read-excel-file|fflate|@xyflow|maplibre-gl|node_modules\/three\/|polyfill-nomodule|components\/app\/prostor\/mape\/(?!index)|components\/app\/prostor\/editor\/(rich-text-editor|note-file-node|link-dijalog)|components\/app\/leadovi\/leads-map-canvas/;

// Fajlovi dodati u runu (git diff --diff-filter=A od početka runa), da se vidi šta je spajanje dodalo.
const DODATO = new Set(
  readFileSync(path.join(koren, ".nocni-run/spajanje/tmp/s28/dodato.txt"), "utf8")
    .split(/\s+/)
    .filter(Boolean),
);
// Base UI delovi koje su doneli tek primitivi dodati u runu.
const BASE_UI_NOVO = /@base-ui\/react\/(drawer|context-menu|toast|avatar|progress|scroll-area)\//;

function ucitaj(ruta) {
  const fajl = path.join(koren, ".next/diagnostics/analyze/data", ruta === "/" ? "" : ruta, "analyze.data");
  const b = readFileSync(fajl);
  const n = b.readUInt32BE(0);
  return JSON.parse(b.subarray(4, 4 + n).toString("utf8"));
}

function grupa(p) {
  const nm = p.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/);
  if (nm) return `paket ${nm[1]}`;
  if (/components\/app\/prostor\/|lib\/prostor\/|convex\/prostor\//.test(p)) return "radni deo (prostor)";
  const rel = p.replace(/^\[project\]\//, "");
  if (/^(components|lib|app|convex|hooks)\//.test(rel)) return `Enigma ${rel.split("/").slice(0, 2).join("/")}`;
  return "ostalo";
}

const kb = (b) => (b / 1024).toFixed(1);
const rezultat = {};

for (const ruta of rute) {
  const st = stats.find((s) => s.route === ruta);
  const a = ucitaj(ruta);
  const kes = new Map();
  const puna = (i) => {
    if (kes.has(i)) return kes.get(i);
    const s = a.sources[i];
    const p = s.parent_source_index == null ? s.path : puna(s.parent_source_index) + s.path;
    kes.set(i, p);
    return p;
  };
  const fajlovi = a.output_files.map((f) => f.filename);
  const komadi = new Map();
  for (const cp of a.chunk_parts) {
    const f = fajlovi[cp.output_file_index];
    if (!/\[client-fs\].*\/static\/chunks\/.*\.js$/.test(f)) continue;
    if (!komadi.has(f)) komadi.set(f, []);
    komadi.get(f).push([puna(cp.source_index), cp.size]);
  }
  // Komad je u prvom učitavanju ako mu par po veličini postoji među `firstLoadChunkPaths`
  // builda (analizator broji ~43 B manje od fajla). Bez para je lenj (dinamički uvoz).
  const buildVelicine = st
    ? st.firstLoadChunkPaths.map((c) => statSync(path.join(koren, c.replaceAll("\\", "/"))).size)
    : [];
  const iskorisceno = new Set();
  const uPrvom = (zbir) => {
    let najbolji = -1;
    let razlika = Infinity;
    buildVelicine.forEach((v, i) => {
      const d = Math.abs(v - zbir - 43);
      if (!iskorisceno.has(i) && d < razlika) {
        razlika = d;
        najbolji = i;
      }
    });
    if (najbolji >= 0 && razlika <= 160) {
      iskorisceno.add(najbolji);
      return true;
    }
    return false;
  };
  let prvo = 0;
  let lenjo = 0;
  let spajanje = 0;
  const poGrupi = new Map();
  const radniIzvori = new Map();
  const sortirano = [...komadi.values()]
    .map((delovi) => ({ delovi, zbir: delovi.reduce((s, [, v]) => s + v, 0) }))
    .sort((a, b) => b.zbir - a.zbir);
  for (const { delovi, zbir } of sortirano) {
    if (st ? !uPrvom(zbir) : delovi.some(([p]) => LENJO.test(p))) {
      lenjo += zbir;
      continue;
    }
    prvo += zbir;
    for (const [p, v] of delovi) {
      const rel = p.replace(/^\[project\]\//, "");
      if (DODATO.has(rel) || BASE_UI_NOVO.test(rel)) spajanje += v;
      const g = grupa(p);
      poGrupi.set(g, (poGrupi.get(g) ?? 0) + v);
      if (g === "radni deo (prostor)") radniIzvori.set(rel, (radniIzvori.get(rel) ?? 0) + v);
    }
  }
  const radni = poGrupi.get("radni deo (prostor)") ?? 0;
  rezultat[ruta] = {
    buildKb: st ? Math.round(st.firstLoadUncompressedJsBytes / 1024) : null,
    prvoKb: Math.round(prvo / 1024),
    radniKb: Math.round(radni / 1024),
    spajanjeKb: Math.round(spajanje / 1024),
  };
  console.log(
    `\n=== ${ruta}: prvo učitavanje ${kb(prvo)} KB po analizatoru (build: ${st ? kb(st.firstLoadUncompressedJsBytes) : "?"} KB), lenjo ${kb(lenjo)} KB ===`,
  );
  console.log(`radni deo (prostor): ${kb(radni)} KB; sve što je spajanje dodalo (novi fajlovi + novi Base UI delovi): ${kb(spajanje)} KB`);
  for (const [g, v] of [...poGrupi].sort((x, y) => y[1] - x[1]).slice(0, 18)) console.log(`${kb(v).padStart(8)} KB  ${g}`);
  if (svi) {
    console.log("--- izvori radnog dela ---");
    for (const [p, v] of [...radniIzvori].sort((x, y) => y[1] - x[1]).slice(0, 70)) console.log(`${kb(v).padStart(8)} KB  ${p}`);
  }
}
console.log("\n" + JSON.stringify(rezultat));
