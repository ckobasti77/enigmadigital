"use client";

import { Lock } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { useMoze, useProjekat } from "@/components/app/projekat-provider";
import { useDokumenti } from "@/components/app/prostor/dokumenti/dokumenti-kontekst";
import { useProstorNavigacija } from "@/components/app/prostor/use-prostor-navigacija";
import { WorkspaceErrorBoundary } from "@/components/app/prostor/zajednicko/granica-greske";
import { EmptyState } from "@/components/app/prostor/zajednicko/radni-ui";
import { MapaBeleski } from "./index";
import { MapaKostur } from "./mapa-kostur";

/**
 * ============================================================================
 * EKRAN MAPE BELEŠKI (SPAJANJE S14, plan S07 §1.1 i §7.2)
 * ============================================================================
 *
 * Klijentski kontejner rute `/<projekat>/beleske`: mapa beleški projekta.
 * Devotion je ovo radio u ljusci (`workspace-shell.tsx`, ruta `notes`):
 * projekat sa oblastima i profil daje `useDokumenti()`, a mapa se učitava
 * dinamički (`MapaBeleski`). Posmatrač nema radni deo (O5).
 */
export function BeleskeEkran() {
  return (
    <div className="flex w-full flex-col gap-5 pb-16">
      <PageHeader
        variant="module"
        title="Beleške"
        description="Misli projekta na mapi. Dupli klik na prazno mesto dodaje novu."
      />
      <WorkspaceErrorBoundary title="Mapa beleški nije učitana." className="min-h-[20rem]">
        <BeleskeSadrzaj />
      </WorkspaceErrorBoundary>
    </div>
  );
}

function BeleskeSadrzaj() {
  const { uloga } = useProjekat();
  const sme = useMoze("urednik");
  const { projekat, profil } = useDokumenti();
  const { idi } = useProstorNavigacija();

  if (uloga !== null && !sme) {
    return (
      <EmptyState
        icon={Lock}
        headingAs="h2"
        title="Beleške nisu dostupne."
        description="Tvoja uloga u ovom projektu vidi samo brojeve."
      />
    );
  }
  if (!projekat || !profil) return <MapaKostur label="Učitavam mapu beleški" />;
  // Visina kao Mapa oblasti i ideja: xyflow traži roditelja sa visinom.
  return (
    <div className="h-[min(72vh,52rem)] min-h-[32rem]">
      <MapaBeleski
        key={projekat._id}
        workspace={projekat}
        profile={profil}
        onOpenPage={(pageId) => idi({ kind: "page", pageId })}
        onOpenIdeas={() => idi({ kind: "ideas" })}
      />
    </div>
  );
}
