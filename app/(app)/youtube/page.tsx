import { Suspense } from "react";
import Link from "next/link";
import { Settings2 } from "lucide-react";
import {
  YouTubeDashboard,
  YouTubeDashboardSkeleton,
} from "@/components/app/youtube/youtube-dashboard";
import { YtUploadButton } from "@/components/app/youtube/yt-upload-dialog";
import { YtMediaJobsPanel } from "@/components/app/youtube/yt-media-jobs-panel";
import { YouTubeAttribution } from "@/components/app/youtube/yt-attribution";

export default function YouTubePage() {
  return (
    <div className="flex w-full flex-1 flex-col">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="heading-caps text-micro font-medium text-text-muted">
            YouTube · Kanal
          </p>
          <h1 className="mt-2 text-h1 text-foreground">
            YouTube analitika
          </h1>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
            Pregledi, vreme gledanja i pratioci sa kanala, u odnosu na prethodni
            period iste dužine.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/youtube/automatizacije"
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-medium text-foreground transition-colors hover:border-accent-400/50 hover:bg-surface-raised"
          >
            <Settings2 className="size-3.5 text-accent-400" aria-hidden />
            <span>Upravljaj automatizacijama</span>
          </Link>
          <YtUploadButton />
        </div>
      </div>

      <div className="mt-8 flex flex-1 flex-col">
        {/* useSearchParams (date range) needs a Suspense boundary on static routes. */}
        <Suspense
          fallback={
            <div className="flex flex-1 flex-col gap-6">
              <div className="h-8" />
              <YouTubeDashboardSkeleton />
            </div>
          }
        >
          <YouTubeDashboard />
        </Suspense>

        {/* Outside the dashboard on purpose: what an operator did to the
            channel has nothing to do with the selected date range, and the
            reason an upload failed must not disappear with an empty period. */}
        <div className="mt-8">
          <YtMediaJobsPanel />
        </div>

        <YouTubeAttribution />
      </div>
    </div>
  );
}
