"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { navItems, isNavActive } from "./nav-items";

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-sidebar-border bg-sidebar/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      {navItems.map((item) => {
        const active = isNavActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex flex-col items-center justify-center gap-1 px-0.5 py-2 text-[9px] sm:text-[10px] font-medium transition-colors text-center",
              active ? "text-accent-400" : "text-text-muted",
            )}
          >
            {active && (
              <span className="absolute top-0 h-0.5 w-5 rounded-full bg-accent-400" />
            )}
            <Icon className="size-4 shrink-0" />
            <span className="max-w-full truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
