// S27: merenje dizajn sistema radnog dela (P3) na 1536 × 695 i 390 × 844, uz
// Enigmine ekrane za poređenje. Za svaki ekran i prikaz:
//  - h1: broj vidljivih naslova ekrana (pravilo: jedan);
//  - primarna: broj vidljivih `data-variant="primary"` (pravilo: najviše jedno);
//  - nadnaslov: verzal ili razmaknut tekst neposredno iznad h1/h2;
//  - verzal: svaki vidljiv verzal (natpis grupe je dozvoljen, ostalo se gleda);
//  - kartica u kartici: okvir sa ivicom, radijusom i podlogom unutar drugog takvog;
//  - pismo: tekst koji nije Aeonik (mono je dozvoljen za kod i kbd);
//  - sitno: tekst ispod 12 px;
//  - radnja: boja radnje na elementu koji nije kontrola ni izabrano stanje;
//  - modul: boja modula van bočne trake, menija, ikonice zaglavlja i aurore;
//  - svetlo: svetla podloga van `.on-light` (svetla tema);
//  - stil: inline boja (hex/rgb) u atributu `style`.
// Upotreba: node .nocni-run/spajanje/alati/s27-dizajn.mjs [--samo a,b] [--snimi] [--vp 1536|390]
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "http://localhost:3117";
const S = "enigma-it";
const EKRANI = [
  ["danas", "/"],
  ["moji-zadaci", "/moji-zadaci"],
  ["inbox", "/inbox"],
  ["poruke-ja", "/poruke"],
  ["beleske-ja", "/beleske"],
  ["projekti", "/projekti"],
  ["pocetna", `/${S}`],
  ["zadaci", `/${S}/zadaci`],
  ["ideje", `/${S}/ideje`],
  ["poruke", `/${S}/poruke`],
  ["dokumenti", `/${S}/dokumenti`],
  ["oblast", `/${S}/dokumenti/areasux0001`],
  ["stranica", `/${S}/stranica/pagesux0101`],
  ["stranica-tabela", `/${S}/stranica/pagesux0103`],
  ["zadatak", `/${S}/stranica/pagesux0201`],
  ["korpa", `/${S}/korpa`],
  ["puls", `/${S}/puls`],
  ["aktivnost", `/${S}/aktivnost`],
  ["beleske", `/${S}/beleske`],
  ["settings", `/${S}/settings`],
  ["settings-projekat", `/${S}/settings?tab=projekat`],
  ["settings-oblasti", `/${S}/settings?tab=oblasti`],
  ["settings-ai", `/${S}/settings?tab=ai`],
  ["settings-lozinke", `/${S}/settings?tab=lozinke`],
  // Enigmini ekrani, za poređenje (ne menjaju se).
  ["E-leadovi", `/${S}/leadovi`],
  ["E-analitika", `/${S}/analytics`],
  ["E-napredak", `/${S}/napredak`],
  ["E-novosti", `/${S}/novosti`],
];

const argv = process.argv.slice(2);
const arg = (ime) => {
  const i = argv.indexOf(ime);
  return i >= 0 ? argv[i + 1] : null;
};
const SAMO = arg("--samo")?.split(",") ?? null;
const VP = arg("--vp");
const SNIMI = argv.includes("--snimi");
const OUT = ".nocni-run/spajanje/tmp/s27";
mkdirSync(OUT, { recursive: true });

