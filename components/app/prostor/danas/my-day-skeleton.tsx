// Preneto iz Devotion apps/web/components/me/my-day/my-day-skeleton.tsx (main @ c05c40f), SPAJANJE S19.
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Učitavanje liste Moj dan: tri sekcije po tri reda, iste visine kao redovi
 * (40 px na `md+`, dva reda na telefonu), da raspored ne skoči kad stignu
 * podaci. Zaglavlje ekrana, traka i desna kolona imaju svoja stanja.
 */
export function MyDaySkeleton() {
  return (
    <div role="status" aria-label="Učitavanje dana" className="flex flex-col gap-5">
      <span className="sr-only">Učitavanje dana…</span>
      {[0, 1, 2].map((section) => (
        <div key={section} className="space-y-0.5">
          <div className="flex min-h-8 items-center px-2">
            <Skeleton className="h-3 w-24" />
          </div>
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-14 w-full rounded-md md:h-10" />
          ))}
        </div>
      ))}
    </div>
  );
}
