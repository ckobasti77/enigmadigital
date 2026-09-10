"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FeedbackNote } from "@/components/app/feedback";
import { Chip } from "@/components/app/system/chip";
import { useNow } from "@/components/app/use-now";
import { useWorkspace } from "@/components/app/workspace-provider";
import { Unfold } from "@/components/motion/unfold";
import { StageChip } from "./lead-chips";
import { LeadCallStrip } from "./lead-call-strip";
import { LeadRowActions } from "./lead-row-actions";
import { LeadRowDialogs, type LeadRowDialogState } from "./lead-row-dialogs";
import { WorkCard, WorkSection } from "./work-card";
import { describeNextUp, rowEdge, type LeadRowItem } from "./lead-urgency";
import { useLeadFilters } from "./use-lead-filters";
import { formatDateTime } from "@/lib/format";

type OverduePanelProps = {
  workspaceId: Id<"workspaces">;
};

type OverdueItem = LeadRowItem & { delayMs: number };

/**
 * ============================================================================
 * ZAOSTALI KORACI (A4 §2)
 * ============================================================================
 *
 * Pre A4 je ovo bila tabela od šest kolona koja je ponavljala ono što je već
 * na jezičku „Tabela" (firma, faza, poslednji dodir) i nije nudila NIJEDNU
 * radnju — red se nije mogao ni pozvati ni zatvoriti odavde, samo pročitati.
 * Radni red bez radnje je spisak, ne posao.
 *
 * Sada je isti jezik kartica kao „Danas" (`work-card.tsx`), a radnja je ista
 * komponenta kao u redu tabele (`LeadRowActions`): jedno primarno dugme koje
 * bira automat iz `lead-columns.ts` — nikad dva različita predloga za isti
 * lead na dva ekrana — plus „…" sa svim ostalim radnjama.
 */

/** Formatira proteklo vreme kašnjenja u prirodan srpski tekst. */
function formatDelayTime(delayMs: number): string {
  if (delayMs <= 0) return "upravo dospeva";

  const totalMinutes = Math.floor(delayMs / (1000 * 60));
  const totalHours = Math.floor(totalMinutes / 60);
  const days = Math.floor(totalHours / 24);
  const remainingHours = totalHours % 24;

  if (days > 0) {
    const dayLabel = days === 1 ? "dan" : "dana";
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

  if (totalMinutes > 0) return `kasni ${totalMinutes} min`;
  return "kasni manje od minut";
}

export function OverduePanel({ workspaceId }: OverduePanelProps) {
  const now = useNow();
  const { user } = useWorkspace();
  const { applyQuery } = useLeadFilters();
  const overdueData = useQuery(api.leadCrmStore.listOverdue, {
    workspaceId,
    limit: 100,
  });

  const [dialog, setDialog] = useState<LeadRowDialogState | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [callStrip, setCallStrip] = useState<{ companyId: string; phone: string } | null>(
    null,
  );

  const items = useMemo(
    () =>
      [...((overdueData?.items ?? []) as OverdueItem[])].sort(
        (a, b) => b.delayMs - a.delayMs,
      ),
    [overdueData],
  );

  if (overdueData === undefined) {
    return <OverduePanelSkeleton />;
  }

  const { count, mozdaImaJos, pregledano } = overdueData;

  return (
    <div className="flex flex-col gap-6">
      {/* Obavezna napomena ako je lista delimična (§9.1) */}
      {mozdaImaJos && (
        <FeedbackNote tone="warning" title="Lista zaostalih koraka nije potpuna">
          Pregledano je {pregledano} planiranih zadataka. Iza granice pretrage
          možda ima još zaostalih leadova. Rešite prikazane stavke kako bi se
          oslobodilo mesto za preostale.
        </FeedbackNote>
      )}

      {actionError && (
        <FeedbackNote
          tone="danger"
          title="Radnja nije izvršena"
          action={
            <Button size="xs" variant="ghost" onClick={() => setActionError(null)}>
              Zatvori
            </Button>
          }
        >
          {actionError}
        </FeedbackNote>
      )}

      <WorkSection
        naslov="Zaostali koraci"
        icon={Clock}
        tone={count > 0 ? "danger" : "neutral"}
        kriterijum={`planiran rok je prošao · pregledano ${pregledano} ${pregledano === 1 ? "zadatak" : "zadataka"}`}
        ukupno={count}
        najmanje={mozdaImaJos}
        loading={false}
        prazno={
          items.length === 0 ? (
            // Prazna lista NIJE gotov posao (A1 §3): zaostao korak nastaje tek
            // kad rok prođe, a rok se zadaje iz reda u tabeli. Leadovi koje
            // niko nije zvao stoje pod filterom „nikad dodirnut".
            <>
              Nema zaostalih koraka. Zaostao je korak čiji je rok prošao, a rok se
              zadaje iz reda u tabeli („Sledeći korak…”). Leadovi koje niko još
              nije zvao nemaju rok — oni stoje pod filterom „nikad dodirnut”.
            </>
          ) : undefined
        }
        praznoAkcija={{
          label: "Prikaži nikad dodirnute",
          onClick: () => applyQuery("dodir=nikad", { tab: "leads" }),
        }}
      >
        {items.map((item) => {
          const razlog = describeNextUp(item.assignment, now);
          const strip =
            callStrip?.companyId === String(item.assignment.companyId)
              ? callStrip.phone
              : null;
          return (
            <WorkCard
              key={item.assignment._id}
              edge={rowEdge(item, now)}
              href={`/leadovi/${item.assignment.companyId}`}
              name={item.company?.name ?? "Nepoznata firma"}
              meta={[item.company?.city, item.company?.municipality]
                .filter(Boolean)
                .join(", ")}
              zasto={
                <>
                  <Chip tone="danger" size="sm" icon={Clock}>
                    {formatDelayTime(item.delayMs)}
                  </Chip>
                  <StageChip stage={item.assignment.stage} />
                  <span className="w-full text-meta text-text-muted">
                    {razlog.text}
                    {item.assignment.lastTouchAt !== undefined && (
                      <>
                        {" · poslednji dodir "}
                        {formatDateTime(item.assignment.lastTouchAt)}
                      </>
                    )}
                  </span>
                </>
              }
              primary={
                <LeadRowActions
                  workspaceId={workspaceId}
                  item={item}
                  now={now}
                  selfUserId={user?.id}
                  onCall={(phone) =>
                    setCallStrip({
                      companyId: String(item.assignment.companyId),
                      phone,
                    })
                  }
                  onOpenDialog={(kind) => setDialog({ kind, item })}
                  onOpenStageDialog={(stage) => setDialog({ kind: "stage", item, stage })}
                  onError={setActionError}
                  className="w-full justify-between"
                />
              }
            >
              {strip && (
                <Unfold>
                  <LeadCallStrip
                    workspaceId={workspaceId}
                    companyId={item.assignment.companyId}
                    phone={strip}
                    onClose={() => setCallStrip(null)}
                    onScheduleMeeting={() =>
                      setDialog({ kind: "meeting", item, calledPhone: strip })
                    }
                    onRecordOutcome={() => setDialog({ kind: "outcome", item })}
                    onNextStep={() => setDialog({ kind: "nextAction", item })}
                    className="mt-2 rounded-lg border border-line-soft bg-accent-400/5 px-3 py-2"
                  />
                </Unfold>
              )}
            </WorkCard>
          );
        })}
      </WorkSection>

      <LeadRowDialogs
        workspaceId={workspaceId}
        dialog={dialog}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}

function OverduePanelSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-64 rounded-lg" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
