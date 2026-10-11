import type { ReactNode } from "react";

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
 * Ime je `<p>`, ne naslov: H1 ekrana je naslov koraka u kartici ispod
 * („Prijava", „Nova lozinka"), jer on kaže šta se ovde radi.
 */
export function BrandMoment({ children }: { children: ReactNode }) {
  return (
    <main
      data-module="tabla"
      className="relative isolate flex min-h-svh flex-1 flex-col items-center justify-center gap-8 overflow-hidden px-[var(--gutter)] py-16">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[32rem] bg-[radial-gradient(60%_100%_at_50%_0%,color-mix(in_oklch,var(--mod)_10%,transparent),transparent_72%)]"
      />
      <div className="text-center">
        <p className="text-display text-foreground">Enigma</p>
        <p className="heading-caps mt-2 text-meta font-medium text-mod">
          Command Center
        </p>
      </div>
      {children}
    </main>
  );
}
