import { Suspense } from "react";
import Link from "next/link";
import { MessagesSquare, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  FacebookDashboard,
  FacebookDashboardSkeleton,
} from "@/components/app/facebook/facebook-dashboard";

export default function FacebookPage() {
  return (
    <div className="flex w-full flex-1 flex-col">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-h1 text-foreground">Facebook stranica</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Pratioci, prikazi i angažovanja sa stranice, u odnosu na prethodni
            period iste dužine.
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            render={<Link href="/facebook/komentari" />}
            nativeButton={false}
            variant="outline"
            size="lg"
          >
            <MessagesSquare data-icon="inline-start" />
            Komentari
          </Button>

          <Button
            render={<Link href="/openreply/automatizacije" />}
            nativeButton={false}
            variant="outline"
            size="lg"
          >
            <Settings2 data-icon="inline-start" />
            Automatizacije
          </Button>
        </div>
      </div>

      <div className="mt-8 flex flex-1 flex-col">
        {/* useSearchParams (date range) needs a Suspense boundary on static routes. */}
        <Suspense
          fallback={
            <div className="flex flex-1 flex-col gap-8">
              <FacebookDashboardSkeleton />
            </div>
          }
        >
          <FacebookDashboard />
        </Suspense>
      </div>
    </div>
  );
}
