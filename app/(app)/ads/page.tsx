import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import {
  AdsDashboard,
  AdsDashboardSkeleton,
} from "@/components/app/ads/ads-dashboard";

export default function AdsPage() {
  return (
    <div className="flex w-full flex-1 flex-col gap-8">
      <PageHeader description="Pregled kampanja, hijerarhija ad setova i oglasa, analiza video kreativa (Hook/Hold rate) i demografska raspodela." />

      <div className="flex flex-1 flex-col">
        {/* useSearchParams (date range) needs a Suspense boundary on static routes. */}
        <Suspense fallback={<AdsDashboardSkeleton />}>
          <AdsDashboard />
        </Suspense>
      </div>
    </div>
  );
}
