/**
 * ============================================================================
 * KVALITET BAZE — merač koji uči (UI Boost §6.8, B6)
 * ============================================================================
 *
 * Koliko je baza leadova spremna za rad, kao jedan procenat iz četiri dela:
 * telefon, procena „čiji je broj", ocenjen sajt i niša. Svaki deo je udeo
 * firmi koje TO imaju, u svom imeniocu; ukupan procenat je njihov prosek.
 *
 * Merač ne ocenjuje, nego pokazuje put: `sledece` je deo čija bi dopuna
 * najviše podigla ukupan procenat („+25 % kad oceniš 94 sajta").
 *
 * POŠTENJE. Deo čiji se broj ne zna (upit je odsečen) NE ulazi u prosek — ne
 * računa se ni kao 0 ni kao 100. Deo sa imeniocem 0 (npr. nijedna firma nema
 * sajt, pa nema šta da se oceni) takođe ne ulazi. Kad ne ostane nijedan deo,
 * rezultat je `null` i ekran piše „—".
 */

export type KvalitetKljuc = "telefon" | "procena" | "sajt" | "nisa";

export type KvalitetDeo = {
  kljuc: KvalitetKljuc;
  naziv: string;
  /** Koliko firmi ima podatak. */
  ima: number;
  /** Imenilac: od koliko. */
  od: number;
  /** Koliko ih fali (`od − ima`). */
  fali: number;
  /** Udeo u procentima, zaokružen naniže — 99,6 % nije „sve". */
  pct: number;
};

export type KvalitetBaze = {
  pct: number;
  delovi: KvalitetDeo[];
  /** Deo čija dopuna najviše diže ukupan procenat; `null` kad je sve puno. */
  sledece: { deo: KvalitetDeo; dobitak: number } | null;
};

export type KvalitetUlaz = Partial<
  Record<KvalitetKljuc, { fali: number; od: number } | null | undefined>
>;

const NAZIV: Record<KvalitetKljuc, string> = {
  telefon: "Telefon",
  procena: "Procena broja",
  sajt: "Ocenjen sajt",
  nisa: "Niša",
};

const REDOSLED: readonly KvalitetKljuc[] = ["telefon", "procena", "sajt", "nisa"];

export function kvalitetBaze(ulaz: KvalitetUlaz): KvalitetBaze | null {
  const delovi: KvalitetDeo[] = [];
  for (const kljuc of REDOSLED) {
    const d = ulaz[kljuc];
    if (!d) continue;
    const od = Math.trunc(d.od);
    if (!Number.isFinite(od) || od <= 0) continue;
    const fali = Math.min(od, Math.max(0, Math.trunc(d.fali)));
    const ima = od - fali;
    delovi.push({
      kljuc,
      naziv: NAZIV[kljuc],
      ima,
      od,
      fali,
      pct: Math.floor((ima / od) * 100),
    });
  }
  if (delovi.length === 0) return null;

  const pct = Math.floor(
    delovi.reduce((zbir, d) => zbir + d.ima / d.od, 0) / delovi.length * 100,
  );

  let sledece: KvalitetBaze["sledece"] = null;
  for (const deo of delovi) {
    if (deo.fali === 0) continue;
    // Koliko bi ukupan procenat porastao kad bi ovaj deo bio pun.
    const dobitak = Math.round(((deo.fali / deo.od) * 100) / delovi.length);
    if (dobitak < 1) continue;
    if (sledece === null || dobitak > sledece.dobitak) {
      sledece = { deo, dobitak };
    }
  }

  return { pct, delovi, sledece };
}
