// S27: plutajući slojevi radnog dela na 1536 × 695 (dijalozi, fioke, zvono).
// U najgornjem sloju meri: naslov sloja, broj primarnih dugmadi (najviše
// jedno), karticu u kartici, verzal i tekst ispod 12 px. Snima stanje.
// Upotreba: node .nocni-run/spajanje/alati/s27-stanja.mjs [--samo a,b] [--vp 390]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3117";
const OUT = ".nocni-run/spajanje/tmp/s27/stanja";
mkdirSync(OUT, { recursive: true });
const argv = process.argv.slice(2);
const samoI = argv.indexOf("--samo");
const SAMO = samoI >= 0 ? argv[samoI + 1].split(",") : null;
const MALI = argv.includes("--vp") && argv[argv.indexOf("--vp") + 1] === "390";

const klik = async (loc) => {
  await loc.first().scrollIntoViewIfNeeded();
  await loc.first().click();
};

const STANJA = [
  ["danas-brzi-unos", "/", (p) => klik(p.getByRole("button", { name: /Brzi unos/ }))],
  ["danas-isplaniraj", "/", (p) => klik(p.getByRole("button", { name: /Isplaniraj dan/ }))],
  ["zvono-ceka-te", "/enigma-it", (p) => klik(p.getByRole("button", { name: /Čeka te|Obaveštenja|zvono/i }))],
  ["pocetna-novi-zadatak", "/enigma-it", (p) => klik(p.getByRole("button", { name: /Novi zadatak/ }))],
  ["pocetna-sredi-rokove", "/enigma-it", (p) => klik(p.getByRole("button", { name: /Sredi rokove/ }))],
  ["zadaci-panel", "/enigma-it/zadaci", (p) => klik(p.getByRole("button", { name: /Popravi prijavu na staging/ }))],
  ["ideje-detalj", "/enigma-it/ideje", (p) => klik(p.getByText("Nedeljni bilten za klijente"))],
  ["ideje-nova", "/enigma-it/ideje", (p) => klik(p.getByRole("button", { name: /Nova ideja/ }))],
  ["oblast-nova-stranica", "/enigma-it/dokumenti/areasux0001", (p) => klik(p.getByRole("button", { name: /Nova stranica/ }))],
  ["poruke-nova", "/poruke", (p) => klik(p.getByRole("button", { name: /^Novo|Nova poruka|Novi razgovor/ }))],
  ["stranica-istorija", "/enigma-it/stranica/pagesux0101", (p) => klik(p.getByRole("button", { name: /^Istorija/ }))],
  ["stranica-komentari", "/enigma-it/stranica/pagesux0101", (p) => klik(p.getByRole("button", { name: /^Komentari/ }))],
  ["settings-oblasti", "/enigma-it/settings?tab=oblasti", async () => {}],
];

function meriSloj() {
  const vidljiv = (el) => {
    const s = getComputedStyle(el);
    if (s.visibility === "hidden" || s.display === "none" || Number(s.opacity) === 0) return false;
    if (el.closest('[aria-hidden="true"], .sr-only')) return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };
  const opis = (el) => {
    const cls = typeof el.className === "string" ? el.className : el.getAttribute("class") ?? "";
    const t = (el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 36);
    return `${el.tagName.toLowerCase()} "${t}" .${cls.slice(0, 80)}`;
  };
  const slojevi = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"], [role="menu"], [data-slot*="popover-content"], [data-slot="popover-popup"]')].filter(vidljiv);
  const sloj = slojevi.at(-1) ?? null;
  if (!sloj) return { sloj: null };
  const naslovi = [...sloj.querySelectorAll("h1, h2, [data-slot*='title']")].filter(vidljiv).map((h) => h.textContent.trim().slice(0, 40));
  const primarna = [...sloj.querySelectorAll('[data-variant="primary"]')].filter(vidljiv).map((b) => b.textContent.trim().slice(0, 30));
  const jeKartica = (el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.width < 160 || r.height < 64) return false;
    const ivica = ["Top", "Right", "Bottom", "Left"].every((k) => parseFloat(s[`border${k}Width`]) >= 1 && !s[`border${k}Color`].endsWith(", 0)"));
    const bg = s.backgroundColor;
    return ivica && bg !== "rgba(0, 0, 0, 0)" && parseFloat(s.borderTopLeftRadius) >= 10;
  };
  const kartice = [...sloj.querySelectorAll("*")].filter((el) => vidljiv(el) && !el.closest(".react-flow, .tiptap") && jeKartica(el));
  const ugnezdene = [];
  for (const k of kartice) {
    for (let p = k.parentElement; p && p !== sloj; p = p.parentElement) {
      if (kartice.includes(p)) {
        ugnezdene.push(`${opis(k)} ⊂ ${opis(p)}`);
        break;
      }
    }
  }
  const verzal = [];
  const sitno = [];
  for (const el of sloj.querySelectorAll("*")) {
    if (!vidljiv(el)) continue;
    const tekst = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!tekst) continue;
    const s = getComputedStyle(el);
    if (s.textTransform === "uppercase" && !el.closest("[data-slot='avatar-fallback'], kbd")) verzal.push(opis(el));
    if (parseFloat(s.fontSize) < 11.9) sitno.push(`${s.fontSize} ${opis(el)}`);
  }
  return { sloj: sloj.getAttribute("role") ?? sloj.dataset.slot, naslovi, primarna, ugnezdene: ugnezdene.slice(0, 8), verzal: verzal.slice(0, 8), sitno: sitno.slice(0, 8) };
}

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: MALI ? { width: 390, height: 844 } : { width: 1536, height: 695 },
  isMobile: MALI,
  hasTouch: MALI,
  colorScheme: "dark",
});
await ctx.addCookies([{ name: "ep_projekat", value: "enigma-it", url: BASE }]);
for (const [ime, put, radnja] of STANJA) {
  if (SAMO && !SAMO.includes(ime)) continue;
  const page = await ctx.newPage();
  const greske = [];
  page.on("pageerror", (e) => greske.push(String(e).slice(0, 200)));
  const url = `${BASE}${put}${put.includes("?") ? "&" : "?"}ux=1`;
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 90000 });
  } catch {
    await page.goto(url, { waitUntil: "load", timeout: 90000 });
  }
  await page.waitForTimeout(800);
  try {
    await radnja(page);
  } catch (e) {
    console.log(`\n=== ${ime}: radnja nije uspela (${String(e).split("\n")[0].slice(0, 120)})`);
  }
  await page.waitForTimeout(900);
  const m = await page.evaluate(meriSloj);
  console.log(`\n=== ${ime} sloj=${m.sloj} naslovi=[${(m.naslovi ?? []).join(" | ")}] primarna=${(m.primarna ?? []).length}${(m.primarna ?? []).length > 1 ? ` [${m.primarna.join(" | ")}]` : ""}${greske.length ? ` greske=${greske.length}` : ""}`);
  for (const k of ["ugnezdene", "verzal", "sitno"]) for (const v of m[k] ?? []) console.log(`  ${k.toUpperCase()} ${v}`);
  await page.screenshot({ path: `${OUT}/${ime}${MALI ? "-390" : ""}.png` });
  await page.close();
}
await browser.close();
