import { Suspense } from "react";
import {
  InstagramDashboard,
  InstagramDashboardSkeleton,
} from "@/components/app/instagram/instagram-dashboard";

export default function InstagramPage() {
  return (
    <div className="flex w-full flex-1 flex-col">
      <p className="heading-caps text-xs font-medium text-text-muted">
        Instagram · Organski rast
      </p>
      <h1 className="mt-2 text-h1 text-foreground">
        Instagram analitika
      </h1>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
        Pratioci, doseg i angažovanje sa Instagram naloga, u odnosu na
        prethodni period iste dužine.
      </p>

      <div className="mt-8 flex flex-1 flex-col">
        {/* useSearchParams (date range) needs a Suspense boundary on static routes. */}
        <Suspense
          fallback={
            <div className="flex flex-1 flex-col gap-6">
              <div className="h-8" />
              <InstagramDashboardSkeleton />
            </div>
          }
        >
          <InstagramDashboard />
        </Suspense>
      </div>
    </div>
  );
}
