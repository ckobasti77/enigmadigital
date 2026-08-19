import { Suspense } from "react";
import Link from "next/link";
import { PenSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  InstagramDashboard,
  InstagramDashboardSkeleton,
} from "@/components/app/instagram/instagram-dashboard";

export default function InstagramPage() {
  return (
    <div className="flex w-full flex-1 flex-col">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-h1 text-foreground">Organski rast naloga</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Pratioci, doseg i angažovanje sa Instagram naloga, u odnosu na
            prethodni period iste dužine.
          </p>
        </div>

        <Button
          render={<Link href="/instagram/objavi" />}
          size="lg"
          className="shrink-0 font-semibold"
        >
          <PenSquare data-icon="inline-start" />
          Nova objava
        </Button>
      </div>

      <div className="mt-8 flex flex-1 flex-col">
        {/* useSearchParams (date range) needs a Suspense boundary on static routes. */}
        <Suspense
          fallback={
            <div className="flex flex-1 flex-col gap-8">
              <InstagramDashboardSkeleton />
            </div>
          }
        >
          <InstagramDashboard />
        </Suspense>
      </div>
    </div>
  );
}
