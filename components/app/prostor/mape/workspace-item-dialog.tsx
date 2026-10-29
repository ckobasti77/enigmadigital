"use client";


// Preneto iz Devotion apps/web/components/workspace/workspace-item-dialog.tsx (main @ c05c40f), SPAJANJE S14.
import {
  Maximize2,
  Minimize2,
  RectangleHorizontal,
  RotateCcw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type ItemSizePreset = "compact" | "standard" | "large";

export const ITEM_SIZE_DIMENSIONS: Record<
  ItemSizePreset,
  { width: number; height: number }
> = {
  compact: { width: 264, height: 196 },
  standard: { width: 360, height: 280 },
  large: { width: 520, height: 420 },
};

const SIZE_META = {
  compact: { label: "Kompaktan", icon: Minimize2 },
  standard: { label: "Standard", icon: RectangleHorizontal },
  large: { label: "Velik", icon: Maximize2 },
} satisfies Record<
  ItemSizePreset,
  { label: string; icon: typeof Minimize2 }
>;

export const workspaceItemDialogContentClass =
  "!left-0 !top-0 !h-[100dvh] !max-h-[100dvh] !w-screen !max-w-none !translate-x-0 !translate-y-0 gap-0 overflow-hidden rounded-none border-0 p-0 sm:!left-1/2 sm:!top-1/2 sm:!h-[min(90dvh,56rem)] sm:!max-h-[min(90dvh,56rem)] sm:!w-[calc(100%-2rem)] sm:!max-w-5xl sm:!-translate-x-1/2 sm:!-translate-y-1/2 sm:rounded-[1.5rem] sm:border";

export function ItemSizePicker({
  value,
  onChange,
  onReset,
  className,
}: {
  value?: ItemSizePreset;
  onChange: (preset: ItemSizePreset) => void;
  onReset?: () => void;
  className?: string;
}) {
  return (
    <fieldset className={cn("space-y-2", className)}>
      <legend className="text-sm font-medium">
        Veličina
      </legend>
      <div className="grid grid-cols-3 gap-2">
        {(Object.keys(SIZE_META) as ItemSizePreset[]).map((preset) => {
          const meta = SIZE_META[preset];
          const Icon = meta.icon;
          return (
            <Button
              key={preset}
              type="button"
              size="sm"
              variant="outline"
              aria-pressed={value === preset}
              className={cn(
                "h-10 min-w-0 gap-1.5 rounded-xl px-2 text-xs",
                value === preset && "border-line-strong bg-surface-control-hover text-foreground",
              )}
              onClick={() => onChange(preset)}
            >
              <Icon className="size-3.5 shrink-0" />
              <span className="truncate">{meta.label}</span>
            </Button>
          );
        })}
      </div>
      {onReset ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-9 w-full gap-1.5 rounded-xl text-xs text-muted-foreground hover:text-foreground"
          onClick={onReset}
        >
          <RotateCcw className="size-3.5" />
          Vrati početnu veličinu
        </Button>
      ) : null}
    </fieldset>
  );
}

export function ItemSizeMenu({
  onChange,
  onReset,
  className,
}: {
  onChange: (preset: ItemSizePreset) => void;
  onReset?: () => void;
  className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button type="button"
          size="sm"
          variant="outline"
          className={cn("h-10 rounded-xl", className)} />}>
          <RectangleHorizontal className="size-4" aria-hidden="true" />
          Veličina
        </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuGroup>
        <DropdownMenuLabel>Veličina kartice</DropdownMenuLabel>
        {(Object.keys(SIZE_META) as ItemSizePreset[]).map((preset) => {
          const meta = SIZE_META[preset];
          const Icon = meta.icon;
          return (
            <DropdownMenuItem
              key={preset}
              onClick={() => onChange(preset)}
            >
              <Icon className="size-4" aria-hidden="true" />
              {meta.label}
            </DropdownMenuItem>
          );
        })}
        </DropdownMenuGroup>
        {onReset ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onReset}>
              <RotateCcw className="size-4" aria-hidden="true" />
              Vrati početnu veličinu
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
