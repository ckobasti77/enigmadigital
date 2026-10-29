"use client";

// Preneto iz Devotion apps/web/components/collab/lock.tsx (main @ c05c40f), SPAJANJE S11.
import { Lock } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { LOCK_NOTICE, lockedByLabel } from "@/lib/prostor/modeli/collab-model";

/**
 * Oznaka „Zaključano" (K07 §6.3): ikonica i reč; ko i kada u opisu (tooltip i
 * ime za čitač ekrana). Fokusabilna, da opis stigne i sa tastature.
 */
export function LockBadge({
  lockedByName,
  lockedAt,
  now,
  className,
}: {
  lockedByName: string | null;
  lockedAt: number | null;
  now: number;
  className?: string;
}) {
  const detail = lockedByLabel({ lockedByName, lockedAt, now });
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            tabIndex={0}
            className={cn(
              "inline-flex items-center gap-1 rounded-md text-meta text-text-secondary outline-none focus-visible:ring-2 focus-visible:ring-ring",
              className,
            )}
          />
        }
      >
        <Lock className="size-3.5" aria-hidden="true" />
        Zaključano
        <span className="sr-only">. {detail}</span>
      </TooltipTrigger>
      <TooltipContent>{detail}</TooltipContent>
    </Tooltip>
  );
}

/** Traka ispod naslova kad je stranica zaključana, a gledalac ne sme da je menja. */
export function LockNotice({ className, text = LOCK_NOTICE }: { className?: string; text?: string }) {
  return (
    <p
      className={cn(
        "flex items-start gap-2 rounded-lg border border-line bg-muted px-3 py-2 text-ui leading-6 text-text-secondary",
        className,
      )}
    >
      <Lock className="mt-1 size-4 shrink-0" aria-hidden="true" />
      <span>{text}</span>
    </p>
  );
}
