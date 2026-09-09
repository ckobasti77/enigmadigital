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

/**
 * Firme koje IMAJU sajt koji radi, a nemaju ocenu sajta (GL11 §1). Kad je
 * filter `ima`/`svejedno` (ili `--polja sajtOcena`), audit-site je obavezan; ovo
 * je čuvar u `send`-u koji staje ako je audit preskočen ili prekinut usred posla
 * (uzrok GL10 rupe: `sajtOcena` prazna kod svih 50 iako je audit delom urađen na
 * disku). Vraća 1-indeksirane pozicije (bez ijednog ličnog podatka — §0 pr. 6).
 */
export function firmeSaSajtomBezOcene(firme) {
  const bez = [];
  (firme ?? []).forEach((f, i) => {
    if (f?.imaSajt === "da" && f?.sajtStatus === "radi" && !f?.sajtOcena) bez.push(i + 1);
  });
  return bez;
}

/**
 * Ocene bez Claudeovog suda (GL11 §1). Treći izvor ocene (sud nad snimcima) je
 * obavezan; `send` staje ako ijedna `sajtOcena` nema `claude`. Vraća
 * 1-indeksirane pozicije.
 */
export function oceneBezSuda(firme) {
  const bez = [];
  (firme ?? []).forEach((f, i) => {
    if (f?.sajtOcena && !f.sajtOcena.claude) bez.push(i + 1);
  });
  return bez;
}

/**
 * Ocene čiji Lighthouse nema mobilni izveštaj (GL11 §1). Mobilni je nosilac
 * ocene (0,25 težine) i signala `sajt_spor`, pa njegovo odsustvo NE blokira
 * slanje, ali se upisuje u `sajtOcena.greske` i ulazi u rezime `send`-a. Vraća
 * 1-indeksirane pozicije.
 */
export function oceneBezMobilnog(firme) {
  const bez = [];
  (firme ?? []).forEach((f, i) => {
    const lh = f?.sajtOcena?.lighthouse;
    if (lh && !lh.mobile) bez.push(i + 1);
  });
  return bez;
}

/**
 * Ocene koje imaju Claudeov sud, a NEMAJU nijedan ID snimka (GL12 §2). Ovo se
 * proverava TEK posle uploada snimaka (kad ID-jevi postoje ili ne postoje): red
 * sa `claude` bez `snimci.desktopId`/`.mobilniId` bi oborio ingest šemu (refine
 * „sud bez snimka") — pa `send` staje, umesto da tiho izbaci sud da bi prošlo.
 * Vraća 1-indeksirane pozicije (bez ijednog ličnog podatka — §0 pravilo 6).
 */
export function oceneBezSnimka(redovi) {
  const bez = [];
  (redovi ?? []).forEach((red, i) => {
    const o = red?.sajtOcena;
    if (o && o.claude && !(o.snimci?.desktopId || o.snimci?.mobilniId)) bez.push(i + 1);
  });
  return bez;
}

/**
 * Rezime ocene u telu PRE slanja (GL12 §2): koliko redova nosi ocenu, koliko
 * ima Claudeov sud, koliko slika (desktop + mobilni, bilo kao lokalna putanja
 * bilo kao već upisan ID). Cilj je da se gubitak suda/snimaka vidi PRE slanja,
 * ne tek u aplikaciji. Čista funkcija — broji iz podataka, ne dira disk.
 */
export function rezimeOcena(redovi) {
  let ocena = 0;
  let sud = 0;
  let snimci = 0;
  for (const red of redovi ?? []) {
    const o = red?.sajtOcena;
    if (!o) continue;
    ocena += 1;
    if (o.claude) sud += 1;
    const s = o.snimci ?? {};
    if (s.desktop || s.desktopId) snimci += 1;
    if (s.mobile || s.mobilniId) snimci += 1;
  }
  return { ocena, sud, snimci };
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
  // GL10: ocena sajta (Lighthouse + tehnologije + Claudeov sud).
  sajtOcena: ["sajtOcena"],
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
