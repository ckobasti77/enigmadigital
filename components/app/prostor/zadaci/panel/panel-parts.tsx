"use client";

// Preneto iz Devotion apps/web/components/me/task-panel/panel-parts.tsx (main @ c05c40f), SPAJANJE S12.
import { useId, useState, type ReactNode, type Ref } from "react";
import { CalendarClock, Flag, Lock, Sun, SunDim } from "lucide-react";
import {
  describeDue,
  PRIORITY_LABELS,
  type Perm,
  type TaskPriorityKey,
} from "@/lib/prostor";

import { DatePicker } from "@/components/app/prostor/zajednicko/birac-datuma";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { MetaChip } from "@/components/app/prostor/zadaci/meta-chip";

/** Najviše znakova u naslovu (isto kao server, `cleanRequiredText(…, 200)`). */
export const PANEL_TITLE_MAX = 200;

/**
 * Naslov panela. Uređiv (svaki član dok zadatak nije zaključan / lični): `textarea` od jednog reda koja raste,
 * Enter ili blur čuva, Esc vraća staru vrednost. `data-panel-title` je cilj
 * „leteće kopije" naslova iz reda (trenutak 3).
 */
export function PanelTitle({
  value,
  editable,
  onCommit,
  titleRef,
}: {
  value: string;
  editable: boolean;
  onCommit?: (title: string) => void;
  titleRef?: Ref<HTMLElement>;
}) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  // Kad se naslov promeni spolja (drugi uređaj), a ne uređuje se — prati ga.
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    if (!editing) setDraft(value);
  }

  const className = "block w-full text-title text-foreground";
  if (!editable || !onCommit) {
    return (
      <p ref={titleRef as Ref<HTMLParagraphElement>} data-panel-title className={cn(className, "break-words")}>
        {value}
      </p>
    );
  }

  const commit = () => {
    const next = draft.trim();
    if (!next || next.length > PANEL_TITLE_MAX) {
      setDraft(value);
      return;
    }
    if (next !== value) onCommit(next);
  };

  return (
    <textarea
      ref={titleRef as Ref<HTMLTextAreaElement>}
      data-panel-title
      data-escape-local={draft !== value ? "true" : undefined}
      value={draft}
      rows={1}
      maxLength={PANEL_TITLE_MAX}
      aria-label="Naslov zadatka"
      onFocus={() => setEditing(true)}
      onChange={(event) => setDraft(event.target.value.replace(/\n/g, " "))}
      onBlur={() => {
        setEditing(false);
        commit();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.nativeEvent.isComposing) {
          // Enter čuva; fokus ostaje u polju.
          event.preventDefault();
          commit();
        } else if (event.key === "Escape") {
          // Esc vraća staru vrednost (fokus ostaje); panel se zatvara tek sledećim Esc.
          if (draft === value) return;
          event.preventDefault();
          setDraft(value);
        }
      }}
      className={cn(
        className,
        "field-sizing-content -mx-1.5 resize-none rounded-lg border border-transparent bg-transparent px-1.5 py-0.5 outline-none transition-colors hover:border-line focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 pointer-coarse:min-h-11",
      )}
    />
  );
}

