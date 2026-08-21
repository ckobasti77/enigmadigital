import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { InboxView } from "@/components/app/instagram/inbox/inbox-view";

export default function InstagramInboxPage() {
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
      <h1 className="mt-2 text-h1 text-foreground">Poruke (Inbox)</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Direktna dvosmerna komunikacija sa korisnicima, slanje tekstualnih poruka,
        priloga i brzih odgovora. Odgovori su dozvoljeni unutar 24 sata od poslednje
        poruke korisnika, u skladu sa Meta pravilima.
      </p>

      <div className="mt-6 flex flex-1 flex-col min-h-0">
        <InboxView />
      </div>
    </div>
  );
}
