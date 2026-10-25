import type { ReactNode } from "react";
import { ProjekatZnak } from "@/components/app/projekat-znak";
import { stilProjekta } from "@/lib/boja-projekta";

/** Javni brend panel domena (`projekti.javniBrend`): samo ime, boja i logo. */
export type BrendPrijave = {
  ime: string;
  boja: string | null;
  logoUrl: string | null;
};

/**
 * ============================================================================
 * BREND TRENUTAK — ekrani van ljuske: prijava i pozivnica (UI Boost §8)
 * ============================================================================
 *
 * Jedino mesto u aplikaciji gde ime proizvoda stoji u `text-display`. Iza je
 * aurora u brend cijanu, do 10 % i bez animacije — ista dozvola za gradijent
 * kao na vrhu svake strane. Ekran je van ljuske, pa `data-module` postavlja sam
 * (boja Kontrolne table): svaka ruta nosi modul, i ova.
 *
 * Na panel domenu (`brend`) umesto imena proizvoda stoji znak i ime projekta
 * tog domena, a aurora prelazi u boju projekta: prijava je jedno od četiri
 * mesta pete uloge boje (identitet, `CLAUDE.md`).
 *
 * Ime je `<p>`, ne naslov: H1 ekrana je naslov koraka u kartici ispod
 * („Prijava", „Nova lozinka"), jer on kaže šta se ovde radi.
 */
export function BrandMoment({
  children,
  brend = null,
}: {
  children: ReactNode;
  brend?: BrendPrijave | null;
}) {
  return (
    <main
      data-module="tabla"
      {...(brend ? { "data-projekat": "", style: stilProjekta(brend.boja) } : {})}
      className="relative isolate flex min-h-svh flex-1 flex-col items-center justify-center gap-8 overflow-hidden px-[var(--gutter)] py-16">
      <div
        aria-hidden
        className={
          brend
            ? "pointer-events-none absolute inset-x-0 top-0 -z-10 h-[32rem] bg-[radial-gradient(60%_100%_at_50%_0%,color-mix(in_oklch,var(--projekat)_10%,transparent),transparent_72%)]"
            : "pointer-events-none absolute inset-x-0 top-0 -z-10 h-[32rem] bg-[radial-gradient(60%_100%_at_50%_0%,color-mix(in_oklch,var(--mod)_10%,transparent),transparent_72%)]"
        }
      />
      {brend ? (
        <div className="flex flex-col items-center gap-4 text-center">
          <ProjekatZnak projekat={brend} velicina="lg" />
          <p className="text-display text-foreground">{brend.ime}</p>
        </div>
      ) : (
        <div className="text-center">
          <p className="text-display text-foreground">Enigma</p>
          <p className="heading-caps mt-2 text-meta font-medium text-mod">
            Command Center
          </p>
        </div>
      )}
      {children}
    </main>
  );
}
