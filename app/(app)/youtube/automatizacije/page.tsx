import { PageHeader } from "@/components/app/page-header";
import { YtAutomationsDashboard } from "@/components/app/youtube/yt-automations-dashboard";
import { YouTubeAttribution } from "@/components/app/youtube/yt-attribution";

export default function YouTubeAutomationsPage() {
  return (
    <div className="flex w-full flex-1 flex-col gap-6">
      <PageHeader
        variant="module"
        description="Ključne reči u komentarima pokreću javan odgovor sa kanala ili moderaciju."
        info="Jezičak „Log komentara“ pokazuje svaki obrađen komentar."
      />

      <div className="flex flex-1 flex-col gap-8">
        <YtAutomationsDashboard />

        <YouTubeAttribution />
      </div>
    </div>
  );
}
