import { Suspense } from "react";
import {
  FacebookDashboard,
  FacebookDashboardSkeleton,
} from "@/components/app/facebook/facebook-dashboard";

export default function FacebookPage() {
  return (
    <div className="flex w-full flex-1 flex-col">
      {/* Zaglavlje strane crta sam ekran: primarno dugme zavisi od toga da li
          je stranica povezana. useSearchParams (period) traži Suspense. */}
      <Suspense fallback={<FacebookDashboardSkeleton />}>
        <FacebookDashboard />
      </Suspense>
    </div>
  );
}
