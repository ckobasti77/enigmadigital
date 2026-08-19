import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { FbCommentsModeration } from "@/components/app/facebook/fb-comments-moderation";

export default function FacebookCommentsPage() {
  return (
    <div className="flex w-full flex-1 flex-col">
      <Link
        href="/facebook"
        className="inline-flex w-fit items-center gap-1.5 text-xs text-text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        <span>Nazad na Facebook</span>
      </Link>

      <p className="heading-caps mt-4 text-micro font-medium text-text-muted">
        Kanali · Facebook
      </p>
      <h1 className="mt-2 text-h1 text-foreground">Moderacija komentara</h1>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
        Odgovori, lajkuj, sakrij ili obriši komentare na objavama stranice. Novi
        komentari stižu odmah preko webhook-a; sakrivanja i brisanja urađena u
        Meta Business Suite-u stižu pri sinhronizaciji.
      </p>

      <div className="mt-8 flex flex-1 flex-col">
        <FbCommentsModeration />
      </div>
    </div>
  );
}
