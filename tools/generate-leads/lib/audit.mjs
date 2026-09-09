/**
 * ============================================================================
 * AUDIT SAJTA — orkestracija tri izvora za jednu firmu (plan §4.1)
 * ============================================================================
 *
 *   lighthouse   → `psi.mjs` (PSI mobile + desktop, ≤ 1 req/s, 1 pokušaj)
 *   tehnologije  → `otisci.mjs` nad HTML-om početne (+ zaglavlja)
 *   snimci       → `snimci.mjs` (Playwright: desktop + mobilni + tekst)
 *
 * Sve ide u `out/<run>/sajt/<slug>/`: `psi.mobile.json`, `psi.desktop.json`,
 * `tehnologije.json`, `html.cache.html`, `pocetna.desktop.jpg`,
 * `pocetna.mobile.jpg`, `pocetna.tekst.txt`. U `firme.json` pod `sajtOcena`
 * ide SAŽETAK: brojevi, tehnologije, lokalne putanje snimaka (`send` ih
 * pretvara u ID-jeve) i `greske`. Claudeov deo (`claude`) popunjava Claude
 * posle, po rubrici iz SKILL.md.
 *
 * GREŠKE PO FIRMI NE RUŠE RUN: svaki izvor koji padne upisuje rečenicu u
 * `greske` i ostali izvori idu dalje. Jedini STOP je kad se traže snimci a
 * Playwright/Chromium ne postoji — to je uputstvo za mašinu, ne stanje sajta.
 *
 * HTML se čita jednom i kešira 1 h (`html.cache.html`) — ponovni `audit-site
 * --samo tehnologije` ne ide opet na sajt.
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { putanjaRuna } from "./izlaz.mjs";
import { pokreniPsi, RAZMAK_MS, STRATEGIJE } from "./psi.mjs";
import { imaFormuZaTermin, prepoznajTehnologije, ucitajOtiske } from "./otisci.mjs";
import { proveriPlaywright, slugDomena, snimiSajt } from "./snimci.mjs";
import { klasifikuj } from "./sajt.mjs";
import { kvalitetSajta, pojasKvaliteta, POJAS_NATPISI, prvaUKategoriji } from "./ocena.mjs";

export const PODRAZUMEVANI_DELOVI = ["lighthouse", "tehnologije", "snimci"];

const HTML_KES_MS = 60 * 60 * 1000;
const HTML_TIMEOUT_MS = 15000;
const HTML_MAX_BAJTOVA = 2 * 1024 * 1024;

// GL11 §2: „nastavi" ne ponavlja artefakt (PSI/otiske/snimak) mlađi od 24 h —
// isti poziv `audit-site` nad istim runom je idempotentan i ne ide na mrežu.
const KES_MS = 24 * 60 * 60 * 1000;
// PSI mobilni je obavezan (nosilac ocene): pad → 1 ponovni pokušaj posle 5 s.
const PSI_RETRY_MS = 5000;

const sacekaj = (ms) => new Promise((r) => setTimeout(r, ms));

/** Da li fajl postoji i mlađi je od `maxMs` (keš je „svež"). */
function svezFajl(putanja, maxMs) {
  try {
    return existsSync(putanja) && Date.now() - statSync(putanja).mtimeMs < maxMs;
  } catch {
    return false;
  }
}

/** Upiše listu tehnologija u ocenu i izvede CMS/e-commerce/booking iz nje. */
function primeniTehnologije(ocena, tehnologije) {
  ocena.tehnologije = tehnologije;
  const cms = prvaUKategoriji(tehnologije, "CMS");
  const ecom = prvaUKategoriji(tehnologije, "Ecommerce");
  const booking = prvaUKategoriji(tehnologije, "Appointment scheduling");
  if (cms) ocena.cms = cms;
  if (ecom) ocena.eCommerce = ecom;
  if (booking) ocena.booking = booking;
  return cms;
}

/**
 * HTML početne stranice + zaglavlja, sa keširanjem na disku (1 h). Jedan
 * zahtev, bez retry-ja; redirekcije prati `fetch` sam (SSRF za svaki skok je
 * već proveren u `check-site`, koji prethodi auditu — ovde se proverava samo
 * konačni host kroz `klasifikuj`-ev SSRF put? Ne: `fetch` ne izlaže skokove,
 * pa se koristi `redirect: "follow"` uz proveru da konačni URL nije privatan.
 */
