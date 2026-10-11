/**
 * ============================================================================
 * ZAVRŠNA PROVERA (B10), statički deo — bez servera i bez pregledača
 * ============================================================================
 *
 *   node scripts/b10-statika.mjs               # sve tri sekcije
 *   node scripts/b10-statika.mjs --samo boje
 *
 * Sekcije (ui-boost-plan.md §10):
 *   boje    §10.1  heks, sirove Tailwind boje, `rgb()` i crno/belo u
 *                  `components/`, sa spiskom obrazloženih izuzetaka
 *   tekst   §10.9  „§" i emodži u stringovima koje korisnik vidi
 *   ulazak  §10.8  svaka GSAP komponenta ima `matchMedia` i reduced granu
 *           §10.12 `Reveal` i druga animacija ulaska ne stoje na radnim ekranima
 *
 * Traži se po STRINGOVIMA i JSX tekstu (TypeScript parser), ne po redovima:
 * komentar u kodu sme da pomene `#fff` ili „§3", string koji stiže do ekrana
 * ne sme. Živi deo provere je `scripts/b10-provera.mjs`.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const argv = process.argv.slice(2);
const i = argv.indexOf("--samo");
const SAMO = (i !== -1 && argv[i + 1] ? argv[i + 1] : "boje,tekst,ulazak").split(",");

let pada = 0;
const red = (...polja) => console.log(`| ${polja.join(" | ")} |`);
const presuda = (sekcija, ok, napomena = "") => {
  if (!ok) pada += 1;
  console.log(`\n${ok ? "PROLAZI" : "PADA"} — ${sekcija}${napomena ? `: ${napomena}` : ""}\n`);
};
const isecak = (t) => t.replace(/\s+/g, " ").trim().slice(0, 70).replace(/\|/g, "¦");

function fajlovi(dir, preskoci = []) {
  const out = [];
  const hodaj = (d) => {
    for (const ime of readdirSync(d)) {
      const put = join(d, ime);
      const rel = relative(ROOT, put).split(sep).join("/");
      if (preskoci.some((p) => rel.startsWith(p))) continue;
      if (statSync(put).isDirectory()) hodaj(put);
      else if (/\.(ts|tsx)$/.test(ime) && !ime.endsWith(".d.ts")) out.push(rel);
    }
  };
  hodaj(join(ROOT, dir));
  return out.sort();
}

/** Svi stringovi i JSX tekst jednog fajla, sa brojem reda. Komentari nisu čvorovi. */
function stringovi(rel) {
  const src = readFileSync(join(ROOT, rel), "utf8");
  const sf = ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true, rel.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out = [];
  const K = ts.SyntaxKind;
  const obidji = (node) => {
    if (
      node.kind === K.StringLiteral || node.kind === K.NoSubstitutionTemplateLiteral ||
      node.kind === K.TemplateHead || node.kind === K.TemplateMiddle || node.kind === K.TemplateTail ||
      node.kind === K.JsxText
    ) {
      const jeUvoz = node.parent && (ts.isImportDeclaration(node.parent) || ts.isExportDeclaration(node.parent));
      if (!jeUvoz) {
        out.push({
          rel,
          red: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
          tekst: node.text ?? node.getText(sf),
          jsx: node.kind === K.JsxText,
        });
      }
    }
    ts.forEachChild(node, obidji);
  };
  obidji(sf);
  return { src, sf, lista: out };
}

/* -------------------------------------------------------------------------- */
/* §10.1 — boje u components/                                                  */
/* -------------------------------------------------------------------------- */

