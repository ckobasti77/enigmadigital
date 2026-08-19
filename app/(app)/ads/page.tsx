import { Suspense } from "react";
import {
  AdsDashboard,
  AdsDashboardSkeleton,
} from "@/components/app/ads/ads-dashboard";

export default function AdsPage() {
  return (
    <div className="flex w-full flex-1 flex-col">
      <h1 className="text-h1 text-foreground">Plaćene kampanje</h1>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
        Pregled kampanja, hijerarhija ad setova i oglasa, analiza video kreativa
        (Hook/Hold rate) i demografska raspodela.
      </p>

      <div className="mt-8 flex flex-1 flex-col">
        {/* useSearchParams (date range) needs a Suspense boundary on static routes. */}
        <Suspense
          fallback={
            <div className="flex flex-1 flex-col gap-8">
              <AdsDashboardSkeleton />
            </div>
          }
        >
          <AdsDashboard />
        </Suspense>
      </div>
    </div>
  );
}
