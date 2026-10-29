"use client";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/** Stanje liste u kartici: učitavanje, greška ili podaci. */
export type SettingsListState<T> =
  | { status: "loading" }
  | { status: "error"; onRetry: () => void }
  | { status: "ready"; items: ReadonlyArray<T> };

export function SettingsListSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-1">
      {[0, 1, 2, 3, 4].map((item) => (
        <Skeleton key={item} className="h-10 w-full rounded-lg" />
      ))}
    </div>
  );
}

/** `text` je cela rečenica („Oblasti nisu učitane.“): rod i broj zavise od imenice. */
export function SettingsListError({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-2 text-ui">
      <span className="text-text-muted">{text}</span>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        Pokušaj ponovo
      </Button>
    </div>
  );
}
