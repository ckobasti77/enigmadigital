"use client";

import { Suspense, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { useMoze, useProjekat, useProjekatHref } from "@/components/app/projekat-provider";
import { TrashContainer } from "@/components/app/prostor/korpa/trash-container";
import { TrashView } from "@/components/app/prostor/korpa/trash-view";
import { useProstorNavigacija } from "@/components/app/prostor/use-prostor-navigacija";
import { WorkspaceErrorBoundary } from "@/components/app/prostor/zajednicko/granica-greske";
import { EmptyState } from "@/components/app/prostor/zajednicko/radni-ui";
import { useToday } from "@/components/app/prostor/zajednicko/use-danas";
import { isTrashSegment, type TrashSegment } from "@/lib/prostor/rute";
import type { TrashOpenTarget } from "@/lib/prostor/modeli/trash-model";

/**
 * KORPA (`/[projekat]/korpa?vrsta=page|idea|file|recovered`, paritet red 25;
 * SPAJANJE S21): obrisane stranice, ideje i prilozi sa „Vrati“, pa
 * „Oporavljeno“ sa „Ukloni“. Posmatrač ne vidi radni deo: ako adresu otvori
 * ručno, dobija zaključano stanje bez upita.
 */
export function KorpaEkran() {
  return (
    <Suspense fallback={<TrashView segment="page" onSegmentChange={() => undefined} counts={undefined}>{null}</TrashView>}>
      <KorpaSadrzaj />
    </Suspense>
  );
}

function KorpaSadrzaj() {
  const { uloga, workspaceId } = useProjekat();
  const sme = useMoze("urednik");
  const router = useRouter();
  const ka = useProjekatHref();
  const parametri = useSearchParams();
  const { idi } = useProstorNavigacija();
  const today = useToday();

  const vrsta = parametri.get("vrsta");
  const segment: TrashSegment = isTrashSegment(vrsta) ? vrsta : "page";

  // Kartica menja samo svoj parametar (`?ux=1` i ostali ostaju); „Stranice“
  // su podrazumevane, pa im adresa ostaje bez `vrsta`.
  const promeniSegment = useCallback(
    (sledeci: TrashSegment) => {
      const p = new URLSearchParams(parametri.toString());
      if (sledeci === "page") p.delete("vrsta");
      else p.set("vrsta", sledeci);
      const upit = p.toString();
      router.replace(upit ? `${ka("/korpa")}?${upit}` : ka("/korpa"), { scroll: false });
    },
    [parametri, ka, router],
  );

  const otvori = useCallback(
    (cilj: TrashOpenTarget) => {
      if (cilj.kind === "ideas") idi({ kind: "ideas", ideaId: cilj.ideaId });
      else idi({ kind: "page", pageId: cilj.pageId });
    },
    [idi],
  );

  if (uloga !== null && !sme) {
    return (
      <div className="flex w-full flex-col gap-6">
        <PageHeader variant="module" title="Korpa" />
        <EmptyState
          icon={Lock}
          headingAs="h2"
          title="Korpa nije dostupna."
          description="Tvoja uloga u ovom projektu vidi samo brojeve."
        />
      </div>
    );
  }
  if (uloga === null) {
    return (
      <TrashView segment={segment} onSegmentChange={promeniSegment} counts={undefined}>
        {null}
      </TrashView>
    );
  }
  return (
    <WorkspaceErrorBoundary key={`korpa-${workspaceId}`} title="Korpa nije učitana." className="min-h-[20rem]">
      <TrashContainer segment={segment} onSegmentChange={promeniSegment} now={today.now} onOpen={otvori} />
    </WorkspaceErrorBoundary>
  );
}
