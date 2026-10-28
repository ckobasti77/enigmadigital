"use client";

import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { AdActionDialog } from "@/components/app/ads/ad-action-dialog";
import { ProjekatLink } from "@/components/app/projekat-link";
import { useMoze, useProjekatQuery } from "@/components/app/projekat-provider";
import { Chip } from "@/components/app/system/chip";
import { EmptyState } from "@/components/app/system/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime, formatRatio } from "@/lib/format";
import { formatMetricName, formatThresholdValue } from "@/lib/rule-sentence";
import { cn } from "@/lib/utils";
import { useValutaPravila } from "./use-valuta-pravila";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  History,
  Info,
  Mail,
  Pause,
  Play,
} from "lucide-react";

export interface RuleFiringsTableProps {
  ruleId?: Id<"rules">;
}

const TARGET_LABEL: Record<string, string> = {
  campaign: "Kampanja",
  adset: "Grupa oglasa",
  account: "Nalog",
};

/** Cilj koji se vraća kroz „Vrati kampanju" (postojeća radnja pokretanja). */
type Vracanje = {
  targetType: "campaign" | "adset";
  targetId: string;
  targetName: string;
};

/**
 * Istorija okidanja kao vremenska osa: linija, tačka u boji onoga što je
 * pravilo uradilo (pauza = upozorenje, obaveštenje = info) i red teksta bez
 * okvira. Uz uspelu pauzu stoji „Vrati kampanju": isti put pokretanja kao na
 * Oglasima (`adActions.pauseResume`), sa istim zaštitama i potvrdom. „Otvori"
 * vodi na kampanju u Oglasima.
 */
export function RuleFiringsTable({ ruleId }: RuleFiringsTableProps) {
  const firings = useProjekatQuery(api.rulesStore.listRuleFirings, {
    ruleId,
    limit: 100,
  });
  const { valuta } = useValutaPravila();
  const mozeVlasnik = useMoze("owner");
  const [vracanje, setVracanje] = useState<Vracanje | null>(null);

  if (firings === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full rounded-md" />
        <Skeleton className="h-12 w-full rounded-md" />
        <Skeleton className="h-12 w-full rounded-md" />
      </div>
    );
  }

  if (firings.length === 0) {
    return (
      <EmptyState icon={History} title="Još nema okidanja">
        Kad uključeno pravilo pređe prag, ovde ostaje zapis: šta je izmereno i šta
        je urađeno.
      </EmptyState>
    );
  }

  return (
    <>
      <ol className="relative flex flex-col">
        {firings.map((f, i) => {
          const when = formatDateTime(f.firedAt);
          const pauza =
            f.actionTaken === "pause_and_notify" || f.actionTaken === "pause";
          const pauzaPala = pauza && Boolean(f.details);
          const last = i === firings.length - 1;
          const naziv = f.targetName || f.targetId;
          const mozeVratiti =
            mozeVlasnik &&
            pauza &&
            !pauzaPala &&
            (f.targetType === "campaign" || f.targetType === "adset");
          const otvori =
            f.targetType === "campaign"
              ? `/ads?campaignId=${encodeURIComponent(f.targetId)}`
              : "/ads";

          return (
            <li key={f._id} className="relative flex gap-4 pb-5 last:pb-0">
              {/* Osa: tačka i linija do sledećeg događaja. */}
              <div className="relative flex w-3 shrink-0 justify-center">
                <span
                  aria-hidden
                  className={cn(
                    "relative z-10 mt-1.5 size-2.5 rounded-full ring-4 ring-background",
                    pauzaPala ? "bg-danger" : pauza ? "bg-warning" : "bg-info",
                  )}
                />
                {!last && (
                  <span
                    aria-hidden
                    className="absolute top-4 bottom-[-1.25rem] w-px bg-line"
                  />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <time
                    dateTime={new Date(f.firedAt).toISOString()}
                    className="text-meta tabular-nums text-text-muted"
                  >
                    {when}
                  </time>
                  <span className="min-w-0 truncate text-copy font-medium text-foreground">
                    {f.ruleName}
                  </span>
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-ui text-text-muted">
                  <span className="min-w-0 truncate text-foreground">{naziv}</span>
                  {f.targetType && (
                    <Chip size="sm" tone="muted">
                      {TARGET_LABEL[f.targetType] ?? "Nalog"}
                    </Chip>
                  )}
                  <span>
                    {f.metric !== null ? formatMetricName(f.metric) : "Izmereno"}{" "}
                    <span className="font-semibold tabular-nums text-foreground">
                      {f.metric !== null
                        ? formatThresholdValue(f.metric, f.metricValue, valuta)
                        : formatRatio(f.metricValue)}
                    </span>
                    {f.metric !== null && f.pragSada !== null && (
                      <>
                        {" "}
                        · prag sada{" "}
                        <span className="tabular-nums">
                          {formatThresholdValue(f.metric, f.pragSada, valuta)}
                        </span>
                      </>
                    )}
                  </span>

                  {pauzaPala ? (
                    <Chip size="sm" tone="danger" icon={AlertTriangle} title={f.details}>
                      Pauziranje nije uspelo
                    </Chip>
                  ) : f.actionTaken === "pause_and_notify" ? (
                    <Chip size="sm" tone="warning" icon={Pause}>
                      Pauzirano i javljeno
                    </Chip>
                  ) : f.actionTaken === "pause" ? (
                    <Chip size="sm" tone="warning" icon={Pause}>
                      Pauzirano
                    </Chip>
                  ) : f.actionTaken === "notify_only_write_disabled" ? (
                    <Chip
                      size="sm"
                      tone="muted"
                      icon={Info}
                      title="Pauziranje je bilo isključeno na serveru, pa je poslato samo obaveštenje."
                    >
                      Samo javljeno — pauziranje je isključeno
                    </Chip>
                  ) : (
                    <Chip size="sm" tone="info" icon={Mail}>
                      Javljeno
                    </Chip>
                  )}

                  {f.notified ? (
                    <span className="inline-flex items-center gap-1 text-meta text-success">
                      <CheckCircle2 className="size-3.5" aria-hidden />
                      Mejl poslat
                    </span>
                  ) : (
                    <span
                      className="inline-flex items-center gap-1 text-meta text-text-muted"
                      title="Slanje mejla nije podešeno ili nije uspelo."
                    >
                      <Mail className="size-3.5" aria-hidden />
                      Mejl nije poslat
                    </span>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {mozeVratiti && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setVracanje({
                          targetType: f.targetType as "campaign" | "adset",
                          targetId: f.targetId,
                          targetName: naziv,
                        })
                      }
                    >
                      <Play aria-hidden />
                      {f.targetType === "campaign" ? "Vrati kampanju" : "Vrati grupu oglasa"}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    nativeButton={false}
                    render={<ProjekatLink href={otvori} />}
                    aria-label={`Otvori ${naziv} u Oglasima`}
                    className={mozeVratiti ? undefined : "-ml-2.5"}
                  >
                    Otvori
                    <ArrowUpRight aria-hidden />
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {vracanje !== null && (
        <AdActionDialog
          open
          onOpenChange={(open) => {
            if (!open) setVracanje(null);
          }}
          actionType="resume"
          targetType={vracanje.targetType}
          targetId={vracanje.targetId}
          targetName={vracanje.targetName}
          currentStatus="PAUSED"
        />
      )}
    </>
  );
}
