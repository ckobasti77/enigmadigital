/**
 * ============================================================================
 * SNIMCI EKRANA ZA UX REGRESIJU (A1 §6, app-ux-plan.md §4.9)
 * ============================================================================
 *
 *   node scripts/ux-snapshots.mjs --faza pre        # pre izmena
 *   node scripts/ux-snapshots.mjs --faza posle      # posle izmena
 *   opcije: --port 3105  --bez-servera  --samo leadovi,instagram
 *
 * Podiže `next dev` na zadatom portu (osim uz `--bez-servera`), otvara pet
 * glavnih ekrana kroz razvojni prikaz sa sintetičkim podacima (`?ux=1` →
 * `app/dev-ux`, vidi `proxy.ts`) na 1440×900 i 390×844, i snima celu stranu u
 * `nocni-run/ux/<faza>-<ekran>-<viewport>.jpg`. Uz snimke ide
 * `nocni-run/ux/<faza>-log.json` sa visinom strane, brojem elemenata koji
 * probijaju širinu ekrana (vodoravno klizanje) i greškama iz konzole — dokaz
 * da nijedan ekran nije pokvaren, ne utisak.
 *
 * Playwright + Chromium se instaliraju jednom (`npx playwright install
 * chromium`); skript to proverava i javlja, ne instalira sam.
 */

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const OUT_DIR = join(ROOT, "nocni-run", "ux");

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(name);
  return i !== -1 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
};
const FAZA = opt("--faza", null);
const PORT = Number(opt("--port", "3105"));
const BEZ_SERVERA = argv.includes("--bez-servera");
const SAMO = opt("--samo", null)?.split(",").map((s) => s.trim()).filter(Boolean) ?? null;

// „pre" / „posle" su A1 i ne smeju da se prepišu — to je jedini dokaz da ta
// faza nije pokvarila ekrane. Svaka sledeća faza snima pod svojim imenom.
const FAZE = ["pre", "posle", "a2", "a3-pre", "a3", "a4-pre", "a4", "a5-pre", "a5", "a6-pre", "a6"];
if (!FAZE.includes(FAZA)) {
  console.error(`Zadaj --faza ${FAZE.join(" | ")}`);
  process.exit(2);
}

const VIEWPORTI = [
  { ime: "1440x900", width: 1440, height: 900, mobile: false },
  { ime: "390x844", width: 390, height: 844, mobile: true },
  // A4 §2: prelivanje tabele „Rupe u podacima" je IZMERENO na 1568 px, pa se
  // baš ta širina snima — na 1440 se preliv ne vidi isto.
  { ime: "1568x900", width: 1568, height: 900, mobile: false },
];

const PODRAZUMEVANI_VP = ["1440x900", "390x844"];

const EKRANI = [
  { ime: "kontrolna-tabla", putanja: "/" },
  { ime: "leadovi", putanja: "/leadovi" },
  // A3: `/leadovi` bez parametra otvara „Danas"; tabela je izričito `?tab=leads`
  // (pre A3 nepoznat jezičak takođe daje tabelu, pa isti URL važi za obe faze).
  { ime: "leadovi-tabela", putanja: "/leadovi?tab=leads" },
  { ime: "leadovi-zaostali", putanja: "/leadovi?tab=overdue" },
  // A4: radni redovi i mapa.
  {
    ime: "leadovi-rupe",
    putanja: "/leadovi?tab=gaps",
    viewporti: [...PODRAZUMEVANI_VP, "1568x900"],
  },
  { ime: "leadovi-sastanci", putanja: "/leadovi?tab=meetings" },
  { ime: "leadovi-mapa", putanja: "/leadovi?tab=map" },
  // A5: uvoz — stranica sa trakom o zaglavljenim uvozima, pregled jednog uvoza
  // (tok + nerazrešeni + rezime) i istorija (upozorenja parsera posle primene).
  { ime: "uvoz", putanja: "/leadovi/uvoz" },
  { ime: "uvoz-pregled", putanja: "/leadovi/uvoz?import=imp_ux_4" },
  {
    ime: "uvoz-istorija",
    putanja: "/leadovi/uvoz",
    // Selektor mora da bude vezan za samu tabelu istorije: `button[aria-expanded]`
    // bez toga pogađa i prekidače u bočnoj navigaciji.
    klik: ['[data-tab-id="history"]', 'table button[aria-expanded="false"]'],
  },
  { ime: "instagram", putanja: "/instagram" },
  { ime: "openreply", putanja: "/openreply" },
  { ime: "settings", putanja: "/settings" },
  // A6: propagacija sistema na ekrane koji do sada nisu imali razvojni prikaz.
  // Facebook/Threads/YouTube/Ads/Analitika/Atribucija nemaju sintetičke
  // fixture (zahtevaju veliki, ugnježden oblik odgovora — kampanje, uvid po
  // nalogu, itd.) i nisu ovde dodati; A6 izveštaj to prijavljuje kao rizik.
  { ime: "rules", putanja: "/rules" },
  { ime: "novosti", putanja: "/novosti" },
].filter((e) => !SAMO || SAMO.includes(e.ime));

const BASE = `http://localhost:${PORT}`;
const SERVER_ROK_MS = 240_000;
const STRANA_ROK_MS = 300_000;

async function proveriPlaywright() {
  let pw;
  try {
    pw = await import("playwright");
  } catch {
    throw new Error("Playwright nije instaliran: npm install, pa npx playwright install chromium");
  }
  try {
    const b = await pw.chromium.launch({ headless: true });
    await b.close();
  } catch (err) {
    throw new Error(`Chromium ne može da se pokrene: ${String(err?.message ?? err).split("\n")[0]} (npx playwright install chromium)`);
  }
  return pw.chromium;
}

