/**
 * Token pozivnice koji preživi prijavu (postojeći korisnik prihvata poziv u
 * drugi projekat): `/login?pozivnica=<token>` ga parkira u `sessionStorage`,
 * a posle prijave ga `PozivnicaCatcher` u kapiji vraća na `/pozivnica/<token>`.
 *
 * Prihvata se SAMO oblik pravog tokena (32 nasumična bajta u base64url, bez
 * dopune = tačno 43 znaka iz `[A-Za-z0-9_-]`), pa parkirana vrednost ne može
 * da postane adresa na koju se preusmerava (nema open redirect-a).
 */
export const KLJUC_POZIVNICE = "ep_pozivnica";

const OBLIK_TOKENA = /^[A-Za-z0-9_-]{43}$/;

export function jeTokenPozivnice(vrednost: unknown): vrednost is string {
  return typeof vrednost === "string" && OBLIK_TOKENA.test(vrednost);
}

/** Putanja ekrana pozivnice, ili `null` kad vrednost nije token. */
export function putanjaPozivnice(vrednost: unknown): string | null {
  return jeTokenPozivnice(vrednost) ? `/pozivnica/${vrednost}` : null;
}
