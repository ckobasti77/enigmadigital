"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { activeChannelTab, type ChannelTab } from "./nav-items";
import { cn } from "@/lib/utils";

/**
 * Druga ravan navigacije: podekrani jednog kanala, ista traka na svakom
 * njegovom ekranu. Ovim šest Instagram ekrana prestaje da bude skriveno iza
 * jedne stavke u bočnoj traci.
 *
 * Namerno NIJE `TabNav`. `TabNav` je kontrolisan widget (`role="tablist"`,
 * izbor prati fokus, svi paneli već učitani u istoj strani). Ovde svaki
 * jezičak vodi na svoju RUTU, pa bi „izbor prati fokus" značilo navigaciju na
 * svaku strelicu — pogrešno. Zato lista linkova: Tab ulazi kao svuda, aktivan
 * nosi `aria-current="page"`, a izgled je isti kao kod `TabNav` (cijan
 * podvlaka aktivnog) da ekran ostane jedan.
 *
 * Podvlaka je `inset box-shadow`, ne donja ivica sa `-mb-px`: traka kliza po
 * horizontali na telefonu (`overflow-x-auto`), a negativna margina bi umela da
 * bude odsečena vertikalnim prelivom scroll okvira. Senka to nikad ne izaziva.
 */
export function SectionNav({
  tabs,
  trailing,
  className,
}: {
  tabs: readonly ChannelTab[];
  /** Radnja koja stoji uz traku, npr. „Nova objava". */
  trailing?: ReactNode;
  className?: string;
}) {
  const pathname = usePathname();
  const active = activeChannelTab(pathname, tabs);
  const listRef = useRef<HTMLElement>(null);

  // Na telefonu traka kliza; aktivan jezičak se doveze u vidno polje pri
  // promeni rute, bez animacije — isti obrazac kao donja navigacija.
  useEffect(() => {
    if (!active) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-tab-href="${active}"]`)
      ?.scrollIntoView({
        behavior: "instant",
        block: "nearest",
        inline: "center",
      });
  }, [active]);

  // Susedni tabovi sa istim `group` čine jedan klaster; redosled u nizu čuva
  // redosled grupa. Kada nijedan tab nema grupu, ostaje jedan klaster bez
  // natpisa — ravna traka, identična kao pre (Instagram/Facebook/…).
  const groups: { name?: string; tabs: ChannelTab[] }[] = [];
  for (const tab of tabs) {
    const last = groups[groups.length - 1];
    if (last && last.name === tab.group) last.tabs.push(tab);
    else groups.push({ name: tab.group, tabs: [tab] });
  }
  const showGroups = groups.length > 1 && groups.some((g) => g.name);

  const renderTab = (tab: ChannelTab) => {
    const selected = tab.href === active;
    return (
      <Link
        key={tab.href}
        href={tab.href}
        data-tab-href={tab.href}
        aria-current={selected ? "page" : undefined}
        className={cn(
          "shrink-0 whitespace-nowrap px-3.5 py-2.5 text-sm font-medium transition-colors",
          selected
            ? "text-foreground shadow-[inset_0_-2px_0_0_var(--color-accent-400)]"
            : "text-text-muted hover:text-foreground hover:shadow-[inset_0_-2px_0_0_var(--color-line-soft)]",
        )}
      >
        {tab.label}
      </Link>
    );
  };

  return (
    <div
      className={cn(
        "flex items-end justify-between gap-3 border-b border-line",
        className,
      )}
    >
      <nav
        ref={listRef}
        aria-label="Podekrani kanala"
        className="flex min-w-0 items-center gap-1 overflow-x-auto"
      >
        {showGroups
          ? groups.map((group, gi) => (
              <div key={group.name ?? gi} className="flex items-center gap-1">
                {gi > 0 && (
                  <span
                    className="mx-1.5 h-4 w-px shrink-0 self-center bg-line-soft"
                    aria-hidden
                  />
                )}
                {group.name && (
                  <span className="heading-caps shrink-0 whitespace-nowrap px-1 text-micro text-text-muted/80">
                    {group.name}
                  </span>
                )}
                {group.tabs.map(renderTab)}
              </div>
            ))
          : tabs.map(renderTab)}
      </nav>

      {trailing && <div className="shrink-0 pb-1.5">{trailing}</div>}
    </div>
  );
}
