import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import { LeadsDashboard } from "@/components/app/leadovi/leads-dashboard";
import { Skeleton } from "@/components/ui/skeleton";

export default function LeadsPage() {
  return (
    <div className="flex w-full flex-1 flex-col gap-8">
      <PageHeader description="Pregled prodajnog toka, dvodimenzionalno bodovanje leadova (fit i intent), rupe u podacima i zaostali koraci." />

      <div className="flex flex-1 flex-col">
        {/* Filteri žive u URL-u (GL2, §7.1), pa dashboard čita `useSearchParams`
            — a to traži Suspense granicu iznad sebe. */}
        <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
          <LeadsDashboard />
        </Suspense>
      </div>
    </div>
  );
}
