/**
 * ============================================================================
 * ZAVRŠNA PROVERA (B10) — mere iz ui-boost-plan.md §10 nad razvojnim prikazom
 * ============================================================================
 *
 *   node scripts/b10-provera.mjs --port 3105            # sve sekcije
 *   node scripts/b10-provera.mjs --port 3105 --samo rute,primarno
 *
 * Sekcije (svaka ispisuje tabelu i na kraju PROLAZI / PADA):
 *   rute      §10.1  svaka ruta i njen `data-module` (registar + živi DOM),
 *                    ikonice bočne trake u boji svog modula
 *   primarno  §10.2  broj `[data-variant="primary"]` iznad preloma na 1536×695
 *   traka     §10.10 donja traka na 390 px: broj ćelija i vodoravno klizanje
 *   lista     §10.11 pre-delivery lista po glavnom ekranu (pokazivač, hover,
 *                    fokus, reduced-motion, emodži, preliv na pet širina)
 *   pokret    §10.12 šta se animira pri otvaranju ekrana (bez reduced-motion)
 *
 * Traži `next dev` koji već radi na zadatom portu (skripta ga ne podiže) i
 * Playwright + Chromium, kao `scripts/ux-snapshots.mjs`. Izlazni kod je 1 ako
 * ijedna sekcija padne.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(name);
  return i !== -1 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
};
const PORT = Number(opt("--port", "3105"));
const SAMO = opt("--samo", "rute,primarno,traka,lista,pokret").split(",");
const BASE = `http://localhost:${PORT}`;

// Glavni ekrani = redovi tabele u planu §8. `primarno` je ono što plan tamo
// navodi kao primarno dugme (null = plan kaže „—").
const LEAD = "lc_ux_test_002";
const GLAVNI = [
  { ime: "Kontrolna tabla", putanja: "/" },
  { ime: "Leadovi · Danas", putanja: "/leadovi" },
  { ime: "Režim poziva", putanja: "/leadovi?rezim=poziv" },
  { ime: "Leadovi · Tabela", putanja: "/leadovi?tab=leads" },
  { ime: "Profil firme", putanja: `/leadovi/${LEAD}` },
  { ime: "Uvoz", putanja: "/leadovi/uvoz" },
  { ime: "Analitika", putanja: "/analytics" },
  { ime: "Atribucija", putanja: "/atribucija" },
  { ime: "Instagram", putanja: "/instagram" },
  { ime: "Facebook", putanja: "/facebook" },
  { ime: "YouTube", putanja: "/youtube" },
  { ime: "Threads", putanja: "/threads" },
  { ime: "Oglasi", putanja: "/ads" },
  { ime: "OpenReply", putanja: "/openreply" },
  { ime: "Pravila", putanja: "/rules" },
  { ime: "Novosti", putanja: "/novosti" },
  { ime: "Podešavanja", putanja: "/settings" },
  { ime: "Napredak", putanja: "/napredak" },
  // Prijava nije radni ekran: ulazak kartice sme da ostane (plan §4.4, B9).
  { ime: "Prijava", putanja: "/login", radni: false },
];

// Rute koje razvojni prikaz ume da iscrta (`app/dev-ux/[[...slug]]/page.tsx`).
const ZIVE = new Set([
  "/", "/leadovi", "/leadovi/uvoz", "/leadovi/[companyId]", "/instagram", "/openreply",
  "/settings", "/rules", "/novosti", "/analytics", "/atribucija", "/facebook", "/threads",
  "/youtube", "/ads", "/napredak", "/instagram/komentari", "/facebook/komentari",
  "/youtube/automatizacije", "/ads/nova-kampanja", "/ads/publike", "/analytics/sticanje",
  "/analytics/oglasi", "/analytics/sadrzaj", "/analytics/posetioci", "/analytics/uzivo",
  "/analytics/retencija", "/openreply/automatizacije", "/login",
]);

const ux = (putanja) => `${BASE}${putanja}${putanja.includes("?") ? "&" : "?"}ux=1`;
const red = (...polja) => console.log(`| ${polja.join(" | ")} |`);
let pada = 0;
const presuda = (sekcija, ok, napomena = "") => {
  if (!ok) pada += 1;
  console.log(`\n${ok ? "PROLAZI" : "PADA"} — ${sekcija}${napomena ? `: ${napomena}` : ""}\n`);
};

async function otvori(browser, putanja, vp, { reduce = true, mobile = false, init } = {}) {
  const context = await browser.newContext({
    viewport: vp,
    deviceScaleFactor: 1,
    isMobile: mobile,
    hasTouch: mobile,
    locale: "sr-RS",
    colorScheme: "dark",
    reducedMotion: reduce ? "reduce" : "no-preference",
  });
  const page = await context.newPage();
  if (init) await page.addInitScript(init);
  await page.goto(ux(putanja), { waitUntil: "networkidle", timeout: 300_000 });
  await page.waitForSelector("main", { timeout: 60_000 });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  return { context, page };
}

/**
 * Posmatrač koji se upisuje pre prvog skripta strane. Beleži, po elementu, sve
 * vrednosti transformacije koje su mu upisane u `style` (GSAP piše tamo) i sve
 * tekstove brojeva (`.tabular-nums`). „Pomeren" je element sa bar dve različite
 * vrednosti: jedno `gsap.set` na mesto (traka napretka) nije pokret, tvin jeste.
 * Vrednost se svodi na brojeve različite od nule, pa su `translateX(-40%)` i
 * `translate(-40%, 0px)` isto, a `translate(0px, 0px)` je isto što i bez nje.
 */
