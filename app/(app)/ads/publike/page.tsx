import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import { AudiencesView } from "@/components/app/ads/audiences-view";

export default function AdsAudiencesPage() {
  return (
    <div className="flex w-full flex-1 flex-col gap-6">
      <PageHeader
        variant="module"
        description="Prilagođene i slične publike: status isporuke, procena veličine i uslovi korišćenja."
      />

      <div className="flex flex-1 flex-col">
        <Suspense
          fallback={
            <div className="h-64 w-full animate-pulse rounded-xl bg-surface-raised" />
          }
        >
          <AudiencesView />
        </Suspense>
      </div>
    </div>
  );
}
