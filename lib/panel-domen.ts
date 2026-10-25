/**
 * Keš „host → projekat panela“ za `proxy.ts` (PROJEKTI-PLAN P5, plan C02 §7.5).
 *
 * - Lokalni host (`localhost`, `127.0.0.1`, `*.localhost`) i host koji ne liči
 *   na domen su uvek hub, bez upita.
 * - Odgovor (i „nije panel“, `null`) važi 60 s.
 * - Greška ili istek upita = hub (`null`), zapamćen 10 s, da pad Convex-a ne
 *   obori svaki zahtev.
 *
 * Keš živi u memoriji instance i radi koliko može: vodič za proxy ne
 * preporučuje oslanjanje na globalno stanje, ali tačnost ne zavisi od njega —
 * instanca bez keša sama pita Convex. Čista funkcija bez Next-a i Convex-a
 * (upit daje pozivalac), da bi je testirao vitest.
 */
import { jeLokalniHost, normalizujHost } from "../convex/lib/projekatSlug";

export type Razresivac = (host: string | null | undefined) => Promise<string | null>;

type Unos = { slug: string | null; istice: number };

export function napraviRazresivac(o: {
  /** Upit `projekti.razresiDomen` za normalizovan host; slug ili `null`. */
  dohvati: (host: string) => Promise<string | null>;
  /** Za test. */
  sada?: () => number;
  ttlMs?: number;
  ttlGreskeMs?: number;
  istekMs?: number;
  /** Najviše unosa; preko toga se briše najstariji. */
  maks?: number;
}): Razresivac {
  const sada = o.sada ?? Date.now;
  const ttlMs = o.ttlMs ?? 60_000;
  const ttlGreskeMs = o.ttlGreskeMs ?? 10_000;
  const istekMs = o.istekMs ?? 1_500;
  const maks = o.maks ?? 500;
  const kes = new Map<string, Unos>();
  // Isti host u letu: paralelni zahtevi jedne strane dele jedan upit.
  const uLetu = new Map<string, Promise<string | null>>();

  function zapamti(host: string, slug: string | null, ttl: number) {
    kes.delete(host);
    kes.set(host, { slug, istice: sada() + ttl });
    while (kes.size > maks) {
      const najstariji = kes.keys().next().value;
      if (najstariji === undefined) break;
      kes.delete(najstariji);
    }
  }

  async function pitaj(host: string): Promise<string | null> {
    let tajmer: ReturnType<typeof setTimeout> | undefined;
    const istek = new Promise<never>((_, odbij) => {
      tajmer = setTimeout(() => odbij(new Error("istek upita domena")), istekMs);
    });
    try {
      const slug = await Promise.race([o.dohvati(host), istek]);
      zapamti(host, slug, ttlMs);
      return slug;
    } catch {
      zapamti(host, null, ttlGreskeMs);
      return null;
    } finally {
      clearTimeout(tajmer);
    }
  }

  return async (sirov) => {
    const host = normalizujHost(sirov);
    if (host === null || jeLokalniHost(host)) return null;
    const unos = kes.get(host);
    if (unos !== undefined && unos.istice > sada()) return unos.slug;
    const postojeci = uLetu.get(host);
    if (postojeci !== undefined) return postojeci;
    // `finally` je uvek asinhron, pa se unos briše tek posle upisa ispod.
    const upit = pitaj(host).finally(() => uLetu.delete(host));
    uLetu.set(host, upit);
    return upit;
  };
}
