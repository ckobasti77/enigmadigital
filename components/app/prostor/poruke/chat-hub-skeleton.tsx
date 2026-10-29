// Preneto iz Devotion apps/web/components/me/chat/chat-hub-skeleton.tsx (main @ c05c40f), SPAJANJE S15.
import { Skeleton } from "@/components/ui/skeleton";

/** Učitavanje Poruka dok stiže kod prikaza (`next/dynamic`): lista, a od `xl` i prazan razgovor. */
export function ChatHubSkeleton() {
  return (
    <div role="status" className="flex h-full min-h-0">
      <span className="sr-only">Učitavanje poruka…</span>
      <div className="w-full shrink-0 space-y-3 border-r border-line p-4 xl:w-80" aria-hidden="true">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-9 w-full rounded-lg" />
        {[0, 1, 2, 3, 4, 5].map((item) => (
          <div key={item} className="flex items-center gap-2.5 py-1">
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-2/5" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          </div>
        ))}
      </div>
      <div className="hidden flex-1 xl:block" aria-hidden="true" />
    </div>
  );
}
