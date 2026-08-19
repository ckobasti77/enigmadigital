import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { YtAutomationsDashboard } from "@/components/app/youtube/yt-automations-dashboard";
import { YouTubeAttribution } from "@/components/app/youtube/yt-attribution";

export default function YouTubeAutomationsPage() {
  return (
    <div className="flex w-full flex-1 flex-col">
      <Link
        href="/youtube"
        className="inline-flex w-fit items-center gap-1.5 text-xs text-text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        <span>Nazad na YouTube</span>
      </Link>

      <p className="heading-caps mt-4 text-micro font-medium text-text-muted">
        Automatizacija · YouTube
      </p>
      <h1 className="mt-2 text-h1 text-foreground">
        Automatizacije i log komentara
      </h1>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
        Podesi koje ključne reči u komentarima pokreću javan odgovor sa kanala
        ili moderaciju, i prati svaki obrađen komentar.
      </p>

      <div className="mt-8 flex flex-1 flex-col">
        <YtAutomationsDashboard />

        <YouTubeAttribution />
      </div>
    </div>
  );
}
