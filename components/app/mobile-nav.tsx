"use client";

import { useEffect, useState } from "react";
import { ProjekatLink } from "@/components/app/projekat-link";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { LayoutGrid, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  activeHref,
  donjaTraka,
  navItems,
  resolveModule,
} from "./nav-items";
import { MOBILE_TAB, MOBILE_TAB_ICON } from "./mobile-tab";
import { ModuleTile } from "./module-tile";
import { NavBadge } from "./nav-badge";
import { NotificationsBell } from "./notifications-bell";
import { useEkranPutanja, useModulUkljucen } from "./projekat-provider";

/**
 * ============================================================================
 * DONJA TRAKA NA TELEFONU (UI Boost §7.3)
 * ============================================================================
 *
 * Pet ćelija, nikad više i nikad vodoravno klizanje: tri ekrana koja se
 * otvaraju svaki dan, „Danas" (zvono, pod palcem) i „Više".
 *
 * „Više" otvara list sa SVIH trinaest modula kao obojenim pločicama, pa ništa
 * što je bilo u staroj traci od devet stavki nije dalje od dva dodira — a
 * Threads i Podešavanja, kojih tamo nije ni bilo, sada jesu. Kada si na
 * ekranu koji nije u traci, „Više" nosi boju njegovog modula: traka i tada
 * kaže gde si.
 */
export function MobileNav() {
  const pathname = useEkranPutanja();
  const [moreOpen, setMoreOpen] = useState(false);
  const active = activeHref(pathname);
  // Isključen modul projekta nema ćeliju; mesto mu popuni sledeća stavka.
  const ukljucen = useModulUkljucen();
  const mobileBarItems = donjaTraka(ukljucen);
  const inBar = mobileBarItems.some((item) => item.href === active);

  // List postoji samo na telefonu: ako se prozor raširi dok je otvoren,
  // zatvara se, da modalna zamka fokusa ne ostane iza nevidljivog lista.
  useEffect(() => {
    const wide = window.matchMedia("(min-width: 768px)");
    const close = () => {
      if (wide.matches) setMoreOpen(false);
    };
    wide.addEventListener("change", close);
    return () => wide.removeEventListener("change", close);
  }, []);

  return (
    <>
      <nav
        aria-label="Glavna navigacija"
        className="material material-edge-t edge-fade-t fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {mobileBarItems.map((item) => {
          const isActive = item.href === active;
          const Icon = item.icon;
          return (
            <ProjekatLink
              key={item.href}
              href={item.href}
              data-module={item.module}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                MOBILE_TAB,
                isActive ? "text-foreground" : "text-text-muted",
              )}
            >
              {isActive && <ActiveMark />}
              <span
                className={cn(
                  MOBILE_TAB_ICON,
                  "text-mod",
                  isActive && "bg-mod-soft",
                )}
              >
                <Icon className="size-5" />
                {/* Ista pravila kao u bočnoj traci: bez posla — bez bedža. */}
                <NavBadge
                  href={item.href}
                  label={item.label}
                  ugao="tab"
                />
              </span>
              <span className="max-w-full truncate px-1">
                {item.short ?? item.label}
              </span>
            </ProjekatLink>
          );
        })}

        {/* Ćelija postoji i kad zvono ćuti (upit pao), da mreža ostane pet. */}
        <div className="flex">
          <NotificationsBell variant="tab" />
        </div>

        <button
          type="button"
          data-module={inBar ? undefined : resolveModule(pathname)}
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          className={cn(
            MOBILE_TAB,
            inBar && !moreOpen ? "text-text-muted" : "text-foreground",
          )}
        >
          {!inBar && <ActiveMark />}
          <span
            className={cn(
              MOBILE_TAB_ICON,
              !inBar && "bg-mod-soft text-mod",
              inBar && moreOpen && "bg-surface-raised",
            )}
          >
            <LayoutGrid className="size-5" aria-hidden />
          </span>
          <span>Više</span>
        </button>
      </nav>

      <MoreSheet open={moreOpen} onOpenChange={setMoreOpen} active={active} />
    </>
  );
}

/** Crta na vrhu aktivne ćelije, u boji njenog modula. */
function ActiveMark() {
  return (
    <span aria-hidden className="absolute top-0 h-0.5 w-6 rounded-full bg-mod" />
  );
}

/**
 * List „Više": svi moduli u mreži od tri kolone. Postojeći `Dialog` primitiv
 * (fokus-zamka, `Esc`, zatamnjenje) prikačen za dno ekrana. Prelaz je CSS, ne
 * keyframe — kreće od zatečene vrednosti, pa je prekidiv, a pod
 * `prefers-reduced-motion` globalno pravilo ga svede na neprozirnost.
 */
function MoreSheet({
  open,
  onOpenChange,
  active,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  active: string | undefined;
}) {
  const ukljucen = useModulUkljucen();
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          className={cn(
            "fixed inset-0 z-50 bg-surface-overlay backdrop-blur-sm md:hidden",
            "transition-opacity duration-(--duration-base) ease-(--ease-ui)",
            "data-closed:opacity-0 data-open:opacity-100 data-starting-style:opacity-0",
          )}
        />
        <DialogPrimitive.Popup
          data-slot="more-sheet"
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col rounded-t-xl border-t border-line bg-surface-raised pb-[env(safe-area-inset-bottom)] shadow-elev-3 outline-hidden md:hidden",
            "transition-[transform,opacity] duration-(--duration-base) ease-(--ease-ui)",
            "data-closed:translate-y-full data-closed:opacity-0",
            "data-open:translate-y-0 data-open:opacity-100",
            "data-starting-style:translate-y-full data-starting-style:opacity-0",
          )}
        >
          <div className="flex shrink-0 items-center justify-between gap-3 pl-4 pr-1.5 pt-1.5">
            <DialogPrimitive.Title className="text-copy font-medium text-foreground">
              Svi moduli
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label="Zatvori"
              className="flex size-11 cursor-pointer items-center justify-center rounded-full text-text-muted transition-colors hover:text-foreground"
            >
              <X className="size-5" aria-hidden />
            </DialogPrimitive.Close>
          </div>

          <ul className="grid min-h-0 grid-cols-3 gap-1 overflow-y-auto px-3 pb-4">
            {navItems.filter((item) => ukljucen(item.module)).map((item) => {
              const isActive = item.href === active;
              return (
                <li key={item.href} data-module={item.module}>
                  <ProjekatLink
                    href={item.href}
                    onClick={() => onOpenChange(false)}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "flex min-h-[5.25rem] flex-col items-center justify-center gap-1.5 rounded-xl px-1 py-2 text-center text-meta transition-colors",
                      isActive
                        ? "bg-mod-soft font-medium text-foreground"
                        : "text-text-secondary active:bg-surface",
                    )}
                  >
                    <span className="relative">
                      <ModuleTile
                        icon={item.icon}
                        size="lg"
                        active={isActive}
                      />
                      <NavBadge
                        href={item.href}
                        label={item.label}
                        ugao="ikonica"
                      />
                    </span>
                    <span className="max-w-full truncate">{item.label}</span>
                  </ProjekatLink>
                </li>
              );
            })}
          </ul>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
