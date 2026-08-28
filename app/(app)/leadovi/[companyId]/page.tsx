import { Suspense } from "react";
import { LeadDetailPageClient } from "./lead-detail-page-client";
import { Skeleton } from "@/components/ui/skeleton";

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;

  return (
    <div className="flex w-full flex-1 flex-col">
      <Suspense
        fallback={
          <div className="flex flex-col gap-6 p-4">
            <Skeleton className="h-6 w-36" />
            <Skeleton className="h-48 w-full rounded-xl" />
          </div>
        }
      >
        <LeadDetailPageClient companyId={companyId} />
      </Suspense>
    </div>
  );
}
