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
