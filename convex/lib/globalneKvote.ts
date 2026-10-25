/**
 * Zajedničke kvote svih projekata (PROJEKTI-PLAN §9, plan C10 §6). Čist modul,
 * bez Convex uvoza: koriste ga mutacije, upiti i testovi.
 *
 * Tri kvote ne pripadaju projektu nego nalogu iza svih projekata:
 *   - YouTube Data API: dnevni budžet jednog Google Cloud projekta;
 *   - Google Ads API: operacije jednog developer tokena u klizećih 24 h;
 *   - Meta: procenat aplikacije iz `X-App-Usage`.
 *
 * Kod brojivih kvota (YouTube, Google Ads) svaki aktivan projekat ima
 * zagarantovan deo bazena, a iz zajedničkog ostatka pozajmljuje samo dok ne
 * zadire u neiskorišćen deo ostalih (`smeDaPotrosi`). Meta procenat se ne deli:
 * to je procenat, ne broj (odluka E17).
 */

import {
  QUOTA_MEDIA_LIMIT,
  QUOTA_SOFT_LIMIT,
  VIDEO_UPLOAD_DAILY_LIMIT,
} from "./ytQuota";

// ── formula rezerve ──────────────────────────────────────────────────────────

export type UlazRezerve = {
  /** Plafon klase (npr. 8.000 jedinica za odgovore). */
  Z: number;
  /** Globalno potrošeno u prozoru, svi projekti zajedno. */
  ukupno: number;
  /** Potrošio projekat p u istom prozoru. */
  projekat: number;
  /** Potrošnja svakog DRUGOG aktivnog projekta sa tom vezom. */
  ostaliPotroseno: number[];
  trosak: number;
};

export type IshodRezerve =
  | { ok: true }
  | { ok: false; razlog: "globalno" | "rezerva_drugih" };

/** Broj projekata koji dele bazen: p plus ostali, najmanje 1. */
export function brojProjekata(ostaliPotroseno: number[]): number {
  return ostaliPotroseno.length + 1;
}

/** Zagarantovan deo jednog projekta: `floor(Z / N)`. */
export function deoProjekta(Z: number, N: number): number {
  return Math.floor(Z / Math.max(1, N));
}

/** Neiskorišćen zagarantovan deo svih drugih projekata. */
export function rezervaDrugih(R: number, ostaliPotroseno: number[]): number {
  return ostaliPotroseno.reduce((zbir, q) => zbir + Math.max(0, R - q), 0);
}

/**
 * Sme li projekat p da potroši `trosak` iz bazena veličine Z?
 *
 * Pravilo: `ukupno + trosak ≤ Z` i (`projekat + trosak ≤ R` ili
 * `Z − (ukupno + trosak) ≥ D`). Svoj deo projekat troši slobodno; preko njega
 * sme samo dok posle potrošnje u bazenu ostaje bar onoliko koliko ostali još
 * nisu iskoristili od svojih delova. Za N = 1 važi R = Z, tj. ponašanje pre
 * više projekata.
 */
export function smeDaPotrosi(i: UlazRezerve): IshodRezerve {
  const trosak = Math.max(0, i.trosak);
  if (i.ukupno + trosak > i.Z) return { ok: false, razlog: "globalno" };
  const R = deoProjekta(i.Z, brojProjekata(i.ostaliPotroseno));
  if (i.projekat + trosak <= R) return { ok: true };
  const D = rezervaDrugih(R, i.ostaliPotroseno);
  if (i.Z - (i.ukupno + trosak) >= D) return { ok: true };
  return { ok: false, razlog: "rezerva_drugih" };
}

/** Najveći `trosak` koji `smeDaPotrosi` još pušta; nikad negativan. */
export function dostupno(i: Omit<UlazRezerve, "trosak">): number {
  const R = deoProjekta(i.Z, brojProjekata(i.ostaliPotroseno));
  const D = rezervaDrugih(R, i.ostaliPotroseno);
  const slobodno = i.Z - i.ukupno;
  const unutarDela = R - i.projekat;
  const pozajmica = slobodno - D;
  return Math.max(0, Math.min(slobodno, Math.max(unutarDela, pozajmica)));
}

// ── klase i plafoni ──────────────────────────────────────────────────────────

export type KlasaYoutube = "odgovori" | "izmene" | "upload";
export type KlasaKvote = KlasaYoutube | "operacije";

/**
 * Plafon YouTube klase. Odgovori i izmene dele isti brojač jedinica (dva
 * plafona nad jednim budžetom, Y6); upload ima svoj brojač.
 */
export function plafonYoutube(klasa: KlasaYoutube): number {
  if (klasa === "odgovori") return QUOTA_SOFT_LIMIT;
  if (klasa === "izmene") return QUOTA_MEDIA_LIMIT;
  return VIDEO_UPLOAD_DAILY_LIMIT;
}

/**
 * Plafon Google Ads operacija za 24 h: 95 % limita developer tokena, jer kapija
 * staje na 95 % (`QUOTA_STOP_PCT`). Explorer 2.736, Basic 14.250, Standard 95.000.
 */
