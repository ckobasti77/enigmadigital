/**
 * ============================================================================
 * NOMINATIM (OpenStreetMap) — koordinate iz adrese (plan §3.6, §O4)
 * ============================================================================
 *
 * Koordinate NE dolaze iz Placesa (§O3), nego iz OSM-a, po adresi koju je
 * Claude potvrdio iz APR/CompanyWall/011info/sajta. Zato `koordinateIzvor` u
 * bazi ima tačno jednu dozvoljenu vrednost za skill: `nominatim`.
 *
 * Uslovi korišćenja Nominatima traže identifikaciju i najviše 1 zahtev u
 * sekundi. Oboje je ovde tvrdo ugrađeno; `ENIGMA_CONTACT_EMAIL` ide u
 * `User-Agent` jer je to jedini način da nas neko kontaktira umesto da nam
 * blokira IP.
 *
 * JEDAN POKUŠAJ PO ADRESI (§3.6). Bez rezultata -> firma ostaje bez koordinata
 * i na mapi se broji u „bez koordinata: N". Prazan rezultat NIJE greška i ne
 * zaustavlja run; greška mreže se broji u nedostupne izvore.
 */

const KRAJNJA_TACKA = "https://nominatim.openstreetmap.org/search";

/** Uslovi Nominatima: najviše 1 zahtev u sekundi, bez izuzetka. */
export const RAZMAK_MS = 1100;

export const ATRIBUCIJA = "© OpenStreetMap contributors";

/** User-Agent po §3.6 — verzija skilla + kontakt iz env-a, bez ičeg drugog. */
export function userAgent(kontaktEmail, verzija = "1.0.0") {
  return `EnigmaGenerateLeads/${verzija} (${kontaktEmail})`;
}

export function sacekaj(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Geokodira jednu adresu. Vraća `{lat, lng}` ili `null`.
 *
 * @throws kad mreža/servis padne — pozivalac to upisuje kao nedostupan izvor,
 *         a ne kao „firma nema koordinate" (§0 pravilo 3).
 */
export async function geokodiraj(adresa, { userAgent: ua, signal } = {}) {
  const upit = String(adresa ?? "").trim();
  if (!upit) return null;

  const url = new URL(KRAJNJA_TACKA);
  url.searchParams.set("q", upit);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "rs");
  url.searchParams.set("addressdetails", "0");

  const odgovor = await fetch(url, {
    signal,
    headers: { "User-Agent": ua, "Accept-Language": "sr,en" },
  });

  if (!odgovor.ok) {
    throw new Error(`Nominatim je vratio ${odgovor.status}`);
  }

  const podaci = await odgovor.json();
  if (!Array.isArray(podaci) || podaci.length === 0) return null;

  const lat = Number(podaci[0].lat);
  const lng = Number(podaci[0].lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return { lat, lng };
}
