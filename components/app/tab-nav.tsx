"use client";

import { useRef, type ComponentType, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type TabItem<T extends string> = {
  id: T;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  /** Opciona oznaka uz natpis — `CountBadge` iz sistema (brojač posla). */
  badge?: ReactNode;
  /**
   * Naziv grupe (A1 §4, plan O4). Susedni jezičci sa istom grupom čine jedan
   * klaster sa sitnim natpisom i razdelnikom pred sobom; jezičci bez grupe
   * crtaju se kao ravna traka, nepromenjeno. Redosled u nizu je i redosled
   * grupa.
   */
  group?: string;
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
 *
 * Na telefonu traka kliza vodoravno umesto da probije širinu ekrana (A1 §6,
 * plan §4.8); radnje uz traku (`trailing`) se prelome u svoj red.
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

  // Susedni jezičci sa istom grupom čine klaster; bez ijedne grupe ostaje
  // jedan klaster bez natpisa — ravna traka, identična kao pre.
  const groups: { name?: string; tabs: TabItem<T>[] }[] = [];
  for (const tab of tabs) {
    const last = groups[groups.length - 1];
    if (last && last.name === tab.group) last.tabs.push(tab);
    else groups.push({ name: tab.group, tabs: [tab] });
  }
  const showGroups = groups.length > 1 && groups.some((g) => g.name);

  const renderTab = (tab: TabItem<T>) => {
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
          "-mb-px flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3.5 py-2 text-ui font-medium transition-colors",
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
  };

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line pb-px",
        className,
      )}
    >
      <div
        ref={listRef}
        role="tablist"
        onKeyDown={handleKeyDown}
        className="flex min-w-0 max-w-full items-center gap-1 overflow-x-auto"
      >
        {showGroups
          ? groups.map((group, gi) => (
              <div key={group.name ?? gi} className="flex shrink-0 items-center gap-1">
                {gi > 0 && (
                  <span
                    className="mx-1.5 h-4 w-px shrink-0 self-center bg-line-soft"
                    aria-hidden
                  />
                )}
                {group.name && (
                  <span className="heading-caps shrink-0 whitespace-nowrap px-1 text-meta text-text-muted">
                    {group.name}
                  </span>
                )}
                {group.tabs.map(renderTab)}
              </div>
            ))
          : tabs.map(renderTab)}
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
