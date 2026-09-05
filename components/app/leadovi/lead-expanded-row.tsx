"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  Activity,
  Calendar,
  CalendarClock,
  ExternalLink,
  PhoneCall,
  User,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FeedbackLine } from "@/components/app/feedback";
import { ContactLink } from "./lead-chips";
import {
  leadSignalLabel,
  leadTouchChannelLabel,
  personRoleLabel,
} from "./lead-labels";
import { getErrorMessage } from "./lead-quick-dialogs";
import type { RowDialogKind } from "./lead-row-actions";
import {
  isMeetingUnresolved,
  isNextActionOverdue,
  isUntouchedTooLong,
  type LeadRowItem,
} from "./lead-urgency";
import {
  formatClockTime,
  formatDateTime,
  formatDayRelative,
  formatDaysAgo,
} from "@/lib/format";
import { cn } from "@/lib/utils";

function Section({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex min-w-0 flex-col gap-2", className)}>
      <h4 className="text-micro font-semibold uppercase tracking-wider text-text-muted">
        {title}
      </h4>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-xs text-text-muted">{children}</p>;
}

/**
 * Prošireni red (§6). SVE što se ovde vidi stiglo je u istom paketu kao i red
 * — nema upita po otvorenom redu (O4). Jedini upis je beleška, i to na klik.
 */
export function LeadExpandedRow({
  workspaceId,
  item,
  now,
  onCall,
  onOpenDialog,
}: {
  workspaceId: Id<"workspaces">;
  item: LeadRowItem;
  now: number;
  onCall: (phone: string) => void;
  onOpenDialog: (kind: RowDialogKind) => void;
}) {
  const { assignment, company } = item;
  const companyId = assignment.companyId;

  const logTouch = useMutation(api.leadCrmStore.logTouch);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [noteState, setNoteState] = useState<
    { tone: "success" | "danger"; text: string } | null
  >(null);

  const saveNote = async () => {
    const clean = note.trim();
    if (!clean) return;
    setSaving(true);
    setNoteState(null);
    try {
      await logTouch({ workspaceId, companyId, channel: "beleska", note: clean });
      setNote("");
      setNoteState({ tone: "success", text: "Beleška upisana u istoriju." });
    } catch (err) {
      setNoteState({ tone: "danger", text: getErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  const overdue = isNextActionOverdue(assignment, now);
  const meetingUnresolved = isMeetingUnresolved(assignment, now);
  const touch = item.poslednjiDodir;
  const untouchedTooLong = isUntouchedTooLong(assignment, now);

  return (
    <div className="grid gap-x-8 gap-y-5 px-4 py-4 text-xs md:grid-cols-2 xl:grid-cols-[1.25fr_1fr_1.15fr_1fr]">
      {/* Kontakt */}
      <Section title="Kontakt">
        {item.osobe.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {item.osobe.map((p, i) => (
              <li key={`${p.name}-${i}`} className="flex flex-wrap items-center gap-1.5">
                <User className="size-3 shrink-0 text-text-muted" aria-hidden />
                <span className="font-medium text-foreground">{p.name}</span>
                <span className="rounded border border-line bg-surface-raised px-1.5 py-px text-micro text-text-muted">
                  {personRoleLabel(p.role)}
                  {p.roleConfidence === "verovatno" && " · verovatno"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Nema kontakt osobe u bazi.</Empty>
        )}

        <div className="flex flex-col gap-0.5">
          {item.telefoni.length > 0 ? (
            item.telefoni.map((t) => (
              <ContactLink
                key={t.value}
                kind="phone"
                value={t.value}
                personName={t.personName}
                onClick={() => onCall(t.value)}
                className="-mx-1.5"
              />
            ))
          ) : (
            <Empty>Nema broja telefona u bazi.</Empty>
          )}
          {item.emailovi.length > 0 ? (
            item.emailovi.map((e) => (
              <ContactLink
                key={e.value}
                kind="email"
                value={e.value}
                personName={e.personName}
                className="-mx-1.5"
              />
            ))
          ) : (
            <Empty>Nema e-mail adrese u bazi.</Empty>
          )}
        </div>
      </Section>

      {/* Signali */}
      <Section title="Signali">
        {item.signali.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {item.signali.map((kind) => (
              <li
                key={kind}
                className="rounded-md border border-line bg-surface-raised px-2 py-0.5 text-micro font-medium text-foreground"
              >
                {leadSignalLabel(kind)}
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Nema zabeleženih signala.</Empty>
        )}
      </Section>

      {/* Plan: poslednji dodir, sledeći korak, sastanak */}
      <Section title="Dodir i plan" className="gap-3">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5 text-micro text-text-muted">
            <PhoneCall className="size-3" aria-hidden />
            Poslednji dodir
          </div>
          {touch ? (
            <>
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium text-foreground">
                  {leadTouchChannelLabel(touch.channel)}
                </span>
                <span className="text-text-muted">{formatDateTime(touch.occurredAt)}</span>
                <span className={untouchedTooLong ? "font-medium text-danger" : "text-text-muted"}>
                  {formatDaysAgo(touch.occurredAt, now)}
                </span>
              </div>
              {touch.note && (
                <p className="line-clamp-2 italic text-text-muted">„{touch.note}”</p>
              )}
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className={untouchedTooLong ? "font-medium text-danger" : "text-text-muted"}>
                Nema zabeleženog dodira.
              </span>
              <Button
                size="xs"
                variant="outline"
                onClick={() => onOpenDialog("touch")}
              >
                Zabeleži
              </Button>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5 text-micro text-text-muted">
            <Calendar className="size-3" aria-hidden />
            Sledeći korak
          </div>
          {assignment.nextActionAt !== undefined ? (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className={cn("font-medium", overdue ? "text-danger" : "text-foreground")}>
                {formatDayRelative(assignment.nextActionAt, now)} u{" "}
                {formatClockTime(assignment.nextActionAt)}
              </span>
              {overdue && (
                <span className="rounded bg-danger/10 px-1 py-px text-micro font-bold text-danger">
                  Kasni
                </span>
              )}
              {assignment.nextActionNote && (
                <span className="line-clamp-1 italic text-text-muted">
                  „{assignment.nextActionNote}”
                </span>
              )}
              <Button
                size="xs"
                variant="ghost"
                onClick={() => onOpenDialog("nextAction")}
                className="text-text-muted hover:text-foreground"
              >
                Izmeni
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-text-muted">Nije planiran.</span>
              <Button size="xs" variant="outline" onClick={() => onOpenDialog("nextAction")}>
                Postavi
              </Button>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5 text-micro text-text-muted">
            <CalendarClock className="size-3" aria-hidden />
            Sastanak
          </div>
          {assignment.meetingAt !== undefined ? (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span
                className={cn(
                  "font-medium",
                  meetingUnresolved ? "text-danger" : "text-foreground",
                )}
              >
                {formatDayRelative(assignment.meetingAt, now)} u{" "}
                {formatClockTime(assignment.meetingAt)}
              </span>
              {meetingUnresolved && (
                <span className="rounded bg-danger/10 px-1 py-px text-micro font-bold text-danger">
                  Prošao, bez ishoda
                </span>
              )}
              {assignment.meetingNote && (
                <span className="line-clamp-1 italic text-text-muted">
                  „{assignment.meetingNote}”
                </span>
              )}
              <Button
                size="xs"
                variant="ghost"
                onClick={() => onOpenDialog("meeting")}
                className="text-text-muted hover:text-foreground"
              >
                Izmeni
              </Button>
              {meetingUnresolved && (
                <Button size="xs" variant="outline" onClick={() => onOpenDialog("outcome")}>
                  <Activity />
                  Zabeleži ishod
                </Button>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-text-muted">Nije zakazan.</span>
              <Button size="xs" variant="outline" onClick={() => onOpenDialog("meeting")}>
                Zakaži
              </Button>
            </div>
          )}
        </div>
      </Section>

      {/* Beleška + profil */}
      <Section title="Beleška">
        <label htmlFor={`note-${assignment._id}`} className="sr-only">
          Beleška za {company?.name ?? "firmu"}
        </label>
        <Textarea
          id={`note-${assignment._id}`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void saveNote();
            }
          }}
          placeholder="Kratka beleška — upisuje se u istoriju kao dodir „beleška”…"
          className="min-h-14 text-xs"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="xs"
            disabled={saving || !note.trim()}
            onClick={saveNote}
          >
            {saving ? "Upisujem…" : "Sačuvaj belešku"}
          </Button>
          <span className="text-micro text-text-muted">Ctrl+Enter</span>
          {noteState && (
            <FeedbackLine tone={noteState.tone}>{noteState.text}</FeedbackLine>
          )}
        </div>
        <Link
          href={`/leadovi/${companyId}`}
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "mt-auto w-fit gap-1.5 text-xs",
          )}
        >
          <ExternalLink className="size-3.5" />
          Otvori profil
        </Link>
      </Section>
    </div>
  );
}
