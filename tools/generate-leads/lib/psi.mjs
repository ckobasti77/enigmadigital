/**
 * ============================================================================
 * PAGESPEED INSIGHTS v5 — Lighthouse sa Googleovih servera (plan §1.1)
 * ============================================================================
 *
 * Dve odvojene stvari, namerno (isti obrazac kao `sajt.mjs`):
 *
 *   `parsirajPsi(json)`          — čista funkcija, testira se nad fiksnim JSON
 *                                  odgovorom u `self-test`.
 *   `pokreniPsi(url, strategija)` — jedan zahtev, timeout 60 s, 1 pokušaj.
 *
 * Ključ: `PAGESPEED_API_KEY` (plan §1.1). Bez ključa PSI radi sa anonimnom
 * kvotom koja se troši za desetak poziva — zato je ključ obavezan i komanda
 * staje pre prvog poziva ako ga nema.
 *
 * ≤ 1 zahtev u sekundi (RAZMAK_MS) — dva zahteva po sajtu (mobile + desktop)
 * i Google ne voli rafale. Jedan pokušaj: PSI koji padne za dati sajt daje
 * grešku u `sajtOcena.greske`, ne ponovni poziv.
 */

const KRAJNJA_TACKA = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

export const TIMEOUT_MS = 60000;
export const RAZMAK_MS = 1000;

export const STRATEGIJE = ["mobile", "desktop"];

function broj(x) {
  return typeof x === "number" && Number.isFinite(x) ? x : undefined;
}

/** Lighthouse score 0–1 → 0–100 ceo broj; `undefined` kad kategorije nema. */
function kategorija(lhr, id) {
  const score = lhr?.categories?.[id]?.score;
  const b = broj(score);
  return b === undefined ? undefined : Math.round(b * 100);
}

function metrikaMs(lhr, id) {
  const v = broj(lhr?.audits?.[id]?.numericValue);
  return v === undefined ? undefined : Math.round(v);
}

function metrika(lhr, id, decimale = 3) {
  const v = broj(lhr?.audits?.[id]?.numericValue);
  return v === undefined ? undefined : Number(v.toFixed(decimale));
}

/**
 * Parsira JSON odgovor PSI v5 u oblik `sajtOcena.lighthouse.<strategija>` +
 * terenske CWV kad postoje. ČISTO: bez mreže.
 *
 * ODSUSTVO ≠ NULA: kategorija koju Lighthouse nije izračunao (npr. pad
 * pristupačnosti na timeout) se ne upisuje, umesto da postane 0.
 */
export function parsirajPsi(json) {
  const lhr = json?.lighthouseResult;
  const kategorije = {};
  const dodaj = (kljuc, v) => {
    if (v !== undefined) kategorije[kljuc] = v;
  };
  dodaj("performance", kategorija(lhr, "performance"));
  dodaj("accessibility", kategorija(lhr, "accessibility"));
  dodaj("bestPractices", kategorija(lhr, "best-practices"));
  dodaj("seo", kategorija(lhr, "seo"));
  dodaj("lcpMs", metrikaMs(lhr, "largest-contentful-paint"));
  dodaj("cls", metrika(lhr, "cumulative-layout-shift"));
  // Lighthouse laboratorijski INP ne postoji; TBT je laboratorijski zamenik.
  dodaj("inpMs", metrikaMs(lhr, "interaction-to-next-paint"));
  dodaj("tbtMs", metrikaMs(lhr, "total-blocking-time"));

  // Terenski podaci (CrUX) — `loadingExperience` postoji samo za sajtove sa
  // dovoljno saobraćaja; mala firma ih skoro nikad nema.
  let terenski;
  const le = json?.loadingExperience;
  if (le && le.metrics && Object.keys(le.metrics).length > 0) {
    terenski = {};
    const lcp = broj(le.metrics.LARGEST_CONTENTFUL_PAINT_MS?.percentile);
    const cls = broj(le.metrics.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile);
    const inp = broj(le.metrics.INTERACTION_TO_NEXT_PAINT?.percentile);
    if (lcp !== undefined) terenski.lcpMs = Math.round(lcp);
    // CrUX vraća CLS ×100 kao ceo broj.
    if (cls !== undefined) terenski.cls = Number((cls / 100).toFixed(3));
    if (inp !== undefined) terenski.inpMs = Math.round(inp);
    if (["FAST", "AVERAGE", "SLOW"].includes(le.overall_category)) {
      terenski.ocena = le.overall_category;
    }
    if (Object.keys(terenski).length === 0) terenski = undefined;
  }

  const finalUrl =
    typeof lhr?.finalDisplayedUrl === "string"
      ? lhr.finalDisplayedUrl
      : typeof lhr?.finalUrl === "string"
        ? lhr.finalUrl
        : undefined;

  return {
    kategorije: Object.keys(kategorije).length > 0 ? kategorije : undefined,
    terenski,
    finalUrl,
    verzijaLighthousea: typeof lhr?.lighthouseVersion === "string" ? lhr.lighthouseVersion : undefined,
  };
}

/**
 * Jedan PSI poziv. Vraća `{ ok: true, ...parsirajPsi }` ili `{ ok: false, greska }`.
 * Nikad ne baca zbog statusa; nikad ne loguje ključ.
 */
export async function pokreniPsi(url, { apiKey, strategija = "mobile", sada = Date.now() } = {}) {
  const params = new URLSearchParams();
  params.set("url", url);
  params.set("strategy", strategija);
  for (const k of ["performance", "accessibility", "best-practices", "seo"]) {
    params.append("category", k);
  }
  params.set("key", apiKey);

  const kontrola = new AbortController();
  const tajmer = setTimeout(() => kontrola.abort(), TIMEOUT_MS);
  try {
    let odgovor;
    try {
      odgovor = await fetch(`${KRAJNJA_TACKA}?${params.toString()}`, {
        signal: kontrola.signal,
        headers: { Accept: "application/json" },
      });
    } catch (err) {
      const naziv = String(err?.name ?? "");
      return {
        ok: false,
        greska: naziv === "AbortError" ? `PSI ${strategija}: timeout posle ${TIMEOUT_MS / 1000} s` : `PSI ${strategija}: mreža`,
        sada,
      };
    }

    if (!odgovor.ok) {
      // Telo greške ume da sadrži URL i poruku Googlea; status je dovoljan.
      return { ok: false, greska: `PSI ${strategija}: HTTP ${odgovor.status}`, sada };
    }

    let json;
    try {
      json = await odgovor.json();
    } catch {
      return { ok: false, greska: `PSI ${strategija}: odgovor nije JSON`, sada };
    }

    const parsirano = parsirajPsi(json);
    if (!parsirano.kategorije) {
      return { ok: false, greska: `PSI ${strategija}: Lighthouse bez kategorija`, sada };
    }
    return { ok: true, ...parsirano, sada };
  } finally {
    clearTimeout(tajmer);
  }
}
