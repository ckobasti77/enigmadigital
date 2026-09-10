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

/** `undefined` dok se ne zna radni prostor ili dok odgovor ne stigne. */
export function useStaMeCeka(): StaMeCeka | undefined {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id as Id<"workspaces"> | undefined;
  return useQuery(
    api.notificationsStore.staMeCeka,
    workspaceId ? { workspaceId, pomerajMin: POMERAJ_MIN } : "skip",
  );
}
