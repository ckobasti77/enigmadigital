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

/**
 * Firme kojima fali `imaSajt` (GL9 §4). „Nema sajt" je glavni prodajni signal
 * Enigme, pa `send` odbija slanje ako iko nema proveren `imaSajt` — osim uz
 * `--dozvoli-bez-sajta`. Vraća 1-indeksirane pozicije u prosleđenoj listi
 * (bez naziva i bez ijednog ličnog podatka — §0 pravilo 6).
 */
export function firmeBezImaSajt(firme) {
  const bez = [];
  (firme ?? []).forEach((f, i) => {
    if (f?.imaSajt === undefined) bez.push(i + 1);
  });
  return bez;
}

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
 * Grupe polja za `obogati --polja` (GL9 §4): kad je run ograničen na podskup,
 * poređenje ulaz↔izlaz gleda SAMO ta polja. Firma kojoj je Claude promenio samo
 * npr. `imaSajt` ulazi u slanje; sve ostalo se ne poredi i ne šalje.
 */
const POLJA_GRUPE = {
  sajt: ["sajt", "imaSajt", "imaSajtNapomena", "sajtStatus", "sajtHttps", "sajtProverenAt", "sajtNapomena"],
  osobe: ["osobe"],
  platforme: ["platforme"],
  koordinate: ["koordinate"],
};

/**
 * Projekcija firme za poređenje: izbacuje radna polja i marker porekla iz
 * `izvori` (`tabela:...#N`), koji je isti u ulazu i izlazu i ne znači promenu.
 * Kad je `polja` zadato, poredi se SAMO tih nekoliko polja (GL9 §4).
 */
function projekcija(firma, polja) {
  if (Array.isArray(polja) && polja.length > 0) {
    const kljucevi = new Set(polja.flatMap((p) => POLJA_GRUPE[p] ?? []));
    const kopija = {};
    for (const k of kljucevi) if (firma[k] !== undefined) kopija[k] = firma[k];
    return JSON.stringify(stabilno(kopija));
  }
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
export function firmaPromenjena(ulaz, izlaz, polja) {
  if (!ulaz) return true; // nova firma koje u ulazu nema = promena
  return projekcija(ulaz, polja) !== projekcija(izlaz, polja);
}

/**
 * Deli izlazne firme na one koje treba poslati (promenjene) i broj bez promene.
 * `ulaz` i `izlaz` su liste; poklapaju se po `kljucFirme`. `polja` ograničava
 * poređenje na podskup (GL9 §4).
 */
export function promenjeneFirme(ulaz, izlaz, polja) {
  const ulazPoKljucu = new Map();
  for (const f of ulaz ?? []) ulazPoKljucu.set(kljucFirme(f), f);

  const promenjeni = [];
  let bezPromene = 0;
  for (const f of izlaz ?? []) {
    if (firmaPromenjena(ulazPoKljucu.get(kljucFirme(f)), f, polja)) promenjeni.push(f);
    else bezPromene += 1;
  }
  return { promenjeni, bezPromene };
}
