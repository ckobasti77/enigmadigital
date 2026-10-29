"use client";

// Preneto iz Devotion apps/web/components/workspace/workspace-error-boundary.tsx (main @ c05c40f), SPAJANJE S08.
// Kuke koje ne bacaju grešku (`useQueryTolerant`, `useQueryResult`) su u
// `components/app/prostor/podaci/`; ovde je samo granica.

import { Component, type ReactNode } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { accessErrorMessage } from "@/lib/prostor/web/greske";
import { cn } from "@/lib/utils";

/**
 * Convex `useQuery` baca serversku grešku upita TOKOM rendera. Bez granice pad
 * jednog prikaza (npr. tuđa ili obrisana stranica) obara celu ljusku do
 * korenskog `error.tsx`. Granica zadržava ostatak ljuske živim i prikazuje
 * ljudsku poruku u mestu (nikad sirov `error.message`, nego
 * `accessErrorMessage`) i „Pokušaj ponovo“, koje ponovo montira decu, pa se
 * Convex pretplata pravi iznova.
 *
 * Export ostaje pod Devotion imenom (`WorkspaceErrorBoundary`), da preneti
 * ekrani menjaju samo uvoz; `GranicaGreske` je isto, pod Enigminim imenom.
 */
export class WorkspaceErrorBoundary extends Component<
  { children: ReactNode; title?: string; className?: string },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (error === null) return this.props.children;

    return (
      <div
        role="alert"
        className={cn(
          "grid min-h-40 place-items-center rounded-xl border border-dashed border-line px-5 py-8",
          this.props.className,
        )}
      >
        <div className="w-full max-w-md text-center">
          <TriangleAlert className="mx-auto size-5 text-text-muted" aria-hidden="true" />
          <h2 className="mt-3 text-ui font-medium text-foreground">
            {this.props.title ?? "Prikaz nije učitan."}
          </h2>
          <p className="mt-1 text-ui text-text-secondary">
            {accessErrorMessage(error, "Pokušaj ponovo za nekoliko trenutaka.")}
          </p>
          <Button
            className="mt-4"
            variant="outline"
            onClick={() => this.setState({ error: null })}
          >
            <RefreshCw className="size-4" />
            Pokušaj ponovo
          </Button>
        </div>
      </div>
    );
  }
}

export { WorkspaceErrorBoundary as GranicaGreske };
