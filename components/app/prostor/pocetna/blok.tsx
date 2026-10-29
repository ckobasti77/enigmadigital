"use client";

// Preneto iz Devotion apps/web/components/workspace/command-center/block.tsx (main @ c05c40f), SPAJANJE S20.
import { Component, createContext, useContext, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Stanje jednog bloka početne (K19): svaki blok se učitava i pada za sebe. */
export type BlockStatus = "loading" | "error" | "ready";

/** Skeleton redova iste visine kao pravi redovi (40 px). */
export function BlockSkeleton({ rows = 3, label }: { rows?: number; label: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-1">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-10 w-full rounded-lg" />
      ))}
    </div>
  );
}

/** Greška bloka: „<Šta> nije učitano." + „Pokušaj ponovo" (ponovo montira blok). */
export function BlockError({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-2 text-ui">
      <TriangleAlert className="size-4 shrink-0 text-danger" aria-hidden="true" />
      <p className="text-text-muted">{text}</p>
      <Button variant="ghost" size="sm" onClick={onRetry}>
        Pokušaj ponovo
      </Button>
    </div>
  );
}

/**
 * Blok početne: `section` sa naslovom sekcije, pa ili skeleton, ili greška,
 * ili sadržaj. Nije kartica — sekcija je naslov + sadržaj (bez kutije u kutiji).
 */
export function Block({
  id,
  title,
  count,
  action,
  status,
  errorText,
  onRetry,
  skeletonRows,
  children,
  className,
}: {
  id: string;
  title: string;
  /** Broj uz naslov (meta); crta se samo kad je blok učitan. */
  count?: number | string;
  /** Radnja desno od naslova; crta se samo kad je blok učitan. */
  action?: ReactNode;
  status: BlockStatus;
  errorText: string;
  onRetry: () => void;
  skeletonRows?: number;
  children: ReactNode;
  className?: string;
}) {
  const ready = status === "ready";
  return (
    <section
      id={id}
      aria-labelledby={`${id}-naslov`}
      aria-busy={status === "loading" ? true : undefined}
      // Programski fokus (-1): posle akcije koja ukloni fokusirani element fokus ide na blok.
      tabIndex={-1}
      className={cn("min-w-0 scroll-mt-4 outline-none", className)}
    >
      {/* Naslov kao ostale sekcije početne („Kanali", „Šta me čeka"): 15 px. */}
      <div className="mb-2 flex min-h-8 flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 id={`${id}-naslov`} className="flex min-w-0 items-baseline gap-2 text-copy font-semibold text-foreground">
          <span className="min-w-0 truncate">{title}</span>
          {ready && count !== undefined ? (
            <span className="shrink-0 text-ui font-normal tabular-nums text-text-muted">{count}</span>
          ) : null}
        </h2>
        {ready && action ? <div className="flex shrink-0 flex-wrap items-center gap-1.5">{action}</div> : null}
      </div>
      {status === "loading" ? (
        <BlockSkeleton rows={skeletonRows} label={`Učitavanje: ${title}`} />
      ) : status === "error" ? (
        <BlockError text={errorText} onRetry={onRetry} />
      ) : (
        children
      )}
    </section>
  );
}

/** „Pokušaj ponovo" iz bloka: ponovo montira ga (nova pretplata). */
const BlockRetryContext = createContext<() => void>(() => undefined);

export function useBlockRetry(): () => void {
  return useContext(BlockRetryContext);
}

/**
 * Granica jednog bloka: ako blok (npr. upit) baci grešku tokom rendera, pada
 * samo on — ostali blokovi, Brojke i zaglavlje rade dalje. Isti „Pokušaj
 * ponovo" koristi i blok koji grešku vrati kao vrednost (`useBlockRetry`).
 * Sirov tekst greške se nikad ne prikazuje.
 */
export class BlockBoundary extends Component<
  {
    id: string;
    title: string;
    errorText: string;
    children: ReactNode;
    className?: string;
    /** Poziva se pri „Pokušaj ponovo" (npr. da roditelj ponovo montira blokove koji dele pretplatu). */
    onRetry?: () => void;
  },
  { error: Error | null; attempt: number }
> {
  state: { error: Error | null; attempt: number } = { error: null, attempt: 0 };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  private retry = () => {
    this.props.onRetry?.();
    this.setState((state) => ({ error: null, attempt: state.attempt + 1 }));
  };

  render() {
    if (this.state.error !== null) {
      return (
        <Block
          id={this.props.id}
          title={this.props.title}
          status="error"
          errorText={this.props.errorText}
          onRetry={this.retry}
          className={this.props.className}
        >
          {null}
        </Block>
      );
    }
    return (
      <BlockRetryContext.Provider key={this.state.attempt} value={this.retry}>
        {this.props.children}
      </BlockRetryContext.Provider>
    );
  }
}
