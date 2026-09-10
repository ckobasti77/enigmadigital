"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id, Doc } from "@/convex/_generated/dataModel";
import { AlertTriangle, CalendarClock, CalendarDays, CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FeedbackNote } from "@/components/app/feedback";
import { Chip } from "@/components/app/system/chip";
import { useNow } from "@/components/app/use-now";
import { useWorkspace } from "@/components/app/workspace-provider";
import { LeadRowActions } from "./lead-row-actions";
import { LeadRowDialogs, type LeadRowDialogState } from "./lead-row-dialogs";
import { WorkCard, WorkSection } from "./work-card";
import { rowEdge, type LeadRowItem } from "./lead-urgency";
import { useLeadFilters } from "./use-lead-filters";
import { formatClockTime, formatDayRelative, formatDateTime } from "@/lib/format";

type MeetingsPanelProps = {
  workspaceId: Id<"workspaces">;
};

/** Jedna stavka sastanka, kako je vraća `api.leadCrmStore.listMeetings`. */
export type MeetingItem = {
  assignment: Doc<"leadAssignments">;
  company: Doc<"leadCompanies"> | null;
  meetingAt: number;
  meetingNote?: string;
  uProslosti: boolean;
  ishodZabelezen: boolean;
};

export type MeetingGroups = {
  danas: MeetingItem[];
  sutra: MeetingItem[];
  oveNedelje: MeetingItem[];
  prosliBezIshoda: MeetingItem[];
};

/**
 * Razvrstava sastanke u četiri grupe (§4) po LOKALNOM danu.
 *
 * Grupisanje je namerno na klijentu: server je UTC, a „danas" je lokalni pojam,
 * pa bi klasifikacija oko ponoći na serveru bila pogrešna. Granice dana se
 * računaju iz `now` (koji stiže iz upita) tumačenog u lokalnoj zoni.
 *
 * Prioritet upozorenja: prošao sastanak bez ishoda ide u `prosliBezIshoda` bez
 * obzira na dan (to je razlog zbog kog panel postoji). „Danas/Sutra/Ove nedelje"
 * su budući sastanci; prošli-sa-ishodom i oni dalji od ove nedelje se ne prikazuju.
 */
export function groupMeetings(items: MeetingItem[], now: number): MeetingGroups {
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const dayMs = 24 * 60 * 60 * 1000;
  const tomorrowStart = todayStart.getTime() + dayMs;
  const dayAfterStart = todayStart.getTime() + 2 * dayMs;

  // Početak sledeće nedelje (ponedeljak 00:00). Nedelja počinje ponedeljkom.
  const dow = todayStart.getDay(); // 0=ned .. 6=sub
  const daysUntilNextMonday = ((8 - dow) % 7) || 7;
  const nextWeekStart = todayStart.getTime() + daysUntilNextMonday * dayMs;

  const groups: MeetingGroups = {
    danas: [],
    sutra: [],
    oveNedelje: [],
    prosliBezIshoda: [],
  };

  for (const item of items) {
    if (item.uProslosti) {
      // Prošao + bez ishoda = upozorenje. Prošao + ishod zabeležen = gotovo, ne prikazuje se.
      if (!item.ishodZabelezen) groups.prosliBezIshoda.push(item);
      continue;
    }
    const t = item.meetingAt;
    if (t < tomorrowStart) groups.danas.push(item);
    else if (t < dayAfterStart) groups.sutra.push(item);
    else if (t < nextWeekStart) groups.oveNedelje.push(item);
    // dalje od ove nedelje: ne prikazuje se
  }

  return groups;
}

/**
 * Sastanak nema hidrirane kontakte (`listMeetings` čita samo dodelu i firmu),
 * pa se red sastavlja sa praznim nizovima — isto kao u „Danas" (A3). Prazan
 * niz znači „nema u bazi"; radnja „Pozovi" iz menija tada kaže zašto je siva.
 */
function kaoRed(m: MeetingItem): LeadRowItem {
  return {
    assignment: m.assignment,
    company: m.company,
    telefoni: [],
    emailovi: [],
    platforme: [],
    osobe: [],
    signali: [],
  };
}

