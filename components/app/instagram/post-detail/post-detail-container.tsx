"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PostDetailView } from "./post-detail-view";
import { PostDetailSkeleton } from "./post-detail-skeleton";

export function PostDetailContainer({ mediaId }: { mediaId: string }) {
  const data = useQuery(api.instagramStore.getMediaDetail, { mediaId });

  if (data === undefined) {
    return <PostDetailSkeleton />;
  }

  if (data === null) {
    return (
      <div className="flex flex-col gap-6 py-12">
        <Link
          href="/instagram"
          className="inline-flex w-fit items-center gap-1.5 text-xs text-text-muted transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          <span>Nazad na sve objave</span>
        </Link>

        <Card className="flex flex-col items-center justify-center gap-4 p-12 text-center shadow-card ring-line">
          <div className="flex size-12 items-center justify-center rounded-full bg-surface-raised text-text-muted">
            <AlertCircle className="size-6 text-accent-400" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-foreground">
              Objava nije pronađena
            </h2>
            <p className="max-w-md text-xs text-text-muted">
              Objava sa identifikatorom <span className="font-mono">{mediaId}</span> nije pronađena u bazi podataka vašeg radnog prostora.
            </p>
          </div>
          <Button
            render={<Link href="/instagram" />}
            nativeButton={false}
            variant="outline"
            className="mt-2 text-xs"
          >
            Vrati se na listu objava
          </Button>
        </Card>
      </div>
    );
  }

  return <PostDetailView media={data.media} breakdowns={data.breakdowns} />;
}
