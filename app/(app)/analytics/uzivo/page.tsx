import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import {
  RealtimeDashboard,
  RealtimeDashboardSkeleton,
} from "@/components/app/analytics/realtime-dashboard";

export default function RealtimePage() {
  return (
    <div className="flex w-full flex-1 flex-col gap-8">
      <PageHeader description="Trenutna aktivnost posetilaca na sajtu u poslednjih 30 minuta sa automatskim osvežavanjem." />

      <div className="flex flex-1 flex-col">
        <Suspense fallback={<RealtimeDashboardSkeleton />}>
          <RealtimeDashboard />
        </Suspense>
      </div>
    </div>
  );
}
