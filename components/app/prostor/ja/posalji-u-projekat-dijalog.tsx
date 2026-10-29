"use client";

// Preneto iz Devotion apps/web/components/me/notes/send-to-startup-dialog.tsx (main @ c05c40f), SPAJANJE S16.
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { LoaderCircle, Send } from "lucide-react";
import {
  defaultSendTarget,
  NOTE_SEND_HINT,
  NOTE_SEND_NO_STARTUP,
  NOTE_SEND_TITLE,
  noteDisplayTitle,
} from "@/lib/prostor";

import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { accessErrorMessage } from "@/lib/prostor/web/greske";
import { cn } from "@/lib/utils";

import { StartupChip } from "@/components/app/prostor/zajednicko/projekat-cip";
import type { NoteStartup } from "@/components/app/prostor/ja/note-row";

export type SendToStartupDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Beleška koja se šalje; `null` dok je dijalog zatvoren. */
  note: { _id?: string; title: string | null; text: string; workspaceId: string | null } | null;
  /** Projekti u kojima sam aktivan član. */
  workspaces: ReadonlyArray<NoteStartup>;
  /** Pravi ideju u izabranom projektu; greška (poruka) se prikazuje u dijalogu. */
  onSend: (workspaceId: string) => Promise<void>;
  /** Razvojni prikaz: početna greška. */
  initialError?: string | null;
};

/**
 * „Pošalji u projekat" (P7, K07 §5.10): izbor projekta (samo aktivna
 * članstva) pa „Pošalji kao ideju". Server pravi ideju u fazi Predlog; beleška
 * ostaje privatna. Sadržaj je zaseban (`key` po belešci) da svako otvaranje
 * počne od podrazumevanog cilja. Primarna je samo potvrda.
 */
export function SendToStartupDialog({ open, onOpenChange, note, ...props }: SendToStartupDialogProps) {
  // Beleška ostaje i tokom izlaza (dijalog izlazi sa sadržajem).
  const [shown, setShown] = useState(note);
  if (note !== null && note !== shown) setShown(note);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="sm:max-w-[28rem]">
        <DialogHeader>
          <DialogTitle>{NOTE_SEND_TITLE}</DialogTitle>
          <DialogDescription>{NOTE_SEND_HINT}</DialogDescription>
        </DialogHeader>
        {shown ? (
          <SendForm key={shown._id ?? noteDisplayTitle(shown)} {...props} note={shown} onClose={() => onOpenChange(false)} />
        ) : null}
      </DialogPopup>
    </Dialog>
  );
}

function SendForm({
  note,
  workspaces,
  onSend,
  onClose,
  initialError = null,
}: Omit<SendToStartupDialogProps, "open" | "onOpenChange" | "note"> & {
  note: NonNullable<SendToStartupDialogProps["note"]>;
  onClose: () => void;
}) {
  const workspaceIds = workspaces.map((workspace) => workspace._id);
  const [target, setTarget] = useState<string | null>(() => defaultSendTarget(note, workspaceIds));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const labelId = useId();
  const errorId = useId();
  const radioRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const submit = async () => {
    if (target === null || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSend(target);
      onClose();
    } catch (cause) {
      setError(accessErrorMessage(cause, "Beleška nije poslata. Pokušaj ponovo."));
    } finally {
      setBusy(false);
    }
  };

  // Radio grupa (WAI-ARIA): jedno Tab mesto, strelice biraju.
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = workspaces.findIndex((item) => item._id === target);
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (step === 0) return;
    event.preventDefault();
    const nextIndex = (index + step + workspaces.length) % workspaces.length;
    setTarget(workspaces[nextIndex]._id);
    radioRefs.current[nextIndex]?.focus();
  };

  return (
    <div className="space-y-4">
      <p className="truncate rounded-lg bg-surface px-3 py-2 text-ui font-medium text-foreground" title={noteDisplayTitle(note)}>
        {noteDisplayTitle(note)}
      </p>
      {workspaces.length === 0 ? (
        <p role="status" className="rounded-lg bg-surface px-3 py-2 text-ui text-text-secondary">
          {NOTE_SEND_NO_STARTUP}
        </p>
      ) : (
        <div className="space-y-1.5">
          <p id={labelId} className="text-ui font-medium text-foreground">
            Projekat
          </p>
          <div role="radiogroup" aria-labelledby={labelId} className="flex flex-wrap gap-1.5">
            {workspaces.map((workspace, index) => {
              const selected = target === workspace._id;
              return (
                <button
                  key={workspace._id}
                  ref={(element) => {
                    radioRefs.current[index] = element;
                  }}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  tabIndex={selected || (target === null && index === 0) ? 0 : -1}
                  onClick={() => {
                    setTarget(workspace._id);
                    setError(null);
                  }}
                  onKeyDown={onKeyDown}
                  className={cn(
                    "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-ui transition-colors duration-(--duration-fast) ease-(--ease-ui) outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11",
                    selected
                      ? "border-line-strong bg-surface-control-hover text-foreground"
                      : "border-line bg-surface text-text-secondary hover:bg-surface-control hover:text-foreground",
                  )}
                >
                  <StartupChip workspace={workspace} size="xs" />
                  <span className="max-w-[10rem] truncate">{workspace.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {error ? (
        <p id={errorId} role="alert" className="text-ui text-danger">
          {error}
        </p>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
          Otkaži
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={() => void submit()}
          disabled={target === null || busy}
          aria-describedby={error ? errorId : undefined}
        >
          {busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Send aria-hidden="true" />}
          Pošalji kao ideju
        </Button>
      </DialogFooter>
    </div>
  );
}