const POSMATRAC = () => {
  window.__b10 = { pomereni: new Map(), brojevi: new Map() };
  const svedi = (stil) => {
    const delovi = [];
    for (const m of stil.matchAll(/(?:^|;)\s*(transform|translate|scale|rotate)\s*:\s*([^;]+)/g)) {
      const v = m[2].trim();
      if (v === "none") continue;
      // Bez imena funkcija: „3" iz `translate3d` nije vrednost.
      const brojevi = (v.replace(/[a-zA-Z]+\d*[a-zA-Z]*\(/g, "(").match(/-?\d*\.?\d+(?:e-?\d+)?(?:px|%|deg|rem|em)?/g) ?? [])
        .map((b) => [parseFloat(b), b.replace(/^-?\d*\.?\d+(?:e-?\d+)?/, "")])
        .filter(([n]) => Math.abs(n) > 0.05)
        .filter(([n, j]) => !(m[1] !== "translate" && j === "" && Math.abs(n - 1) < 0.001 && /scale|matrix/.test(v)))
        .map(([n, j]) => `${Math.round(n * 10) / 10}${j}`);
      if (brojevi.length) delovi.push(`${m[1]}:${brojevi.join(",")}`);
    }
    return delovi.join("|");
  };
  new MutationObserver((zapisi) => {
    for (const z of zapisi) {
      if (z.type === "attributes") {
        const vrednosti = window.__b10.pomereni.get(z.target) ?? new Set();
        vrednosti.add(svedi(z.target.getAttribute("style") ?? ""));
        window.__b10.pomereni.set(z.target, vrednosti);
      } else {
        const el = z.target.nodeType === 3 ? z.target.parentElement : z.target;
        const nosilac = el?.closest?.(".tabular-nums");
        if (nosilac) {
          const niz = window.__b10.brojevi.get(nosilac) ?? [];
          niz.push(nosilac.textContent);
          window.__b10.brojevi.set(nosilac, niz);
        }
      }
    }
  }).observe(document, { subtree: true, attributes: true, attributeFilter: ["style"], attributeOldValue: true, childList: true, characterData: true });
};

/* -------------------------------------------------------------------------- */
/* §10.1 — rute i data-module                                                 */
/* -------------------------------------------------------------------------- */

function sveRute() {
  const rute = [];
  const hodaj = (dir) => {
    for (const ime of readdirSync(dir)) {
      const put = join(dir, ime);
      if (statSync(put).isDirectory()) {
        if (ime === "api" || ime === "dev-ux") continue;
        hodaj(put);
      } else if (ime === "page.tsx") {
        const delovi = relative(join(ROOT, "app"), dir).split(sep).filter(Boolean);
        // Ekrani projekta su pod `(app)/[projekat]`; segment projekta nije deo
        // putanje ekrana (u panelu ga nema, u hubu je prefiks).
        const uLjusci = delovi[0] === "(app)" && delovi[1] === "[projekat]";
        const ruta =
          "/" + delovi.filter((d) => !/^\(.*\)$/.test(d) && d !== "[projekat]").join("/");
        rute.push({ ruta, uLjusci, fajl: relative(ROOT, put).split(sep).join("/") });
      }
    }
  };
  hodaj(join(ROOT, "app"));
  return rute.sort((a, b) => a.ruta.localeCompare(b.ruta));
}

/** Registar href → modul, pročitan iz `nav-items.ts` (isti koji čita ljuska). */
function registarModula() {
  const src = readFileSync(join(ROOT, "components/app/nav-items.ts"), "utf8");
  const parovi = [];
  for (const m of src.matchAll(/\{[^{}]*\}/g)) {
    const href = m[0].match(/href:\s*"([^"]+)"/)?.[1];
    const modul = m[0].match(/module:\s*"([^"]+)"/)?.[1];
    if (href && modul) parovi.push({ href, modul });
  }
  return parovi.sort((a, b) => b.href.length - a.href.length);
}

