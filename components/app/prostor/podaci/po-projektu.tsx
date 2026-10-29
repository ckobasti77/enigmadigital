"use client";

/**
 * ============================================================================
 * PROJEKTNE RADNJE NA EKRANIMA „JA“ (SPAJANJE S16, plan S07 D14)
 * ============================================================================
 *
 * Moji zadaci, Beleške i brzi unos rade nad stavkama iz VIŠE projekata
 * odjednom: red zadatka iz projekta A i red iz projekta B su u istoj listi, a
 * brzi unos bira odredište tek u dijalogu. Projektna funkcija (`tasks.
 * updateMetadata`, `pages.create`, `thoughts.convertToIdeas` …) traži
 * `workspaceId`, a jedini koji sme da ga pošalje je provider projekta.
 *
 * Zato se za svaki projekat crta po jedan `ProjekatStavkeProvider` sa malim
 * „prijavljivačem“ ispod njega: on uzme projektne kuke (`useProjekatMutation`
 * …, koje same ubacuju `workspaceId` TOG projekta) i prijavi ih u registar
 * kontejnera. Kontejner zatim za red bira radnje njegovog projekta. Nema
 * ručnog `workspaceId`-a ni novog izuzetka čuvara; članstvo i dalje proverava
 * omotač na serveru.
 *
 * Provider čita `projekti.mojiProjekti` (ista pretplata kao traka), pa
 * projekata može biti koliko i u traci (opseg 50) bez novih upita.
 */
import { useCallback, useLayoutEffect, useRef, type ReactNode } from "react";

import { ProjekatStavkeProvider } from "@/components/app/projekat-provider";
import type { Id } from "@/convex/_generated/dataModel";

export type RegistarPoProjektu<T> = {
  /** Radnje projekta, ili `undefined` dok se projekat ne prijavi. */
  uzmi: (workspaceId: string) => T | undefined;
  /** Za prijavljivač: `null` odjavljuje (projekat je nestao sa spiska). */
  prijavi: (workspaceId: Id<"workspaces">, radnje: T | null) => void;
};

/** Registar radnji po projektu; stabilan kroz rendere (ref). */
export function useRegistarPoProjektu<T>(): RegistarPoProjektu<T> {
  const mapa = useRef(new Map<string, T>());
  const uzmi = useCallback((workspaceId: string) => mapa.current.get(workspaceId), []);
  const prijavi = useCallback((workspaceId: Id<"workspaces">, radnje: T | null) => {
    if (radnje === null) mapa.current.delete(workspaceId);
    else mapa.current.set(workspaceId, radnje);
  }, []);
  return { uzmi, prijavi };
}

/**
 * Prijavi radnje projekta dok je prijavljivač montiran. Poziva se UNUTAR
 * `ProjekatStavkeProvider`-a (iz `PoProjektu`), sa radnjama napravljenim
 * projektnim kukama.
 */
export function usePrijaviRadnje<T>(
  registar: RegistarPoProjektu<T>,
  workspaceId: Id<"workspaces">,
  radnje: T,
): void {
  const { prijavi } = registar;
  useLayoutEffect(() => {
    prijavi(workspaceId, radnje);
    return () => prijavi(workspaceId, null);
  }, [prijavi, workspaceId, radnje]);
}

/** Po jedan `ProjekatStavkeProvider` za svaki projekat; `children` crta prijavljivač. */
export function PoProjektu({
  workspaceIds,
  children,
}: {
  workspaceIds: ReadonlyArray<Id<"workspaces">>;
  children: (workspaceId: Id<"workspaces">) => ReactNode;
}) {
  return (
    <>
      {workspaceIds.map((workspaceId) => (
        <ProjekatStavkeProvider key={workspaceId} workspaceId={workspaceId}>
          {children(workspaceId)}
        </ProjekatStavkeProvider>
      ))}
    </>
  );
}

/** Poruka kad projekat stavke još nije prijavljen (spisak projekata stiže). */
export const PROJEKAT_NIJE_SPREMAN = "Projekat još nije učitan. Pokušaj ponovo za trenutak.";
