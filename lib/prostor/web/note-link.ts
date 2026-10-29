// Preneto iz Devotion apps/web/lib/note-link.ts (main @ c05c40f), SPAJANJE S10.
/**
 * Adrese za linkove u telu beleške. Korisnik u dijalogu piše skraćeno
 * („primer.rs/cenovnik“), pa unos mora da se dopuni protokolom pre nego što
 * postane `href`. Istovremeno je ovo mesto gde se odbijaju izvršne sheme
 * (`javascript:`, `data:`) — Tiptap ima svoju proveru, ali link koji nikad ne
 * nastane je jača garancija od one koja zavisi od podrazumevanih opcija.
 */

const ALLOWED_PROTOCOLS: readonly string[] = [
  "http:",
  "https:",
  "mailto:",
  "tel:",
];

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Browser tiho briše kontrolne znake iz URL-a, pa bi „java<TAB>script:“ prošlo
 * proveru sheme a ostalo izvršno. Brišu se pre svake druge provere.
 */
function withoutControlChars(input: string) {
  let output = "";
  for (const char of input) {
    const code = char.codePointAt(0) ?? 0;
    if (code > 0x1f && code !== 0x7f) output += char;
  }
  return output;
}

/**
 * Vraća `href` spreman za `setLink`, ili `null` kad unos nije adresa.
 * Bez sheme: tekst sa `@` postaje `mailto:`, sve ostalo `https://`.
 */
export function normalizeNoteLinkHref(input: string): string | null {
  const value = withoutControlChars(input).trim();
  if (value === "") return null;

  const hasScheme = SCHEME.test(value);
  const candidate = hasScheme
    ? value
    : EMAIL.test(value)
      ? `mailto:${value}`
      : `https://${value}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  if (!ALLOWED_PROTOCOLS.includes(url.protocol)) return null;
  if (url.protocol === "mailto:" || url.protocol === "tel:") {
    return url.pathname.trim() === "" ? null : url.href;
  }
  if (url.hostname === "") return null;
  // Kad shemu dopunjujemo mi, „/moja-strana“ bi dalo host „moja-strana“ i link
  // u prazno. Domen zato mora da ima tačku — sa izričitom shemom se veruje
  // unosu, pa `http://server/app` u lokalnoj mreži i dalje radi.
  if (!hasScheme && !url.hostname.includes(".") && url.hostname !== "localhost") {
    return null;
  }
  return url.href;
}
