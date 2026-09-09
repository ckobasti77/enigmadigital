/**
 * ============================================================================
 * SNIMCI EKRANA — Playwright Chromium (sajt-ocena-plan.md §1.3)
 * ============================================================================
 *
 * Dva snimka po stranici: desktop 1440×900 i mobilni 390×844, full-page do
 * 4000 px visine, JPEG ≤ 300 KB (kvalitet pada dok ne stane; Playwright ne
 * snima WebP — vidi napomenu uz `snimiWebp`). Uz njih tekst
 * stranice (`innerText` tela). Najviše 3 stranice po firmi: početna + prva
 * „kontakt/zakazivanje" + jedna proizvod/usluga — Claude gleda početnu, a
 * ostale su tu za pitanje „koliko klikova do kontakta".
 *
 * Playwright i Chromium se instaliraju JEDNOM na mašini
 * (`npx playwright install chromium`). Ovaj modul to PROVERAVA i vraća jasnu
 * grešku sa uputstvom — nikad ne instalira sam (SKILL.md, pravilo 6).
 *
 * SSRF: isto pravilo kao `lib/sajt.mjs` — pre otvaranja se proverava da ime
 * hosta ne vodi na privatnu adresu; zahtevi ka privatnim adresama iz same
 * stranice se blokiraju rutom.
 *
 * NIŠTA OD SADRŽAJA SE NE LOGUJE. Fajlovi idu u `out/<run>/sajt/<slug>/`.
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { privatnaAdresa } from "./sajt.mjs";

export const DESKTOP = { width: 1440, height: 900 };
export const MOBILNI = { width: 390, height: 844 };
export const MAX_VISINA_PX = 4000;
export const MAX_BAJTOVA = 300 * 1024;
export const MAX_STRANICA = 3;
const TIMEOUT_MS = 30000;

const KLJUCNE_KONTAKT = /kontakt|contact|zakaz|termin|rezerv|booking|appointment/i;
const KLJUCNE_PONUDA = /usluge|services|cenovnik|cene|price|proizvod|products|shop|prodavnica|ponuda|meni|menu|katalog/i;

/**
 * Da li je Playwright + Chromium dostupan. Vraća `{ ok: true, chromium }` ili
 * `{ ok: false, uputstvo }`. Dinamički uvoz: skill bez Playwrighta i dalje radi
 * sve osim snimaka (i ispisuje šta fali).
 */
export async function proveriPlaywright() {
  let pw;
  try {
    pw = await import("playwright");
  } catch {
    return {
      ok: false,
      uputstvo:
        "Playwright nije instaliran u repou. Iz korena repoa: npm install, pa npx playwright install chromium.",
    };
  }
  try {
    const browser = await pw.chromium.launch({ headless: true });
    await browser.close();
  } catch (err) {
    const poruka = String(err?.message ?? "");
    const nemaChromiuma = /executable doesn't exist|browserType.launch|install/i.test(poruka);
    return {
      ok: false,
      uputstvo: nemaChromiuma
        ? "Chromium za Playwright nije instaliran. Pokreni jednom: npx playwright install chromium"
        : `Chromium ne može da se pokrene: ${poruka.split("\n")[0]}`,
    };
  }
  return { ok: true, chromium: pw.chromium };
}

async function hostJeJavan(hostname) {
  const host = String(hostname ?? "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false;
  if (isIP(host)) return !privatnaAdresa(host);
  try {
    const adrese = await lookup(host, { all: true });
    return adrese.length > 0 && adrese.every((a) => !privatnaAdresa(a.address));
  } catch {
    return false;
  }
}

/** Slug za ime foldera: domen bez tačaka i www. */
export function slugDomena(url) {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return host.replace(/[^a-z0-9.-]/g, "").replace(/\./g, "-") || "sajt";
  } catch {
    return "sajt";
  }
}

async function snimiWebp(page, viewport) {
  await page.setViewportSize(viewport);
  // Kratko čekanje da se lazy slike i fontovi učitaju posle promene širine.
  await page.waitForTimeout(600);

  // Full-page do MAX_VISINA_PX: duži sajt se seče (Claude ionako gleda vrh).
  const visina = await page.evaluate(() => document.documentElement.scrollHeight);
  const clip = {
    x: 0,
    y: 0,
    width: viewport.width,
    height: Math.max(viewport.height, Math.min(visina || viewport.height, 4000)),
  };

  let kvalitet = 80;
  let bafer = null;
  for (let pokusaj = 0; pokusaj < 5; pokusaj += 1) {
    bafer = await page.screenshot({ type: "jpeg", quality: kvalitet, clip, fullPage: true }).catch(() => null);
    if (!bafer) break;
    if (bafer.length <= MAX_BAJTOVA) break;
    kvalitet = Math.max(25, kvalitet - 15);
  }
  if (!bafer) return null;
  return { bafer, kvalitet };
}

// Format: Playwright snima samo PNG ili JPEG (WebP ne ume), a full-page PNG na
// 1440 px je daleko iznad 300 KB. Zato je snimak JPEG sa kvalitetom koji pada
// dok ne stane u granicu; ruta `/generate-leads/snimak` prima i `image/jpeg`.
// Odstupanje od plana („WebP") je zapisano u izveštaju GL10.