function meri() {
  const opis = (el) => {
    const cls = typeof el.className === "string" ? el.className : el.getAttribute("class") ?? "";
    const t = (el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 36);
    return `${el.tagName.toLowerCase()}${el.dataset.slot ? `[${el.dataset.slot}]` : ""} "${t}" .${cls.slice(0, 80)}`;
  };
  const vidljiv = (el) => {
    const s = getComputedStyle(el);
    if (s.visibility === "hidden" || s.display === "none" || Number(s.opacity) === 0) return false;
    if (el.closest('[aria-hidden="true"], [inert], .sr-only')) return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };
  const resi = (expr) => {
    const p = document.createElement("span");
    p.style.color = expr;
    document.body.appendChild(p);
    const c = getComputedStyle(p).color;
    p.remove();
    return c;
  };
  const RADNJA = resi("var(--radnja)");
  const modEl = document.querySelector("[data-module]") ?? document.body;
  const modProba = document.createElement("span");
  modProba.style.color = "var(--mod)";
  modEl.appendChild(modProba);
  const MOD = getComputedStyle(modProba).color;
  modProba.remove();

  const KONTROLA =
    'button, a[href], [role="button"], [role="tab"], [role="switch"], [role="checkbox"], [role="radio"], [role="option"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], input, textarea, select, label, [role="combobox"], [contenteditable="true"]';
  const IZABRANO = '[aria-current], [aria-selected="true"], [aria-pressed="true"], [aria-checked="true"], [data-active], [data-selected], [data-checked], [data-pressed], [data-state="checked"]';
  const IZUZETO = ".react-flow, .tiptap, .ProseMirror, [data-sonner-toaster], [data-slot='toast']";
  const tekstualan = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);

  const h1 = [...document.querySelectorAll("h1")].filter(vidljiv);
  const primarna = [...document.querySelectorAll('[data-variant="primary"]')].filter(vidljiv);

  const nadnaslov = [];
  for (const h of [...document.querySelectorAll("h1, h2")].filter(vidljiv)) {
    const pret = h.previousElementSibling;
    if (!pret || !vidljiv(pret)) continue;
    const s = getComputedStyle(pret);
    const ls = parseFloat(s.letterSpacing) / parseFloat(s.fontSize);
    if (s.textTransform === "uppercase" || ls >= 0.06) nadnaslov.push(`${opis(pret)} → ${h.tagName} "${h.textContent.trim().slice(0, 30)}"`);
  }

  const verzal = [];
  const pismo = new Set();
  const sitno = [];
  const radnja = [];
  const modul = [];
  const svetlo = [];
  const stil = [];
  const bodyFont = getComputedStyle(document.body).fontFamily.split(",")[0].trim();
  for (const el of document.body.querySelectorAll("*")) {
    if (!vidljiv(el)) continue;
    if (el.closest(IZUZETO)) continue;
    const s = getComputedStyle(el);
    const tekst = tekstualan(el);
    if (tekst && s.textTransform === "uppercase") verzal.push(opis(el));
    if (tekst) {
      const f = s.fontFamily.split(",")[0].trim();
      if (f !== bodyFont && !el.closest("code, pre, kbd, samp") && !/mono/i.test(s.fontFamily)) pismo.add(`${f} ← ${opis(el)}`);
      if (parseFloat(s.fontSize) < 11.9) sitno.push(`${s.fontSize} ${opis(el)}`);
    }
    const boje = [s.color, s.backgroundColor, s.borderTopColor, s.fill, s.stroke];
    const uKontroli = el.closest(KONTROLA) || el.closest(IZABRANO) || el.matches(":focus-visible");
    if (RADNJA && boje.slice(0, 2).includes(RADNJA) && (tekst || s.backgroundColor === RADNJA) && !uKontroli) radnja.push(opis(el));
    const mestoModula = el.closest("aside, nav, [data-slot='page-header-icon'], [data-aurora], [data-mesto-modula]");
    if (MOD && MOD !== RADNJA && boje.includes(MOD) && !mestoModula) modul.push(opis(el));
    const bg = s.backgroundColor.match(/[\d.]+/g)?.map(Number);
    if (bg && bg.length >= 3 && (bg[3] ?? 1) > 0.5) {
      const l = (0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2]) / 255;
      const r = el.getBoundingClientRect();
      if (l > 0.75 && r.width * r.height > 2000 && !el.closest(".on-light") && el.tagName !== "IMG" && el.tagName !== "VIDEO") svetlo.push(opis(el));
    }
    const st = el.getAttribute("style") ?? "";
    if (/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(st) && !/var\(--/.test(st)) stil.push(`${st.slice(0, 60)} ${opis(el)}`);
  }

  // Kartica u kartici: ivica sa sve četiri strane, radijus ≥ 10 px, neprovidna
  // podloga i najmanje 160 × 64 px; plutajuće površine se ne broje.
  const PLUTA = "[role='dialog'], [role='menu'], [role='listbox'], [data-slot*='popover'], [data-slot*='popup'], [data-slot*='drawer'], [data-slot*='sheet'], .react-flow, .tiptap";
  const jeKartica = (el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.width < 160 || r.height < 64) return false;
    const ivica = ["Top", "Right", "Bottom", "Left"].every((k) => parseFloat(s[`border${k}Width`]) >= 1 && !s[`border${k}Color`].endsWith(", 0)"));
    const bg = s.backgroundColor;
    const podloga = bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent";
    return ivica && podloga && parseFloat(s.borderTopLeftRadius) >= 10;
  };
  const kartice = [...document.body.querySelectorAll("*")].filter((el) => vidljiv(el) && !el.closest(PLUTA) && jeKartica(el));
  const ugnezdene = [];
  for (const k of kartice) {
    for (let p = k.parentElement; p && p !== document.body; p = p.parentElement) {
      if (kartice.includes(p)) {
        ugnezdene.push(`${opis(k)}  ⊂  ${opis(p)}`);
        break;
      }
    }
  }
  const uniq = (a, n = 12) => [...new Set(a)].slice(0, n);
  return {
    h1: h1.map((h) => h.textContent.trim().slice(0, 40)),
    primarna: primarna.map((b) => (b.textContent || b.getAttribute("aria-label") || "").trim().slice(0, 30)),
    nadnaslov: uniq(nadnaslov),
    verzal: uniq(verzal),
    ugnezdene: uniq(ugnezdene),
    pismo: uniq([...pismo]),
    sitno: uniq(sitno),
    radnja: uniq(radnja),
    modul: uniq(modul),
    svetlo: uniq(svetlo),
    stil: uniq(stil),
    RADNJA,
    MOD,
  };
}

