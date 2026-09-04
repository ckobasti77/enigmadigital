/**
 * Pravila lozinke (§5 prijava-plan.md) — jedini izvor istine za KLIJENTSKE ekrane
 * (živi checklist na pozivnici i provera na prijavi).
 *
 * Server (`convex/auth.ts` → `validatePasswordRequirements`) drži ISTU logiku
 * inline, jer se convex bundle ne oslanja na app `lib`. Ako se pravila ovde menjaju,
 * mora i tamo — server je jedini pravi gate, klijent je samo udobnost.
 *
 * Dijakritike se poštuju preko Unicode property escapes: „Č" je veliko slovo,
 * „č" je malo, a „!" je znak koji nije ni slovo ni cifra.
 */

export const MIN_DUZINA = 8;
export const MAX_DUZINA = 128;

export type PasswordRule = {
  id: string;
  /** Kratak, pozitivan opis uslova — prikazuje se u živom checklist-u. */
  label: string;
  test: (pw: string) => boolean;
};

/** Uslovi koji se uživo čekiraju dok korisnik kuca. Redosled je i redosled prikaza. */
export const PASSWORD_RULES: readonly PasswordRule[] = [
  { id: "duzina", label: `Bar ${MIN_DUZINA} znakova`, test: (pw) => pw.length >= MIN_DUZINA },
  { id: "veliko", label: "Jedno veliko slovo", test: (pw) => /\p{Lu}/u.test(pw) },
  { id: "malo", label: "Jedno malo slovo", test: (pw) => /\p{Ll}/u.test(pw) },
  { id: "cifra", label: "Jedna cifra", test: (pw) => /[0-9]/.test(pw) },
  {
    id: "znak",
    label: "Jedan znak (nije slovo ni cifra)",
    test: (pw) => /[^\p{L}\p{N}]/u.test(pw),
  },
];

/**
 * Prva NEISPUNJENA stavka kao poruka — govori KOJE pravilo, nikad „lozinka je loša".
 * Vraća `null` kad je sve ispunjeno. `""` (prazno) se tretira kao „još ništa nije kucano".
 */
export function prvaGreskaLozinke(pw: string): string | null {
  if (pw.length === 0) return null;
  if (pw.length < MIN_DUZINA) return `Lozinka mora imati bar ${MIN_DUZINA} znakova.`;
  if (pw.length > MAX_DUZINA) return `Lozinka može imati najviše ${MAX_DUZINA} znakova.`;
  if (!/\p{Lu}/u.test(pw)) return "Lozinka mora sadržati bar jedno veliko slovo.";
  if (!/\p{Ll}/u.test(pw)) return "Lozinka mora sadržati bar jedno malo slovo.";
  if (!/[0-9]/.test(pw)) return "Lozinka mora sadržati bar jednu cifru.";
  if (!/[^\p{L}\p{N}]/u.test(pw)) {
    return "Lozinka mora sadržati bar jedan znak koji nije slovo ni cifra.";
  }
  return null;
}

/** Da li lozinka ispunjava SVA pravila (za omogućavanje dugmeta). */
export function lozinkaValjana(pw: string): boolean {
  return (
    pw.length >= MIN_DUZINA &&
    pw.length <= MAX_DUZINA &&
    PASSWORD_RULES.every((r) => r.test(pw))
  );
}
