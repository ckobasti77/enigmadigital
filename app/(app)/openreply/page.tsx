import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import {
  OpenReplyDashboard,
  OpenReplyDashboardSkeleton,
} from "@/components/app/openreply/openreply-dashboard";

export default function OpenReplyPage() {
  return (
    <div className="flex w-full flex-1 flex-col gap-8">
      <PageHeader description="Poslate direktne poruke, klikovi na linkove i CTR po kampanjama i vremenu iz OpenReply sistema." />

      <div className="flex flex-1 flex-col">
        {/* useSearchParams (date range) needs a Suspense boundary on static routes. */}
        <Suspense fallback={<OpenReplyDashboardSkeleton />}>
          <OpenReplyDashboard />
        </Suspense>
      </div>
    </div>
  );
}
