/**
 * Razrešavanje Convex URL-a za serverske Route Handler-e (OAuth callback rute).
 *
 * `NEXT_PUBLIC_*` promenljive Next.js ubacuje u bundle pri build-u i NISU
 * pouzdano dostupne u Route Handler-u u trenutku zahteva na Vercelu, pa se
 * prvo čita serverska `CONVEX_URL`.
 *
 * Zašto validacija, a ne samo čitanje (empirijski, 25.08.2026): u Vercel env
 * je vrednost bila zalepljena zajedno sa labelom iz dijaloga, pa je glasila
 * `Value: https://artful-chihuahua-326.eu-west-1.convex.cloud`. `ConvexHttpClient`
 * je odbio takav string sa "Invalid deployment address", ruta je pala u
 * generički catch i korisniku je prikazano samo „Povezivanje nije uspelo" —
 * uzrok je bio nevidljiv skoro sat vremena. Pogrešno podešen server mora da se
 * imenuje kao pogrešno podešen server, nikada kao neuspela veza sa provajderom.
 *
 * Vrednost se NE „popravlja" tiho (ne odseca se `Value:` prefiks): tiho
 * ispravljena konfiguracija ostaje pogrešna u Vercel-u i sledeći put pukne na
 * drugom mestu. Jedino se skidaju vodeći/prateći beline i navodnici, što ne
 * menja značenje vrednosti.
 */
export type ServerConvexUrl =
  | { ok: true; url: string }
  | { ok: false; reason: string; logDetail: string };

export function resolveServerConvexUrl(): ServerConvexUrl {
  const raw = process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
  const source = process.env.CONVEX_URL ? "CONVEX_URL" : "NEXT_PUBLIC_CONVEX_URL";

  if (raw === undefined || raw.trim() === "") {
    return {
      ok: false,
      reason: "Server nije podešen: nedostaje Convex URL. Javi administratoru.",
      logDetail:
        "Ni CONVEX_URL ni NEXT_PUBLIC_CONVEX_URL nisu definisani. " +
        "Postavi CONVEX_URL u Vercel env (Production) na https://<deployment>.<region>.convex.cloud",
    };
  }

  // Samo beline i eventualni obavijajući navodnici — ništa semantično.
  const url = raw.trim().replace(/^["']|["']$/g, "");

  if (!/^https?:\/\//.test(url)) {
    return {
      ok: false,
      reason:
        "Server nije podešen: Convex URL nije ispravan. Javi administratoru.",
      logDetail:
        `${source} ne počinje sa "https://" ni "http://". Pročitana vrednost: ${JSON.stringify(url)}. ` +
        "Očekuje se tačno https://<deployment>.<region>.convex.cloud, bez labela i razmaka.",
    };
  }

  if (url.includes(".convex.site")) {
    return {
      ok: false,
      reason:
        "Server nije podešen: Convex URL pokazuje na HTTP rute umesto na API. Javi administratoru.",
      logDetail:
        `${source} pokazuje na .convex.site (HTTP Actions domen). ` +
        "ConvexHttpClient traži .convex.cloud domen. Pročitana vrednost: " +
        JSON.stringify(url),
    };
  }

  return { ok: true, url };
}