const PALETA = "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const VRSTE = [
  { vrsta: "heks", re: /(?<![&\w])#[0-9a-fA-F]{3,8}\b/ },
  { vrsta: "sirova Tailwind boja", re: new RegExp(`\\b(?:[a-z-]+:)*(?:bg|text|border|ring|from|to|via|fill|stroke|shadow|outline|divide|decoration|placeholder|caret|accent)-(?:${PALETA})-\\d{2,3}\\b`) },
  // Uski obrazac iz kriterijuma, bez prefiksa klase — hvata i ono što gornji ne bi.
  { vrsta: "slate-/cyan-/sky-/blue-/gray-/zinc-", re: /(?<![\w-])(?:slate|cyan|sky|blue|gray|zinc)-\d{2,3}\b/ },
  { vrsta: "rgb()/hsl()", re: /\b(?:rgba?|hsla?)\(/ },
  { vrsta: "crno/belo", re: /\b(?:bg|text|border|ring|from|to|via|fill|stroke)-(?:black|white)\b/ },
];

const IZUZECI = [
  {
    fajl: /^components\/ui\/chart\.tsx$/,
    vrste: ["heks"],
    razlog: "shadcn selektor `[stroke='#ccc']` / `[stroke='#fff']`: prepoznaje podrazumevani atribut koji Recharts upiše, da bi ga zamenio tokenom. Heks se ne primenjuje kao boja.",
  },
  {
    fajl: /^components\/app\/leadovi\/leads-map-color\.ts$/,
    vrste: ["rgb()/hsl()"],
    razlog: "Mešanje boja za MapLibre i canvas, koji ne čitaju CSS promenljive: ulaz su vrednosti tokena, izlaz je `rgb()` niz. Nijedna boja nije upisana ovde.",
  },
  {
    fajl: /^components\/app\/instagram\/(instagram-stories|publish-preview|post-detail\/post-story-funnel|post-detail\/post-profile-actions)\.tsx$/,
    vrste: ["crno/belo"],
    razlog: "Prekrivač i natpis preko korisnikove fotografije (priče, pregled objave): podloga je tuđa slika, ne tema, pa token površine ne važi.",
  },
  {
    fajl: /^components\/app\/ads\/ad-preview-dialog\.tsx$/,
    vrste: ["crno/belo"],
    razlog: "`bg-white` iza Meta iframe pregleda oglasa: tuđi sadržaj crtan za belu podlogu.",
  },
];

function sekcijaBoje() {
  console.log("## §10.1 — heks i sirove Tailwind boje u `components/`\n");
  const lista = fajlovi("components");
  const pogoci = [];
  for (const rel of lista) {
    for (const s of stringovi(rel).lista) {
      for (const { vrsta, re } of VRSTE) {
        const m = s.tekst.match(re);
        if (m) pogoci.push({ ...s, vrsta, nadjeno: m[0] });
      }
    }
  }
  // Isti string može da pogodi i široki i uski obrazac palete — jedan red je dovoljan.
  const vidjeno = new Set();
  const jedinstveni = pogoci.filter((p) => {
    const k = `${p.rel}:${p.red}:${p.nadjeno}`;
    if (vidjeno.has(k)) return false;
    vidjeno.add(k);
    return true;
  });
  const izuzetak = (p) => IZUZECI.find((x) => x.fajl.test(p.rel) && x.vrste.includes(p.vrsta));
  const pali = jedinstveni.filter((p) => !izuzetak(p));
  console.log(`Pregledano ${lista.length} fajlova, traženo po stringovima i JSX tekstu (komentari ne ulaze).\n`);
  red("vrsta", "pogodaka", "od toga izuzetak", "pada");
  red("---", "---", "---", "---");
  for (const { vrsta } of VRSTE) {
    const sv = jedinstveni.filter((p) => p.vrsta === vrsta);
    const pd = sv.filter((p) => !izuzetak(p)).length;
    red(vrsta, String(sv.length), String(sv.length - pd), pd === 0 ? "0" : `**${pd}**`);
  }
  if (pali.length) {
    console.log("\nPada:\n");
    for (const p of pali.slice(0, 40)) console.log(`- ${p.rel}:${p.red} [${p.vrsta}] \`${p.nadjeno}\` — „${isecak(p.tekst)}"`);
  }
  console.log("\nObrazloženi izuzeci:\n");
  red("fajl", "vrsta", "mesta", "razlog");
  red("---", "---", "---", "---");
  const grupe = new Map();
  for (const p of jedinstveni) {
    const x = izuzetak(p);
    if (!x) continue;
    const k = `${p.rel}|${p.vrsta}`;
    const g = grupe.get(k) ?? { rel: p.rel, vrsta: p.vrsta, n: 0, razlog: x.razlog };
    g.n += 1;
    grupe.set(k, g);
  }
  for (const g of grupe.values()) red(`\`${g.rel}\``, g.vrsta, String(g.n), g.razlog);
  presuda("§10.1 boje", pali.length === 0, `pogodaka van izuzetaka: ${pali.length}`);
}

/* -------------------------------------------------------------------------- */
/* §10.9 — „§" i emodži u tekstu koji korisnik vidi                            */
/* -------------------------------------------------------------------------- */

const EMODZI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2B50}\u{2B55}]/u;
const EMODZI_IZUZECI = [
  { fajl: /^components\/app\/instagram\/inbox\/chat-view\.tsx$/, razlog: "brze reakcije u razgovoru — emodži je sadržaj poruke, ne ikonica" },
  { fajl: /automation-editor-dialog\.tsx$/, razlog: "primer teksta poruke u polju (placeholder), ne ikonica" },
];

