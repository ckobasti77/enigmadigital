"use client";


// Preneto iz Devotion apps/web/components/workspace/thoughts/thought-editor-dialog.tsx (main @ c05c40f), SPAJANJE S14.
import { useState } from "react";
import { Link2, LoaderCircle, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogPopup,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ItemSizePicker,
  workspaceItemDialogContentClass,
  type ItemSizePreset,
} from "@/components/app/prostor/mape/workspace-item-dialog";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { BOJA_MAPE_NAZIV, BOJA_MAPE_SLOT, BOJE_MAPE } from "@/lib/prostor/web/boja-mape";
import { cn } from "@/lib/utils";

import type { ThoughtEditorValue, ThoughtNodeColor } from "@/components/app/prostor/mape/thoughts/types";

/** Boja misli je kategorija (`data-cat`), iz iste palete kao ostale mape. */
const COLOR_OPTIONS: Array<{ value: ThoughtNodeColor; label: string }> = BOJE_MAPE.map(
  (value) => ({ value, label: BOJA_MAPE_NAZIV[value] }),
);

export function ThoughtEditorDialog({
  open,
  mode,
  initialValue,
  connected = false,
  pending,
  sizePreset,
  onSizePresetChange,
  onSizeReset,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  mode: "create" | "edit";
  initialValue?: ThoughtEditorValue;
  connected?: boolean;
  pending: boolean;
  sizePreset?: ItemSizePreset;
  onSizePresetChange?: (preset: ItemSizePreset) => void;
  onSizeReset?: () => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: ThoughtEditorValue) => void | Promise<void>;
}) {
  const [title, setTitle] = useState(initialValue?.title ?? "");
  const [text, setText] = useState(initialValue?.text ?? "");
  const [color, setColor] = useState<ThoughtNodeColor>(initialValue?.color ?? "violet");
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    await onSubmit({ title: title.trim(), text: text.trim(), color });
  }

  const dirty =
    title !== (initialValue?.title ?? "") ||
    text !== (initialValue?.text ?? "") ||
    color !== (initialValue?.color ?? "violet");

  function requestClose() {
    if (pending) return;
    if (dirty) {
      setConfirmDiscard(true);
      return;
    }
    onOpenChange(false);
  }

  return (
    <>
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) requestClose();
      }}
    >
      <DialogPopup
        className={`${workspaceItemDialogContentClass} sm:h-auto sm:max-w-xl`}
      >
        <form className="flex h-full min-h-0 flex-col" onSubmit={submit}>
          <DialogHeader className="border-b border-line-soft px-5 py-5 sm:px-6">
            <DialogTitle>
              {mode === "edit" ? "Uredi misao" : connected ? "Nova povezana misao" : "Nova misao"}
            </DialogTitle>
            <DialogDescription>
              {connected
                ? "Nova misao će odmah biti povezana sa izabranom."
                : "Naslov i tekst ostaju privatni samo tebi."}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
            <div className="space-y-2">
              <Label htmlFor="thought-title">Naslov</Label>
              <Input
                id="thought-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Kratko ime za ovu misao"
                maxLength={120}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="thought-text">Misao</Label>
              <Textarea
                id="thought-text"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Zapiši ono što ne želiš da izgubiš…"
                className="min-h-36 resize-y leading-6"
                maxLength={12_000}
                required
              />
              <p className="text-right text-meta tabular-nums text-muted-foreground">{text.length}/12.000</p>
            </div>
            {mode === "edit" && onSizePresetChange ? (
              <ItemSizePicker
                value={sizePreset}
                onChange={onSizePresetChange}
                onReset={onSizeReset}
              />
            ) : null}
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Boja</legend>
              <div className="flex flex-wrap gap-2">
                {COLOR_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className={cn(
                      "flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition-colors focus-within:ring-2 focus-within:ring-ring",
                      color === option.value
                        ? "border-line-strong bg-surface-control-hover text-foreground"
                        : "border-line bg-card text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <input
                      className="sr-only"
                      type="radio"
                      name="thought-color"
                      value={option.value}
                      checked={color === option.value}
                      onChange={() => setColor(option.value)}
                    />
                    <span
                      data-cat={BOJA_MAPE_SLOT[option.value] ?? undefined}
                      className={cn(
                        "size-2.5 rounded-full",
                        BOJA_MAPE_SLOT[option.value] === null ? "bg-text-muted" : "bg-cat",
                      )}
                      aria-hidden="true"
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          <DialogFooter className="border-t border-line-soft px-5 py-4 sm:px-6">
            <Button type="button" variant="ghost" onClick={requestClose} disabled={pending}>
              Otkaži
            </Button>
            <Button variant="primary"
              type="submit"
              disabled={
                pending ||
                title.trim().length === 0 ||
                text.trim().length === 0
              }
            >
              {pending ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
              {mode === "edit" ? "Sačuvaj" : "Dodaj misao"}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
    <ConfirmDialog
      open={confirmDiscard}
      onOpenChange={setConfirmDiscard}
      title="Odbaciti nesačuvane izmene?"
      description="Otkucani naslov i tekst misli se ne čuvaju."
      confirmLabel="Odbaci"
      busyLabel="Odbacujem…"
      onConfirm={() => {
        setConfirmDiscard(false);
        onOpenChange(false);
      }}
    />
    </>
  );
}

export function EdgeEditorDialog({
  open,
  initialLabel,
  description = "Opciono objasni kako su dve misli povezane.",
  inputId = "thought-edge-label",
  pending,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  initialLabel: string;
  description?: string;
  inputId?: string;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (label: string) => void | Promise<void>;
}) {
  const [label, setLabel] = useState(initialLabel);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-md">
        <DialogHeader>
          <DialogTitle>Naziv veze</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-5"
          onSubmit={async (event) => {
            event.preventDefault();
            await onSubmit(label.trim());
          }}
        >
          <div className="space-y-2">
            <Label htmlFor={inputId}>Naziv</Label>
            <Input
              id={inputId}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="npr. vodi ka, zavisi od…"
              maxLength={100}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>Otkaži</Button>
            <Button variant="primary" type="submit" disabled={pending}>
              {pending ? <LoaderCircle className="animate-spin" /> : <Link2 />}
              Sačuvaj vezu
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
