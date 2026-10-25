/**
 * ============================================================================
 * PRAVILA PODEŠAVANJA PROJEKTA (plan C10 §1.2)
 * ============================================================================
 *
 * Čiste funkcije bez Convex uvoza. Iste provere radi mutacija (jedini pravi
 * čuvar) i forma na frontu (greška uz polje dok se kuca), pa se pravila ne
 * mogu razići. Front ih uvozi relativnom putanjom, kao `projekatSlug.ts`.
 *
 * Svaka funkcija vraća `{ ok: true, vrednost }` sa normalizovanom vrednošću
 * (ono što se upisuje) ili `{ ok: false, poruka }` za korisnika.
 * ============================================================================
 */
import { MODULI_PROJEKTA } from "./moduli";
import { jeLokalniHost } from "./projekatSlug";

export type Provera<T> = { ok: true; vrednost: T } | { ok: false; poruka: string };

const ok = <T>(vrednost: T): Provera<T> => ({ ok: true, vrednost });
const ne = <T>(poruka: string): Provera<T> => ({ ok: false, poruka });

export const IME_MIN = 2;
export const IME_MAX = 60;
export const KRATKO_IME_MAX = 24;
export const MAKS_DOMENA = 5;
export const MAKS_SAJTOVA = 20;
export const MOZAK_MAX = 4000;

/** Ime projekta: 2–60 znakova posle trim-a. */
export function proveriIme(ime: string): Provera<string> {
  const v = ime.trim();
  if (v.length < IME_MIN || v.length > IME_MAX) {
    return ne(`Ime projekta mora imati od ${IME_MIN} do ${IME_MAX} znakova.`);
  }
  return ok(v);
}

/** Kratko ime: do 24 znaka; `null` znači „obriši“. */
export function proveriKratkoIme(kratko: string | null): Provera<string | null> {
  const v = kratko?.trim() ?? "";
  if (v.length > KRATKO_IME_MAX) {
    return ne(`Kratko ime može imati najviše ${KRATKO_IME_MAX} znaka.`);
  }
  return ok(v.length === 0 ? null : v);
}

export const BOJA_OBRAZAC = /^#[0-9a-f]{6}$/;

/** Boja projekta: „#rrggbb“, mala slova; `null` znači „obriši“. */
export function proveriBoju(boja: string | null): Provera<string | null> {
  const v = boja?.trim().toLowerCase() ?? "";
  if (v.length === 0) return ok(null);
  if (!BOJA_OBRAZAC.test(v)) return ne("Boja mora biti u obliku #rrggbb.");
  return ok(v);
}

/**
 * Ime domena: oznake od slova, cifara i crtica (ne na početku i kraju oznake),
 * završni deo od 2–63 slova. Ćirilica i drugi znaci idu kao punycode
 * (`xn--…`), kao što ih daje registrar.
 */
const DOMEN_OBRAZAC =
  /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;

