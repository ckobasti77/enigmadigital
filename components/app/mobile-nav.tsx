"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { navItems, isNavActive } from "./nav-items";

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="material material-edge-t edge-fade-t fixed inset-x-0 bottom-0 z-40 grid grid-cols-9 pb-[env(safe-area-inset-bottom)] md:hidden">
      {navItems.map((item) => {
        const active = isNavActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              // Nine cells on a 20rem screen leave less room than the micro
              // tier needs, so these two sit below the scale — in rem, and on
              // micro's tracking, which is what keeps them legible that small.
              "relative flex flex-col items-center justify-center gap-1 px-0.5 py-2 text-[0.5rem] tracking-[0.02em] sm:text-[0.5625rem] font-medium transition-colors text-center",
              active ? "text-accent-400" : "text-text-muted",
            )}
          >
            {active && (
              <span className="absolute top-0 h-0.5 w-4 rounded-full bg-accent-400" />
            )}
            <Icon className="size-3.5 sm:size-4 shrink-0" />
            <span className="max-w-full truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
