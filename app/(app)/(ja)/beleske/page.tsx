import { Suspense } from "react";
import { BeleskeJaEkran } from "@/components/app/prostor/ja/ekrani";

export const metadata = { title: "Beleške · Enigma Digital" };

/**
 * Lični nivo „Ja“ (SPAJANJE P13): moje beleške iz svih projekata i lične.
 * Mapa beleški projekta je `/<projekat>/beleske`.
 */
export default function Page() {
  return (
    <Suspense>
      <BeleskeJaEkran />
    </Suspense>
  );
}
