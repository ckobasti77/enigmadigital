// S26: snimci telefona (390 × 844, dodir) u docs/spajanje/snimci/S26-*.png.
// Next razvojni znak se sklanja (u produkciji ga nema).
import { chromium } from "playwright";

const BASE = "http://localhost:3117";
const OUT = "docs/spajanje/snimci";
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
  colorScheme: "dark",
});
await ctx.addCookies([{ name: "ep_projekat", value: "enigma-it", url: BASE }]);

async function otvori(put) {
  const page = await ctx.newPage();
  await page.goto(`${BASE}${put}${put.includes("?") ? "&" : "?"}ux=1`, { waitUntil: "networkidle" });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await page.waitForTimeout(1000);
  return page;
}

const SNIMCI = [
  ["danas", "/"],
  ["pocetna", "/enigma-it"],
  ["zadaci", "/enigma-it/zadaci"],
  ["stranica", "/enigma-it/stranica/pagesux0101"],
  ["poruke", "/poruke"],
];
for (const [ime, put] of SNIMCI) {
  const page = await otvori(put);
  await page.screenshot({ path: `${OUT}/S26-${ime}.png` });
  await page.close();
}

// Otvoren razgovor (klik gubi `?ux=1`, pa adresom) i panel zadatka.
{
  const page = await otvori("/enigma-it/poruke?kanal=chatChannelsux0001");
  await page.screenshot({ path: `${OUT}/S26-poruke-razgovor.png` });
  await page.close();
}
{
  const page = await otvori("/enigma-it/zadaci");
  await page.getByRole("button", { name: /Popravi prijavu na staging/ }).first().tap();
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/S26-panel-zadatka.png` });
  await page.close();
}
{
  const page = await otvori("/enigma-it/ideje");
  await page.locator("main").getByText("Mapa", { exact: true }).first().tap();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/S26-mapa-pregled.png` });
  await page.close();
}

// „Više“ u „Ja“ i u projektu.
for (const [ime, put] of [["vise-ja", "/"], ["vise-projekat", "/enigma-it/zadaci"]]) {
  const page = await otvori(put);
  await page.getByRole("navigation", { name: "Glavna navigacija" }).getByRole("button", { name: "Više" }).tap();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/S26-${ime}.png` });
  await page.close();
}
await browser.close();
console.log("snimci gotovi");
