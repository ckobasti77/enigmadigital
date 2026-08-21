import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import {
  InstagramDemographics,
  InstagramDemographicsSkeleton,
} from "@/components/app/instagram/instagram-demographics";

export default function InstagramPublikaPage() {
  return (
    <div className="flex w-full flex-1 flex-col gap-8">
      <PageHeader description="Demografska struktura pratilaca i angažovane publike po uzrastu, polu, državama i gradovima za izabrani vremenski okvir." />

      <div className="flex flex-1 flex-col">
        <Suspense fallback={<InstagramDemographicsSkeleton />}>
          <InstagramDemographics />
        </Suspense>
      </div>
    </div>
  );
}
