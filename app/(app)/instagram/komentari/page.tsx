import { PageHeader } from "@/components/app/page-header";
import { CommentsModeration } from "@/components/app/instagram/comments-moderation";

export default function InstagramCommentsPage() {
  return (
    <div className="flex w-full flex-1 flex-col gap-8">
      <PageHeader description="Odgovori, sakrij ili obriši komentare na objavama naloga. Novi komentari stižu odmah preko webhook-a; sakrivanja i brisanja urađena u samoj Instagram aplikaciji stižu pri sinhronizaciji." />

      <div className="flex flex-1 flex-col">
        <CommentsModeration />
      </div>
    </div>
  );
}
