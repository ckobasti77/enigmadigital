// Preneto iz Devotion apps/web/components/me/startup-chip.tsx (main @ c05c40f), SPAJANJE S09.
import { UserRound } from "lucide-react";

import { ProjekatZnak } from "@/components/app/projekat-znak";
import { cn } from "@/lib/utils";

/**
 * Tonovi startupa iz Devotiona (osam boja izvedenih iz imena) ovde ne postoje:
 * u Enigmi boju pločice nosi identitet projekta (`workspaces.brend.boja`), a
 * crta je `ProjekatZnak`. Zato nema ni `startupSolidToneClass` (jedini
 * potrošač je bio `StartupLogo`, koji sada takođe crta `ProjekatZnak`).
 */

// Ličan opseg („Lično“) nema boju projekta: neutralna pločica iste veličine.
const LICNO = {
  xs: { kutija: "size-5 rounded-[5px]", ikona: "size-3" },
  sm: { kutija: "size-5 rounded-[5px]", ikona: "size-3" },
  md: { kutija: "size-7 rounded-md", ikona: "size-4" },
  rail: { kutija: "size-10 rounded-xl", ikona: "size-5" },
} as const;

// Najmanji znak projekta je 20 px: u 16 px ne staje tekst od 12 px.
const ZNAK = {
  xs: { velicina: "xs", className: undefined },
  sm: { velicina: "xs", className: undefined },
  md: { velicina: "md", className: undefined },
  rail: { velicina: "md", className: "size-10 rounded-xl text-ui" },
} as const;

export type ProjekatCipSize = keyof typeof LICNO;
export type StartupChipSize = ProjekatCipSize;

export type ProjekatCipProps = {
  /** `null` = „Lično“. `boja` je `workspaces.brend.boja` (hex) ili nema. */
  workspace: { name: string; logoUrl?: string | null; boja?: string | null } | null;
  size: ProjekatCipSize;
  /**
   * Zadržano zbog poziva iz Devotiona (`tint`/`solid`). Identitet je uvek puna
   * boja projekta, pa se vrednost ne koristi.
   */
  variant?: "tint" | "solid";
  /** Ime pored pločice. Bez imena pločica je dekorativna — okolina nosi ime. */
  showName?: boolean;
  className?: string;
  nameClassName?: string;
};
export type StartupChipProps = ProjekatCipProps;

/**
 * Čip projekta — potpisni detalj ličnog nivoa: pločica sa logom ili inicijalima
 * u boji projekta. Isti projekat ima istu boju svuda (traka, red zadatka,
 * poruke). Boja je identitet, nikad status.
 */
export function ProjekatCip({
  workspace,
  size,
  showName = false,
  className,
  nameClassName,
}: ProjekatCipProps) {
  const tile =
    workspace === null ? (
      <span
        aria-hidden="true"
        className={cn(
          "grid shrink-0 place-items-center bg-surface-raised text-text-secondary",
          LICNO[size].kutija,
        )}
      >
        <UserRound className={LICNO[size].ikona} />
      </span>
    ) : (
      <ProjekatZnak
        projekat={{
          ime: workspace.name,
          boja: workspace.boja ?? null,
          logoUrl: workspace.logoUrl ?? null,
        }}
        velicina={ZNAK[size].velicina}
        className={ZNAK[size].className}
      />
    );

  if (!showName) return <span className={cn("inline-flex", className)}>{tile}</span>;
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      {tile}
      <span className={cn("min-w-0 truncate", nameClassName)}>
        {workspace === null ? "Lično" : workspace.name}
      </span>
    </span>
  );
}

export const StartupChip = ProjekatCip;