/** Ruta van ljuske: `data-module` mora da stoji u samom fajlu ili u onome što uvozi. */
function modulVanLjuske(fajl) {
  const procitaj = (rel) => {
    try {
      return readFileSync(join(ROOT, rel), "utf8");
    } catch {
      return "";
    }
  };
  const src = procitaj(fajl);
  const kandidati = [src];
  for (const m of src.matchAll(/from\s+"(\.\/[^"]+|@\/components\/app\/system\/[^"]+)"/g)) {
    const rel = m[1].startsWith("@/")
      ? `${m[1].slice(2)}.tsx`
      : `${fajl.slice(0, fajl.lastIndexOf("/"))}/${m[1].slice(2)}.tsx`;
    const uvoz = procitaj(rel);
    kandidati.push(uvoz);
    for (const n of uvoz.matchAll(/from\s+"(@\/components\/app\/system\/[^"]+)"/g)) {
      kandidati.push(procitaj(`${n[1].slice(2)}.tsx`));
    }
  }
  for (const k of kandidati) {
    const m = k.match(/data-module="([a-z]+)"/);
    if (m) return m[1];
  }
  return null;
}

async function sekcijaRute(browser) {
  console.log("## §10.1 — rute i `data-module`\n");
  const registar = registarModula();
  const izRegistra = (ruta) => {
    const p = ruta.replace(/\/\[[^\]]+\]/g, "/x");
    const pogodak = registar.find((r) =>
      r.href === "/" ? p === "/" : p === r.href || p.startsWith(`${r.href}/`),
    );
    return pogodak?.modul ?? "tabla";
  };

  red("ruta", "izvor", "modul (kod)", "html[data-module] (DOM)", "kolona/main (DOM)", "--primary (DOM)");
  red("---", "---", "---", "---", "---", "---");
  let bez = 0;
  let neslaganja = 0;
  for (const r of sveRute()) {
    const kod = r.uLjusci ? izRegistra(r.ruta) : modulVanLjuske(r.fajl);
    let dom = { html: "nije iscrtano", kolona: "—", primary: "—" };
    if (ZIVE.has(r.ruta)) {
      const putanja = r.ruta.replace("[companyId]", LEAD);
      const { context, page } = await otvori(browser, putanja, { width: 1536, height: 695 });
      dom = await page.evaluate(() => {
        const main = document.querySelector("main");
        const nosilac = main?.closest("[data-module]");
        const boja = document.createElement("span");
        boja.style.color = "var(--primary)";
        (nosilac ?? document.body).appendChild(boja);
        const primary = getComputedStyle(boja).color;
        boja.remove();
        return {
          html: document.documentElement.dataset.module ?? "(nema)",
          kolona: nosilac?.getAttribute("data-module") ?? "(nema)",
          primary,
        };
      });
      await context.close();
      if (dom.kolona !== (kod ?? "(nema)")) neslaganja += 1;
    }
    if (!kod) bez += 1;
    red(r.ruta, r.uLjusci ? "ljuska → registar" : "van ljuske", kod ?? "**(nema)**", dom.html, dom.kolona, dom.primary);
  }

  // Ikonice bočne trake: boja pločice i ikonice mora da bude `--mod` tog modula.
  const { context, page } = await otvori(browser, "/settings", { width: 1536, height: 695 });
  const ikone = await page.evaluate(() => {
    const boja = (modul, izraz) => {
      const el = document.createElement("span");
      el.setAttribute("data-module", modul);
      el.style.color = izraz;
      document.body.appendChild(el);
      const c = getComputedStyle(el).color;
      el.remove();
      return c;
    };
    return [...document.querySelectorAll("aside [data-module]")]
      .map((nosilac) => {
        const modul = nosilac.getAttribute("data-module");
        const svg = nosilac.querySelector("svg");
        if (!svg) return null;
        const plocica = svg.parentElement;
        const aktivna = getComputedStyle(plocica).backgroundColor === boja(modul, "var(--mod-strong)");
        return {
          modul,
          natpis: (nosilac.querySelector("a")?.textContent ?? nosilac.getAttribute("aria-label") ?? "").trim().slice(0, 24),
          ikona: getComputedStyle(svg).color,
          ocekivano: boja(modul, "var(--mod)"),
          aktivna,
          podloga: getComputedStyle(plocica).backgroundColor,
        };
      })
      .filter(Boolean);
  });
  await context.close();
  console.log("\nIkonice bočne trake (1536×695, `/settings`):\n");
  red("stavka", "modul", "boja ikonice", "`--mod` modula", "poklapa se");
  red("---", "---", "---", "---", "---");
  let pogresne = 0;
  for (const i of ikone) {
    // Aktivna pločica je puna boja modula sa tamnom ikonicom — tada boju nosi podloga.
    const ok = i.aktivna || i.ikona === i.ocekivano;
    if (!ok) pogresne += 1;
    red(i.natpis || "(bez natpisa)", i.modul, i.aktivna ? `${i.podloga} (puna pločica)` : i.ikona, i.ocekivano, ok ? "da" : "**NE**");
  }
  const boje = new Set(ikone.filter((i) => i.modul !== "sistem" && i.modul !== "threads").map((i) => i.ocekivano));
  console.log(`\nRazličitih boja među ikonicama (bez dva neutralna modula): ${boje.size}`);
  presuda(
    "§10.1 rute",
    bez === 0 && neslaganja === 0 && pogresne === 0,
    `ruta bez data-module: ${bez}, neslaganje kod/DOM: ${neslaganja}, ikonica van boje modula: ${pogresne}`,
  );
}