function sekcijaTekst() {
  console.log("## §10.9 — „§\" u stringovima koje korisnik vidi\n");
  const ui = [...fajlovi("app", ["app/dev-ux", "app/api"]), ...fajlovi("components"), ...fajlovi("lib")];
  let komentari = 0;
  const pogoci = [];
  const emodzi = [];
  for (const rel of ui) {
    const { src, lista } = stringovi(rel);
    const uStringovima = lista.filter((s) => s.tekst.includes("§"));
    pogoci.push(...uStringovima);
    komentari += (src.match(/§/g) ?? []).length - uStringovima.reduce((n, s) => n + (s.tekst.match(/§/g) ?? []).length, 0);
    if (rel.startsWith("components/") || rel.startsWith("app/")) emodzi.push(...lista.filter((s) => EMODZI.test(s.tekst)));
  }
  red("gde", "fajlova", "„§\" u stringovima i JSX tekstu", "„§\" u komentarima (dozvoljeno)");
  red("---", "---", "---", "---");
  red("`app/` (bez `dev-ux`, `api`) + `components/` + `lib/`", String(ui.length), pogoci.length === 0 ? "0" : `**${pogoci.length}**`, String(komentari));
  for (const p of pogoci.slice(0, 20)) console.log(`- ${p.rel}:${p.red} „${isecak(p.tekst)}"`);

  // Convex: poruke koje funkcije bacaju stižu do dijaloga. Posebno, jer nije UI kod.
  const convex = fajlovi("convex", ["convex/_generated"]);
  const cx = [];
  for (const rel of convex) cx.push(...stringovi(rel).lista.filter((s) => s.tekst.includes("§")));
  console.log(`\n\`convex/\` (${convex.length} fajlova): „§" u stringovima — ${cx.length}`);
  for (const p of cx.slice(0, 12)) console.log(`- ${p.rel}:${p.red} „${isecak(p.tekst)}"`);

  console.log("\nEmodži u stringovima (`app/`, `components/`):\n");
  const izuzetak = (p) => EMODZI_IZUZECI.find((x) => x.fajl.test(p.rel));
  const emodziPali = emodzi.filter((p) => !izuzetak(p));
  red("fajl:red", "tekst", "presuda");
  red("---", "---", "---");
  for (const p of emodzi) red(`\`${p.rel}:${p.red}\``, `„${isecak(p.tekst)}"`, izuzetak(p) ? `izuzetak — ${izuzetak(p).razlog}` : "**PADA**");
  if (emodzi.length === 0) red("—", "—", "nema");
  presuda("§10.9 tekst", pogoci.length === 0 && emodziPali.length === 0, `„§" u UI stringovima: ${pogoci.length}, emodži van izuzetaka: ${emodziPali.length}`);
}

/* -------------------------------------------------------------------------- */
/* §10.8 i §10.12 — animacije ulaska i reduced-motion grane                    */
/* -------------------------------------------------------------------------- */

const OMOTACI = ["Reveal", "RevealGroup", "Arrive", "Materialize", "Unfold", "PageTransition"];
/** Gde `Reveal` sme da ostane: ekrani van ljuske, koji nisu radni (plan §4.4). */
const REVEAL_DOZVOLJEN = /^app\/(login|pozivnica)\//;
const MOTORI = {
  "components/motion/count-up-engine.ts": "motor odbrojavanja; granu (`reduced`) mu prosleđuje `count-up.tsx`",
  "components/app/leadovi/leads-map-fly.ts": "let kamere na mapi; granu (`reduced`) mu prosleđuje `leads-map.tsx`",
  "lib/motion.ts": "konstante i `MOTION_QUERIES`; bez tvinova",
};

