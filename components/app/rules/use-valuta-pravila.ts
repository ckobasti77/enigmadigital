"use client";

import { api } from "@/convex/_generated/api";
import { useProjekatQuery } from "@/components/app/projekat-provider";
import { jeDrugaValuta, normalizujValutu } from "@/lib/valuta";

/**
 * Valuta pravila: pravila rade nad Meta oglasima, pa je prag u valuti Meta
 * naloga. `valuta` postoji samo kad je jedna i poznata — nikad se ne
 * pretpostavlja evro (O16). `drugaValuta` je valuta za upozorenje kad neki
 * Meta nalog ne radi u evrima.
 */
export function useValutaPravila(): {
  valuta: string | undefined;
  drugaValuta: string | undefined;
} {
  const nalozi = useProjekatQuery(api.metaAdsStore.listAccounts);
  const valute = [
    ...new Set(
      (nalozi ?? [])
        .filter((n) => n.provider === "meta_ads")
        .map((n) => normalizujValutu(n.currency))
        .filter((c): c is string => c !== undefined),
    ),
  ];
  return {
    valuta: valute.length === 1 ? valute[0] : undefined,
    drugaValuta: valute.find((v) => jeDrugaValuta(v)),
  };
}
