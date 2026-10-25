import { Suspense } from "react";
import {
  ThreadsDashboard,
  ThreadsDashboardSkeleton,
} from "@/components/app/threads/threads-dashboard";

export default function ThreadsPage() {
  return (
    <div className="flex w-full flex-1 flex-col">
      {/* Zaglavlje strane crta sam ekran: „Objavi" menja jezičak ekrana.
          useSearchParams (birač perioda) zahteva Suspense granicu. */}
      <Suspense fallback={<ThreadsDashboardSkeleton />}>
        <ThreadsDashboard />
      </Suspense>
    </div>
  );
}
