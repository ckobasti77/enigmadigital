import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import { CommandTop } from "@/components/app/overview/command-focus";
import {
  OverviewDashboard,
  OverviewSkeleton,
} from "@/components/app/overview/overview-dashboard";

export default function OverviewPage() {
  return (
    <div className="flex w-full flex-1 flex-col gap-6">
      <PageHeader
        variant="module"
        description="Šta danas da uradiš, šta te čeka i kako kanali stoje u izabranom periodu."
        info={
          <>
            Gore su misije dana i nedeljni ciljevi, izvedeni iz onoga što je
            stvarno urađeno. Ispod je spisak iz zvona, pa GA4 sesije, Instagram
            doseg, OpenReply poruke i leadovi koji još nisu zvani. Period se
            bira u gornjoj traci, pamti se za ovaj projekat i prenosi na
            ekrane koji ga koriste.
          </>
        }
      />

      {/* Šta treba uraditi stoji IZNAD onoga kako je bilo (A2 §4): fokus
          kartica „Danas", pa „Šta me čeka". */}
      <CommandTop />

      <div className="flex flex-1 flex-col">
        {/* useSearchParams (date range) needs a Suspense boundary on static routes. */}
        <Suspense fallback={<OverviewSkeleton />}>
          <OverviewDashboard />
        </Suspense>
      </div>
    </div>
  );
}
