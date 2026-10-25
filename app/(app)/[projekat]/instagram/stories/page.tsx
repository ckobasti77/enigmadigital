import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import {
  InstagramStories,
  InstagramStoriesSkeleton,
} from "@/components/app/instagram/instagram-stories";

export default function InstagramStoriesPage() {
  return (
    <div className="flex w-full flex-1 flex-col gap-6">
      <PageHeader
        variant="module"
        description="Aktivne priče sa odbrojavanjem do isteka, levak navigacije i arhiva metrika."
      />

      <div className="flex flex-1 flex-col">
        <Suspense fallback={<InstagramStoriesSkeleton />}>
          <InstagramStories />
        </Suspense>
      </div>
    </div>
  );
}
