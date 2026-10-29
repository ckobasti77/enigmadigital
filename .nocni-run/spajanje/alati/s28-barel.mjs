// S28 (plan S07 §11.1): uvozi iz barela `lib/prostor` → duboki uvozi po modulu.
// Barel ponovo izvozi 26 modula; bundler ih ne odbacuje, pa svaki uvoz barela vuče sve module
// radnog dela u komad strane. Mapa ime → modul se čita iz `lib/prostor/index.ts`.
//   - aplikacija: `from "@/lib/prostor"`  → `from "@/lib/prostor/<modul>"`
//   - `lib/prostor/<podfascikla>/*`: `from ".."` / `"../index"` → `from "../<modul>"`
//   - i `import` i `export { … } from` (ponovni izvoz)
//
// Upotreba: node .nocni-run/spajanje/alati/s28-barel.mjs [--suvo]
// Čuva kraj reda (LF/CRLF) svakog fajla.

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const koren = process.cwd();
const suvo = process.argv.includes("--suvo");

// 1) Mapa izvoza barela.
const barel = readFileSync(path.join(koren, "lib/prostor/index.ts"), "utf8").replace(/\r\n/g, "\n");
if (/export\s+\*/.test(barel)) throw new Error("barel ima export * — mapa ne bi bila potpuna");
const mapa = new Map();
for (const m of barel.matchAll(/export\s*\{([^}]*)\}\s*from\s*["']\.\/([^"']+)["']/g)) {
  for (const deo of m[1].split(",").map((s) => s.trim()).filter(Boolean)) {
    const [izvorno, alias] = deo.replace(/^type\s+/, "").split(/\s+as\s+/).map((s) => s.trim());
    if (alias && alias !== izvorno) throw new Error(`preimenovan izvoz nije podržan: ${deo}`);
    if (mapa.has(izvorno) && mapa.get(izvorno) !== m[2]) throw new Error(`dvostruk izvoz: ${izvorno}`);
    mapa.set(izvorno, m[2]);
  }
}

function fajlovi(dir, out = []) {
  for (const u of readdirSync(dir, { withFileTypes: true })) {
    if (u.name === "node_modules" || u.name.startsWith(".") || u.name === "_generated") continue;
    const p = path.join(dir, u.name);
    if (u.isDirectory()) fajlovi(p, out);
    else if (/\.(ts|tsx)$/.test(u.name)) out.push(p);
  }
  return out;
}

// Grupa 1: import|export, 2: "type ", 3: imena, 4: specifikator.
const UVOZ = /^(import|export)\s+(type\s+)?\{([^}]*)\}\s*from\s*["'](@\/lib\/prostor|\.\.(?:\/index)?)["'];?[ \t]*$/gm;

let ukupnoFajlova = 0;
let ukupnoUvoza = 0;
for (const f of ["components", "app", "lib"].flatMap((d) => fajlovi(path.join(koren, d)))) {
  const relPut = path.relative(koren, f).split(path.sep).join("/");
  // `..` je barel samo jedan nivo ispod `lib/prostor/` (modeli/, web/, precice/ …).
  const uPodfascikli = /^lib\/prostor\/[^/]+\/[^/]+$/.test(relPut);
  const jeBarel = (spec) => spec === "@/lib/prostor" || (uPodfascikli && spec !== "@/lib/prostor");
  const sirovo = readFileSync(f, "utf8");
  const crlf = sirovo.includes("\r\n");
  const s = sirovo.replace(/\r\n/g, "\n");
  let promena = false;
  const novo = s.replace(UVOZ, (ceo, rec, ceoType, telo, spec) => {
    if (!jeBarel(spec)) return ceo;
    const prefiks = spec === "@/lib/prostor" ? "@/lib/prostor/" : "../";
    const poModulu = new Map();
    for (const deo of telo.split(",").map((x) => x.trim()).filter(Boolean)) {
      const tip = Boolean(ceoType) || deo.startsWith("type ");
      const ime = deo.replace(/^type\s+/, "").trim();
      const modul = mapa.get(ime.split(/\s+as\s+/)[0].trim());
      if (!modul) throw new Error(`${relPut}: ${ime} nije u barelu`);
      if (!poModulu.has(modul)) poModulu.set(modul, []);
      poModulu.get(modul).push({ ime, tip });
    }
    promena = true;
    ukupnoUvoza++;
    return [...poModulu]
      .map(([modul, imena]) => {
        const sviTip = imena.every((i) => i.tip);
        const lista = imena.map((i) => (i.tip && !sviTip ? `type ${i.ime}` : i.ime));
        const glava = sviTip ? `${rec} type` : rec;
        const izvor = `"${prefiks}${modul}"`;
        const jednoRed = `${glava} { ${lista.join(", ")} } from ${izvor};`;
        return jednoRed.length <= 120 ? jednoRed : `${glava} {\n${lista.map((x) => `  ${x},`).join("\n")}\n} from ${izvor};`;
      })
      .join("\n");
  });
  const ostaje = (t) =>
    /from\s*["']@\/lib\/prostor["']/.test(t) || (uPodfascikli && /from\s*["']\.\.(\/index)?["']/.test(t));
  if (!promena) {
    if (ostaje(s)) console.log(`PRESKOČENO (oblik uvoza): ${relPut}`);
    continue;
  }
  ukupnoFajlova++;
  if (ostaje(novo)) console.log(`OSTALO: ${relPut}`);
  if (!suvo) writeFileSync(f, crlf ? novo.replace(/\n/g, "\r\n") : novo);
}
console.log(`${suvo ? "(suvo) " : ""}fajlova: ${ukupnoFajlova}, uvoza: ${ukupnoUvoza}, imena u barelu: ${mapa.size}`);
