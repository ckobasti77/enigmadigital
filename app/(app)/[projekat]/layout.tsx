import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { fetchQuery } from "convex/nextjs";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { AppShell } from "@/components/app/app-shell";
import { ProjekatProvider } from "@/components/app/projekat-provider";
import { api } from "@/convex/_generated/api";
import { jeIspravanSlug } from "@/lib/rutiranje";
import { resolveServerConvexUrl } from "@/lib/server-convex-url";

const ISTEK_METADATA_MS = 1500;

/**
 * Naslov kartice i ikonica po projektu (PROJEKTI-PLAN §8, plan C10 §2.3):
 * „<ekran> · <projekat>“ i favicon projekta (ili logo). Čita ga
 * `mojProjekat` sa sesijom korisnika, pa tuđ projekat ne otkriva ni ime. Svaki
 * kvar (nema sesije, istek, pad) daje podrazumevani naslov iz root layout-a:
 * metadata nikad ne obara stranu.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ projekat: string }>;
}): Promise<Metadata> {
  const { projekat } = await params;
  if (!jeIspravanSlug(projekat)) return {};
  const url = resolveServerConvexUrl();
  if (!url.ok) return {};
  try {
    const token = await convexAuthNextjsToken();
    if (!token) return {};
    const p = await Promise.race([
      fetchQuery(api.projekti.mojProjekat, { slug: projekat }, { token, url: url.url }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), ISTEK_METADATA_MS)),
    ]);
    if (!p) return {};
    const ikonica = p.faviconUrl ?? p.logoUrl;
    return {
      title: { template: `%s · ${p.ime}`, default: `${p.ime} · Enigma Digital` },
      ...(ikonica ? { icons: { icon: ikonica } } : {}),
    };
  } catch {
    return {};
  }
}

/**
 * Ekrani projekta (`/<slug>/…` u hubu, `/…` na panel domenu kroz rewrite u
 * `proxy.ts`). Server proverava samo oblik adrese; članstvo proverava
 * `ProjekatProvider` (nije član ili ne postoji → „Projekat nije dostupan“).
 *
 * Režim daje proxy u `x-panel-rezim`; klijent ga ne može podmetnuti, jer ga
 * proxy uvek prepisuje. Čitanje `headers()` čini granu dinamičkom, pa nema
 * hydration mismatch-a zbog rewrite-a.
 */
export default async function ProjekatLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projekat: string }>;
}) {
  const { projekat } = await params;
  if (!jeIspravanSlug(projekat)) notFound();
  const h = await headers();
  const rezim = h.get("x-panel-rezim") === "panel" ? "panel" : "hub";
  // Odbrana: na panel domenu proxy pušta samo projekat tog domena.
  if (rezim === "panel" && h.get("x-panel-projekat") !== projekat) notFound();
  return (
    <ProjekatProvider slug={projekat} rezim={rezim}>
      <AppShell>{children}</AppShell>
    </ProjekatProvider>
  );
}
