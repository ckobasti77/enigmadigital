"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";

import { useQueryTolerant } from "@/components/app/prostor/podaci/ja";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/** Projekat radnog dela na ekranima „Ja“: ime, znak, boja i oblasti. */
export type MojProjekat = {
  _id: Id<"workspaces">;
  name: string;
  logoUrl: string | null;
  /** `workspaces.brend.boja` (identitet projekta, CLAUDE.md uloga 6). */
  boja: string | null;
  areas: ReadonlyArray<{ _id: Id<"areas">; key: string; label: string }>;
};

/** Opseg „moji projekti“ (P28). */
const OPSEG = 50;
const PRVA_STRANA = { numItems: OPSEG, cursor: null };

/**
 * Moji projekti sa oblastima za Moje zadatke, Beleške i brzi unos (zamena za
 * Devotion `startups.listForCurrent` iz ljuske): bez `client_viewer`-a i bez
 * arhiviranih, najnovije članstvo prvo, do 50. Boja dolazi iz
 * `projekti.mojiProjekti` (ista pretplata kao traka), da znak projekta ima
 * istu boju svuda.
 *
 * Tolerantno: greška upita daje `undefined` (kao učitavanje), pa brzi unos u
 * ljusci ne obara ekran.
 */
export function useMojiProjektiRadnogDela(): ReadonlyArray<MojProjekat> | undefined {
  const strana = useQueryTolerant(api.prostor.projekat.listForCurrent, { paginationOpts: PRVA_STRANA });
  const traka = useQuery(api.projekti.mojiProjekti);
  return useMemo(() => {
    if (strana === undefined) return undefined;
    const boje = new Map((traka ?? []).map((p) => [p.workspaceId as string, p.boja] as const));
    return strana.page.map((p) => ({
      _id: p._id,
      name: p.name,
      logoUrl: p.logoUrl,
      boja: boje.get(p._id) ?? null,
      areas: p.areas.map((area) => ({ _id: area._id, key: area.key, label: area.label })),
    }));
  }, [strana, traka]);
}
