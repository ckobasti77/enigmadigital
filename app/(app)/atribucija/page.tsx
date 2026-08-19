import { Suspense } from "react";
import {
  AttributionDashboard,
  AttributionDashboardSkeleton,
} from "@/components/app/attribution/attribution-dashboard";

export default function AttributionPage() {
  return (
    <div className="flex w-full flex-1 flex-col">
      <p className="heading-caps text-micro font-medium text-text-muted">
        Atribucija · UTM & Funnel
      </p>
      <h1 className="mt-2 text-h1 text-foreground">
        UTM atribucija i levak konverzije
      </h1>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
        Spajanje OpenReply DM automatizacije sa GA4 sesijama i web
        konverzijama kroz standardizovane UTM parametre.
      </p>

      <div className="mt-8 flex flex-1 flex-col">
        {/* useSearchParams (date range) needs a Suspense boundary on static routes. */}
        <Suspense
          fallback={
            <div className="flex flex-1 flex-col gap-6">
              <div className="h-8" />
              <AttributionDashboardSkeleton />
            </div>
          }
        >
          <AttributionDashboard />
        </Suspense>
      </div>
    </div>
  );
}
