"use client";

import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { LeadStage } from "@/convex/leadCrmStore";
import {
  Activity,
  Calendar,
  CalendarClock,
  CalendarPlus,
  ChevronDown,
  Mail,
  Phone,
  PhoneCall,
  PhoneOff,
  Tag,
  UserCheck,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FeedbackNote } from "@/components/app/feedback";
import { useProjekat, useProjekatMutation } from "@/components/app/projekat-provider";
import { Unfold } from "@/components/motion/unfold";
import { LeadCallStrip } from "./lead-call-strip";
import { StageMenuItems, useStagePick } from "./lead-row-actions";
import {
  AssignDialog,
  MeetingDialog,
  NextActionDialog,
  OutcomeDialog,
  StageDialog,
  TouchDialog,
  getErrorMessage,
} from "./lead-quick-dialogs";
import { leadStageLabel } from "./lead-labels";
import {
  mailHref,
  telHref,
  type LeadRowContact,
} from "./lead-urgency";
import { pluralSr } from "@/lib/format";

type DialogState =
  | { kind: "meeting"; calledPhone?: string }
  | { kind: "nextAction" | "outcome" | "touch" | "assign" }
  | { kind: "stage"; stage: LeadStage };

/**
 * „Pozovi" — jedino primarno dugme profila (UI Boost §8). Tri stanja, i
 * nijedno nije mrtva kontrola:
 *   - jedan broj     → `tel:` link;
 *   - više brojeva   → isto dugme otvara spisak brojeva;
 *   - nema broja     → primarno postaje „Dodaj broj" (bez broja je to sledeći
 *                      korak), ili prigušena napomena kad dopuna nije moguća.
 */
