import { Suspense } from "react";
import {
  YouTubeDashboard,
  YouTubeDashboardSkeleton,
} from "@/components/app/youtube/youtube-dashboard";
import { YtMediaJobsPanel } from "@/components/app/youtube/yt-media-jobs-panel";
import { YouTubeAttribution } from "@/components/app/youtube/yt-attribution";

export default function YouTubePage() {
  return (
    <div className="flex w-full flex-1 flex-col gap-8">
      {/* Zaglavlje strane crta sam ekran: „Pošalji video" postoji samo kad je
          kanal povezan. useSearchParams (period) traži Suspense granicu. */}
      <Suspense fallback={<YouTubeDashboardSkeleton />}>
        <YouTubeDashboard />
      </Suspense>

      {/* Outside the dashboard on purpose: what an operator did to the
          channel has nothing to do with the selected date range, and the
          reason an upload failed must not disappear with an empty period. */}
      <YtMediaJobsPanel />

      <YouTubeAttribution />
    </div>
  );
}
