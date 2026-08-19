import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PublishComposer } from "@/components/app/instagram/publish-composer";

export default function InstagramPublishPage() {
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
      <h1 className="mt-2 text-h1 text-foreground">Nova objava</h1>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
        Slika, Reel, Story ili carousel — objavljeno odmah ili zakazano za
        kasnije. Instagram sam preuzima fajl sa privremene adrese, pa objava
        prolazi kroz nekoliko koraka i svaki od njih se vidi ovde.
      </p>

      <div className="mt-8 flex flex-1 flex-col">
        <PublishComposer />
      </div>
    </div>
  );
}
