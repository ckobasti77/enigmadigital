"use client";

import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { LeadStage } from "@/convex/leadCrmStore";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  TEMPERATURE,
  TEMPERATURE_CHIP_CLASS,
  TEMPERATURE_DOT_CLASS,
  TEMPERATURE_LABEL,
  TEMPERATURE_TEXT_CLASS,
  normalizeTemperatura,
  type Temperatura,
} from "@/lib/temperature";
import { leadStageLabel } from "./lead-labels";
import { StageMenuItems, useStagePick } from "./lead-row-actions";
import { getErrorMessage } from "./lead-quick-dialogs";
import { cn } from "@/lib/utils";

/**
 * ============================================================================
 * STANJE — faza + temperatura kao JEDAN čip koji otvara meni (A3, O2)
 * ============================================================================
 *
 * Izmereno 9.9.2026: `<select>` temperature u svakom od 178 redova — 178 formi
 * na ekranu koji je pregled, ne unos. Ovde je stanje jedan čip u boji
 * temperature (isti niz kao pin na mapi i ivica reda); klik otvara meni sa
 * dve radio grupe: faza (zatvorene faze traže obrazloženje → dijalog) i
 * temperatura (upisuje se odmah). Ništa se ne menja bez klika na stavku.
 */
export function LeadStateChip({
  workspaceId,
  companyId,
  companyName,
  stage,
  temperatura,
  size = "md",
  onOpenStageDialog,
  onError,
  className,
}: {
  workspaceId: Id<"workspaces">;
  companyId: Id<"leadCompanies">;
  companyName: string;
  stage: LeadStage;
  temperatura: Temperatura | string | null | undefined;
  size?: "sm" | "md";
  onOpenStageDialog: (stage: LeadStage) => void;
  onError: (message: string) => void;
  className?: string;
}) {
  const temp = normalizeTemperatura(temperatura);
  const setTemperatura = useMutation(api.leadCrmStore.setCompanyTemperatura);
  const pickStage = useStagePick({
    workspaceId,
    companyId,
    current: stage,
    onNeedsNote: onOpenStageDialog,
    onError,
  });

  const pickTemperatura = async (next: Temperatura) => {
    if (next === temp) return;
    try {
      await setTemperatura({ workspaceId, companyId, temperatura: next });
    } catch (err) {
      onError(getErrorMessage(err));
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={`Stanje: ${leadStageLabel(stage)}, ${TEMPERATURE_LABEL[temp]} — ${companyName}. Promeni fazu ili temperaturu.`}
            className={cn(
              "inline-flex shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-md border font-medium leading-none transition-colors hover:border-line-strong aria-expanded:border-line-strong",
              size === "sm" ? "h-6 px-2 text-meta" : "h-7 px-2.5 text-ui",
              TEMPERATURE_CHIP_CLASS[temp],
              className,
            )}
          />
        }
      >
        <span className="shrink-0">{leadStageLabel(stage)}</span>
        <span className="shrink-0 text-text-muted">·</span>
        <span className={cn("shrink-0", TEMPERATURE_TEXT_CLASS[temp])}>
          {TEMPERATURE_LABEL[temp]}
        </span>
        <ChevronDown className="size-3 shrink-0 text-text-muted" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {/* Base UI: natpis grupe mora da stoji unutar `Group`. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel>Faza</DropdownMenuLabel>
          <StageMenuItems current={stage} onPick={pickStage} />
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Temperatura</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={temp}
            onValueChange={(value) => void pickTemperatura(value as Temperatura)}
          >
            {TEMPERATURE.map((t) => (
              <DropdownMenuRadioItem key={t} value={t}>
                <span
                  aria-hidden
                  className={cn("size-2 shrink-0 rounded-full", TEMPERATURE_DOT_CLASS[t])}
                />
                <span>{TEMPERATURE_LABEL[t]}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
