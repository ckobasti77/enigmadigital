import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import {
  FacebookDashboard,
  FacebookDashboardSkeleton,
} from "@/components/app/facebook/facebook-dashboard";

export default function FacebookPage() {
  return (
    <div className="flex w-full flex-1 flex-col gap-8">
      <PageHeader description="Pratioci, prikazi i angažovanja sa stranice, u odnosu na prethodni period iste dužine." />

      <div className="flex flex-1 flex-col">
        {/* useSearchParams (date range) needs a Suspense boundary on static routes. */}
        <Suspense fallback={<FacebookDashboardSkeleton />}>
          <FacebookDashboard />
        </Suspense>
      </div>
    </div>
  );
}
