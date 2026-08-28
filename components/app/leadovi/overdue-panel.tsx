"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id, Doc } from "@/convex/_generated/dataModel";
import {
  AlertCircle,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  User,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { FeedbackNote } from "@/components/app/feedback";
import { leadStageLabel } from "./lead-labels";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type OverduePanelProps = {
  workspaceId: Id<"workspaces">;
};

type OverdueItem = {
  assignment: Doc<"leadAssignments">;
  company: Doc<"leadCompanies"> | null;
  delayMs: number;
};

/**
 * Formatira proteklo vreme kašnjenja u prirodan srpski tekst.
 */
function formatDelayTime(delayMs: number): string {
  if (delayMs <= 0) return "upravo dospeva";

  const totalMinutes = Math.floor(delayMs / (1000 * 60));
  const totalHours = Math.floor(totalMinutes / 60);
  const days = Math.floor(totalHours / 24);
  const remainingHours = totalHours % 24;

  if (days > 0) {
    const dayLabel = days === 1 ? "dan" : days < 5 ? "dana" : "dana";
    if (remainingHours > 0) {
      const hourLabel =
        remainingHours === 1 ? "sat" : remainingHours < 5 ? "sata" : "sati";
      return `kasni ${days} ${dayLabel} i ${remainingHours} ${hourLabel}`;
    }
    return `kasni ${days} ${dayLabel}`;
  }

  if (totalHours > 0) {
    const hourLabel =
      totalHours === 1 ? "sat" : totalHours < 5 ? "sata" : "sati";
    const remMin = totalMinutes % 60;
    if (remMin > 0) {
      return `kasni ${totalHours} ${hourLabel} i ${remMin} min`;
    }
    return `kasni ${totalHours} ${hourLabel}`;
  }

  if (totalMinutes > 0) {
    return `kasni ${totalMinutes} min`;
  }

  return "kasni manje od minut";
}

export function OverduePanel({ workspaceId }: OverduePanelProps) {
  const overdueData = useQuery(api.leadCrmStore.listOverdue, {
    workspaceId,
    limit: 100,
  });

  if (overdueData === undefined) {
    return <OverduePanelSkeleton />;
  }

  const items = overdueData.items as OverdueItem[];
  const { count, mozdaImaJos, pregledano } = overdueData;

  return (
    <div className="flex flex-col gap-6">
      {/* Obavezna napomena ako je lista delimična (§9.1) */}
      {mozdaImaJos && (
        <FeedbackNote
          tone="warning"
          title="Lista zaostalih koraka nije potpuna"
        >
          Pregledano je {pregledano} planiranih zadataka. Iza granice pretrage
          možda ima još zaostalih leadova. Rešite prikazane stavke kako bi se
          oslobodilo mesto za preostale.
        </FeedbackNote>
      )}

      <Card className="border-line bg-surface">
        <CardHeader className="border-b border-line pb-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base font-bold text-foreground">
                Zaostali sledeći koraci ({count})
              </CardTitle>
              <CardDescription className="text-xs text-text-muted">
                Leadovi kojima je planirani termin za kontakt ili sledeću radnju prošao.
              </CardDescription>
            </div>
            <div className="text-xs font-semibold text-text-muted">
              Pregledano u bazi: <strong>{pregledano}</strong> zadataka
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center text-text-muted">
              <CheckCircle2 className="size-10 text-success mb-2" />
              <p className="text-sm font-semibold text-foreground">
                Nema zaostalih koraka!
              </p>
              <p className="mt-1 text-xs text-text-muted max-w-sm">
                Sve planirane radnje i kontakti su u roku ili su uspešno evidentirani.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-line bg-surface-raised/40 hover:bg-surface-raised/40">
                    <TableHead className="font-semibold text-text-muted">Firma i lokacija</TableHead>
                    <TableHead className="font-semibold text-text-muted">Kašnjenje</TableHead>
                    <TableHead className="font-semibold text-text-muted">Faza toka</TableHead>
                    <TableHead className="font-semibold text-text-muted">Planirana radnja / Napomena</TableHead>
                    <TableHead className="font-semibold text-text-muted">Planirani rok</TableHead>
                    <TableHead className="font-semibold text-text-muted">Poslednji dodir</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map(({ assignment, company, delayMs }: OverdueItem) => {
                    const delayText = formatDelayTime(delayMs);

                    return (
                      <TableRow
                        key={assignment._id}
                        className="border-line transition-colors hover:bg-surface-raised/60"
                      >
                        <TableCell className="font-medium text-foreground">
                          <div className="flex items-center gap-2">
                            <Building2 className="size-4 shrink-0 text-text-muted" />
                            <div className="flex flex-col">
                              <span className="font-semibold">
                                {company ? company.name : "Nepoznata firma"}
                              </span>
                              {company?.city && (
                                <span className="text-micro text-text-muted">
                                  {company.city}
                                  {company.municipality && `, ${company.municipality}`}
                                </span>
                              )}
                            </div>
                          </div>
                        </TableCell>

                        <TableCell className="text-xs">
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-danger/40 bg-danger/10 px-2.5 py-0.5 font-bold text-danger">
                            <Clock className="size-3" />
                            {delayText}
                          </span>
                        </TableCell>

                        <TableCell className="text-xs font-medium">
                          <span className="rounded bg-surface-raised px-2 py-0.5 border border-line text-foreground font-semibold">
                            {leadStageLabel(assignment.stage)}
                          </span>
                        </TableCell>

                        <TableCell className="text-xs text-foreground max-w-xs">
                          {assignment.nextActionNote ? (
                            <span className="italic">
                              „{assignment.nextActionNote}"
                            </span>
                          ) : (
                            <span className="text-text-soft">
                              Nije uneta napomena
                            </span>
                          )}
                        </TableCell>

                        <TableCell className="text-xs text-danger font-medium whitespace-nowrap">
                          {assignment.nextActionAt ? (
                            <div className="flex items-center gap-1">
                              <Calendar className="size-3 text-danger/70" />
                              {formatDateTime(assignment.nextActionAt)}
                            </div>
                          ) : (
                            "—"
                          )}
                        </TableCell>

                        <TableCell className="text-xs text-text-muted whitespace-nowrap">
                          {assignment.lastTouchAt ? (
                            formatDateTime(assignment.lastTouchAt)
                          ) : (
                            <span className="text-text-soft">Nema zabeleženog kontakta</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function OverduePanelSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-16 w-full rounded-xl" />
      <Skeleton className="h-80 w-full rounded-xl" />
    </div>
  );
}
