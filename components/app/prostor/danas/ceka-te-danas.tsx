"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CekaIzvor } from "@/components/app/hub/ceka-izvor";
import type { CekaProjekta } from "@/lib/hub-zbir";
import { cekaTeDanas, izborProjekataCeka, type CekaTeDanas } from "@/lib/prostor/modeli/danas-model";

/** Isti pomeraj kao zvono i hub, da broj bude isti. */
const POMERAJ_MIN = -new Date().getTimezoneOffset();

/**
 * „Čeka te" iz svih projekata za Danas (plan S18 E4, E5): postojeći zbir
 * huba (`zbirCekanja`) nad prvih 20 projekata koji nisu arhivirani, po jedan
 * nevidljiv izvor (`CekaIzvor` → `notificationsStore.staMeCeka`) po
 * projektu. Novi proizvođač ne postoji: ovo je isti put kojim hub sabira.
 *
 * `izvori` se crtaju bilo gde na ekranu (ne prikazuju ništa); `blok` je
 * stanje bloka i broj za čip. Bez projekata nema nijednog projektnog upita.
 */
export function useCekaTeDanas(): { izvori: ReactNode; blok: CekaTeDanas } {
  const projekti = useQuery(api.projekti.mojiProjekti);
  const [ceka, setCeka] = useState<ReadonlyMap<string, CekaProjekta>>(new Map());
  const javi = useCallback((workspaceId: string, stanje: CekaProjekta) => {
    setCeka((pre) => {
      const sledeca = new Map(pre);
      sledeca.set(workspaceId, stanje);
      return sledeca;
    });
  }, []);

  const izabrani = useMemo(() => (projekti ? izborProjekataCeka(projekti).izabrani : []), [projekti]);
  const blok = useMemo(() => cekaTeDanas(projekti, ceka), [projekti, ceka]);
  const izvori = izabrani.map((projekat) => (
    <CekaIzvor
      key={projekat.workspaceId}
      workspaceId={projekat.workspaceId as Id<"workspaces">}
      pomerajMin={POMERAJ_MIN}
      onCeka={javi}
    />
  ));
  return { izvori, blok };
}
