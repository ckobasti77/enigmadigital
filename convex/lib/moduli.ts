/**
 * Moduli projekta (PROJEKTI-PLAN §4, plan C10 E20). Čist modul bez Convex
 * uvoza: koriste ga mutacija podešavanja i front (`nav-items.ts`,
 * `lib/rutiranje.ts`), pa je spisak jedan.
 *
 * Ključevi su isti kao `MODULE_KEYS` u `components/app/nav-items.ts`, bez
 * kontrolne table i podešavanja (`tabla`, `sistem`): te dve se ne isključuju.
 * Test u `lib/rutiranje.test.ts` čuva jednakost.
 */
export const MODULI_PROJEKTA = [
  "leadovi",
  "novosti",
  "instagram",
  "facebook",
  "youtube",
  "threads",
  "oglasi",
  "analitika",
  "atribucija",
  "openreply",
  "pravila",
] as const;

export type ModulProjekta = (typeof MODULI_PROJEKTA)[number];

/** Moduli koje projekat ne može da isključi (kontrolna tabla, podešavanja). */
export const UVEK_UKLJUCENI: ReadonlySet<string> = new Set(["tabla", "sistem"]);

/** `moduli` bez vrednosti = svi uključeni. */
export function modulUkljucen(
  moduli: readonly string[] | null | undefined,
  modul: string,
): boolean {
  if (moduli === null || moduli === undefined) return true;
  if (UVEK_UKLJUCENI.has(modul)) return true;
  return moduli.includes(modul);
}
