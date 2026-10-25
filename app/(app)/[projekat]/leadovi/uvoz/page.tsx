import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import {
  ImportDashboard,
  ImportDashboardSkeleton,
} from "@/components/app/leadovi/import-dashboard";

export default function LeadImportPage() {
  return (
    <div className="flex w-full flex-1 flex-col gap-6">
      <PageHeader
        variant="module"
        description="Tabela iz Excela ili CSV-a prolazi pregled pre nego što išta uđe u bazu."
        info={
          <>
            Fajl se prvo učita u pregled: za svaki red se vidi da li pravi novu
            firmu, spaja se sa postojećom ili čeka tvoju odluku. U bazu ulazi
            tek kad pritisneš „Primeni uvoz”. Redovi bez odluke ostaju da čekaju
            i mogu se rešiti i posle primene.
          </>
        }
      />

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
