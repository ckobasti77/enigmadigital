// S28: osnovna pristupačnost radnog dela i spojene ljuske (razvojni prikaz, `next dev -p 3117`).
//  1) axe-core (WCAG 2.0/2.1 A i AA) na svakom ekranu;
//  2) prolaz tastaturom: Tab do 160 puta od vrha strane. Za svaki zaustavni element:
//     ima li ime (aria-label, tekst, title), je li vidljiv i da li se fokus VIDI
//     (stil u fokusu se razlikuje od stila bez fokusa: obris, senka/prsten, ivica, podloga, boja);
//  3) tastaturne radnje: otvori meni/dijalog tasterom, fokus ide unutra, Tab ostaje
//     unutra (modalni), Esc zatvara i vraća fokus na okidač.
// Upotreba: node .nocni-run/spajanje/alati/s28-pristupacnost.mjs [--samo a,b] [--bez-axe] [--bez-taba] [--bez-radnji] [--vp 390]
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const AXE = require.resolve("axe-core/axe.min.js");
const BASE = "http://localhost:3117";
const S = "enigma-it";
const OUT = ".nocni-run/spajanje/tmp/s28/pristupacnost";
mkdirSync(OUT, { recursive: true });

const argv = process.argv.slice(2);
const arg = (ime) => (argv.includes(ime) ? argv[argv.indexOf(ime) + 1] : null);
const SAMO = arg("--samo")?.split(",") ?? null;
const MALI = arg("--vp") === "390";

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
  ["stranica", `/${S}/stranica/pagesux0101`],
  ["oblast-mapa", `/${S}/dokumenti/areasux0001?tab=mapa`],
  ["stranica-mapa", `/${S}/stranica/pagesux0102?tab=mapa`],
  ["zadatak", `/${S}/stranica/pagesux0201`],
  ["korpa", `/${S}/korpa`],
  ["puls", `/${S}/puls`],
  ["aktivnost", `/${S}/aktivnost`],
  ["beleske", `/${S}/beleske`],
  ["settings", `/${S}/settings`],
  ["E-leadovi", `/${S}/leadovi`],
];

const adresa = (put) => `${BASE}${put}${put.includes("?") ? "&" : "?"}ux=1`;

async function otvori(page, put) {
  await page.goto(adresa(put), { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForSelector("main#sadrzaj", { timeout: 60_000 }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(700);
}

async function axe(page, sloj = null) {
  if (!(await page.evaluate(() => Boolean(window.axe)))) await page.addScriptTag({ path: AXE });
  return page.evaluate(async (sel) => {
    const ctx = sel ? ([...document.querySelectorAll(sel)].filter((x) => x.getBoundingClientRect().width > 0).at(-1) ?? document) : document;
    const r = await window.axe.run(ctx, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
      resultTypes: ["violations"],
    });
    return r.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      opis: v.help,
      cvorova: v.nodes.length,
      primeri: v.nodes.slice(0, 4).map((n) => ({ cilj: n.target.join(" "), html: n.html.slice(0, 160), poruka: n.failureSummary?.split("\n").slice(0, 3).join(" | ") })),
    }));
  }, sloj);
}

/** Stil koji nosi vidljiv fokus; poredi se u fokusu i bez njega. */
function stilFokusa(el) {
  const s = getComputedStyle(el);
  return {
    outline: s.outlineStyle === "none" || parseFloat(s.outlineWidth) === 0 ? "none" : `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`,
    shadow: s.boxShadow,
    border: s.borderColor,
    bg: s.backgroundColor,
    color: s.color,
    deco: s.textDecorationLine,
    // SVG grupa (ivica mape): fokus se crta na putanji unutar nje.
    stroke: el.tagName.toLowerCase() === "g" && el.querySelector("path") ? getComputedStyle(el.querySelector("path")).stroke : "",
  };
}

