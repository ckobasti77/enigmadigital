import type { NextRequest } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

/**
 * Odredište posle OAuth povratka (PROJEKTI P6): panel sa kog je povezivanje
 * krenulo. Adresu je server proverio pri izdavanju `state`-a (domen ovog
 * projekta ili hub; putanju gradi sam), pa se ovde ne čita ništa iz upita
 * callback-a — nema open redirect-a.
 *
 * Bez `state`-a, bez Convex adrese, ili kad upit ne uspe, ide se na
 * `/settings` adrese callback-a (dosadašnje ponašanje).
 */
export async function ciljPovratka(
  request: NextRequest,
  state: string | null,
  convexUrl: string | null,
): Promise<URL> {
  const rezerva = new URL("/settings", request.nextUrl.origin);
  if (!state || !convexUrl) return rezerva;
  try {
    const povratak = await new ConvexHttpClient(convexUrl).query(api.oauthPovratak.procitaj, {
      state,
    });
    return povratak ? new URL(povratak) : rezerva;
  } catch {
    return rezerva;
  }
}

/**
 * Posle razmene: adresa koju je akcija ponovo proverila pri trošenju
 * `state`-a, a ako je nema (npr. domen uklonjen u međuvremenu), `cilj`.
 */
export function ciljPosleRazmene(povratak: string | null | undefined, cilj: URL): URL {
  if (!povratak) return new URL(cilj);
  try {
    return new URL(povratak);
  } catch {
    return new URL(cilj);
  }
}
