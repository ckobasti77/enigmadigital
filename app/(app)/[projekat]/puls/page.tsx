import { Suspense } from "react";
import { PulsEkran } from "@/components/app/prostor/pocetna/puls-ekran";

export const metadata = {
  // Ime projekta dodaje šablon iz layout-a `[projekat]`.
  title: "Puls tima",
};

/**
 * Puls tima (SPAJANJE P13, S20): `?nedelja=<ms>` bira nedelju.
 * Nedelju čita klijent (`useSearchParams`), zato Suspense.
 */
export default function Page() {
  return (
    <Suspense>
      <PulsEkran />
    </Suspense>
  );
}