/* -------------------------------------------------------------------------- */
/* §10.2 — jedno primarno dugme iznad preloma                                  */
/* -------------------------------------------------------------------------- */

const PRIMARNA = (visina) => {
  const vidljiv = (el) => {
    const r = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.display !== "none";
  };
  const sva = [...document.querySelectorAll('[data-variant="primary"]')].filter(vidljiv);
  const iznad = sva.filter((el) => {
    const r = el.getBoundingClientRect();
    return r.top < visina && r.bottom > 0;
  });
  return {
    iznad: iznad.map((el) => ({
      tekst: (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40) || el.getAttribute("aria-label"),
      dno: Math.round(el.getBoundingClientRect().bottom),
    })),
    ukupno: sva.length,
  };
};

async function sekcijaPrimarno(browser) {
  console.log("## §10.2 — `[data-variant=\"primary\"]` iznad preloma na 1536×695\n");
  red("ekran", "putanja", "iznad preloma", "dugme (donja ivica px)", "na celoj strani");
  red("---", "---", "---", "---", "---");
  let lose = 0;
  for (const e of GLAVNI) {
    const { context, page } = await otvori(browser, e.putanja, { width: 1536, height: 695 });
    await page.waitForTimeout(1200);
    const m = await page.evaluate(PRIMARNA, 695);
    await context.close();
    if (m.iznad.length !== 1) lose += 1;
    red(
      e.ime,
      `\`${e.putanja}\``,
      m.iznad.length === 1 ? "1" : `**${m.iznad.length}**`,
      m.iznad.map((d) => `„${d.tekst}" (${d.dno})`).join(", ") || "—",
      String(m.ukupno),
    );
  }
  presuda("§10.2 primarno", lose === 0, `ekrana kojima broj nije 1: ${lose} od ${GLAVNI.length}`);
}

