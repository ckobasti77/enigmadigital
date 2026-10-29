"use client";

// Preneto iz Devotion apps/web/components/workspace/detach-page-button.tsx (main @ c05c40f), SPAJANJE S10.
import { useState } from "react";
import { FolderOutput, LoaderCircle } from "lucide-react";
import { toast } from "@/lib/toast";

import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { accessErrorMessage } from "@/lib/prostor/web/greske";
import { useProjekatMutation } from "@/components/app/projekat-provider";

export function DetachPageButton({
  pageId,
  title,
  compact = false,
  className,
}: {
  pageId: Id<"pages">;
  title: string;
  compact?: boolean;
  className?: string;
}) {
  const detachPage = useProjekatMutation(api.prostor.areasV2.detachPage);
  const [busy, setBusy] = useState(false);

  async function detach() {
    if (busy) return;
    if (
      !window.confirm(
        `Odvojiti „${title || "stavku bez naslova"}“ od nadređene stavke i vratiti je u koren oblasti?`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const result = await detachPage({ pageId });
      if (result.status !== "detached") {
        throw new Error("Stavka više nije ugnežđena.");
      }
      toast.success("Stavka je odvojena i vraćena u koren oblasti.");
    } catch (error) {
      toast.error(
        accessErrorMessage(error, "Stavka nije odvojena."),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className={cn(
        "h-8 gap-1.5 rounded-lg px-2.5 text-xs",
        className,
      )}
      disabled={busy}
      aria-label={`Odvoji ${title || "stavku bez naslova"} u koren oblasti`}
      onClick={() => void detach()}
    >
      {busy ? (
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <FolderOutput className="size-3.5" aria-hidden="true" />
      )}
      {compact ? "Odvoji" : "Odvoji u oblast"}
    </Button>
  );
}
