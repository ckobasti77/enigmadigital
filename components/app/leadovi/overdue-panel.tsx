"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id, Doc } from "@/convex/_generated/dataModel";
import { Building2, Calendar, Clock, Table2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FeedbackNote } from "@/components/app/feedback";
import { EmptyState } from "@/components/app/system/empty-state";
import { Chip } from "@/components/app/system/chip";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableEmpty,
  DataTableHead,
  DataTableHeadRow,
  DataTableHeader,
  DataTableRow,
} from "@/components/app/system/data-table";
import { StageChip } from "./lead-chips";
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

const COLUMN_COUNT = 6;

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
              <CardTitle className="text-copy font-bold text-foreground">
                Zaostali sledeći koraci ({count})
              </CardTitle>
              <CardDescription className="text-ui text-text-muted">
                Leadovi kojima je planirani termin za kontakt ili sledeću radnju prošao.
              </CardDescription>
            </div>
            <div className="text-ui text-text-muted">
              Pregledano u bazi: <strong className="font-mono">{pregledano}</strong> zadataka
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <DataTable>
            <DataTableHeader>
              <DataTableHeadRow>
                <DataTableHead>Firma i lokacija</DataTableHead>
                <DataTableHead>Kašnjenje</DataTableHead>
                <DataTableHead>Faza toka</DataTableHead>
                <DataTableHead>Planirana radnja / napomena</DataTableHead>
                <DataTableHead>Planirani rok</DataTableHead>
                <DataTableHead>Poslednji dodir</DataTableHead>
              </DataTableHeadRow>
            </DataTableHeader>
            <DataTableBody>
              {items.length === 0 ? (
                <DataTableEmpty colSpan={COLUMN_COUNT}>
                  {/* Prazna lista NIJE gotov posao (A1 §3): zaostao korak
                      nastaje tek kad rok prođe, a rok se zadaje iz reda u
                      tabeli. Leadovi koje niko nije zvao stoje pod filterom
                      „nikad dodirnut" — to je sledeći potez, ne kvačica. */}
                  <EmptyState
                    icon={Clock}
                    size="sm"
                    title="Nema zaostalih koraka"
                    action={
                      <Link
                        href="/leadovi?dodir=nikad"
                        className={cn(buttonVariants({ size: "sm", variant: "outline" }), "gap-1.5")}
                      >
                        <Table2 className="size-3.5" aria-hidden />
                        Prikaži nikad dodirnute leadove
                      </Link>
                    }
                  >
                    Zaostao je korak čiji je rok prošao, a rok se zadaje iz reda u
                    tabeli („Sledeći korak”). Leadovi koje niko još nije zvao nemaju
                    rok — oni stoje u tabeli pod filterom „nikad dodirnut”.
                  </EmptyState>
                </DataTableEmpty>
              ) : (
                items.map(({ assignment, company, delayMs }: OverdueItem) => (
                  <DataTableRow key={assignment._id}>
                    <DataTableCell className="font-medium text-foreground">
                      <div className="flex items-center gap-2">
                        <Building2 className="size-4 shrink-0 text-text-muted" aria-hidden />
                        <div className="flex flex-col">
                          <span className="font-semibold">
                            {company ? company.name : "Nepoznata firma"}
                          </span>
                          {company?.city && (
                            <span className="text-meta text-text-muted">
                              {company.city}
                              {company.municipality && `, ${company.municipality}`}
                            </span>
                          )}
                        </div>
                      </div>
                    </DataTableCell>

                    <DataTableCell>
                      <Chip tone="danger" size="sm" icon={Clock}>
                        {formatDelayTime(delayMs)}
                      </Chip>
                    </DataTableCell>

                    <DataTableCell>
                      <StageChip stage={assignment.stage} />
                    </DataTableCell>

                    <DataTableCell className="max-w-xs whitespace-normal text-foreground">
                      {assignment.nextActionNote ? (
                        <span className="italic">„{assignment.nextActionNote}”</span>
                      ) : (
                        <span className="text-text-muted">Nije uneta napomena</span>
                      )}
                    </DataTableCell>

                    <DataTableCell className="font-medium text-danger">
                      {assignment.nextActionAt ? (
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="size-3 text-danger/70" aria-hidden />
                          {formatDateTime(assignment.nextActionAt)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </DataTableCell>

                    <DataTableCell className="text-text-muted">
                      {assignment.lastTouchAt
                        ? formatDateTime(assignment.lastTouchAt)
                        : "Nema zabeleženog kontakta"}
                    </DataTableCell>
                  </DataTableRow>
                ))
              )}
            </DataTableBody>
          </DataTable>
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
