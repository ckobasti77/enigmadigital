import { Suspense } from "react";
import {
  AnalyticsDashboard,
  DashboardSkeleton,
} from "@/components/app/analytics/analytics-dashboard";

export default function AnalyticsPage() {
  return (
    <div className="flex w-full flex-1 flex-col">
      <p className="heading-caps text-xs font-medium text-text-muted">
        Analitika · GA4
      </p>
      <h1 className="mt-2 text-h1 text-foreground">
        Saobraćaj sajta
      </h1>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
        Sesije, korisnici i konverzije iz Google Analytics 4, u odnosu na
        prethodni period iste dužine.
      </p>

      <div className="mt-8 flex flex-1 flex-col">
        {/* useSearchParams (date range) needs a Suspense boundary on static routes. */}
        <Suspense
          fallback={
            <div className="flex flex-1 flex-col gap-6">
              <div className="h-8" />
              <DashboardSkeleton />
            </div>
          }
        >
          <AnalyticsDashboard />
        </Suspense>
      </div>
    </div>
  );
}
