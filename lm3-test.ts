import { parseRating, deriveSignalsFromNote } from "./convex/lib/leadImportParse";

const ratings = [
  "5.0 (Google, 53 rec.)",
  "9.7/10 (SrediMe, 133 rec.)",
  "9.4/10 (SrediMe, 143 rec.)",
  "5.0 (Google/Wanderlog)",
  "5.0 (Yandex, 28 rec.)",
  "Na 011info",
  "468 FB lajkova",
  "Na PlanPlus",
  "",
];
console.log("--- OCENE ---");
for (const r of ratings) console.log(JSON.stringify(r), "->", JSON.stringify(parseRating(r)));

const notes = [
  "Nema sajt — koristi Setmore za zakazivanje. Odlične Google ocene.",
  "Nema sajt ni društvene mreže — samo direktorijumi.",
  "Nema sajt, koristi dikidi za zakazivanje.",
  "Nema sajt, ima samo Facebook. 133 pozitivne recenzije.",
  "Nema sajt. Novootvoreni u Bloku 70. Pozitivna energija, toplina.",
  "Nema sajt. Zanimljivo ime. Prometna lokacija.",
];
console.log("--- SIGNALI IZ NAPOMENE ---");
for (const n of notes) console.log(JSON.stringify(n.slice(0, 45)), "->", JSON.stringify(deriveSignalsFromNote(n)));
