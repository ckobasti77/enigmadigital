import { PageHeader } from "@/components/app/page-header";
import { NewCampaignWizard } from "@/components/app/ads/new-campaign-wizard";

export default function NewCampaignPage() {
  return (
    <div className="flex w-full flex-1 flex-col gap-8">
      <PageHeader description="Napravi kampanju, ad set i oglas u tri koraka. Sve prolazi kroz validate_only proveru i kreira se pauzirano — pokretanje je zaseban potez." />

      <div className="flex flex-1 flex-col">
        <NewCampaignWizard />
      </div>
    </div>
  );
}
