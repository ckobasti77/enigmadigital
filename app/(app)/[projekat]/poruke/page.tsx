import { Suspense } from "react";
import { PorukeProjektaEkran } from "@/components/app/prostor/poruke/ekrani";

export const metadata = {
  // Ime projekta dodaje šablon iz layout-a `[projekat]`.
  title: "Poruke",
};

/**
 * Poruke projekta (SPAJANJE P13): kanali oblasti, diskusije i direktne
 * poruke tima. Izabran razgovor je `?kanal=<id>`; čita ga klijent
 * (`useSearchParams`), zato Suspense.
 */
export default function Page() {
  return (
    <Suspense>
      <PorukeProjektaEkran />
    </Suspense>
  );
}
