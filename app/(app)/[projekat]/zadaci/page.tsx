import { Suspense } from "react";
import { ZadaciEkran } from "@/components/app/prostor/zadaci/ekrani";

export const metadata = {
  // Ime projekta dodaje šablon iz layout-a `[projekat]`.
  title: "Zadaci",
};

/**
 * Zadaci tima (SPAJANJE P13): `?filter=moji` ili `?osoba=<profileId>`.
 * Filter čita klijent (`useSearchParams`), zato Suspense.
 */
export default function Page() {
  return (
    <Suspense>
      <ZadaciEkran />
    </Suspense>
  );
}
