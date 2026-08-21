import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import {
  InstagramStories,
  InstagramStoriesSkeleton,
} from "@/components/app/instagram/instagram-stories";

export default function InstagramStoriesPage() {
  return (
    <div className="flex w-full flex-1 flex-col gap-8">
      <PageHeader description="Pregled aktivnih priča u realnom vremenu, odbrojavanje do isteka, levak navigacije i istorijska arhiva sačuvanih metrika." />

      <div className="flex flex-1 flex-col">
        <Suspense fallback={<InstagramStoriesSkeleton />}>
          <InstagramStories />
        </Suspense>
      </div>
    </div>
  );
}
