"use client";

// Preneto iz Devotion apps/web/components/workspace/area/area-overview.tsx (main @ c05c40f), SPAJANJE S10.
import { useRef, useState, type ReactNode, type RefObject } from "react";
import { History, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, SectionHeading } from "@/components/app/prostor/zajednicko/radni-ui";
import { pageKindMeta, type PageKind } from "@/lib/prostor/web/vrste-stranica";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

import { AREA_BODY_MAX, type AreaBodyStatus } from "@/lib/prostor/modeli/area-model";

/**
 * Pregled oblasti — raspored (K07 §5.5): na širokom ekranu Opis i Komentari
 * levo, Nedavne izmene u uskoj koloni desno; ispod `lg` jedna kolona istim
 * redom kao DOM (Opis → Nedavne izmene → Komentari).
 */
export function AreaOverviewLayout({
  description,
  recent,
  comments,
}: {
  description: ReactNode;
  recent: ReactNode;
  comments: ReactNode;
}) {
  return (
    <div className="grid gap-x-10 gap-y-6 xl:grid-cols-[minmax(0,46rem)_15rem] xl:grid-rows-[auto_1fr]">
      <div className="min-w-0 xl:col-start-1 xl:row-start-1">{description}</div>
      <div className="min-w-0 xl:col-start-2 xl:row-span-2 xl:row-start-1">{recent}</div>
      <div className="min-w-0 xl:col-start-1 xl:row-start-2">{comments}</div>
    </div>
  );
}

export type AreaDescriptionState =
  | { status: "loading" }
  | { status: "error"; onRetry: () => void }
  | {
      status: "ready";
      value: string;
      editable: boolean;
      saveStatus: AreaBodyStatus;
      /** „Sačuvano · Marko · pre 2 dana", „Čuvam…", … */
      stateText: string;
      /** Ponovni pokušaji su potrošeni: „Pokušaj ponovo". */
      onRetry: (() => void) | null;
      /** Konflikt čeka odluku: „Reši" otvara dijalog. */
      onResolveConflict: (() => void) | null;
      onChange: (value: string) => void;
      onBlur: () => void;
    };

/**
 * Opis oblasti kao dokument tima (PROSTOR P1, P2): polje koje menja svaki član
 * i čuva se samo; „Istorija izmena" otvara fioku sa verzijama.
 */
export function AreaDescription({
  headingId,
  state,
  onOpenHistory,
  historyButtonRef,
  textareaRef,
}: {
  headingId: string;
  state: AreaDescriptionState;
  onOpenHistory: (() => void) | null;
  historyButtonRef?: RefObject<HTMLButtonElement | null>;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
}) {
  // „Napiši opis" otvara polje i kad je opis prazan (prazno stanje je samo poziv).
  const [writing, setWriting] = useState(false);
  const localRef = useRef<HTMLTextAreaElement>(null);
  const fieldRef = textareaRef ?? localRef;

  return (
    <section aria-labelledby={headingId}>
      <SectionHeading
        id={headingId}
        title="Opis oblasti"
        action={
          onOpenHistory ? (
            <Button
              ref={historyButtonRef}
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={onOpenHistory}
            >
              <History aria-hidden="true" />
              Istorija izmena
            </Button>
          ) : null
        }
      />
      {state.status === "loading" ? (
        <div role="status" aria-label="Učitavanje opisa oblasti">
          <Skeleton className="h-28 w-full rounded-lg" />
        </div>
      ) : state.status === "error" ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 px-2 py-2 text-sm">
          <p className="text-muted-foreground">Opis oblasti nije učitan.</p>
          <Button variant="outline" size="sm" onClick={state.onRetry}>
            Pokušaj ponovo
          </Button>
        </div>
      ) : !state.editable ? (
        state.value ? (
          <p className="whitespace-pre-wrap break-words text-sm leading-6">{state.value}</p>
        ) : (
          <EmptyState size="section" title="Oblast još nema opis." description="Opis dodaje ko sme da menja oblast." />
        )
      ) : !state.value && !writing && state.saveStatus === "saved" ? (
        <EmptyState
          size="section"
          title="Oblast još nema opis."
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setWriting(true);
                window.requestAnimationFrame(() => fieldRef.current?.focus());
              }}
            >
              Napiši opis
            </Button>
          }
        />
      ) : (
        <>
          <Textarea
            ref={fieldRef}
            value={state.value}
            maxLength={AREA_BODY_MAX}
            aria-labelledby={headingId}
            placeholder="Za šta je ova oblast, šta je sada važno, gde je šta…"
            // Polje ostaje dok je u upotrebi, i kad se sav tekst obriše; prazno stanje
            // se vraća tek kad korisnik ode iz praznog polja.
            onFocus={() => setWriting(true)}
            onChange={(event) => {
              setWriting(true);
              state.onChange(event.target.value);
            }}
            onBlur={() => {
              state.onBlur();
              if (!state.value) setWriting(false);
            }}
            // 16 px ispod `md` (Safari inače uveća stranicu na fokusu).
            className="field-sizing-content max-h-[60vh] min-h-28 resize-y bg-transparent text-base leading-6 shadow-none md:text-sm"
          />
          <DescriptionStatus state={state} />
        </>
      )}
    </section>
  );
}

