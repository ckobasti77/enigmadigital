"use client";

// Preneto iz Devotion apps/web/components/workspace/page/page-route-view.tsx (main @ c05c40f), SPAJANJE S10.
import { Component, useState, type ReactNode } from "react";
import { ListChecks, Map as MapIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { CreatePageTarget, StartupWithAreas } from "@/lib/prostor/rute";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { EmptyState } from "@/components/app/prostor/zajednicko/radni-ui";

import { PageDocumentSkeleton, PageRouteProblem } from "@/components/app/prostor/dokumenti/page-document";
import { PageDocumentView } from "@/components/app/prostor/dokumenti/page-document-view";
import { useProjekatQuery } from "@/components/app/projekat-provider";
import { useProjekatQueryResult } from "@/components/app/prostor/podaci/projekat";

export type PageRouteViewProps = {
  workspace: StartupWithAreas;
  profileId: Id<"profiles">;
  pageId: Id<"pages">;
  tab?: "mapa";
  now: number;
  autoFocusTitle?: boolean;
  onAutoFocusDone?: () => void;
  onOpenPage: (pageId: Id<"pages">) => void;
  onOpenArea: (areaId: Id<"areas">) => void;
  onOpenTrash: () => void;
  onCreateChild: (target: CreatePageTarget) => void;
  onArchived: (page: { areaId: Id<"areas">; parentPageId: Id<"pages"> | null }) => void;
};

/**
 * Ruta `/stranica/<id>` (PROSTOR K10, plan K07 §3): beleška, tabela i fajl su
 * dokument tima. Zadatak na celu stranu (`kind: "task"`) i Mapa stranice
 * (`?tab=mapa`) dolaze sa ekranima zadataka i mapa; dotle ruta kaže šta je
 * stranica i vodi na dokument. Sopstvena granica greške razlikuje obrisanu
 * stranicu (Korpa) od greške učitavanja („Pokušaj ponovo").
 */
export function PageRouteView(props: PageRouteViewProps) {
  const [attempt, setAttempt] = useState(0);
  return (
    <PageRouteBoundary
      key={`${props.pageId}:${attempt}`}
      fallback={
        <PageRouteFailure
          pageId={props.pageId}
          onRetry={() => setAttempt((value) => value + 1)}
          onOpenTrash={props.onOpenTrash}
        />
      }
    >
      <PageRouteLoader {...props} />
    </PageRouteBoundary>
  );
}

function PageRouteLoader({
  workspace,
  profileId,
  pageId,
  tab,
  now,
  autoFocusTitle,
  onAutoFocusDone,
  onOpenPage,
  onOpenArea,
  onCreateChild,
  onArchived,
}: PageRouteViewProps) {
  const page = useProjekatQuery(api.prostor.pages.get, { pageId });
  if (page === undefined) return <PageDocumentSkeleton />;
  const fallback = { areaId: page.areaId, parentPageId: page.parentPageId };

  if (page.kind === "task") {
    return (
      <EmptyState
        icon={ListChecks}
        headingAs="h2"
        title="Zadatak na celoj strani stiže uskoro."
        description={`„${page.title.trim() || "Bez naslova"}“ je zadatak; otvara se iz oblasti kad stigne ekran zadataka.`}
        action={
          <Button type="button" variant="outline" onClick={() => onOpenArea(page.areaId)}>
            Otvori oblast
          </Button>
        }
      />
    );
  }
  if (tab === "mapa") {
    return (
      <EmptyState
        icon={MapIcon}
        headingAs="h2"
        title="Mapa stranice stiže uskoro."
        action={
          <Button type="button" variant="outline" onClick={() => onOpenPage(pageId)}>
            Otvori stranicu
          </Button>
        }
      />
    );
  }
  return (
    <PageDocumentView
      workspace={workspace}
      profileId={profileId}
      page={page}
      now={now}
      autoFocusTitle={autoFocusTitle}
      onAutoFocusDone={onAutoFocusDone}
      onOpenPage={onOpenPage}
      onOpenArea={onOpenArea}
      onCreateChild={onCreateChild}
      onArchived={() => onArchived(fallback)}
    />
  );
}

/**
 * Pad `pages.get`: proizvodnja skriva poruku greške, pa se pita
 * `areasV2.resolveRoute` (ne baca) — stranica koje više nema (Korpa, obrisana
 * grana) dobija „Otvori Korpu", a ostalo „Pokušaj ponovo".
 */
function PageRouteFailure({
  pageId,
  onRetry,
  onOpenTrash,
}: {
  pageId: Id<"pages">;
  onRetry: () => void;
  onOpenTrash: () => void;
}) {
  const { data: resolved, failed } = useProjekatQueryResult(api.prostor.areasV2.resolveRoute, { pageId });
  if (resolved === undefined && !failed) return <PageDocumentSkeleton />;
  const missing = resolved === null || resolved?.kind === "area";
  return <PageRouteProblem missing={missing} onRetry={onRetry} onOpenTrash={onOpenTrash} />;
}

class PageRouteBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
