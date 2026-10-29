"use client";

// Preneto iz Devotion apps/web/components/me/quick-add/quick-add-dialog.tsx (main @ c05c40f), SPAJANJE S16.
import { useId, useRef, useState, type ComponentPropsWithoutRef, type KeyboardEvent, type MouseEvent, type ReactNode, type Ref } from "react";
import { CalendarDays, CornerDownLeft, LoaderCircle } from "lucide-react";
import { cleanNoteText, NOTE_TEXT_MAX } from "@/lib/prostor/notes";
import {
  cleanQuickAddTitle,
  defaultAddToMyDay,
  matchDueShortcut,
  NO_AREA_REASON,
  QUICK_ADD_KINDS,
  QUICK_ADD_TITLE_MAX,
  resolveArea,
  resolveDestination,
  type QuickAddDestination,
  type QuickAddDraft,
  type QuickAddKind,
  type QuickAddNoteDraft,
  type QuickAddStartup,
  type StoredDestination,
} from "@/lib/prostor/quick-add";
import {
  DUE_SHORTCUT_LABELS,
  DUE_SHORTCUTS,
  dueShortcutValue,
  formatDateShort,
  type DueShortcut,
} from "@/lib/prostor/dates";

import { Dialog, DialogDescription, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/app/prostor/zajednicko/birac-datuma";
import { usePrecica } from "@/components/app/use-precica";
import { accessErrorMessage } from "@/lib/prostor/web/greske";
import { cn } from "@/lib/utils";

import { StartupChip } from "@/components/app/prostor/zajednicko/projekat-cip";

export type QuickAddStartupOption = QuickAddStartup & { logoUrl: string | null; boja?: string | null };

export type QuickAddDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  now: number;
  workspaces: ReadonlyArray<QuickAddStartupOption>;
  /** Projekat (i oblast) iz koga je brzi unos otvoren — pobeđuje zapamćen izbor. */
  preset?: { workspaceId: string; areaId?: string | null } | null;
  /** Zapamćeno odredište (čita se jednom, pri otvaranju) i oblast po projektu. */
  readStored?: () => StoredDestination | null;
  rememberedArea?: (workspaceId: string) => string | null;
  /** Napravi zadatak; greška (poruka servera) se prikazuje ispod polja. */
  onSubmit: (draft: QuickAddDraft) => Promise<void>;
  /** Napravi belešku (PROSTOR P7, K18); greška se prikazuje ispod polja. */
  onSubmitNote: (draft: QuickAddNoteDraft) => Promise<void>;
  /** Početna vrsta: iz Beleški se otvara kao Beleška, inače Zadatak. */
  initialKind?: QuickAddKind;
  /** Razvojni prikaz: početni nacrt i greška. */
  initialDraft?: Partial<QuickAddDraft>;
  initialError?: string | null;
};

/**
 * Brzi unos (P8, plan K07 §2): vrsta Zadatak ili Beleška; zadatak ima naslov,
 * odredište Lično ili projekat + oblast, čipove roka i „Dodaj i u Moj dan",
 * beleška samo tekst i odredište. Enter dodaje i zatvara, Ctrl/⌘ + Enter
 * dodaje i ostavlja otvoreno, Esc zatvara (u belešci je Shift + Enter nov
 * red). Dijalog stoji pri vrhu (kao paleta), ulaz je CSS prelaz Base UI
 * dijaloga (D17). Sadržaj se montira pri svakom otvaranju, pa kreće od
 * zapamćenog odredišta.
 */
export function QuickAddDialog({ open, onOpenChange, ...props }: QuickAddDialogProps) {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const ostani = usePrecica("Enter");
  // Svako otvaranje je nov nacrt (nov `key`), a tokom izlaza sadržaj ostaje.
  const [otvaranje, setOtvaranje] = useState(0);
  const [bioOtvoren, setBioOtvoren] = useState(open);
  if (open !== bioOtvoren) {
    setBioOtvoren(open);
    if (open) setOtvaranje((n) => n + 1);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup
        initialFocus={inputRef}
        className="top-[min(12vh,6rem)] translate-y-0 gap-0 p-0 sm:max-w-[36rem]"
      >
        <DialogTitle className="sr-only">Brzi unos</DialogTitle>
        <DialogDescription className="sr-only">
          {`Enter dodaje, ${ostani} dodaje i ostaje, Esc zatvara.`}
        </DialogDescription>
        <QuickAddForm key={otvaranje} {...props} inputRef={inputRef} onClose={() => onOpenChange(false)} />
      </DialogPopup>
    </Dialog>
  );
}