export function MeetingsPanel({ workspaceId }: MeetingsPanelProps) {
  const now = useNow();
  const { user } = useWorkspace();
  const { applyQuery } = useLeadFilters();
  const data = useQuery(api.leadCrmStore.listMeetings, { workspaceId });

  const [dialog, setDialog] = useState<LeadRowDialogState | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const groups = useMemo(
    () => (data ? groupMeetings(data.items as MeetingItem[], data.now) : null),
    [data],
  );

  if (data === undefined || groups === null) {
    return <MeetingsPanelSkeleton />;
  }

  const ukupno =
    groups.danas.length +
    groups.sutra.length +
    groups.oveNedelje.length +
    groups.prosliBezIshoda.length;

  const zajednicko = {
    workspaceId,
    now,
    selfUserId: user?.id,
    onOpenDialog: setDialog,
    onOpenStageDialog: setDialog,
    onError: setActionError,
  };

  return (
    <div className="flex flex-col gap-6">
      {data.mozdaImaJos && (
        <FeedbackNote tone="warning" title="Lista sastanaka nije potpuna">
          Iza granice pretrage možda ima još sastanaka. Rešite prikazane stavke
          kako bi se oslobodilo mesto za preostale.
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

      {ukupno === 0 ? (
        // Nema sastanaka = nema dogovorenih termina, ne „nema posla":
        // sastanak se dogovara iz reda u tabeli (A1 §3).
        <WorkSection
          naslov="Sastanci"
          icon={CalendarClock}
          kriterijum="prošli bez ishoda · danas · sutra · do kraja nedelje"
          ukupno={0}
          loading={false}
          prazno={
            <>
              Nema zakazanih sastanaka. Sastanak se dogovara iz reda u tabeli ili
              iz profila firme; ovde se pojavljuje raspoređen po danima, a prošli
              bez ishoda idu na vrh.
            </>
          }
          praznoAkcija={{
            label: "Otvori tabelu leadova",
            onClick: () => applyQuery("", { tab: "leads" }),
          }}
        />
      ) : (
        <>
          {/* Grupa upozorenja ide prva — to je razlog postojanja panela (§4). */}
          <MeetingGroup
            {...zajednicko}
            naslov="Prošli, bez zabeleženog ishoda"
            icon={AlertTriangle}
            kriterijum="sastanak je prošao, a niko nije upisao šta se desilo"
            items={groups.prosliBezIshoda}
            tone="danger"
          />
          <MeetingGroup
            {...zajednicko}
            naslov="Danas"
            icon={CalendarClock}
            kriterijum="sastanci zakazani za danas"
            items={groups.danas}
            tone="warning"
          />
          <MeetingGroup
            {...zajednicko}
            naslov="Sutra"
            icon={CalendarDays}
            kriterijum="sastanci zakazani za sutra"
            items={groups.sutra}
            tone="neutral"
          />
          <MeetingGroup
            {...zajednicko}
            naslov="Ove nedelje"
            icon={CalendarRange}
            kriterijum="sastanci do kraja ove nedelje"
            items={groups.oveNedelje}
            tone="neutral"
          />
        </>
      )}

      <LeadRowDialogs
        workspaceId={workspaceId}
        dialog={dialog}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}

function MeetingGroup({
  naslov,
  icon,
  kriterijum,
  items,
  tone,
  workspaceId,
  now,
  selfUserId,
  onOpenDialog,
  onOpenStageDialog,
  onError,
}: {
  naslov: string;
  icon: React.ComponentType<{ className?: string }>;
  kriterijum: string;
  items: MeetingItem[];
  tone: "danger" | "warning" | "neutral";
  workspaceId: Id<"workspaces">;
  now: number;
  selfUserId?: string;
  onOpenDialog: (dialog: LeadRowDialogState) => void;
  onOpenStageDialog: (dialog: LeadRowDialogState) => void;
  onError: (message: string) => void;
}) {
  // Prazne grupe se ne crtaju: kad sastanaka uopšte nema, ceo panel već ima
  // jedno pošteno prazno stanje iznad.
  if (items.length === 0) return null;

  return (
    <WorkSection
      naslov={naslov}
      icon={icon}
      kriterijum={kriterijum}
      ukupno={items.length}
      tone={tone}
      loading={false}
    >
      {items.map((m) => {
        const item = kaoRed(m);
        return (
          <WorkCard
            key={m.assignment._id}
            edge={rowEdge(item, now)}
            href={`/leadovi/${m.assignment.companyId}`}
            name={m.company?.name ?? "Nepoznata firma"}
            meta={[m.company?.city, m.company?.municipality]
              .filter(Boolean)
              .join(", ")}
            zasto={
              <>
                <Chip
                  tone={tone === "neutral" ? "muted" : tone}
                  size="sm"
                  icon={CalendarClock}
                  title={formatDateTime(m.meetingAt)}
                >
                  {formatDayRelative(m.meetingAt, now)} u {formatClockTime(m.meetingAt)}
                </Chip>
                {m.meetingNote && (
                  <span className="w-full truncate text-meta italic text-text-muted">
                    „{m.meetingNote}”
                  </span>
                )}
              </>
            }
            primary={
              <LeadRowActions
                workspaceId={workspaceId}
                item={item}
                now={now}
                selfUserId={selfUserId}
                onCall={() => {
                  /* `listMeetings` ne hidrira brojeve — poziv ide sa profila. */
                }}
                onOpenDialog={(kind) => onOpenDialog({ kind, item })}
                onOpenStageDialog={(stage) =>
                  onOpenStageDialog({ kind: "stage", item, stage })
                }
                onError={onError}
                className="w-full justify-between"
              />
            }
          />
        );
      })}
    </WorkSection>
  );
}

function MeetingsPanelSkeleton() {
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
