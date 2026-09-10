"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import type { ScoredAxis, ScoredContribution } from "@/convex/lib/leadScoring";
import { leadSignalLabel } from "./lead-labels";
import { formatRelativeTime } from "@/lib/format";
import {
  STRENGTH_BAR_CLASS,
  STRENGTH_CHIP_CLASS,
  STRENGTH_TEXT_CLASS,
  STRENGTH_TRACK_CLASS,
  strengthOf,
  type Strength,
} from "@/lib/strength";
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
  /** Jedan red bez trake — za kompaktnu gustinu tabele (§7). Isto što i `variant="compact"`. */
  compact?: boolean;
  /**
   * Oblik ćelije (A3, O2):
   *  - `card`    natpis + bodovi + traka u okviru (profil firme)
   *  - `compact` čip sa procentom (stara kompaktna tabela)
   *  - `meter`   jedan tanak merač: natpis · broj · traka, bez okvira — dva
   *              takva jedan ispod drugog čine kolonu „Fit / Intent"
   *  - `inline`  samo natpis i broj, za red od 32 px
   */
  variant?: "card" | "compact" | "meter" | "inline";
};

/** Neizmereno i bez pravila: prigušen okvir, bez boje jačine. */
const NEUTRAL_CHIP = "border-line bg-surface-raised/60 text-text-muted";

export function LeadScoreCell({
  axis,
  score,
  className,
  compact = false,
  variant = compact ? "compact" : "card",
}: LeadScoreCellProps) {
  const [open, setOpen] = useState(false);

  if (!score) {
    return (
      <Skeleton
        className={
          variant === "meter"
            ? "h-4 w-24 rounded"
            : variant === "inline"
              ? "h-4 w-14 rounded"
              : variant === "compact"
                ? "h-7 w-20 rounded-md"
                : "h-9 w-24 rounded-lg"
        }
      />
    );
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

  // Boja nosi JAČINU, i to u jednom smeru: više = jače (A1 §2, `lib/strength`).
  // Ranije je 27 % bio žut (upozorenje) a 64 % siv (token `info` nije
  // postojao) — boja je govorila suprotno od broja.
  const strength: Strength | null =
    nemaPravila || isUnmeasured || percentage === undefined ? null : strengthOf(percentage);
  const chipClass = strength ? STRENGTH_CHIP_CLASS[strength] : NEUTRAL_CHIP;
  const barClass = strength ? STRENGTH_BAR_CLASS[strength] : "bg-line-strong";
  const trackClass = strength ? STRENGTH_TRACK_CLASS[strength] : "bg-surface-raised";
  const textClass = strength ? STRENGTH_TEXT_CLASS[strength] : "text-text-muted";
  // „—" kad se ne može izmeriti: nula bi ovde bila laž (plan §0/3).
  const kratko = nemaPravila || isUnmeasured || percentage === undefined ? "—" : String(percentage);
  const kratkoTitle = nemaPravila
    ? `${axisTitle}: nema aktivnih pravila`
    : isUnmeasured
      ? `${axisTitle}: nema signala, nije izmereno`
      : `${axisTitle}: ${score.points} / ${score.maxPoints} bodova (${percentage} %)`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          variant === "meter" ? (
            <button
              type="button"
              title={kratkoTitle}
              aria-label={kratkoTitle}
              className={cn(
                "group/meter flex w-full min-w-24 cursor-pointer flex-col gap-1 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                className,
              )}
            >
              <span className="flex items-baseline justify-between gap-2 leading-none">
                <span className="text-meta text-text-muted">{isFit ? "Fit" : "Intent"}</span>
                <span className={cn("font-mono text-ui font-medium tabular-nums", textClass)}>
                  {kratko}
                </span>
              </span>
              <span className={cn("block h-1 w-full overflow-hidden rounded-full", trackClass)}>
                <span
                  className={cn("block h-full rounded-full transition-[width] duration-(--duration-base)", barClass)}
                  style={{ width: `${Math.min(Math.max(percentage ?? 0, 0), 100)}%` }}
                />
              </span>
            </button>
          ) : variant === "inline" ? (
            <button
              type="button"
              title={kratkoTitle}
              aria-label={kratkoTitle}
              className={cn(
                "inline-flex cursor-pointer items-baseline gap-1 rounded-sm leading-none outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                className,
              )}
            >
              <span className="text-meta text-text-muted">{isFit ? "F" : "I"}</span>
              <span className={cn("font-mono text-ui font-medium tabular-nums", textClass)}>{kratko}</span>
            </button>
          ) : variant === "compact" ? (
            <button
              type="button"
              className={cn(
                "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border px-2 text-xs transition-all hover:ring-1 hover:ring-accent-400/30",
                chipClass,
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
              chipClass,
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
                <span className="text-micro text-text-muted">ocena se ne računa</span>
              </div>
            ) : isUnmeasured ? (
              <div className="flex flex-col">
                <span className="text-xs font-medium text-text-muted">Nema signala</span>
                <span className="text-micro text-text-muted">nije izmereno</span>
              </div>
            ) : (
              <div className="flex flex-col w-full">
                <div className="flex items-baseline justify-between gap-1.5">
                  <span className="text-xs font-bold text-foreground">
                    {score.points} <span className="text-text-muted font-normal text-micro">/ {score.maxPoints}</span>
                  </span>
                  <span className="font-mono text-micro font-semibold tabular-nums">
                    {percentage}%
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-raised/80">
                  <div
                    className={cn("h-full transition-all duration-(--duration-base)", barClass)}
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
