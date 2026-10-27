// Noćni run ULTRA1: postojeće verify:* provere repoa plus sve nove verify:ultra-*,
// jedna za drugom. Pada ako bilo koja padne. Pokreće je runner kao proveru "regresije".
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

// P6 iz docs/ULTRA-PLAN.md: svaka nova provera ovog plana nosi ime verify:ultra-<oblast>.
const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
const nove = Object.keys(pkg.scripts ?? {}).filter((s) => s.startsWith("verify:ultra-")).sort();
const skripte = [...fiksne.filter((s) => pkg.scripts?.[s]), ...nove];

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
console.log(`\nSve regresione provere su prošle (${skripte.length}, od toga verify:ultra-*: ${nove.length}).`);
