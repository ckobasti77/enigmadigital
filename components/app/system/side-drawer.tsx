"use client";

import type { ReactNode } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * ============================================================================
 * BOČNA FIOKA (A4 §1, plan O3)
 * ============================================================================
 *
 * „Više filtera" ne sme da bude padajući zid od jedanaest grupa iznad tabele:
 * dok je otvoren, gura sadržaj i sakriva ono zbog čega se filter i menja.
 * Fioka klizne sa desne strane, ostavlja tabelu na mestu i zatvara se `Esc`-om
 * ili klikom na zatamnjenje.
 *
 * Gradi se na POSTOJEĆEM `@base-ui/react/dialog` (bez novih zavisnosti — plan
 * §0/6): modalni dijalog sa fokus-zamkom i `Esc`-om, samo drugačije
 * pozicioniran. `data-open` / `data-closed` su base-ui atributi, isti koje
 * koriste `popover` i `dropdown-menu` u `components/ui/`.
 */
export function SideDrawer({
  open,
  onOpenChange,
  title,
  description,
  footer,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          className={cn(
            "fixed inset-0 z-50 bg-surface-overlay backdrop-blur-sm",
            "transition-opacity duration-(--duration-base) ease-(--ease-ui)",
            "data-closed:opacity-0 data-open:opacity-100 data-starting-style:opacity-0",
          )}
        />
        <DialogPrimitive.Popup
          data-slot="side-drawer"
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex w-[min(30rem,100vw)] flex-col border-l border-line bg-surface-raised shadow-elev-3 outline-hidden",
            "transition-transform duration-(--duration-base) ease-(--ease-ui)",
            "data-closed:translate-x-full data-open:translate-x-0 data-starting-style:translate-x-full",
            "motion-reduce:transition-none",
            className,
          )}
        >
          <div className="flex items-start gap-3 border-b border-line px-4 py-3">
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="text-title font-bold text-foreground">
                {title}
              </DialogPrimitive.Title>
              {description && (
                <DialogPrimitive.Description className="mt-0.5 text-meta text-text-muted">
                  {description}
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Zatvori"
                  className="shrink-0 text-text-muted hover:text-foreground"
                />
              }
            >
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>

          {footer && (
            <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-3">
              {footer}
            </div>
          )}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