const VIEWPORTI = [
  { ime: "1536", viewport: { width: 1536, height: 695 }, isMobile: false, hasTouch: false },
  { ime: "390", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
].filter((v) => !VP || v.ime === VP);

const browser = await chromium.launch();
const rez = {};
for (const vp of VIEWPORTI) {
  const ctx = await browser.newContext({
    viewport: vp.viewport,
    isMobile: vp.isMobile,
    hasTouch: vp.hasTouch,
    deviceScaleFactor: 1,
    colorScheme: "dark",
  });
  for (const [ime, put] of EKRANI) {
    if (SAMO && !SAMO.includes(ime)) continue;
    const page = await ctx.newPage();
    const greske = [];
    page.on("pageerror", (e) => greske.push(String(e).slice(0, 200)));
    page.on("console", (m) => m.type() === "error" && greske.push(m.text().slice(0, 200)));
    const url = `${BASE}${put}${put.includes("?") ? "&" : "?"}ux=1`;
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 90000 });
    } catch {
      await page.goto(url, { waitUntil: "load", timeout: 90000 });
    }
    await page.waitForTimeout(1000);
    const m = await page.evaluate(meri);
    const kljuc = `${ime}@${vp.ime}`;
    rez[kljuc] = { ...m, greske };
    const red = (k) => (m[k].length ? ` ${k}=${m[k].length}` : "");
    console.log(
      `\n=== ${kljuc} h1=${m.h1.length}${m.h1.length !== 1 ? ` [${m.h1.join(" | ")}]` : ""} primarna=${m.primarna.length}${m.primarna.length > 1 ? ` [${m.primarna.join(" | ")}]` : ""}` +
        ["nadnaslov", "verzal", "ugnezdene", "pismo", "sitno", "radnja", "modul", "svetlo", "stil"].map(red).join("") +
        (greske.length ? ` greske=${greske.length}` : ""),
    );
    for (const k of ["nadnaslov", "ugnezdene", "pismo", "sitno", "radnja", "modul", "svetlo", "stil", "verzal"]) for (const v of m[k]) console.log(`  ${k.toUpperCase()} ${v}`);
    for (const g of greske.slice(0, 3)) console.log("  GREŠKA", g);
    if (SNIMI) await page.screenshot({ path: `${OUT}/${ime}-${vp.ime}.png`, fullPage: false });
    await page.close();
  }
  await ctx.close();
}
writeFileSync(`${OUT}/rezultat.json`, JSON.stringify(rez, null, 2));
await browser.close();
