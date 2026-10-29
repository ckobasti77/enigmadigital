"use client";

// Preneto iz Devotion apps/web/components/workspace/nesting-target-menu.tsx (main @ c05c40f), SPAJANJE S10.
import { useState } from "react";
import {
  FolderInput,
  LoaderCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Id } from "@/convex/_generated/dataModel";
import { pageKindMeta, type PageKind } from "@/lib/prostor/web/vrste-stranica";
import { cn } from "@/lib/utils";

export type NestingTargetOption = {
  pageId: Id<"pages">;
  title: string;
  kind: PageKind;
};

/**
 * „Ugnezdi u…" sa kartice Mape. Ugnežđavanje je odmah (PROSTOR P4); radnju,
 * toast i „Poništi" radi Mapa (`onNest`), isto kao prevlačenje na karticu.
 */
export function NestingTargetMenu({
  childTitle,
  candidates,
  onNest,
  className,
  compact = false,
}: {
  childTitle: string;
  candidates: NestingTargetOption[];
  onNest: (target: NestingTargetOption) => Promise<void>;
  className?: string;
  compact?: boolean;
}) {
  const [busyTargetId, setBusyTargetId] = useState<Id<"pages"> | null>(null);

  async function nestInto(target: NestingTargetOption) {
    if (busyTargetId !== null) return;
    setBusyTargetId(target.pageId);
    try {
      await onNest(target);
    } finally {
      setBusyTargetId(null);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button type="button"
          size="sm"
          variant="ghost"
          className={cn(
            "h-8 gap-1.5 rounded-lg px-2.5 text-xs",
            className,
          )}
          disabled={candidates.length === 0 || busyTargetId !== null}
          aria-label={`Ugnezdi ${childTitle || "stavku bez naslova"} u drugu karticu`} />}>
          {busyTargetId !== null ? (
            <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : (
            <FolderInput className="size-3.5" aria-hidden="true" />
          )}
          {compact ? "Ugnezdi" : "Ugnezdi u…"}
        </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="max-h-72 w-[min(20rem,calc(100vw-2rem))] overflow-y-auto"
      >
        <DropdownMenuLabel>Ugnezdi u…</DropdownMenuLabel>
        {candidates.map((candidate) => {
          const Icon =
            pageKindMeta(candidate.kind).icon;
          return (
            <DropdownMenuItem
              key={candidate.pageId}
              disabled={busyTargetId !== null}
              onClick={() => void nestInto(candidate)}
            >
              <Icon className="size-4" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">
                {candidate.title || "Bez naslova"}
              </span>
              <span className="text-xs text-muted-foreground">
                {pageKindMeta(candidate.kind).label}
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