/**
 * Snimanje jedne firme. Vraća `{ stranice, greske }` — greške po stranici ne
 * ruše ostale.
 *
 * @param {string} url
 * @param {object} opcije
 * @param {string} opcije.dir      folder za fajlove
 * @param {string} opcije.userAgent
 * @param {object} [opcije.chromium]  iz `proveriPlaywright`
 */
export async function snimiSajt(url, { dir, userAgent, chromium }) {
  const greske = [];
  const stranice = [];

  let pocetni;
  try {
    pocetni = new URL(url);
  } catch {
    return { stranice, greske: ["snimak: adresa nije ispravan URL"] };
  }
  if (!(await hostJeJavan(pocetni.hostname))) {
    return { stranice, greske: ["snimak: adresa nije javna (SSRF zaštita)"] };
  }

  mkdirSync(dir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      userAgent,
      viewport: DESKTOP,
      locale: "sr-RS",
      ignoreHTTPSErrors: true,
    });
    // Zahtevi iz stranice ka privatnim adresama se blokiraju (SSRF i za
    // resurse, ne samo za početni URL).
    await context.route("**/*", async (route) => {
      try {
        const h = new URL(route.request().url()).hostname;
        if (isIP(h) ? privatnaAdresa(h) : h === "localhost" || h.endsWith(".local")) {
          return route.abort();
        }
      } catch {
        return route.abort();
      }
      return route.continue();
    });
    context.setDefaultTimeout(TIMEOUT_MS);

    const page = await context.newPage();

    const otvori = async (adresa) => {
      const odgovor = await page.goto(adresa, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });
      await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
      return odgovor;
    };

    // 1) Početna
    let odgovor;
    try {
      odgovor = await otvori(pocetni.href);
    } catch (err) {
      return { stranice, greske: [`snimak: početna se ne učitava (${String(err?.name ?? "greška")})`] };
    }
    if (!odgovor || odgovor.status() >= 400) {
      return { stranice, greske: [`snimak: početna vraća ${odgovor ? odgovor.status() : "bez odgovora"}`] };
    }
    const finalUrl = page.url();

    // Linkovi za kontakt / ponudu — iz same stranice, samo isti host.
    const linkovi = await page
      .$$eval("a[href]", (as) => as.map((a) => ({ href: a.href, tekst: (a.textContent || "").trim().slice(0, 80) })))
      .catch(() => []);
    const istiHost = (href) => {
      try {
        return new URL(href).hostname === new URL(finalUrl).hostname;
      } catch {
        return false;
      }
    };
    const nadji = (regex) =>
      linkovi.find((l) => istiHost(l.href) && (regex.test(l.href) || regex.test(l.tekst)) && l.href !== finalUrl)?.href;
    const kontaktUrl = nadji(KLJUCNE_KONTAKT);
    const ponudaUrl = nadji(KLJUCNE_PONUDA);

    const snimiStranicu = async (ime, adresa, prvaVec = false) => {
      if (!prvaVec) {
        try {
          const o = await otvori(adresa);
          if (!o || o.status() >= 400) {
            greske.push(`snimak ${ime}: vraća ${o ? o.status() : "bez odgovora"}`);
            return;
          }
        } catch (err) {
          greske.push(`snimak ${ime}: ne učitava se (${String(err?.name ?? "greška")})`);
          return;
        }
      }
      const tekst = await page.evaluate(() => (document.body ? document.body.innerText : "")).catch(() => "");
      writeFileSync(join(dir, `${ime}.tekst.txt`), String(tekst).slice(0, 200000), "utf8");

      const d = await snimiWebp(page, DESKTOP);
      const m = await snimiWebp(page, MOBILNI);
      const zapis = { ime, url: page.url() };
      if (d) {
        writeFileSync(join(dir, `${ime}.desktop.jpg`), d.bafer);
        zapis.desktop = `${ime}.desktop.jpg`;
        zapis.desktopBajtova = d.bafer.length;
      } else greske.push(`snimak ${ime}: desktop nije uspeo`);
      if (m) {
        writeFileSync(join(dir, `${ime}.mobile.jpg`), m.bafer);
        zapis.mobile = `${ime}.mobile.jpg`;
        zapis.mobileBajtova = m.bafer.length;
      } else greske.push(`snimak ${ime}: mobilni nije uspeo`);
      zapis.tekst = `${ime}.tekst.txt`;
      stranice.push(zapis);
    };

    await snimiStranicu("pocetna", finalUrl, true);
    if (kontaktUrl && stranice.length < MAX_STRANICA) await snimiStranicu("kontakt", kontaktUrl);
    if (ponudaUrl && ponudaUrl !== kontaktUrl && stranice.length < MAX_STRANICA) {
      await snimiStranicu("ponuda", ponudaUrl);
    }

    return { stranice, greske, finalUrl, kontaktUrl: kontaktUrl ?? null, ponudaUrl: ponudaUrl ?? null };
  } finally {
    await browser.close().catch(() => {});
  }
}