function CallButton({
  contacts,
  onPick,
  onAddPhone,
}: {
  contacts: LeadRowContact[];
  onPick: (value: string) => void;
  onAddPhone?: () => void;
}) {
  if (contacts.length === 0) {
    return onAddPhone ? (
      <Button variant="primary" onClick={onAddPhone} className="touch-target">
        <PhoneOff data-icon="inline-start" aria-hidden />
        Dodaj broj
      </Button>
    ) : (
      <span className="inline-flex h-8 items-center gap-1.5 text-ui text-text-muted">
        <PhoneOff className="size-4" aria-hidden />
        Nema broja u bazi
      </span>
    );
  }

  if (contacts.length === 1) {
    const only = contacts[0];
    return (
      <Button
        render={<a href={telHref(only.value)} />}
        nativeButton={false}
        variant="primary"
        title={only.value}
        onClick={() => onPick(only.value)}
        className="touch-target"
      >
        <Phone data-icon="inline-start" aria-hidden />
        Pozovi
      </Button>
    );
  }

  const count = contacts.length;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="primary" className="touch-target" />}
      >
        <Phone data-icon="inline-start" aria-hidden />
        Pozovi
        <span className="font-mono text-meta tabular-nums opacity-80">{count}</span>
        <ChevronDown data-icon="inline-end" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            {count} {pluralSr(count, "broj", "broja", "brojeva")}
          </DropdownMenuLabel>
          {contacts.map((c) => (
            <DropdownMenuItem
              key={c.value}
              render={<a href={telHref(c.value)} onClick={() => onPick(c.value)} />}
            >
              <Phone className="text-mod" />
              <span className="truncate font-mono tabular-nums">{c.value}</span>
              {c.personName && (
                <span className="ml-auto truncate pl-2 text-micro text-text-muted">
                  {c.personName}
                </span>
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Traka radnji na profilu (§8, v2 u B7).
 *
 * Izmereno 11.10.2026: osam dugmadi istog stila u jednom redu, a nijedno
 * primarno. Sada je red: JEDNO primarno („Pozovi"), dva prateća („Zabeleži
 * ishod", „Zakaži sastanak") i „Još radnji" sa svim ostalim — pisanje mejla,
 * dodir, sledeći korak, faza i vlasnik. Ništa nije nestalo, samo je dobilo
 * redosled. Dijalog se otvara samo tamo gde treba datum ili napomena; faza
 * bez obrazloženja i „dodeli meni" se upisuju odmah.
 */
export function LeadActionBar({
  companyId,
  companyName,
  assignment,
  phones,
  emails,
  onAddPhone,
}: {
  companyId: Id<"leadCompanies">;
  companyName: string;
  assignment: Doc<"leadAssignments"> | null;
  phones: LeadRowContact[];
  emails: LeadRowContact[];
  /** Otvara dopunu rupe „bez telefona"; bez nje se dugme „Dodaj broj" ne crta. */
  onAddPhone?: () => void;
}) {
  const { korisnik } = useProjekat();
  const assignLead = useProjekatMutation(api.leadCrmStore.assignLead);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [calledPhone, setCalledPhone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentStage: LeadStage = assignment?.stage ?? "nov";
  const pickStage = useStagePick({
    companyId,
    current: currentStage,
    onNeedsNote: (stage) => setDialog({ kind: "stage", stage }),
    onError: setError,
  });

  const isMine =
    korisnik?.id !== undefined &&
    assignment !== null &&
    String(assignment.ownerUserId) === korisnik.id;

  const assignSelf = async () => {
    if (!korisnik?.id) return;
    setError(null);
    try {
      await assignLead({
        companyId,
        ownerUserId: korisnik.id,
      });
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const base = {
    companyId,
    companyName,
    open: true,
    onOpenChange: (open: boolean) => {
      if (!open) setDialog(null);
    },
  };

  const imaSastanak = assignment?.meetingAt !== undefined;
  const imaKorak = assignment?.nextActionAt !== undefined;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <CallButton contacts={phones} onPick={setCalledPhone} onAddPhone={onAddPhone} />

        <Button
          variant="secondary"
          onClick={() => setDialog({ kind: "outcome" })}
          className="touch-target"
        >
          <Activity data-icon="inline-start" aria-hidden />
          Zabeleži ishod
        </Button>

        <Button
          variant="secondary"
          onClick={() => setDialog({ kind: "meeting" })}
          className="touch-target"
        >
          {imaSastanak ? (
            <CalendarClock data-icon="inline-start" aria-hidden />
          ) : (
            <CalendarPlus data-icon="inline-start" aria-hidden />
          )}
          {imaSastanak ? "Izmeni sastanak" : "Zakaži sastanak"}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="outline" className="touch-target" />}
          >
            Još radnji
            <ChevronDown data-icon="inline-end" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Kontakt</DropdownMenuLabel>
              {emails.length === 0 ? (
                <DropdownMenuItem disabled>
                  <Mail />
                  Nema e-mail u bazi
                </DropdownMenuItem>
              ) : (
                emails.map((c) => (
                  <DropdownMenuItem key={c.value} render={<a href={mailHref(c.value)} />}>
                    <Mail />
                    <span>Piši</span>
                    <span className="ml-auto truncate pl-3 text-micro text-text-muted">
                      {c.value}
                    </span>
                  </DropdownMenuItem>
                ))
              )}
              <DropdownMenuItem onClick={() => setDialog({ kind: "touch" })}>
                <PhoneCall />
                Zabeleži dodir…
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setDialog({ kind: "nextAction" })}>
                <Calendar />
                {imaKorak ? "Izmeni sledeći korak…" : "Sledeći korak…"}
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Stanje</DropdownMenuLabel>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Tag />
                  Faza
                  <span className="ml-auto pl-3 text-micro text-text-muted">
                    {leadStageLabel(currentStage)}
                  </span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-56">
                  <StageMenuItems current={currentStage} onPick={pickStage} />
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>
                {assignment
                  ? isMine
                    ? "Vlasnik: ti"
                    : "Vlasnik: član tima"
                  : "Bez vlasnika"}
              </DropdownMenuLabel>
              {korisnik?.id && !isMine && (
                <DropdownMenuItem onClick={assignSelf}>
                  <UserCheck />
                  Dodeli meni
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => setDialog({ kind: "assign" })}>
                <Users />
                Dodeli drugom…
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {error && (
        <FeedbackNote
          tone="danger"
          title="Radnja nije sačuvana"
          action={
            <Button size="xs" variant="ghost" onClick={() => setError(null)}>
              Zatvori
            </Button>
          }
        >
          {error}
        </FeedbackNote>
      )}

      {calledPhone && (
        <Unfold>
          <LeadCallStrip
            companyId={companyId}
            phone={calledPhone}
            onClose={() => setCalledPhone(null)}
            onScheduleMeeting={() =>
              setDialog({ kind: "meeting", calledPhone: calledPhone })
            }
            onRecordOutcome={() => setDialog({ kind: "outcome" })}
            onNextStep={() => setDialog({ kind: "nextAction" })}
            className="rounded-lg border border-mod-line bg-mod-soft px-3.5 py-2.5"
          />
        </Unfold>
      )}

      {dialog?.kind === "meeting" && (
        <MeetingDialog
          {...base}
          current={
            assignment?.meetingAt !== undefined
              ? { meetingAt: assignment.meetingAt, meetingNote: assignment.meetingNote }
              : null
          }
          currentStage={currentStage}
          calledPhone={dialog.calledPhone}
        />
      )}
      {dialog?.kind === "nextAction" && (
        <NextActionDialog
          {...base}
          current={
            assignment?.nextActionAt !== undefined
              ? {
                  nextActionAt: assignment.nextActionAt,
                  nextActionNote: assignment.nextActionNote,
                }
              : null
          }
        />
      )}
      {dialog?.kind === "outcome" && <OutcomeDialog {...base} />}
      {dialog?.kind === "touch" && <TouchDialog {...base} />}
      {dialog?.kind === "assign" && (
        <AssignDialog {...base} currentOwnerUserId={assignment?.ownerUserId} />
      )}
      {dialog?.kind === "stage" && (
        <StageDialog {...base} currentStage={currentStage} initialStage={dialog.stage} />
      )}
    </div>
  );
}
