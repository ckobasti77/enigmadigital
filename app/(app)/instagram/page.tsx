import { Suspense } from "react";
import {
  InstagramDashboard,
  InstagramDashboardSkeleton,
} from "@/components/app/instagram/instagram-dashboard";

export default function InstagramPage() {
  return (
    <div className="flex w-full flex-1 flex-col">
      {/* Zaglavlje strane crta sam ekran: primarno dugme zavisi od toga da li
          je nalog povezan. useSearchParams (period) traži Suspense granicu. */}
      <Suspense fallback={<InstagramDashboardSkeleton />}>
        <InstagramDashboard />
      </Suspense>
    </div>
  );
}
