import { PageHeader } from "@/components/app/page-header";
import { InboxView } from "@/components/app/instagram/inbox/inbox-view";

export default function InstagramInboxPage() {
  return (
    <div className="flex w-full flex-1 flex-col gap-6">
      <PageHeader
        variant="module"
        description="Poruke sa korisnicima: tekst, prilozi i brzi odgovori."
        info="Odgovori su dozvoljeni unutar 24 sata od poslednje poruke korisnika, u skladu sa Meta pravilima."
      />

      <div className="flex min-h-0 flex-1 flex-col">
        <InboxView />
      </div>
    </div>
  );
}
