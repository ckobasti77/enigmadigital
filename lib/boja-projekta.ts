import type { CSSProperties } from "react";

/**
 * ============================================================================
 * BOJA PROJEKTA — peta uloga boje, IDENTITET (P10, plan C02 §8.7)
 * ============================================================================
 *
 * Projekat bira svoju boju (`brend.boja`, „#rrggbb“). Ona je podatak, pa ne
 * mora da prolazi kontrast: ova funkcija je pretvara u par koji prolazi.
 *
 *   - tekst na boji (inicijali u znaku projekta) je tamni ili svetli, onaj
 *     sa većim kontrastom, i mora da dostigne 4,5:1;
 *   - sama boja mora da ima bar 3:1 prema strani (traka od 2 px, prsten),
 *     jer je to granica, ne ukras.
 *
 * Kad uslov ne prolazi, boja se pomera po svetlini u OKLab-u (nijansa i
 * hroma ostaju što bliže izabranoj), na stranu koja traži manji pomak.
 *
 * Dve heks vrednosti ispod su preslikani tokeni iz `app/globals.css`
 * (`--bg-950` = `--background`, `--text-primary` = `--foreground`); test
 * proverava da su iste, pa izvor istine ostaje CSS.
 */

export const TAMNI_TEKST = "#070d19";
export const SVETLI_TEKST = "#f3f7ff";
/** Strana (`--background`) je isti ton kao tamni tekst. */
const STRANA = TAMNI_TEKST;

export const KONTRAST_TEKSTA = 4.5;
export const KONTRAST_GRANICE = 3;

const HEX = /^#([0-9a-f]{6})$/i;

/**
 * Predlozi boje projekta u podešavanjima i čarobnjaku (podatak, kao boja iz
 * baze; komponente ih crtaju kroz `stilProjekta`). Bez žute i zlatne (zlatna
 * je nagrada) i bez crvene (greška); svaka prolazi oba uslova kontrasta bez
 * pomeranja, što čuva test.
 */
export const PREDLOZI_BOJA = [
  "#38bdf8",
  "#22c55e",
  "#2dd4bf",
  "#a78bfa",
  "#f472b6",
  "#fb923c",
] as const;
const KORAK_L = 0.01;
const MAKS_KORAKA = 120;

type Rgb = readonly [number, number, number];

function uRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function uHex(rgb: Rgb): string {
  return `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;
}

const uLinearno = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

const izLinearnog = (v: number) => {
  const c = Math.min(1, Math.max(0, v));
  return (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055) * 255;
};

/** Relativna luminansa po WCAG 2.x. */
function luminansa([r, g, b]: Rgb): number {
  return 0.2126 * uLinearno(r) + 0.7152 * uLinearno(g) + 0.0722 * uLinearno(b);
}

/** WCAG 2.x odnos kontrasta dve boje (1–21). */
export function kontrast(a: string, b: string): number {
  const la = luminansa(uRgb(a));
  const lb = luminansa(uRgb(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// ── OKLab (Björn Ottosson), isto kao `scripts/contrast-check.mjs` ──────────

function uOklab([r, g, b]: Rgb): [number, number, number] {
  const R = uLinearno(r);
  const G = uLinearno(g);
  const B = uLinearno(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function izOklab([L, a, b]: [number, number, number]): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    izLinearnog(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    izLinearnog(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    izLinearnog(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/**
 * Pomera boju po svetlini dok `uslov` ne prođe. Vraća boju i broj koraka,
 * ili `null` ako se ni na kraju skale (belo, crno) uslov ne ispuni.
 */
function pomeri(
  hex: string,
  smer: 1 | -1,
  uslov: (h: string) => boolean,
): { boja: string; koraka: number } | null {
  const [L, a, b] = uOklab(uRgb(hex));
  for (let i = 0; i <= MAKS_KORAKA; i++) {
    const novaL = Math.min(1, Math.max(0, L + smer * i * KORAK_L));
    const kandidat = uHex(izOklab([novaL, a, b]));
    if (uslov(kandidat)) return { boja: kandidat, koraka: i };
    if (novaL === 1 || novaL === 0) break;
  }
  // Na kraju skale gamut odseca hromu; čista bela ili crna je poslednji pokušaj.
  const kraj = smer === 1 ? "#ffffff" : "#000000";
  return uslov(kraj) ? { boja: kraj, koraka: MAKS_KORAKA + 1 } : null;
}

export type BojaProjekta = {
  /** Boja koja prolazi oba uslova (može biti pomerena od izabrane). */
  boja: string;
  /** `TAMNI_TEKST` ili `SVETLI_TEKST`. */
  tekst: string;
};

/**
 * Par boja za znak projekta. `null` za praznu ili neispravnu vrednost: tada
 * važi podrazumevani token (`--projekat-osnovna`).
 */
export function izvediBojuProjekta(hex: string | null | undefined): BojaProjekta | null {
  if (typeof hex !== "string") return null;
  const ulaz = hex.trim().toLowerCase();
  if (!HEX.test(ulaz)) return null;

  const granica = (h: string) => kontrast(h, STRANA) >= KONTRAST_GRANICE;
  const saTamnim = (h: string) => granica(h) && kontrast(h, TAMNI_TEKST) >= KONTRAST_TEKSTA;
  const saSvetlim = (h: string) => granica(h) && kontrast(h, SVETLI_TEKST) >= KONTRAST_TEKSTA;

  if (saTamnim(ulaz) || saSvetlim(ulaz)) {
    const tamni = kontrast(ulaz, TAMNI_TEKST);
    const svetli = kontrast(ulaz, SVETLI_TEKST);
    // Oba prolaze → veći kontrast; prolazi samo jedan → taj.
    const tekst = saTamnim(ulaz) && (!saSvetlim(ulaz) || tamni >= svetli)
      ? TAMNI_TEKST
      : SVETLI_TEKST;
    return { boja: ulaz, tekst };
  }

  // Svetlije ka tamnom tekstu ili tamnije ka svetlom: manji pomak pobeđuje.
  // Posvetljavanje uvek uspe (belo ima 19:1 sa tamnim tekstom).
  const svetlije = pomeri(ulaz, 1, saTamnim);
  const tamnije = pomeri(ulaz, -1, saSvetlim);
  if (tamnije !== null && (svetlije === null || tamnije.koraka < svetlije.koraka)) {
    return { boja: tamnije.boja, tekst: SVETLI_TEKST };
  }
  return { boja: svetlije?.boja ?? "#ffffff", tekst: TAMNI_TEKST };
}

/**
 * CSS promenljive identiteta za element koji ih nosi (uz `data-projekat`).
 * Tekst se upisuje kao token, ne kao heks. Bez boje vraća podrazumevani
 * token, da znak drugog projekta ne nasledi boju tekućeg.
 */
export function stilProjekta(hex: string | null | undefined): CSSProperties {
  const par = izvediBojuProjekta(hex);
  if (par === null) {
    return {
      "--projekat": "var(--projekat-osnovna)",
      "--projekat-tekst": "var(--background)",
    } as CSSProperties;
  }
  return {
    "--projekat": par.boja,
    "--projekat-tekst": par.tekst === TAMNI_TEKST ? "var(--background)" : "var(--foreground)",
  } as CSSProperties;
}

/**
 * Inicijali projekta za znak bez logoa: prva slova prve dve reči
 * („Enigma IT“ → „EI“, „Klijent d.o.o.“ → „KD“), a jedna reč sa velikim
 * slovom u sredini daje oba („ScanMe“ → „SM“); inače prva dva slova.
 */
export function inicijaliProjekta(ime: string): string {
  const reci = ime
    .trim()
    .split(/\s+/)
    .map((r) => r.replace(/^[^\p{L}\p{N}]+/u, ""))
    .filter(Boolean);
  if (reci.length === 0) return "?";
  if (reci.length > 1) {
    return (Array.from(reci[0])[0] + Array.from(reci[1])[0]).toLocaleUpperCase("sr-Latn");
  }
  const slova = Array.from(reci[0]);
  const unutra = slova.findIndex((s, i) => i > 0 && /\p{Lu}/u.test(s));
  const drugo = unutra > 0 ? slova[unutra] : (slova[1] ?? "");
  return (slova[0] + drugo).toLocaleUpperCase("sr-Latn");
}
