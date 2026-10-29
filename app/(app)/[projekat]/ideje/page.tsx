import { Suspense } from "react";
import { IdejeEkran } from "@/components/app/prostor/ideje/ekrani";

export const metadata = {
  // Ime projekta dodaje šablon iz layout-a `[projekat]`.
  title: "Ideje",
};

/**
 * Ideje projekta (SPAJANJE P13): `?ideja=<ideaId>` otvara detalj.
 * Adresu čita klijent (`useSearchParams`), zato Suspense.
 */
export default function Page() {
  return (
    <Suspense>
      <IdejeEkran />
    </Suspense>
  );
}
