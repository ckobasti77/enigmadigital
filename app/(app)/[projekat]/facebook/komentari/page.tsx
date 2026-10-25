import { PageHeader } from "@/components/app/page-header";
import { FbCommentsModeration } from "@/components/app/facebook/fb-comments-moderation";

export default function FacebookCommentsPage() {
  return (
    <div className="flex w-full flex-1 flex-col gap-6">
      <PageHeader
        variant="module"
        description="Odgovori, lajkuj, sakrij ili obriši komentare na objavama stranice."
        info="Novi komentari stižu odmah preko webhook-a; sakrivanja i brisanja urađena u Meta Business Suite-u stižu pri sinhronizaciji."
      />

      <div className="flex flex-1 flex-col">
        <FbCommentsModeration />
      </div>
    </div>
  );
}
