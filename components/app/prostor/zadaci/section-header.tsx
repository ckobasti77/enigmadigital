"use client";

// Preneto iz Devotion apps/web/components/me/section-header.tsx (main @ c05c40f), SPAJANJE S12.
import { useId, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";

import { Unfold } from "@/components/motion/unfold";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export type TaskSectionProps = {
  title: string;
  count: number;
  /** Sklopiva sekcija (Blokirano, Završeno danas). */
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  /** Prekoračeno nosi ton greške u naslovu. */
  tone?: "default" | "danger";
  /** Ikonica ili čip ispred naslova (npr. čip projekta u prikazu „po projektu"). */
  leading?: ReactNode;
  className?: string;
  children: ReactNode;
};

/**
 * Sekcija liste zadataka (plan K07 §5): naslov sekcije + broj zadataka.
 * Sklopiva sekcija ide kroz `Unfold` i nosi `aria-expanded`; pri učitavanju
 * ništa ne animira, a broj je običan tekst (nije ukras koji se kotrlja).
 * Naslov je h2, normalnim slovima (PROSTOR P17,
 * `docs/prostor/DIZAJN-SMIRENJE.md` §1.2).
 */
export function TaskSection({
  title,
  count,
  collapsible = false,
  defaultCollapsed = false,
  tone = "default",
  leading,
  className,
  children,
}: TaskSectionProps) {
  const headingId = useId();
  const listId = useId();
  const [open, setOpen] = useState(!(collapsible && defaultCollapsed));
  const label = cn(
    "text-sm font-semibold",
    tone === "danger" ? "text-danger" : "text-foreground",
  );
  const countClass = "font-normal tabular-nums text-text-muted";

  return (
    <section aria-labelledby={headingId} className={className}>
      {collapsible ? (
        <h2 id={headingId} className="mb-1">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={listId}
            onClick={() => setOpen((value) => !value)}
            className={cn(
              "inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 transition-colors hover:text-foreground pointer-coarse:min-h-11",
              label,
            )}
          >
            <ChevronRight
              aria-hidden="true"
              className={cn(
                "size-3.5 transition-transform duration-(--duration-fast) ease-(--ease-ui) motion-reduce:transition-none",
                open && "rotate-90",
              )}
            />
            {leading}
            {title}
            <span className={countClass}>{formatNumber(count)}</span>
          </button>
        </h2>
      ) : (
        <h2 id={headingId} className={cn("mb-1 flex min-h-8 items-center gap-2 px-2", label)}>
          {leading}
          <span className="min-w-0 truncate">{title}</span>
          <span className={countClass}>{formatNumber(count)}</span>
        </h2>
      )}
      {collapsible ? (
        <div id={listId}>
          <Unfold open={open}>{children}</Unfold>
        </div>
      ) : (
        children
      )}
    </section>
  );
}
