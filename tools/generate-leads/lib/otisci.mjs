/**
 * ============================================================================
 * OTISCI TEHNOLOGIJA — matcher nad HTML-om (sajt-ocena-plan.md §1.2)
 * ============================================================================
 *
 * Otisci su iz `enthec/webappanalyzer` (MIT; zajednica održava Wappalyzer
 * otiske posle zatvaranja izvora 2023). Kopija živi u `vendor/technologies/`
 * (`_.json`, `a.json` … `z.json`, `categories.json`, `LICENSE`, `VERZIJA.txt`)
 * i osvežava se komandom `run.mjs osvezi-otiske` — NIKAD u toku runa.
 *
 * Šta se poklapa: `html`, `scriptSrc`, `meta`, `headers`, `cookies`, `dom`
 * (uprošćeno: CSS selektor se svodi na klasu/atribut i traži u HTML-u kao
 * tekst) i `implies`. NE poklapa se `js` (traži izvršavanje stranice) ni
 * `scripts` (sadržaj skripti). Za male sajtove u Srbiji to je dovoljno.
 *
 * Verzija: obrazac `\;version:\1` iz Wappalyzer formata — grupa iz regexa
 * postaje verzija. `\;confidence:50` snižava pouzdanost pogotka.
 *
 * ČISTO: nema mreže. `prepoznajTehnologije({ html, headers, url })` se testira
 * u `self-test` nad lažnim HTML-ovima.
 *
 * `wappalyzer` npm paket se NE uvodi — arhiviran je i vuče Puppeteer.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OVDE = dirname(fileURLToPath(import.meta.url));
export const VENDOR_DIR = join(OVDE, "..", "vendor", "technologies");

const GITHUB_REPO = "enthec/webappanalyzer";
const RAW_OSNOVA = `https://raw.githubusercontent.com/${GITHUB_REPO}/main`;
const IMENA_FAJLOVA = ["_", ..."abcdefghijklmnopqrstuvwxyz"].map((s) => `${s}.json`);

/** Pseudo-kategorija za nalaze bez otiska (vidi `dodatniNalazi`). Ista niska
 *  kao `KATEGORIJA_ZASTARELO` u `convex/lib/siteScore.ts`. */
export const KATEGORIJA_ZASTARELO = "Zastarelo";

let kes = null;

/**
 * Učitava otiske sa diska (jednom po procesu). Vraća `{ tehnologije, kategorije }`
 * ili baca grešku sa uputstvom kad vendor folder ne postoji.
 */
export function ucitajOtiske() {
  if (kes) return kes;
  const katPutanja = join(VENDOR_DIR, "categories.json");
  if (!existsSync(katPutanja)) {
    throw new Error(
      `Nema otisaka tehnologija u ${VENDOR_DIR}. Pokreni jednom: node run.mjs osvezi-otiske`,
    );
  }
  const kategorije = JSON.parse(readFileSync(katPutanja, "utf8"));
  const tehnologije = {};
  for (const ime of readdirSync(VENDOR_DIR)) {
    if (!/^[a-z_]\.json$/.test(ime)) continue;
    Object.assign(tehnologije, JSON.parse(readFileSync(join(VENDOR_DIR, ime), "utf8")));
  }
  kes = { tehnologije, kategorije };
  return kes;
}

/**
 * Preuzima otiske sa GitHuba u `vendor/technologies/` + LICENSE + VERZIJA.txt
 * (datum i commit hash). Jedina mrežna funkcija u ovom fajlu; zove je SAMO
 * komanda `osvezi-otiske`.
 */
