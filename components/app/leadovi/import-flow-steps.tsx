"use client";

import { Check, CircleAlert } from "lucide-react";
import type { Korak, StanjeKoraka } from "@/convex/lib/importFlow";
import { cn } from "@/lib/utils";

/**
 * ============================================================================
 * TOK UVOZA — Učitano → Rešeno N/M → Primeni → Šta je nastalo (A5 §2 tačka 1)
 * ============================================================================
 *
 * Uvoz je najskuplji tok u aplikaciji i do sada je bio najslabije vođen: ekran
 * je pokazivao tabelu i dugme „Primeni", a koliko je od posla rešeno i šta
 * ostaje moralo je da se sabira po traci stanja. Ovde su ta četiri koraka
 * ispisana, sa brojevima, i vidljiva su u svakom stanju uvoza.
 *
 * Koraci se ne računaju ovde — dolaze iz `convex/lib/importFlow.ts`, istog
 * koda koji hrani zvono i istoriju. Komponenta samo crta.
 *
 * Korak nije dugme: tok kaže gde si, a radnja stoji na svom mestu (dugme
 * „Primeni uvoz" gore, „Reši preostale" u traci ispod). Lažna dugmad koja ne
 * rade ništa su tačno ono što rep zabranjuje.
 */

const MARKER: Record<StanjeKoraka, string> = {
  gotov: "border-success/40 bg-success/10 text-success",
  tekuci: "border-accent-400/60 bg-accent-400/15 text-accent-400",
  stao: "border-warning/50 bg-warning/10 text-warning",
  ceka: "border-line-soft bg-surface-raised text-text-muted",
};

const NASLOV: Record<StanjeKoraka, string> = {
  gotov: "text-foreground",
  tekuci: "text-accent-400",
  stao: "text-warning",
  ceka: "text-text-muted",
};

export function ImportFlowSteps({
  koraci,
  className,
}: {
  koraci: Korak[];
  className?: string;
}) {
  return (
    <ol
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-line bg-surface px-4 py-3 sm:flex-row sm:items-stretch sm:gap-0",
        className,
      )}
      aria-label="Tok uvoza"
    >
      {koraci.map((korak, i) => (
        <li
          key={korak.kljuc}
          className="flex min-w-0 flex-1 items-start gap-2.5 sm:items-center"
          aria-current={korak.stanje === "tekuci" ? "step" : undefined}
        >
          <span
            className={cn(
              "mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full border font-mono text-meta font-semibold tabular-nums sm:mt-0",
              MARKER[korak.stanje],
            )}
            aria-hidden
          >
            {korak.stanje === "gotov" ? (
              <Check className="size-3.5" />
            ) : korak.stanje === "stao" ? (
              <CircleAlert className="size-3.5" />
            ) : (
              i + 1
            )}
          </span>

          <span className="flex min-w-0 flex-col">
            <span className={cn("truncate text-ui font-semibold", NASLOV[korak.stanje])}>
              {korak.naslov}
            </span>
            {/* Detalj je uvek broj, nikad pridev — „41 red nije rešen", ne
                „ima nerešenog". */}
            <span className="truncate text-meta text-text-muted" title={korak.detalj}>
              {korak.detalj}
            </span>
          </span>

          {/* Spojnica ka sledećem koraku — samo na širokom ekranu; na telefonu
              koraci stoje jedan ispod drugog i linija bi bila ukras. */}
          {i < koraci.length - 1 && (
            <span
              aria-hidden
              className={cn(
                "mx-2 hidden h-px flex-1 self-center sm:block",
                korak.stanje === "gotov" ? "bg-success/30" : "bg-line",
              )}
            />
          )}
        </li>
      ))}
    </ol>
  );
}
