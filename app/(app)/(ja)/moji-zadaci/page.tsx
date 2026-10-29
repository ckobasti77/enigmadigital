import { Suspense } from "react";
import { MojiZadaciEkran } from "@/components/app/prostor/ja/ekrani";

export const metadata = { title: "Moji zadaci · Enigma Digital" };

/**
 * Lični nivo „Ja“ (SPAJANJE P13): zadaci iz svih mojih projekata + lični.
 * Filteri žive na klijentu; Suspense čuva granicu za kuke rutera ispod.
 */
export default function Page() {
  return (
    <Suspense>
      <MojiZadaciEkran />
    </Suspense>
  );
}
