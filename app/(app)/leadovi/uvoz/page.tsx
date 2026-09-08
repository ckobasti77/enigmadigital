import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import {
  ImportDashboard,
  ImportDashboardSkeleton,
} from "@/components/app/leadovi/import-dashboard";

export default function LeadImportPage() {
  return (
    <div className="flex w-full flex-1 flex-col gap-8">
      <PageHeader description="Uvoz Excel i CSV tabele sa lidovima, provera staging-a i primena u bazu podataka." />

      <div className="flex flex-1 flex-col">
        {/* `useSearchParams` (`?import=<id>` iz `/generate-leads/ingest`) traži
            Suspense granicu na statičkim rutama. */}
        <Suspense fallback={<ImportDashboardSkeleton />}>
          <ImportDashboard />
        </Suspense>
      </div>
    </div>
  );
}
