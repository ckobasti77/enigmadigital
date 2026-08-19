"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/app/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  History,
  CheckCircle2,
  Mail,
  ShieldAlert,
  Pause,
  Info,
} from "lucide-react";

export interface RuleFiringsTableProps {
  ruleId?: Id<"rules">;
}

export function RuleFiringsTable({ ruleId }: RuleFiringsTableProps) {
  const firings = useQuery(api.rulesStore.listRuleFirings, {
    ruleId,
    limit: 100,
  });

  if (firings === undefined) {
    return (
      <Card className="p-4 bg-card border-line">
        <div className="space-y-3">
          <Skeleton className="h-8 w-full rounded-md" />
          <Skeleton className="h-12 w-full rounded-md" />
          <Skeleton className="h-12 w-full rounded-md" />
          <Skeleton className="h-12 w-full rounded-md" />
        </div>
      </Card>
    );
  }

  if (firings.length === 0) {
    return (
      <EmptyState icon={History}>
        Kada uslovi aktivnog pravila budu ispunjeni nad metrikama oglasa, ovde će se prikazati detaljan revizorski zapis svakog okidanja.
      </EmptyState>
    );
  }

  return (
    <Card className="p-0 overflow-hidden bg-card border-line shadow-card">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-surface/50 border-b border-line">
            <TableRow>
              <TableHead className="text-xs font-semibold text-text-muted">
                Vreme
              </TableHead>
              <TableHead className="text-xs font-semibold text-text-muted">
                Pravilo
              </TableHead>
              <TableHead className="text-xs font-semibold text-text-muted">
                Ciljani objekat
              </TableHead>
              <TableHead className="text-xs font-semibold text-text-muted text-right">
                Izmerena vrednost
              </TableHead>
              <TableHead className="text-xs font-semibold text-text-muted">
                Izvršena akcija
              </TableHead>
              <TableHead className="text-xs font-semibold text-text-muted text-center">
                Notifikacija
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {firings.map((f) => {
              const formattedDate = new Date(f.firedAt).toLocaleString("sr-RS", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              });

              return (
                <TableRow key={f._id} className="hover:bg-surface/30 border-line">
                  {/* Timestamp */}
                  <TableCell className="text-xs font-mono text-text-muted whitespace-nowrap">
                    {formattedDate}
                  </TableCell>

                  {/* Rule Name */}
                  <TableCell className="text-xs font-medium text-foreground max-w-[200px] truncate">
                    <div className="flex items-center gap-1.5">
                      <ShieldAlert className="size-3.5 text-accent-400 shrink-0" />
                      <span className="truncate">{f.ruleName}</span>
                    </div>
                  </TableCell>

                  {/* Target Info */}
                  <TableCell className="text-xs text-foreground max-w-[200px]">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium truncate">
                        {f.targetName || f.targetId}
                      </span>
                      {f.targetType && (
                        <span className="rounded bg-surface px-1.5 py-0.5 text-micro font-mono text-text-muted border border-line shrink-0 uppercase">
                          {f.targetType === "campaign"
                            ? "KAMPANJA"
                            : f.targetType === "adset"
                              ? "ADSET"
                              : "NALOG"}
                        </span>
                      )}
                    </div>
                  </TableCell>

                  {/* Metric Value */}
                  <TableCell className="text-xs font-mono font-semibold text-right text-foreground">
                    {f.metricValue.toFixed(2)}
                  </TableCell>

                  {/* Action Taken Badge */}
                  <TableCell>
                    {f.actionTaken === "pause_and_notify" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 border border-warning/30 px-2 py-0.5 text-micro font-medium text-warning">
                        <Pause className="size-3" />
                        <span>Pauzirano + Notifikovano</span>
                      </span>
                    ) : f.actionTaken === "pause" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 border border-warning/30 px-2 py-0.5 text-micro font-medium text-warning">
                        <Pause className="size-3" />
                        <span>Pauzirano</span>
                      </span>
                    ) : f.actionTaken === "notify_only_write_disabled" ? (
                      <span
                        className="inline-flex items-center gap-1 rounded-full bg-surface-raised border border-line px-2 py-0.5 text-micro font-medium text-text-muted"
                        title={
                          f.details ||
                          "Pisanje je isključeno (ADS_WRITE_ENABLED nije true)"
                        }
                      >
                        <Info className="size-3 text-warning" />
                        <span>Samo notifikovano (Write disabled)</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-accent-400/10 border border-accent-400/30 px-2 py-0.5 text-micro font-medium text-accent-400">
                        <Mail className="size-3" />
                        <span>Notifikovano</span>
                      </span>
                    )}
                  </TableCell>

                  {/* Notification Status */}
                  <TableCell className="text-center">
                    {f.notified ? (
                      <span
                        className="inline-flex items-center gap-1 text-micro font-medium text-success"
                        title="Email uspešno poslat preko Resend-a"
                      >
                        <CheckCircle2 className="size-3.5" />
                        <span className="hidden sm:inline">Poslat</span>
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 text-micro font-medium text-text-muted/60"
                        title="Email nije poslat ili RESEND_API_KEY nije konfigurisan"
                      >
                        <Mail className="size-3.5" />
                        <span className="hidden sm:inline">—</span>
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
