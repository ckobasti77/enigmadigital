"use client";

// Preneto iz Devotion apps/web/components/collab/conflict-dialog.tsx (main @ c05c40f), SPAJANJE S11.
import { useRef } from "react";
import { Copy, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";

import { conflictCopy, type ConflictSubject } from "@/lib/prostor/modeli/collab-model";

export type ConflictDialogProps = {
  open: boolean;
  /** Esc / klik van: zatvori bez radnje (stanje konflikta ostaje). */
  onOpenChange: (open: boolean) => void;
  subject?: ConflictSubject;
  updaterName: string | null;
  updatedAt: number | null;
  now: number;
  /** „Kopiraj moju verziju" (pre „Učitaj najnoviju"); bez nje dugme se ne prikazuje. */
  onCopy?: () => void;
  onLoadLatest: () => void;
  onOverwrite: () => void;
  busy?: boolean;
};

/**
 * Konflikt revizije (PROSTOR P23, K07 §6.5): neko je sačuvao posle tebe.
 * „Učitaj najnoviju" odbacuje tvoj nacrt (fokus je na njoj — bezbedniji izbor),
 * „Prepiši" ponavlja isti upis preko tuđe verzije, koja ostaje u Istoriji izmena.
 */
export function ConflictDialog({
  open,
  onOpenChange,
  subject = "page",
  updaterName,
  updatedAt,
  now,
  onCopy,
  onLoadLatest,
  onOverwrite,
  busy = false,
}: ConflictDialogProps) {
  const loadRef = useRef<HTMLButtonElement>(null);
  const copyRef = useRef<HTMLButtonElement>(null);
  const copy = conflictCopy({ subject, updaterName, updatedAt, now });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup
        className="sm:max-w-[30rem]"
        // Dijalog se otvara sam usred kucanja: fokus na bezopasnu radnju (kopija),
        // da Space/Enter ne odbaci nacrt. Bez kopije — „Učitaj najnoviju".
        initialFocus={() => copyRef.current ?? loadRef.current}
      >
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.body}</DialogDescription>
        </DialogHeader>
        <p className="text-ui leading-6 text-text-secondary">
          Ako prepišeš, verzija tima ostaje u Istoriji izmena.
        </p>
        <DialogFooter>
          {onCopy ? (
            <Button ref={copyRef} type="button" variant="ghost" className="sm:mr-auto" onClick={onCopy}>
              <Copy aria-hidden="true" />
              Kopiraj moju verziju
            </Button>
          ) : null}
          <Button ref={loadRef} type="button" variant="outline" disabled={busy} onClick={onLoadLatest}>
            Učitaj najnoviju
          </Button>
          <Button variant="primary" type="button" disabled={busy} onClick={onOverwrite}>
            {busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
            Prepiši
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
