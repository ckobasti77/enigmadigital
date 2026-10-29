"use client";

import type { ComponentProps } from "react";
import dynamic from "next/dynamic";
import { WorkspaceHistoryProvider } from "@/components/app/prostor/zajednicko/istorija-radnji";
import { MapaKostur } from "./mapa-kostur";

/**
 * ============================================================================
 * ULAZ MAPA (SPAJANJE S14, plan S07 §7.2 i §11)
 * ============================================================================
 *
 * `@xyflow/react` je, uz Tiptap, najveći komad radnog dela i meri DOM, pa se
 * mape učitavaju samo ovde, dinamički i bez SSR-a, i tek kad se otvori
 * kartica „Mapa" (ili `/<projekat>/beleske`). Pogledi mapa se ne uvoze
 * direktno ni iz jednog fajla van `mape/` (čuva ga `lib/prostor/mape-lenje.test.ts`).
 *
 * Istorija radnji (Poništi · Ponovi, Ctrl/⌘ + Z/Y) važi dok je mapa otvorena:
 * Devotion ju je držao oko cele ljuske, a ovde je samo oko mape, jer je jedino
 * mape pune i jer bi globalno Ctrl/⌘ + Z presretalo ostale Enigmine ekrane.
 */
const MapaOblastiPogled = dynamic(
  () => import("./area-canvas-view").then((m) => m.AreaCanvasView),
  { ssr: false, loading: () => <MapaKostur label="Učitavam mapu oblasti" /> },
);

const MapaStranicePogled = dynamic(
  () => import("./page-map-view").then((m) => m.PageMapView),
  { ssr: false, loading: () => <MapaKostur label="Učitavam mapu stranice" /> },
);

const MapaIdejaPogled = dynamic(
  () => import("./ideas-canvas-view").then((m) => m.IdeasCanvasView),
  { ssr: false, loading: () => <MapaKostur label="Učitavam mapu ideja" /> },
);

const MapaBeleskiPogled = dynamic(
  () => import("./thoughts/thoughts-canvas-view").then((m) => m.ThoughtsCanvasView),
  { ssr: false, loading: () => <MapaKostur label="Učitavam mapu beleški" /> },
);

export function MapaOblasti(props: ComponentProps<typeof MapaOblastiPogled>) {
  return (
    <WorkspaceHistoryProvider>
      <MapaOblastiPogled {...props} />
    </WorkspaceHistoryProvider>
  );
}

export function MapaStranice(props: ComponentProps<typeof MapaStranicePogled>) {
  return (
    <WorkspaceHistoryProvider>
      <MapaStranicePogled {...props} />
    </WorkspaceHistoryProvider>
  );
}

export function MapaIdeja(props: ComponentProps<typeof MapaIdejaPogled>) {
  return (
    <WorkspaceHistoryProvider>
      <MapaIdejaPogled {...props} />
    </WorkspaceHistoryProvider>
  );
}

export function MapaBeleski(props: ComponentProps<typeof MapaBeleskiPogled>) {
  return (
    <WorkspaceHistoryProvider>
      <MapaBeleskiPogled {...props} />
    </WorkspaceHistoryProvider>
  );
}