async function preuzmiHtml(url, { dir, userAgent }) {
  const kesPutanja = join(dir, "html.cache.html");
  const metaPutanja = join(dir, "html.cache.json");
  if (existsSync(kesPutanja) && existsSync(metaPutanja)) {
    const starost = Date.now() - statSync(kesPutanja).mtimeMs;
    if (starost < HTML_KES_MS) {
      try {
        const meta = JSON.parse(readFileSync(metaPutanja, "utf8"));
        return { html: readFileSync(kesPutanja, "utf8"), headers: meta.headers ?? {}, finalUrl: meta.finalUrl ?? url, izKesa: true };
      } catch {
        // pokvaren keš → ponovo sa mreže
      }
    }
  }

  const kontrola = new AbortController();
  const tajmer = setTimeout(() => kontrola.abort(), HTML_TIMEOUT_MS);
  try {
    const odgovor = await fetch(url, {
      redirect: "follow",
      signal: kontrola.signal,
      headers: { "User-Agent": userAgent, Accept: "text/html,*/*;q=0.8" },
    });
    const finalUrl = odgovor.url || url;
    // Konačna adresa ne sme biti privatna (SSRF) — ista klasifikacija kao u
    // `check-site` bi to prijavila kao „nepoznato"; ovde je to greška izvora.
    const hostFinal = new URL(finalUrl).hostname.toLowerCase();
    if (hostFinal === "localhost" || /^(10\.|127\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostFinal)) {
      return { greska: "HTML: konačna adresa nije javna (SSRF)" };
    }
    if (!odgovor.ok) return { greska: `HTML: server vraća ${odgovor.status}` };
    const bafer = await odgovor.arrayBuffer();
    const html = new TextDecoder("utf-8", { fatal: false }).decode(bafer.slice(0, HTML_MAX_BAJTOVA));
    const headers = {};
    for (const [k, v] of odgovor.headers.entries()) headers[k] = v;
    mkdirSync(dir, { recursive: true });
    writeFileSync(kesPutanja, html, "utf8");
    writeFileSync(metaPutanja, JSON.stringify({ finalUrl, headers, preuzetoAt: Date.now() }, null, 2), "utf8");
    return { html, headers, finalUrl, izKesa: false };
  } catch (err) {
    const naziv = String(err?.name ?? "");
    return { greska: naziv === "AbortError" ? `HTML: timeout posle ${HTML_TIMEOUT_MS / 1000} s` : "HTML: mreža" };
  } finally {
    clearTimeout(tajmer);
  }
}

/**
 * Jedan sajt, svi traženi delovi. Vraća `{ ocena }` — `sajtOcena` oblik iz
 * plana §2.1 + lokalna polja (`snimci.desktop`/`mobile`/`tekst` kao relativne
 * putanje od `out/<run>/`), koje `send` ne prosleđuje.
 *
 * @param {string} url
 * @param {object} o
 * @param {string} o.runId
 * @param {string[]} o.delovi
 * @param {string} [o.apiKey]        PAGESPEED_API_KEY (samo za lighthouse)
 * @param {string} o.userAgent
 * @param {string} o.verzijaSkilla
 * @param {object} [o.postojeca]     prethodna `sajtOcena` (zadržava delove koji se ne rade ponovo)
 * @param {boolean} [o.nastavi]      (podrazumevano true) preskoči keš mlađi od 24 h
 * @param {boolean} [o.iznova]       ignoriši keš i oceni iz početka
 * @param {(m: string) => void} [o.log]
 */