export async function osveziOtiske({ log = () => {} } = {}) {
  mkdirSync(VENDOR_DIR, { recursive: true });

  const commitOdgovor = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/commits/main`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "EnigmaGenerateLeads" },
  });
  if (!commitOdgovor.ok) {
    throw new Error(`GitHub API je vratio ${commitOdgovor.status} za poslednji commit.`);
  }
  const commit = await commitOdgovor.json();
  const hash = String(commit.sha ?? "").slice(0, 12) || "nepoznat";

  let preuzeto = 0;
  const preuzmi = async (putanjaURepou, cilj) => {
    const odgovor = await fetch(`${RAW_OSNOVA}/${putanjaURepou}`, {
      headers: { "User-Agent": "EnigmaGenerateLeads" },
    });
    if (!odgovor.ok) throw new Error(`${putanjaURepou}: ${odgovor.status}`);
    const tekst = await odgovor.text();
    // Provera da je JSON stvarno JSON pre nego što prepiše postojeći fajl.
    if (cilj.endsWith(".json")) JSON.parse(tekst);
    writeFileSync(join(VENDOR_DIR, cilj), tekst, "utf8");
    preuzeto += 1;
    log(`  ${cilj}`);
  };

  await preuzmi("src/categories.json", "categories.json");
  for (const ime of IMENA_FAJLOVA) await preuzmi(`src/technologies/${ime}`, ime);
  await preuzmi("LICENSE", "LICENSE");

  writeFileSync(
    join(VENDOR_DIR, "VERZIJA.txt"),
    [
      `izvor: https://github.com/${GITHUB_REPO} (src/technologies + src/categories.json)`,
      `commit: ${commit.sha ?? "nepoznat"}`,
      `preuzeto: ${new Date().toISOString()}`,
      "licenca: MIT (vidi LICENSE u ovom folderu)",
      "",
    ].join("\n"),
    "utf8",
  );
  kes = null;
  return { preuzeto, hash };
}

// ─────────────────────────────────────────────────────────────────────────────
// Parsiranje obrasca: "regex\;version:\1\;confidence:50"
// ─────────────────────────────────────────────────────────────────────────────

function parsirajObrazac(sirovo) {
  const [regexDeo, ...ostalo] = String(sirovo).split("\\;");
  const opcije = { verzija: null, pouzdanost: 100 };
  for (const deo of ostalo) {
    const [kljuc, vrednost] = deo.split(":");
    if (kljuc === "version") opcije.verzija = vrednost ?? null;
    if (kljuc === "confidence") opcije.pouzdanost = Number(vrednost) || 100;
  }
  let regex;
  try {
    regex = new RegExp(regexDeo, "i");
  } catch {
    // Neispravan regex u tuđim otiscima ne sme da obori ocenu — otisak se
    // preskače.
    regex = null;
  }
  return { regex, ...opcije };
}

/** Izvlači verziju iz poklopljene grupe po obrascu `\1`, `\1?a:b` (uprošćeno). */
function verzijaIzPogotka(obrazacVerzije, pogodak) {
  if (!obrazacVerzije || !pogodak) return undefined;
  const m = /^\\(\d+)/.exec(obrazacVerzije);
  if (!m) return undefined;
  const v = pogodak[Number(m[1])];
  if (!v) return undefined;
  const cista = String(v).trim();
  return cista.length > 0 && cista.length <= 32 ? cista : undefined;
}

function proveriObrasce(obrasci, tekst, pogoci, ime, kategorija) {
  const lista = Array.isArray(obrasci) ? obrasci : [obrasci];
  for (const sirovo of lista) {
    if (typeof sirovo !== "string") continue;
    const { regex, verzija, pouzdanost } = parsirajObrazac(sirovo);
    // Prazan obrazac ("") znači „samo postojanje" — važi za headers/meta/cookies.
    if (regex === null) continue;
    const pogodak = sirovo === "" ? [tekst] : regex.exec(tekst);
    if (!pogodak) continue;
    zabelezi(pogoci, ime, kategorija, pouzdanost, verzijaIzPogotka(verzija, pogodak));
  }
}

function zabelezi(pogoci, ime, kategorija, pouzdanost, verzija) {
  const postojeci = pogoci.get(ime);
  if (!postojeci) {
    pogoci.set(ime, { ime, kategorija, pouzdanost: Math.min(100, pouzdanost), verzija });
    return;
  }
  // Više pogodaka iste tehnologije: pouzdanost raste ka 100, verzija se uzima
  // kad je nema.
  postojeci.pouzdanost = Math.min(100, postojeci.pouzdanost + pouzdanost);
  if (!postojeci.verzija && verzija) postojeci.verzija = verzija;
}