function sekcijaUlazak() {
  console.log("## §10.12 — animacija ulaska na radnim ekranima (statički)\n");
  const ui = [...fajlovi("app", ["app/dev-ux", "app/api"]), ...fajlovi("components", ["components/motion"])];
  const upotreba = new Map();
  for (const rel of ui) {
    const { sf } = stringovi(rel);
    const obidji = (node) => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const ime = node.tagName.getText(sf);
        if (OMOTACI.includes(ime)) {
          const k = `${ime}|${rel}`;
          upotreba.set(k, (upotreba.get(k) ?? 0) + 1);
        }
      }
      ts.forEachChild(node, obidji);
    };
    obidji(sf);
  }
  const ULOGA = {
    Reveal: "ulazak sekcije (neprozirnost + pomeraj)",
    RevealGroup: "ulazak grupe sa razmakom",
    Arrive: "stavka koja STIGNE dok je ekran otvoren (nov komentar, nova objava); pri otvaranju ne radi",
    Materialize: "pojava sloja na zahtev",
    Unfold: "razmotavanje na klik (red, podstavke, panel)",
    PageTransition: "okvir strane pri promeni rute: jedan element, 200 ms",
  };
  red("omotač", "fajl", "mesta", "šta radi", "presuda");
  red("---", "---", "---", "---", "---");
  let revealNaRadnom = 0;
  for (const [k, n] of [...upotreba.entries()].sort()) {
    const [ime, rel] = k.split("|");
    const jeReveal = ime === "Reveal" || ime === "RevealGroup";
    const lose = jeReveal && !REVEAL_DOZVOLJEN.test(rel);
    if (lose) revealNaRadnom += n;
    red(`\`${ime}\``, `\`${rel}\``, String(n), ULOGA[ime], lose ? "**PADA — radni ekran**" : jeReveal ? "dozvoljeno: nije radni ekran" : "nije ulazak pri otvaranju");
  }
  presuda("§10.12 ulazak (statički)", revealNaRadnom === 0, `\`Reveal\` / \`RevealGroup\` na radnim ekranima: ${revealNaRadnom}`);

  console.log("## §10.8 — svaka animacija ima reduced-motion granu\n");
  const svi = [...fajlovi("app", ["app/dev-ux", "app/api"]), ...fajlovi("components"), ...fajlovi("lib")];
  red("fajl (uvozi `gsap`)", "tvinova", "`matchMedia`", "reduced grana (`still` / `reduced`)", "presuda");
  red("---", "---", "---", "---", "---");
  let bezGrane = 0;
  let gsapFajlova = 0;
  for (const rel of svi) {
    const src = readFileSync(join(ROOT, rel), "utf8");
    if (!/from "gsap"|from "@gsap\/react"/.test(src)) continue;
    gsapFajlova += 1;
    const tvinova = (src.match(/gsap\.(to|from|fromTo|timeline|quickTo)\(|\btl\.(to|from|fromTo)\(/g) ?? []).length;
    const mm = (src.match(/matchMedia\(/g) ?? []).length;
    const grana = (src.match(/conditions\?\.still|\bstill\b|\breduced\b/g) ?? []).length;
    const motor = MOTORI[rel];
    const ok = motor ? grana > 0 || tvinova === 0 : tvinova === 0 || (mm > 0 && grana > 0);
    if (!ok) bezGrane += 1;
    red(`\`${rel}\``, String(tvinova), String(mm), String(grana), motor ? `motor — ${motor}` : ok ? "ima" : "**NEMA**");
  }
  const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");
  const blok = css.match(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/)?.[0] ?? "";
  const cssOk = /animation-duration:[^;]+!important/.test(blok) && /transition-property: opacity !important/.test(blok) && /--motion-distance: 0px/.test(blok);
  console.log(`\nCSS (\`app/globals.css\`): blok \`@media (prefers-reduced-motion: reduce)\` ${blok ? "postoji" : "NE POSTOJI"}; pomeraj tokena na 0 px, prelazi samo neprozirnost, animacije jednom i kratko — ${cssOk ? "da" : "NE"}.`);
  presuda("§10.8 reduced-motion grane", bezGrane === 0 && cssOk, `GSAP fajlova: ${gsapFajlova}, bez grane: ${bezGrane}`);
}

if (SAMO.includes("boje")) sekcijaBoje();
if (SAMO.includes("tekst")) sekcijaTekst();
if (SAMO.includes("ulazak")) sekcijaUlazak();
console.log(pada === 0 ? "SVE SEKCIJE PROLAZE" : `PADA SEKCIJA: ${pada}`);
process.exit(pada === 0 ? 0 : 1);
