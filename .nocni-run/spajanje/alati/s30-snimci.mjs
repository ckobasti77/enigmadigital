// S30: završni snimci glavnih ekrana (razvojni prikaz, ?ux=1) na 1536 × 695 i 390 × 844.
// Upotreba (dev server na 3117): node .nocni-run/spajanje/alati/s30-snimci.mjs
import { chromium } from "playwright";

const BASE = "http://localhost:3117";
const S = "enigma-it";
const EKRANI = [
  ["danas", "/"],
  ["moji-zadaci", "/moji-zadaci"],
  ["inbox", "/inbox"],
  ["poruke", "/poruke?kanal=chatChannelsux0021"],
  ["svi-projekti", "/projekti"],
  ["pocetna-projekta", `/${S}`],
  ["zadaci", `/${S}/zadaci`],
  ["zadatak", `/${S}/stranica/pagesux0200`],
  ["stranica", `/${S}/stranica/pagesux0101`],
  ["ideje", `/${S}/ideje`],
  ["mapa-oblasti", `/${S}/dokumenti/areasux0001?tab=mapa`],
  ["firma-zadaci", `/${S}/leadovi/lc_ux_test_002?tab=zadaci`],
];
const VP = [
  ["1536", { viewport: { width: 1536, height: 695 } }],
  ["390", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }],
];

const b = await chromium.launch();
let lose = 0;
for (const [oznaka, opcije] of VP) {
  const ctx = await b.newContext({ ...opcije, deviceScaleFactor: 1, colorScheme: "dark", reducedMotion: "reduce", locale: "sr-RS" });
  const page = await ctx.newPage();
  let greske = [];
  page.on("console", (m) => { if (m.type() === "error") greske.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => greske.push(`pageerror: ${String(e).slice(0, 200)}`));
  for (const [ime, put] of EKRANI) {
    greske = [];
    const url = `${BASE}${put}${put.includes("?") ? "&" : "?"}ux=1`;
    await page.goto(url, { waitUntil: "load", timeout: 120_000 });
    await page.waitForTimeout(3000);
    // Next razvojni znak postoji samo u dev-u i pokriva profil u traci.
    await page.evaluate(() => document.querySelector("nextjs-portal")?.remove());
    const h1 = await page.evaluate(() => [...document.querySelectorAll("h1")].filter((h) => h.getBoundingClientRect().height > 0).map((h) => h.textContent.trim()).join(" | "));
    const fajl = `docs/spajanje/snimci/S30-${ime}-${oznaka}.png`;
    await page.screenshot({ path: fajl });
    if (greske.length || !h1) lose++;
    console.log(`${greske.length || !h1 ? "✗" : "✓"} ${fajl} h1="${h1}"${greske.length ? ` greške=${greske.length}: ${greske[0]}` : ""}`);
  }
  await ctx.close();
}
await b.close();
console.log(`gotovo, sa nalazom: ${lose}`);
