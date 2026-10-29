// S26: merenje stanja posle interakcije na 390 × 844 (dodir): fioke, paneli,
// dijalozi, meniji, detalji. Ista funkcija `meri()` kao s26-telefon.mjs.
// Upotreba: node .nocni-run/spajanje/alati/s26-stanja.mjs [--samo a,b]
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";

const src = readFileSync(".nocni-run/spajanje/alati/s26-telefon.mjs", "utf8");
const meri = new Function(
  `return (${src.slice(src.indexOf("function meri()"), src.indexOf("\nconst browser")).trim()})`,
)();

const BASE = "http://localhost:3117";
const OUT = ".nocni-run/spajanje/tmp/s26/stanja";
mkdirSync(OUT, { recursive: true });
const argv = process.argv.slice(2);
const samoI = argv.indexOf("--samo");
const SAMO = samoI >= 0 ? argv[samoI + 1].split(",") : null;

const tap = async (loc) => {
  await loc.first().scrollIntoViewIfNeeded();
  await loc.first().tap();
};

const STANJA = [
  ["danas-meni-reda", "/", (p) => tap(p.getByRole("button", { name: /^Radnje:/ }))],
  ["danas-brzi-unos", "/", (p) => tap(p.getByRole("button", { name: /Brzi unos/ }))],
  ["danas-isplaniraj", "/", (p) => tap(p.getByRole("button", { name: /Isplaniraj dan/ }))],
  ["danas-zvono", "/", (p) => tap(p.getByRole("button", { name: /Čeka te/ }))],
  ["mz-filteri", "/moji-zadaci", (p) => tap(p.getByRole("button", { name: /^Filteri/ }))],
  ["mz-zadatak", "/moji-zadaci", (p) => tap(p.locator("main [data-task-row] button, main li button").filter({ hasText: /\w{4,}/ }))],
  ["inbox-filter", "/inbox", (p) => tap(p.locator("main button").filter({ hasText: /\w{3,}/ }).nth(1))],
  // Klik na razgovor gubi `?ux=1` (adresa se menja), pa se razgovor otvara adresom.
  ["poruke-razgovor", "/poruke?kanal=chatChannelsux0021", async () => {}],
  ["poruke-kanal", "/enigma-it/poruke?kanal=chatChannelsux0001", async () => {}],
  ["poruke-nova", "/poruke", (p) => tap(p.getByRole("button", { name: /Nova poruka|Novi razgovor/ }))],
  ["beleske-posalji", "/beleske", (p) => tap(p.locator("main [aria-haspopup=menu]"))],
  ["pocetna-novi-zadatak", "/enigma-it", (p) => tap(p.getByRole("button", { name: /Novi zadatak/ }))],
  ["pocetna-sredi-rokove", "/enigma-it", (p) => tap(p.getByRole("button", { name: /Sredi rokove/ }))],
  ["zadaci-panel", "/enigma-it/zadaci", (p) => tap(p.getByRole("button", { name: /Popravi prijavu na staging/ }))],
  ["zadaci-panel-status", "/enigma-it/zadaci", async (p) => {
    await tap(p.getByRole("button", { name: /Popravi prijavu na staging/ }));
    await p.waitForTimeout(800);
    await tap(p.getByRole("dialog").getByRole("button", { name: /Status/ }));
  }],
  ["zadaci-novi", "/enigma-it/zadaci", (p) => tap(p.getByRole("button", { name: /Novi zadatak/ }))],
  ["ideje-lista", "/enigma-it/ideje", (p) => tap(p.getByRole("radio", { name: "Lista" }).or(p.getByRole("tab", { name: "Lista" })).or(p.getByRole("button", { name: "Lista" })))],
  ["ideje-mapa", "/enigma-it/ideje", (p) => tap(p.getByRole("radio", { name: "Mapa" }).or(p.getByRole("tab", { name: "Mapa" })).or(p.getByRole("button", { name: "Mapa" })))],
  ["ideje-detalj", "/enigma-it/ideje", (p) => tap(p.getByText("Nedeljni bilten za klijente"))],
  ["ideje-nova", "/enigma-it/ideje", (p) => tap(p.getByRole("button", { name: /Nova ideja/ }))],
  ["oblast-nova-stranica", "/enigma-it/dokumenti/areasux0001", (p) => tap(p.getByRole("button", { name: /Nova stranica/ }))],
  ["oblast-mapa-kartica", "/enigma-it/dokumenti/areasux0001?tab=mapa", (p) => tap(p.locator(".react-flow__node").first())],
  ["stranica-meni", "/enigma-it/stranica/pagesux0101", (p) => tap(p.getByRole("button", { name: /Još radnji|Radnje|Više/ }).filter({ hasNot: p.locator("nav") }))],
  ["stranica-tabela", "/enigma-it/stranica/pagesux0103", async () => {}],
  ["beleske-mapa", "/enigma-it/beleske", async () => {}],
  ["korpa-meni", "/enigma-it/korpa", (p) => tap(p.locator("main [aria-haspopup=menu], main button").filter({ hasText: /Vrati|Obriši/ }))],
  ["aktivnost-filter", "/enigma-it/aktivnost", (p) => tap(p.locator("main button").filter({ hasText: /\w{3,}/ }).first())],
  ["settings", "/enigma-it/settings", async () => {}],
];

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
  colorScheme: "dark",
});
await ctx.addCookies([{ name: "ep_projekat", value: "enigma-it", url: BASE }]);
for (const [ime, put, radnja] of STANJA) {
  if (SAMO && !SAMO.includes(ime)) continue;
  const page = await ctx.newPage();
  const greske = [];
  page.on("pageerror", (e) => greske.push(String(e).slice(0, 200)));
  page.on("console", (m) => m.type() === "error" && greske.push(m.text().slice(0, 200)));
  await page.goto(`${BASE}${put}${put.includes("?") ? "&" : "?"}ux=1`, { waitUntil: "networkidle", timeout: 120000 });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await page.waitForTimeout(800);
  let ok = true;
  try {
    await radnja(page);
    await page.waitForTimeout(900);
  } catch (e) {
    ok = false;
    console.log(`\n=== ${ime}: RADNJA NIJE USPELA ${String(e).split("\n")[0].slice(0, 160)}`);
  }
  const m = await page.evaluate(meri);
  const male = m.male.filter((x) => !x.includes("Preskoči") && !x.includes(".sr-only"));
  console.log(`\n=== ${ime}${ok ? "" : " (bez radnje)"} sw=${m.sw} preliv=${m.preliv.length} male=${male.length} greske=${greske.length}`);
  for (const x of m.preliv) console.log("  PRELIV", x);
  for (const x of male) console.log("  MALO ", x.slice(0, 190));
  for (const g of greske.slice(0, 3)) console.log("  GREŠKA", g);
  await page.screenshot({ path: `${OUT}/${ime}.png` });
  await page.close();
}
await browser.close();