/** Naslov sekcije (Koraci, Instrukcije, Beleška) sa opcionom bravom i desnom stranom (DIZAJN-SMIRENJE §2). */
export function PanelSection({
  title,
  lockedReason,
  onDenied,
  aside,
  as: Heading = "h3",
  children,
}: {
  title: string;
  /** Nivo naslova: `h3` u fioci (ispod naslova panela), `h2` na punoj strani. */
  as?: "h2" | "h3";
  lockedReason?: string | null;
  /** Dodir na bravu (na dodiru nema tooltipa): kontejner pokaže razlog. */
  onDenied?: (reason: string) => void;
  aside?: ReactNode;
  children: ReactNode;
}) {
  const headingId = useId();
  const reasonId = useId();
  return (
    <section aria-labelledby={headingId} className="space-y-2">
      <div className="flex min-h-7 items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Heading id={headingId} className="text-ui font-semibold text-foreground">
            {title}
          </Heading>
          {lockedReason ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    aria-label={`${title}: samo za čitanje`}
                    aria-describedby={reasonId}
                    onClick={() => onDenied?.(lockedReason)}
                    className="grid size-6 place-items-center rounded-md text-muted-foreground outline-none hover:bg-surface-control focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:size-11"
                  />
                }
              >
                <Lock className="size-3.5" aria-hidden="true" />
              </TooltipTrigger>
              <TooltipContent className="max-w-64">{lockedReason}</TooltipContent>
            </Tooltip>
          ) : null}
        </div>
        {aside}
      </div>
      {lockedReason ? (
        <span id={reasonId} className="sr-only">
          {lockedReason}
        </span>
      ) : null}
      {children}
    </section>
  );
}

/**
 * „Dodaj u Moj dan" / „Ukloni iz Moj dan" (plan je lični — uvek dozvoljen).
 * Uključeno stanje je stanje, ne radnja: neutralna ispuna i `aria-pressed`,
 * bez boje radnje.
 */
export function PlanToggle({ planned, onToggle }: { planned: boolean; onToggle: () => void }) {
  return (
    <Button
      type="button"
      variant={planned ? "secondary" : "outline"}
      size="lg"
      aria-pressed={planned}
      onClick={onToggle}
      className="rounded-full px-3"
    >
      {planned ? <Sun className="size-3.5" aria-hidden="true" /> : <SunDim className="size-3.5" aria-hidden="true" />}
      {planned ? "Ukloni iz Moj dan" : "Dodaj u Moj dan"}
    </Button>
  );
}

const PRIORITIES: ReadonlyArray<TaskPriorityKey> = ["urgent", "high", "medium", "low"];

/** Čip prioriteta sa menijem; `allowNone` samo za lični zadatak („Bez prioriteta"). */
export function PriorityChip({
  value,
  perm,
  allowNone,
  onChange,
  onDenied,
}: {
  value: TaskPriorityKey | null;
  perm: Perm;
  allowNone: boolean;
  onChange: (priority: TaskPriorityKey | null) => void;
  onDenied?: (reason: string) => void;
}) {
  const label = value ? PRIORITY_LABELS[value] : "Bez prioriteta";
  return (
    <MetaChip label="Prioritet" value={label} bare={value === null} icon={Flag} perm={perm} onDenied={onDenied}>
      {(trigger) => (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger render={trigger} />
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Prioritet</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={value ?? "none"}
                onValueChange={(next: string) => onChange(next === "none" ? null : (next as TaskPriorityKey))}
              >
                {PRIORITIES.map((priority) => (
                  <DropdownMenuRadioItem key={priority} value={priority} closeOnClick>
                    {PRIORITY_LABELS[priority]}
                  </DropdownMenuRadioItem>
                ))}
                {allowNone ? (
                  <DropdownMenuRadioItem value="none" closeOnClick>
                    Bez prioriteta
                  </DropdownMenuRadioItem>
                ) : null}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </MetaChip>
  );
}

/** Čip roka sa biračem datuma (P9). */
export function DueMetaChip({
  value,
  now,
  perm,
  onChange,
  onDenied,
}: {
  value: number | null;
  now: number;
  perm: Perm;
  onChange: (due: number | null) => void;
  onDenied?: (reason: string) => void;
}) {
  const due = describeDue(value, now);
  return (
    <MetaChip
      label="Rok"
      value={due.label}
      bare={value === null}
      icon={CalendarClock}
      perm={perm}
      onDenied={onDenied}
      ariaLabel={due.ariaLabel}
    >
      {(trigger) => (
        <DatePicker value={value} now={now} onChange={onChange}>
          {trigger}
        </DatePicker>
      )}
    </MetaChip>
  );
}