function cistHost(ulaz: string): string | null {
  const v = ulaz.trim().toLowerCase();
  // Unos sa protokolom, putanjom, portom, korisnikom ili razmakom nije „samo
  // domen“: ne čistimo ga potiho, nego kažemo šta se očekuje.
  if (v.length === 0 || /[\s/:@?#\\]/.test(v)) return null;
  const bezTacke = v.endsWith(".") ? v.slice(0, -1) : v;
  return DOMEN_OBRAZAC.test(bezTacke) ? bezTacke : null;
}

/** Domen panela (`projekatDomeni.host`): samo host, bez protokola i porta. */
export function proveriDomen(ulaz: string): Provera<string> {
  const host = cistHost(ulaz);
  if (host === null) return ne("Unesi samo domen, npr. panel.primer.rs.");
  if (jeLokalniHost(host)) return ne("Lokalna adresa ne može biti domen panela.");
  return ok(host);
}

/** Jedan praćen sajt: host bez `www.`. */
export function proveriSajt(ulaz: string): Provera<string> {
  const host = cistHost(ulaz);
  if (host === null || jeLokalniHost(host)) {
    return ne("Unesi domen sajta, npr. primer.rs.");
  }
  return ok(host.startsWith("www.") ? host.slice(4) : host);
}

/** Ceo spisak sajtova: svaki ispravan, bez duplikata, najviše 20. */
export function proveriSajtove(ulaz: readonly string[]): Provera<string[]> {
  const out: string[] = [];
  for (const s of ulaz) {
    const p = proveriSajt(s);
    if (!p.ok) return ne(`${p.poruka} („${s.trim()}“)`);
    if (!out.includes(p.vrednost)) out.push(p.vrednost);
  }
  if (out.length > MAKS_SAJTOVA) return ne(`Najviše ${MAKS_SAJTOVA} sajtova.`);
  return ok(out);
}

const MODULI: ReadonlySet<string> = new Set<string>(MODULI_PROJEKTA);

/**
 * Uključeni moduli. `null` = svi (bez vrednosti u bazi). Redosled prati
 * `MODULI_PROJEKTA`, pa isti izbor uvek daje isti zapis.
 */
export function proveriModule(
  ulaz: readonly string[] | null,
): Provera<string[] | null> {
  if (ulaz === null) return ok(null);
  for (const m of ulaz) {
    if (!MODULI.has(m)) return ne("Nepoznat modul.");
  }
  const skup = new Set(ulaz);
  if (skup.size === MODULI_PROJEKTA.length) return ok(null);
  return ok(MODULI_PROJEKTA.filter((m) => skup.has(m)));
}

export const MOZAK_POLJA = ["ponuda", "icpOpis", "ton", "zabrane", "skripte"] as const;
export type MozakPolje = (typeof MOZAK_POLJA)[number];

/** Jedno polje mozga: do 4.000 znakova; prazno ili `null` briše. */
export function proveriMozakPolje(tekst: string | null): Provera<string | null> {
  const v = tekst?.trim() ?? "";
  if (v.length > MOZAK_MAX) return ne("Najviše 4.000 znakova.");
  return ok(v.length === 0 ? null : v);
}

// ── Logo i ikonica (plan C10 E12) ──────────────────────────────────────────

export type VrstaSlike = "logo" | "favicon";

/** Bez SVG-a: SVG može da nosi skriptu. */
export const SLIKE: Record<
  VrstaSlike,
  { tipovi: readonly string[]; maksBajtova: number; opisTipova: string }
> = {
  logo: {
    tipovi: ["image/png", "image/jpeg", "image/webp"],
    maksBajtova: 512 * 1024,
    opisTipova: "PNG, JPG ili WebP",
  },
  favicon: {
    tipovi: ["image/png", "image/x-icon", "image/vnd.microsoft.icon"],
    maksBajtova: 128 * 1024,
    opisTipova: "PNG ili ICO",
  },
};

/** Fajl se prihvata samo ako je otpremljen nedavno (vidi `postaviSlikuBrenda`). */
export const SLIKA_SVEZA_MS = 10 * 60 * 1000;

export function proveriSliku(
  vrsta: VrstaSlike,
  fajl: { contentType?: string; size: number },
): Provera<null> {
  const pravilo = SLIKE[vrsta];
  const tip = fajl.contentType?.toLowerCase() ?? "";
  if (!pravilo.tipovi.includes(tip)) {
    return ne(`Dozvoljen je samo ${pravilo.opisTipova}.`);
  }
  if (fajl.size <= 0 || fajl.size > pravilo.maksBajtova) {
    return ne(`Fajl može imati najviše ${Math.round(pravilo.maksBajtova / 1024)} KB.`);
  }
  return ok(null);
}

// ── Integracije sajta (C12) ─────────────────────────────────────────────────

const prazno = (ulaz: string | null | undefined): boolean =>
  (ulaz?.trim() ?? "").length === 0;

/** Meta piksel: samo cifre, 10–20; prazno briše. */
export function proveriPikselId(ulaz: string | null): Provera<string | null> {
  if (prazno(ulaz)) return ok(null);
  const v = ulaz!.trim();
  if (!/^\d{10,20}$/.test(v)) return ne("ID piksela je broj od 10 do 20 cifara.");
  return ok(v);
}

/** `https:` adresa bez korisnika, lozinke i heša; `null` kad ne prolazi. */
function httpsAdresa(ulaz: string): URL | null {
  let url: URL;
  try {
    url = new URL(ulaz.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) return null;
  return url;
}

/**
 * Baza kratkih `/r/` linkova: samo origin (`https://<host>`), a host mora biti
 * jedan od panel domena ovog projekta (Next prepisuje `/r/` na svakom domenu
 * aplikacije, a tuđ domen bi slao klikove na tuđ sajt).
 */
export function proveriKratkiLinkoviBaza(
  ulaz: string | null,
  domeniProjekta: readonly string[],
): Provera<string | null> {
  if (prazno(ulaz)) return ok(null);
  const poruka = "Baza kratkih linkova mora biti domen ovog panela, npr. https://panel.primer.rs.";
  const url = httpsAdresa(ulaz!);
  if (url === null || url.port || url.search || (url.pathname !== "/" && url.pathname !== "")) {
    return ne(poruka);
  }
  const host = url.hostname.toLowerCase();
  if (!domeniProjekta.includes(host)) return ne(poruka);
  return ok(`https://${host}`);
}

export const ADRESA_SAJTA_MAX = 200;

/**
 * Adresa na sajtu projekta (osvežavanje novosti, Puls): `https:`, host (bez
 * `www.`) je jedan od praćenih sajtova projekta.
 */
export function proveriAdresuNaSajtu(
  ulaz: string | null,
  sajtovi: readonly string[],
): Provera<string | null> {
  if (prazno(ulaz)) return ok(null);
  const v = ulaz!.trim();
  const url = httpsAdresa(v);
  if (url === null || v.length > ADRESA_SAJTA_MAX) {
    return ne("Adresa mora početi sa https:// i imati najviše 200 znakova.");
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (!sajtovi.includes(host)) return ne("Adresa mora biti na jednom od sajtova projekta.");
  return ok(url.href);
}

/** Ime pošiljaoca mejlova: 2–60 znakova, bez znakova koji lome zaglavlje. */
export function proveriPosiljalacIme(ulaz: string | null): Provera<string | null> {
  if (prazno(ulaz)) return ok(null);
  const v = ulaz!.trim();
  if (/[<>"\r\n]/.test(v)) {
    return ne("Ime pošiljaoca ne sme imati znakove < > \" ni novi red.");
  }
  if (v.length < IME_MIN || v.length > IME_MAX) {
    return ne(`Ime pošiljaoca mora imati od ${IME_MIN} do ${IME_MAX} znakova.`);
  }
  return ok(v);
}

// ── Budžetske granice (C12, plan C10 E5) ────────────────────────────────────

/**
 * Granice izmene budžeta koje važe kad projekat nema svoje: zaštitne ograde za
 * svaki projekat, ne Enigmin podatak. Gornja granica NOVE kampanje nema
 * podrazumevanu vrednost: bez nje je pravljenje kampanja isključeno.
 */
export const BUDZET_PODRAZUMEVANO = { minimum: 5, maksimum: 5000, valuta: "EUR" } as const;
export const BUDZET_IZNOS_MAX = 100_000;

/** Pozitivan konačan broj iz teksta (env); sve ostalo je „nije postavljeno“. */
export function pozitivnaGranica(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === "") return null;
  const val = parseFloat(raw);
  if (!Number.isFinite(val) || val <= 0) return null;
  return val;
}

export const BUDZET_POLJA = [
  "minimum",
  "maksimum",
  "metaMaksDnevno",
  "googleMaksDnevno",
] as const;
export type BudzetPolje = (typeof BUDZET_POLJA)[number];

export type BudzetUlaz = Partial<Record<BudzetPolje, number | string | null>> & {
  valuta?: string | null;
};
export type Budzet = Partial<Record<BudzetPolje, number>> & { valuta?: string };

function iznos(ulaz: number | string | null | undefined): Provera<number | undefined> {
  if (ulaz === null || ulaz === undefined) return ok(undefined);
  if (typeof ulaz === "string") {
    const t = ulaz.trim().replace(",", ".");
    if (t.length === 0) return ok(undefined);
    ulaz = Number(t);
  }
  if (!Number.isFinite(ulaz) || ulaz <= 0 || ulaz > BUDZET_IZNOS_MAX) {
    return ne("Iznos mora biti broj veći od 0 i najviše 100.000.");
  }
  return ok(ulaz);
}

/**
 * Ceo blok granica (zamenjuje sačuvani). Prazno polje znači „bez vrednosti
 * projekta“. Poređenja idu nad granicama koje će zaista važiti, tj. sa
 * podrazumevanim vrednostima za prazna polja.
 */
export function proveriBudzet(ulaz: BudzetUlaz): Provera<Budzet> {
  const out: Budzet = {};
  for (const polje of BUDZET_POLJA) {
    const p = iznos(ulaz[polje]);
    if (!p.ok) return p;
    if (p.vrednost !== undefined) out[polje] = p.vrednost;
  }
  const valuta = ulaz.valuta?.trim().toUpperCase() ?? "";
  if (valuta.length > 0) {
    if (!/^[A-Z]{3}$/.test(valuta)) return ne("Valuta je kod od tri slova, npr. EUR.");
    out.valuta = valuta;
  }
  const minimum = out.minimum ?? BUDZET_PODRAZUMEVANO.minimum;
  const maksimum = out.maksimum ?? BUDZET_PODRAZUMEVANO.maksimum;
  if (minimum > maksimum) return ne("Minimum mora biti manji od maksimuma.");
  for (const polje of ["metaMaksDnevno", "googleMaksDnevno"] as const) {
    const g = out[polje];
    if (g !== undefined && g > maksimum) {
      return ne("Najviše dnevno za novu kampanju ne sme biti veće od maksimuma.");
    }
  }
  return ok(out);
}

// ── Tajne projekta (C12) ────────────────────────────────────────────────────

export type KljucTajne = "meta_capi_token" | "novosti_revalidate_secret" | "puls_token";

const TAJNA_DUZINA: Record<KljucTajne, { min: number; max: number }> = {
  meta_capi_token: { min: 20, max: 512 },
  novosti_revalidate_secret: { min: 16, max: 256 },
  puls_token: { min: 16, max: 256 },
};

/** Tajna: dužina po vrsti, bez razmaka. Poruka nikad ne citira vrednost. */
export function proveriTajnu(kljuc: KljucTajne, vrednost: string): Provera<string> {
  const v = vrednost.trim();
  const { min, max } = TAJNA_DUZINA[kljuc];
  if (v.length < min || v.length > max || /\s/.test(v)) return ne("Token izgleda neispravno.");
  return ok(v);
}