/** Izbor u čipu: neutralno istaknut (boja radnje nije stanje izbora). */
const chipClass = (selected: boolean) =>
  cn(
    "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-ui transition-colors duration-(--duration-fast) ease-(--ease-ui) outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11",
    selected
      ? "border-line-strong bg-surface-control-hover text-foreground"
      : "border-line bg-surface text-text-secondary hover:bg-surface-control hover:text-foreground",
  );

function QuickAddForm({
  now,
  workspaces,
  preset,
  readStored,
  rememberedArea,
  onSubmit,
  onSubmitNote,
  initialKind = "task",
  initialDraft,
  initialError = null,
  inputRef,
  onClose,
}: Omit<QuickAddDialogProps, "open" | "onOpenChange"> & {
  inputRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<QuickAddKind>(initialKind);
  // Isto polje za naslov zadatka i tekst beleške: ukucano ostaje pri promeni vrste.
  const [title, setTitle] = useState(initialDraft?.title ?? "");
  const [destination, setDestination] = useState<QuickAddDestination>(
    () => initialDraft?.destination ?? resolveDestination(readStored?.() ?? null, workspaces, { preset, rememberedArea }),
  );
  // Izbor čipa, ne samo datum: petkom/subotom/nedeljom dve prečice mogu biti isti dan.
  // `"date"` = dan iz birača (K11, „Datum…").
  const initialDue = initialDraft?.dueDate ?? null;
  const [dueChoice, setDueChoice] = useState<DueShortcut | "date" | null>(() => {
    const shortcut = matchDueShortcut(initialDue, now);
    return shortcut ?? (initialDue === null ? null : "date");
  });
  const [customDue, setCustomDue] = useState<number | null>(() =>
    initialDue !== null && matchDueShortcut(initialDue, now) === null ? initialDue : null,
  );
  const dueDate =
    dueChoice === null ? null : dueChoice === "date" ? customDue : dueShortcutValue(dueChoice, now);
  // Kvačica prati rok dok je korisnik sam ne promeni.
  const [addOverride, setAddOverride] = useState<boolean | null>(initialDraft?.addToMyDay ?? null);
  const [error, setError] = useState<string | null>(initialError);
  const [busy, setBusy] = useState(false);
  const errorId = useId();
  const ostani = usePrecica("Enter");
  const isNote = kind === "note";
  const titleCheck = isNote ? cleanNoteText(title) : cleanQuickAddTitle(title);
  const addToMyDay = addOverride ?? defaultAddToMyDay(dueDate, now);
  const selectedStartup =
    destination.kind === "startup" ? workspaces.find((workspace) => workspace._id === destination.workspaceId) : undefined;
  const missingArea = !isNote && destination.kind === "startup" && destination.areaId === null;
  const canSubmit = titleCheck.ok && !missingArea && !busy;
  const shownError = error ?? (titleCheck.ok ? null : titleCheck.reason);

  const submit = async (stay: boolean) => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      if (isNote) await onSubmitNote({ destination, text: title });
      else await onSubmit({ title, destination, dueDate, addToMyDay });
      setTitle("");
      if (stay) inputRef.current?.focus();
      else onClose();
    } catch (cause) {
      setError(
        accessErrorMessage(cause, isNote ? "Beleška nije sačuvana. Pokušaj ponovo." : "Zadatak nije dodat. Pokušaj ponovo."),
      );
      inputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    // U belešci je Shift+Enter nov red.
    if (isNote && event.shiftKey) return;
    event.preventDefault();
    void submit(event.ctrlKey || event.metaKey);
  };

  const pickStartup = (workspaceId: string | null) => {
    setError(null);
    if (workspaceId === null) {
      setDestination({ kind: "personal" });
      return;
    }
    const workspace = workspaces.find((item) => item._id === workspaceId);
    if (!workspace) return;
    setDestination({
      kind: "startup",
      workspaceId,
      areaId: resolveArea(workspace, rememberedArea?.(workspaceId) ?? null),
    });
  };

  const fieldClass =
    "w-full rounded-lg border border-line-control bg-surface px-3 text-copy text-foreground outline-none transition-colors placeholder:text-text-muted focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className="flex flex-col">
      <div className="px-5 pb-3 pt-4">
        <ChipGroup label="Vrsta unosa" hideLabel>
          {QUICK_ADD_KINDS.map((option) => (
            <Chip
              key={option.kind}
              selected={kind === option.kind}
              onSelect={(event) => {
                setKind(option.kind);
                setError(null);
                // Prelazak na Zadatak: prelomi redova iz beleške postaju razmaci.
                if (option.kind === "task") setTitle((current) => current.replace(/\s*\r?\n\s*/gu, " "));
                // Polje se zamenjuje (jedan red ↔ više redova): fokus ide u njega samo posle
                // klika; strelicama u grupi fokus ostaje na čipu vrste.
                if (event.detail > 0) window.requestAnimationFrame(() => inputRef.current?.focus());
              }}
            >
              {option.label}
            </Chip>
          ))}
        </ChipGroup>
        {isNote ? (
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement | null>}
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              setError(null);
            }}
            onKeyDown={onKeyDown}
            maxLength={NOTE_TEXT_MAX + 1}
            rows={3}
            placeholder="Šta ti je na umu?"
            aria-label="Tekst beleške"
            aria-invalid={shownError ? true : undefined}
            aria-describedby={shownError ? errorId : undefined}
            className={cn(fieldClass, "mt-3 resize-none py-2.5 leading-6")}
          />
        ) : (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement | null>}
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              setError(null);
            }}
            onKeyDown={onKeyDown}
            maxLength={QUICK_ADD_TITLE_MAX + 1}
            placeholder="Šta treba uraditi?"
            aria-label="Naslov zadatka"
            aria-invalid={shownError ? true : undefined}
            aria-describedby={shownError ? errorId : undefined}
            className={cn(fieldClass, "mt-3 h-11")}
          />
        )}
        {shownError ? (
          <p id={errorId} role="alert" className="mt-1.5 text-ui text-danger">
            {shownError}
          </p>
        ) : null}
      </div>

      <div className="space-y-3 px-5 pb-4">
        <ChipGroup label="Gde">
          <Chip selected={destination.kind === "personal"} onSelect={() => pickStartup(null)}>
            <StartupChip workspace={null} size="xs" />
            Lično
          </Chip>
          {workspaces.map((workspace) => (
            <Chip
              key={workspace._id}
              selected={destination.kind === "startup" && destination.workspaceId === workspace._id}
              onSelect={() => pickStartup(workspace._id)}
            >
              <StartupChip workspace={workspace} size="xs" />
              <span className="max-w-[9rem] truncate">{workspace.name}</span>
            </Chip>
          ))}
        </ChipGroup>

        {selectedStartup && !isNote ? (
          selectedStartup.areas.length > 0 ? (
            <ChipGroup label="Oblast">
              {selectedStartup.areas.map((area) => (
                <Chip
                  key={area._id}
                  selected={destination.kind === "startup" && destination.areaId === area._id}
                  onSelect={() =>
                    setDestination({ kind: "startup", workspaceId: selectedStartup._id, areaId: area._id })
                  }
                >
                  {area.label}
                </Chip>
              ))}
            </ChipGroup>
          ) : (
            <p role="status" className="rounded-lg bg-surface px-3 py-2 text-ui text-text-secondary">
              {NO_AREA_REASON}
            </p>
          )
        ) : null}

        {isNote ? null : (
          <>
            <ChipGroup label="Rok">
              {DUE_SHORTCUTS.map((shortcut) => {
                const value = dueShortcutValue(shortcut, now);
                return (
                  <Chip
                    key={shortcut}
                    selected={dueChoice === shortcut}
                    onSelect={() => setDueChoice(shortcut)}
                    title={formatDateShort(value)}
                  >
                    {DUE_SHORTCUT_LABELS[shortcut]}
                  </Chip>
                );
              })}
              <DatePicker
                value={dueChoice === "date" ? customDue : dueDate}
                now={now}
                allowClear={false}
                onChange={(value) => {
                  if (value === null) return;
                  const shortcut = matchDueShortcut(value, now);
                  setDueChoice(shortcut ?? "date");
                  setCustomDue(shortcut === null ? value : null);
                }}
              >
                <DateChip
                  selected={dueChoice === "date"}
                  label={dueChoice === "date" && customDue !== null ? formatDateShort(customDue) : "Datum…"}
                />
              </DatePicker>
              <Chip selected={dueChoice === null} onSelect={() => setDueChoice(null)}>
                Bez roka
              </Chip>
            </ChipGroup>

            <label className="flex min-h-9 w-fit cursor-pointer items-center gap-2 text-ui text-text-secondary pointer-coarse:min-h-11">
              <Checkbox checked={addToMyDay} onCheckedChange={(checked) => setAddOverride(checked)} />
              Dodaj i u Moj dan
            </label>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
        <p className="hidden items-center gap-1.5 text-meta text-text-muted sm:flex">
          {isNote ? (
            <>
              <Kbd>Enter</Kbd> čuva · <Kbd>Shift Enter</Kbd> nov red · <Kbd>{ostani}</Kbd> čuva i ostaje ·{" "}
              <Kbd>Esc</Kbd> zatvara
            </>
          ) : (
            <>
              <Kbd>Enter</Kbd> dodaje · <Kbd>{ostani}</Kbd> dodaje i ostaje · <Kbd>Esc</Kbd> zatvara
            </>
          )}
        </p>
        <Button variant="primary" type="button" disabled={!canSubmit} onClick={() => void submit(false)} className="ml-auto">
          {busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <CornerDownLeft aria-hidden="true" />}
          {isNote ? "Sačuvaj" : "Dodaj"}
        </Button>
      </div>
    </div>
  );
}

