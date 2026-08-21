"use client";

import type { ComponentType } from "react";
import { cn } from "@/lib/utils";

/**
 * Jedan segmentirani prekidač za opseg/nivo pogleda (prvi dodir vs sesija,
 * država vs grad, kampanja vs ključna reč). Zamenjuje tri ručna prekidača u dva
 * različita stila — od kojih je jedan (`bg-surface-elevated`) čak gađao token
 * koji ne postoji, pa aktivni segment nije imao podlogu.
 *
 * Elevacija radi posao: žleb je uvučen (`bg-bg-900`), aktivni segment je
 * podignut (`bg-surface-raised` + `shadow-elev-1`). Sve iz `globals.css`.
 */
export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  options: readonly {
    value: T;
    label: string;
    icon?: ComponentType<{ className?: string }>;
  }[];
  value: T;
  onChange: (next: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded-lg bg-bg-900 p-0.5",
        className,
      )}
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(opt.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              selected
                ? "bg-surface-raised text-foreground shadow-elev-1"
                : "text-text-muted hover:text-foreground",
            )}
          >
            {Icon && <Icon className="size-3.5" />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
