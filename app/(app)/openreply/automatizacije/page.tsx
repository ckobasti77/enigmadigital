import { PageHeader } from "@/components/app/page-header";
import { AutomationsDashboard } from "@/components/app/openreply/automations-dashboard";

export default function OpenReplyAutomationsPage() {
  return (
    <div className="flex w-full flex-1 flex-col gap-8">
      <PageHeader description="Podesi koje ključne reči u komentarima pokreću direktnu poruku i prati svaki poslati DM." />

      <div className="flex flex-1 flex-col">
        <AutomationsDashboard />
      </div>
    </div>
  );
}
