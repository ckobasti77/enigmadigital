import type { ReactNode } from "react";
import { ArrowDown } from "lucide-react";
import { formatNumber, formatPercent, formatRatio } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * ============================================================================
 * LEVAK — stepenasti vizual u boji modula (UI Boost §8)
 * ============================================================================
 *
 * Svaki korak je traka čija je širina udeo u najvećem koraku, pa se pad vidi
 * kao stepenik. Između koraka piše prelaz.
 *
 * POŠTEN PRELAZ. Koraci levka ovde nisu uvek podskup prethodnog: klik pripada
 * linku, ne poruci, pa klikova može biti više nego poruka (F6). Kad sledeći
 * korak nije veći od prethodnog, prelaz je procenat; kad jeste, piše se odnos
 * („1,4 klikova po poruci") — nikad „142 %".
 *
 * Boja nije jedini nosilac: uz traku uvek stoje naziv koraka i broj.
 */
export type FunnelStep = {
  label: string;
  /** `undefined` = podatka nema; stoji crtica, traka se ne crta. */
  value: number | undefined;
  /** Kako se čita odnos prema prethodnom koraku kad pređe 1 („klikova po poruci"). */
  per?: string;
  /**
   * Korak nije podskup prethodnog (klik pripada linku, ne poruci), pa se
   * prelaz UVEK piše kao odnos, i kad je manji od 1 — nikad kao procenat.
   */
  ratioOnly?: boolean;
  /** Uz broj: pilula promene ili kratka napomena. */
  aside?: ReactNode;
};

export function FunnelSteps({
  steps,
  label,
  format = formatNumber,
  className,
}: {
  steps: FunnelStep[];
  /** Šta levak meri — za čitač ekrana. */
  label: string;
  format?: (v: number) => string;
  className?: string;
}) {
  const max = Math.max(0, ...steps.map((s) => s.value ?? 0));

  return (
    <ol aria-label={label} className={cn("flex min-w-0 flex-col", className)}>
      {steps.map((step, i) => {
        const prev = i > 0 ? steps[i - 1] : undefined;
        const share =
          step.value !== undefined && max > 0 ? step.value / max : 0;
        return (
          <li key={step.label} className="min-w-0">
            {prev && <Transition from={prev} to={step} />}
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[9rem_minmax(0,1fr)_auto]">
              <span className="truncate text-ui text-foreground">
                {step.label}
              </span>
              <span className="flex items-center gap-2 sm:order-last">
                {step.aside}
                <span className="text-copy font-bold tabular-nums text-foreground">
                  {step.value === undefined ? "—" : format(step.value)}
                </span>
              </span>
              <span
                aria-hidden
                className="col-span-2 h-6 overflow-hidden rounded-md bg-surface-raised sm:col-span-1"
              >
                {share > 0 && (
                  <span
                    className="block h-full rounded-md bg-chart-1"
                    style={{ width: `${Math.max(2, share * 100)}%` }}
                  />
                )}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Transition({ from, to }: { from: FunnelStep; to: FunnelStep }) {
  let text: string;
  if (
    from.value === undefined ||
    to.value === undefined ||
    from.value <= 0
  ) {
    text = "prelaz nije poznat";
  } else {
    const rate = to.value / from.value;
    text =
      rate <= 1 && !to.ratioOnly
        ? `${formatPercent(rate)} prelazi dalje`
        : `${formatRatio(rate)} ${to.per ?? "po prethodnom koraku"}`;
  }
  return (
    <p className="flex items-center gap-1.5 py-1.5 text-meta text-text-muted sm:pl-[9.75rem]">
      <ArrowDown className="size-3 text-text-muted" aria-hidden />
      <span className="tabular-nums">{text}</span>
    </p>
  );
}