/* -------------------------------------------------------------------------- */
/* §10.10 — donja traka na telefonu                                            */
/* -------------------------------------------------------------------------- */

async function sekcijaTraka(browser) {
  console.log("## §10.10 — donja traka na 390×844\n");
  red("ekran", "ćelija", "širine ćelija (px)", "scrollWidth / clientWidth trake", "dokument širi od ekrana");
  red("---", "---", "---", "---", "---");
  let lose = 0;
  for (const putanja of ["/", "/leadovi", "/instagram", "/analytics", "/threads", "/settings", "/napredak"]) {
    const { context, page } = await otvori(browser, putanja, { width: 390, height: 844 }, { mobile: true });
    await page.waitForTimeout(800);
    const m = await page.evaluate(() => {
      const nav = document.querySelector('nav[aria-label="Glavna navigacija"].fixed');
      if (!nav) return null;
      const celije = [...nav.children].filter((c) => c.getBoundingClientRect().width > 0);
      return {
        celija: celije.length,
        sirine: celije.map((c) => Math.round(c.getBoundingClientRect().width)),
        sw: nav.scrollWidth,
        cw: nav.clientWidth,
        dokument: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      };
    });
    await context.close();
    const ok = m && m.celija <= 5 && m.sw <= m.cw + 1 && !m.dokument;
    if (!ok) lose += 1;
    red(`\`${putanja}\``, m ? String(m.celija) : "**nema trake**", m?.sirine.join(" · ") ?? "—", m ? `${m.sw} / ${m.cw}` : "—", m?.dokument ? "**da**" : "ne");
  }
  presuda("§10.10 donja traka", lose === 0, `ekrana van mere: ${lose}`);
}

/* -------------------------------------------------------------------------- */
/* §10.11 — pre-delivery lista                                                 */
/* -------------------------------------------------------------------------- */

const SIRINE = [
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
  { width: 1536, height: 695 },
];

const KLIKABILNO =
  'a[href], button:not([disabled]), [role="button"]:not([aria-disabled="true"]), [role="tab"], [role="menuitem"], [role="switch"], [role="checkbox"], [role="radio"], summary, select, input[type="checkbox"], input[type="radio"], label[for]';

