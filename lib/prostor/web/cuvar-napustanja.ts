/**
 * Čuvar napuštanja nesačuvanog teksta (plan S07 §4.3) — ČISTO (vitest).
 *
 * Pravila su Devotionova (`apps/web/components/workspace/workspace-shell.tsx`
 * i `page/page-autosave-model.ts`, main @ c05c40f):
 *   - sačuvano → navigacija ide odmah;
 *   - u toku (`dirty`, `saving`) → čeka se do 2 s da autosave završi, pa se
 *     pita „Ostani / Napusti“;
 *   - greška, konflikt, neispravno → pita se odmah.
 * Stanja i tekstovi pitanja su isti kao u Devotionu, da stranica i oblast
 * (S10) prijave ono što već računaju.
 */

/** Stanje čuvanja dokumenta (Devotion `PageEditorSaveState`). */
export type StanjeCuvanja = "saved" | "saving" | "dirty" | "error" | "conflict" | "invalid";

/** Šta drži nacrt: stranica (editor) ili opis oblasti. */
export type VrstaNacrta = "stranica" | "oblast";

/** Koliko se čeka da autosave sam završi pre pitanja (Devotion: 2 s). */
export const CEKANJE_PRE_PITANJA_MS = 2_000;

/** Nešto još nije na serveru. */
export function imaNesacuvano(stanje: StanjeCuvanja): boolean {
  return stanje !== "saved";
}

/** Stanje koje se samo završi za trenutak. */
export function seSlaze(stanje: StanjeCuvanja): boolean {
  return stanje === "dirty" || stanje === "saving";
}

/** Pitanje pri napuštanju (tekst iz Devotiona). */
export function pitanjeNapustanja(stanje: StanjeCuvanja, vrsta: VrstaNacrta): string {
  if (vrsta === "oblast") return "Opis oblasti još nije sačuvan. Napusti prikaz?";
  return stanje === "invalid"
    ? "Naslov je prazan, pa izmene ne mogu da se sačuvaju. Napusti stranicu?"
    : "Izmene još nisu sačuvane. Napusti stranicu?";
}

/** Redosled težine: najteže stanje odlučuje kad nacrta ima više. */
const TEZINA: Record<StanjeCuvanja, number> = {
  saved: 0,
  saving: 1,
  dirty: 2,
  error: 3,
  invalid: 4,
  conflict: 5,
};

export type PrijavljenNacrt = { stanje: StanjeCuvanja; vrsta: VrstaNacrta };

/** Najteži prijavljen nacrt; `null` kad nema nijednog nesačuvanog. */
export function najteziNacrt(nacrti: Iterable<PrijavljenNacrt>): PrijavljenNacrt | null {
  let najtezi: PrijavljenNacrt | null = null;
  for (const n of nacrti) {
    if (!imaNesacuvano(n.stanje)) continue;
    if (najtezi === null || TEZINA[n.stanje] > TEZINA[najtezi.stanje]) najtezi = n;
  }
  return najtezi;
}

export type OdlukaNapustanja =
  | { tip: "idi" }
  | { tip: "sacekaj"; ms: number; pitanje: string }
  | { tip: "pitaj"; pitanje: string };

/** Šta raditi kad korisnik krene sa ekrana. */
export function odlukaNapustanja(nacrt: PrijavljenNacrt | null): OdlukaNapustanja {
  if (nacrt === null || !imaNesacuvano(nacrt.stanje)) return { tip: "idi" };
  const pitanje = pitanjeNapustanja(nacrt.stanje, nacrt.vrsta);
  return seSlaze(nacrt.stanje)
    ? { tip: "sacekaj", ms: CEKANJE_PRE_PITANJA_MS, pitanje }
    : { tip: "pitaj", pitanje };
}

/** Događaj klika, onoliko koliko čuvaru treba. */
export type KlikNaLink = {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
};

/** Link, onoliko koliko čuvaru treba (`<a>` posle razrešenja adrese). */
export type CiljLinka = {
  /** Pun URL (`a.href`). */
  href: string;
  target: string;
  download: boolean;
};

/**
 * Da li čuvar sme da preuzme klik: levi taster bez modifikatora (nova
 * kartica ide svojim putem), ista kartica, isti izvor, bez preuzimanja
 * fajla, i adresa nije ista strana (sidro na istoj strani nije napuštanje).
 */
export function jeNavigacijaUnutarAplikacije(
  klik: KlikNaLink,
  link: CiljLinka,
  trenutna: string,
): boolean {
  if (klik.defaultPrevented || klik.button !== 0) return false;
  if (klik.metaKey || klik.ctrlKey || klik.shiftKey || klik.altKey) return false;
  if (link.download) return false;
  if (link.target !== "" && link.target !== "_self") return false;
  let cilj: URL;
  let sada: URL;
  try {
    cilj = new URL(link.href, trenutna);
    sada = new URL(trenutna);
  } catch {
    return false;
  }
  if (cilj.origin !== sada.origin) return false;
  return cilj.pathname !== sada.pathname || cilj.search !== sada.search;
}
