import { Suspense } from "react";
import { PostDetailContainer } from "@/components/app/instagram/post-detail/post-detail-container";
import { PostDetailSkeleton } from "@/components/app/instagram/post-detail/post-detail-skeleton";

export default async function InstagramPostDetailPage({
  params,
}: {
  params: Promise<{ mediaId: string }>;
}) {
  const { mediaId } = await params;

  return (
    <div className="flex w-full flex-1 flex-col">
      <Suspense fallback={<PostDetailSkeleton />}>
        <PostDetailContainer mediaId={mediaId} />
      </Suspense>
    </div>
  );
}
