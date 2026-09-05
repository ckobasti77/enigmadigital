"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
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
  Tag,
  UserCheck,
  Users,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FeedbackNote } from "@/components/app/feedback";
import { useWorkspace } from "@/components/app/workspace-provider";
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
import { cn } from "@/lib/utils";

type DialogState =
  | { kind: "meeting"; calledPhone?: string }
  | { kind: "nextAction" | "outcome" | "touch" | "assign" }
  | { kind: "stage"; stage: LeadStage };

const OUTLINE_SM = buttonVariants({ variant: "outline", size: "sm" });

/**
 * Dugme sa natpisom za telefon / e-mail na profilu (§8). Bez kontakta u bazi
 * se ne crta dugme koje ne radi — stoji prigušen natpis koji kaže zašto.
 */
function ContactButton({
  kind,
  contacts,
  onPick,
}: {
  kind: "phone" | "email";
  contacts: LeadRowContact[];
  onPick?: (value: string) => void;
}) {
  const Icon = kind === "phone" ? Phone : Mail;
  const verb = kind === "phone" ? "Pozovi" : "Piši";

  if (contacts.length === 0) {
    return (
      <span
        aria-disabled="true"
        className="inline-flex h-7 cursor-not-allowed items-center gap-1.5 rounded-lg border border-dashed border-line-soft px-2.5 text-[0.8rem] text-text-muted/70"
        title={kind === "phone" ? "Nema broj u bazi" : "Nema e-mail u bazi"}
      >
        <Icon className="size-3.5" />
        {verb}
        <span className="text-micro">· {kind === "phone" ? "nema broja" : "nema adrese"}</span>
      </span>
    );
  }

  if (contacts.length === 1) {
    const only = contacts[0];
    return (
      <a
        href={kind === "phone" ? telHref(only.value) : mailHref(only.value)}
        onClick={() => onPick?.(only.value)}
        className={cn(OUTLINE_SM, "gap-1.5 text-xs")}
        title={only.value}
      >
        <Icon className="size-3.5 text-accent-400" />
        {verb}
      </a>
    );
  }

  const count = contacts.length;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" size="sm" className="gap-1.5 text-xs" />}
      >
        <Icon className="size-3.5 text-accent-400" />
        {verb}
        <span className="font-mono text-micro tabular-nums text-text-muted">
          {count}
        </span>
        <ChevronDown className="size-3 text-text-muted" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>
          {count}{" "}
          {kind === "phone"
            ? pluralSr(count, "broj", "broja", "brojeva")
            : pluralSr(count, "adresa", "adrese", "adresa")}
        </DropdownMenuLabel>
        {contacts.map((c) => (
          <DropdownMenuItem
            key={c.value}
            render={
              <a
                href={kind === "phone" ? telHref(c.value) : mailHref(c.value)}
                onClick={() => onPick?.(c.value)}
              />
            }
          >
            <Icon className="text-accent-400" />
            <span className={cn("truncate", kind === "phone" && "font-mono tabular-nums")}>
              {c.value}
            </span>
            {c.personName && (
              <span className="ml-auto truncate pl-2 text-micro text-text-muted">
                {c.personName}
              </span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Traka radnji na vrhu profila (§8): šest modala svedeno na jedan red
 * dugmadi. Dijalog se otvara samo tamo gde treba datum ili napomena; faza
 * bez obrazloženja i „dodeli meni” se upisuju odmah.
 */
export function LeadActionBar({
  workspaceId,
  companyId,
  companyName,
  assignment,
  phones,
  emails,
}: {
  workspaceId: Id<"workspaces">;
  companyId: Id<"leadCompanies">;
  companyName: string;
  assignment: Doc<"leadAssignments"> | null;
  phones: LeadRowContact[];
  emails: LeadRowContact[];
}) {
  const { user } = useWorkspace();
  const assignLead = useMutation(api.leadCrmStore.assignLead);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [calledPhone, setCalledPhone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentStage: LeadStage = assignment?.stage ?? "nov";
  const pickStage = useStagePick({
    workspaceId,
    companyId,
    current: currentStage,
    onNeedsNote: (stage) => setDialog({ kind: "stage", stage }),
    onError: setError,
  });

  const isMine =
    user?.id !== undefined &&
    assignment !== null &&
    String(assignment.ownerUserId) === user.id;

  const assignSelf = async () => {
    if (!user?.id) return;
    setError(null);
    try {
      await assignLead({
        workspaceId,
        companyId,
        ownerUserId: user.id as Id<"users">,
      });
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const base = {
    workspaceId,
    companyId,
    companyName,
    open: true,
    onOpenChange: (open: boolean) => {
      if (!open) setDialog(null);
    },
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <ContactButton kind="phone" contacts={phones} onPick={setCalledPhone} />
        <ContactButton kind="email" contacts={emails} />

        <span className="mx-1 hidden h-5 w-px bg-line sm:block" aria-hidden />

        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs"
          onClick={() => setDialog({ kind: "touch" })}
        >
          <PhoneCall className="size-3.5" />
          Zabeleži dodir
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs"
          onClick={() => setDialog({ kind: "nextAction" })}
        >
          <Calendar className="size-3.5" />
          {assignment?.nextActionAt !== undefined ? "Izmeni sledeći korak" : "Sledeći korak"}
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs"
          onClick={() => setDialog({ kind: "meeting" })}
        >
          {assignment?.meetingAt !== undefined ? (
            <CalendarClock className="size-3.5" />
          ) : (
            <CalendarPlus className="size-3.5" />
          )}
          {assignment?.meetingAt !== undefined ? "Izmeni sastanak" : "Zakaži sastanak"}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="outline" size="sm" className="gap-1.5 text-xs" />}
          >
            <Tag className="size-3.5" />
            Faza: {leadStageLabel(currentStage)}
            <ChevronDown className="size-3 text-text-muted" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>Promeni fazu</DropdownMenuLabel>
            <StageMenuItems current={currentStage} onPick={pickStage} />
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs"
          onClick={() => setDialog({ kind: "outcome" })}
        >
          <Activity className="size-3.5" />
          Zabeleži ishod
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="outline" size="sm" className="gap-1.5 text-xs" />}
          >
            <Users className="size-3.5" />
            {assignment ? (isMine ? "Vlasnik: ti" : "Vlasnik: član tima") : "Bez vlasnika"}
            <ChevronDown className="size-3 text-text-muted" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {user?.id && !isMine && (
              <DropdownMenuItem onClick={assignSelf}>
                <UserCheck />
                Dodeli meni
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => setDialog({ kind: "assign" })}>
              <Users />
              Dodeli drugom…
            </DropdownMenuItem>
            {isMine && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Lead je dodeljen tebi.</DropdownMenuLabel>
              </>
            )}
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
            workspaceId={workspaceId}
            companyId={companyId}
            phone={calledPhone}
            onClose={() => setCalledPhone(null)}
            onScheduleMeeting={() =>
              setDialog({ kind: "meeting", calledPhone: calledPhone })
            }
            onRecordOutcome={() => setDialog({ kind: "outcome" })}
            onNextStep={() => setDialog({ kind: "nextAction" })}
            className="rounded-lg border border-line-soft bg-accent-400/5 px-3.5 py-2.5"
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
