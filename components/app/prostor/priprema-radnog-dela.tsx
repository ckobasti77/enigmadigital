"use client";

import { useEffect } from "react";
import { api } from "@/convex/_generated/api";
import { useProjekat, useProjekatMutation } from "@/components/app/projekat-provider";

/** Ključ u `sessionStorage`: projekat je u ovoj sesiji pregledača već pripremljen. */
const KLJUC = "enigma:prostor:pripremljen:";

/**
 * Podrazumevane oblasti i kanali poruka za projekat koji ih još nema
 * (SPAJANJE P26): projekti napravljeni pre spajanja dobijaju ih pri prvom
 * otvaranju, a poziv je idempotentan. Zove se jednom po projektu i sesiji
 * pregledača, tek kad je projekat potvrđen i uloga sme da menja radni deo
 * (vlasnik ili urednik; posmatrač radni deo nema, O5). Neuspeh je tih:
 * sledeći ulaz pokušava ponovo.
 */
export function PripremaRadnogDela() {
  const { spreman, workspaceId, uloga } = useProjekat();
  const pripremi = useProjekatMutation(api.prostor.projekat.pripremiRadniDeo);
  const sme = uloga === "owner" || uloga === "urednik";

  useEffect(() => {
    if (!spreman || !sme || workspaceId === null) return;
    const kljuc = `${KLJUC}${workspaceId}`;
    try {
      if (window.sessionStorage.getItem(kljuc) === "1") return;
    } catch {
      // bez skladišta: pokušaj svaki put (poziv je idempotentan)
    }
    let ziv = true;
    void pripremi().then(
      () => {
        if (!ziv) return;
        try {
          window.sessionStorage.setItem(kljuc, "1");
        } catch {
          // pamćenje je pogodnost, ne uslov
        }
      },
      () => {
        // tiho: sledeći ulaz u projekat pokušava ponovo
      },
    );
    return () => {
      ziv = false;
    };
  }, [spreman, sme, workspaceId, pripremi]);

  return null;
}
