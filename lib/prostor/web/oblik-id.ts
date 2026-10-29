/**
 * Oblik Convex ID-ja u adresi ekrana radnog dela (plan S07 §1.1): samo slova i
 * cifre, najmanje deset znakova. Ruta sa drugačijim oblikom daje 404 pre nego
 * što bilo šta ode na server; ispravan oblik, a tuđ ili nepostojeći dokument,
 * odbija backend.
 */
const OBLIK_ID = /^[a-z0-9]{10,}$/i;

export function jeOblikId(id: string): boolean {
  return OBLIK_ID.test(id);
}
