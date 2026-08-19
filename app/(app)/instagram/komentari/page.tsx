import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CommentsModeration } from "@/components/app/instagram/comments-moderation";

export default function InstagramCommentsPage() {
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
      <h1 className="mt-2 text-h1 text-foreground">Moderacija komentara</h1>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
        Odgovori, sakrij ili obriši komentare na objavama naloga. Novi komentari
        stižu odmah preko webhook-a; sakrivanja i brisanja urađena u samoj
        Instagram aplikaciji stižu pri sinhronizaciji.
      </p>

      <div className="mt-8 flex flex-1 flex-col">
        <CommentsModeration />
      </div>
    </div>
  );
}
