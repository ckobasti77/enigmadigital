import { Suspense } from "react";
import {
  AdsDashboard,
  AdsDashboardSkeleton,
} from "@/components/app/ads/ads-dashboard";

export default function AdsPage() {
  return (
    <div className="flex w-full flex-1 flex-col">
      {/* Zaglavlje strane crta sam ekran: „Nova kampanja" postoji samo kad je
          nalog povezan. useSearchParams (period) traži Suspense granicu. */}
      <Suspense fallback={<AdsDashboardSkeleton />}>
        <AdsDashboard />
      </Suspense>
    </div>
  );
}
