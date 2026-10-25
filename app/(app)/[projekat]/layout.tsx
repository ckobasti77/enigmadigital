import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { ProjekatProvider } from "@/components/app/projekat-provider";
import { jeIspravanSlug } from "@/lib/rutiranje";

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
