"use client";

// Preneto iz Devotion apps/web/components/workspace/move-to-area-menu.tsx (main @ c05c40f), SPAJANJE S10.
import { useState } from "react";
import { FolderOutput, LoaderCircle } from "lucide-react";
import { toast } from "@/lib/toast";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { accessErrorMessage } from "@/lib/prostor/web/greske";
import { cn } from "@/lib/utils";
import { useProjekatMutation } from "@/components/app/projekat-provider";

export type MoveToAreaOption = {
  _id: Id<"areas">;
  label: string;
};

/**
 * Eksplicitno premeštanje oblačića u drugu oblast — ista mutacija kao
 * prevlačenje u sidebar-u, ali dostupna i bez drag-and-drop-a (touch, meniji).
 * Cross-area premeštanje uvek sleće u koren ciljne oblasti; ugnežđivanje posle
 * ide kroz postojeći „Ugneždi u…” tok.
 */
export function MoveToAreaMenu({
  pageId,
  pageTitle,
  currentAreaId,
  areas,
  className,
  compact = false,
  asSubmenu = false,
  onMoved,
}: {
  pageId: Id<"pages">;
  pageTitle: string;
  currentAreaId: Id<"areas">;
  areas: MoveToAreaOption[];
  className?: string;
  compact?: boolean;
  /** Renderuje stavke kao podmeni postojećeg dropdown-a umesto samostalnog dugmeta. */
  asSubmenu?: boolean;
  onMoved?: (targetAreaId: Id<"areas">) => void;
}) {
  const movePage = useProjekatMutation(api.prostor.areasV2.movePage);
  const [busyAreaId, setBusyAreaId] = useState<Id<"areas"> | null>(null);

  const targets = areas.filter((area) => area._id !== currentAreaId);

  async function moveTo(target: MoveToAreaOption) {
    if (busyAreaId !== null) return;
    setBusyAreaId(target._id);
    try {
      // Premeštanje je uvek odmah (PROSTOR P4) — nema zahteva ni odobrenja.
      await movePage({
        pageId,
        targetAreaId: target._id,
        targetParentPageId: null,
      });
      toast.success(
        `„${pageTitle || "Stavka bez naslova"}“ je premeštena u „${target.label}“.`,
      );
      onMoved?.(target._id);
    } catch (error) {
      toast.error(
        accessErrorMessage(error, "Stavka nije premeštena."),
      );
    } finally {
      setBusyAreaId(null);
    }
  }

  const items = targets.map((target) => (
    <DropdownMenuItem
      key={target._id}
      disabled={busyAreaId !== null}
      onClick={() => void moveTo(target)}
    >
      {busyAreaId === target._id ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <FolderOutput className="size-4" aria-hidden="true" />
      )}
      <span className="min-w-0 flex-1 truncate">{target.label}</span>
    </DropdownMenuItem>
  ));

  if (asSubmenu) {
    return (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger disabled={targets.length === 0}>
          <FolderOutput className="size-4" aria-hidden="true" />
          Premesti u oblast
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="max-h-72 w-56 overflow-y-auto">
          {items}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={cn(compact && "h-8 gap-1.5 rounded-lg px-2.5 text-xs", className)}
            disabled={targets.length === 0 || busyAreaId !== null}
            aria-label={`Premesti ${pageTitle || "stavku bez naslova"} u drugu oblast`}
          />
        }
      >
        {busyAreaId !== null ? (
          <LoaderCircle className={cn("animate-spin", compact && "size-3.5")} aria-hidden="true" />
        ) : (
          <FolderOutput className={cn(compact && "size-3.5")} aria-hidden="true" />
        )}
        {compact ? "Premesti" : "Premesti u…"}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="max-h-72 w-[min(18rem,calc(100vw-2rem))] overflow-y-auto"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>Izaberi ciljnu oblast</DropdownMenuLabel>
          {items}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
