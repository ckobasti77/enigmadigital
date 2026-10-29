"use client";

import { useEffect, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Blocks, FolderPlus, Lock } from "lucide-react";

import { ProjekatLink } from "@/components/app/projekat-link";
import { useMoze, useProjekat } from "@/components/app/projekat-provider";
import { useToday } from "@/components/app/prostor/zajednicko/use-danas";
import { WorkspaceErrorBoundary } from "@/components/app/prostor/zajednicko/granica-greske";
import { AREA_ICONS, EmptyState } from "@/components/app/prostor/zajednicko/radni-ui";
import { useProstorNavigacija } from "@/components/app/prostor/use-prostor-navigacija";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Id } from "@/convex/_generated/dataModel";
import { ekranRute, isAreaTab, pageArchiveFallbackRoute } from "@/lib/prostor/rute";
import type { AreaKey } from "@/lib/prostor/web/projekat";
import { AreaView } from "./area-view";
import { useDokumenti } from "./dokumenti-kontekst";
import { PageDocumentSkeleton } from "./page-document";
import { PageRouteView } from "./page-route-view";

/**
 * ============================================================================
 * EKRANI DOKUMENATA (SPAJANJE S10, plan S07 §1.1)
 * ============================================================================
 *
 * Klijentski kontejneri ruta `/dokumenti`, `/dokumenti/<oblast>` i
 * `/stranica/<id>`. Devotion je ovo radio u ljusci (`workspace-shell.tsx`):
 * projekat i profil daje `useDokumenti()`, adresu i karticu `?tab=` čita
 * ruter, a odlazak ide kroz `useProstorNavigacija` (čuvar napuštanja).
 */

/** Dok projekat ili uloga stižu; posmatrač radni deo nema. */
function RadniDeo({ children, skeleton }: { children: ReactNode; skeleton: ReactNode }) {
  const { uloga } = useProjekat();
  const sme = useMoze("urednik");
  const { projekat, profil } = useDokumenti();
  if (uloga !== null && !sme) {
    return (
      <EmptyState
        icon={Lock}
        headingAs="h2"
        title="Dokumenti nisu dostupni."
        description="Tvoja uloga u ovom projektu vidi samo brojeve."
      />
    );
  }
  if (projekat === undefined || !profil) return <>{skeleton}</>;
  return <>{children}</>;
}

function OblastSkeleton() {
  return (
    <div role="status" aria-label="Učitavam oblast" className="flex w-full flex-col gap-6">
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-40 rounded-md" />
          <Skeleton className="h-4 w-28 rounded-md" />
        </div>
      </div>
      <Skeleton className="h-9 w-72 rounded-md" />
      <Skeleton className="h-48 rounded-lg" />
    </div>
  );
}

// ── /dokumenti/<oblast> ─────────────────────────────────────────────────────

export function OblastEkran({ oblastId }: { oblastId: string }) {
  return (
    <WorkspaceErrorBoundary title="Oblast nije učitana." className="min-h-[24rem]">
      <RadniDeo skeleton={<OblastSkeleton />}>
        <OblastSadrzaj areaId={oblastId as Id<"areas">} />
      </RadniDeo>
    </WorkspaceErrorBoundary>
  );
}

function OblastSadrzaj({ areaId }: { areaId: Id<"areas"> }) {
  const { projekat, profil, otvoriNovuStranicu } = useDokumenti();
  const parametri = useSearchParams();
  const { idi } = useProstorNavigacija();
  const { now } = useToday();
  const tab = parametri.get("tab");
  if (!projekat || !profil) return null;
  return (
    <AreaView
      key={areaId}
      workspace={projekat}
      profileId={profil._id}
      areaId={areaId}
      tab={isAreaTab(tab) ? tab : undefined}
      now={now}
      onTabChange={(next) => idi({ kind: "area", areaId, tab: next }, { zameni: true })}
      onOpenPage={(pageId) => idi({ kind: "page", pageId })}
      onCreate={otvoriNovuStranicu}
    />
  );
}

// ── /stranica/<id> ──────────────────────────────────────────────────────────

