/**
 * Geometrija mape leadova koju dele MapLibre sloj (GL3, heksagoni) i three.js
 * sloj (GL4, prstenovi/snop/beacon). Jedan izvor za oba, da prsten uvek
 * obuhvata baš onaj heksagon koji čovek vidi.
 */

/** Visina heksagona u metrima: fit 0 % → 20 m, 100 % → 400 m (plan §8). */
export const VISINA_MIN_M = 20;
export const VISINA_MAX_M = 400;

/** Poluprečnik heksagona u pikselima ekrana — u metrima zavisi od zooma. */
export const HEKS_PX = 13;

/** Firma bez merljivog fita dobija NAJNIŽI heksagon, ne srednji (§0 pravilo 1). */
export function visinaZa(fit: number | null): number {
  if (fit === null) return VISINA_MIN_M;
  const f = Math.min(100, Math.max(0, fit)) / 100;
  return VISINA_MIN_M + f * (VISINA_MAX_M - VISINA_MIN_M);
}

export function metaraPoPikselu(lat: number, zoom: number): number {
  return (156_543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
}

/** Poluprečnik heksagona u metrima na datoj širini i zoomu. */
export function heksPoluprecnikM(lat: number, zoom: number): number {
  return HEKS_PX * metaraPoPikselu(lat, zoom);
}
