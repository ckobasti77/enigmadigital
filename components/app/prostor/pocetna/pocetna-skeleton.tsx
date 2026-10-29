"use client";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * Gornji pojas početne dok se ne zna uloga ili dok projekat sa oblastima i
 * profil ne stignu (plan S18 §2.2): fiksna visina ≈ 440 px, da Brojke ispod
 * ne skoče kad blokovi stignu. Nijedan upit radnog dela se ne šalje dok ovo
 * stoji umesto uloge.
 */
export function GornjiPojasSkeleton() {
  return (
    <div
      role="status"
      aria-label="Učitavam početnu"
      className="grid h-[27.5rem] gap-x-8 gap-y-6 overflow-hidden xl:grid-cols-[minmax(0,1fr)_20rem]"
    >
      <div className="flex min-w-0 flex-col gap-2">
        <Skeleton className="h-6 w-32 rounded-md" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-10 w-full rounded-lg" />
        ))}
        <Skeleton className="mt-3 h-6 w-40 rounded-md" />
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-10 w-full rounded-lg" />
        ))}
      </div>
      <div className="hidden min-w-0 flex-col gap-2 xl:flex">
        <Skeleton className="h-6 w-28 rounded-md" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="mt-3 h-6 w-36 rounded-md" />
        <Skeleton className="h-20 w-full rounded-lg" />
      </div>
    </div>
  );
}

/** Cela strana dok uloga nije poznata: zaglavlje crta ekran, ovde je samo pojas. */
export function PocetnaSkeleton() {
  return (
    <div className="flex w-full flex-1 flex-col gap-6">
      <GornjiPojasSkeleton />
    </div>
  );
}
