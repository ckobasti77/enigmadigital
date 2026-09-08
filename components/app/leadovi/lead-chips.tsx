"use client";

import type { LeadStage } from "@/convex/leadCrmStore";
import { leadStageLabel } from "./lead-labels";
import { cn } from "@/lib/utils";

export const ALL_STAGES: readonly LeadStage[] = [
  "nov",
  "u_radu",
  "poslata_ponuda",
  "sastanak",
  "dobijen",
  "izgubljen",
  "odlozen",
];

/** Prelazak u zatvorenu fazu traži obrazloženje (pravilo 5 u `leadCrmStore`). */
export function stageRequiresNote(stage: LeadStage): boolean {
  return stage === "dobijen" || stage === "izgubljen";
}

export type Temperatura = "nova_firma" | "cold" | "warm" | "hot";

export const TEMPERATURA_LABELS: Record<Temperatura, string> = {
  nova_firma: "Nova firma",
  cold: "Cold",
  warm: "Warm",
  hot: "Hot",
};

/**
 * Faza kao čip (§7). Boja ovde nosi samo ISHOD: „Dobijen” zeleno, „Izgubljen”
 * prigušeno i precrtano, sve ostalo neutralno — faza „u radu” nije ni dobra
 * ni loša vest, pa nema šta da oboji.
 */
export function StageChip({
  stage,
  className,
}: {
  stage: string;
  className?: string;
}) {
  const tone =
    stage === "dobijen"
      ? "border-success/40 bg-success/10 text-success"
      : stage === "izgubljen"
        ? "border-line-soft bg-surface-raised/60 text-text-muted line-through decoration-text-muted/70"
        : "border-line bg-surface-raised text-foreground";

  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-semibold",
        tone,
        className,
      )}
    >
      {leadStageLabel(stage)}
    </span>
  );
}

/** Izbor temperature — boja nosi temperaturu (§2/O3) i ništa drugo. */
export function TemperatureSelect({
  value,
  onChange,
  disabled,
  className,
  ariaLabel,
}: {
  value?: Temperatura;
  onChange: (next: Temperatura) => void;
  disabled?: boolean;
  className?: string;
  ariaLabel: string;
}) {
  const temp: Temperatura = value ?? "nova_firma";
  return (
    <select
      aria-label={ariaLabel}
      value={temp}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as Temperatura)}
      className={cn(
        "h-7 cursor-pointer rounded-md border px-2 text-xs font-medium outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        temp === "hot" && "border-temp-hot/50 bg-temp-hot-bg font-semibold text-foreground",
        temp === "warm" && "border-temp-warm/50 bg-temp-warm-bg font-semibold text-foreground",
        temp === "cold" && "border-temp-cold/50 bg-temp-cold-bg font-semibold text-foreground",
        temp === "nova_firma" && "border-line-soft bg-surface-raised text-text-secondary",
        className,
      )}
    >
      {(Object.keys(TEMPERATURA_LABELS) as Temperatura[]).map((t) => (
        <option key={t} value={t} className="bg-surface text-foreground">
          {TEMPERATURA_LABELS[t]}
        </option>
      ))}
    </select>
  );
}

/*
 * `ContactLink` je obrisan u GL2. Zamenio ga je `components/app/link-chip.tsx`
 * (`LinkChip`), koji pokriva i telefon i mejl i sve platforme, i uz to ume da
 * kopira vrednost — vidi plan §7.2.
 */
