"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import type { ScoredAxis, ScoredContribution } from "@/convex/lib/leadScoring";
import { leadSignalLabel } from "./lead-labels";
import { formatRelativeTime } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverDescription,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type LeadScoreCellProps = {
  axis: "fit" | "intent";
  score?: ScoredAxis;
  className?: string;
  /** Jedan red bez trake — za kompaktnu gustinu tabele (§7). */
  compact?: boolean;
};

export function LeadScoreCell({ axis, score, className, compact = false }: LeadScoreCellProps) {
  const [open, setOpen] = useState(false);

  if (!score) {
    return <Skeleton className={compact ? "h-7 w-20 rounded-md" : "h-9 w-24 rounded-lg"} />;
  }

  const isFit = axis === "fit";
  const axisTitle = isFit ? "Fit (profil kupca)" : "Intent (namera kupovine)";

  // Pravilo §0, §4: signalsCounted === 0 NIJE hladan lead, već „nije izmereno".
  const isUnmeasured = score.signalsCounted === 0;

  // TREĆE stanje, različito i od hladnog i od neizmerenog: za ovu osu ne
  // postoji nijedno aktivno pravilo, pa se ocena ne može ni izračunati.
  // Bez ovoga bi `maxPoints === 0` davalo „0%" u boji upozorenja — dakle
  // svaki lead bi izgledao ledeno hladan sve dok se pravila ne podese, a
  // uzrok se nigde ne bi video.
  const nemaPravila = score.maxPoints === 0;

  const percentage = nemaPravila
    ? undefined
    : Math.round((score.points / score.maxPoints) * 100);

  // Boje za izmereni rezultat
  const getScoreColor = () => {
    if (nemaPravila || isUnmeasured) {
      return "border-line bg-surface-raised/60 text-text-muted";
    }
    if (percentage! >= 70) {
      return isFit
        ? "border-accent-400/40 bg-accent-400/10 text-accent-400"
        : "border-success/40 bg-success/10 text-success";
    }
    if (percentage! >= 35) {
      return "border-info/40 bg-info/10 text-info";
    }
    return "border-warning/40 bg-warning/10 text-warning";
  };

  const getProgressColor = () => {
    if (nemaPravila || isUnmeasured) return "bg-line-strong";
    if (percentage! >= 70) return isFit ? "bg-accent-400" : "bg-success";
    if (percentage! >= 35) return "bg-info";
    return "bg-warning";
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          compact ? (
            <button
              type="button"
              className={cn(
                "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border px-2 text-xs transition-all hover:ring-1 hover:ring-accent-400/30",
                getScoreColor(),
                className,
              )}
              title={`Bodovanje (${axisTitle})`}
            >
              <span className="text-micro font-semibold uppercase tracking-wider text-text-muted">
                {isFit ? "Fit" : "Intent"}
              </span>
              <span className="font-mono font-semibold tabular-nums">
                {nemaPravila
                  ? "bez pravila"
                  : isUnmeasured
                    ? "bez signala"
                    : `${percentage}%`}
              </span>
            </button>
          ) : (
          <button
            type="button"
            className={cn(
              "group flex flex-col items-start gap-1 rounded-lg border px-2.5 py-1.5 text-left transition-all hover:ring-1 hover:ring-accent-400/30 cursor-pointer",
              getScoreColor(),
              className,
            )}
            title={`Bodovanje (${axisTitle})`}
          >
            <div className="flex w-full items-center justify-between gap-2">
              <span className="text-micro font-semibold uppercase tracking-wider text-text-muted">
                {isFit ? "Fit" : "Intent"}
              </span>
              <Info className="size-3 opacity-60 transition-opacity group-hover:opacity-100" />
            </div>

            {nemaPravila ? (
              <div className="flex flex-col">
                <span className="text-xs font-medium text-text-muted">Nema pravila</span>
                <span className="text-micro text-text-soft">ocena se ne računa</span>
              </div>
            ) : isUnmeasured ? (
              <div className="flex flex-col">
                <span className="text-xs font-medium text-text-muted">Nema signala</span>
                <span className="text-micro text-text-soft">nije izmereno</span>
              </div>
            ) : (
              <div className="flex flex-col w-full">
                <div className="flex items-baseline justify-between gap-1.5">
                  <span className="text-xs font-bold text-foreground">
                    {score.points} <span className="text-text-muted font-normal text-micro">/ {score.maxPoints}</span>
                  </span>
                  <span className="text-micro font-semibold">
                    {percentage}%
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-raised/80">
                  <div
                    className={cn("h-full transition-all duration-300", getProgressColor())}
                    style={{ width: `${Math.min(Math.max(percentage ?? 0, 0), 100)}%` }}
                  />
                </div>
              </div>
            )}
          </button>
          )
        }
      />

      <PopoverContent align="start" className="w-80 p-3.5 sm:w-96">
        <PopoverHeader className="border-b border-line pb-2.5">
          <div className="flex items-center justify-between">
            <PopoverTitle className="text-sm font-semibold text-foreground">
              {axisTitle}
            </PopoverTitle>
            <span
              className={cn(
                "rounded px-2 py-0.5 text-xs font-bold",
                nemaPravila || isUnmeasured
                  ? "bg-surface-raised text-text-muted"
                  : "bg-surface-raised text-foreground",
              )}
            >
              {nemaPravila
                ? "Nema pravila za ovu osu"
                : isUnmeasured
                  ? "Nije izmereno"
                  : `${score.points} / ${score.maxPoints} bodova (${percentage}%)`}
            </span>
          </div>
          <PopoverDescription className="text-xs text-text-muted mt-1">
            {isFit
              ? "Procena profila kupca na osnovu statičkih osobina firme i prisustva na internetu."
              : "Procena trenutne aktivnosti i namere kupovine na osnovu svežih signala i interakcija."}
          </PopoverDescription>
        </PopoverHeader>

        <div className="mt-2.5 flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-text-muted">
            <span className="font-medium">Doprinosi pravila ({score.contributions.length}):</span>
            <span>Uračunato signala: {score.signalsCounted}</span>
          </div>

          {score.contributions.length === 0 ? (
            <div className="rounded-lg border border-line bg-surface p-3 text-center text-xs text-text-muted">
              {nemaPravila
                ? "Za ovu osu nije podešeno nijedno aktivno pravilo, pa ocena ne postoji. Ovo NIJE ocena nula — dodaj pravila u podešavanjima ocenjivanja."
                : isUnmeasured
                  ? "Nema zabeleženih signala za ovu osu. Ocena nije izmerena."
                  : "Nijedno aktivno pravilo nije pronašlo odgovarajući signal."}
            </div>
          ) : (
            <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
              {score.contributions.map((c: ScoredContribution, index: number) => {
                const recencyPct = Math.round(c.recencyFactor * 100);
                return (
                  <div
                    key={`${c.signalKind}-${c.ruleName}-${index}`}
                    className="flex flex-col gap-1 rounded-lg border border-line bg-surface p-2.5 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-col">
                        <span className="font-semibold text-foreground">
                          {c.ruleName}
                        </span>
                        <span className="text-micro text-text-muted">
                          Signal: {leadSignalLabel(c.signalKind)}
                        </span>
                      </div>
                      <span className="shrink-0 rounded bg-accent-400/10 px-2 py-0.5 font-bold text-accent-400">
                        +{c.points} bod.
                      </span>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center justify-between border-t border-line-soft pt-1.5 text-micro text-text-muted">
                      <span>Težina pravila: <strong>{c.weight}</strong></span>
                      {!isFit && (
                        <span>
                          Faktor starosti: <strong>{recencyPct}%</strong> ({c.recencyFactor})
                        </span>
                      )}
                      <span>
                        Viđeno: <strong>{formatRelativeTime(c.observedAt)}</strong>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
