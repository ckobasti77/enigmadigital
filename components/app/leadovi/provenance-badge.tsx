"use client";

import { CheckCircle2, AlertTriangle, HelpCircle, ExternalLink, ShieldQuestion } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { confidenceLabel } from "./lead-labels";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverDescription,
} from "@/components/ui/popover";

export type ProvenanceInfo = {
  source: string;
  sourceUrl?: string;
  confidence: "tacno" | "priblizno" | "nepoznato";
  humanConfirmed: boolean;
  observedAt: number;
};

type ProvenanceBadgeProps = {
  provenance?: ProvenanceInfo;
  fieldName?: string;
  className?: string;
  compact?: boolean;
};

/**
 * LM10 / Pravilo §2.4: Poreklo uz svako polje.
 *
 * Polje sa zapisom u leadFieldProvenance nosi malu oznaku:
 * izvor, i da li je humanConfirmed.
 * Polje sa confidence: "priblizno" MORA biti VIDNO drugačije od "tacno"
 * (to su podaci koje je neko zaključio, ne pročitao).
 * Polje BEZ zapisa se označava kao „poreklo nije zabeleženo", nikada kao potvrđeno.
 */
export function ProvenanceBadge({
  provenance,
  fieldName,
  className,
  compact = false,
}: ProvenanceBadgeProps) {
  if (!provenance) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded border border-line-soft bg-surface-raised/40 px-1.5 py-0.5 text-micro font-medium text-text-soft",
          className,
        )}
        title="Poreklo podatka nije zabeleženo u sistemu"
      >
        <ShieldQuestion className="size-3 text-text-soft shrink-0" />
        {!compact && <span>Poreklo nije zabeleženo</span>}
      </span>
    );
  }

  const isPriblizno = provenance.confidence === "priblizno";
  const isTacno = provenance.confidence === "tacno";

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-micro font-medium transition-colors cursor-pointer",
              isPriblizno
                ? "border border-warning/40 bg-warning/10 text-warning hover:bg-warning/20 font-semibold"
                : isTacno
                  ? "border border-line bg-surface-raised text-text-muted hover:text-foreground hover:border-line-strong"
                  : "border border-line-soft bg-surface-raised/60 text-text-muted hover:text-foreground",
              className,
            )}
            title={`Poreklo: ${provenance.source} (${confidenceLabel(provenance.confidence)})`}
          >
            {isPriblizno ? (
              <AlertTriangle className="size-3 text-warning shrink-0" />
            ) : isTacno ? (
              <CheckCircle2 className="size-3 text-success shrink-0" />
            ) : (
              <HelpCircle className="size-3 text-text-muted shrink-0" />
            )}

            <span>
              {isPriblizno ? "Približno" : provenance.source}
              {provenance.humanConfirmed && !isPriblizno && " (potvrđeno)"}
            </span>
          </button>
        }
      />

      <PopoverContent align="start" className="w-72 p-3 text-xs">
        <PopoverHeader className="border-b border-line pb-2">
          <PopoverTitle className="text-xs font-semibold text-foreground">
            Poreklo podatka {fieldName ? `(„${fieldName}")` : ""}
          </PopoverTitle>
          <PopoverDescription className="text-micro text-text-muted">
            Evidencija izvora i pouzdanosti tvrdnje u sistemu
          </PopoverDescription>
        </PopoverHeader>

        <div className="mt-2.5 space-y-1.5 text-micro">
          <div className="flex items-center justify-between">
            <span className="text-text-muted">Izvor:</span>
            <span className="font-semibold text-foreground">{provenance.source}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-text-muted">Pouzdanost:</span>
            <span
              className={cn(
                "font-semibold",
                isPriblizno ? "text-warning" : isTacno ? "text-success" : "text-text-muted",
              )}
            >
              {confidenceLabel(provenance.confidence)}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-text-muted">Provera:</span>
            <span className="font-medium text-foreground">
              {provenance.humanConfirmed ? "Potvrdio operater (čovek)" : "Automatski uvezeno (nepotvrđeno)"}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-text-muted">Datum opažanja:</span>
            <span className="text-foreground">{formatDateTime(provenance.observedAt)}</span>
          </div>

          {provenance.sourceUrl && (
            <div className="pt-1.5 border-t border-line-soft flex items-center justify-between">
              <span className="text-text-muted">Link izvora:</span>
              <a
                href={provenance.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-accent-400 hover:underline truncate max-w-[150px]"
              >
                <span>Otvori izvor</span>
                <ExternalLink className="size-3 shrink-0" />
              </a>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
