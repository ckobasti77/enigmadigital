import { ConvexError } from "convex/values";

/**
 * Pravila lozinke za `adminAuth.adminSetPassword` (SPAJANJE S06, plan S01 D13).
 *
 * Ista pravila kao Enigmina prijava: `convex/auth.ts` (`validatePasswordRequirements`)
 * i `lib/password-rules.ts` (ekran). Devotion politika (12–128) se ne prenosi
 * (P6). Convex kod ne uvozi app `lib/`, pa je logika ovde ponovljena; paritet
 * sa `lib/password-rules.ts` čuva `convex/prostor/adminAuth.test.ts`.
 */
export const LOZINKA_MIN = 8;
export const LOZINKA_MAX = 128;

/** Prva neispunjena stavka kao poruka, ili `null` kad je lozinka ispravna. */
export function greskaLozinke(lozinka: string): string | null {
  if (lozinka.length < LOZINKA_MIN) return `Lozinka mora imati bar ${LOZINKA_MIN} znakova.`;
  if (lozinka.length > LOZINKA_MAX) return `Lozinka može imati najviše ${LOZINKA_MAX} znakova.`;
  if (!/\p{Lu}/u.test(lozinka)) return "Lozinka mora sadržati bar jedno veliko slovo.";
  if (!/\p{Ll}/u.test(lozinka)) return "Lozinka mora sadržati bar jedno malo slovo.";
  if (!/[0-9]/.test(lozinka)) return "Lozinka mora sadržati bar jednu cifru.";
  if (!/[^\p{L}\p{N}]/u.test(lozinka)) {
    return "Lozinka mora sadržati bar jedan znak koji nije slovo ni cifra.";
  }
  return null;
}

/** Baca `ConvexError` sa porukom prvog neispunjenog pravila. */
export function proveriLozinku(lozinka: string): void {
  const poruka = greskaLozinke(lozinka);
  if (poruka !== null) throw new ConvexError({ code: "invalid", message: poruka });
}
