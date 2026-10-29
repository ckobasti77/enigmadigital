"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { putanjaZaPrelazak } from "@/lib/rutiranje";
import { ekranZaPrelazak } from "./nav-items";
import { useEkranPutanja, useProjekatOpciono } from "./projekat-provider";

/**
 * ============================================================================
 * BIRAČ PROJEKTA — povučen (SPAJANJE P14, plan S07 D10)
 * ============================================================================
 *
 * Birač iz bočnog menija i zaglavlja na telefonu je zamenila traka projekata
 * (`traka-projekata.tsx`): spisak, „Svi projekti“, „Novi projekat“, tačka
 * stanja i prelazak koji čuva ekran (`putanjaZaPrelazak`) su sada tamo, a
 * pretraga projekata je u ⌘K. Ovde ostaje samo spisak projekata za paletu,
 * dok ga korak palete ne preseli.
 */

// ── ⌘K: projekti za „Prebaci na …“ ──────────────────────────────────────────

export type ProjekatZaPrelazak = {
  workspaceId: Id<"workspaces">;
  ime: string;
  boja: string | null;
  logoUrl: string | null;
  href: string;
};

/**
 * Projekti osim tekućeg, sa adresom istog ekrana u njima. Komandna paleta
 * ga montira samo dok je otvorena, u hubu, iza granice greške: pad spiska
 * ne sme da obori paletu. Van projekta (opseg „Ja“) adresa je početna
 * projekta, jer lični ekran nema parnjaka u projektu.
 */
export function ProjektiZaPaletu({
  onProjekti,
}: {
  onProjekti: (projekti: ProjekatZaPrelazak[]) => void;
}) {
  const projekti = useQuery(api.projekti.mojiProjekti);
  const tekuci = useProjekatOpciono()?.slug ?? null;
  const ekran = useEkranPutanja();
  const poslednji = useRef<string>("");

  useEffect(() => {
    if (projekti === undefined) return;
    const lista = projekti
      .filter((p) => p.slug !== tekuci && !p.arhiviran)
      .map((p) => ({
        workspaceId: p.workspaceId,
        ime: p.ime,
        boja: p.boja,
        logoUrl: p.logoUrl,
        href:
          tekuci === null
            ? `/${p.slug}`
            : putanjaZaPrelazak({
                ekran,
                cilj: { slug: p.slug, moduli: p.moduli },
                ekranZa: ekranZaPrelazak,
              }),
      }));
    const kljuc = JSON.stringify(lista);
    if (kljuc === poslednji.current) return;
    poslednji.current = kljuc;
    onProjekti(lista);
  }, [projekti, tekuci, ekran, onProjekti]);

  return null;
}
