/**
 * Pravila adrese projekta (P8) i hosta (P5). Jedan izvor za backend
 * (`convex/projekti.ts`) i front (`lib/rutiranje.ts` ih ponovo izvozi), pa
 * spisak rezervisanih imena ne može da se razdvoji na dva.
 *
 * Čist modul bez Convex uvoza: front ga uvozi relativnom putanjom.
 */

/** Imena ekrana (direktorijumi stranica). Projekat ne sme da se zove kao ekran. */
export const EKRANI = [
  "ads",
  "analytics",
  "atribucija",
  "facebook",
  "instagram",
  "leadovi",
  "napredak",
  "novosti",
  "openreply",
  "rules",
  "settings",
  "threads",
  "youtube",
] as const;

/** Putanje koje važe u oba režima i koje rutiranje nikad ne dira. */
export const GLOBALNE_PUTANJE = [
  "api",
  "_next",
  "login",
  "logout",
  "privacy",
  "cookies",
  "pozivnica",
  "deletion-status",
  "r",
  "dev-ux",
] as const;

/** Putanje huba van projekta („novi“ je čarobnjak, C11). */
export const HUB_PUTANJE = ["novi", "svi", "hub", "admin"] as const;

const OSTALI_REZERVISANI = ["static", "public"] as const;

export const REZERVISANI_SLUGOVI: ReadonlySet<string> = new Set<string>([
  ...GLOBALNE_PUTANJE,
  ...HUB_PUTANJE,
  ...OSTALI_REZERVISANI,
  ...EKRANI,
]);

/** 2–40 znakova: mala slova, cifre i crtica; bez crtice na početku i kraju i bez „--“. */
export const SLUG_OBRAZAC = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){1,39}$/;

export type ProveraSluga = { ok: true } | { ok: false; razlog: string };

export function proveriSlugProjekta(slug: string): ProveraSluga {
  if (!SLUG_OBRAZAC.test(slug)) {
    return {
      ok: false,
      razlog:
        "Adresa sme da ima mala slova, cifre i crtice (2–40 znakova), bez crtice na početku i kraju.",
    };
  }
  if (REZERVISANI_SLUGOVI.has(slug)) {
    return { ok: false, razlog: "Ova adresa je rezervisana. Izaberi drugu." };
  }
  return { ok: true };
}

/** Oblik je ispravan i ime nije rezervisano. */
export function jeIspravanSlug(slug: string): boolean {
  return proveriSlugProjekta(slug).ok;
}

/**
 * Host kako ga čuva `projekatDomeni`: mala slova, bez porta i završne tačke.
 * Sve što ne liči na ime domena (prazno, IPv6 literal, nedozvoljeni znaci)
 * vraća `null` — takav host nikad nije panel.
 */
export function normalizujHost(host: string | null | undefined): string | null {
  if (!host) return null;
  let h = host.trim().toLowerCase();
  if (h.startsWith("[")) return null;
  const dvotacka = h.indexOf(":");
  if (dvotacka !== -1) h = h.slice(0, dvotacka);
  if (h.endsWith(".")) h = h.slice(0, -1);
  if (h.length === 0 || h.length > 253) return null;
  if (!/^[a-z0-9.-]+$/.test(h)) return null;
  return h;
}

/** Razvoj: uvek hub, bez upita (P5). */
export function jeLokalniHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost");
}
