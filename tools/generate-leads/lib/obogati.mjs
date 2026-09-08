/**
 * ============================================================================
 * REŽIM „obogati" — razlika ulaz ↔ izlaz (GL8, plan §3)
 * ============================================================================
 *
 * `ucitaj` snimi tabelu dvaput: kao `firme.json` (radna kopija koju Claude
 * dopunjuje) i kao `firme.ulaz.json` (snimak stanja neposredno posle učitavanja).
 * Pre slanja se poredi: red bez ijedne NOVE ili PROMENJENE vrednosti se ne šalje
 * (nema šta da se doda postojećoj firmi), osim uz `--sve`.
 *
 * Poređenje je nad NORMALIZOVANIM projekcijama firme, bez radnih polja koja
 * `ucitaj` sam upisuje (`poreklo`, `sourceUrl`) i bez uvek-prisutnog markera
 * porekla u `izvori`. Ako se bilo koja činjenica promenila, red ulazi u slanje.
 */

/** Stabilan ključ firme: ID iz izvoza, pa placeId, pa naziv+grad. */
export function kljucFirme(firma) {
  if (firma.postojecaFirmaId) return `id:${String(firma.postojecaFirmaId).trim()}`;
  if (firma.placeId) return `place:${String(firma.placeId).trim()}`;
  const naziv = String(firma.nazivFirme ?? "").trim().toLowerCase();
  const grad = String(firma.grad ?? "").trim().toLowerCase();
  return `nazivgrad:${naziv}|${grad}`;
}

/** Rekurzivno sortiranje ključeva — stabilan JSON za poređenje. */
function stabilno(vrednost) {
  if (Array.isArray(vrednost)) return vrednost.map(stabilno);
  if (vrednost && typeof vrednost === "object") {
    const out = {};
    for (const k of Object.keys(vrednost).sort()) out[k] = stabilno(vrednost[k]);
    return out;
  }
  return vrednost;
}

/**
 * Projekcija firme za poređenje: izbacuje radna polja i marker porekla iz
 * `izvori` (`tabela:...#N`), koji je isti u ulazu i izlazu i ne znači promenu.
 */
function projekcija(firma) {
  const kopija = { ...firma };
  delete kopija.poreklo;
  delete kopija.sourceUrl;
  if (Array.isArray(kopija.izvori)) {
    const bezMarkera = kopija.izvori.filter((i) => !String(i).startsWith("tabela:"));
    if (bezMarkera.length > 0) kopija.izvori = bezMarkera;
    else delete kopija.izvori;
  }
  return JSON.stringify(stabilno(kopija));
}

/** Da li se firma promenila u odnosu na svoj snimak iz `ucitaj`. */
export function firmaPromenjena(ulaz, izlaz) {
  if (!ulaz) return true; // nova firma koje u ulazu nema = promena
  return projekcija(ulaz) !== projekcija(izlaz);
}

/**
 * Deli izlazne firme na one koje treba poslati (promenjene) i broj bez promene.
 * `ulaz` i `izlaz` su liste; poklapaju se po `kljucFirme`.
 */
export function promenjeneFirme(ulaz, izlaz) {
  const ulazPoKljucu = new Map();
  for (const f of ulaz ?? []) ulazPoKljucu.set(kljucFirme(f), f);

  const promenjeni = [];
  let bezPromene = 0;
  for (const f of izlaz ?? []) {
    if (firmaPromenjena(ulazPoKljucu.get(kljucFirme(f)), f)) promenjeni.push(f);
    else bezPromene += 1;
  }
  return { promenjeni, bezPromene };
}
