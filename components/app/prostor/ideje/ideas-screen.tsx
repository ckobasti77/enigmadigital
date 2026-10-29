"use client";

// Preneto iz Devotion apps/web/components/workspace/ideas/ideas-screen.tsx (main @ c05c40f), SPAJANJE S13.
import { useEffect, useId, useState, type ReactNode } from "react";
import { Lightbulb, Network, Plus, RefreshCw, Rows3, Search, SearchX, SquareKanban, X } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MapaKostur } from "@/components/app/prostor/mape/mapa-kostur";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/app/prostor/zajednicko/radni-ui";
import type { Id } from "@/convex/_generated/dataModel";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

import { IdeaBoard } from "@/components/app/prostor/ideje/idea-board";
import { IdeaList } from "@/components/app/prostor/ideje/idea-list";
import type { IdeaActions } from "@/components/app/prostor/ideje/idea-parts";
import {
  filterIdeas,
  IDEAS_VIEW_MODES,
  ideasCountLabel,
  isIdeasViewMode,
  type IdeaModel,
  type IdeaSort,
  type IdeaSortKey,
  type IdeasViewMode,
} from "@/lib/prostor/modeli/ideas-model";

export type IdeasScreenState =
  | { status: "loading" }
  | { status: "error"; retry: () => void }
  | { status: "ready"; ideas: ReadonlyArray<IdeaModel> };

const MODE_ICONS = { tabla: SquareKanban, lista: Rows3, mapa: Network } as const;

/**
 * Ideje projekta (PROSTOR P16, K07 §5.9) — prezentacija: zaglavlje sa brojem
 * i jedinom primarnom radnjom „Nova ideja", pretraga i prekidač
 * Tabla · Lista · Mapa, pa izabrani prikaz. Mapu ideja daje kontejner kroz
 * `map` (dinamički učitana tek kad se izabere Mapa). Radni ekran se ne animira pri
 * učitavanju (Devotion `useEnter` nije prenet).
 */
