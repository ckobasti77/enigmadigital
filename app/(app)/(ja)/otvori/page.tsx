import { Suspense } from "react";
import { Otvori } from "@/components/app/prostor/otvori";

export const metadata = { title: "Otvaram… · Enigma Digital" };

/**
 * Link iz obaveštenja i push poruke (plan S07 D13):
 * `/otvori?projekat=<workspaceId>&vrsta=…&cilj=…`. Servis radnik zna ID
 * projekta, a ne njegovu adresu, pa adresu razrešava klijent iz mojih
 * projekata. `useSearchParams` traži granicu `Suspense`.
 */
export default function OtvoriPage() {
  return (
    <Suspense>
      <Otvori />
    </Suspense>
  );
}
