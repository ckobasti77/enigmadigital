"use client";

// Preneto iz Devotion apps/web/components/me/meta-chip.tsx (main @ c05c40f), SPAJANJE S12.
import { forwardRef, useId, type ComponentPropsWithoutRef, type ReactElement, type ReactNode } from "react";
import { ChevronDown, Lock, type LucideIcon } from "lucide-react";
import type { Perm } from "@/lib/prostor/task-row";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const chipClass =
  "inline-flex h-9 max-w-full items-center gap-1.5 rounded-full border px-3 text-sm transition-colors pointer-coarse:h-11";

type MetaChipButtonProps = ComponentPropsWithoutRef<"button"> & {
  label: string;
  value: string;
  icon: LucideIcon;
  /** Pun opis za čitač ekrana (npr. rok iz `describeDue`); podrazumevano „{label}: {value}". */
  ariaLabel?: string;
  /** Samo vrednost, bez „{label}:" (npr. „Bez roka", „Bez prioriteta" — plan K07 §3). */
  bare?: boolean;
};

/**
 * Okidač metapodatka u panelu zadatka: „Status: U toku ▾". Ide u `render`
 * okidača menija ili popovera (`DropdownMenuTrigger render={trigger}`), pa
 * prosleđuje ref i atribute koje okidač upisuje (`aria-expanded`, događaje).
 * Otvoren meni se vidi po `aria-expanded`, neutralno (ne bojom radnje).
 */
export const MetaChipButton = forwardRef<HTMLButtonElement, MetaChipButtonProps>(function MetaChipButton(
  { label, value, icon: Icon, ariaLabel, bare = false, className, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={ariaLabel ?? (bare ? value : `${label}: ${value}`)}
      className={cn(
        chipClass,
        "border-line bg-card text-foreground hover:bg-muted/60 aria-expanded:border-line-strong aria-expanded:bg-surface-control-hover",
        className,
      )}
      {...props}
    >
      <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      {bare ? null : <span className="text-muted-foreground">{label}:</span>}
      <span className="min-w-0 truncate font-medium">{value}</span>
      <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  );
});

/**
 * Zabranjen metapodatak (E15): `aria-disabled` (ne `disabled` — dobija fokus
 * i hover), katanac, razlog u tooltipu i u `aria-describedby`; boja
 * `text-muted-foreground`, bez prozirnosti. Klik ne radi ništa osim što
 * javlja razlog (`onDenied`, npr. toast na dodiru, gde tooltip ne postoji).
 */
export function LockedMetaChip({
  label,
  value,
  icon: Icon,
  reason,
  onDenied,
  ariaLabel,
  className,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  reason: string | null;
  onDenied?: (reason: string) => void;
  ariaLabel?: string;
  className?: string;
}) {
  const reasonId = useId();
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-disabled="true"
            aria-label={ariaLabel ?? `${label}: ${value}`}
            aria-describedby={reasonId}
            onClick={(event) => {
              event.preventDefault();
              if (reason) onDenied?.(reason);
            }}
            className={cn(
              chipClass,
              "cursor-not-allowed border-dashed border-line bg-transparent text-muted-foreground",
              className,
            )}
          />
        }
      >
        <Lock className="size-3.5 shrink-0" aria-hidden="true" />
        <Icon className="size-3.5 shrink-0" aria-hidden="true" />
        <span>{label}:</span>
        <span className="min-w-0 truncate font-medium">{value}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{reason}</TooltipContent>
      <span id={reasonId} className="sr-only">
        {reason}
      </span>
    </Tooltip>
  );
}

export type MetaChipProps = {
  label: string;
  value: string;
  icon: LucideIcon;
  perm: Perm;
  onDenied?: (reason: string) => void;
  ariaLabel?: string;
  bare?: boolean;
  /**
   * Dozvoljeno: dobija gotov okidač i vraća ga umotanog u meni ili popover
   * (`<DropdownMenu><DropdownMenuTrigger render={trigger} />…</DropdownMenu>`).
   */
  children: (trigger: ReactElement) => ReactNode;
  className?: string;
};

/** Metapodatak-čip (plan K07 §1.4, E15): okidač kad je dozvoljeno, inače zaključan čip sa razlogom. */
export function MetaChip({ label, value, icon, perm, onDenied, ariaLabel, bare, children, className }: MetaChipProps) {
  if (!perm.allowed) {
    return (
      <LockedMetaChip
        label={label}
        value={value}
        icon={icon}
        reason={perm.reason}
        onDenied={onDenied}
        ariaLabel={ariaLabel}
        className={className}
      />
    );
  }
  return (
    <>{children(<MetaChipButton label={label} value={value} icon={icon} ariaLabel={ariaLabel} bare={bare} className={className} />)}</>
  );
}
