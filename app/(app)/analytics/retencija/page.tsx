import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import {
  RetentionDashboard,
  RetentionDashboardSkeleton,
} from "@/components/app/analytics/retention-dashboard";

export default function RetentionPage() {
  return (
    <div className="flex w-full flex-1 flex-col gap-8">
      <PageHeader description="Nedeljna kohortna analiza i stopa zadržavanja (retencije) korisnika kroz 12 nedelja." />

      <div className="flex flex-1 flex-col">
        <Suspense fallback={<RetentionDashboardSkeleton />}>
          <RetentionDashboard />
        </Suspense>
      </div>
    </div>
  );
}
