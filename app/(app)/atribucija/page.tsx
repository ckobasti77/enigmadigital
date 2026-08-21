import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import {
  AttributionDashboard,
  AttributionDashboardSkeleton,
} from "@/components/app/attribution/attribution-dashboard";

export default function AttributionPage() {
  return (
    <div className="flex w-full flex-1 flex-col gap-8">
      <PageHeader description="Spajanje OpenReply DM automatizacije sa GA4 sesijama i web konverzijama kroz standardizovane UTM parametre." />

      <div className="flex flex-1 flex-col">
        {/* useSearchParams (date range) needs a Suspense boundary on static routes. */}
        <Suspense fallback={<AttributionDashboardSkeleton />}>
          <AttributionDashboard />
        </Suspense>
      </div>
    </div>
  );
}