/** Vrlo uprošćen DOM selektor → tekstualna provera u HTML-u. */
function domSelektorUHtml(selektor, html) {
  // "div[class*='wp-block-group'] > div[class*='wp-block-']" — uzimaju se svi
  // `[attr*='x']`/`[attr='x']` delovi i `.klasa` i traže u HTML-u kao tekst.
  // Zarez razdvaja alternative (".a, .b"): dovoljna je jedna.
  // Kratki delovi („mage", „wp-") pogađaju svaki sajt kao tekst — DOM
  // selektor bez ijednog dela od ≥ 6 znakova se ne uzima u obzir.
  const mali = html.toLowerCase();
  for (const alternativa of String(selektor).split(",")) {
    const delovi = [];
    for (const m of alternativa.matchAll(/\[(?:[\w-]+)(?:\*=|\^=|\$=|=)['"]?([^'"\]]+)['"]?\]/g)) {
      delovi.push(m[1]);
    }
    for (const m of alternativa.matchAll(/\.([\w-]{4,})/g)) delovi.push(m[1]);
    if (delovi.length === 0) continue;
    if (!delovi.some((d) => String(d).length >= 6)) continue;
    if (delovi.every((d) => mali.includes(String(d).toLowerCase()))) return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Izvlačenje ulaza iz HTML-a
// ─────────────────────────────────────────────────────────────────────────────

/** Meta oznake po imenu → LISTA vrednosti: WordPress + WooCommerce daju dva
 *  `generator` taga i oba se proveravaju. */
export function izvuciMeta(html) {
  const meta = {};
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const ime = /\b(?:name|property)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    const sadrzaj = /\bcontent\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    if (!ime || sadrzaj === undefined) continue;
    const kljuc = ime.toLowerCase();
    (meta[kljuc] ??= []).push(sadrzaj);
  }
  return meta;
}

export function izvuciScriptSrc(html) {
  const lista = [];
  for (const m of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) lista.push(m[1]);
  return lista;
}

function normalizujZaglavlja(headers) {
  const out = {};
  if (!headers) return out;
  const unos = typeof headers.entries === "function" ? [...headers.entries()] : Object.entries(headers);
  for (const [k, v] of unos) out[String(k).toLowerCase()] = Array.isArray(v) ? v.join(", ") : String(v);
  return out;
}

function kolaciciIzZaglavlja(headers) {
  const out = {};
  const sirovo = headers["set-cookie"];
  if (!sirovo) return out;
  for (const deo of String(sirovo).split(/,(?=[^;]+=)/)) {
    const [par] = deo.split(";");
    const [ime, ...vrednost] = par.split("=");
    if (ime) out[ime.trim().toLowerCase()] = vrednost.join("=").trim();
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dodatni nalazi bez otiska (plan §2.3 „zastarela tehnologija")
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pseudo-tehnologije koje aplikacija čita kao „zastarelo" (`siteScore.ts`):
 *  - „Bez viewport meta" — nema `<meta name="viewport">` → nije responsive;
 *  - „Tabelarni raspored" — ≥ 3 ugnežđene tabele i nijedan CSS okvir;
 *  - „Adobe Flash" — `application/x-shockwave-flash` ili `.swf`.
 * Svaka nosi pouzdanost < 100 jer je heuristika, ne otisak.
 */
export function dodatniNalazi(html, pogoci) {
  const mali = html.toLowerCase();
  const imaViewport = /<meta[^>]+name\s*=\s*["']viewport["']/i.test(html);
  // Samo za stranice koje uopšte imaju `<head>` — fragment bez glave nije dokaz.
  if (!imaViewport && /<head\b/i.test(html)) {
    zabelezi(pogoci, "Bez viewport meta", KATEGORIJA_ZASTARELO, 80, undefined);
  }
  const brojTabela = (mali.match(/<table\b/g) ?? []).length;
  const ugnezdene = /<table\b[^>]*>[\s\S]*?<table\b[^>]*>[\s\S]*?<table\b/i.test(html);
  const imaCssOkvir = /bootstrap|tailwind|foundation|bulma|elementor|wp-block/i.test(html);
  if (brojTabela >= 3 && ugnezdene && !imaCssOkvir && !imaViewport) {
    zabelezi(pogoci, "Tabelarni raspored", KATEGORIJA_ZASTARELO, 60, undefined);
  }
  if (/application\/x-shockwave-flash|\.swf["'\s>]/i.test(html)) {
    zabelezi(pogoci, "Adobe Flash", KATEGORIJA_ZASTARELO, 90, undefined);
  }
}

/**
 * Da li HTML nosi formu koja liči na zakazivanje termina (plan §2.3
 * `sajt_bez_zakazivanja`): `<form>` + reč o terminu/zakazivanju/rezervaciji u
 * blizini. Heuristika; `undefined` kad nema nijedne forme (nije gledano).
 */
export function imaFormuZaTermin(html) {
  if (!/<form\b/i.test(html)) return false;
  return /termin|zakaz|zakaži|zakazi|rezerv|booking|appointment|book now/i.test(html);
}

// ─────────────────────────────────────────────────────────────────────────────
// Glavna funkcija
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} ulaz
 * @param {string} ulaz.html
 * @param {Record<string,string>|Headers} [ulaz.headers]
 * @param {object} [otisci]  rezultat `ucitajOtiske()`; podrazumevano sa diska
 * @returns {Array<{ime: string, kategorija: string, verzija?: string, pouzdanost: number}>}
 */
export function prepoznajTehnologije({ html, headers }, otisci = ucitajOtiske()) {
  const { tehnologije, kategorije } = otisci;
  const tekst = String(html ?? "");
  const meta = izvuciMeta(tekst);
  const skripte = izvuciScriptSrc(tekst);
  const zaglavlja = normalizujZaglavlja(headers);
  const kolacici = kolaciciIzZaglavlja(zaglavlja);
  const pogoci = new Map();

  const nazivKategorije = (t) => {
    const id = Array.isArray(t.cats) ? t.cats[0] : undefined;
    return kategorije[String(id)]?.name ?? "Ostalo";
  };

  for (const [ime, t] of Object.entries(tehnologije)) {
    const kategorija = nazivKategorije(t);

    if (t.html) proveriObrasce(t.html, tekst, pogoci, ime, kategorija);
    if (t.scriptSrc) {
      for (const src of skripte) proveriObrasce(t.scriptSrc, src, pogoci, ime, kategorija);
    }
    if (t.meta) {
      for (const [kljuc, obrazac] of Object.entries(t.meta)) {
        const vrednosti = meta[kljuc.toLowerCase()];
        if (!vrednosti) continue;
        for (const vrednost of vrednosti) proveriObrasce(obrazac, vrednost, pogoci, ime, kategorija);
      }
    }
    if (t.headers) {
      for (const [kljuc, obrazac] of Object.entries(t.headers)) {
        const vrednost = zaglavlja[kljuc.toLowerCase()];
        if (vrednost === undefined) continue;
        proveriObrasce(obrazac, vrednost, pogoci, ime, kategorija);
      }
    }
    if (t.cookies) {
      for (const [kljuc, obrazac] of Object.entries(t.cookies)) {
        const vrednost = kolacici[kljuc.toLowerCase()];
        if (vrednost === undefined) continue;
        proveriObrasce(obrazac, vrednost, pogoci, ime, kategorija);
      }
    }
    if (t.dom) {
      const selektori = Array.isArray(t.dom) ? t.dom : typeof t.dom === "string" ? [t.dom] : Object.keys(t.dom);
      for (const sel of selektori) {
        if (typeof sel !== "string") continue;
        if (domSelektorUHtml(sel, tekst)) {
          zabelezi(pogoci, ime, kategorija, 50, undefined);
          break;
        }
      }
    }
  }

  // `implies`: WordPress → PHP, MySQL. Dodaje se sa nižom pouzdanošću i bez
  // verzije, u jednom prolazu (tranzitivno se ne juri — dovoljno je).
  for (const [ime] of [...pogoci]) {
    const t = tehnologije[ime];
    if (!t?.implies) continue;
    const lista = Array.isArray(t.implies) ? t.implies : [t.implies];
    for (const sirovo of lista) {
      const { pouzdanost } = parsirajObrazac(sirovo);
      const impliedIme = String(sirovo).split("\\;")[0];
      const imp = tehnologije[impliedIme];
      if (!imp || pogoci.has(impliedIme)) continue;
      zabelezi(pogoci, impliedIme, nazivKategorije(imp), Math.min(pouzdanost, 50), undefined);
    }
  }

  dodatniNalazi(tekst, pogoci);

  return [...pogoci.values()]
    .map((p) => ({
      ime: p.ime,
      kategorija: p.kategorija,
      ...(p.verzija ? { verzija: p.verzija } : {}),
      pouzdanost: Math.round(p.pouzdanost),
    }))
    .sort((a, b) => b.pouzdanost - a.pouzdanost || a.ime.localeCompare(b.ime));
}
