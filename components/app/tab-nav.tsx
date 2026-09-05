"use client";

import { useRef, type ComponentType, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type TabItem<T extends string> = {
  id: T;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  /** Opciona oznaka uz natpis (npr. brojač hitnih stavki). */
  badge?: ReactNode;
};

/**
 * Trake sa jezičcima na svim ekranima — jedna implementacija, ne pet.
 *
 * Sa tastature se ponaša kako se traka jezičaka ponaša svuda: Tab ulazi u
 * traku jednom (aktivan jezičak nosi fokus), a strelice biraju. Sa pet ručno
 * pisanih kopija to nigde nije radilo, jer je svaka bila samo red dugmadi.
 *
 * Izbor prati fokus (`activation: automatic`), pošto su svi panel-i ovde već
 * učitani — ništa se ne dovlači sa servera na promenu jezička.
 */
export function TabNav<T extends string>({
  tabs,
  active,
  onChange,
  /** `id` panela koji jezičci opisuju — spaja traku sa sadržajem. */
  panelId,
  trailing,
  className,
}: {
  tabs: readonly TabItem<T>[];
  active: T;
  onChange: (id: T) => void;
  panelId: string;
  /** Radnja koja stoji uz traku, npr. „Nova automatizacija". */
  trailing?: ReactNode;
  className?: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  const move = (delta: number) => {
    const index = tabs.findIndex((tab) => tab.id === active);
    if (index === -1) return;
    const next = tabs[(index + delta + tabs.length) % tabs.length];
    onChange(next.id);
    // Fokus prati izbor, inače strelica pomeri izbor a tastatura ostane na
    // starom dugmetu.
    listRef.current
      ?.querySelector<HTMLButtonElement>(`[data-tab-id="${next.id}"]`)
      ?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        move(1);
        break;
      case "ArrowLeft":
        event.preventDefault();
        move(-1);
        break;
      case "Home":
        event.preventDefault();
        onChange(tabs[0].id);
        break;
      case "End":
        event.preventDefault();
        onChange(tabs[tabs.length - 1].id);
        break;
    }
  };

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-b border-line pb-px",
        className,
      )}
    >
      <div
        ref={listRef}
        role="tablist"
        onKeyDown={handleKeyDown}
        className="flex items-center gap-1"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              data-tab-id={tab.id}
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(tab.id)}
              className={cn(
                "-mb-px flex items-center gap-2 border-b-2 px-3.5 py-2 text-sm font-medium transition-colors",
                selected
                  ? "border-accent-400 text-foreground"
                  : "border-transparent text-text-muted hover:border-line-soft hover:text-foreground",
              )}
            >
              {Icon && <Icon className="size-4" />}
              <span>{tab.label}</span>
              {tab.badge}
            </button>
          );
        })}
      </div>

      {trailing && <div className="mb-2 shrink-0">{trailing}</div>}
    </div>
  );
}

/**
 * Sadržaj ispod trake. `tabIndex={-1}` je namerno: kada izbor pređe na drugi
 * jezičak, panel može da primi fokus programski, a sam ne ulazi u tab redosled.
 */
export function TabPanel({
  id,
  children,
  className,
}: {
  id: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div id={id} role="tabpanel" tabIndex={-1} className={cn("outline-none", className)}>
      {children}
    </div>
  );
}
