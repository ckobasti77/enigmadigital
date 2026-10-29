import { Suspense } from "react";
import { PorukeJaEkran } from "@/components/app/prostor/poruke/ekrani";

export const metadata = { title: "Poruke · Enigma Digital" };

/**
 * Lične poruke kroz sve moje projekte (SPAJANJE P13): lični DM, grupe i
 * kanali projekata. Izabran razgovor je `?kanal=<id>`; čita ga klijent
 * (`useSearchParams`), zato Suspense.
 */
export default function Page() {
  return (
    <Suspense>
      <PorukeJaEkran />
    </Suspense>
  );
}
