/**
 * Sažetak loga snimaka (ui-boost-plan.md §10.2, §10.4, §10.6):
 *
 *   node scripts/b10-log-sazetak.mjs            # nocni-run/ux/b10-log.json
 *   node scripts/b10-log-sazetak.mjs b9
 *
 * Čita `<faza>-log.json` koji piše `scripts/ux-snapshots.mjs` i ispisuje: broj
 * snimaka po prikazu, elemente koji probijaju širinu, greške u konzoli, trake
 * tabova sa klizačem i bočnu traku sa klizačem na 695 px. Ekrani sa
 * `pad=napredak` namerno obaraju upit napretka (dokaz da ljuska ostaje), pa se
 * njihova greška vodi posebno: mora da postoji i mora da bude baš ta.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const faza = process.argv[2] ?? "b10";
const put = fileURLToPath(new URL(`../nocni-run/ux/${faza}-log.json`, import.meta.url));
const log = JSON.parse(readFileSync(put, "utf8"));
const z = log.zapisi;
const red = (...p) => console.log(`| ${p.join(" | ")} |`);

console.log(`## Log snimaka \`${faza}-log.json\` (${log.kada})\n`);
const neuspesi = z.filter((x) => x.neuspeh);
const ok = z.filter((x) => !x.neuspeh);
const ekrana = new Set(z.map((x) => x.ekran)).size;
console.log(`Snimaka: ${ok.length} / ${z.length}, ekrana: ${ekrana}, neuspelih: ${neuspesi.length}\n`);

red("prikaz", "snimaka", "dokument širi od ekrana", "elemenata koji probijaju", "greške u konzoli (bez `pad=`)", "tablist klizača (geometrija)", "tablist klizača (stil)", "bočna traka sa klizačem");
red("---", "---", "---", "---", "---", "---", "---", "---");
const namerniPad = (x) => /[?&]pad=/.test(x.url);
let lose = neuspesi.length;
for (const vp of [...new Set(ok.map((x) => x.viewport))].sort()) {
  const s = ok.filter((x) => x.viewport === vp);
  const siri = s.filter((x) => x.dokumentSiri).length;
  const probija = s.reduce((n, x) => n + (x.brojProbijaju ?? 0), 0);
  const greske = s.filter((x) => !namerniPad(x)).reduce((n, x) => n + x.greske.length, 0);
  const geo = s.reduce((n, x) => n + (x.trakeSaKlizacem?.length ?? 0), 0);
  const stil = s.reduce((n, x) => n + (x.trakeSaStilomKlizaca?.length ?? 0), 0);
  // Bočna traka postoji samo na desktopu (`bocnaKlizac` je `null` kad je sakrivena).
  const saBocnom = s.filter((x) => x.bocnaKlizac !== null && x.bocnaKlizac !== undefined);
  const bocna = saBocnom.filter((x) => x.bocnaKlizac).length;
  lose += siri + probija + greske + geo + stil + bocna;
  red(vp, String(s.length), String(siri), String(probija), String(greske), String(geo), String(stil), saBocnom.length ? `${bocna} od ${saBocnom.length}` : "nema bočne trake");
}

const pad = ok.filter(namerniPad);
console.log(`\nEkrani sa namernim padom upita (\`pad=napredak\`): ${pad.length} snimaka`);
for (const x of pad) {
  const prava = x.greske.length === 1 && /napredak|Napredak|pad/i.test(x.greske[0]);
  if (!prava) lose += 1;
  console.log(`- ${x.ekran} @ ${x.viewport}: ${x.greske.length} greška — „${(x.greske[0] ?? "").replace(/\s+/g, " ").slice(0, 110)}" ${prava ? "(očekivana)" : "**NEOČEKIVANO**"}`);
}

const analitika = ok.filter((x) => x.viewport === "1536x695" && x.url.startsWith("/analytics"));
console.log(`\nBočna traka na 1536×695, ekrani Analitike (najviše podstavki): ${analitika.filter((x) => x.bocnaKlizac).length} sa klizačem od ${analitika.length}`);

console.log("\nPrimarnih dugmadi iznad preloma (1536×695), po ekranu:\n");
const po = ok.filter((x) => x.viewport === "1536x695").sort((a, b) => a.ekran.localeCompare(b.ekran));
const grupe = new Map();
for (const x of po) grupe.set(x.primarnihIznadPreloma, [...(grupe.get(x.primarnihIznadPreloma) ?? []), x.ekran]);
for (const [n, imena] of [...grupe.entries()].sort((a, b) => a[0] - b[0])) console.log(`- ${n}: ${imena.join(", ")}`);
const viseOdJednog = po.filter((x) => x.primarnihIznadPreloma > 1);
lose += viseOdJednog.length;

console.log(`\n${lose === 0 ? "PROLAZI" : "PADA"} — log snimaka: neuspelih ${neuspesi.length}, ekrana sa više od jednog primarnog ${viseOdJednog.length}`);
process.exit(lose === 0 ? 0 : 1);
