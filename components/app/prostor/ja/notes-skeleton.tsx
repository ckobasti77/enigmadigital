// Preneto iz Devotion apps/web/components/me/notes/notes-skeleton.tsx (main @ c05c40f), SPAJANJE S16.
import { Skeleton } from "@/components/ui/skeleton";

/** Učitavanje: 6 redova oblika reda Beleški (naslov, isečak, meta). */
export function NotesSkeleton() {
  return (
    <div role="status" aria-busy="true" className="space-y-1">
      <span className="sr-only">Učitavanje beleški</span>
      {[0, 1, 2, 3, 4, 5].map((row) => (
        <div key={row} className="flex items-start gap-3 rounded-lg px-2 py-2.5">
          <Skeleton className="mt-1 size-3.5 shrink-0 rounded-sm" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className={row % 2 === 0 ? "h-4 w-3/5" : "h-4 w-2/5"} />
            <Skeleton className={row % 3 === 0 ? "h-3.5 w-4/5" : "h-3.5 w-3/5"} />
            <Skeleton className="h-3 w-28" />
          </div>
        </div>
      ))}
    </div>
  );
}
