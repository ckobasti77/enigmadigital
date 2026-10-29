// Preneto iz Devotion apps/web/components/me/tasks/my-tasks-skeleton.tsx (main @ c05c40f), SPAJANJE S16.
import { Skeleton } from "@/components/ui/skeleton";

/** Učitavanje: 2 grupe × 4 reda iste visine kao red (plan K07 §1.3). */
export function MyTasksSkeleton() {
  return (
    <div role="status" aria-busy="true" className="space-y-6">
      <span className="sr-only">Učitavanje zadataka</span>
      {[0, 1].map((group) => (
        <div key={group} className="space-y-1.5">
          <Skeleton className="ml-2 h-3.5 w-28" />
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className="flex h-14 items-center gap-3 px-2 md:h-10">
              <Skeleton className="size-5 rounded-full" />
              <Skeleton className="h-4 max-w-80 flex-1" />
              <Skeleton className="hidden h-3.5 w-24 xl:block" />
              <Skeleton className="h-3.5 w-16" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
