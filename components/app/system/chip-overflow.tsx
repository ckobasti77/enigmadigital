"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { CategorySlot } from "@/lib/signal-colors";
import { cn } from "@/lib/utils";
import { Chip, type ChipSize, type ChipTone } from "./chip";

/**
 * ============================================================================
 * RED ČIPOVA KOJI SE NE SEČE (UI Boost §5.5)
 * ============================================================================
 *
 * Izmereno 11.10.2026: čipovi „Zašto" u tabeli leadova presečeni na pola reči
 * („nema sa…"). Pola reči nije signal. Ovde čip ili stane CEO ili ga nema, a
 * ono što nije stalo piše kao „+N" — sa punim spiskom u oblačiću, pa se ništa
 * ne gubi.
 *
 * Kako radi: svi čipovi se jednom iscrtaju u nevidljivom sloju iste širine
 * (merenje, ne procena po broju slova), pa se u vidljivi red stavi onoliko
 * koliko stane uz mesto za „+N". `ResizeObserver` ponavlja račun kad se red
 * suzi ili raširi. Do prvog merenja crta se ceo spisak, odsečen na ivici
 * reda — nikad prazan red, i server i klijent počinju od istog markupa.
 */
export type ChipOverflowItem = {
  key: string;
  label: string;
  category?: CategorySlot | null;
  tone?: ChipTone;
  title?: string;
};

const GAP_PX = 4;

export function ChipOverflow({
  items,
  size = "sm",
  className,
}: {
  items: ChipOverflowItem[];
  size?: ChipSize;
  className?: string;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState<number | null>(null);

  useLayoutEffect(() => {
    const row = rowRef.current;
    const measure = measureRef.current;
    if (!row || !measure) return;

    const fit = () => {
      const available = row.clientWidth;
      const chips = Array.from(
        measure.querySelectorAll<HTMLElement>("[data-measure='chip']"),
      );
      const more = measure.querySelector<HTMLElement>("[data-measure='more']");
      const moreWidth = more ? more.offsetWidth + GAP_PX : 0;

      let used = 0;
      let count = 0;
      for (let i = 0; i < chips.length; i++) {
        const width = chips[i].offsetWidth + (i > 0 ? GAP_PX : 0);
        // Poslednji čip ne mora da ostavi mesto za „+N".
        const reserve = i === chips.length - 1 ? 0 : moreWidth;
        if (used + width + reserve > available) break;
        used += width;
        count++;
      }
      setVisible(count);
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(row);
    return () => observer.disconnect();
  }, [items, size]);

  if (items.length === 0) return null;

  const shown = visible === null ? items : items.slice(0, visible);
  const hidden = visible === null ? [] : items.slice(visible);

  return (
    <div
      ref={rowRef}
      className={cn("relative flex min-w-0 items-center gap-1 overflow-hidden", className)}
    >
      {shown.map((item) => (
        <Chip
          key={item.key}
          size={size}
          tone={item.tone}
          category={item.category}
          title={item.title}
        >
          {item.label}
        </Chip>
      ))}
      {hidden.length > 0 && (
        <Chip
          size={size}
          tone="muted"
          title={hidden.map((item) => item.label).join(" · ")}
        >
          +{hidden.length}
        </Chip>
      )}

      {/* Sloj za merenje: iste klase, pune širine, van toka i van čitača. */}
      <div
        ref={measureRef}
        aria-hidden
        className="pointer-events-none invisible absolute top-0 left-0 flex items-center gap-1"
      >
        {items.map((item) => (
          <span key={item.key} data-measure="chip" className="flex">
            <Chip size={size} tone={item.tone} category={item.category}>
              {item.label}
            </Chip>
          </span>
        ))}
        <span data-measure="more" className="flex">
          <Chip size={size} tone="muted">
            +{items.length}
          </Chip>
        </span>
      </div>
    </div>
  );
}
