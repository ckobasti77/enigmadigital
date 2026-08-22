"use client";

import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AlertCircle, CheckCircle2, Clock, HelpCircle, ShieldAlert } from "lucide-react";
import {
  DEFAULT_THRESHOLD_IMPRESSIONS,
  DEFAULT_THRESHOLD_CLICKS,
  isVersionStatisticallyReliable,
} from "./battle-verdict";

export {
  DEFAULT_THRESHOLD_IMPRESSIONS,
  DEFAULT_THRESHOLD_CLICKS,
  isVersionStatisticallyReliable,
};

export interface EvidenceMeterProps {
  impressions: number;
  clicks: number;
  thresholdImpressions?: number;
  thresholdClicks?: number;
  status?: string;
  isPendingActivation?: boolean;
  className?: string;
  showDetails?: boolean;
}

export function EvidenceMeter({
  impressions,
  clicks,
  thresholdImpressions = DEFAULT_THRESHOLD_IMPRESSIONS,
  thresholdClicks = DEFAULT_THRESHOLD_CLICKS,
  status,
  isPendingActivation,
  className,
  showDetails = true,
}: EvidenceMeterProps) {
  const isPending =
    isPendingActivation ||
    (status === "PAUSED" && impressions === 0 && clicks === 0);

  const impPct = Math.min(100, (impressions / thresholdImpressions) * 100);
  const clickPct = Math.min(100, (clicks / thresholdClicks) * 100);
  const isReliable = impressions >= thresholdImpressions && clicks >= thresholdClicks;

  // Overall sample progress (geometric or min/avg)
  const sampleProgressPct = Math.min(100, Math.round((impPct + clickPct) / 2));

  return (
    <div className={cn("flex flex-col gap-1.5 w-full", className)}>
      <div className="flex items-center justify-between gap-1.5">
        {/* Status Badge + Popover trigger */}
        <Popover>
          <PopoverTrigger
            render={
              <button
                type="button"
                className={cn(
                  "group inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-micro font-medium transition-colors cursor-pointer border",
                  isPending
                    ? "border-warning/30 bg-warning/10 text-warning hover:bg-warning/20"
                    : isReliable
                      ? "border-success/30 bg-success/10 text-success hover:bg-success/20"
                      : "border-warning/30 bg-warning/10 text-warning hover:bg-warning/20",
                )}
              />
            }
          >
            {isPending ? (
              <>
                <Clock className="size-3 shrink-0 text-warning" />
                <span>Čeka aktivaciju</span>
              </>
            ) : isReliable ? (
              <>
                <CheckCircle2 className="size-3 shrink-0 text-success" />
                <span>Pouzdan uzorak</span>
              </>
            ) : (
              <>
                <ShieldAlert className="size-3 shrink-0 text-warning" />
                <span>Rano za zaključak</span>
              </>
            )}
            <HelpCircle className="size-2.5 opacity-60 group-hover:opacity-100 transition-opacity ml-0.5" />
          </PopoverTrigger>

          <PopoverContent
            align="start"
            side="bottom"
            className="w-80 border-line bg-surface-raised p-4 shadow-xl"
          >
            <PopoverHeader>
              <div className="flex items-center gap-2">
                {isPending ? (
                  <Clock className="size-4 text-warning" />
                ) : isReliable ? (
                  <CheckCircle2 className="size-4 text-success" />
                ) : (
                  <AlertCircle className="size-4 text-warning" />
                )}
                <PopoverTitle className="text-sm font-semibold text-foreground">
                  {isPending
                    ? "Kopija čeka aktivaciju"
                    : isReliable
                      ? "Statistički pouzdan uzorak"
                      : "Mali uzorak — Rano za zaključak"}
                </PopoverTitle>
              </div>
              <PopoverDescription className="mt-2 text-xs leading-relaxed text-text-muted">
                {isPending ? (
                  <>
                    Ova verzija oglasa je kreirana u pauziranom stanju (PAUSED).
                    Nakon što je aktivirate u Meta Ads Manageru ili komandnom
                    centru, ovde će se automatski prikazivati prikupljene
                    impresije, Hook Rate i konverzije.
                  </>
                ) : isReliable ? (
                  <>
                    Ova verzija je prešla minimalne pragove (
                    <strong className="text-foreground">
                      {formatNumber(thresholdImpressions)}
                    </strong>{" "}
                    impresija i{" "}
                    <strong className="text-foreground">
                      {thresholdClicks}
                    </strong>{" "}
                    klikova). Rezultati su stabilni i spremni za analizu lidera.
                  </>
                ) : (
                  <>
                    Ova verzija još uvek nema dovoljno podataka za pouzdano
                    zaključivanje. Meta algoritam još istražuje publiku i rani
                    brojevi nose visoku statističku varijansu.
                  </>
                )}
              </PopoverDescription>
            </PopoverHeader>

            <div className="mt-3 space-y-2 rounded-md border border-line-soft bg-surface/50 p-2.5 text-xs font-mono tabular-nums">
              <div className="flex items-center justify-between">
                <span className="text-text-muted">Impresije:</span>
                <span
                  className={cn(
                    "font-semibold",
                    impressions >= thresholdImpressions
                      ? "text-success"
                      : "text-warning",
                  )}
                >
                  {formatNumber(impressions)} / {formatNumber(thresholdImpressions)} ({Math.round(impPct)}%)
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-text-muted">Klikovi:</span>
                <span
                  className={cn(
                    "font-semibold",
                    clicks >= thresholdClicks
                      ? "text-success"
                      : "text-warning",
                  )}
                >
                  {formatNumber(clicks)} / {formatNumber(thresholdClicks)} ({Math.round(clickPct)}%)
                </span>
              </div>
            </div>

            {!isReliable && (
              <p className="mt-2.5 text-micro leading-normal text-text-muted italic border-t border-line-soft pt-2">
                Pravilo poštenja: Verzije ispod praga se ne krunišu kao lideri
                kako se ne bi donosile lažne preuranjene odluke.
              </p>
            )}
          </PopoverContent>
        </Popover>

        {showDetails && (
          <span className="text-micro font-mono tabular-nums text-text-muted">
            {sampleProgressPct}% praga
          </span>
        )}
      </div>

      {/* Dual Progress Meter: Impressions & Clicks */}
      <div className="flex flex-col gap-1 w-full">
        {/* Impressions mini bar */}
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 rounded-full bg-surface-raised overflow-hidden border border-line-soft">
            <div
              className={cn(
                "h-full transition-all duration-300 rounded-full",
                impressions >= thresholdImpressions ? "bg-success" : "bg-warning",
              )}
              style={{ width: `${impPct}%` }}
            />
          </div>
          <span className="text-micro font-mono tabular-nums text-text-muted shrink-0 w-12 text-right">
            {formatNumber(impressions)} imp
          </span>
        </div>

        {/* Clicks mini bar */}
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 rounded-full bg-surface-raised overflow-hidden border border-line-soft">
            <div
              className={cn(
                "h-full transition-all duration-300 rounded-full",
                clicks >= thresholdClicks ? "bg-success" : "bg-accent-400/80",
              )}
              style={{ width: `${clickPct}%` }}
            />
          </div>
          <span className="text-micro font-mono tabular-nums text-text-muted shrink-0 w-12 text-right">
            {clicks} klik
          </span>
        </div>
      </div>
    </div>
  );
}
