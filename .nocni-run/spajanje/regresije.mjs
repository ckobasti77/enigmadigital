// Noćni run SPAJANJE: postojeće verify:* provere repoa plus sve verify:ultra-* (ULTRA1)
// i nove verify:prostor-* (P25), jedna za drugom. Pada ako bilo koja padne.
// Pokreće je runner kao proveru "regresije".
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const fiksne = [
  "verify:obavestenja",
  "verify:napredak",
  "verify:leads-ui",
  "verify:uvoz",
  "verify:pokret",
  "verify:brojevi",
  "verify:site-score",
  "verify:capi-identity",
  "verify:gads-catalog",
  "verify:gads-structure",
  "verify:gads-conversions",
  "verify:gads-keywords",
  "verify:gads-segments",
  "verify:gads-sync-report",
];

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
const skripte0 = Object.keys(pkg.scripts ?? {});
const ultra = skripte0.filter((s) => s.startsWith("verify:ultra-")).sort();
const prostor = skripte0.filter((s) => s.startsWith("verify:prostor-")).sort();
const skripte = [...fiksne.filter((s) => pkg.scripts?.[s]), ...ultra, ...prostor];

const pale = [];
for (const s of skripte) {
  console.log(`\n=== npm run ${s}`);
  const r = spawnSync(`npm run -s ${s}`, { stdio: "inherit", shell: true });
  if (r.status !== 0) pale.push(s);
}
const nestale = fiksne.filter((s) => !pkg.scripts?.[s]);
if (nestale.length > 0) {
  console.error(`\nNEDOSTAJU skripte iz package.json (${nestale.length}): ${nestale.join(", ")}`);
  pale.push(...nestale);
}
if (pale.length > 0) {
  console.error(`\nPALE (${pale.length}): ${pale.join(", ")}`);
  process.exit(1);
}
console.log(`\nSve regresione provere su prošle (${skripte.length}; verify:ultra-*: ${ultra.length}; verify:prostor-*: ${prostor.length}).`);
