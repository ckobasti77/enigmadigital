import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import {
  YouTubeDashboard,
  YouTubeDashboardSkeleton,
} from "@/components/app/youtube/youtube-dashboard";
import { YtUploadButton } from "@/components/app/youtube/yt-upload-dialog";
import { YtMediaJobsPanel } from "@/components/app/youtube/yt-media-jobs-panel";
import { YouTubeAttribution } from "@/components/app/youtube/yt-attribution";

export default function YouTubePage() {
  return (
    <div className="flex w-full flex-1 flex-col gap-8">
      <PageHeader
        description="Pregledi, vreme gledanja i pratioci sa kanala, u odnosu na prethodni period iste dužine."
        actions={<YtUploadButton />}
      />

      <div className="flex flex-1 flex-col gap-8">
        {/* useSearchParams (date range) needs a Suspense boundary on static routes. */}
        <Suspense fallback={<YouTubeDashboardSkeleton />}>
          <YouTubeDashboard />
        </Suspense>

        {/* Outside the dashboard on purpose: what an operator did to the
            channel has nothing to do with the selected date range, and the
            reason an upload failed must not disappear with an empty period. */}
        <YtMediaJobsPanel />

        <YouTubeAttribution />
      </div>
    </div>
  );
}