export function plafonGoogleAds(dnevniLimit: number): number {
  return Math.floor(dnevniLimit * 0.95);
}

// ── vreme ────────────────────────────────────────────────────────────────────

const PACIFIK = "America/Los_Angeles";
const SAT_MS = 60 * 60 * 1000;
const DAN_MS = 24 * SAT_MS;

const pacifikFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: PACIFIK,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Dan YouTube kvote, „YYYY-MM-DD“ po pacifičkom vremenu (odluka E18). Google
 * resetuje kvotu u ponoć po pacifičkom vremenu, pa brojač mora da prati isti dan.
 */
export function pacifickiDan(ms: number): string {
  const delovi = pacifikFormat.formatToParts(new Date(ms));
  const deo = (tip: string) => delovi.find((d) => d.type === tip)?.value ?? "";
  return `${deo("year")}-${deo("month")}-${deo("day")}`;
}

/**
 * Trenutak sledeće ponoći po pacifičkom vremenu (obnova YouTube kvote).
 * Pacifička zona ima pomak u celim satima, pa je ponoć uvek na početku UTC
 * sata: prvi sat u kom se pacifički dan promeni je tačno ponoć. Radi i u
 * danima prelaska na letnje i zimsko računanje vremena (dan od 23 ili 25 h).
 */
export function obnovaYoutube(ms: number): number {
  const danas = pacifickiDan(ms);
  let sat = Math.floor(ms / SAT_MS) * SAT_MS;
  for (let i = 0; i < 26; i++) {
    sat += SAT_MS;
    if (pacifickiDan(sat) !== danas) return sat;
  }
  return sat;
}

/** Sat Google Ads brojača, „YYYY-MM-DDTHH“ po UTC-u. */
export function utcSat(ms: number): string {
  return new Date(ms).toISOString().slice(0, 13);
}

/** Prvi sat klizećeg prozora od 24 h (tekući sat i 23 pre njega). */
export function pocetakProzoraGoogleAds(ms: number): string {
  return utcSat(ms - 23 * SAT_MS);
}

/**
 * Kad se prozor Google Ads dovoljno oslobodi: najstariji sat u prozoru izlazi
 * iz njega 24 h posle svog početka. Gruba procena za poruku („oko 14:00“).
 */
export function obnovaGoogleAds(najstarijiSat: string | null, ms: number): number {
  if (najstarijiSat === null) return ms;
  const pocetak = Date.parse(`${najstarijiSat}:00:00.000Z`);
  return Number.isFinite(pocetak) ? pocetak + DAN_MS : ms + SAT_MS;
}

/** „09:00“ po beogradskom vremenu, za poruke korisniku. */
export function vremeUBeogradu(ms: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Belgrade",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ms));
}

// ── poruke ───────────────────────────────────────────────────────────────────

function broj(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * Šta korisnik vidi kad YouTube kvota ne pusti trošak (plan C10 §6.5). `R` je
 * deo projekta; vreme obnove je sledeća pacifička ponoć po beogradskom satu.
 */
export function porukaYoutube(
  klasa: KlasaYoutube,
  razlog: "globalno" | "rezerva_drugih",
  R: number,
  obnovaU: number,
): string {
  const kad = vremeUBeogradu(obnovaU);
  if (klasa === "upload") {
    return razlog === "globalno"
      ? `Zajednički dnevni limit slanja videa za sve projekte je dostignut. Ponovo sutra u ${kad}.`
      : `Danas je poslato ${broj(R)} od ${broj(R)} videa za ovaj projekat. Ponovo sutra u ${kad}.`;
  }
  if (klasa === "izmene") {
    return razlog === "globalno"
      ? `Zajednička YouTube kvota za izmene svih projekata je potrošena. Obnavlja se u ${kad}.`
      : `Kvota za izmene je potrošena (deo ovog projekta: ${broj(R)}). Obnavlja se u ${kad}.`;
  }
  return razlog === "globalno"
    ? `Zajednička YouTube kvota svih projekata je potrošena. Odgovori se nastavljaju u ${kad}.`
    : `Deo dnevne YouTube kvote za ovaj projekat je potrošen (${broj(R)} od ${broj(R)}). Odgovori se nastavljaju u ${kad}.`;
}

/** Poruka za odloženu Google Ads sinhronizaciju ili akciju. */
export function porukaGoogleAds(
  razlog: "globalno" | "rezerva_drugih",
  R: number,
  obnovaU: number,
): string {
  const kad = vremeUBeogradu(obnovaU);
  return razlog === "globalno"
    ? `Google Ads sinhronizacija je odložena: zajednička kvota svih projekata je potrošena. Ponovo oko ${kad}.`
    : `Google Ads sinhronizacija je odložena: deo kvote za ovaj projekat je potrošen (${broj(R)} od ${broj(R)} operacija za 24 h). Ponovo oko ${kad}.`;
}
