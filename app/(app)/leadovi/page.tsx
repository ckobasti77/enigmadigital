import { PageHeader } from "@/components/app/page-header";
import { LeadsDashboard } from "@/components/app/leadovi/leads-dashboard";

export default function LeadsPage() {
  return (
    <div className="flex w-full flex-1 flex-col gap-8">
      <PageHeader description="Pregled prodajnog toka, dvodimenzionalno bodovanje leadova (fit i intent), rupe u podacima i zaostali koraci." />

      <div className="flex flex-1 flex-col">
        <LeadsDashboard />
      </div>
    </div>
  );
}
