// S26: merenje radnog dela na 390 × 844 (dodir). Za svaki ekran:
//  - vodoravno klizanje strane (scrollWidth > širina prozora);
//  - elementi koji probijaju desnu ivicu, a nisu u svom okviru za klizanje;
//  - interaktivni elementi niži (ili uži, kad su samo ikonica) od 44 px.
// Upotreba: node .nocni-run/spajanje/alati/s26-telefon.mjs [--samo a,b] [--snimi]
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
  ["oblast-mapa", `/${S}/dokumenti/areasux0001?tab=mapa`],
  ["stranica", `/${S}/stranica/pagesux0101`],
  ["stranica-tabela", `/${S}/stranica/pagesux0103`],
  ["stranica-fajl", `/${S}/stranica/pagesux0107`],
  ["zadatak", `/${S}/stranica/pagesux0201`],
  ["korpa", `/${S}/korpa`],
  ["puls", `/${S}/puls`],
  ["aktivnost", `/${S}/aktivnost`],
  ["beleske", `/${S}/beleske`],
  ["settings", `/${S}/settings`],
];

const argv = process.argv.slice(2);
const samoI = argv.indexOf("--samo");
const SAMO = samoI >= 0 ? argv[samoI + 1].split(",") : null;
const SNIMI = argv.includes("--snimi");
const OUT = ".nocni-run/spajanje/tmp/s26";
mkdirSync(OUT, { recursive: true });

function meri() {
  const W = window.innerWidth;
  const doc = document.documentElement;
  const opis = (el) => {
    const cls = typeof el.className === "string" ? el.className : el.getAttribute("class") ?? "";
    const t = (el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40);
    return `${el.tagName.toLowerCase()}${el.dataset.slot ? `[${el.dataset.slot}]` : ""} "${t}" .${cls.slice(0, 90)}`;
  };
  const vidljiv = (el) => {
    const s = getComputedStyle(el);
    if (s.visibility === "hidden" || s.display === "none" || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  // Je li element unutar okvira koji sam kliza vodoravno (ili seče)?
  const uOkviru = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (["auto", "scroll", "hidden", "clip"].includes(s.overflowX)) return true;
    }
    return false;
  };
  const preliv = [];
  for (const el of document.body.querySelectorAll("*")) {
    if (!vidljiv(el)) continue;
    const r = el.getBoundingClientRect();
    if ((r.right > W + 1 || r.left < -1) && !uOkviru(el)) {
      const s = getComputedStyle(el);
      if (s.position === "fixed" && (r.left >= W || r.right <= 0)) continue; // skrivena fioka
      preliv.push(`${Math.round(r.left)}..${Math.round(r.right)} ${opis(el)}`);
    }
  }
  const male = [];
  const SEL = 'button, a[href], [role="button"], [role="tab"], [role="checkbox"], [role="switch"], [role="menuitem"], select, input:not([type="hidden"]), textarea, [role="combobox"]';
  for (const el of document.querySelectorAll(SEL)) {
    if (!vidljiv(el)) continue;
    if (el.closest('[aria-hidden="true"], [inert]')) continue;
    if (el.closest(".react-flow, .tiptap, .ProseMirror")) continue; // mapa i uređivač: ograničeno
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight * 6) continue;
    // Pseudo-element za veću metu (hit area) računa se kao meta.
    let h = r.height, w = r.width;
    for (const ps of ["::before", "::after"]) {
      const s = getComputedStyle(el, ps);
      if (s.content !== "none" && s.position === "absolute") {
        const top = parseFloat(s.top), bottom = parseFloat(s.bottom), left = parseFloat(s.left), right = parseFloat(s.right);
        if (!Number.isNaN(top) && !Number.isNaN(bottom)) h = Math.max(h, r.height - top - bottom);
        if (!Number.isNaN(left) && !Number.isNaN(right)) w = Math.max(w, r.width - left - right);
        const mh = parseFloat(s.minHeight); if (!Number.isNaN(mh)) h = Math.max(h, mh);
        const mw = parseFloat(s.minWidth); if (!Number.isNaN(mw)) w = Math.max(w, mw);
      }
    }
    const tekst = (el.textContent || "").trim();
    const jeUnos = /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
    const ikonica = !tekst && !jeUnos;
    // Unutrašnji link u tekstu (rečenica) nije meta na koju se odnosi pravilo.
    if (el.tagName === "A" && el.closest("p") && !el.closest("li, [role=listitem]")) continue;
    if (h < 43.5 || (ikonica && w < 43.5)) male.push(`${Math.round(w)}×${Math.round(h)} ${opis(el)}`);
  }
  return { sw: doc.scrollWidth, W, preliv: preliv.slice(0, 25), male: [...new Set(male)].slice(0, 60), brojMalih: male.length };
}

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
  colorScheme: "dark",
});
const rez = {};
for (const [ime, put] of EKRANI) {
  if (SAMO && !SAMO.includes(ime)) continue;
  const page = await ctx.newPage();
  const greske = [];
  page.on("pageerror", (e) => greske.push(String(e)));
  page.on("console", (m) => m.type() === "error" && greske.push(m.text().slice(0, 200)));
  const url = `${BASE}${put}${put.includes("?") ? "&" : "?"}ux=1`;
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 90000 });
  } catch {
    await page.goto(url, { waitUntil: "load", timeout: 90000 });
  }
  await page.waitForTimeout(1200);
  const m = await page.evaluate(meri);
  rez[ime] = { ...m, greske };
  console.log(`\n=== ${ime} (${put}) scrollWidth=${m.sw} preliv=${m.preliv.length} male=${m.brojMalih} greske=${greske.length}`);
  for (const p of m.preliv) console.log("  PRELIV", p);
  for (const p of m.male) console.log("  MALO ", p);
  for (const g of greske.slice(0, 3)) console.log("  GREŠKA", g);
  if (SNIMI) await page.screenshot({ path: `${OUT}/${ime}.png`, fullPage: false });
  await page.close();
}
writeFileSync(`${OUT}/rezultat.json`, JSON.stringify(rez, null, 2));
await browser.close();
