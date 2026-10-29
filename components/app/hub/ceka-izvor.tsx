"use client";

import { useEffect } from "react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { CekaProjekta } from "@/lib/hub-zbir";
import { useQueryZaProjekat } from "../projekat-provider";
import { QuietBoundary } from "../quiet-boundary";

/**
 * ============================================================================
 * „ŠTA ME ČEKA“ JEDNOG PROJEKTA ZA ZBIR VAN PROJEKTA (hub, Danas)
 * ============================================================================
 *
 * Pretplata na zvono projekta (`notificationsStore.staMeCeka`) za projekat
 * kome ekran nije unutra, i javljanje njenog stanja roditelju koji sabira
 * (`zbirCekanja`). Izdvojeno iz reda huba (C16) da Danas (SPAJANJE S19) sabira
 * isti posao istim putem: jedan upit po projektu, članstvo proverava server,
 * pad jednog projekta ne obara zbir. Proizvođač posla se ovde ne menja.
 */

export type StaMeCekaProjekta = FunctionReturnType<typeof api.notificationsStore.staMeCeka>;

/** Pretplata + javljanje roditelju; vraća odgovor za prikaz (hub crta broj). */
export function useCekaProjekta(
  workspaceId: Id<"workspaces">,
  pomerajMin: number,
  onCeka: (workspaceId: string, stanje: CekaProjekta) => void,
): StaMeCekaProjekta | undefined {
  const staMeCeka = useQueryZaProjekat(workspaceId, api.notificationsStore.staMeCeka, {
    pomerajMin,
  });
  useEffect(() => {
    onCeka(
      workspaceId,
      staMeCeka === undefined
        ? { stanje: "ucitava" }
        : { stanje: "ok", ukupno: staMeCeka.ukupno, zadaci: staMeCeka.zadaci },
    );
  }, [workspaceId, staMeCeka, onCeka]);
  return staMeCeka;
}

/** Projekat čiji je upit pao javlja „greška“ (zbir ga stavlja u „Bez podataka“). */
export function CekaJaviGresku({
  workspaceId,
  onCeka,
}: {
  workspaceId: string;
  onCeka: (workspaceId: string, stanje: CekaProjekta) => void;
}) {
  useEffect(() => {
    onCeka(workspaceId, { stanje: "greska" });
  }, [workspaceId, onCeka]);
  return null;
}

function Pretplata({
  workspaceId,
  pomerajMin,
  onCeka,
}: {
  workspaceId: Id<"workspaces">;
  pomerajMin: number;
  onCeka: (workspaceId: string, stanje: CekaProjekta) => void;
}) {
  useCekaProjekta(workspaceId, pomerajMin, onCeka);
  return null;
}

/** Nevidljiv izvor jednog projekta, iza svoje granice greške (Danas). */
export function CekaIzvor({
  workspaceId,
  pomerajMin,
  onCeka,
}: {
  workspaceId: Id<"workspaces">;
  pomerajMin: number;
  onCeka: (workspaceId: string, stanje: CekaProjekta) => void;
}) {
  return (
    <QuietBoundary fallback={<CekaJaviGresku workspaceId={workspaceId} onCeka={onCeka} />}>
      <Pretplata workspaceId={workspaceId} pomerajMin={pomerajMin} onCeka={onCeka} />
    </QuietBoundary>
  );
}
