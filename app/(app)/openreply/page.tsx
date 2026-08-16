import { Suspense } from "react";
import {
  OpenReplyDashboard,
  OpenReplyDashboardSkeleton,
} from "@/components/app/openreply/openreply-dashboard";

export default function OpenReplyPage() {
  return (
    <div className="flex w-full flex-1 flex-col">
      <p className="heading-caps text-xs font-medium text-text-muted">
        Automatizacija · OpenReply
      </p>
      <h1 className="mt-2 text-3xl font-bold leading-tight tracking-tight text-foreground">
        Instagram DM automatizacija
      </h1>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
        Poslate direktne poruke, klikovi na linkove i CTR po kampanjama i
        vremenu iz OpenReply sistema.
      </p>

      <div className="mt-8 flex flex-1 flex-col">
        {/* useSearchParams (date range) needs a Suspense boundary on static routes. */}
        <Suspense
          fallback={
            <div className="flex flex-1 flex-col gap-6">
              <div className="h-8" />
              <OpenReplyDashboardSkeleton />
            </div>
          }
        >
          <OpenReplyDashboard />
        </Suspense>
      </div>
    </div>
  );
}
