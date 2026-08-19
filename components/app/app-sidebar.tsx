"use client";

import { useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { DUR_REDUCED, DUR_UI, EASE_UI, MOTION_QUERIES } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { activeHref, navSections } from "./nav-items";
import { useWorkspace } from "./workspace-provider";
import { Skeleton } from "@/components/ui/skeleton";

/** Visina cyan indikatora, u pikselima. Konstantna — pomera se samo po y-osi. */
const RAIL_H = 20;

export function AppSidebar() {
  const pathname = usePathname();
  const active = activeHref(pathname);

  const navRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLSpanElement>(null);
  const linkRefs = useRef(new Map<string, HTMLAnchorElement>());
  // Prvi prikaz indikator zauzima mesto bez putovanja; tek svaka sledeća
  // promena rute je pokret. Bez ovoga bi na svakom učitavanju stranice
  // indikator kliznuo od vrha do aktivne stavke.
  const placed = useRef(false);

  useGSAP(
    () => {
      const rail = railRef.current;
      const nav = navRef.current;
      if (!rail || !nav) return;

      const target = active ? linkRefs.current.get(active) : undefined;
      if (!target) {
        gsap.to(rail, { opacity: 0, duration: DUR_REDUCED, overwrite: "auto" });
        return;
      }

      const y = target.offsetTop + (target.offsetHeight - RAIL_H) / 2;
      const first = !placed.current;
      placed.current = true;

      const mm = gsap.matchMedia();
      mm.add(MOTION_QUERIES, (ctx) => {
        if (first || ctx.conditions?.still) {
          gsap.set(rail, { y, opacity: 1 });
          return;
        }
        gsap.to(rail, {
          y,
          opacity: 1,
          duration: DUR_UI,
          ease: EASE_UI,
          overwrite: "auto",
        });
      });
    },
    { dependencies: [active], scope: navRef },
  );

  return (
    <aside className="material material-edge-r fixed inset-y-0 left-0 z-40 hidden w-[var(--sidebar-width)] flex-col md:flex">
      <div className="flex h-[var(--chrome-height)] shrink-0 items-center px-5">
        <span className="heading-caps text-micro font-medium text-accent-400">
          Enigma
        </span>
        <span className="heading-caps ml-1.5 text-micro font-medium text-text-muted">
          / Command
        </span>
      </div>

      <div ref={navRef} className="relative flex-1 overflow-y-auto px-3 pb-4">
        {/* Jedan element koji putuje između stavki — ne šest koji se pale i
            gase. Živi izvan <nav>-a jer se pozicionira prema njemu, a čitaču
            ekrana ne govori ništa što `aria-current` već ne kaže. */}
        <span
          ref={railRef}
          aria-hidden
          className="pointer-events-none absolute left-3 top-0 w-0.5 rounded-full bg-accent-400 opacity-0"
          style={{ height: RAIL_H }}
        />

        <nav aria-label="Glavna navigacija">
          {navSections.map((section) => (
            <div key={section.title} className="mt-5 first:mt-2">
              <p className="heading-caps px-3 pb-1.5 text-micro font-medium text-text-muted">
                {section.title}
              </p>
              <ul className="flex flex-col gap-0.5">
                {section.items.map((item) => {
                  const isActive = active === item.href;
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        ref={(el) => {
                          if (el) linkRefs.current.set(item.href, el);
                          else linkRefs.current.delete(item.href);
                        }}
                        aria-current={isActive ? "page" : undefined}
                        className={cn(
                          // font-medium je korak vidljivosti: natpis na
                          // translucentnoj traci traži više tela od običnog
                          // teksta stranice.
                          "group flex items-center gap-3 rounded-lg py-2 pl-4 pr-3 text-sm font-medium transition-colors",
                          isActive
                            ? "bg-sidebar-accent text-foreground"
                            : "text-text-muted hover:bg-sidebar-accent/50 hover:text-foreground",
                        )}
                      >
                        <Icon
                          className={cn(
                            "size-4 shrink-0",
                            isActive
                              ? "text-accent-400"
                              : "text-text-muted group-hover:text-foreground",
                          )}
                        />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </div>

      <WorkspaceFooter />
    </aside>
  );
}

/** Čiji su ovo podaci — stoji uz navigaciju, ne uz stanje ekrana. */
function WorkspaceFooter() {
  const { workspace, user, isLoading } = useWorkspace();

  return (
    <div className="material-edge-t shrink-0 px-5 py-3">
      {isLoading ? (
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-3 w-32" />
        </div>
      ) : (
        <>
          <p className="truncate text-sm font-medium text-foreground">
            {workspace?.name ?? "Radni prostor"}
          </p>
          <p className="truncate text-micro text-text-muted">
            {user?.email ?? "—"}
          </p>
        </>
      )}
    </div>
  );
}
