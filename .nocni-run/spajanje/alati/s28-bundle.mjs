// S28: veličine ruta i teški paketi u prvom učitavanju, iz izlaza `next build`.
// Turbopack build ne štampa KB po ruti, pa se čita `.next/diagnostics/route-bundle-stats.json`
// (firstLoadChunkPaths po ruti) i svaki komad se pretražuje po potpisu biblioteke.
//
// Upotreba: node .nocni-run/spajanje/alati/s28-bundle.mjs <oznaka>
// Piše .nocni-run/spajanje/tmp/s28/bundle-<oznaka>.json i štampa tabelu.

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";

const koren = process.cwd();
const oznaka = process.argv[2] ?? "sada";
const stats = JSON.parse(readFileSync(path.join(koren, ".next/diagnostics/route-bundle-stats.json"), "utf8"));

// Potpisi su nizovi koji postoje samo u kodu te biblioteke (provereno nad komadima builda).
const POTPISI = {
  tiptap: ["ProseMirror-separator"],
  xyflow: ["react-flow__renderer"],
  "read-excel-file": ["Sheet relation ID not found"],
  "web-push": ["WebPushError", "aes128gcm", "setVapidDetails"],
  maplibre: ["maplibregl"],
  three: ["WebGLRenderer"],
  recharts: ["recharts-wrapper"],
};

const kes = new Map();
function komad(rel) {
  const p = path.join(koren, rel.replaceAll("\\", "/"));
  if (!kes.has(p)) {
    const buf = readFileSync(p);
    const tekst = buf.toString("utf8");
    const lib = Object.entries(POTPISI)
      .filter(([, niz]) => niz.some((s) => tekst.includes(s)))
      .map(([ime]) => ime);
    kes.set(p, { bajtovi: buf.length, gzip: gzipSync(buf).length, lib });
  }
  return kes.get(p);
}

const kb = (b) => Math.round(b / 1024);

const RUTE_APP = (r) =>
  r.startsWith("/[projekat]") ||
  ["/", "/beleske", "/inbox", "/moji-zadaci", "/novi", "/otvori", "/poruke", "/projekti"].includes(r);

const rute = stats
  .map((s) => {
    const delovi = s.firstLoadChunkPaths.map((c) => ({ c, ...komad(c) }));
    return {
      ruta: s.route,
      komada: delovi.length,
      kb: kb(delovi.reduce((a, d) => a + d.bajtovi, 0)),
      gzipKb: kb(delovi.reduce((a, d) => a + d.gzip, 0)),
      lib: [...new Set(delovi.flatMap((d) => d.lib))].sort(),
      komadi: s.firstLoadChunkPaths,
    };
  })
  .sort((a, b) => a.ruta.localeCompare(b.ruta));

// Ljuska = komadi koje dele sve rute iza prijave (layout `(app)`).
const appRute = rute.filter((r) => RUTE_APP(r.ruta));
const ljuska = appRute
  .map((r) => new Set(r.komadi))
  .reduce((a, s) => new Set([...a].filter((c) => s.has(c))));
const ljuskaDelovi = [...ljuska].map((c) => komad(c));
const ljuskaInfo = {
  komada: ljuska.size,
  kb: kb(ljuskaDelovi.reduce((a, d) => a + d.bajtovi, 0)),
  gzipKb: kb(ljuskaDelovi.reduce((a, d) => a + d.gzip, 0)),
  lib: [...new Set(ljuskaDelovi.flatMap((d) => d.lib))].sort(),
};

// Gde u celom buildu žive teške biblioteke (i da li ih ijedna ruta vuče u prvom učitavanju).
const sviKomadi = readdirSync(path.join(koren, ".next/static/chunks")).filter((f) => f.endsWith(".js"));
const prvoUcitani = new Set(rute.flatMap((r) => r.komadi.map((c) => path.basename(c))));
const biblioteke = {};
for (const f of sviKomadi) {
  const d = komad(path.join(".next/static/chunks", f));
  for (const ime of d.lib) {
    (biblioteke[ime] ??= []).push({ komad: f, kb: kb(d.bajtovi), prvoUcitavanje: prvoUcitani.has(f) });
  }
}

const izlaz = { oznaka, ljuska: ljuskaInfo, rute: rute.map(({ komadi, ...r }) => r), biblioteke };
mkdirSync(path.join(koren, ".nocni-run/spajanje/tmp/s28"), { recursive: true });
writeFileSync(path.join(koren, `.nocni-run/spajanje/tmp/s28/bundle-${oznaka}.json`), JSON.stringify(izlaz, null, 2));

console.log(`Ljuska (zajedničko svim rutama iza prijave): ${ljuskaInfo.komada} komada, ${ljuskaInfo.kb} KB (gzip ${ljuskaInfo.gzipKb} KB), biblioteke: ${ljuskaInfo.lib.join(", ") || "—"}`);
console.log("");
console.log("   KB   gzip  komada  ruta  [teške biblioteke u prvom učitavanju]");
for (const r of rute) {
  console.log(
    `${String(r.kb).padStart(5)}  ${String(r.gzipKb).padStart(5)}  ${String(r.komada).padStart(6)}  ${r.ruta}${r.lib.length ? "  [" + r.lib.join(", ") + "]" : ""}`,
  );
}
console.log("");
for (const [ime, lista] of Object.entries(biblioteke)) {
  console.log(`${ime}: ${lista.map((l) => `${l.komad} (${l.kb} KB${l.prvoUcitavanje ? ", PRVO UČITAVANJE" : ", lenjo"})`).join("; ")}`);
}
for (const ime of Object.keys(POTPISI)) if (!biblioteke[ime]) console.log(`${ime}: nema ga ni u jednom klijentskom komadu`);
