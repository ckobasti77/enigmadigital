"use client";

import * as React from "react";
import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * ============================================================================
 * FIOKA (P11, plan S07 §5.1, D17)
 * ============================================================================
 *
 * Panel koji klizne sa ivice i ne gubi stranicu ispod: panel zadatka, detalj
 * ideje, istorija izmena, pregled stranice (sa desne strane), a na telefonu
 * „Više“ i filteri (odozdo). Base UI Drawer: fokus ostaje u panelu dok je
 * otvoren, `Esc` i klik na zatamnjenje zatvaraju, a prevlačenje ka ivici
 * zatvara na dodir.
 *
 * API je Devotion `components/motion/drawer.tsx` (`open`, `onOpenChange`,
 * `title`, `description`, `width`, `header`, `footer`, `initialFocus`,
 * `returnFocusFallback`, `onExited`, `closeLabel`), pa preneti panel menja
 * samo uvoz. Novo je `strana` („desno“ ili „dole“).
 *
 * Pokret je CSS prelaz na Base UI stanjima (`data-starting-style`,
 * `data-ending-style`), a ne GSAP nad slojem koji ostaje u DOM-u: Base UI čeka da se prelaz
 * završi pa tek onda skida panel, a prelaz kreće od zatečenog položaja (i
 * posle prevlačenja). Pod smanjenim pokretom globalno pravilo ostavlja samo
 * neprozirnost.
 */
type Strana = "desno" | "dole";

export type DrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Ime panela; uz `header` ostaje samo za čitač ekrana. */
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Najveća širina panela sa desne strane; na uskom ekranu panel je pune širine. */
  width?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  /** Sopstveno zaglavlje (npr. panel zadatka: znak projekta + naslov u mestu). */
  header?: React.ReactNode;
  /**
   * Fokus pri otvaranju: prvi kontrol (podrazumevano) ili sam panel — kad je
   * prvi kontrol polje za izmenu ili kvačica, ne sme se slučajno kucati.
   */
  initialFocus?: "first" | "panel";
  /** Gde ide fokus posle zatvaranja kad element koji je otvorio panel više ne postoji. */
  returnFocusFallback?: () => HTMLElement | null;
  /** Posle izlaza (panel skinut) — kontejner može da pusti pretplate. */
  onExited?: () => void;
  /** Ime dugmeta za zatvaranje. */
  closeLabel?: string;
  strana?: Strana;
};

export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  width = "28rem",
  children,
  footer,
  className,
  header,
  initialFocus = "first",
  returnFocusFallback,
  onExited,
  closeLabel = "Zatvori",
  strana = "desno",
}: DrawerProps) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const desno = strana === "desno";

  return (
    <DrawerPrimitive.Root
      open={open}
      onOpenChange={(sledece) => onOpenChange(sledece)}
      onOpenChangeComplete={(otvoren) => {
        if (!otvoren) onExited?.();
      }}
      swipeDirection={desno ? "right" : "down"}
    >
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Backdrop
          className={cn(
            "fixed inset-0 z-50 min-h-dvh bg-surface-overlay backdrop-blur-sm",
            "opacity-[calc(1-var(--drawer-swipe-progress,0))]",
            "transition-opacity duration-(--duration-base) ease-(--ease-ui)",
            "data-swiping:duration-0 data-starting-style:opacity-0 data-ending-style:opacity-0",
          )}
        />
        <DrawerPrimitive.Viewport
          className={cn(
            "fixed inset-0 z-50 flex",
            desno ? "items-stretch justify-end" : "items-end justify-stretch",
          )}
        >
          <DrawerPrimitive.Popup
            ref={panelRef}
            data-slot="drawer"
            data-strana={strana}
            initialFocus={initialFocus === "panel" ? panelRef : true}
            finalFocus={
              returnFocusFallback
                ? () => {
                    const pre = document.activeElement;
                    return pre instanceof HTMLElement && pre.isConnected && pre !== document.body
                      ? true
                      : returnFocusFallback();
                  }
                : true
            }
            style={desno ? { maxWidth: `min(${width}, 100vw)` } : undefined}
            className={cn(
              "flex flex-col bg-surface-raised text-foreground shadow-elev-3 outline-none",
              "transition-transform duration-(--duration-base) ease-(--ease-ui) data-swiping:select-none data-swiping:duration-0",
              desno
                ? "h-full w-full border-l border-line [transform:translateX(var(--drawer-swipe-movement-x,0))] data-starting-style:[transform:translateX(100%)] data-ending-style:[transform:translateX(100%)]"
                : "max-h-[85dvh] w-full rounded-t-2xl border-t border-line pb-[env(safe-area-inset-bottom)] [transform:translateY(var(--drawer-swipe-movement-y,0))] data-starting-style:[transform:translateY(100%)] data-ending-style:[transform:translateY(100%)]",
              className,
            )}
          >
            {!desno && (
              <div aria-hidden className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-line-strong" />
            )}
            <div className="flex items-start gap-3 border-b border-line px-4 py-3">
              <div className="min-w-0 flex-1">
                {header ? (
                  <>
                    <DrawerPrimitive.Title className="sr-only">{title}</DrawerPrimitive.Title>
                    {header}
                  </>
                ) : (
                  <DrawerPrimitive.Title className="text-title font-bold text-foreground">
                    {title}
                  </DrawerPrimitive.Title>
                )}
                {description && (
                  <DrawerPrimitive.Description className="mt-0.5 text-meta text-text-muted">
                    {description}
                  </DrawerPrimitive.Description>
                )}
              </div>
              <DrawerPrimitive.Close
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={closeLabel}
                    className="shrink-0 text-text-muted hover:text-foreground"
                  />
                }
              >
                <X className="size-4" />
              </DrawerPrimitive.Close>
            </div>
            <DrawerPrimitive.Content className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
              {children}
            </DrawerPrimitive.Content>
            {footer && (
              <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-3">
                {footer}
              </div>
            )}
          </DrawerPrimitive.Popup>
        </DrawerPrimitive.Viewport>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.Root>
  );
}