export async function auditSajta(url, { runId, delovi, apiKey, userAgent, verzijaSkilla, postojeca, nastavi = true, iznova = false, log = () => {} }) {
  const koristiKes = nastavi && !iznova;
  const slug = slugDomena(url);
  const rel = join("sajt", slug);
  const dir = join(putanjaRuna(runId), rel);
  mkdirSync(dir, { recursive: true });

  const greske = [];
  const ocena = {
    url,
    auditedAt: Date.now(),
    verzijaSkilla,
    // Delovi koji se NE rade ponovo ostaju iz prethodne ocene (npr. `--samo
    // snimci` posle uspešnog Lighthousea).
    ...(postojeca && !delovi.includes("lighthouse") && postojeca.lighthouse ? { lighthouse: postojeca.lighthouse } : {}),
    ...(postojeca && !delovi.includes("tehnologije") && postojeca.tehnologije ? { tehnologije: postojeca.tehnologije } : {}),
    ...(postojeca && !delovi.includes("snimci") && postojeca.snimci ? { snimci: postojeca.snimci } : {}),
    ...(postojeca?.claude ? { claude: postojeca.claude } : {}),
  };

  // ── 1. Tehnologije (HTML jednom, keš 1 h; „nastavi" ne ponavlja mlađe od 24 h) ─
  if (delovi.includes("tehnologije")) {
    const tehPut = join(dir, "tehnologije.json");
    if (koristiKes && svezFajl(tehPut, KES_MS)) {
      try {
        const tehnologije = JSON.parse(readFileSync(tehPut, "utf8"));
        const cms = primeniTehnologije(ocena, tehnologije);
        // formaZaTermin i konačni URL iz keširanog HTML-a ako je tu; inače iz
        // prethodne ocene (bez ponovnog čitanja stranice).
        const kesHtml = join(dir, "html.cache.html");
        if (existsSync(kesHtml)) ocena.formaZaTermin = imaFormuZaTermin(readFileSync(kesHtml, "utf8"));
        else if (typeof postojeca?.formaZaTermin === "boolean") ocena.formaZaTermin = postojeca.formaZaTermin;
        try {
          const meta = JSON.parse(readFileSync(join(dir, "html.cache.json"), "utf8"));
          if (typeof meta.finalUrl === "string") ocena.url = meta.finalUrl;
        } catch {
          if (typeof postojeca?.url === "string") ocena.url = postojeca.url;
        }
        log(`tehnologije: ${tehnologije.length}${cms ? ` · CMS ${cms}` : ""} (iz keša)`);
      } catch {
        greske.push("tehnologije: keš pokvaren, oceni ponovo sa --iznova");
      }
    } else {
      const html = await preuzmiHtml(url, { dir, userAgent });
      if (html.greska) {
        greske.push(html.greska);
      } else {
        if (html.finalUrl) ocena.url = html.finalUrl;
        try {
          const tehnologije = prepoznajTehnologije({ html: html.html, headers: html.headers }, ucitajOtiske());
          const cms = primeniTehnologije(ocena, tehnologije);
          ocena.formaZaTermin = imaFormuZaTermin(html.html);
          writeFileSync(tehPut, `${JSON.stringify(tehnologije, null, 2)}\n`, "utf8");
          log(`tehnologije: ${tehnologije.length}${cms ? ` · CMS ${cms}` : ""}${html.izKesa ? " (HTML iz keša)" : ""}`);
        } catch (err) {
          greske.push(`tehnologije: ${String(err?.message ?? "greška").split("\n")[0]}`);
        }
      }
    }
  }

  // ── 2. Lighthouse (PSI mobile + desktop) ─────────────────────────────────
  if (delovi.includes("lighthouse")) {
    const lighthouse = {};
    let mrezaPozvana = false;
    for (const strategija of STRATEGIJE) {
      const psiPut = join(dir, `psi.${strategija}.json`);
      // Keš mlađi od 24 h: bez mreže, bez ključa.
      if (koristiKes && svezFajl(psiPut, KES_MS)) {
        try {
          const p = JSON.parse(readFileSync(psiPut, "utf8"));
          if (p && p.kategorije) {
            lighthouse[strategija] = p.kategorije;
            if (p.terenski && !lighthouse.terenski) lighthouse.terenski = p.terenski;
            log(`PSI ${strategija}: iz keša`);
            continue;
          }
        } catch {
          // pokvaren keš → poziv ide dalje
        }
      }
      if (!apiKey) {
        greske.push(`PSI ${strategija}: nema PAGESPEED_API_KEY`);
        continue;
      }
      if (mrezaPozvana) await sacekaj(RAZMAK_MS);
      mrezaPozvana = true;
      let rez = await pokreniPsi(ocena.url, { apiKey, strategija });
      // Mobilni je nosilac ocene: pad → 1 ponovni pokušaj posle 5 s (GL11 §2).
      if (!rez.ok && strategija === "mobile") {
        log(`PSI mobile pao (${rez.greska}); ponovni pokušaj za ${PSI_RETRY_MS / 1000} s`);
        await sacekaj(PSI_RETRY_MS);
        rez = await pokreniPsi(ocena.url, { apiKey, strategija });
      }
      if (!rez.ok) {
        greske.push(rez.greska);
        log(`${rez.greska}`);
        continue;
      }
      lighthouse[strategija] = rez.kategorije;
      if (rez.terenski && !lighthouse.terenski) lighthouse.terenski = rez.terenski;
      writeFileSync(
        join(dir, `psi.${strategija}.json`),
        `${JSON.stringify({ kategorije: rez.kategorije, terenski: rez.terenski ?? null, finalUrl: rez.finalUrl ?? null, verzijaLighthousea: rez.verzijaLighthousea ?? null, sada: rez.sada }, null, 2)}\n`,
        "utf8",
      );
      const k = rez.kategorije;
      log(`PSI ${strategija}: perf ${k.performance ?? "—"} · a11y ${k.accessibility ?? "—"} · bp ${k.bestPractices ?? "—"} · seo ${k.seo ?? "—"}`);
    }
    if (Object.keys(lighthouse).length > 0) ocena.lighthouse = lighthouse;
    if (!lighthouse.mobile) greske.push("PSI mobile nedostaje");
  }

  // ── 3. Snimci (Playwright; keš mlađi od 24 h se ne ponavlja) ──────────────
  if (delovi.includes("snimci")) {
    const dPut = join(dir, "pocetna.desktop.jpg");
    const mPut = join(dir, "pocetna.mobile.jpg");
    const tPut = join(dir, "pocetna.tekst.txt");
    if (koristiKes && (svezFajl(dPut, KES_MS) || svezFajl(mPut, KES_MS))) {
      const snimci = {};
      if (existsSync(dPut)) snimci.desktop = join(rel, "pocetna.desktop.jpg").replace(/\\/g, "/");
      if (existsSync(mPut)) snimci.mobile = join(rel, "pocetna.mobile.jpg").replace(/\\/g, "/");
      if (existsSync(tPut)) snimci.tekst = join(rel, "pocetna.tekst.txt").replace(/\\/g, "/");
      // Linkove i broj stranica zadržavamo iz prethodne ocene (nisu na disku).
      if (typeof postojeca?.snimci?.kontaktUrl === "string") snimci.kontaktUrl = postojeca.snimci.kontaktUrl;
      if (typeof postojeca?.snimci?.ponudaUrl === "string") snimci.ponudaUrl = postojeca.snimci.ponudaUrl;
      snimci.stranica = typeof postojeca?.snimci?.stranica === "number" ? postojeca.snimci.stranica : 1;
      ocena.snimci = snimci;
      log(`snimci: iz keša (${[snimci.desktop && "desktop", snimci.mobile && "mobilni"].filter(Boolean).join(", ")})`);
    } else {
    const pw = await proveriPlaywright();
    if (!pw.ok) {
      // STOP sa uputstvom (plan §1.3): to je stanje mašine, ne sajta.
      throw new Error(`Snimci nisu mogući: ${pw.uputstvo}\nPokreni audit-site sa --samo lighthouse,tehnologije da preskočiš snimke.`);
    }
    try {
      const rez = await snimiSajt(ocena.url, { dir, userAgent, chromium: pw.chromium });
      for (const g of rez.greske) greske.push(g);
      const pocetna = rez.stranice.find((s) => s.ime === "pocetna");
      if (pocetna) {
        const snimci = {};
        if (pocetna.desktop) snimci.desktop = join(rel, pocetna.desktop).replace(/\\/g, "/");
        if (pocetna.mobile) snimci.mobile = join(rel, pocetna.mobile).replace(/\\/g, "/");
        if (pocetna.tekst) snimci.tekst = join(rel, pocetna.tekst).replace(/\\/g, "/");
        if (rez.kontaktUrl) snimci.kontaktUrl = rez.kontaktUrl;
        if (rez.ponudaUrl) snimci.ponudaUrl = rez.ponudaUrl;
        snimci.stranica = rez.stranice.length;
        ocena.snimci = snimci;
        log(`snimci: ${rez.stranice.length} stranica (desktop ${pocetna.desktopBajtova ?? "—"} B, mobilni ${pocetna.mobileBajtova ?? "—"} B)`);
      } else {
        greske.push("snimak: početna nije snimljena");
      }
    } catch (err) {
      greske.push(`snimak: ${String(err?.message ?? "greška").split("\n")[0]}`);
    }
    }
  }

  // Claudeov sud bez snimka nije dozvoljen — ako su snimci rađeni i pali, sud
  // iz prethodne ocene se briše.
  if (delovi.includes("snimci") && !ocena.snimci?.desktop && !ocena.snimci?.mobile && ocena.claude) {
    delete ocena.claude;
    greske.push("Claudeov sud uklonjen: nema snimka");
  }

  if (greske.length > 0) ocena.greske = [...new Set(greske)];
  return { ocena, dir };
}

