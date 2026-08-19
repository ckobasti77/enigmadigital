"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { mobileNavItems, isNavActive } from "./nav-items";

export function MobileNav() {
  const pathname = usePathname();
  const activeRef = useRef<HTMLAnchorElement>(null);

  // Aktivna stavka se dovuče u vidno polje pri promeni ekrana — traka koja
  // kliza ume da je ostavi izvan vidnog polja. Bez animacije: ovo je
  // nameštanje početnog stanja, a ne pokret koji nekome nešto saopštava.
  useEffect(() => {
    activeRef.current?.scrollIntoView({
      behavior: "instant",
      block: "nearest",
      inline: "center",
    });
  }, [pathname]);

  return (
    /*
     * Devet stavki u devet fiksnih kolona na telefonu od 320 px svodilo je
     * natpise na 8 px — ispod donje granice ove skale (11 px) i ispod granice
     * čitljivosti uopšte. Traka zato kliza vodoravno: stavke zadržavaju svoju
     * širinu i svoj micro natpis, a na ekran ih stane onoliko koliko stane.
     * Pet čitljivih je više od devet nečitljivih.
     */
    <nav
      aria-label="Glavna navigacija"
      className="material material-edge-t edge-fade-t fixed inset-x-0 bottom-0 z-40 flex snap-x snap-mandatory overflow-x-auto pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {mobileNavItems.map((item) => {
        const active = isNavActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            ref={active ? activeRef : undefined}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex min-w-[4.5rem] shrink-0 snap-center flex-col items-center justify-center gap-1 px-2 py-2 text-center text-micro font-medium transition-colors",
              active ? "text-accent-400" : "text-text-muted",
            )}
          >
            {active && (
              <span className="absolute top-0 h-0.5 w-4 rounded-full bg-accent-400" />
            )}
            <Icon className="size-4 shrink-0" />
            <span className="max-w-full truncate">{item.short ?? item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
