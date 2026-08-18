import { Suspense } from "react";
import {
  YouTubeDashboard,
  YouTubeDashboardSkeleton,
} from "@/components/app/youtube/youtube-dashboard";

export default function YouTubePage() {
  return (
    <div className="flex w-full flex-1 flex-col">
      <p className="heading-caps text-xs font-medium text-text-muted">
        YouTube · Kanal
      </p>
      <h1 className="mt-2 text-3xl font-bold leading-tight tracking-tight text-foreground">
        YouTube analitika
      </h1>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
        Pregledi, vreme gledanja i pratioci sa kanala, u odnosu na prethodni
        period iste dužine.
      </p>

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
      </div>
    </div>
  );
}
