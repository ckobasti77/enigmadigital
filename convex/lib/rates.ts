/**
 * ============================================================================
 * RATE & RATIO DERIVATION UTILITY
 * ============================================================================
 *
 * Single source of truth for rate and ratio calculations (`deriveRate`).
 * Used across Meta Ads and Google Ads metric catalogs.
 *
 * Rules:
 *   - Returns `undefined` when `den` is 0, negative, undefined, or when `num` is undefined.
 *   - NIKADA ne vraća 0 za nepoznato / nedovoljno podataka.
 *   - Returns 0 ONLY when `num === 0` and `den > 0` (prava nula preživljava).
 *   - Returns `undefined` for non-finite values (NaN, Infinity).
 * ============================================================================
 */

export function deriveRate(num?: number, den?: number): number | undefined {
  if (
    num === undefined ||
    den === undefined ||
    den <= 0 ||
    !Number.isFinite(num) ||
    !Number.isFinite(den)
  ) {
    return undefined;
  }
  return num / den;
}
