import { PageHeader } from "@/components/app/page-header";
import { NewCampaignWizard } from "@/components/app/ads/new-campaign-wizard";

export default function NewCampaignPage() {
  return (
    <div className="flex w-full flex-1 flex-col gap-6">
      <PageHeader
        variant="module"
        description="Kampanja, grupa oglasa i oglas u tri koraka; sve se kreira pauzirano."
        info="Sve prolazi kroz probnu proveru kod Mete i kreira se pauzirano — pokretanje je zaseban potez."
      />

      <div className="flex flex-1 flex-col">
        <NewCampaignWizard />
      </div>
    </div>
  );
}
