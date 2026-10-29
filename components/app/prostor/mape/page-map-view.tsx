"use client";

// Preneto iz Devotion apps/web/components/workspace/page-workspace-view.tsx (main @ c05c40f), SPAJANJE S14.
import "./mapa-stil";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AreaCanvasView } from "@/components/app/prostor/mape/area-canvas-view";
import { WorkspaceErrorBoundary } from "@/components/app/prostor/zajednicko/granica-greske";
import { isEditableTarget } from "@/components/app/prostor/zajednicko/istorija-radnji";
import type { CreatePageTarget, StartupWithAreas } from "@/lib/prostor/rute";
import type { Id } from "@/convex/_generated/dataModel";
import type { PageKind } from "@/lib/prostor/web/vrste-stranica";
import { PAGE_MAP_HELP } from "@/lib/prostor/precice/registar";
import { usePrijaviPomoc } from "@/components/app/prostor/precice/precice-provider";

type CanvasFilter = "all" | PageKind;

/**
 * Mapa stranice (`/stranica/<id>?tab=mapa`): kanvas podstranica kao opcioni
 * prikaz. Dokument (uređivač, lista podstranica) je
 * `dokumenti/page-document-view.tsx`; ovde ostaje samo Mapa, zaglavlje
 * „Mapa · <naslov>" i „Nazad na stranicu". Kartice su `MapCard`.
 */
export function PageMapView({
  workspace,
  page,
  onBackToPage,
  onOpenPage,
  onCreateChild,
}: {
  workspace: StartupWithAreas;
  page: { _id: Id<"pages">; title: string; areaId: Id<"areas"> };
  onBackToPage: () => void;
  onOpenPage: (pageId: Id<"pages">) => void;
  onCreateChild: (target: CreatePageTarget) => void;
}) {
  const [filter, setFilter] = useState<CanvasFilter>("all");
  const area = useMemo(
    () => workspace.areas.find((item) => item._id === page.areaId),
    [page.areaId, workspace.areas],
  );
  const title = page.title.trim() || "Bez naslova";

  usePrijaviPomoc(PAGE_MAP_HELP);
  // Esc = nazad na stranicu. Ugovor kao ranije: ko potroši Escape (Base UI
  // slojevi, kanvas sa selekcijom) pozove preventDefault pre window bubble faze;
  // React Flow ne zove preventDefault za svoje čvorove i ivice.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.repeat || event.defaultPrevented) return;
      if (isEditableTarget(event.target)) return;
      if (
        event.target instanceof Element &&
        event.target.closest(".react-flow__node, .react-flow__edge") !== null
      ) {
        return;
      }
      onBackToPage();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onBackToPage]);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-8 pt-4 sm:px-6 lg:px-8 lg:pt-6">
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2"
          onClick={onBackToPage}
          aria-keyshortcuts="Escape"
        >
          <ArrowLeft aria-hidden="true" />
          Nazad na stranicu
        </Button>
        <h1 className="min-w-0 truncate text-title font-semibold tracking-[-0.02em]">
          Mapa · {title}
        </h1>
      </header>
      <WorkspaceErrorBoundary title="Mapa stranice nije učitana." className="min-h-[16rem]">
      <AreaCanvasView
        areaId={page.areaId}
        rootPageId={page._id}
        canvasLabel={title}
        areaKey={area?.key ?? "other"}
        areas={workspace.areas}
        filter={filter}
        onFilterChange={setFilter}
        onOpenCanvas={onOpenPage}
        onOpenDetails={onOpenPage}
        onCreatePage={(kind) =>
          onCreateChild({ areaId: page.areaId, parentPageId: page._id, initialKind: kind })
        }
        layout="standard"
      />
      </WorkspaceErrorBoundary>
    </div>
  );
}
