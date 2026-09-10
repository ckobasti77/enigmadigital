"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { useWorkspace } from "./workspace-provider";

/**
 * ============================================================================
 * „ŠTA ME ČEKA" — JEDAN HOOK ZA SVE POVRŠINE (A2, plan §2 N)
 * ============================================================================
 *
 * Zvono u zaglavlju, bedževi u bočnoj navigaciji i blok „Danas" na Kontrolnoj
 * tabli čitaju ISTI upit sa ISTIM argumentima. To nije samo urednost: Convex
 * klijent deduplikuje pretplatu po (funkcija, argumenti), pa tri površine na
 * ekranu koštaju koliko i jedna — ali samo ako im je i `pomerajMin` isti.
 * Zato ga niko ne računa sam, nego ga uzima odavde.
 */

export type StaMeCeka = FunctionReturnType<
  typeof api.notificationsStore.staMeCeka
>;

export type Zadatak = StaMeCeka["zadaci"][number];

/**
 * Minuti koje treba dodati na UTC da bi se dobilo lokalno vreme (Beograd leti
 * +120). Server je UTC, a „sastanak danas u 14:30" je lokalna tvrdnja.
 *
 * Računa se jednom po učitavanju strane: vrednost se menja samo pri prelasku
 * na letnje/zimsko vreme, a menjati je češće značilo bi menjati argumente
 * upita i razbiti deduplikaciju.
 */
const POMERAJ_MIN = -new Date().getTimezoneOffset();

/**
 * Broj posla po ključu zadatka — izvor za BEDŽ na jezičku ili u navigaciji
 * (A4 §2: „isti izvor kao zvono, ne računaj drugačije").
 *
 * Gleda i `sklonjeni`: „sakrio sam obaveštenje" znači da ga ne želim u zvonu,
 * ne da posao više ne postoji. Bedž na jezičku „Zaostali" koji nestane zato
 * što je neko utišao obaveštenje bio bi laž po pravilu „bez bedža = nema
 * posla".
 *
 * `undefined` = odgovor još nije stigao (bedž se tada ne crta, ne crta se
 * nula). `0` = zadatak ne postoji, jer se zadatak sa brojem 0 nikad ne pravi.
 */
export function brojPosla(
  staMeCeka: StaMeCeka | undefined,
  kljuc: string,
): number | undefined {
  if (staMeCeka === undefined) return undefined;
  const zadatak =
    staMeCeka.zadaci.find((z) => z.kljuc === kljuc) ??
    staMeCeka.sklonjeni.find((z) => z.kljuc === kljuc);
  return zadatak?.broj ?? 0;
}

/** `undefined` dok se ne zna radni prostor ili dok odgovor ne stigne. */
export function useStaMeCeka(): StaMeCeka | undefined {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id as Id<"workspaces"> | undefined;
  return useQuery(
    api.notificationsStore.staMeCeka,
    workspaceId ? { workspaceId, pomerajMin: POMERAJ_MIN } : "skip",
  );
}