// ─────────────────────────────────────────────────────────────────────────────
// Izveštaj u terminalu (oceni-sajt)
// ─────────────────────────────────────────────────────────────────────────────

const PONUDA_NATPISI = {
  nov_sajt: "nov sajt",
  redizajn: "redizajn",
  webshop: "webshop",
  zakazivanje: "zakazivanje",
  seo: "SEO",
  brzina: "brzina",
  nista: "ništa",
};

function broj(x) {
  return typeof x === "number" && Number.isFinite(x) ? String(x) : "—";
}

export function ispisiIzvestajOcene(ocena, ispisi) {
  ispisi(`Ocena sajta: ${ocena.url}`);
  const k = kvalitetSajta(ocena);
  ispisi(
    k === null
      ? "Kvalitet: nije ocenjeno (nema ni Lighthousea ni Claudeovog suda)"
      : `Kvalitet: ${POJAS_NATPISI[pojasKvaliteta(k)]} ${k}/100 (računa se pri čitanju; aplikacija računa isto)`,
  );

  const lh = ocena.lighthouse;
  if (lh?.mobile || lh?.desktop) {
    for (const s of ["mobile", "desktop"]) {
      const c = lh[s];
      if (!c) continue;
      ispisi(
        `Lighthouse ${s}: performance ${broj(c.performance)} · accessibility ${broj(c.accessibility)} · best-practices ${broj(c.bestPractices)} · SEO ${broj(c.seo)}` +
          ` · LCP ${c.lcpMs !== undefined ? `${(c.lcpMs / 1000).toFixed(1)} s` : "—"} · CLS ${broj(c.cls)} · TBT ${c.tbtMs !== undefined ? `${c.tbtMs} ms` : "—"}`,
      );
    }
    if (lh.terenski) {
      ispisi(`Terenski CWV: ${lh.terenski.ocena ?? "—"} · LCP ${lh.terenski.lcpMs ?? "—"} ms · CLS ${broj(lh.terenski.cls)} · INP ${lh.terenski.inpMs ?? "—"} ms`);
    }
  } else {
    ispisi("Lighthouse: —");
  }

  if (Array.isArray(ocena.tehnologije) && ocena.tehnologije.length > 0) {
    ispisi(`Tehnologije (${ocena.tehnologije.length}): ${ocena.tehnologije.slice(0, 12).map((t) => `${t.ime}${t.verzija ? ` ${t.verzija}` : ""}`).join(", ")}${ocena.tehnologije.length > 12 ? ", …" : ""}`);
    ispisi(`  CMS: ${ocena.cms ?? "—"} · e-commerce: ${ocena.eCommerce ?? "—"} · zakazivanje: ${ocena.booking ?? "—"} · forma za termin: ${ocena.formaZaTermin === true ? "da" : ocena.formaZaTermin === false ? "ne" : "—"}`);
  } else {
    ispisi("Tehnologije: —");
  }

  if (ocena.claude) {
    const c = ocena.claude;
    ispisi(`Claudeov sud (${c.model}):`);
    for (const [kljuc, naziv] of [
      ["prviUtisak", "prvi utisak"],
      ["jasnocaPonude", "jasnoća ponude"],
      ["putDoKontakta", "put do kontakta"],
      ["mobilnaUpotrebljivost", "mobilna upotrebljivost"],
      ["azurnost", "ažurnost"],
    ]) {
      const o = c.ocene?.[kljuc];
      if (o) ispisi(`  ${naziv}: ${o.ocena}/5 — ${o.obrazlozenje}`);
    }
    if (c.klikovaDoKontakta !== undefined) ispisi(`  klikova do kontakta: ${c.klikovaDoKontakta}`);
    for (const m of c.glavneMane ?? []) ispisi(`  mana: ${m}`);
    ispisi(`  prilika: ${c.prilikaZaEnigmu}`);
    ispisi(`  preporučena ponuda: ${PONUDA_NATPISI[c.preporucenaPonuda] ?? c.preporucenaPonuda}`);
  } else {
    ispisi("Claudeov sud: još nije popunjen (rubrika u SKILL.md).");
  }

  if (ocena.snimci?.desktop || ocena.snimci?.mobile) {
    ispisi(`Snimci: ${[ocena.snimci.desktop, ocena.snimci.mobile].filter(Boolean).join(", ")}`);
  }
  if (Array.isArray(ocena.greske) && ocena.greske.length > 0) {
    for (const g of ocena.greske) ispisi(`  greška: ${g}`);
  }
}

// `klasifikuj` se ne koristi direktno; uvoz ostaje da bi se SSRF pravila iz
// `sajt.mjs` držala na jednom mestu kad se ovde bude tražio isti put.
void klasifikuj;
