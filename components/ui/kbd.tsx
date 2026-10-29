import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Taster na tastaturi (prečice, pomoć). Običan `<kbd>`, bez Base UI-ja.
 *
 * Slova su Aeonik, ne mono (`font-mono` je samo za ID, kod i kolone brojeva),
 * a veličina je najmanja dozvoljena (12 px). Znak modifikatora (Ctrl ili ⌘)
 * daje `usePrecica` / `oznakaPrecice` — ovde se ne piše ručno.
 */
function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "inline-grid h-5 min-w-5 place-items-center rounded border border-line bg-surface-raised px-1.5 font-sans text-meta font-medium leading-none text-foreground tabular-nums",
        className,
      )}
      {...props}
    />
  );
}

export { Kbd };