function DescriptionStatus({ state }: { state: Extract<AreaDescriptionState, { status: "ready" }> }) {
  const problem = state.saveStatus === "error" || state.saveStatus === "conflict";
  const near = state.value.length >= AREA_BODY_MAX - 1_000;
  return (
    <div className="mt-1.5 flex min-h-7 flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span className={cn(problem && "text-danger")}>{state.stateText}</span>
      {/* Najavljuje se samo problem, ne svaka pauza u kucanju (kao na stranici, K10-11). */}
      <span role="status" className="sr-only">
        {problem ? state.stateText : ""}
      </span>
      <span className="flex items-center gap-2">
        {near ? (
          <span className="tabular-nums">
            {formatNumber(state.value.length)}/{formatNumber(AREA_BODY_MAX)}
          </span>
        ) : null}
        {state.onRetry ? (
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-meta" onClick={state.onRetry}>
            Pokušaj ponovo
          </Button>
        ) : null}
        {state.onResolveConflict ? (
          <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-meta" onClick={state.onResolveConflict}>
            Reši
          </Button>
        ) : null}
      </span>
    </div>
  );
}

export type RecentChangeItem = {
  id: string;
  title: string;
  kind: PageKind;
  /** „Ana · pre 5 min". */
  meta: string;
  locked: boolean;
};

export type RecentChangesState =
  | { status: "loading" }
  | { status: "error"; onRetry: () => void }
  | { status: "ready"; items: ReadonlyArray<RecentChangeItem> };

/** Nedavne izmene u oblasti (`pages.recentForArea`, D19): poslednje izmenjene stranice i ko. */
export function RecentChanges({
  headingId,
  state,
  onOpen,
}: {
  headingId: string;
  state: RecentChangesState;
  onOpen: (id: string) => void;
}) {
  return (
    <section aria-labelledby={headingId}>
      <SectionHeading id={headingId} title="Nedavne izmene" />
      {state.status === "loading" ? (
        <div role="status" aria-label="Učitavanje nedavnih izmena" className="space-y-1">
          {[0, 1, 2, 3, 4].map((item) => (
            <Skeleton key={item} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : state.status === "error" ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 px-2 py-2 text-sm">
          <p className="text-muted-foreground">Nedavne izmene nisu učitane.</p>
          <Button variant="outline" size="sm" onClick={state.onRetry}>
            Pokušaj ponovo
          </Button>
        </div>
      ) : state.items.length === 0 ? (
        <EmptyState size="section" title="Ovde još niko nije menjao." description="Izmene stranica ove oblasti pojaviće se ovde." />
      ) : (
        <ul className="space-y-0.5">
          {state.items.map((item) => {
            const Icon = pageKindMeta(item.kind).icon;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onOpen(item.id)}
                  className="flex min-h-10 w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left outline-none transition-colors hover:bg-surface-control-hover focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="min-w-0 truncate text-sm font-medium">{item.title.trim() || "Bez naslova"}</span>
                      {item.locked ? (
                        <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-label="Zaključano" />
                      ) : null}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">{item.meta}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