async function sekcijaLista(browser) {
  console.log("## §10.11 — pre-delivery lista (`ui-ux-pro-max`) po glavnom ekranu\n");
  console.log("Mereno pod `prefers-reduced-motion: reduce`, na 1536×695; preliv na svih pet širina.\n");
  red(
    "ekran",
    "klikabilnih bez `cursor:pointer`",
    "hover pomera raspored",
    "fokus bez vidljivog okvira",
    "u pokretu pod reduced-motion",
    "brojevi tačni odmah",
    "emodži kao ikonica",
    "preliv px @375 / 768 / 1024 / 1440 / 1536",
  );
  red("---", "---", "---", "---", "---", "---", "---", "---");
  let lose = 0;
  const primeri = [];
  for (const e of GLAVNI) {
    // Posmatrač od prvog kadra: pod reduced-motion nijedan element ne sme da
    // dobije transformaciju, a tekst brojeva ne sme da se menja posle crtanja.
    const { context, page } = await otvori(browser, e.putanja, { width: 1536, height: 695 }, {
      init: POSMATRAC,
    });
    await page.waitForTimeout(1500);

    const m = await page.evaluate((selektor) => {
      const vidljiv = (el) => {
        const r = el.getBoundingClientRect();
        const st = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.display !== "none" && st.pointerEvents !== "none";
      };
      const opis = (el) =>
        `${el.tagName.toLowerCase()}${el.getAttribute("role") ? `[${el.getAttribute("role")}]` : ""} „${(el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 28) || el.getAttribute("aria-label") || ""}"`;
      const klikabilni = [...document.querySelectorAll(selektor)].filter(vidljiv);
      const bezPokazivaca = klikabilni.filter((el) => getComputedStyle(el).cursor !== "pointer");

      // Emodži u tekstu kontrola, naslova i natpisa (piktogrami, ne strelice i znaci).
      const emodzi = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2B55}\u{FE0F}]/u;
      const saEmodzijem = [...document.querySelectorAll("button, a, h1, h2, h3, h4, label, [role=tab], [role=menuitem], th, summary")]
        .filter(vidljiv)
        .filter((el) => emodzi.test(el.textContent ?? ""));

      // Brojevi čiji se tekst menjao posle prvog crtanja (odbrojavanje).
      const menjani = [...window.__b10.brojevi.entries()].filter(([, niz]) => new Set(niz).size > 1).length;
      const pomereni = [...window.__b10.pomereni.entries()].filter(([el, v]) => el.isConnected && v.size > 1).map(([el]) => opis(el));
      // CSS animacije koje pomeraju (transform), bez onih koje reduced-motion gasi.
      const cssPokret = document.getAnimations().filter((a) => {
        const kf = a.effect?.getKeyframes?.() ?? [];
        const traje = a.effect?.getComputedTiming?.().duration ?? 0;
        return a.playState === "running" && traje > 50 && kf.some((k) => "transform" in k || "translate" in k || "scale" in k || "rotate" in k);
      }).map((a) => opis(a.effect.target));

      return {
        klikabilnih: klikabilni.length,
        bezPokazivaca: bezPokazivaca.map(opis),
        emodzi: saEmodzijem.map(opis),
        menjani,
        pomereni: [...pomereni, ...cssPokret],
      };
    }, KLIKABILNO);

    // Hover: raspored (offset mere, bez transformacija) elementa, suseda i roditelja.
    const meta = page.locator(KLIKABILNO).filter({ visible: true });
    const ukupno = Math.min(await meta.count(), 45);
    let pomerio = 0;
    const pomerioPrimeri = [];
    const mera = (el) => {
      const b = (x) => (x ? [x.offsetLeft, x.offsetTop, x.offsetWidth, x.offsetHeight] : []);
      return JSON.stringify([b(el), b(el.previousElementSibling), b(el.nextElementSibling), b(el.parentElement), document.documentElement.scrollHeight]);
    };
    for (let i = 0; i < ukupno; i += 1) {
      const el = meta.nth(i);
      try {
        await el.scrollIntoViewIfNeeded({ timeout: 1500 });
        await page.mouse.move(0, 0);
        const pre = await el.evaluate(mera);
        await el.hover({ timeout: 1500, force: true });
        await page.waitForTimeout(220);
        const posle = await el.evaluate(mera);
        if (pre !== posle) {
          pomerio += 1;
          if (pomerioPrimeri.length < 3) pomerioPrimeri.push(await el.evaluate((x) => `${x.tagName.toLowerCase()} „${(x.textContent ?? "").trim().slice(0, 28)}"`));
        }
      } catch {
        /* element je nestao ili je prekriven — nije mera hovera */
      }
    }
    await page.mouse.move(0, 0);
    await page.evaluate(() => window.scrollTo(0, 0));

    // Fokus: Tab kroz prvih 30 stanica; svaka mora da ima vidljiv okvir ili senku.
    let bezOkvira = 0;
    const bezOkviraPrimeri = [];
    for (let i = 0; i < 30; i += 1) {
      await page.keyboard.press("Tab");
      const f = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const vidi = (x) => {
          const st = getComputedStyle(x);
          const okvir = st.outlineStyle !== "none" && parseFloat(st.outlineWidth) > 0;
          const senka = st.boxShadow !== "none";
          return okvir || senka;
        };
        // Okvir sme da nosi i omotač (`:focus-within`), kao kod polja sa ikonicom.
        const ok = vidi(el) || (el.parentElement ? vidi(el.parentElement) && el.parentElement.matches(":focus-within") : false);
        return { ok, opis: `${el.tagName.toLowerCase()} „${(el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 28) || el.getAttribute("aria-label") || ""}"` };
      });
      if (f && !f.ok) {
        bezOkvira += 1;
        if (bezOkviraPrimeri.length < 3) bezOkviraPrimeri.push(f.opis);
      }
    }

    const prelivi = [];
    for (const vp of SIRINE) {
      await page.setViewportSize(vp);
      await page.waitForTimeout(350);
      prelivi.push(await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)));
    }
    await context.close();

    const ok =
      m.bezPokazivaca.length === 0 && pomerio === 0 && bezOkvira === 0 && m.pomereni.length === 0 &&
      m.menjani === 0 && m.emodzi.length === 0 && prelivi.every((p) => p <= 1);
    if (!ok) lose += 1;
    red(
      e.ime,
      `${m.bezPokazivaca.length} od ${m.klikabilnih}`,
      `${pomerio} od ${ukupno}`,
      `${bezOkvira} od 30`,
      String(m.pomereni.length),
      m.menjani === 0 ? "da" : `**ne (${m.menjani})**`,
      String(m.emodzi.length),
      prelivi.join(" / "),
    );
    const nadjeno = [
      ...m.bezPokazivaca.slice(0, 4).map((x) => `bez pokazivača: ${x}`),
      ...pomerioPrimeri.map((x) => `hover pomera: ${x}`),
      ...bezOkviraPrimeri.map((x) => `fokus bez okvira: ${x}`),
      ...m.pomereni.slice(0, 3).map((x) => `pokret pod reduce: ${x}`),
      ...m.emodzi.slice(0, 3).map((x) => `emodži: ${x}`),
    ];
    if (nadjeno.length) primeri.push(`- **${e.ime}**: ${nadjeno.join("; ")}`);
  }
  if (primeri.length) console.log(`\nNađeno:\n${primeri.join("\n")}`);
  presuda("§10.11 pre-delivery lista", lose === 0, `ekrana sa bar jednom stavkom koja pada: ${lose} od ${GLAVNI.length}`);
}

