"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Chip } from "@/components/app/system/chip";
import { EmptyState } from "@/components/app/system/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { CheckCircle2, History, Info, Mail, Pause } from "lucide-react";

export interface RuleFiringsTableProps {
  ruleId?: Id<"rules">;
}

const TARGET_LABEL: Record<string, string> = {
  campaign: "Kampanja",
  adset: "Ad set",
  account: "Nalog",
};

/**
 * Istorija okidanja kao vremenska osa: linija, tačka u boji onoga što je
 * pravilo uradilo (pauza = upozorenje, obaveštenje = info) i red teksta bez
 * okvira. Nosi iste podatke kao ranija tabela — vreme, pravilo, cilj,
 * izmerenu vrednost, radnju i da li je mejl poslat.
 */
export function RuleFiringsTable({ ruleId }: RuleFiringsTableProps) {
  const firings = useQuery(api.rulesStore.listRuleFirings, {
    ruleId,
    limit: 100,
  });

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
        Kad aktivno pravilo pređe prag, ovde ostaje zapis: šta je izmereno i šta
        je urađeno.
      </EmptyState>
    );
  }

  return (
    <ol className="relative flex flex-col">
      {firings.map((f, i) => {
        const when = new Date(f.firedAt).toLocaleString("sr-RS", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
        const paused =
          f.actionTaken === "pause_and_notify" || f.actionTaken === "pause";
        const last = i === firings.length - 1;

        return (
          <li key={f._id} className="relative flex gap-4 pb-5 last:pb-0">
            {/* Osa: tačka i linija do sledećeg događaja. */}
            <div className="relative flex w-3 shrink-0 justify-center">
              <span
                aria-hidden
                className={cn(
                  "relative z-10 mt-1.5 size-2.5 rounded-full ring-4 ring-background",
                  paused ? "bg-warning" : "bg-info",
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
                  className="font-mono text-meta tabular-nums text-text-muted"
                >
                  {when}
                </time>
                <span className="min-w-0 truncate text-copy font-medium text-foreground">
                  {f.ruleName}
                </span>
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-ui text-text-muted">
                <span className="min-w-0 truncate text-foreground">
                  {f.targetName || f.targetId}
                </span>
                {f.targetType && (
                  <Chip size="sm" tone="muted">
                    {TARGET_LABEL[f.targetType] ?? "Nalog"}
                  </Chip>
                )}
                <span>
                  izmereno{" "}
                  <span className="font-mono font-bold tabular-nums text-foreground">
                    {f.metricValue.toFixed(2)}
                  </span>
                </span>

                {f.actionTaken === "pause_and_notify" ? (
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
                    title={
                      f.details ||
                      "Pisanje je isključeno (ADS_WRITE_ENABLED nije true)"
                    }
                  >
                    Samo javljeno — pisanje je isključeno
                  </Chip>
                ) : (
                  <Chip size="sm" tone="info" icon={Mail}>
                    Javljeno
                  </Chip>
                )}

                {f.notified ? (
                  <span
                    className="inline-flex items-center gap-1 text-meta text-success"
                    title="Email uspešno poslat preko Resend-a"
                  >
                    <CheckCircle2 className="size-3.5" aria-hidden />
                    Mejl poslat
                  </span>
                ) : (
                  <span
                    className="inline-flex items-center gap-1 text-meta text-text-muted"
                    title="Email nije poslat ili RESEND_API_KEY nije konfigurisan"
                  >
                    <Mail className="size-3.5" aria-hidden />
                    Mejl nije poslat
                  </span>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
