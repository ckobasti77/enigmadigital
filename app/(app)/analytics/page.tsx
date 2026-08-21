import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import {
  AnalyticsDashboard,
  DashboardSkeleton,
} from "@/components/app/analytics/analytics-dashboard";

export default function AnalyticsPage() {
  return (
    <div className="flex w-full flex-1 flex-col gap-8">
      <PageHeader description="Sesije, korisnici i konverzije iz Google Analytics 4, u odnosu na prethodni period iste dužine." />

      <div className="flex flex-1 flex-col">
        {/* useSearchParams (date range) needs a Suspense boundary on static routes. */}
        <Suspense fallback={<DashboardSkeleton />}>
          <AnalyticsDashboard />
        </Suspense>
      </div>
    </div>
  );
}
