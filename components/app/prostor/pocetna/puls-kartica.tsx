"use client";

// Preneto iz Devotion apps/web/components/workspace/command-center/pulse-block.tsx (main @ c05c40f), SPAJANJE S20.
import { useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { currentWeekBounds, pulseCardNow, weekPulseFacts, type WeekPulseFact } from "@/lib/prostor";

import { ProjekatLink } from "@/components/app/projekat-link";
import { Button } from "@/components/ui/button";
import { useProjekatQueryResult } from "@/components/app/prostor/podaci/projekat";
import { api } from "@/convex/_generated/api";
import { hrefRute } from "@/lib/prostor/rute";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

import { Block, type BlockStatus, useBlockRetry } from "./blok";
import { useLastReady } from "./use-triage-data";

const PULS = hrefRute({ kind: "puls" }, "");
const GRESKA = "Puls tima nije učitan.";

export type PulseViewProps = {
  status: BlockStatus;
  onRetry: () => void;
  facts: ReadonlyArray<WeekPulseFact>;
};

/**
 * „Puls tima" (Devotion „Puls nedelje"): jedina uokvirena kartica radnog dela
 * na početnoj — Završeno · Novo · Zapelo ove nedelje i veza na ekran Puls tima.
 * Zapelo je u boji upozorenja samo kad je veće od nule. Nula je izmerena, pa
 * se piše 0; kad je sve nula, rečenica kaže da promena još nema.
 */
export function PulseView({ status, onRetry, facts }: PulseViewProps) {
  const sveNula = facts.length > 0 && facts.every((fact) => fact.value === 0);
  return (
    <Block id="cc-puls" title="Puls tima" status={status} errorText={GRESKA} onRetry={onRetry} skeletonRows={2}>
      <div className="rounded-xl border border-line bg-card p-4 shadow-elev-1">
        <dl className="grid grid-cols-3 gap-3">
          {facts.map((fact) => (
            <div key={fact.key} className="min-w-0">
              <dt className="truncate text-meta text-text-muted">{fact.label}</dt>
              <dd
                className={cn(
                  "text-title font-bold tabular-nums text-foreground",
                  fact.key === "stuck" && fact.value > 0 && "text-warning",
                )}
              >
                {formatNumber(fact.value)}
              </dd>
            </div>
          ))}
        </dl>
        {sveNula ? <p className="mt-2 text-ui text-text-muted">Ove nedelje još nema promena.</p> : null}
        <Button
          variant="link"
          size="sm"
          className="mt-2 -ml-2.5"
          render={<ProjekatLink href={PULS} />}
          nativeButton={false}
        >
          Otvori Puls tima
          <ChevronRight data-icon="inline-end" aria-hidden="true" />
        </Button>
      </div>
    </Block>
  );
}

/**
 * Kontejner „Puls tima": `puls.getWeekly` za tekuću nedelju (granice računa
 * klijent, upit ne čita sat). Dok se `now` osvežava poslednji odgovor važi.
 * `now` ide u koracima od 15 min (`pulseCardNow`, K23): povratak na karticu
 * pregledača ne pravi novu pretplatu na težak upit.
 */
export function PulseBlock({ now }: { now: number }) {
  const retry = useBlockRetry();
  const cardNow = pulseCardNow(now);
  const bounds = useMemo(() => currentWeekBounds(cardNow), [cardNow]);
  const result = useProjekatQueryResult(api.prostor.puls.getWeekly, bounds);
  const data = useLastReady(result.data);
  const facts = useMemo(() => (data === undefined ? [] : weekPulseFacts(data.summary)), [data]);
  return (
    <PulseView status={result.failed ? "error" : data === undefined ? "loading" : "ready"} onRetry={retry} facts={facts} />
  );
}
