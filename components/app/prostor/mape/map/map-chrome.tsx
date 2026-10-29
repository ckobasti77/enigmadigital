// Preneto iz Devotion apps/web/components/map/map-chrome.tsx (main @ c05c40f), SPAJANJE S14.
import type { ReactNode } from "react";
import { MousePointerClick, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { MAP_INACTIVE_HINT, mapZoomLabel } from "@/lib/prostor/modeli/map-model";

/**
 * Okvir Mape: ivica 1 px, bez senke i gradijenta. `prostor-mapa` uključuje
 * teme iz `mape.css` (xyflow promenljive na tokenima). Dok mapa
 * prima točkić (`data-map-active`), ivica je u boji fokusa.
 */
export const MAP_FRAME_CLASS =
  "prostor-mapa relative overflow-hidden rounded-lg border border-line bg-background data-[map-active=true]:border-ring";

/**
 * Donji red Mape: zum („100 %") uvek, a oznaka „Klikni u mapu…" samo dok mapa
 * ne prima točkić. Na dodir oznaka nema smisla (nema točkića), pa je skrivena
 * ispod `md`.
 */
export function MapStatusBar({ zoom, active }: { zoom: number; active: boolean }) {
  return (
    <div className="pointer-events-none flex items-center gap-2 text-xs leading-5 text-muted-foreground">
      <span className="rounded-md border border-line bg-card px-2 py-0.5 tabular-nums text-foreground">
        <span className="sr-only">Zum </span>
        {mapZoomLabel(zoom)}
      </span>
      {active ? null : (
        <span className="hidden items-center gap-1.5 rounded-md border border-line bg-card px-2 py-0.5 md:inline-flex">
          <MousePointerClick className="size-3.5" aria-hidden="true" />
          {MAP_INACTIVE_HINT}
        </span>
      )}
    </div>
  );
}

/** Prazna Mapa (§5.5): jedna rečenica, jedna dopuna, najviše dve radnje. */
export function MapEmptyState({
  icon: Icon,
  title,
  description,
  actions,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center p-6">
      <div className="pointer-events-auto flex max-w-sm flex-col items-center rounded-lg border border-dashed border-line bg-card px-6 py-6 text-center">
        <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
        <p className="mt-3 text-sm font-semibold">{title}</p>
        {description ? <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p> : null}
        {actions ? <div className="mt-4 flex flex-wrap justify-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

/** Poništi · Ponovi u gornjem levom uglu Mape (postojeća istorija radnji). */
export function MapHistoryButtons({
  undoCount,
  redoCount,
  busy,
  onUndo,
  onRedo,
  undoIcon,
  redoIcon,
}: {
  undoCount: number;
  redoCount: number;
  busy: boolean;
  onUndo: () => void;
  onRedo: () => void;
  undoIcon: ReactNode;
  redoIcon: ReactNode;
}) {
  return (
    <div className={cn("flex items-center gap-0.5 rounded-lg border border-line bg-card p-0.5")}>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-9"
        aria-label="Poništi poslednju promenu"
        disabled={undoCount === 0 || busy}
        onClick={onUndo}
      >
        {undoIcon}
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-9"
        aria-label="Ponovi promenu"
        disabled={redoCount === 0 || busy}
        onClick={onRedo}
      >
        {redoIcon}
      </Button>
      <span className="sr-only" aria-live="polite">
        Dostupno je {undoCount} poništavanja i {redoCount} ponavljanja.
      </span>
    </div>
  );
}
