"use client";


// Preneto iz Devotion apps/web/components/workspace/chat/reaction-picker.tsx (main @ c05c40f), SPAJANJE S15.
import { SmilePlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { QUICK_REACTIONS } from "@/lib/prostor/web/chat";
import { cn } from "@/lib/utils";

/**
 * Kurirani brzi izbor reakcija (bez emoji biblioteke). Okidač je ghost dugme;
 * sadržaj je red čestih emodžija (sadržaj korisnika, ne ikonice) — izbor
 * prosleđuje emodži nagore.
 */
export function ReactionPicker({
  onSelect,
  className,
}: {
  onSelect: (emoji: string) => void;
  className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={cn("data-popup-open:bg-surface-control data-popup-open:text-foreground", className)}
            aria-label="Dodaj reakciju"
          />
        }
      >
        <SmilePlus aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="flex w-auto gap-1 p-1">
        {QUICK_REACTIONS.map((emoji) => (
          // Stavka menija: strelice biraju emodži, Enter potvrđuje.
          <DropdownMenuItem
            key={emoji}
            onClick={() => onSelect(emoji)}
            className="size-8 justify-center rounded-md p-0 text-lg leading-none pointer-coarse:size-11"
            aria-label={`Reaguj: ${emoji}`}
          >
            {emoji}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
