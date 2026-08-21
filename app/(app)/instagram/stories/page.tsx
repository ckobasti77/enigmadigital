import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  InstagramStories,
  InstagramStoriesSkeleton,
} from "@/components/app/instagram/instagram-stories";

export default function InstagramStoriesPage() {
  return (
    <div className="flex w-full flex-1 flex-col">
      <Link
        href="/instagram"
        className="inline-flex w-fit items-center gap-1.5 text-xs text-text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        <span>Nazad na Instagram</span>
      </Link>

      <p className="heading-caps mt-4 text-micro font-medium text-text-muted">
        Kanali · Instagram
      </p>
      <h1 className="mt-2 text-h1 text-foreground">Instagram priče (Stories)</h1>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
        Pregled aktivnih priča u realnom vremenu, odbrojavanje do isteka, levak
        navigacije i istorijska arhiva sačuvanih metrika.
      </p>

      <div className="mt-8 flex flex-1 flex-col">
        <Suspense
          fallback={
            <div className="flex flex-1 flex-col gap-8">
              <InstagramStoriesSkeleton />
            </div>
          }
        >
          <InstagramStories />
        </Suspense>
      </div>
    </div>
  );
}