export function IdeasScreen({
  state,
  mode,
  onModeChange,
  query,
  onQueryChange,
  now,
  actions,
  activeIdeaId,
  sort,
  onSortChange,
  onCreate,
  announcement,
  map,
}: {
  state: IdeasScreenState;
  mode: IdeasViewMode;
  onModeChange: (mode: IdeasViewMode) => void;
  query: string;
  onQueryChange: (query: string) => void;
  now: number;
  actions: IdeaActions;
  activeIdeaId: Id<"ideaNodes"> | null;
  sort: IdeaSort;
  onSortChange: (key: IdeaSortKey) => void;
  onCreate: () => void;
  /** Najava za čitač ekrana (glas, faza). */
  announcement: string;
  /** Mapa ideja (dinamički učitana `MapaIdeja`); daje je kontejner. */
  map?: ReactNode;
}) {
  const searchId = useId();
  const ready = state.status === "ready";
  const all = ready ? state.ideas : [];
  const shown = filterIdeas(all, query);
  // Broj rezultata pretrage se najavljuje (sa zadrškom, da kucanje ne zatrpa čitač).
  const [searchAnnouncement, setSearchAnnouncement] = useState("");
  const trimmedQuery = query.trim();
  const shownCount = shown.length;
  useEffect(() => {
    if (!ready || trimmedQuery === "") return;
    const timer = window.setTimeout(
      () =>
        setSearchAnnouncement(
          shownCount === 0 ? "Nijedna ideja ne odgovara pretrazi." : `Rezultata: ${formatNumber(shownCount)}.`,
        ),
      400,
    );
    return () => window.clearTimeout(timer);
  }, [ready, trimmedQuery, shownCount]);

  const body = (current: IdeasViewMode): ReactNode => {
    if (state.status === "loading") {
      // Ispod `md` tabla je lista grupisana po fazi — i učitavanje je lista.
      return current === "lista" ? (
        <ListSkeleton />
      ) : (
        <>
          <BoardSkeleton />
          <ListSkeleton className="md:hidden" />
        </>
      );
    }
    if (state.status === "error") return <IdeasError retry={state.retry} />;
    if (all.length === 0) {
      return (
        <EmptyState
          icon={Lightbulb}
          headingAs="h2"
          title="Još nema ideja."
          description="Nova ideja ide u fazu Predlog, a tim glasa za i protiv."
          action={
            // Zaglavlje već ima primarnu „Nova ideja" (jedna primarna radnja po ekranu).
            <Button variant="outline" onClick={onCreate}>
              <Plus aria-hidden="true" /> Nova ideja
            </Button>
          }
        />
      );
    }
    if (shown.length === 0) {
      return (
        <EmptyState
          icon={SearchX}
          headingAs="h2"
          title="Nijedna ideja ne odgovara pretrazi."
          description="Probaj drugu reč."
          action={
            <Button variant="outline" onClick={() => onQueryChange("")}>
              Poništi pretragu
            </Button>
          }
        />
      );
    }
    return current === "tabla" ? (
      <IdeaBoard ideas={shown} now={now} actions={actions} activeIdeaId={activeIdeaId} resetKey={query} />
    ) : (
      <IdeaList
        ideas={shown}
        now={now}
        actions={actions}
        sort={sort}
        onSortChange={onSortChange}
        activeIdeaId={activeIdeaId}
        resetKey={query}
      />
    );
  };

  return (
    <div className="flex w-full flex-col gap-5 pb-16">
      <PageHeader
        variant="module"
        title="Ideje"
        description={ready ? ideasCountLabel(all.length) : "Predlozi tima po fazama."}
        actions={
          <Button variant="primary" onClick={onCreate}>
            <Plus aria-hidden="true" /> Nova ideja
          </Button>
        }
      />

      <Tabs
        value={mode}
        onValueChange={(value) => {
          if (isIdeasViewMode(value)) onModeChange(value);
        }}
        className="gap-0"
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <label htmlFor={searchId} className="sr-only">
              Pretraži ideje
            </label>
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-muted"
              aria-hidden="true"
            />
            <Input
              id={searchId}
              type="search"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && query) {
                  event.preventDefault();
                  onQueryChange("");
                }
              }}
              placeholder="Pretraži ideje…"
              className="h-9 pl-8 pr-9 pointer-coarse:h-11 [&::-webkit-search-cancel-button]:hidden"
            />
            {query ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Obriši pretragu"
                onClick={() => onQueryChange("")}
                className="absolute right-1 top-1/2 size-7 -translate-y-1/2 text-text-muted"
              >
                <X aria-hidden="true" />
              </Button>
            ) : null}
          </div>
          <TabsList variant="pill" aria-label="Prikaz ideja">
            {IDEAS_VIEW_MODES.map(({ value, label }) => {
              const Icon = MODE_ICONS[value];
              return (
                <TabsTrigger key={value} value={value}>
                  <Icon aria-hidden="true" /> {label}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        <TabsContent value="tabla" className="mt-0">
          {body("tabla")}
        </TabsContent>
        <TabsContent value="lista" className="mt-0">
          {body("lista")}
        </TabsContent>
        {/* Mapa ima visinu kao Mapa oblasti: xyflow traži roditelja sa visinom. */}
        <TabsContent value="mapa" className="mt-0 h-[min(72vh,52rem)] min-h-[32rem]">
          {state.status === "error" ? (
            <IdeasError retry={state.retry} />
          ) : state.status === "loading" ? (
            <MapaKostur label="Učitavam mapu ideja" />
          ) : (
            map
          )}
        </TabsContent>
      </Tabs>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement || (trimmedQuery === "" ? "" : searchAnnouncement)}
      </p>
    </div>
  );
}

function IdeasError({ retry }: { retry: () => void }) {
  return (
    <div
      role="alert"
      className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-line px-6 py-8 text-center"
    >
      <h2 className="text-ui font-semibold">Ideje nisu učitane.</h2>
      <p className="mt-1 text-ui text-text-muted">Proveri vezu i pokušaj ponovo.</p>
      <Button variant="outline" className="mt-4" onClick={retry}>
        <RefreshCw aria-hidden="true" /> Pokušaj ponovo
      </Button>
    </div>
  );
}

function BoardSkeleton() {
  return (
    <div role="status" aria-label="Učitavanje ideja" className="flex gap-3 overflow-hidden pb-4 max-md:hidden">
      {[0, 1, 2, 3].map((column) => (
        <div key={column} className="min-w-56 max-w-80 flex-1 basis-0 space-y-2 rounded-lg p-2">
          <Skeleton className="h-6 w-28" />
          {[0, 1].map((card) => (
            <Skeleton key={card} className="h-32 w-full rounded-lg" />
          ))}
        </div>
      ))}
    </div>
  );
}

function ListSkeleton({ className }: { className?: string }) {
  return (
    <div role="status" aria-label="Učitavanje ideja" className={cn("space-y-1", className)}>
      {[0, 1, 2, 3, 4].map((row) => (
        <Skeleton key={row} className="h-10 w-full rounded-lg" />
      ))}
    </div>
  );
}