/** Grupa čipova kao `radiogroup`: strelice biraju, jedno Tab mesto. */
function ChipGroup({
  label,
  hideLabel = false,
  children,
}: {
  label: string;
  /** Labela samo za čitač ekrana (grupa bez kolone sa nazivom). */
  hideLabel?: boolean;
  children: ReactNode;
}) {
  const labelId = useId();
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"];
    if (!keys.includes(event.key)) return;
    const radios = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
    const index = radios.findIndex((radio) => radio === document.activeElement);
    if (index === -1) return;
    event.preventDefault();
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? radios.length - 1
          : (index + (event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1) + radios.length) % radios.length;
    radios[next].focus();
    // „Datum…" se strelicama samo fokusira (Enter/Space otvara birač).
    if (radios[next].dataset.noAutoselect !== "true") radios[next].click();
  };
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-3">
      <span id={labelId} className={hideLabel ? "sr-only" : "w-14 shrink-0 pt-2 text-meta font-medium text-text-muted"}>
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={labelId} onKeyDown={onKeyDown} className="flex min-w-0 flex-wrap gap-1.5">
        {children}
      </div>
    </div>
  );
}

/**
 * „Datum…" (P8): radio čip koji otvara birač datuma; posle izbora nosi dan
 * („sre 28. okt"). Ide u `render` okidača popovera, pa prosleđuje ref i
 * atribute okidača.
 */
function DateChip({
  selected,
  label,
  ref,
  ...props
}: { selected: boolean; label: string; ref?: Ref<HTMLButtonElement> } & ComponentPropsWithoutRef<"button">) {
  return (
    <button
      ref={ref}
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={selected ? `Rok: ${label}` : "Izaberi datum"}
      data-no-autoselect="true"
      tabIndex={selected ? 0 : -1}
      {...props}
      // Radio ne nosi popup atribute (axe `aria-allowed-attr`); birač je dijalog sa svojim imenom.
      aria-haspopup={undefined}
      aria-expanded={undefined}
      aria-controls={undefined}
      className={chipClass(selected)}
    >
      <CalendarDays className="size-3.5" aria-hidden="true" />
      {label}
    </button>
  );
}

function Chip({
  selected,
  onSelect,
  title,
  children,
}: {
  selected: boolean;
  onSelect: (event: MouseEvent<HTMLButtonElement>) => void;
  title?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      tabIndex={selected ? 0 : -1}
      title={title}
      onClick={onSelect}
      className={chipClass(selected)}
    >
      {children}
    </button>
  );
}
