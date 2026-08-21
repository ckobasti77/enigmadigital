import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import {
  AcquisitionDashboard,
} from "@/components/app/analytics/acquisition-dashboard";

export default function AcquisitionPage() {
  return (
    <div className="flex w-full flex-1 flex-col gap-8">
      <PageHeader description="Akvizicija korisnika i sesija kroz dva opsega: prvi dodir (akvizicija) i trenutna poseta (saobraćaj)." />

      <div className="flex flex-1 flex-col">
        {/* useSearchParams (date range) needs a Suspense boundary on static routes. */}
        <Suspense
          fallback={
            <div className="flex flex-1 flex-col gap-8">
              <div className="h-12 w-full animate-pulse rounded-xl bg-line/40" />
            </div>
          }
        >
          <AcquisitionDashboard />
        </Suspense>
      </div>
    </div>
  );
}
