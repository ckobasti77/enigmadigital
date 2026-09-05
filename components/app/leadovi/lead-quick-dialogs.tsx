"use client";

import { useState, type ReactNode } from "react";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { LeadStage, LeadOutcome } from "@/convex/leadCrmStore";
import { LEAD_OUTCOME_CODES } from "@/convex/leadCrmStore";
import { CalendarX2, ShieldAlert, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { FeedbackLine, FeedbackNote } from "@/components/app/feedback";
import { useWorkspace } from "@/components/app/workspace-provider";
import { useNow } from "@/components/app/use-now";
import {
  LEAD_OUTCOME_LABELS,
  leadOutcomeLabel,
  leadStageLabel,
} from "./lead-labels";
import { ALL_STAGES, stageRequiresNote } from "./lead-chips";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Dijalozi za CRM poteze koji traže datum ili napomenu (§5, §8). Isti dijalog
 * služi i tabeli (meni u redu) i profilu firme (traka radnji), pa se forma
 * piše jednom. Radnje koje ne traže ništa osim klika — promena faze bez
 * napomene, „dodeli meni” — NE prolaze kroz dijalog; pišu se direktno tamo
 * gde je dugme.
 *
 * Svaki dijalog se MONTIRA tek kad se otvori (roditelj ga crta samo dok je
 * `open`), pa početno stanje forme dolazi iz props-a pri montiranju — nema
 * efekta koji „resetuje” polja.
 */

export type LeadDialogBase = {
  workspaceId: Id<"workspaces">;
  companyId: Id<"leadCompanies">;
  companyName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function getErrorMessage(err: unknown): string {
  if (err instanceof ConvexError) {
    return (err.data as { message?: string })?.message ?? err.message;
  }
  if (err instanceof Error) return err.message;
  return "Došlo je do neočekivane greške.";
}

/** Timestamp → vrednost za `<input type="datetime-local">` u lokalnoj zoni. */
export function toDateTimeLocal(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDateTimeLocal(value: string): number | null {
  if (!value) return null;
  const ts = new Date(value).getTime();
  return Number.isNaN(ts) ? null : ts;
}

/** Zajednički okvir: naslov, opis, greška, sadržaj, podnožje, dugme za zatvaranje. */
function ActionDialog({
  open,
  onOpenChange,
  title,
  description,
  error,
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  error?: string | null;
  children: ReactNode;
  footer: ReactNode;
  className?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className={cn("max-w-md", className)}>
        <DialogHeader>
          <DialogTitle className="text-base font-bold">{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {error && (
          <FeedbackNote tone="danger" title="Nije sačuvano">
            {error}
          </FeedbackNote>
        )}

        <div className="flex flex-col gap-3 py-1">{children}</div>

        <DialogFooter>{footer}</DialogFooter>
        <DialogClose />
      </DialogPopup>
    </Dialog>
  );
}

function FieldLabel({
  htmlFor,
  children,
  required,
}: {
  htmlFor?: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <Label htmlFor={htmlFor} className="text-xs font-semibold text-foreground">
      {children}
      {required && (
        <span className="font-bold text-danger" aria-hidden>
          *
        </span>
      )}
    </Label>
  );
}

// ── Sastanak ────────────────────────────────────────────────────────────────

export type MeetingDialogProps = LeadDialogBase & {
  current?: { meetingAt: number; meetingNote?: string } | null;
  currentStage?: LeadStage;
  /** Broj koji je upravo pozvan — nudi da se i poziv upiše kao dodir. */
  calledPhone?: string;
};

/**
 * Zakazivanje / izmena / otkazivanje sastanka (§4/O1, §5). Termin u prošlosti
 * je dozvoljen (beleži se održan sastanak), ali se to kaže pre čuvanja.
 * Prelazak faze u „Sastanak” se NUDI kao izbor, nikad ne radi sam.
 */
export function MeetingDialog({
  workspaceId,
  companyId,
  companyName,
  open,
  onOpenChange,
  current,
  currentStage,
  calledPhone,
}: MeetingDialogProps) {
  const setMeeting = useMutation(api.leadCrmStore.setMeeting);
  const clearMeeting = useMutation(api.leadCrmStore.clearMeeting);
  const setStage = useMutation(api.leadCrmStore.setStage);
  const logTouch = useMutation(api.leadCrmStore.logTouch);

  const now = useNow();
  const [phase, setPhase] = useState<"form" | "cancel">("form");
  const [when, setWhen] = useState(() =>
    current ? toDateTimeLocal(current.meetingAt) : "",
  );
  const [note, setNote] = useState(current?.meetingNote ?? "");
  const [cancelNote, setCancelNote] = useState("");
  const [moveToStage, setMoveToStage] = useState(false);
  const [logCall, setLogCall] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ts = fromDateTimeLocal(when);
  const inPast = ts !== null && ts < now;
  const canOfferStage =
    currentStage !== undefined &&
    currentStage !== "sastanak" &&
    !stageRequiresNote(currentStage);

  const save = async () => {
    setError(null);
    if (ts === null) {
      setError("Izaberi datum i vreme sastanka.");
      return;
    }
    setBusy(true);
    try {
      await setMeeting({
        workspaceId,
        companyId,
        meetingAt: ts,
        meetingNote: note.trim() || undefined,
      });
      if (canOfferStage && moveToStage) {
        await setStage({ workspaceId, companyId, stage: "sastanak" });
      }
      if (calledPhone && logCall) {
        await logTouch({
          workspaceId,
          companyId,
          channel: "poziv",
          note: `Poziv na ${calledPhone}`,
        });
      }
      onOpenChange(false);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setError(null);
    setBusy(true);
    try {
      await clearMeeting({
        workspaceId,
        companyId,
        note: cancelNote.trim() || undefined,
      });
      onOpenChange(false);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (phase === "cancel" && current) {
    return (
      <ActionDialog
        open={open}
        onOpenChange={onOpenChange}
        title="Otkaži sastanak"
        description={`Termin ${formatDateTime(current.meetingAt)} sa „${companyName}” se briše; u istoriji ostaje da je bio dogovoren.`}
        error={error}
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => setPhase("form")}
            >
              Nazad
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={cancel}
            >
              <CalendarX2 />
              {busy ? "Otkazivanje…" : "Otkaži sastanak"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="meeting-cancel-note">Razlog otkazivanja (opciono)</FieldLabel>
          <Textarea
            id="meeting-cancel-note"
            value={cancelNote}
            onChange={(e) => setCancelNote(e.target.value)}
            placeholder="Npr. vlasnik je odložio, javiće se sledeće nedelje…"
            className="min-h-16 text-xs"
          />
        </div>
      </ActionDialog>
    );
  }

  return (
    <ActionDialog
      open={open}
      onOpenChange={onOpenChange}
      title={current ? "Izmeni sastanak" : "Zakaži sastanak"}
      description={`Dogovoren termin sa „${companyName}”. Sastanak je zaseban od sledećeg koraka — oba mogu da postoje.`}
      error={error}
      footer={
        <>
          {current && (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => setPhase("cancel")}
              className="text-danger hover:text-danger sm:mr-auto"
            >
              <CalendarX2 />
              Otkaži sastanak
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Odustani
          </Button>
          <Button size="sm" disabled={busy} onClick={save}>
            {busy ? "Čuvanje…" : current ? "Sačuvaj izmenu" : "Zakaži"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="meeting-when" required>
          Datum i vreme
        </FieldLabel>
        <Input
          id="meeting-when"
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          className="text-xs"
        />
        {inPast && (
          <FeedbackLine tone="warning">
            Termin je u prošlosti — upisuje se kao održan sastanak.
          </FeedbackLine>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="meeting-note">Gde i kako (jedna rečenica)</FieldLabel>
        <Textarea
          id="meeting-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Npr. u salonu, poneti ponudu i primere landing strana…"
          className="min-h-16 text-xs"
        />
      </div>

      {(canOfferStage || calledPhone) && (
        <div className="flex flex-col gap-2 rounded-lg border border-line-soft bg-surface p-2.5">
          {canOfferStage && (
            <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
              <Checkbox
                checked={moveToStage}
                onCheckedChange={(checked) => setMoveToStage(checked === true)}
              />
              <span>
                Prebaci fazu u „Sastanak” (sada:{" "}
                {leadStageLabel(currentStage ?? "nov")})
              </span>
            </label>
          )}
          {calledPhone && (
            <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
              <Checkbox
                checked={logCall}
                onCheckedChange={(checked) => setLogCall(checked === true)}
              />
              <span>
                Upiši i poziv na{" "}
                <span className="font-mono tabular-nums">{calledPhone}</span> kao
                dodir
              </span>
            </label>
          )}
        </div>
      )}
    </ActionDialog>
  );
}

// ── Sledeći korak ───────────────────────────────────────────────────────────

export type NextActionDialogProps = LeadDialogBase & {
  current?: { nextActionAt: number; nextActionNote?: string } | null;
};

export function NextActionDialog({
  workspaceId,
  companyId,
  companyName,
  open,
  onOpenChange,
  current,
}: NextActionDialogProps) {
  const setNextAction = useMutation(api.leadCrmStore.setNextAction);
  const now = useNow();
  const [when, setWhen] = useState(() =>
    current ? toDateTimeLocal(current.nextActionAt) : "",
  );
  const [note, setNote] = useState(current?.nextActionNote ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ts = fromDateTimeLocal(when);
  const inPast = ts !== null && ts < now;

  const save = async () => {
    setError(null);
    if (ts === null) {
      setError("Izaberi datum i vreme sledećeg koraka.");
      return;
    }
    setBusy(true);
    try {
      await setNextAction({
        workspaceId,
        companyId,
        nextActionAt: ts,
        nextActionNote: note.trim() || undefined,
      });
      onOpenChange(false);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ActionDialog
      open={open}
      onOpenChange={onOpenChange}
      title={current ? "Izmeni sledeći korak" : "Postavi sledeći korak"}
      description={`Kad se sledeći put javljaš firmi „${companyName}” i šta tada radiš.`}
      error={error}
      footer={
        <>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Odustani
          </Button>
          <Button size="sm" disabled={busy} onClick={save}>
            {busy ? "Čuvanje…" : "Sačuvaj korak"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="next-when" required>
          Rok
        </FieldLabel>
        <Input
          id="next-when"
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          className="text-xs"
        />
        {inPast && (
          <FeedbackLine tone="warning">
            Rok je u prošlosti — lead će odmah biti zaostao.
          </FeedbackLine>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="next-note">Šta treba uraditi</FieldLabel>
        <Textarea
          id="next-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Npr. pozvati posle 15h kad vlasnik pogleda landing stranu…"
          className="min-h-16 text-xs"
        />
      </div>
    </ActionDialog>
  );
}

// ── Faza (samo kad treba napomena) ──────────────────────────────────────────

export type StageDialogProps = LeadDialogBase & {
  currentStage: LeadStage;
  /** Faza na koju se prešlo iz menija; dijalog se otvara da se upiše obrazloženje. */
  initialStage: LeadStage;
};

export function StageDialog({
  workspaceId,
  companyId,
  companyName,
  open,
  onOpenChange,
  currentStage,
  initialStage,
}: StageDialogProps) {
  const setStage = useMutation(api.leadCrmStore.setStage);
  const [stage, setStageValue] = useState<LeadStage>(initialStage);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const required = stageRequiresNote(stage);

  const save = async () => {
    setError(null);
    const clean = note.trim();
    if (required && !clean) {
      setError(
        `Za fazu „${leadStageLabel(stage)}” obrazloženje je obavezno — bez njega istorija ne zna zašto.`,
      );
      return;
    }
    setBusy(true);
    try {
      await setStage({
        workspaceId,
        companyId,
        stage,
        note: clean || undefined,
      });
      onOpenChange(false);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ActionDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Promena faze"
      description={`„${companyName}” je sada u fazi „${leadStageLabel(currentStage)}”.`}
      error={error}
      footer={
        <>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Odustani
          </Button>
          <Button size="sm" disabled={busy || stage === currentStage} onClick={save}>
            {busy ? "Čuvanje…" : "Sačuvaj fazu"}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Nova faza">
        {ALL_STAGES.map((st) => {
          const selected = stage === st;
          return (
            <button
              key={st}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setStageValue(st)}
              className={cn(
                "rounded-lg border px-3 py-2 text-left text-xs font-semibold transition-colors",
                selected
                  ? "border-accent-400 bg-accent-400/10 text-accent-400"
                  : "border-line bg-surface-raised text-text-muted hover:text-foreground",
                st === currentStage && !selected && "opacity-60",
              )}
            >
              {leadStageLabel(st)}
              {st === currentStage && (
                <span className="ml-1 text-micro font-normal text-text-muted">
                  (sada)
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="stage-note" required={required}>
          {required ? "Obrazloženje" : "Napomena (opciono)"}
        </FieldLabel>
        <Textarea
          id="stage-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={
            required
              ? "Zašto je lead dobijen ili izgubljen — ovo ostaje u istoriji."
              : "Razlog promene faze, ako ga vredi zapisati…"
          }
          className="min-h-16 text-xs"
        />
      </div>
    </ActionDialog>
  );
}

// ── Ishod ───────────────────────────────────────────────────────────────────

export type OutcomeDialogProps = LeadDialogBase;

/**
 * Ishod iz zatvorene liste (§9) + slobodna napomena. Ako mutacija PREDLOŽI
 * zabranu kontakta, dijalog to pokaže i traži izričitu potvrdu — sam predlog
 * ništa ne upisuje.
 */
export function OutcomeDialog({
  workspaceId,
  companyId,
  companyName,
  open,
  onOpenChange,
}: OutcomeDialogProps) {
  const recordOutcome = useMutation(api.leadCrmStore.recordOutcome);
  const addToSuppression = useMutation(
    api.leadCrmStore.addToSuppressionFromOutcome,
  );

  const [code, setCode] = useState<LeadOutcome | "">("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<{
    poklopljeniIzraz?: string;
  } | null>(null);

  const save = async () => {
    setError(null);
    if (!code) {
      setError("Izaberi ishod iz liste — detalji idu u napomenu.");
      return;
    }
    setBusy(true);
    try {
      const res = await recordOutcome({
        workspaceId,
        companyId,
        outcome: code,
        note: note.trim() || undefined,
      });
      if (res.predlogZaSuppression) {
        setProposal({ poklopljeniIzraz: res.poklopljeniIzraz });
      } else {
        onOpenChange(false);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const confirmSuppression = async () => {
    setError(null);
    setBusy(true);
    try {
      await addToSuppression({
        workspaceId,
        companyId,
        kind: "rekao_ne",
        reason: `Dodato nakon ishoda „${code ? leadOutcomeLabel(code) : ""}”`,
      });
      onOpenChange(false);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (proposal) {
    return (
      <ActionDialog
        open={open}
        onOpenChange={onOpenChange}
        className="max-w-lg border-warning/40"
        title={
          <span className="flex items-center gap-2">
            <ShieldAlert className="size-5 shrink-0 text-warning" />
            Predlog za zabranu kontakta
          </span>
        }
        description="Ishod je sačuvan. U njemu je prepoznat izraz odbijanja, pa se predlaže da firma ide na listu „ne diraj”."
        error={error}
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              Ne dodaj (ishod ostaje sačuvan)
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={confirmSuppression}
            >
              {busy ? "Dodavanje…" : "Potvrdi zabranu kontakta"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-text-muted">Poklopljeni izraz:</span>
            <span className="rounded bg-warning/20 px-2 py-0.5 font-mono font-bold text-warning">
              „{proposal.poklopljeniIzraz}”
            </span>
          </div>
          <p className="leading-relaxed text-text-muted">
            Predlog je nastao poklapanjem reči u ishodu, ne pouzdanom proverom
            — zato ga potvrđuje čovek.
          </p>
        </div>
        <p className="text-xs leading-relaxed text-foreground">
          Ako potvrdiš, <strong>{companyName}</strong> (i njen PIB, ako postoji)
          ide na listu zabrane. Provera se radi pri uvozu tabela: firma više
          neće ući kao nov lead. Postojeći lead se i dalje može zvati — zabrana
          je oznaka za tim, ne brava.
        </p>
      </ActionDialog>
    );
  }

  return (
    <ActionDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Zabeleži ishod razgovora"
      description={`Rezultat komunikacije sa „${companyName}”. Ishod je iz zatvorene liste; objašnjenje ide u napomenu.`}
      error={error}
      footer={
        <>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Odustani
          </Button>
          <Button size="sm" disabled={busy || !code} onClick={save}>
            {busy ? "Čuvanje…" : "Sačuvaj ishod"}
          </Button>
        </>
      }
    >
      <div
        className="grid grid-cols-2 gap-2 sm:grid-cols-3"
        role="radiogroup"
        aria-label="Ishod razgovora"
      >
        {LEAD_OUTCOME_CODES.map((c) => {
          const selected = code === c;
          return (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setCode(c)}
              className={cn(
                "rounded-lg border px-3 py-2 text-left text-xs font-semibold transition-colors",
                selected
                  ? "border-accent-400 bg-accent-400/10 text-accent-400"
                  : "border-line bg-surface-raised text-text-muted hover:text-foreground",
              )}
            >
              {LEAD_OUTCOME_LABELS[c]}
            </button>
          );
        })}
      </div>
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="outcome-note">Napomena (opciono)</FieldLabel>
        <Textarea
          id="outcome-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Šta je rečeno, šta je tražio, zašto ne…"
          className="min-h-16 text-xs"
        />
      </div>
    </ActionDialog>
  );
}

// ── Dodela ──────────────────────────────────────────────────────────────────

export type AssignDialogProps = LeadDialogBase & {
  currentOwnerUserId?: Id<"users">;
};

/**
 * Dodela drugom članu tima. Spisak članova ne postoji kao upit, pa se prima
 * ID — „dodeli meni” je posebno dugme jer ne traži ništa.
 */
export function AssignDialog({
  workspaceId,
  companyId,
  companyName,
  open,
  onOpenChange,
  currentOwnerUserId,
}: AssignDialogProps) {
  const { user } = useWorkspace();
  const assignLead = useMutation(api.leadCrmStore.assignLead);
  const [userId, setUserId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const assign = async (target: string) => {
    setError(null);
    const clean = target.trim();
    if (!clean) {
      setError("Unesi ID člana tima ili preuzmi lead.");
      return;
    }
    setBusy(true);
    try {
      await assignLead({
        workspaceId,
        companyId,
        ownerUserId: clean as Id<"users">,
        note: note.trim() || undefined,
      });
      onOpenChange(false);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const isMine = user?.id !== undefined && user.id === currentOwnerUserId;

  return (
    <ActionDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Dodela vlasnika"
      description={`Ko vodi „${companyName}”. Promena ostaje u istoriji sa napomenom.`}
      error={error}
      footer={
        <>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Odustani
          </Button>
          <Button
            size="sm"
            disabled={busy || !userId.trim()}
            onClick={() => assign(userId)}
          >
            {busy ? "Dodeljivanje…" : "Dodeli"}
          </Button>
        </>
      }
    >
      {user?.id && !isMine && (
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => assign(user.id)}
          className="w-full justify-center gap-2 text-xs font-semibold"
        >
          <UserCheck className="size-4 text-accent-400" />
          Preuzmi lead (dodeli meni)
        </Button>
      )}
      {isMine && (
        <FeedbackLine tone="success">Lead je već dodeljen tebi.</FeedbackLine>
      )}
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="assign-user">ID člana tima</FieldLabel>
        <Input
          id="assign-user"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder="Nalepi ID korisnika…"
          className="font-mono text-xs"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="assign-note">Napomena uz dodelu</FieldLabel>
        <Textarea
          id="assign-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Zašto se lead predaje…"
          className="min-h-14 text-xs"
        />
      </div>
    </ActionDialog>
  );
}

// ── Dodir ───────────────────────────────────────────────────────────────────

export const TOUCH_CHANNELS = [
  { id: "poziv", label: "Poziv" },
  { id: "email", label: "E-mail" },
  { id: "instagram_dm", label: "Instagram DM" },
  { id: "sastanak", label: "Sastanak" },
  { id: "sms", label: "SMS" },
  { id: "ostalo", label: "Ostalo" },
] as const;

export type TouchDialogProps = LeadDialogBase & {
  defaultChannel?: (typeof TOUCH_CHANNELS)[number]["id"];
};

export function TouchDialog({
  workspaceId,
  companyId,
  companyName,
  open,
  onOpenChange,
  defaultChannel = "poziv",
}: TouchDialogProps) {
  const logTouch = useMutation(api.leadCrmStore.logTouch);
  const [channel, setChannel] = useState<string>(defaultChannel);
  const [timeMode, setTimeMode] = useState<"now" | "custom">("now");
  const [when, setWhen] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    let touchedAt: number | undefined;
    if (timeMode === "custom") {
      const ts = fromDateTimeLocal(when);
      if (ts === null) {
        setError("Unesi vreme dodira ili izaberi „sada”.");
        return;
      }
      touchedAt = ts;
    }
    setBusy(true);
    try {
      await logTouch({
        workspaceId,
        companyId,
        channel,
        note: note.trim() || undefined,
        touchedAt,
      });
      onOpenChange(false);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ActionDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Zabeleži dodir"
      description={`Ostvaren kontakt sa „${companyName}” — kanal, vreme i šta je rečeno.`}
      error={error}
      footer={
        <>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Odustani
          </Button>
          <Button size="sm" disabled={busy} onClick={save}>
            {busy ? "Čuvanje…" : "Zabeleži dodir"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1.5">
        <FieldLabel>Kanal</FieldLabel>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Kanal dodira">
          {TOUCH_CHANNELS.map((ch) => {
            const selected = channel === ch.id;
            return (
              <button
                key={ch.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setChannel(ch.id)}
                className={cn(
                  "rounded-lg border px-2.5 py-1.5 text-center text-xs font-medium transition-colors",
                  selected
                    ? "border-accent-400 bg-accent-400/10 font-semibold text-accent-400"
                    : "border-line bg-surface-raised text-text-muted hover:text-foreground",
                )}
              >
                {ch.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldLabel>Vreme</FieldLabel>
        <div className="flex items-center gap-2">
          {(
            [
              { id: "now", label: "Sada" },
              { id: "custom", label: "Uneću tačno vreme" },
            ] as const
          ).map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={timeMode === m.id}
              onClick={() => setTimeMode(m.id)}
              className={cn(
                "rounded-lg border px-3 py-1 text-xs transition-colors",
                timeMode === m.id
                  ? "border-accent-400 bg-accent-400/10 font-semibold text-accent-400"
                  : "border-line text-text-muted hover:text-foreground",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
        {timeMode === "custom" && (
          <Input
            type="datetime-local"
            aria-label="Vreme dodira"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            className="mt-1 text-xs"
          />
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="touch-note">Beleška</FieldLabel>
        <Textarea
          id="touch-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Šta je rečeno, ko se javio, šta je sledeće…"
          className="min-h-16 text-xs"
        />
      </div>
    </ActionDialog>
  );
}
