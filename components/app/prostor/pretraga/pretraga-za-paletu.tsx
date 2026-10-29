"use client";

/**
 * Pretraga sadržaja za ⌘K (SPAJANJE S24, P20; Devotion `search-dialog.tsx`).
 *
 * Isti obrazac kao `ProjektiZaPaletu` i `ZadaciZaPaletu`: dete bez izgleda
 * zove upite i javlja rezultat paleti, a paleta ga drži iza granice greške,
 * pa pad pretrage ne obara paletu (Devotion `SearchResultsBoundary`).
 *
 * - U projektu: Stranice i Zadaci (`search.pages` za tekući projekat), Ideje
 *   i Beleške (`search.ideasAndThoughts`), Poruke (`chat.searchMessages`) i,
 *   kad je modul uključen, Firme iz Leadova po imenu (`listLeadsFiltered`).
 * - U „Ja“: samo lični razgovori (`chat.searchMessages`, `workspaceId: null`).
 *
 * Nikad kroz sve projekte (Devotion P21).
 */
import { useEffect } from "react";
import { useQuery } from "convex/react";

import { useProjekatOpciono, useProjekatQuery } from "@/components/app/projekat-provider";
import { api } from "@/convex/_generated/api";
import {
  PRETRAGA_FIRME,
  PRETRAGA_LIMIT,
  grupisiPogotke,
  type GrupaPogodaka,
} from "@/lib/prostor/web/pretraga-palete";

export type RezultatPretrage = {
  termin: string;
  grupe: GrupaPogodaka[];
  /** Bar jedan upit još nije odgovorio. */
  ucitava: boolean;
};

type Javi = (rezultat: RezultatPretrage | null) => void;

/** Pretraga u projektu. `radniDeo` = uloga vidi radni deo (bez posmatrača). */
export function PretragaProjektaZaPaletu({
  termin,
  radniDeo,
  leadovi,
  onRezultat,
}: {
  termin: string;
  radniDeo: boolean;
  leadovi: boolean;
  onRezultat: Javi;
}) {
  const workspaceId = useProjekatOpciono()?.workspaceId ?? null;
  const prostor = radniDeo && workspaceId !== null;
  const stranice = useQuery(
    api.prostor.search.pages,
    prostor ? { query: termin, workspaceId, limit: PRETRAGA_LIMIT } : "skip",
  );
  const cvorovi = useProjekatQuery(
    api.prostor.search.ideasAndThoughts,
    prostor ? { query: termin, limit: PRETRAGA_LIMIT } : "skip",
  );
  const poruke = useQuery(
    api.prostor.chat.searchMessages,
    prostor ? { workspaceId, term: termin } : "skip",
  );
  const firme = useProjekatQuery(
    api.leadFiltersStore.listLeadsFiltered,
    leadovi ? { q: termin, poStrani: PRETRAGA_FIRME } : "skip",
  );

  const ucitava =
    (prostor && (stranice === undefined || cvorovi === undefined || poruke === undefined)) ||
    (leadovi && firme === undefined);

  useEffect(() => {
    onRezultat({
      termin,
      ucitava,
      grupe: grupisiPogotke({ stranice, cvorovi, poruke, firme: firme?.items }, "projekat"),
    });
  }, [termin, ucitava, stranice, cvorovi, poruke, firme, onRezultat]);
  useEffect(() => () => onRezultat(null), [onRezultat]);
  return null;
}

/** Pretraga u „Ja“: lični razgovori, jedan upit. */
export function PretragaJaZaPaletu({ termin, onRezultat }: { termin: string; onRezultat: Javi }) {
  const poruke = useQuery(api.prostor.chat.searchMessages, { workspaceId: null, term: termin });
  useEffect(() => {
    onRezultat({
      termin,
      ucitava: poruke === undefined,
      grupe: grupisiPogotke({ poruke }, "ja"),
    });
  }, [termin, poruke, onRezultat]);
  useEffect(() => () => onRezultat(null), [onRezultat]);
  return null;
}

/** Zamena kad pretraga padne: javi paleti da kaže da ne radi. */
export function GreskaPretrage({ onGreska }: { onGreska: () => void }) {
  useEffect(() => {
    onGreska();
  }, [onGreska]);
  return null;
}
