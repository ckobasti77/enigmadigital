import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import { ContentDashboard } from "@/components/app/analytics/content-dashboard";

export default function ContentAnalyticsPage() {
  return (
    <div className="flex w-full flex-1 flex-col gap-8">
      <PageHeader description="Uvid u performanse sadržaja, najčitanije stranice i početne tačke ulaska korisnika na sajt." />

      <div className="flex flex-1 flex-col">
        {/* useSearchParams (date range) needs a Suspense boundary on static routes. */}
        <Suspense
          fallback={
            <div className="flex flex-1 flex-col gap-8">
              <div className="h-12 w-full animate-pulse rounded-xl bg-line/40" />
            </div>
          }
        >
          <ContentDashboard />
        </Suspense>
      </div>
    </div>
  );
}
