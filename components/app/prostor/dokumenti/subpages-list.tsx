"use client";

// Preneto iz Devotion apps/web/components/workspace/page/subpages-list.tsx (main @ c05c40f), SPAJANJE S10.
import { LoaderCircle, Lock, Map as MapIcon, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionHeading } from "@/components/app/prostor/zajednicko/radni-ui";
import { pageKindMeta, type PageKind } from "@/lib/prostor/web/vrste-stranica";

export type SubpageRow = {
  id: string;
  title: string;
  kind: PageKind;
  /** „Beleška · Ana · pre 2 dana" (`subpageMeta`). */
  meta: string;
  locked: boolean;
};

export type SubpagesState =
  | { status: "loading" }
  | { status: "error"; onRetry: () => void }
  | { status: "ready"; items: ReadonlyArray<SubpageRow>; loadMore: { busy: boolean; onLoad: () => void } | null };

/**
 * Podstranice kao lista (PROSTOR P13, K07 §5.6): naslov sekcije sa brojem,
 * „Prikaži na mapi" (postojeći kanvas stranice) i „Nova podstranica". Bez
 * podstranica ostaje samo „Nova podstranica" (bez praznog teksta); ko ne sme da
 * menja spisak dece, a dece nema — sekcija se ne crta.
 */
export function SubpagesList({
  headingId,
  state,
  count,
  onOpen,
  onCreate,
  onShowMap,
}: {
  headingId: string;
  state: SubpagesState;
  /** „3" / „20+"; `null` dok se ne zna. */
  count: string | null;
  onOpen: (id: string) => void;
  /** `undefined` = gledalac ne sme da dodaje podstranice (zaključan roditelj). */
  onCreate?: () => void;
  onShowMap?: () => void;
}) {
  const empty = state.status === "ready" && state.items.length === 0 && state.loadMore === null;
  if (empty && !onCreate) return null;
  return (
    <section aria-labelledby={headingId}>
      <SectionHeading
        id={headingId}
        title="Podstranice"
        count={empty ? null : count}
        action={
          <>
            {onShowMap && !empty ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                aria-label="Prikaži na mapi"
                onClick={onShowMap}
              >
                <MapIcon aria-hidden="true" />
                <span className="hidden sm:inline">Prikaži na mapi</span>
              </Button>
            ) : null}
            {onCreate ? (
              <Button type="button" variant="ghost" size="sm" onClick={onCreate}>
                <Plus aria-hidden="true" />
                Nova podstranica
              </Button>
            ) : null}
          </>
        }
      />
      {state.status === "loading" ? (
        <div role="status" aria-label="Učitavanje podstranica" className="space-y-1">
          {[0, 1, 2].map((item) => (
            <Skeleton key={item} className="h-10 w-full rounded-lg" />
          ))}
        </div>
      ) : state.status === "error" ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 px-2 py-2 text-sm">
          <p className="text-muted-foreground">Podstranice nisu učitane.</p>
          <Button variant="outline" size="sm" onClick={state.onRetry}>
            Pokušaj ponovo
          </Button>
        </div>
      ) : empty ? null : (
        <>
          <ul className="space-y-0.5">
            {state.items.map((item) => {
              const Icon = pageKindMeta(item.kind).icon;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(item.id)}
                    className="flex min-h-10 w-full flex-col gap-0.5 rounded-lg px-2 py-1.5 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center sm:gap-3"
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="min-w-0 truncate text-sm font-medium">{item.title.trim() || "Bez naslova"}</span>
                      {item.locked ? (
                        <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-label="Zaključano" />
                      ) : null}
                    </span>
                    <span className="truncate pl-6 text-xs text-muted-foreground sm:shrink-0 sm:pl-0">{item.meta}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {state.loadMore ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              disabled={state.loadMore.busy}
              onClick={state.loadMore.onLoad}
            >
              {state.loadMore.busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
              {state.loadMore.busy ? "Učitavam…" : "Učitaj još"}
            </Button>
          ) : null}
        </>
      )}
    </section>
  );
}
