"use client";

import { useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Lock } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { useMoze, useProjekat } from "@/components/app/projekat-provider";
import { useDokumenti } from "@/components/app/prostor/dokumenti/dokumenti-kontekst";
import { useProstorNavigacija } from "@/components/app/prostor/use-prostor-navigacija";
import { WorkspaceErrorBoundary } from "@/components/app/prostor/zajednicko/granica-greske";
import { EmptyState } from "@/components/app/prostor/zajednicko/radni-ui";
import { useToday } from "@/components/app/prostor/zajednicko/use-danas";
import type { Id } from "@/convex/_generated/dataModel";
import { jeOblikId } from "@/lib/prostor/web/oblik-id";
import { TaskSectionsSkeleton, TasksView, type TasksFilterValue } from "./tasks-view";

/**
 * ============================================================================
 * EKRAN ZADATAKA TIMA (SPAJANJE S12, plan S07 §1.1)
 * ============================================================================
 *
 * Klijentski kontejner rute `/zadaci` (`?filter=moji` | `?osoba=<profileId>`).
 * Devotion je ovo radio u ljusci (`workspace-shell.tsx`): projekat sa
 * oblastima i profil daje `useDokumenti()` (ista pretplata kao meni projekta),
 * filter čita adresa, a promena filtera menja adresu bez novog unosa u
 * istoriji. Novi zadatak otvara deljeni dijalog „Nova stranica“ sa vrstom
 * zadatak, a „Puni prikaz“ vodi na `/stranica/<id>`.
 */
export function ZadaciEkran() {
  return (
    <WorkspaceErrorBoundary title="Zadaci nisu učitani." className="min-h-[20rem]">
      <ZadaciSadrzaj />
    </WorkspaceErrorBoundary>
  );
}

/** Filter iz adrese: osoba ima prednost, pa „moji“, inače „svi“. */
function filterIzAdrese(osoba: string | null, filter: string | null): TasksFilterValue {
  if (osoba && jeOblikId(osoba)) return osoba as Id<"profiles">;
  return filter === "moji" ? "moji" : "svi";
}

function ZadaciSadrzaj() {
  const { uloga } = useProjekat();
  const sme = useMoze("urednik");
  const { projekat, profil, otvoriNovuStranicu } = useDokumenti();
  const parametri = useSearchParams();
  const { idi } = useProstorNavigacija();
  const today = useToday();
  const filter = filterIzAdrese(parametri.get("osoba"), parametri.get("filter"));

  const promeniFilter = useCallback(
    (next: TasksFilterValue) => {
      const ruta =
        next === "svi"
          ? ({ kind: "tasks" } as const)
          : next === "moji"
            ? ({ kind: "tasks", filter: "moji" } as const)
            : ({ kind: "tasks", profileId: next } as const);
      idi(ruta, { zameni: true });
    },
    [idi],
  );
  // Panel zadatka: ime i znak projekta, nazivi oblasti (tekući projekat).
  const projekti = useMemo(
    () =>
      projekat
        ? [
            {
              _id: projekat._id,
              name: projekat.name,
              logoUrl: projekat.logoUrl,
              areas: projekat.areas.map((area) => ({ _id: area._id, label: area.label })),
            },
          ]
        : [],
    [projekat],
  );

  if (uloga !== null && !sme) {
    return (
      <div className="flex w-full flex-col gap-6">
        <PageHeader variant="module" title="Zadaci" />
        <EmptyState
          icon={Lock}
          headingAs="h2"
          title="Zadaci nisu dostupni."
          description="Tvoja uloga u ovom projektu vidi samo brojeve."
        />
      </div>
    );
  }
  if (!projekat || !profil) return <TaskSectionsSkeleton />;
  return (
    <TasksView
      key={projekat._id}
      workspace={projekat}
      profile={profil}
      today={today}
      workspaces={projekti}
      filter={filter}
      onFilterChange={promeniFilter}
      onOpenPage={(pageId) => idi({ kind: "page", pageId })}
      onOpenFull={(pageId) => idi({ kind: "page", pageId })}
      onCreateTask={() => otvoriNovuStranicu({ initialKind: "task" })}
    />
  );
}
