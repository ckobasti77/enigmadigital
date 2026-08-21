"use client";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function PostDetailSkeleton() {
  return (
    <div className="flex flex-col gap-10 pb-16">
      {/* Header Skeleton */}
      <Card className="overflow-hidden p-6 shadow-card ring-line">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_1fr]">
          <Skeleton className="aspect-square w-full max-w-[320px] rounded-xl mx-auto lg:mx-0" />
          <div className="flex flex-col justify-between gap-6">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <Skeleton className="h-6 w-24 rounded-md" />
                <Skeleton className="h-4 w-40 rounded" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-28 w-full rounded-lg" />
              </div>
            </div>
            <Skeleton className="h-9 w-36 rounded-lg" />
          </div>
        </div>
      </Card>

      {/* Profile actions skeleton */}
      <div className="flex flex-col gap-4">
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-6 w-48" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>
        <Skeleton className="h-44 w-full rounded-xl" />
      </div>

      {/* Reach section skeleton */}
      <div className="flex flex-col gap-4">
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-6 w-40" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      </div>

      {/* Interactions section skeleton */}
      <div className="flex flex-col gap-4">
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-6 w-44" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
