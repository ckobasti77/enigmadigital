// S28: zašto je fajl u prvom učitavanju — najkraći lanac STATIČKIH uvoza od ulaza do cilja.
// Dinamički uvozi (`import()`, `next/dynamic`) i `import type` se ne prate.
//
// Upotreba: node .nocni-run/spajanje/alati/s28-lanac.mjs <ulaz> <cilj-podniz> [<cilj-podniz> ...]
//   npr. node .nocni-run/spajanje/alati/s28-lanac.mjs "app/(app)/layout.tsx" task-checkpoint-list

import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const koren = process.cwd();
const [ulaz, ...ciljevi] = process.argv.slice(2);

function razresi(odFajla, spec) {
  let baza;
  if (spec.startsWith("@/")) baza = path.join(koren, spec.slice(2));
  else if (spec.startsWith(".")) baza = path.resolve(path.dirname(odFajla), spec);
  else return null;
  for (const k of ["", ".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.tsx"]) {
    const p = baza + k;
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}

function uvozi(fajl) {
  const tekst = readFileSync(fajl, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const out = [];
  const re = /(?:^|\n)\s*(import|export)\s+(type\s+)?([^;]*?)\s+from\s+["']([^"']+)["']|(?:^|\n)\s*import\s+["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(tekst))) {
    if (m[5]) {
      out.push(m[5]);
      continue;
    }
    if (m[2]) continue; // import type
    // `import { type A, type B }` — samo tipovi
    const imena = m[3].replace(/[{}]/g, "").split(",").map((s) => s.trim()).filter(Boolean);
    if (imena.length > 0 && imena.every((s) => s.startsWith("type "))) continue;
    out.push(m[4]);
  }
  return out;
}

const pocetak = path.join(koren, ulaz);
const roditelj = new Map([[pocetak, null]]);
const red = [pocetak];
const nadjeno = new Map();
while (red.length) {
  const f = red.shift();
  const rel = path.relative(koren, f).replaceAll("\\", "/");
  for (const c of ciljevi) if (rel.includes(c) && !nadjeno.has(c)) nadjeno.set(c, f);
  if (!/\.(tsx?|m?js)$/.test(f)) continue;
  for (const spec of uvozi(f)) {
    const p = razresi(f, spec);
    if (p && !roditelj.has(p)) {
      roditelj.set(p, f);
      red.push(p);
    }
  }
}
for (const c of ciljevi) {
  const f = nadjeno.get(c);
  if (!f) {
    console.log(`${c}: nije dostižan statičkim uvozima`);
    continue;
  }
  const lanac = [];
  for (let x = f; x; x = roditelj.get(x)) lanac.unshift(path.relative(koren, x).replaceAll("\\", "/"));
  console.log(`${c}:\n  ${lanac.join("\n  → ")}`);
}
console.log(`(dostižnih fajlova: ${roditelj.size})`);
