"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { navItems, isNavActive } from "./nav-items";

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="material material-edge-r fixed inset-y-0 left-0 z-40 hidden w-[var(--sidebar-width)] flex-col overflow-y-auto md:flex">
      <div className="flex h-[var(--chrome-height)] shrink-0 items-center px-5">
        <span className="heading-caps text-micro font-medium text-accent-400">
          Enigma
        </span>
        <span className="heading-caps ml-1.5 text-micro font-medium text-text-muted">
          / Command
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-3 py-2">
        {navItems.map((item) => {
          const active = isNavActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                // font-medium is the vibrancy weight step: labels sitting on a
                // translucent bar need more body than plain page text.
                "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-foreground"
                  : "text-text-muted hover:bg-sidebar-accent/50 hover:text-foreground",
              )}
            >
              {/* the one "you are here" marker — a cyan left rail */}
              {active && (
                <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-accent-400" />
              )}
              <Icon
                className={cn(
                  "size-4 shrink-0",
                  active
                    ? "text-accent-400"
                    : "text-text-muted group-hover:text-foreground",
                )}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
