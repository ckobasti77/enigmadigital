import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import {
  InstagramDashboard,
  InstagramDashboardSkeleton,
} from "@/components/app/instagram/instagram-dashboard";

export default function InstagramPage() {
  return (
    <div className="flex w-full flex-1 flex-col gap-8">
      {/* Podekrani (Publika, Priče, Inbox, Komentari, Nova objava) žive u traci
          sa jezičcima u ljusci — više se ne love kao dugmad sa ovog ekrana. */}
      <PageHeader description="Pratioci, doseg i angažovanje sa Instagram naloga, u odnosu na prethodni period iste dužine." />

      <div className="flex flex-1 flex-col">
        {/* useSearchParams (date range) needs a Suspense boundary on static routes. */}
        <Suspense fallback={<InstagramDashboardSkeleton />}>
          <InstagramDashboard />
        </Suspense>
      </div>
    </div>
  );
}
