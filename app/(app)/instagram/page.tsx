import { Suspense } from "react";
import Link from "next/link";
import { Clock, MessageCircle, MessagesSquare, PenSquare, Users } from "lucide-react";
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

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            render={<Link href="/instagram/inbox" />}
            nativeButton={false}
            variant="outline"
            size="lg"
          >
            <MessageCircle data-icon="inline-start" />
            Poruke
          </Button>

          <Button
            render={<Link href="/instagram/stories" />}
            nativeButton={false}
            variant="outline"
            size="lg"
          >
            <Clock data-icon="inline-start" />
            Priče
          </Button>

          <Button
            render={<Link href="/instagram/publika" />}
            nativeButton={false}
            variant="outline"
            size="lg"
          >
            <Users data-icon="inline-start" />
            Publika
          </Button>

          <Button
            render={<Link href="/instagram/komentari" />}
            nativeButton={false}
            variant="outline"
            size="lg"
          >
            <MessagesSquare data-icon="inline-start" />
            Komentari
          </Button>

          <Button
            render={<Link href="/instagram/objavi" />}
            nativeButton={false}
            size="lg"
            className="font-semibold"
          >
            <PenSquare data-icon="inline-start" />
            Nova objava
          </Button>
        </div>
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