/* -------------------------------------------------------------------------- */
/* §10.12 — šta se animira pri otvaranju                                       */
/* -------------------------------------------------------------------------- */

async function sekcijaPokret(browser) {
  console.log("## §10.12 — šta se animira pri otvaranju ekrana (pokret uključen, 1536×695)\n");
  console.log("Posmatrač radi od prvog kadra do 2,5 s posle iscrtavanja. „Pomera se\" = element kome je GSAP ili CSS menjao transformaciju; „odbrojava\" = broj čiji se tekst menjao; „sekcija\" = pomeren blok unutar `<main>` (širi od 300 px i viši od 40 px) koji nije omotač cele strane — traka napretka visine 6–8 px je merač, ne sekcija. Prijava nije radni ekran, pa se na njoj sekcija ne presuđuje.\n");
  red("ekran", "pomera se", "od toga sekcija", "odbrojava", "šta");
  red("---", "---", "---", "---", "---");
  let lose = 0;
  for (const e of GLAVNI) {
    const { context, page } = await otvori(browser, e.putanja, { width: 1536, height: 695 }, {
      reduce: false,
      init: POSMATRAC,
    });
    await page.waitForTimeout(2500);
    const m = await page.evaluate(() => {
      const main = document.querySelector("main");
      const opis = (el) => {
        const r = el.getBoundingClientRect();
        return `${el.tagName.toLowerCase()}.${String(el.className?.baseVal ?? el.className).split(" ").filter(Boolean).slice(0, 2).join(".")} ${Math.round(r.width)}×${Math.round(r.height)} „${(el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 24)}"`;
      };
      // Pomeren = transformacija je imala bar dve različite vrednosti (tvin), ne jedno `set`.
      const pomereni = [...window.__b10.pomereni.entries()]
        .filter(([el, vrednosti]) => el.isConnected && vrednosti.size > 1)
        .map(([el]) => el);
      const cssPokret = document.getAnimations()
        .filter((a) => {
          const kf = a.effect?.getKeyframes?.() ?? [];
          const t = a.effect?.getComputedTiming?.() ?? {};
          // Beskonačne petlje (skelet, tačka uživo, spiner) nisu ulazak.
          return t.iterations !== Infinity && kf.some((k) => "transform" in k || "translate" in k || "scale" in k);
        })
        .map((a) => a.effect.target)
        .filter((el) => el && !pomereni.includes(el));
      const svi = [...pomereni, ...cssPokret];
      // Omotač cele strane (PageTransition) je jedan element, ne sekcija.
      const okvirStrane = main?.firstElementChild;
      const sekcije = svi.filter((el) => {
        const r = el.getBoundingClientRect();
        return main?.contains(el) && el !== okvirStrane && r.width > 300 && r.height > 40;
      });
      const brojevi = [...window.__b10.brojevi.entries()].filter(([el, niz]) => el.isConnected && new Set(niz).size > 1).map(([el]) => el);
      return {
        pomera: svi.length,
        sekcija: sekcije.length,
        odbrojava: brojevi.length,
        sta: [
          ...svi.map((el) => (el === okvirStrane ? "okvir strane (prelaz rute)" : opis(el))),
          ...brojevi.slice(0, 3).map((el) => `broj ${opis(el)}`),
        ],
      };
    });
    await context.close();
    const radni = e.radni !== false;
    const ok = m.pomera <= 2 && (!radni || m.sekcija === 0) && m.pomera + m.odbrojava <= 2;
    if (!ok) lose += 1;
    red(e.ime, m.pomera <= 2 ? String(m.pomera) : `**${m.pomera}**`, !radni ? `${m.sekcija} (nije radni ekran)` : m.sekcija === 0 ? "0" : `**${m.sekcija}**`, m.pomera + m.odbrojava <= 2 ? String(m.odbrojava) : `**${m.odbrojava}**`, m.sta.slice(0, 5).join("; ") || "—");
  }
  presuda("§10.12 pokret pri otvaranju", lose === 0, `ekrana sa više od 2 animirana elementa ili sa animiranom sekcijom: ${lose} od ${GLAVNI.length}`);
}

/* -------------------------------------------------------------------------- */

async function main() {
  try {
    const r = await fetch(`${BASE}/login`, { redirect: "manual" });
    if (!(r.status > 0)) throw new Error("bez odgovora");
  } catch {
    console.error(`Dev server na ${BASE} ne odgovara. Pokreni: npx next dev -p ${PORT}`);
    process.exit(2);
  }
  const browser = await chromium.launch({ headless: true });
  try {
    if (SAMO.includes("rute")) await sekcijaRute(browser);
    if (SAMO.includes("primarno")) await sekcijaPrimarno(browser);
    if (SAMO.includes("traka")) await sekcijaTraka(browser);
    if (SAMO.includes("lista")) await sekcijaLista(browser);
    if (SAMO.includes("pokret")) await sekcijaPokret(browser);
  } finally {
    await browser.close();
  }
  console.log(pada === 0 ? "SVE SEKCIJE PROLAZE" : `PADA SEKCIJA: ${pada}`);
  process.exit(pada === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(String(err?.stack ?? err));
  process.exit(1);
});
