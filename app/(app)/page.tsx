import { Suspense } from "react";
import {
  OverviewDashboard,
  OverviewSkeleton,
} from "@/components/app/overview/overview-dashboard";

export default function OverviewPage() {
  return (
    <div className="flex w-full flex-1 flex-col">
      <p className="heading-caps text-xs font-medium text-text-muted">
        Pregled · Komandni centar
      </p>
      <h1 className="mt-2 text-h1 text-foreground">
        Dnevni pregled performansi
      </h1>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
        Ključni pokazatelji na jednom ekranu: GA4 sesije i konverzije, Instagram
        doseg, OpenReply automatizacija i stanje sinhronizacije.
      </p>

      <div className="mt-8 flex flex-1 flex-col">
        {/* useSearchParams (date range) needs a Suspense boundary on static routes. */}
        <Suspense fallback={<OverviewSkeleton />}>
          <OverviewDashboard />
        </Suspense>
      </div>
    </div>
  );
}
