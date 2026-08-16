import { Suspense } from "react";
import {
  AdsDashboard,
  AdsDashboardSkeleton,
} from "@/components/app/ads/ads-dashboard";

export default function AdsPage() {
  return (
    <div className="flex w-full flex-1 flex-col">
      <p className="heading-caps text-xs font-medium text-text-muted">
        Plaćeni saobraćaj · Meta Marketing API
      </p>
      <h1 className="mt-2 text-3xl font-bold leading-tight tracking-tight text-foreground">
        Meta Ads kampanje
      </h1>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
        Pregled kampanja, hijerarhija ad setova i oglasa, analiza video kreativa
        (Hook/Hold rate) i demografska raspodela.
      </p>

      <div className="mt-8 flex flex-1 flex-col">
        {/* useSearchParams (date range) needs a Suspense boundary on static routes. */}
        <Suspense
          fallback={
            <div className="flex flex-1 flex-col gap-6">
              <div className="h-8" />
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
