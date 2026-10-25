"use client";

import { useProjekat } from "@/components/app/projekat-provider";
import type { Id } from "@/convex/_generated/dataModel";
import { LeadDetail } from "@/components/app/leadovi/lead-detail";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { ProjekatLink } from "@/components/app/projekat-link";
import { ArrowLeft, AlertCircle } from "lucide-react";

export function LeadDetailPageClient({ companyId }: { companyId: string }) {
  const { spreman, workspaceId } = useProjekat();

  if (!spreman || workspaceId === null) {
    return (
      <div className="flex flex-col gap-6 py-6">
        <Skeleton className="h-6 w-36" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  const validCompanyId = companyId as Id<"leadCompanies">;

  return <LeadDetail companyId={validCompanyId} />;
}
