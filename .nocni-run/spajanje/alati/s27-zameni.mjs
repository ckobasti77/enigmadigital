// S27: tačne zamene teksta u fajlovima (čuva LF ili CRLF fajla).
// Upotreba: node .nocni-run/spajanje/alati/s27-zameni.mjs <spec.json>
// spec: [{ "fajl": "...", "staro": "...", "novo": "..." }, ...]
import { readFileSync, writeFileSync } from "node:fs";

const spec = JSON.parse(readFileSync(process.argv[2], "utf8"));
let greske = 0;
for (const { fajl, staro, novo } of spec) {
  const sirovo = readFileSync(fajl, "utf8");
  const crlf = sirovo.includes("\r\n");
  const tekst = crlf ? sirovo.replace(/\r\n/g, "\n") : sirovo;
  const n = tekst.split(staro).length - 1;
  if (n !== 1) {
    console.error(`${fajl}: očekivano 1 pojavljivanje, nađeno ${n}`);
    greske += 1;
    continue;
  }
  const izlaz = tekst.replace(staro, () => novo);
  writeFileSync(fajl, crlf ? izlaz.replace(/\n/g, "\r\n") : izlaz);
  console.log(`OK ${fajl}`);
}
process.exit(greske ? 1 : 0);
