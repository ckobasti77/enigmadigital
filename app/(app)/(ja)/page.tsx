import { Suspense } from "react";
import { DanasEkran } from "@/components/app/prostor/danas/ekran";

export const metadata = { title: "Danas · Enigma Digital" };

/**
 * `/` je Danas iz svih projekata (SPAJANJE O7, P17; plan S18 §1): Moj dan,
 * Čeka te iz svih projekata, napredak i kratko Inbox i poruke. Hub „Svi
 * projekti“ je na `/projekti`. Suspense čuva granicu za kuke rutera ispod.
 */
export default function DanasPage() {
  return (
    <Suspense>
      <DanasEkran />
    </Suspense>
  );
}
