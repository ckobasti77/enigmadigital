"use client";

import { useCallback, useMemo } from "react";
import { useProjekatQuery } from "@/components/app/projekat-provider";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { LeadScore } from "@/convex/lib/leadScoring";
import { axisPct } from "./lead-columns";
import type { LeadRowItem } from "./lead-urgency";

/**
 * ============================================================================
 * „ZOVI SADA" — jedan izvor za traku na „Danas" i za Režim poziva (B6)
 * ============================================================================
 *
 * Kriterijum (plan O1): ima telefon, procena „čiji je broj" ≥ 40 %, nikad
 * dodirnut, Fit ≥ prosek kandidata. Traka „Zovi sada" pokazuje prvih pet, a
 * Režim poziva prolazi kroz isti spisak redom — zato ga oba čitaju odavde, pa
 * ne mogu da se raziđu oko toga koja firma je sledeća.
 *
 * Sve ide kroz POSTOJEĆE upite, sa istim argumentima kao pre B6 (Convex
 * klijent deduplikuje pretplatu po argumentima).
 */

/** Koliko kandidata se čita po traci (ocene: granica 100 po upitu). */
export const KANDIDATA = 50;

export type ZoviKandidat = {
  item: LeadRowItem;
  /** Fit u procentima; `null` kad se ne može izmeriti (bez pravila / signala). */
  fit: number | null;
};

export type ZoviSada = {
  /** Svi koji prolaze kriterijum, najjači Fit prvi. */
  kandidati: ZoviKandidat[];
  /** Prosečan Fit merljivih kandidata; `null` kad nijedan nije merljiv. */
  prosek: number | null;
  /** Koliko firmi u tabeli ima telefon ≥ 40 % i nije dodirnuto (bez Fit uslova). */
  ukupno: number;
  /** Ocene su stigle — dok nisu, redosled još nije konačan. */
  ocenjeno: boolean;
};

/** `null` dok spisak nije stigao. */
export function useZoviSada(): ZoviSada | null {
  const data = useProjekatQuery(api.leadFiltersStore.listLeadsFiltered, {
    tel: 40,
    dodir: ["nikad"],
    strana: 1,
    poStrani: KANDIDATA,
  });

  const items = useMemo(() => (data?.items ?? []) as LeadRowItem[], [data]);
  const ids = useMemo(
    () =>
      items
        .map((i) => i.company?._id)
        .filter((id): id is Id<"leadCompanies"> => Boolean(id)),
    [items],
  );
  const scores = useProjekatQuery(
    api.leadScoringStore.scoreCompanies,
    ids.length > 0 ? { companyIds: ids } : "skip",
  ) as Record<string, LeadScore> | undefined;

  return useMemo(() => {
    if (!data) return null;
    const saOcenom: ZoviKandidat[] = items.map((item) => ({
      item,
      fit: item.company ? axisPct(scores?.[item.company._id]?.fit) : null,
    }));
    const merljivi = saOcenom.filter(
      (x): x is { item: LeadRowItem; fit: number } => x.fit !== null,
    );
    const prosek =
      merljivi.length > 0
        ? Math.round(merljivi.reduce((s, x) => s + x.fit, 0) / merljivi.length)
        : null;
    // Bez ijedne merljive ocene (npr. još nema pravila) Fit ne filtrira —
    // ostala tri kriterijuma i dalje važe, i to se ispisuje.
    const kandidati = (
      prosek === null ? saOcenom : merljivi.filter((x) => x.fit >= prosek)
    ).sort((a, b) => (b.fit ?? -1) - (a.fit ?? -1));
    return {
      kandidati,
      prosek,
      ukupno: data.ukupno,
      ocenjeno: scores !== undefined || ids.length === 0,
    };
  }, [data, items, scores, ids.length]);
}

/** Naziv niše firme, ili `null` — za red konteksta i boju monograma. */
export function useNisaZa(): (company: Doc<"leadCompanies"> | null) => string | null {
  const niches = useProjekatQuery(api.nichesStore.listNiches);
  const poId = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of niches ?? []) m.set(String(n._id), n.naziv);
    return m;
  }, [niches]);
  return useCallback(
    (company) =>
      company?.nicheId ? (poId.get(String(company.nicheId)) ?? null) : null,
    [poId],
  );
}
