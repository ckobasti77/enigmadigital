// S28: mreža u razvojnom prikazu — da li ljuska, Danas i Enigmini ekrani traže kod
// uređivača (Tiptap/ProseMirror), mapa (xyflow), Excel čitača ili web-push: traži se potpis
// u sadržaju svake učitane skripte. Na kraju se otvaraju stranica sa uređivačem i mapa
// (kontrola), da se vidi da potpis zaista hvata.
// Snima i S28 snimke (pomoć sa „Zatvori“, Inbox čipovi) u docs/spajanje/snimci/.
// Upotreba: node .nocni-run/spajanje/alati/s28-mreza.mjs
import { chromium } from "playwright";

const BASE = "http://localhost:3117";
const S = "enigma-it";
// Potpis u SADRŽAJU skripte (imena komada u dev-u ne nose uvek ime paketa).
const POTPISI = {
  tiptap: "ProseMirror-separator",
  xyflow: "react-flow__renderer",
  "read-excel-file": "Sheet relation ID not found",
  "web-push": "WebPushError",
};

const RUTE = [
  ["Danas", "/"],
  ["Moji zadaci", "/moji-zadaci"],
  ["Početna projekta", `/${S}`],
  ["Leadovi", `/${S}/leadovi`],
  ["Analitika", `/${S}/analytics`],
  ["Instagram", `/${S}/instagram`],
  ["Oglasi", `/${S}/ads`],
  ["Podešavanja", `/${S}/settings`],
  ["Oblast (Pregled)", `/${S}/dokumenti/areasux0001?tab=pregled`],
  // Kontrola: ovde potpis MORA da se pojavi.
  ["KONTROLA stranica (uređivač)", `/${S}/stranica/pagesux0101`],
  ["KONTROLA oblast (mapa)", `/${S}/dokumenti/areasux0001?tab=mapa`],
];

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1536, height: 695 } });
const page = await ctx.newPage();
for (const [ime, put] of RUTE) {
  const zahtevi = [];
  const nadjeno = new Set();
  const cekanja = [];
  const slusaj = (r) => {
    if (r.request().resourceType() !== "script") return;
    zahtevi.push(r.url());
    cekanja.push(
      r.text().then((t) => {
        for (const [ime, potpis] of Object.entries(POTPISI)) if (t.includes(potpis)) nadjeno.add(ime);
      }, () => {}),
    );
  };
  page.on("response", slusaj);
  await page.goto(`${BASE}${put}${put.includes("?") ? "&" : "?"}ux=1`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForSelector("main#sadrzaj", { timeout: 60_000 }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(1500);
  page.off("response", slusaj);
  await Promise.all(cekanja);
  console.log(`${ime.padEnd(30)} skripti ${String(zahtevi.length).padStart(3)}  teški: ${nadjeno.size ? [...nadjeno].join(", ") : "—"}`);
}

// Snimci izmena S28.
const snimi = async (put, ime, radnja, vp) => {
  await page.setViewportSize(vp);
  await page.goto(`${BASE}${put}?ux=1`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("main#sadrzaj", { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(1500);
  if (radnja) await radnja(page);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `docs/spajanje/snimci/S28-${ime}.png` });
};
const pomoc = async (p) => {
  await p.keyboard.press("Shift+Slash");
  await p.waitForTimeout(400);
  await p.keyboard.press("Tab"); // fokus na „Zatvori“ (vidljiv prsten)
};
await snimi("/moji-zadaci", "pomoc-1536", pomoc, { width: 1536, height: 695 });
await snimi("/inbox", "inbox-cipovi-1536", null, { width: 1536, height: 695 });
await snimi("/moji-zadaci", "pomoc-390", pomoc, { width: 390, height: 844 });
await b.close();
