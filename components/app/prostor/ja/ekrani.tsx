"use client";

import { useCallback } from "react";
import { useQuery } from "convex/react";
import { CheckSquare2 } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { useBrziUnos } from "@/components/app/prostor/ja/brzi-unos/brzi-unos";
import { useMojiProjektiRadnogDela } from "@/components/app/prostor/ja/moji-projekti";
import { MyTasksContainer } from "@/components/app/prostor/ja/my-tasks-container";
import { MyTasksSkeleton } from "@/components/app/prostor/ja/my-tasks-skeleton";
import { NotesContainer } from "@/components/app/prostor/ja/notes-container";
import { NotesSkeleton } from "@/components/app/prostor/ja/notes-skeleton";
import { useProstorNavigacija } from "@/components/app/prostor/use-prostor-navigacija";
import { WorkspaceErrorBoundary } from "@/components/app/prostor/zajednicko/granica-greske";
import { EmptyState } from "@/components/app/prostor/zajednicko/radni-ui";
import { useToday } from "@/components/app/prostor/zajednicko/use-danas";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * ============================================================================
 * EKRANI „JA“: MOJI ZADACI I BELEŠKE (SPAJANJE S16, plan S07 §1.1, §10 S16)
 * ============================================================================
 *
 * `/moji-zadaci`: zadaci iz svih mojih projekata + lični (`tasks.
 * listEverywhere`, `personalTasks.list`), grupe, filteri, panel zadatka i
 * „Prebaci u projekat“ (panel ličnog zadatka iz S12).
 *
 * `/beleske`: moje misli iz svih projekata i lične (`thoughts.listMine`),
 * brza beleška, pretraga, izmena u mestu i „Pošalji u projekat“.
 *
 * Devotion je ovo crtao u ljusci (`workspace-shell.tsx`): projekte sa
 * oblastima daje `useMojiProjektiRadnogDela`, a navigacija u projekat ide kroz
 * `useProstorNavigacija` (slug iz `mojiProjekti`).
 */

// --- Moji zadaci --------------------------------------------------------------

export function MojiZadaciEkran() {
  return (
    <WorkspaceErrorBoundary title="Moji zadaci nisu učitani." className="min-h-[20rem]">
      <MojiZadaciSadrzaj />
    </WorkspaceErrorBoundary>
  );
}

function MojiZadaciSadrzaj() {
  const today = useToday();
  const profil = useQuery(api.prostor.profiles.getCurrent);
  const projekti = useMojiProjektiRadnogDela();
  const brziUnos = useBrziUnos();
  const { idi } = useProstorNavigacija();

  const otvoriBrziUnos = useCallback(() => brziUnos?.({ vrsta: "task" }), [brziUnos]);
  const uProjekat = useCallback(
    (workspaceId: Id<"workspaces">, pageId: Id<"pages">) => idi({ kind: "page", pageId }, { projekat: workspaceId }),
    [idi],
  );

  if (profil === undefined) {
    return (
      <div className="flex w-full flex-col gap-5">
        <PageHeader variant="module" title="Moji zadaci" description="Svi projekti i lično" />
        <MyTasksSkeleton />
      </div>
    );
  }
  if (profil === null) {
    return (
      <div className="flex w-full flex-col gap-5">
        <PageHeader variant="module" title="Moji zadaci" description="Svi projekti i lično" />
        <EmptyState
          icon={CheckSquare2}
          headingAs="h2"
          title="Zadaci još nisu spremni."
          description="Profil tima se pravi pri prvom ulasku. Osveži stranicu."
        />
      </div>
    );
  }
  return (
    <MyTasksContainer
      today={today}
      profileId={profil._id}
      workspaces={projekti}
      onQuickAdd={otvoriBrziUnos}
      onOpenInStartup={uProjekat}
    />
  );
}

// --- Beleške ------------------------------------------------------------------

export function BeleskeJaEkran() {
  return (
    <WorkspaceErrorBoundary title="Beleške nisu učitane." className="min-h-[20rem]">
      <BeleskeSadrzaj />
    </WorkspaceErrorBoundary>
  );
}

function BeleskeSadrzaj() {
  const today = useToday();
  const projekti = useMojiProjektiRadnogDela();
  const { idi } = useProstorNavigacija();

  const mapa = useCallback(
    (workspaceId: Id<"workspaces">) => idi({ kind: "thoughts" }, { projekat: workspaceId }),
    [idi],
  );
  const ideja = useCallback(
    (workspaceId: Id<"workspaces">, ideaId: Id<"ideaNodes">) =>
      idi({ kind: "ideas", ideaId }, { projekat: workspaceId }),
    [idi],
  );

  // Filter po projektu se proverava nad spiskom projekata, pa lista čeka spisak.
  if (projekti === undefined) {
    return (
      <div className="flex w-full flex-col gap-5">
        <PageHeader variant="module" title="Beleške" description="Moje misli iz svih projekata i lične." />
        <div className="mx-auto w-full max-w-3xl">
          <NotesSkeleton />
        </div>
      </div>
    );
  }
  return <NotesContainer today={today} workspaces={projekti} onOpenMap={mapa} onOpenIdea={ideja} />;
}
