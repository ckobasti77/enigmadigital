"use client";

// Preneto iz Devotion apps/web/components/workspace/page/page-route-view.tsx (main @ c05c40f), SPAJANJE S10.
import { Component, useState, type ReactNode } from "react";
import type { CreatePageTarget, StartupWithAreas } from "@/lib/prostor/rute";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

import { PageDocumentSkeleton, PageRouteProblem } from "@/components/app/prostor/dokumenti/page-document";
import { PageDocumentView } from "@/components/app/prostor/dokumenti/page-document-view";
import { TaskPageView } from "@/components/app/prostor/zadaci/task-page-view";
import { MapaStranice } from "@/components/app/prostor/mape";
import type { Today } from "@/lib/prostor/web/danas";
import { useProjekatQuery } from "@/components/app/projekat-provider";
import { useProjekatQueryResult } from "@/components/app/prostor/podaci/projekat";

export type PageRouteViewProps = {
  workspace: StartupWithAreas;
  profileId: Id<"profiles">;
  pageId: Id<"pages">;
  tab?: "mapa";
  today: Today;
  autoFocusTitle?: boolean;
  onAutoFocusDone?: () => void;
  onOpenPage: (pageId: Id<"pages">) => void;
  onOpenArea: (areaId: Id<"areas">) => void;
  onOpenTrash: () => void;
  onCreateChild: (target: CreatePageTarget) => void;
  /** Mapa stranice (`?tab=mapa`) i povratak sa nje na dokument. */
  onOpenMap: (pageId: Id<"pages">) => void;
  onBackToPage: (pageId: Id<"pages">) => void;
  onArchived: (page: { areaId: Id<"areas">; parentPageId: Id<"pages"> | null }) => void;
};

/**
 * Ruta `/stranica/<id>` (PROSTOR K10, plan K07 §3): beleška, tabela i fajl su
 * dokument tima, a zadatak je zadatak na celu stranu (`TaskPageView`, S12).
 * Mapa stranice (`?tab=mapa`) je dinamički učitana mapa podstranica
 * (`MapaStranice`); zadatak nema mapu. Sopstvena granica greške razlikuje obrisanu
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
  today,
  autoFocusTitle,
  onAutoFocusDone,
  onOpenPage,
  onOpenArea,
  onCreateChild,
  onOpenMap,
  onBackToPage,
  onArchived,
}: PageRouteViewProps) {
  const page = useProjekatQuery(api.prostor.pages.get, { pageId });
  if (page === undefined) return <PageDocumentSkeleton />;
  const fallback = { areaId: page.areaId, parentPageId: page.parentPageId };

  if (page.kind === "task") {
    return (
      <TaskPageView
        workspace={workspace}
        profileId={profileId}
        page={page}
        today={today}
        autoFocusTitle={autoFocusTitle}
        onAutoFocusDone={onAutoFocusDone}
        onOpenPage={onOpenPage}
        onOpenArea={onOpenArea}
        onCreateChild={onCreateChild}
        onArchived={() => onArchived(fallback)}
      />
    );
  }
  if (tab === "mapa") {
    return (
      <MapaStranice
        workspace={workspace}
        page={page}
        onBackToPage={() => onBackToPage(pageId)}
        onOpenPage={onOpenPage}
        onCreateChild={onCreateChild}
      />
    );
  }
  return (
    <PageDocumentView
      workspace={workspace}
      profileId={profileId}
      page={page}
      now={today.now}
      autoFocusTitle={autoFocusTitle}
      onAutoFocusDone={onAutoFocusDone}
      onOpenPage={onOpenPage}
      onOpenArea={onOpenArea}
      onCreateChild={onCreateChild}
      onOpenMap={onOpenMap}
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
