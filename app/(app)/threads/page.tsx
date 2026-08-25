import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import {
  ThreadsDashboard,
  ThreadsDashboardSkeleton,
} from "@/components/app/threads/threads-dashboard";

export default function ThreadsPage() {
  return (
    <div className="flex w-full flex-1 flex-col gap-8">
      <PageHeader description="Prikazi, pratioci, klikovi i angažovanje sa Threads naloga, uz atribuciju linkova i analizu levka." />

      <div className="flex flex-1 flex-col">
        {/* useSearchParams (birač perioda) zahteva Suspense granicu */}
        <Suspense fallback={<ThreadsDashboardSkeleton />}>
          <ThreadsDashboard />
        </Suspense>
      </div>
    </div>
  );
}