export function StranicaEkran({ stranicaId }: { stranicaId: string }) {
  return (
    <WorkspaceErrorBoundary title="Stranica nije učitana." className="min-h-[24rem]">
      <RadniDeo skeleton={<PageDocumentSkeleton />}>
        <StranicaSadrzaj pageId={stranicaId as Id<"pages">} />
      </RadniDeo>
    </WorkspaceErrorBoundary>
  );
}

function StranicaSadrzaj({ pageId }: { pageId: Id<"pages"> }) {
  const { projekat, profil, otvoriNovuStranicu, novaStranicaId, zaboraviNovuStranicu } = useDokumenti();
  const parametri = useSearchParams();
  const { idi } = useProstorNavigacija();
  const today = useToday();
  if (!projekat || !profil) return null;
  return (
    <PageRouteView
      workspace={projekat}
      profileId={profil._id}
      pageId={pageId}
      tab={parametri.get("tab") === "mapa" ? "mapa" : undefined}
      today={today}
      autoFocusTitle={novaStranicaId === pageId}
      onAutoFocusDone={zaboraviNovuStranicu}
      onOpenPage={(id) => idi({ kind: "page", pageId: id })}
      onOpenArea={(areaId) => idi({ kind: "area", areaId })}
      onOpenTrash={() => idi({ kind: "trash" }, { zaobidjiCuvara: true })}
      onCreateChild={otvoriNovuStranicu}
      onOpenMap={(id) => idi({ kind: "page", pageId: id, tab: "mapa" })}
      onBackToPage={(id) => idi({ kind: "page", pageId: id }, { zameni: true })}
      onArchived={(page) =>
        idi(pageArchiveFallbackRoute(page), { zaobidjiCuvara: true, zameni: true })
      }
    />
  );
}

// ── /dokumenti ──────────────────────────────────────────────────────────────

/**
 * Spisak oblasti projekta. Sa jednom oblašću nema šta da se bira, pa ekran
 * odmah vodi na nju (bez novog unosa u istoriji).
 */
export function DokumentiEkran() {
  return (
    <WorkspaceErrorBoundary title="Dokumenti nisu učitani." className="min-h-[24rem]">
      <RadniDeo skeleton={<OblastSkeleton />}>
        <DokumentiSadrzaj />
      </RadniDeo>
    </WorkspaceErrorBoundary>
  );
}

function DokumentiSadrzaj() {
  const { projekat, otvoriNovuOblast } = useDokumenti();
  const { idi } = useProstorNavigacija();
  const oblasti = projekat?.areas ?? [];
  const jedina = oblasti.length === 1 ? oblasti[0]._id : null;
  useEffect(() => {
    if (jedina) idi({ kind: "area", areaId: jedina }, { zameni: true, zaobidjiCuvara: true });
  }, [idi, jedina]);

  return (
    <div className="flex w-full flex-col gap-6">
      <PageHeader
        variant="module"
        title="Dokumenti"
        description="Oblasti projekta sa stranicama tima."
        actions={
          <Button variant="primary" onClick={otvoriNovuOblast}>
            <FolderPlus aria-hidden="true" />
            Nova oblast
          </Button>
        }
      />
      {oblasti.length === 0 ? (
        <EmptyState icon={Blocks} headingAs="h2" title="Projekat još nema oblasti." />
      ) : (
        <ul className="divide-y divide-line-soft border-y border-line-soft" aria-label="Oblasti">
          {oblasti.map((oblast) => {
            const Icon = AREA_ICONS[oblast.key as AreaKey] ?? Blocks;
            return (
              <li key={oblast._id}>
                <ProjekatLink
                  href={ekranRute({ kind: "area", areaId: oblast._id })}
                  className="flex min-h-10 items-center gap-3 px-2 text-ui text-foreground transition-colors hover:bg-surface-control-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11"
                >
                  <Icon className="size-4 shrink-0 text-text-secondary" aria-hidden="true" />
                  <span className="truncate font-medium">{oblast.label}</span>
                </ProjekatLink>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
