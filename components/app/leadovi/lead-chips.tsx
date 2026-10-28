"use client";

import type { LeadStage } from "@/convex/leadCrmStore";
import {
  TEMPERATURE,
  TEMPERATURE_CHIP_CLASS,
  TEMPERATURE_LABEL,
  type Temperatura,
} from "@/lib/temperature";
import { Select, type SelectOption } from "@/components/ui/select";
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

/**
 * Temperatura živi u `lib/temperature.ts` (A1 §2) — jedan izvor za tabelu,
 * mapu i profil. Ovde ostaju zatečena imena, da postojeći uvozi rade.
 */
export type { Temperatura };
export const TEMPERATURA_LABELS = TEMPERATURE_LABEL;

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

/**
 * Izbor temperature — boja nosi temperaturu (§2/O3) i ništa drugo. Ista klasa
 * kao čip u kartici iznad mape i ista promenljiva kao pin na mapi.
 */
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
    <Select
      label={ariaLabel}
      size="sm"
      value={temp}
      disabled={disabled}
      onValueChange={onChange}
      options={TEMPERATURA_OPCIJE}
      triggerClassName={(v) =>
        cn("font-semibold", TEMPERATURE_CHIP_CLASS[v ?? temp])
      }
      className={className}
    />
  );
}

const TEMPERATURA_OPCIJE: SelectOption<Temperatura>[] = TEMPERATURE.map(
  (t) => ({ value: t, label: TEMPERATURE_LABEL[t] }),
);

/*
 * `ContactLink` je obrisan u GL2. Zamenio ga je `components/app/link-chip.tsx`
 * (`LinkChip`), koji pokriva i telefon i mejl i sve platforme, i uz to ume da
 * kopira vrednost — vidi plan §7.2.
 */
