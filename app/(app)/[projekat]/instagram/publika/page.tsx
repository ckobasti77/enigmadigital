import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import {
  InstagramDemographics,
  InstagramDemographicsSkeleton,
} from "@/components/app/instagram/instagram-demographics";

export default function InstagramPublikaPage() {
  return (
    <div className="flex w-full flex-1 flex-col gap-6">
      <PageHeader
        variant="module"
        description="Pratioci i angažovana publika po uzrastu, polu, državama i gradovima."
      />

      <div className="flex flex-1 flex-col">
        <Suspense fallback={<InstagramDemographicsSkeleton />}>
          <InstagramDemographics />
        </Suspense>
      </div>
    </div>
  );
}
