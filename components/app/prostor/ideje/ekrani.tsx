"use client";

import { useSearchParams } from "next/navigation";
import { Lock } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { useMoze, useProjekat } from "@/components/app/projekat-provider";
import { useDokumenti } from "@/components/app/prostor/dokumenti/dokumenti-kontekst";
import { useProstorNavigacija } from "@/components/app/prostor/use-prostor-navigacija";
import { WorkspaceErrorBoundary } from "@/components/app/prostor/zajednicko/granica-greske";
import { EmptyState } from "@/components/app/prostor/zajednicko/radni-ui";
import { useToday } from "@/components/app/prostor/zajednicko/use-danas";
import { Skeleton } from "@/components/ui/skeleton";
import type { Id } from "@/convex/_generated/dataModel";
import { jeOblikId } from "@/lib/prostor/web/oblik-id";
import { IdeasView } from "./ideas-view";

/**
 * ============================================================================
 * EKRAN IDEJA (SPAJANJE S13, plan S07 §1.1)
 * ============================================================================
 *
 * Klijentski kontejner rute `/ideje` (`?ideja=<ideaId>` otvara detalj).
 * Devotion je ovo radio u ljusci (`workspace-shell.tsx`): projekat sa
 * oblastima i profil daje `useDokumenti()`, a otvaranje i zatvaranje detalja
 * menja adresu bez novog unosa u istoriji (kao Devotion `replace: true`).
 * „Postalo zadatak" i „Otvori" posle pretvaranja vode na `/stranica/<id>`.
 */
export function IdejeEkran() {
  return (
    <WorkspaceErrorBoundary title="Ideje nisu učitane." className="min-h-[20rem]">
      <IdejeSadrzaj />
    </WorkspaceErrorBoundary>
  );
}

function IdejeSadrzaj() {
  const { uloga } = useProjekat();
  const sme = useMoze("urednik");
  const { projekat, profil } = useDokumenti();
  const parametri = useSearchParams();
  const { idi } = useProstorNavigacija();
  const today = useToday();
  const ideja = parametri.get("ideja");
  const ideaId = ideja && jeOblikId(ideja) ? (ideja as Id<"ideaNodes">) : null;

  if (uloga !== null && !sme) {
    return (
      <div className="flex w-full flex-col gap-6">
        <PageHeader variant="module" title="Ideje" />
        <EmptyState
          icon={Lock}
          headingAs="h2"
          title="Ideje nisu dostupne."
          description="Tvoja uloga u ovom projektu vidi samo brojeve."
        />
      </div>
    );
  }
  if (!projekat || !profil) {
    return (
      <div role="status" aria-label="Učitavanje ideja" className="flex flex-col gap-5">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }
  return (
    <IdeasView
      key={projekat._id}
      workspace={projekat}
      profile={profil}
      today={today}
      ideaId={ideaId}
      onOpenIdea={(next) =>
        idi(next === null ? { kind: "ideas" } : { kind: "ideas", ideaId: next }, { zameni: true })
      }
      onOpenPage={(pageId) => idi({ kind: "page", pageId })}
      onOpenTrash={() => idi({ kind: "trash", segment: "idea" })}
    />
  );
}
