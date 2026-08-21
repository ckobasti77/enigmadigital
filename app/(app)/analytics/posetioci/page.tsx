import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import { AudienceDashboard } from "@/components/app/analytics/audience-dashboard";

export default function AudienceAnalyticsPage() {
  return (
    <div className="flex w-full flex-1 flex-col gap-8">
      <PageHeader description="Struktura posetilaca po tipu uređaja, geografskoj lokaciji i vremenu najvišeg angažovanja." />

      <div className="flex flex-1 flex-col">
        {/* useSearchParams (date range) needs a Suspense boundary on static routes. */}
        <Suspense
          fallback={
            <div className="flex flex-1 flex-col gap-8">
              <div className="h-12 w-full animate-pulse rounded-xl bg-line/40" />
            </div>
          }
        >
          <AudienceDashboard />
        </Suspense>
      </div>
    </div>
  );
}
