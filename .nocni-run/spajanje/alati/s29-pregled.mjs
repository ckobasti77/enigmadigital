// S29: pregled razvojnog prikaza posle celog runa — svaki ekran pariteta (§6) i
// Enigmini ekrani (regresije) se otvaraju kroz `?ux=1`, uz nekoliko radnji koje
// su S25–S28 dirale (lenji dijalozi, ⌘K, zvono, prečice).
// Za svaki ekran: HTTP status, h1, greške u konzoli i na strani, tekst granice
// greške („Prikaz nije učitan.“), Next prekrivač greške i vodoravni skrol (390).
// Upotreba: node .nocni-run/spajanje/alati/s29-pregled.mjs [--vp 1536|390]
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "http://localhost:3117";
const S = "enigma-it";
const RUTE = [
  // „Ja“
  ["1 Danas", "/"],
  ["3-4 Moji zadaci", "/moji-zadaci"],
  ["5 Inbox", "/inbox"],
  ["6 Poruke (Ja)", "/poruke"],
  ["6 Poruke (Ja, DM)", "/poruke?kanal=chatChannelsux0021"],
  ["7 Beleške (Ja)", "/beleske"],
  ["Svi projekti", "/projekti"],
  ["34 Novi projekat", "/novi"],
  // Projekat
  ["10 Početna", `/${S}`],
  ["11 Zadaci", `/${S}/zadaci`],
  ["11 Zadaci (moji)", `/${S}/zadaci?filter=moji`],
  ["12 Zadatak (cela strana)", `/${S}/stranica/pagesux0200`],
  ["13 Ideje", `/${S}/ideje`],
  ["13 Ideja (detalj)", `/${S}/ideje?ideja=ideaNodesux0002`],
  ["15 Poruke projekta", `/${S}/poruke`],
  ["16 Dokumenti", `/${S}/dokumenti`],
  ["16 Oblast (pregled)", `/${S}/dokumenti/areasux0001?tab=pregled`],
  ["16 Oblast (zadaci)", `/${S}/dokumenti/areasux0001?tab=zadaci`],
  ["17 Oblast (dokumenti)", `/${S}/dokumenti/areasux0001?tab=dokumenti`],
  ["24 Oblast (mapa)", `/${S}/dokumenti/areasux0001?tab=mapa`],
  ["18-21 Stranica", `/${S}/stranica/pagesux0101`],
  ["19 Stranica zaključana", `/${S}/stranica/pagesux0104`],
  ["22 Stranica-tabela", `/${S}/stranica/pagesux0103`],
  ["23 Stranica-fajl", `/${S}/stranica/pagesux0107`],
  ["24 Mapa stranice", `/${S}/stranica/pagesux0102?tab=mapa`],
  ["8 Mapa beleški", `/${S}/beleske`],
  ["25 Korpa", `/${S}/korpa`],
  ["26 Aktivnost", `/${S}/aktivnost`],
  ["27 Puls", `/${S}/puls`],
  ["28 Podešavanja (projekat)", `/${S}/settings?tab=projekat`],
  ["28 Podešavanja (oblasti)", `/${S}/settings?tab=oblasti`],
  ["28 Podešavanja (lozinke)", `/${S}/settings?tab=lozinke`],
  ["35 Podešavanja (pristup)", `/${S}/settings?tab=pristup`],
  ["29 Podešavanja (AI)", `/${S}/settings?tab=ai`],
  ["P19 Firma (zadaci)", `/${S}/leadovi/lc_ux_test_002?tab=zadaci`],
  // Enigma (regresije)
  ["E Leadovi", `/${S}/leadovi`],
  ["E Leadovi uvoz", `/${S}/leadovi/uvoz`],
  ["E Analitika", `/${S}/analytics`],
  ["E Atribucija", `/${S}/atribucija`],
  ["E Instagram", `/${S}/instagram`],
  ["E Instagram komentari", `/${S}/instagram/komentari`],
  ["E Facebook", `/${S}/facebook`],
  ["E Facebook komentari", `/${S}/facebook/komentari`],
  ["E Threads", `/${S}/threads`],
  ["E YouTube", `/${S}/youtube`],
  ["E Oglasi", `/${S}/ads`],
  ["E Pravila", `/${S}/rules`],
  ["E Novosti", `/${S}/novosti`],
  ["E Napredak", `/${S}/napredak`],
  ["E OpenReply", `/${S}/openreply`],
  ["E Podešavanja (integracije)", `/${S}/settings`],
  ["E Panel početna", `/?rezim=panel`],
  ["E Panel zadaci", `/zadaci?rezim=panel`],
  ["E Posmatrač početna", `/${S}?uloga=client_viewer`],
  ["E Posmatrač zadaci", `/${S}/zadaci?uloga=client_viewer`],
  ["E Prijava", `/login`],
  ["E Pozivnica", `/pozivnica-ux`],
  ["Prazno Danas", `/?prazno=1`],
  ["Prazno Zadaci", `/${S}/zadaci?prazno=1`],
];