async function tab(page) {
  // Prelazi isključeni dok se meri (inače se čita stil na početku prelaza), a
  // Tab kreće od vrha dokumenta: strana se ponovo učitava, bez klika (klik
  // pomera početnu tačku sekvencijalnog fokusa).
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("main#sadrzaj", { timeout: 60_000 }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(700);
  await page.addStyleTag({ content: "*,*::before,*::after{transition:none!important;animation:none!important}" });
  await page.evaluate(() => {
    window.__s28 = [];
  });
  const koraci = [];
  const videno = new Set();
  let preskoceno = 0;
  for (let i = 0; i < 160; i++) {
    await page.keyboard.press("Tab");
    const r = await page.evaluate((stilSrc) => {
      // eslint-disable-next-line no-new-func
      const stil = new Function(`return (${stilSrc})`)();
      const el = document.activeElement;
      // Next dev overlay (samo razvojni server) nije deo aplikacije.
      if (!el || el === document.body || el.tagName === "NEXTJS-PORTAL") return { preskoci: true };
      const id = (window.__s28.indexOf(el) + 1 || window.__s28.push(el)) - 1;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      // SVG ivica (vodoravna ili uspravna linija) ima jednu dimenziju 0.
      const svg = el instanceof SVGElement;
      const vidljiv = (svg ? r.width > 0 || r.height > 0 : r.width > 0 && r.height > 0) && s.visibility !== "hidden" && Number(s.opacity) > 0;
      const ime = (el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") && document.getElementById(el.getAttribute("aria-labelledby"))?.textContent || el.textContent || el.getAttribute("title") || el.getAttribute("placeholder") || el.getAttribute("alt") || "").trim().replace(/\s+/g, " ");
      const cls = typeof el.className === "string" ? el.className : el.getAttribute("class") ?? "";
      return {
        id,
        opis: `${el.tagName.toLowerCase()}${el.getAttribute("role") ? `[role=${el.getAttribute("role")}]` : ""}${el.dataset.slot ? `[${el.dataset.slot}]` : ""} "${ime.slice(0, 40)}"`,
        klasa: cls.slice(0, 140),
        imaIme: ime.length > 0,
        vidljiv,
        fv: el.matches(":focus-visible"),
        uFokusu: stil(el),
        dijalog: Boolean(el.closest('[role="dialog"],[role="alertdialog"],[role="menu"]')),
      };
    }, stilFokusa.toString());
    if (r.preskoci) {
      if (++preskoceno > 3) break; // fokus je izašao iz strane (adresna traka, overlay)
      continue;
    }
    if (videno.has(r.id)) break; // krug je zatvoren
    videno.add(r.id);
    koraci.push(r);
  }
  // Isti elementi bez fokusa.
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.mouse.move(1, 1);
  const bez = await page.evaluate((stilSrc) => {
    const stil = new Function(`return (${stilSrc})`)();
    return window.__s28.map((el) => (el.isConnected ? stil(el) : null));
  }, stilFokusa.toString());
  const nalazi = [];
  for (const k of koraci) {
    const b = bez[k.id];
    if (!k.imaIme) nalazi.push({ vrsta: "bez imena", el: k.opis, klasa: k.klasa });
    if (!k.vidljiv) nalazi.push({ vrsta: "fokus na nevidljivom", el: k.opis, klasa: k.klasa });
    if (b && k.vidljiv) {
      const razlika = Object.keys(k.uFokusu).some((x) => k.uFokusu[x] !== b[x]);
      if (!razlika) nalazi.push({ vrsta: "fokus se ne vidi", el: k.opis, klasa: k.klasa });
    }
  }
  return { zaustavljanja: koraci.length, nalazi, redosled: koraci.map((k) => k.opis) };
}

// Tastaturne radnje: [ime, ruta, kako se dolazi do okidača (fokus), tasteri, očekivani sloj, modalni?]
const RADNJE = [
  ["brzi-unos (q)", "/moji-zadaci", null, ["q"], '[role="dialog"]', true],
  ["paleta (Ctrl+K)", `/${S}`, null, ["Control+k"], '[role="dialog"]', true],
  ["pomoć (?)", "/moji-zadaci", null, ["Shift+Slash"], '[role="dialog"]', true],
  ["zvono", `/${S}/leadovi`, (p) => p.getByRole("button", { name: /^Čeka te/ }).first(), ["Enter"], '[data-slot="popover-content"]', false],
  ["zvono (Ja)", "/moji-zadaci", (p) => p.getByRole("button", { name: /^Čeka te/ }).first(), ["Enter"], '[data-slot="popover-content"]', false],
  ["meni korisnika (traka)", `/${S}`, (p) => p.locator('[data-slot="dropdown-menu-trigger"]').filter({ has: p.locator('[data-slot="avatar"]') }).first(), ["Enter"], '[role="menu"]', false],
  ["meni „Ja“: novi projekat", "/moji-zadaci", (p) => p.getByRole("link", { name: /Novi projekat/ }).first(), [], null, false],
  ["zadaci: panel zadatka", `/${S}/zadaci`, (p) => p.getByRole("button", { name: /Popravi prijavu na staging/ }).first(), ["Enter"], '[role="dialog"]', true],
  ["zadaci: meni reda", `/${S}/zadaci`, (p) => p.getByRole("button", { name: /Radnje|Još|…/ }).first(), ["Enter"], '[role="menu"]', false],
  ["oblast: nova stranica", `/${S}/dokumenti/areasux0001`, (p) => p.getByRole("button", { name: /^Nova stranica/ }).first(), ["Enter"], '[role="dialog"]', true],
  ["ideje: nova ideja", `/${S}/ideje`, (p) => p.getByRole("button", { name: /^Nova ideja/ }).first(), ["Enter"], '[role="dialog"]', true],
  ["poruke: nova", "/poruke", (p) => p.getByRole("button", { name: /^Novo|Nova poruka|Novi razgovor/ }).first(), ["Enter"], '[role="dialog"]', true],
  ["danas: isplaniraj", "/", (p) => p.getByRole("button", { name: /Isplaniraj dan/ }).first(), ["Enter"], '[role="dialog"]', true],
  ["traka projekata (strelice)", "/moji-zadaci", (p) => p.locator('a[tabindex="0"][data-slot="tooltip-trigger"]').first(), ["ArrowDown"], null, false],
];

async function radnja(page, [ime, put, okidac, tasteri, sloj, modalni]) {
  await otvori(page, put);
  const rez = { ime, nalazi: [] };
  let trig = null;
  if (okidac) {
    const loc = okidac(page);
    if ((await loc.count()) === 0) return { ...rez, nalazi: ["okidač nije nađen"] };
    await loc.scrollIntoViewIfNeeded();
    await loc.focus();
    trig = await loc.evaluate((el) => {
      window.__okidac = el;
      return `${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30)}"`;
    });
    rez.okidac = trig;
  } else {
    await page.evaluate(() => {
      document.activeElement?.blur?.();
      window.__okidac = null;
    });
  }
  if (!sloj) {
    // Dostupnost (navigacija se ne izvršava); sa tasterima: strelica pomera fokus na drugu stavku.
    const ok = await page.evaluate(() => {
      const el = document.activeElement;
      return el && el !== document.body && el.tabIndex >= 0;
    });
    if (!ok) rez.nalazi.push("okidač ne prima fokus");
    for (const t of tasteri) await page.keyboard.press(t);
    if (tasteri.length) {
      const pomeren = await page.evaluate(() => document.activeElement !== window.__okidac && document.activeElement !== document.body);
      if (!pomeren) rez.nalazi.push("strelica ne pomera fokus");
      else rez.okidac += ` → ${await page.evaluate(() => (document.activeElement.getAttribute("aria-label") || document.activeElement.textContent || "").trim().slice(0, 30))}`;
    }
    return rez;
  }
  for (const t of tasteri) await page.keyboard.press(t);
  await page.waitForTimeout(500);
  const stanje = await page.evaluate((sel) => {
    const vidljiv = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden";
    };
    const slojevi = [...document.querySelectorAll(sel)].filter(vidljiv);
    const s = slojevi.at(-1);
    return {
      otvoren: Boolean(s),
      fokusUnutra: Boolean(s && s.contains(document.activeElement)),
      ime: s ? s.getAttribute("aria-label") || (s.getAttribute("aria-labelledby") && document.getElementById(s.getAttribute("aria-labelledby"))?.textContent) || "" : "",
    };
  }, sloj);
  rez.otvoren = stanje.otvoren;
  if (!stanje.otvoren) {
    rez.nalazi.push("sloj se ne otvara tastaturom");
    return rez;
  }
  if (!stanje.fokusUnutra) rez.nalazi.push("fokus nije ušao u sloj");
  rez.axe = await axe(page, sloj);
  for (const v of rez.axe) rez.nalazi.push(`axe u sloju: ${v.id} (${v.impact}, ${v.cvorova})`);
  if (!stanje.ime.trim() && (sloj.includes("dialog") || sloj.includes("popover"))) rez.nalazi.push("dijalog bez imena (aria-label/labelledby)");
  if (modalni) {
    let izasao = false;
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press("Tab");
      await page.waitForTimeout(150);
      const unutra = await page.evaluate((sel) => {
        const sl = [...document.querySelectorAll(sel)].filter((x) => x.getBoundingClientRect().width > 0).at(-1);
        const a = document.activeElement;
        return {
          ok: Boolean(sl && sl.contains(a)),
          gde: `${a?.tagName.toLowerCase()}[${[...(a?.attributes ?? [])].map((x) => x.name).filter((n) => n.startsWith("data-") || n === "role").join(",")}] "${(a?.getAttribute("aria-label") || a?.textContent || "").trim().slice(0, 30)}"`,
          sloj: sl ? `${sl.tagName.toLowerCase()}[${sl.getAttribute("data-slot") ?? sl.getAttribute("role")}]` : null,
        };
      }, sloj);
      if (!unutra.ok) {
        izasao = `${unutra.gde} (sloj ${unutra.sloj})`;
        break;
      }
    }
    if (izasao) rez.nalazi.push(`Tab izlazi iz modalnog sloja: ${izasao}`);
  } else if (sloj.includes("menu")) {
    await page.keyboard.press("ArrowDown");
    const naStavci = await page.evaluate(() => document.activeElement?.getAttribute("role")?.startsWith("menuitem") ?? false);
    if (!naStavci) rez.nalazi.push("strelica ne vodi na stavku menija");
  }
  await page.keyboard.press("Escape");
  await page.waitForTimeout(450);
  const posle = await page.evaluate((sel) => {
    const vidljiv = (el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
    };
    return {
      zatvoren: ![...document.querySelectorAll(sel)].some(vidljiv),
      vracen: window.__okidac ? document.activeElement === window.__okidac : true,
      fokus: `${document.activeElement?.tagName.toLowerCase()} "${(document.activeElement?.getAttribute("aria-label") || document.activeElement?.textContent || "").trim().slice(0, 30)}"`,
    };
  }, sloj);
  if (!posle.zatvoren) rez.nalazi.push("Esc ne zatvara");
  else if (!posle.vracen) rez.nalazi.push(`fokus se ne vraća na okidač (sada: ${posle.fokus})`);
  return rez;
}

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: MALI ? { width: 390, height: 844 } : { width: 1536, height: 695 },
  ...(MALI ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}),
});
const page = await ctx.newPage();
const konzola = [];
page.on("console", (m) => {
  if (m.type() === "error") konzola.push(`${page.url()}: ${m.text().slice(0, 200)}`);
});

