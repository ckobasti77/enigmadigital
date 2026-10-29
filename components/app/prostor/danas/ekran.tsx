"use client";

import { useCallback } from "react";
import { useQuery } from "convex/react";
import { Sun } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { useBrziUnos } from "@/components/app/prostor/ja/brzi-unos/brzi-unos";
import { useMojiProjektiRadnogDela } from "@/components/app/prostor/ja/moji-projekti";
import { useProstorNavigacija } from "@/components/app/prostor/use-prostor-navigacija";
import { WorkspaceErrorBoundary } from "@/components/app/prostor/zajednicko/granica-greske";
import { EmptyState } from "@/components/app/prostor/zajednicko/radni-ui";
import { useToday } from "@/components/app/prostor/zajednicko/use-danas";
import { useCekaTeDanas } from "@/components/app/prostor/danas/ceka-te-danas";
import { MyDayContainer } from "@/components/app/prostor/danas/my-day-container";
import { MyDaySkeleton } from "@/components/app/prostor/danas/my-day-skeleton";
import { useStanjeNapretka } from "@/components/app/prostor/danas/napredak-kartica";
import { firstNameOf } from "@/lib/prostor/modeli/my-day-model";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * ============================================================================
 * DANAS (`/`, O7, P17; SPAJANJE S19, plan S18 §1)
 * ============================================================================
 *
 * Prvi ekran posle prijave: Moj dan (plan dana, „Isplaniraj", prenos
 * nezavršenog, sekcije, završeno danas) + „Čeka te" iz svih projekata +
 * tiha kartica napretka (niz, nedeljni ciljevi, misije) + kratko Inbox,
 * poruke i ideje za glasanje. Jedina primarna radnja je „Brzi unos".
 *
 * Projekti u kojima sam posmatrač daju samo Enigmine stavke „Čeka te"
 * (kao hub i zvono „Ja"): Moj dan, Inbox, Poruke i Ideje ih isključuju na
 * serveru, a panel zadatka i radnje reda dobijaju samo projekte radnog dela
 * (`useMojiProjektiRadnogDela`), pa nijedan projektni upit radnog dela ne
 * ide sa ID-jem takvog projekta (plan S18 E6).
 */
export function DanasEkran() {
  return (
    <WorkspaceErrorBoundary title="Danas nije učitan." className="min-h-[20rem]">
      <DanasSadrzaj />
    </WorkspaceErrorBoundary>
  );
}

function DanasSadrzaj() {
  const today = useToday();
  const profil = useQuery(api.prostor.profiles.getCurrent);
  const projekti = useMojiProjektiRadnogDela();
  const brziUnos = useBrziUnos();
  const { idi } = useProstorNavigacija();
  const cekaTe = useCekaTeDanas();
  const napredak = useStanjeNapretka();

  const otvoriBrziUnos = useCallback(() => brziUnos?.({ vrsta: "task" }), [brziUnos]);
  const uZadatak = useCallback(
    (workspaceId: Id<"workspaces">, pageId: Id<"pages">) => idi({ kind: "page", pageId }, { projekat: workspaceId }),
    [idi],
  );
  const uIdeju = useCallback(
    (workspaceId: Id<"workspaces">, ideaId: Id<"ideaNodes">) => idi({ kind: "ideas", ideaId }, { projekat: workspaceId }),
    [idi],
  );
  const mojiZadaci = useCallback(() => idi({ kind: "me-tasks" }), [idi]);
  const inbox = useCallback(() => idi({ kind: "me-inbox" }), [idi]);
  const poruke = useCallback(() => idi({ kind: "me-chat" }), [idi]);

  if (profil === undefined || projekti === undefined) {
    return (
      <div className="flex w-full flex-col gap-5">
        {cekaTe.izvori}
        <PageHeader variant="module" title="Danas" icon={Sun} />
        <MyDaySkeleton />
      </div>
    );
  }
  if (profil === null) {
    return (
      <div className="flex w-full flex-col gap-5">
        <PageHeader variant="module" title="Danas" icon={Sun} />
        <EmptyState
          icon={Sun}
          headingAs="h2"
          title="Dan još nije spreman."
          description="Profil tima se pravi pri prvom ulasku. Osveži stranicu."
        />
      </div>
    );
  }
  return (
    <>
      {cekaTe.izvori}
      <MyDayContainer
        today={today}
        firstName={firstNameOf(profil.displayName)}
        profileId={profil._id}
        workspaces={projekti}
        onOpenTask={uZadatak}
        onOpenTasks={mojiZadaci}
        onQuickAdd={otvoriBrziUnos}
        onOpenInbox={inbox}
        onOpenChat={poruke}
        onOpenIdea={uIdeju}
        cekaTe={cekaTe.blok}
        napredak={napredak}
      />
    </>
  );
}
