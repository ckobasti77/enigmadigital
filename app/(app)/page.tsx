import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import {
  OverviewDashboard,
  OverviewSkeleton,
} from "@/components/app/overview/overview-dashboard";

export default function OverviewPage() {
  return (
    <div className="flex w-full flex-1 flex-col gap-8">
      <PageHeader description="Ključni pokazatelji na jednom ekranu: GA4 sesije i konverzije, Instagram doseg, OpenReply automatizacija i stanje sinhronizacije. Period se bira u gornjoj traci i važi na svim ekranima." />

      <div className="flex flex-1 flex-col">
        {/* useSearchParams (date range) needs a Suspense boundary on static routes. */}
        <Suspense fallback={<OverviewSkeleton />}>
          <OverviewDashboard />
        </Suspense>
      </div>
    </div>
  );
}
