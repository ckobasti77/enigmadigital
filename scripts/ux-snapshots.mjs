/**
 * ============================================================================
 * SNIMCI EKRANA ZA UX REGRESIJU (A1 §6, app-ux-plan.md §4.9)
 * ============================================================================
 *
 *   node scripts/ux-snapshots.mjs --faza pre        # pre izmena
 *   node scripts/ux-snapshots.mjs --faza posle      # posle izmena
 *   opcije: --port 3105  --bez-servera  --samo leadovi,instagram
 *           --vp 1440x900,390x844   (podrazumevano 1536x695,390x844)
 *   faze: `pre`, `posle` i A-faze su zaštićene; B-faza je svaki naziv koji
 *   počinje sa `b` (b0-pre, b2, b6-pre …) i snima se u `nocni-run/ux/b*`
 *   (u .gitignore — lokalni artefakt).
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
const FAZE = ["pre", "posle", "a2", "a3-pre", "a3", "a4-pre", "a4", "a5-pre", "a5", "a6-pre", "a6", "a8-pre", "a8"];
// B-faze (ui-boost-plan.md): svaki naziv koji počinje sa `b` — b0-pre, b2, b6-pre…
const JE_B = typeof FAZA === "string" && /^b[a-z0-9][a-z0-9-]*$/.test(FAZA);
if (!FAZE.includes(FAZA) && !JE_B) {
  console.error(`Zadaj --faza ${FAZE.join(" | ")} | b<naziv> (npr. b0-pre, b2)`);
  process.exit(2);
}

const VIEWPORTI = [
  { ime: "1440x900", width: 1440, height: 900, mobile: false },
  { ime: "390x844", width: 390, height: 844, mobile: true },
  // Jovanov stvarni ekran: 1920×1080 na 125 % skaliranja = 1536×695 CSS px.
  { ime: "1536x695", width: 1536, height: 695, mobile: false },
  // A4 §2: prelivanje tabele „Rupe u podacima" je IZMERENO na 1568 px, pa se
  // baš ta širina snima — na 1440 se preliv ne vidi isto.
  { ime: "1568x900", width: 1568, height: 900, mobile: false },
];

const PODRAZUMEVANI_VP = opt("--vp", "1536x695,390x844")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);
for (const ime of PODRAZUMEVANI_VP) {
  if (!VIEWPORTI.some((v) => v.ime === ime)) {
    console.error(`Nepoznat viewport ${ime}. Dozvoljeni: ${VIEWPORTI.map((v) => v.ime).join(", ")}`);
    process.exit(2);
  }
}

// Firma #2 iz `app/dev-ux/fixtures.ts` (`lc_ux_test_002`, ima sajt) — profil se otvara nad njom.
const LEAD_PROFIL_ID = "lc_ux_test_002";

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
    viewporti: JE_B ? PODRAZUMEVANI_VP : [...PODRAZUMEVANI_VP, "1568x900"],
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
  // A-faze su ove ekrane zvale „settings" i „rules"; B-faze koriste srpska imena.
  { ime: "settings", putanja: "/settings", samoA: true },
  { ime: "rules", putanja: "/rules", samoA: true },
  { ime: "novosti", putanja: "/novosti" },
  // B0: ekrani koji do sada nisu imali razvojni prikaz (samo B-faze).
  { ime: "analitika", putanja: "/analytics", samoB: true },
  { ime: "atribucija", putanja: "/atribucija", samoB: true },
  { ime: "facebook", putanja: "/facebook", samoB: true },
  { ime: "threads", putanja: "/threads", samoB: true },
  { ime: "youtube", putanja: "/youtube", samoB: true },
  { ime: "oglasi", putanja: "/ads", samoB: true },
  { ime: "leadovi-profil", putanja: `/leadovi/${LEAD_PROFIL_ID}`, samoB: true },
  { ime: "pravila", putanja: "/rules", samoB: true },
  { ime: "podesavanja", putanja: "/settings", samoB: true },
  // B2: živi vodič dizajn sistema (tokeni, 13 modula, dugmad, primitivi napretka).
  { ime: "sistem", putanja: "/sistem", samoB: true },
  // B3: stanja ljuske koja se vide tek posle klika — šina ikonica, ⌘K, meni
  // korisnika, i na telefonu list „Više" i zvono iz donje trake.
  {
    ime: "ljuska-sina",
    putanja: "/instagram",
    klik: ['button[aria-label="Skupi bočnu traku"]'],
    viewporti: ["1536x695"],
    samoB: true,
  },
  {
    ime: "ljuska-paleta",
    putanja: "/leadovi",
    klik: ['button[aria-label="Komandna paleta"]'],
    samoB: true,
  },
  {
    ime: "ljuska-meni",
    putanja: "/leadovi",
    klik: ['button[aria-label^="Meni korisnika"]'],
    samoB: true,
  },
  {
    ime: "ljuska-vise",
    putanja: "/analytics",
    // Neposredno dete trake: i zvono u ćeliji „Danas" nosi aria-haspopup.
    klik: ['nav.fixed > button[aria-haspopup="dialog"]'],
    viewporti: ["390x844"],
    samoB: true,
  },
  {
    ime: "ljuska-danas",
    putanja: "/leadovi",
    klik: ['nav.fixed button[aria-label^="Šta me čeka"]'],
    viewporti: ["390x844"],
    samoB: true,
  },
  // B5: ekran napretka, prazan nalog (nivo 1, bez misija), sekcija u
  // Podešavanjima i „Misije dana" u ⌘K.
  { ime: "napredak", putanja: "/napredak", samoB: true },
  { ime: "napredak-prazno", putanja: "/napredak", prazno: true, samoB: true },
  {
    ime: "podesavanja-napredak",
    putanja: "/settings",
    klik: ['[data-tab-id="napredak"]'],
    samoB: true,
  },
  {
    ime: "napredak-paleta",
    putanja: "/napredak",
    klik: ['button[aria-label="Komandna paleta"]'],
    viewporti: ["1536x695"],
    samoB: true,
  },
  // Upit napretka namerno pada (`pad=napredak`): ljuska i ekran moraju da
  // ostanu — kartica igrača se vrati na identitet, ekran kaže da podataka
  // nema. Greška u konzoli je ovde očekivana (React prijavi uhvaćenu grešku).
  { ime: "napredak-pad", putanja: "/napredak?pad=napredak", samoB: true },
  {
    ime: "ljuska-pad-napretka",
    putanja: "/leadovi?pad=napredak",
    viewporti: ["1536x695"],
    samoB: true,
  },
  // Traka za nov nivo se uživo vidi samo kad se nivo stvarno pređe; vodič je
  // pali dugmetom, nad istim podacima.
  {
    ime: "napredak-nov-nivo",
    putanja: "/sistem",
    klik: ['button:has-text("Prikaži nov nivo")'],
    samoB: true,
  },
  // B6: Režim poziva (fokus prikaz na Leadovima) — prva firma, pa tok posle dva
  // zabeležena ishoda (dnevnik sesije, kombo, napredak ture), i Kontrolna tabla
  // na praznom nalogu (bez misija: fokus vodi na prvi zadatak iz zvona).
  { ime: "leadovi-poziv", putanja: "/leadovi?rezim=poziv", samoB: true },
  {
    ime: "leadovi-poziv-tok",
    putanja: "/leadovi?rezim=poziv",
    klik: ['[data-ishod="nije_se_javio"]', '[data-ishod="zainteresovan"]'],
    samoB: true,
  },
  { ime: "kontrolna-tabla-prazno", putanja: "/", prazno: true, samoB: true },
  // Prazna stanja kanala: `&prazno=1` vraća prazan nalog (bez veza, bez redova).
  { ime: "instagram-prazno", putanja: "/instagram", prazno: true, samoB: true },
  { ime: "analitika-prazno", putanja: "/analytics", prazno: true, samoB: true },
  { ime: "facebook-prazno", putanja: "/facebook", prazno: true, samoB: true },
  { ime: "threads-prazno", putanja: "/threads", prazno: true, samoB: true },
  { ime: "youtube-prazno", putanja: "/youtube", prazno: true, samoB: true },
  { ime: "oglasi-prazno", putanja: "/ads", prazno: true, samoB: true },
]
  .filter((e) => (JE_B ? !e.samoA : !e.samoB))
  .filter((e) => !SAMO || SAMO.includes(e.ime));

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
  const url = `${BASE}${ekran.putanja}${sep}ux=1${ekran.prazno ? "&prazno=1" : ""}`;
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
    let ukupnoProbijaju = 0;
    // Element unutar namerno klizne (overflow-x auto/scroll/hidden) ili odsečene
    // grane se ne računa: tabela u sopstvenom klizaču nije probijanje strane.
    const odsecen = (el) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if (ox === "auto" || ox === "scroll" || ox === "hidden" || ox === "clip") return true;
      }
      return false;
    };
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > w + 1 && !odsecen(el)) {
        ukupnoProbijaju += 1;
        if (probijaju.length < 8) {
          probijaju.push(`${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}.${String(el.className).split(" ").slice(0, 3).join(".")} (${Math.round(r.right - w)}px)`);
        }
      }
    }
    return {
      dokumentSiri: document.documentElement.scrollWidth > w + 1,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: w,
      probijaju,
      ukupnoProbijaju,
    };
  });

  // B-mere (ui-boost-plan.md §10): jedno primarno dugme iznad preloma, vertikalni
  // klizač na trakama tabova i u bočnoj traci. Dok atribut `data-variant` ne
  // postoji na dugmadima (B2), broj primarnih je 0 i to je u redu.
  const mere = await page.evaluate((visinaEkrana) => {
    const vidljiv = (el) => {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.display !== "none";
    };
    const primarnihIznadPreloma = [...document.querySelectorAll('[data-variant="primary"]')].filter((el) => {
      if (!vidljiv(el)) return false;
      const r = el.getBoundingClientRect();
      return r.top < visinaEkrana && r.bottom > 0;
    }).length;
    const opis = (el) => el.getAttribute("aria-label") ?? el.className.toString().split(" ").slice(0, 3).join(".");
    const trakeSaKlizacem = [...document.querySelectorAll("[role=tablist]")]
      .filter((el) => el.scrollHeight > el.clientHeight + 1)
      .map((el) => `${opis(el)} (${el.scrollHeight}/${el.clientHeight})`);
    // F1: `overflow-x:auto` bez `overflow-y:hidden` računa `overflow-y:auto`, pa
    // Windows crta vertikalni klizač sa ▲▼ čim vodoravni klizač zauzme visinu.
    // Headless Chromium ima prekrivajuće klizače i to ne vidi po geometriji, zato
    // se meri i stil: traka tabova (tablist ili nav van bočne trake) sa
    // `overflow-y` auto/scroll.
    const trakeSaStilomKlizaca = [...document.querySelectorAll("[role=tablist], nav")]
      .filter((el) => !el.closest("aside") && vidljiv(el))
      .filter((el) => {
        const st = getComputedStyle(el);
        const x = st.overflowX === "auto" || st.overflowX === "scroll";
        const y = st.overflowY === "auto" || st.overflowY === "scroll";
        return x && y;
      })
      .map(opis);
    const bocna = document.querySelector("aside");
    let bocnaKlizac = null;
    if (bocna && vidljiv(bocna)) {
      bocnaKlizac = [bocna, ...bocna.querySelectorAll("*")].some((el) => {
        if (el.scrollHeight <= el.clientHeight + 1) return false;
        const oy = getComputedStyle(el).overflowY;
        return oy === "auto" || oy === "scroll";
      });
    }
    return { primarnihIznadPreloma, trakeSaKlizacem, trakeSaStilomKlizaca, bocnaKlizac };
  }, vp.height);

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
    brojProbijaju: preliv.ukupnoProbijaju,
    ...mere,
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
