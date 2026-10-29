// Preneto iz Devotion apps/web/components/me/inbox/inbox-skeleton.tsx (main @ c05c40f), SPAJANJE S17.
import { Skeleton } from "@/components/ui/skeleton";

/** Učitavanje: šest redova u obliku reda Inboxa. */
export function InboxSkeleton() {
  return (
    <div role="status" aria-busy="true" className="space-y-1">
      <span className="sr-only">Učitavam obaveštenja</span>
      <Skeleton className="mb-2 ml-2 h-3 w-14" />
      {[0, 1, 2, 3, 4, 5].map((row) => (
        <div key={row} className="flex items-start gap-3 px-2 py-2.5">
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className={row % 2 === 0 ? "h-3.5 w-4/5" : "h-3.5 w-3/5"} />
            <Skeleton className="h-3 w-2/5" />
          </div>
          <Skeleton className="h-3 w-10 shrink-0" />
        </div>
      ))}
    </div>
  );
}
