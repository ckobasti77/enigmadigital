// Noćni run PROJEKTI: postojeće verify:* provere repoa, jedna za drugom.
// Pada ako bilo koja padne. Pokreće ga runner kao proveru "regresije".
import { spawnSync } from "node:child_process";

const skripte = [
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

const pale = [];
for (const s of skripte) {
  console.log(`\n=== npm run ${s}`);
  const r = spawnSync(`npm run -s ${s}`, { stdio: "inherit", shell: true });
  if (r.status !== 0) pale.push(s);
}
if (pale.length > 0) {
  console.error(`\nPALE (${pale.length}): ${pale.join(", ")}`);
  process.exit(1);
}
console.log(`\nSve regresione provere su prošle (${skripte.length}).`);