const argv = process.argv.slice(2);
const VP = argv.includes("--vp") ? Number(argv[argv.indexOf("--vp") + 1]) : 1536;
const OUT = ".nocni-run/spajanje/tmp/s29";
mkdirSync(OUT, { recursive: true });

const url = (put) => `${BASE}${put}${put.includes("?") ? "&" : "?"}ux=1`;

const b = await chromium.launch();
const ctx = await b.newContext({
  viewport: VP === 390 ? { width: 390, height: 844 } : { width: 1536, height: 695 },
  ...(VP === 390 ? { isMobile: true, hasTouch: true } : {}),
});
const page = await ctx.newPage();
let greske = [];
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") greske.push(`${m.type()}: ${m.text().slice(0, 220)}`);
});
page.on("pageerror", (e) => greske.push(`pageerror: ${String(e).slice(0, 220)}`));

const rezultati = [];
async function pregled(ime, put) {
  greske = [];
  let status = 0;
  try {
    const r = await page.goto(url(put), { waitUntil: "load", timeout: 90_000 });
    status = r?.status() ?? 0;
    await page.waitForTimeout(2500);
  } catch (e) {
    greske.push(`goto: ${String(e).slice(0, 200)}`);
  }
  const stanje = await page
    .evaluate(() => {
      const h1 = [...document.querySelectorAll("h1")]
        .filter((h) => h.getBoundingClientRect().height > 0)
        .map((h) => h.textContent.trim().slice(0, 40));
      const tekst = document.body.innerText;
      return {
        h1,
        granica: /Prikaz nije učitan|nije učitan\.|Nešto nije u redu|Application error|Unhandled Runtime Error|This page could not be found/.test(tekst),
        prijava: location.pathname.startsWith("/login") && !location.search.includes("ux=1"),
        prekrivac: !!document.querySelector("nextjs-portal")?.shadowRoot?.querySelector("[data-nextjs-dialog], [data-issues]"),
        skrol: document.documentElement.scrollWidth > window.innerWidth + 1,
      };
    })
    .catch((e) => ({ h1: [], granica: false, prijava: false, prekrivac: false, skrol: false, greska: String(e) }));
  const r = { ime, put, status, ...stanje, greske: [...greske] };
  rezultati.push(r);
  const losa = status >= 400 || r.granica || r.prekrivac || r.greske.length > 0 || (VP === 390 && r.skrol) || r.h1.length === 0;
  console.log(`${losa ? "✗" : "✓"} ${ime} [${status}] h1=${JSON.stringify(r.h1)}${r.granica ? " GRANICA" : ""}${r.prekrivac ? " PREKRIVAČ" : ""}${VP === 390 && r.skrol ? " SKROL" : ""}${r.greske.length ? ` greške=${r.greske.length}` : ""}`);
  for (const g of r.greske.slice(0, 3)) console.log(`    ${g}`);
}

for (const [ime, put] of RUTE) await pregled(ime, put);