async function cekajServer() {
  const start = Date.now();
  while (Date.now() - start < SERVER_ROK_MS) {
    try {
      const r = await fetch(`${BASE}/login`, { redirect: "manual" });
      if (r.status > 0) return;
    } catch {
      /* još nije gore */
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`Dev server na ${BASE} nije odgovorio u roku od ${SERVER_ROK_MS / 1000} s.`);
}

function pokreniServer() {
  const child = spawn("npx", ["next", "dev", "-p", String(PORT)], {
    cwd: ROOT,
    shell: true,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", BROWSER: "none" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (d) => {
    const s = String(d);
    if (/error|Error|✓ Ready|Ready in/.test(s)) process.stdout.write(`[next] ${s}`);
  });
  child.stderr.on("data", (d) => process.stdout.write(`[next:err] ${String(d)}`));
  return child;
}

function ugasiServer(child) {
  if (!child) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", shell: true });
  } else {
    child.kill("SIGTERM");
  }
}

async function snimi(browser, ekran, vp) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
    locale: "sr-RS",
    colorScheme: "dark",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const greske = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") greske.push(msg.text().slice(0, 300));
  });
  page.on("pageerror", (err) => greske.push(`pageerror: ${String(err.message).slice(0, 300)}`));

  const sep = ekran.putanja.includes("?") ? "&" : "?";
  const url = `${BASE}${ekran.putanja}${sep}ux=1`;
  await page.goto(url, { waitUntil: "networkidle", timeout: STRANA_ROK_MS });
  await page.waitForSelector("main", { timeout: 60_000 });
  // Next-ov razvojni indikator (dugme „N" dole levo) nije deo aplikacije.
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  // Skeletoni se povuku odmah (fixture stiže sinhrono), ali fontovi i GSAP
  // reveal traže trenutak.
  await page.waitForTimeout(1500);

  // Neki ekran se otvara tek klikom (jezičak „Istorija uvoza", razmotavanje
  // upozorenja parsera). Selektor koji ne postoji se preskače — snimak tada
  // pokazuje polazno stanje, ne pada.
  for (const selektor of ekran.klik ?? []) {
    const meta = page.locator(selektor).first();
    if ((await meta.count()) > 0) {
      await meta.click();
      await page.waitForTimeout(500);
    }
  }

  // ScrollTrigger otkriva sekcije tek kad uđu u vidno polje: prođi celu
  // stranu pa se vrati na vrh, da full-page snimak ne uhvati nevidljive blokove.
  const visina = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < visina; y += Math.floor(vp.height * 0.8)) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(120);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(600);

  // Vodoravno klizanje (§4.8): elementi širi od ekrana, i da li dokument uopšte
  // ima vodoravni preliv.
  const preliv = await page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const probijaju = [];
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > w + 1) {
        probijaju.push(`${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}.${String(el.className).split(" ").slice(0, 3).join(".")} (${Math.round(r.right - w)}px)`);
        if (probijaju.length >= 8) break;
      }
    }
    return {
      dokumentSiri: document.documentElement.scrollWidth > w + 1,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: w,
      probijaju,
    };
  });

  const fajl = `${FAZA}-${ekran.ime}-${vp.ime}.jpg`;
  await page.screenshot({
    path: join(OUT_DIR, fajl),
    fullPage: true,
    type: "jpeg",
    quality: 82,
  });
  const naslov = await page.title();
  const konacnaVisina = await page.evaluate(() => document.documentElement.scrollHeight);
  await context.close();

  return {
    ekran: ekran.ime,
    viewport: vp.ime,
    url: ekran.putanja,
    fajl,
    naslov,
    visinaPx: konacnaVisina,
    ...preliv,
    greske,
  };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const chromium = await proveriPlaywright();

  let server = null;
  if (!BEZ_SERVERA) {
    console.log(`Pokrećem next dev na portu ${PORT}…`);
    server = pokreniServer();
  }
  try {
    await cekajServer();
    const browser = await chromium.launch({ headless: true });
    const zapisi = [];
    try {
      for (const ekran of EKRANI) {
        const vpImena = ekran.viewporti ?? PODRAZUMEVANI_VP;
        for (const vp of VIEWPORTI.filter((v) => vpImena.includes(v.ime))) {
          process.stdout.write(`snimam ${ekran.ime} @ ${vp.ime} … `);
          try {
            const z = await snimi(browser, ekran, vp);
            zapisi.push(z);
            console.log(`ok (${z.visinaPx}px${z.dokumentSiri ? ", VODORAVNI PRELIV" : ""}${z.greske.length ? `, ${z.greske.length} grešaka u konzoli` : ""})`);
          } catch (err) {
            const poruka = String(err?.message ?? err).split("\n")[0];
            zapisi.push({ ekran: ekran.ime, viewport: vp.ime, url: ekran.putanja, neuspeh: poruka });
            console.log(`NEUSPEH: ${poruka}`);
          }
        }
      }
    } finally {
      await browser.close();
    }
    writeFileSync(
      join(OUT_DIR, `${FAZA}-log.json`),
      JSON.stringify({ faza: FAZA, kada: new Date().toISOString(), zapisi }, null, 2),
      "utf8",
    );
    const neuspesi = zapisi.filter((z) => z.neuspeh).length;
    console.log(`Gotovo: ${zapisi.length - neuspesi}/${zapisi.length} snimaka u nocni-run/ux/ (log: ${FAZA}-log.json).`);
    if (neuspesi > 0) process.exitCode = 1;
  } finally {
    ugasiServer(server);
  }
}

main().catch((err) => {
  console.error(String(err?.message ?? err));
  process.exit(1);
});