const izvestaj = { vp: MALI ? 390 : 1536, ekrani: {}, radnje: [] };
for (const [ime, put] of EKRANI) {
  if (SAMO && !SAMO.includes(ime)) continue;
  await otvori(page, put);
  const e = {};
  if (!argv.includes("--bez-axe")) e.axe = await axe(page);
  if (!argv.includes("--bez-taba") && !MALI) e.tab = await tab(page);
  izvestaj.ekrani[ime] = e;
  const ax = e.axe ? e.axe.map((v) => `${v.id}(${v.impact},${v.cvorova})`).join(" ") || "—" : "";
  const tb = e.tab ? `tab ${e.tab.zaustavljanja}, nalaza ${e.tab.nalazi.length}` : "";
  console.log(`${ime.padEnd(14)} axe: ${ax}  ${tb}`);
}
if (!argv.includes("--bez-radnji") && !MALI) {
  for (const r of RADNJE) {
    if (SAMO && !SAMO.includes(r[0]) && !SAMO.includes("radnje") && !SAMO.some((x) => r[0].startsWith(x))) continue;
    const rez = await radnja(page, r).catch((e) => ({ ime: r[0], nalazi: [`greška alata: ${e.message.slice(0, 120)}`] }));
    izvestaj.radnje.push(rez);
    console.log(`radnja ${rez.ime.padEnd(28)} ${rez.nalazi.length ? rez.nalazi.join("; ") : "ok"}${rez.okidac ? `  [${rez.okidac}]` : ""}`);
  }
}
izvestaj.konzola = konzola;
writeFileSync(`${OUT}/izvestaj-${MALI ? 390 : 1536}${SAMO ? "-deo" : ""}.json`, JSON.stringify(izvestaj, null, 2));
console.log(`konzola (greške): ${konzola.length}`);
await browser.close();
