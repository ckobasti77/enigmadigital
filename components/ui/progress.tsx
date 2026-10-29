"use client";

import * as React from "react";
import { Progress as ProgressPrimitive } from "@base-ui/react/progress";
import { cn } from "@/lib/utils";

/**
 * Traka napretka (P11): Base UI Progress daje `role="progressbar"` i
 * `aria-value*`, a izgled je isti kao `system/progress` `ProgressBar`
 * (napredak sme da nosi prelaz boje; boja modula ne). Bez cilja i bez pokreta:
 * za animiranu traku sa ciljem ostaje `ProgressBar`.
 *
 * `label` je obavezan: čitač ekrana mora da zna šta traka meri.
 */
export type TonNapretka = "neutral" | "success" | "warning" | "danger" | "info";

const TON: Record<TonNapretka, string> = {
  neutral: "[--from:var(--text-secondary)] [--to:var(--text-primary)]",
  success: "[--from:var(--success)] [--to:var(--success)]",
  warning: "[--from:var(--warning)] [--to:var(--warning)]",
  danger: "[--from:var(--danger)] [--to:var(--danger)]",
  info: "[--from:var(--info)] [--to:var(--info)]",
};

function Progress({
  className,
  label,
  ton = "neutral",
  size = "md",
  ...props
}: Omit<ProgressPrimitive.Root.Props, "aria-label"> & {
  label: string;
  ton?: TonNapretka;
  size?: "sm" | "md";
}) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      aria-label={label}
      className={cn("flex min-w-0 flex-col", TON[ton], className)}
      {...props}
    >
      <ProgressPrimitive.Track
        className={cn(
          "overflow-hidden rounded-full bg-surface-raised",
          size === "sm" ? "h-1.5" : "h-2",
        )}
      >
        <ProgressPrimitive.Indicator className="h-full rounded-full bg-[linear-gradient(90deg,var(--from),var(--to))]" />
      </ProgressPrimitive.Track>
    </ProgressPrimitive.Root>
  );
}

export { Progress };
