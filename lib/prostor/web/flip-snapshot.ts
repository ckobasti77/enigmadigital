// Preneto iz Devotion apps/web/lib/motion/flip-snapshot.ts (main @ c05c40f), SPAJANJE S08.
/**
 * Odluka `FlipGroup`-a (čisto, za vitest): da li promena props-a traži snimak
 * položaja pre commit-a i Flip posle njega.
 */
export type FlipKeys = {
  /** Potpis rasporeda (ključevi redom). */
  layoutKey: string;
  /** Nov skup (tab, pretraga) — raspored se menja odmah. */
  resetKey?: string;
  /** Npr. previše stavki (E12). */
  disabled?: boolean;
};

export function shouldFlip(previous: FlipKeys, next: FlipKeys): boolean {
  if (previous.layoutKey === next.layoutKey) return false;
  if (previous.resetKey !== next.resetKey) return false;
  return !next.disabled;
}
