"use client";

// Preneto iz Devotion apps/web/components/me/task-panel/task-panel-states.tsx (main @ c05c40f), SPAJANJE S12.
import { RefreshCw, SearchX, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { accessErrorCode } from "@/lib/prostor/web/greske";

/** Učitavanje panela: naslov, 4 čipa, 3 reda (plan K07 §1.4). */
export function TaskPanelSkeleton() {
  return (
    <div role="status" aria-busy="true" className="space-y-6">
      <span className="sr-only">Učitavanje zadatka</span>
      <div className="flex flex-wrap gap-2">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-9 w-28 rounded-full" />
        ))}
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-20" />
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="h-10 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export function TaskPanelHeaderSkeleton() {
  return (
    <div className="space-y-2" aria-hidden="true">
      <Skeleton className="h-3.5 w-36" />
      <Skeleton className="h-6 w-56" />
    </div>
  );
}

/** Zadatak je obrisan, arhiviran ili više nemaš pristup. */
export function TaskPanelGone({ onClose }: { onClose: () => void }) {
  return (
    <div role="status" className="flex min-h-40 flex-col items-center justify-center px-4 text-center">
      <SearchX className="mb-3 size-5 text-muted-foreground" aria-hidden="true" />
      <p className="text-ui font-semibold">Zadatak više ne postoji</p>
      <p className="mt-1 max-w-xs text-ui leading-6 text-muted-foreground">Možda je obrisan ili više nemaš pristup.</p>
      <Button type="button" variant="outline" className="mt-5" onClick={onClose}>
        Zatvori
      </Button>
    </div>
  );
}

/**
 * Greška panela. U produkciji Convex skriva poruku obične greške servera, pa
 * obrisan zadatak ili izgubljen pristup ne mogu da se razlikuju od prekida
 * veze — tekst zato pokriva oba slučaja i nudi i „Zatvori".
 */
export function TaskPanelError({ retry, onClose }: { retry: () => void; onClose: () => void }) {
  return (
    <div role="alert" className="flex min-h-40 flex-col items-center justify-center px-4 text-center">
      <TriangleAlert className="mb-3 size-5 text-muted-foreground" aria-hidden="true" />
      <p className="text-ui font-semibold">Zadatak nije učitan.</p>
      <p className="mt-1 max-w-xs text-ui leading-6 text-muted-foreground">
        Proveri vezu i pokušaj ponovo. Ako je zadatak obrisan ili više nemaš pristup, zatvori panel.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button type="button" variant="outline" onClick={retry}>
          <RefreshCw aria-hidden="true" />
          Pokušaj ponovo
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          Zatvori
        </Button>
      </div>
    </div>
  );
}

/**
 * Greška pristupa (obrisan, arhiviran, tuđ projekat) prikazuje se kao „ne
 * postoji"; sve ostalo kao greška sa „Pokušaj ponovo". Prvo se čita kod greške
 * servera (`not_found`, `forbidden`), pa tek onda tekst poruke.
 */
export function isGoneError(error: Error): boolean {
  const code = accessErrorCode(error);
  if (code === "not_found" || code === "forbidden") return true;
  const message = error.message.toLowerCase();
  return message.includes("nije pronađen") || message.includes("pristup") || message.includes("nije task") || message.includes("nije zadatak");
}
