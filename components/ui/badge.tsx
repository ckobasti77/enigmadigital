import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Mala oznaka uz tekst (broj, stanje). Običan `<span>`, bez Base UI-ja.
 *
 * Tonovi su uloge boje iz `CLAUDE.md`: neutralno, prigušeno i četiri stanja
 * (uspeh, upozorenje, greška, informacija). Boja modula i boja radnje ovde ne
 * postoje — oznaka ne govori ni „gde si“ ni „šta da klikneš“. Isti tonovi kao
 * `system/chip`, samo niže (20 px) i bez dugmeta; klikabilna oznaka je `Chip`.
 */
export type BadgeTon =
  | "neutral"
  | "muted"
  | "success"
  | "warning"
  | "danger"
  | "info";

const TON: Record<BadgeTon, string> = {
  neutral: "border-line bg-surface-raised text-foreground",
  muted: "border-line-soft bg-surface-raised text-text-muted",
  success: "border-success-line bg-success-soft text-success",
  warning: "border-warning-line bg-warning-soft text-warning",
  danger: "border-danger-line bg-danger-soft text-danger",
  info: "border-info-line bg-info-soft text-info",
};

function Badge({
  ton = "neutral",
  className,
  ...props
}: React.ComponentProps<"span"> & { ton?: BadgeTon }) {
  return (
    <span
      data-slot="badge"
      data-ton={ton}
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 text-meta font-medium leading-none tabular-nums [&>svg]:size-3 [&>svg]:shrink-0",
        TON[ton],
        className,
      )}
      {...props}
    />
  );
}

export { Badge };