// Radnje (redovi 2, 5, 9, 30, 33): posle S28 su dijalozi i fioka lenji.
const radnje = [];
async function radnja(ime, fn) {
  greske = [];
  let ok = false;
  let opis = "";
  try {
    opis = (await fn()) ?? "";
    ok = true;
  } catch (e) {
    opis = String(e).slice(0, 200);
  }
  radnje.push({ ime, ok, opis, greske: [...greske] });
  console.log(`${ok && greske.length === 0 ? "✓" : "✗"} RADNJA ${ime}: ${opis}${greske.length ? ` greške=${greske.length}` : ""}`);
  for (const g of greske.slice(0, 3)) console.log(`    ${g}`);
}

if (VP === 1536) {
  await page.goto(url("/"), { waitUntil: "load" });
  await page.waitForTimeout(2500);
  await radnja("2 brzi unos (q)", async () => {
    await page.keyboard.press("q");
    const d = page.getByRole("dialog");
    await d.waitFor({ timeout: 8000 });
    const t = (await d.innerText()).slice(0, 60).replace(/\s+/g, " ");
    await page.keyboard.press("Escape");
    await d.waitFor({ state: "hidden", timeout: 8000 });
    return `dijalog: ${t}`;
  });
  await radnja("33 pomoć (?)", async () => {
    await page.keyboard.press("Shift+Slash");
    const d = page.getByRole("dialog");
    await d.waitFor({ timeout: 8000 });
    const t = (await d.innerText()).slice(0, 60).replace(/\s+/g, " ");
    await page.keyboard.press("Escape");
    await d.waitFor({ state: "hidden", timeout: 8000 });
    return `dijalog: ${t}`;
  });
  await page.goto(url(`/${S}`), { waitUntil: "load" });
  await page.waitForTimeout(2500);
  await radnja("30 ⌘K pretraga „plan“", async () => {
    await page.keyboard.press("Control+k");
    const d = page.getByRole("dialog");
    await d.waitFor({ timeout: 8000 });
    await page.keyboard.type("plan");
    await page.waitForTimeout(1500);
    // Natpisi grupa su verzal kroz CSS, pa `innerText` vraća velika slova.
    const t = (await d.innerText()).toLowerCase();
    const grupe = ["stranice", "zadaci", "ideje", "poruke"].filter((g) => t.includes(g));
    await page.keyboard.press("Escape");
    if (grupe.length < 3) throw new Error(`grupe: ${grupe.join(", ")}`);
    return `grupe: ${grupe.join(", ")}`;
  });
  await radnja("5 zvono (Čeka te + Inbox)", async () => {
    await page.getByRole("button", { name: /Čeka te/ }).first().click();
    await page.waitForTimeout(1200);
    const tabovi = await page.getByRole("tab").allInnerTexts();
    await page.keyboard.press("Escape");
    const ima = (r) => tabovi.some((t) => t.includes(r));
    if (!ima("Čeka te") || !ima("Inbox")) throw new Error(`tabovi: ${tabovi.join(" | ")}`);
    return `tabovi: ${tabovi.map((t) => t.replace(/\s+/g, " ")).join(" | ")}`;
  });
  await radnja("9 profil iz menija korisnika", async () => {
    // Next razvojni znak (samo u dev-u) pokriva profil na dnu trake (S09).
    await page.evaluate(() => document.querySelector("nextjs-portal")?.remove());
    await page.getByRole("button", { name: /^Meni korisnika/ }).first().click();
    await page.getByRole("menuitem", { name: /Profil/ }).click();
    const d = page.getByRole("dialog");
    await d.waitFor({ timeout: 8000 });
    const t = (await d.innerText()).slice(0, 50).replace(/\s+/g, " ");
    await page.keyboard.press("Escape");
    return `dijalog: ${t}`;
  });
}

writeFileSync(`${OUT}/pregled-${VP}.json`, JSON.stringify({ rezultati, radnje }, null, 1));
const lose = rezultati.filter((r) => r.status >= 400 || r.granica || r.prekrivac || r.greske.length > 0 || (VP === 390 && r.skrol) || r.h1.length === 0);
console.log(`\nEkrana: ${rezultati.length}, sa nalazom: ${lose.length}; radnji: ${radnje.length}, palo: ${radnje.filter((r) => !r.ok || r.greske.length).length}`);
await b.close();
