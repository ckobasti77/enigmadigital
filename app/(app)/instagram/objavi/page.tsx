import { PageHeader } from "@/components/app/page-header";
import { PublishComposer } from "@/components/app/instagram/publish-composer";

export default function InstagramPublishPage() {
  return (
    <div className="flex w-full flex-1 flex-col gap-8">
      <PageHeader description="Slika, Reel, Story ili carousel — objavljeno odmah ili zakazano za kasnije. Instagram sam preuzima fajl sa privremene adrese, pa objava prolazi kroz nekoliko koraka i svaki od njih se vidi ovde." />

      <div className="flex flex-1 flex-col">
        <PublishComposer />
      </div>
    </div>
  );
}
