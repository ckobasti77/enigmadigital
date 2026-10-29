"use client";

// Preneto iz Devotion apps/web/components/workspace/ideas/idea-dialogs.tsx (main @ c05c40f), SPAJANJE S13.
import { useId, useRef, useState } from "react";
import { CheckSquare2, FileText } from "lucide-react";

import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { IDEA_TEXT_MAX, IDEA_TITLE_MAX, ideaDraftError } from "@/lib/prostor/modeli/ideas-model";

/**
 * Nova ideja (ili nova grana sa Mape). Ideja odmah ide u fazu „Predlog";
 * boja se ne bira (boja je samo oznaka na Mapi, PROSTOR P17). Zatvaranje sa
 * otkucanim tekstom pita da li se nacrt odbacuje.
 */
export function IdeaCreateDialog({
  open,
  onOpenChange,
  parentTitle,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Nova grana: naslov ideje-roditelja. */
  parentTitle: string | null;
  onCreate: (draft: { title: string; text: string }) => Promise<boolean>;
}) {
  const formId = useId();
  const titleId = useId();
  const textId = useId();
  const titleRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const dirty = title.trim().length > 0 || text.trim().length > 0;
  const error = ideaDraftError({ title, text });

  function reset() {
    setTitle("");
    setText("");
  }

  function close() {
    reset();
    onOpenChange(false);
  }

  function requestClose() {
    if (pending) return;
    if (dirty) {
      setConfirmDiscard(true);
      return;
    }
    close();
  }

  async function submit() {
    if (error !== null || pending) return;
    setPending(true);
    try {
      if (await onCreate({ title: title.trim(), text: text.trim() })) close();
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : requestClose())}>
        <DialogPopup initialFocus={titleRef} className="sm:max-w-[32rem]">
          <DialogHeader>
            <DialogTitle>{parentTitle ? "Nova grana ideje" : "Nova ideja"}</DialogTitle>
            {parentTitle ? <DialogDescription>{`Ispod „${parentTitle}”.`}</DialogDescription> : null}
          </DialogHeader>
          <form
            id={formId}
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <div className="space-y-1.5">
              <label htmlFor={titleId} className="text-ui font-medium">
                Naslov
              </label>
              <Input
                ref={titleRef}
                id={titleId}
                value={title}
                maxLength={IDEA_TITLE_MAX}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor={textId} className="text-ui font-medium">
                Šta predlažeš i zašto?
              </label>
              <Textarea
                id={textId}
                value={text}
                maxLength={IDEA_TEXT_MAX}
                className="min-h-28"
                onChange={(event) => setText(event.target.value)}
              />
            </div>
          </form>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={requestClose} disabled={pending}>
              Otkaži
            </Button>
            <Button variant="primary" type="submit" form={formId} disabled={error !== null || pending}>
              {pending ? "Čuvam…" : "Dodaj ideju"}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Odbaciti nesačuvanu ideju?"
        description="Otkucani naslov i tekst se ne čuvaju."
        confirmLabel="Odbaci"
        busyLabel="Odbacujem…"
        onConfirm={() => {
          setConfirmDiscard(false);
          close();
        }}
      />
    </>
  );
}

/**
 * „Pretvori u zadatak ili belešku" (PROSTOR P6): samo u fazi „Odobreno" i
 * samo autor ili vlasnik projekta — server proverava isto.
 */
export function IdeaConvertDialog({
  open,
  onOpenChange,
  ideaTitle,
  areas,
  onConvert,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ideaTitle: string;
  areas: ReadonlyArray<{ _id: string; label: string }>;
  onConvert: (input: { kind: "task" | "note"; areaId: string }) => Promise<boolean>;
}) {
  const [kind, setKind] = useState<"task" | "note">("task");
  const [areaId, setAreaId] = useState<string>(areas[0]?._id ?? "");
  const [pending, setPending] = useState(false);
  const area = areas.some((item) => item._id === areaId) ? areaId : (areas[0]?._id ?? "");

  async function submit() {
    if (!area || pending) return;
    setPending(true);
    try {
      if (await onConvert({ kind, areaId: area })) onOpenChange(false);
    } finally {
      setPending(false);
    }
  }

  const options = [
    { value: "task" as const, label: "Zadatak", icon: CheckSquare2 },
    { value: "note" as const, label: "Beleška", icon: FileText },
  ];

  return (
    <Dialog open={open} onOpenChange={(next) => (!pending ? onOpenChange(next) : undefined)}>
      <DialogPopup className="sm:max-w-[28rem]">
        <DialogHeader>
          <DialogTitle>Pretvori u zadatak ili belešku</DialogTitle>
          <DialogDescription>{`„${ideaTitle}” postaje stranica u izabranoj oblasti.`}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div role="radiogroup" aria-label="Vrsta" className="grid grid-cols-2 gap-2">
            {options.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={kind === value}
                onClick={() => setKind(value)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                    event.preventDefault();
                    setKind(value === "task" ? "note" : "task");
                    event.currentTarget.parentElement?.querySelector<HTMLElement>(`[aria-checked="false"]`)?.focus();
                  }
                }}
                tabIndex={kind === value ? 0 : -1}
                className={cn(
                  "flex h-10 items-center gap-2 rounded-md border border-line-control px-3 text-ui text-text-secondary outline-none transition-colors hover:bg-surface-control-hover focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11",
                  // Izbor je neutralan (boja radnje nije stanje izbora).
                  kind === value && "border-foreground bg-surface-control text-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden="true" /> {label}
              </button>
            ))}
          </div>
          <Select
            label="Oblast"
            showLabel
            value={area || null}
            onValueChange={setAreaId}
            options={areas.map((item) => ({ value: item._id, label: item.label }))}
            placeholder="Izaberi oblast"
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Otkaži
          </Button>
          <Button variant="primary" type="button" onClick={() => void submit()} disabled={!area || pending}>
            {pending ? "Pretvaram…" : "Pretvori"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

/** „Ugnezdi u…" sa Mape ideja (modul mapa): bira se ideja-roditelj (bez same ideje). */
export function IdeaNestDialog({
  open,
  onOpenChange,
  ideaTitle,
  candidates,
  onNest,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ideaTitle: string;
  candidates: ReadonlyArray<{ _id: string; title: string }>;
  onNest: (parentId: string) => Promise<boolean>;
}) {
  const [parentId, setParentId] = useState("");
  const [pending, setPending] = useState(false);
  // Izbor iz prethodnog otvaranja (druga ideja) ne važi ako više nije kandidat.
  const parent = candidates.some((item) => item._id === parentId) ? parentId : "";

  async function submit() {
    if (!parent || pending) return;
    setPending(true);
    try {
      if (await onNest(parent)) {
        setParentId("");
        onOpenChange(false);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (!pending ? onOpenChange(next) : undefined)}>
      <DialogPopup className="sm:max-w-[28rem]">
        <DialogHeader>
          <DialogTitle>Ugnezdi u…</DialogTitle>
          <DialogDescription>{`„${ideaTitle}” prelazi ispod izabrane ideje.`}</DialogDescription>
        </DialogHeader>
        <Select
          label="Nadređena ideja"
          showLabel
          value={parent || null}
          onValueChange={setParentId}
          options={candidates.map((item) => ({ value: item._id, label: item.title }))}
          placeholder="Izaberi ideju"
        />
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Otkaži
          </Button>
          <Button variant="primary" type="button" onClick={() => void submit()} disabled={!parent || pending}>
            Ugnezdi
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
