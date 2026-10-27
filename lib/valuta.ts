/**
 * Valuta (odluka O16): nalozi za oglase rade u evrima i aplikacija ne
 * preračunava. Iznos se uvek piše u valuti koju izvor javi; kad ta valuta
 * nije evro, ekran nosi upozorenje i iznos nikad ne dobija znak €.
 */
export const OSNOVNA_VALUTA = "EUR";

/** ISO kod koji izvor javlja, ili ništa. */
export function normalizujValutu(v?: string | null): string | undefined {
  const t = v?.trim().toUpperCase();
  return t ? t : undefined;
}

/**
 * Da li je valuta poznata i različita od evra. Prazno i nepoznato nije
 * „druga valuta" — za to već postoji natpis „valuta naloga nije poznata".
 */
export function jeDrugaValuta(v?: string | null): boolean {
  const kod = normalizujValutu(v);
  return kod !== undefined && kod !== OSNOVNA_VALUTA;
}
