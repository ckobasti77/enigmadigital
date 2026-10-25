import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import { PostDetailContainer } from "@/components/app/instagram/post-detail/post-detail-container";
import { PostDetailSkeleton } from "@/components/app/instagram/post-detail/post-detail-skeleton";

export default async function InstagramPostDetailPage({
  params,
}: {
  params: Promise<{ mediaId: string }>;
}) {
  const { mediaId } = await params;

  return (
    <div className="flex w-full flex-1 flex-col gap-6">
      <PageHeader
        variant="module"
        description="Metrike, publika i komentari jedne objave."
      />

      <Suspense fallback={<PostDetailSkeleton />}>
        <PostDetailContainer mediaId={mediaId} />
      </Suspense>
    </div>
  );
}
