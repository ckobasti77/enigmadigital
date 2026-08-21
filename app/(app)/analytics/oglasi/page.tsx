import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import { AdsPerformanceDashboard } from "@/components/app/analytics/ads-performance-dashboard";

export default function AdsPerformancePage() {
  return (
    <div className="flex w-full flex-1 flex-col gap-8">
      <PageHeader description="Spajanje potrošnje na Google Ads-u sa ponašanjem na sajtu i ostvarenim ključnim događajima." />

      <div className="flex flex-1 flex-col">
        {/* useSearchParams (date range) needs a Suspense boundary on static routes. */}
        <Suspense
          fallback={
            <div className="flex flex-1 flex-col gap-8">
              <div className="h-12 w-full animate-pulse rounded-xl bg-line/40" />
            </div>
          }
        >
          <AdsPerformanceDashboard />
        </Suspense>
      </div>
    </div>
  );
}
