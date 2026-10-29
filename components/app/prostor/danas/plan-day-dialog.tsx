"use client";

// Preneto iz Devotion apps/web/components/me/plan-day/plan-day-dialog.tsx (main @ c05c40f), SPAJANJE S19.
import { useId, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { CalendarCheck2, Plus, RefreshCw, Undo2, X } from "lucide-react";

import { FlipGroup } from "@/components/motion/flip-group";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/format";

import { FLIP_MAX_ROWS } from "@/lib/prostor/modeli/my-day-model";

import { DueChip } from "@/components/app/prostor/zadaci/due-chip";
import { StartupChip } from "@/components/app/prostor/zajednicko/projekat-cip";
import { groupSuggestions, type PlanDayCarryRow, type PlanDayModel, type PlanDaySuggestionRow } from "@/lib/prostor/modeli/plan-day-model";

export type PlanDayState = { status: "loading" } | { status: "error"; retry: () => void } | { status: "ready"; model: PlanDayModel };

export type PlanDayDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  now: number;
  state: PlanDayState;
  onAdd: (row: PlanDaySuggestionRow["row"]) => void;
  onCarryOver: (keys: string[]) => void;
  onDismiss: (keys: string[]) => void;
};

/**
 * „Isplaniraj dan" (Devotion K07 §2): „Preneto od ranije" (Vrati / Skloni /
 * Vrati sve u danas) i predlozi po razlogu sa „+". Ništa se ne prenosi samo.
 * Tastatura: ↑/↓ kroz redove, Enter ili Space dodaje (vraća), Delete sklanja.
 * Dodata stavka izlazi iz liste, a ostali se razmaknu kroz `FlipGroup`.
 *
 * Enigmin dijalog (Base UI, ulaz i izlaz CSS prelazom, D17), pri vrhu ekrana
 * kao brzi unos; jedina primarna radnja dijaloga je „Gotovo".
 */
export function PlanDayDialog({ open, onOpenChange, now, state, onAdd, onCarryOver, onDismiss }: PlanDayDialogProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const total = state.status === "ready" ? state.model.carryOver.length + state.model.suggestions.length : 0;
  // Red koji nestane posle radnje: fokus ide na red koji je stao na njegovo mesto.
  const refocusIndex = useRef<number | null>(null);
  const zapamtiRed = (event: { currentTarget: EventTarget } | undefined, run: () => void) => {
    const root = listRef.current;
    if (root && event?.currentTarget instanceof HTMLElement && root.contains(event.currentTarget)) {
      const row = event.currentTarget.closest("[data-flip-id]");
      const primaries = Array.from(root.querySelectorAll("[data-plan-primary]"));
      const index = row ? primaries.findIndex((element) => row.contains(element)) : -1;
      refocusIndex.current = index === -1 ? null : index;
    }
    run();
  };
  // Layout efekat: pre zamke fokusa dijaloga, koja bi fokus vratila na sam dijalog.
  useLayoutEffect(() => {
    const index = refocusIndex.current;
    const root = listRef.current;
    if (index === null || !root) return;
    const active = document.activeElement;
    if (active && active !== document.body) {
      // Korisnik je već negde drugde (npr. „Gotovo"): fokus se ne otima.
      if (!root.contains(active)) refocusIndex.current = null;
      return;
    }
    refocusIndex.current = null;
    const primaries = root.querySelectorAll<HTMLElement>("[data-plan-primary]");
    (primaries[Math.min(index, primaries.length - 1)] ?? root.querySelector<HTMLElement>("button"))?.focus({ preventScroll: true });
  });
  const full = state.status === "ready" && state.model.plannedCount >= state.model.max;
  const fullId = useId();

  const onListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const root = listRef.current;
    if (!root) return;
    const targets = Array.from(root.querySelectorAll<HTMLElement>("[data-plan-primary]"));
    // Fokus može biti i na „Skloni" ili „Vrati sve": red se nalazi po najbližem redu.
    const active = document.activeElement;
    const activeRow = active instanceof HTMLElement ? active.closest("[data-flip-id]") : null;
    const index = targets.findIndex((element) => element === active || (activeRow !== null && activeRow.contains(element)));
    const next = event.key === "ArrowDown" ? index + 1 : index - 1;
    if (next < 0 || next >= targets.length) return;
    event.preventDefault();
    targets[next].focus();
  };

  const layoutKey =
    state.status === "ready"
      ? [...state.model.carryOver.map((item) => item.row.key), "|", ...state.model.suggestions.map((item) => item.row.key)].join(",")
      : state.status;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup
        // Prvi red („Vrati" ili „+"), da tastatura odmah radi u listi; bez redova dijalog bira sam.
        initialFocus={() => listRef.current?.querySelector<HTMLElement>("[data-plan-primary]") ?? true}
        className="top-[min(8vh,4rem)] flex max-h-[calc(100dvh-min(16vh,8rem))] translate-y-0 flex-col gap-0 p-0 sm:max-w-[36rem]"
      >
        <div className="flex flex-col gap-1 border-b border-line px-5 py-4">
          <DialogTitle>Isplaniraj dan</DialogTitle>
          <DialogDescription>Izaberi šta radiš danas. Ništa se ne prenosi samo.</DialogDescription>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {state.status === "loading" ? (
            <div role="status" aria-label="Učitavanje predloga" className="space-y-2">
              {[0, 1, 2].map((row) => (
                <Skeleton key={row} className="h-12 w-full rounded-md" />
              ))}
            </div>
          ) : state.status === "error" ? (
            <div role="alert" className="flex flex-col items-start gap-3 py-2">
              <p className="text-ui text-text-secondary">Predlozi nisu učitani.</p>
              <Button type="button" variant="secondary" onClick={state.retry}>
                <RefreshCw aria-hidden="true" />
                Pokušaj ponovo
              </Button>
            </div>
          ) : (
            <FlipGroup scope={listRef} layoutKey={layoutKey} disabled={total > FLIP_MAX_ROWS}>
              <div ref={listRef} onKeyDown={onListKeyDown} className="space-y-5">
                {state.model.carryOver.length > 0 ? (
                  <PlanSection
                    title="Preneto od ranije"
                    action={
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
                        aria-disabled={full || undefined}
                        aria-describedby={full ? fullId : undefined}
                        onClick={(event) => {
                          if (!full) zapamtiRed(event, () => onCarryOver(state.model.carryOver.map((item) => item.row.key)));
                        }}
                      >
                        <Undo2 aria-hidden="true" />
                        Vrati sve u danas
                      </Button>
                    }
                  >
                    {state.model.carryOver.map((item) => (
                      <CarryRow
                        key={item.row.key}
                        item={item}
                        now={now}
                        full={full ? fullId : null}
                        onReturn={(event) => zapamtiRed(event, () => onCarryOver([item.row.key]))}
                        onDismiss={(event) => zapamtiRed(event, () => onDismiss([item.row.key]))}
                      />
                    ))}
                  </PlanSection>
                ) : null}

                {state.model.suggestions.length > 0 ? (
                  groupSuggestions(state.model.suggestions).map((group, index) => (
                    <PlanSection key={group.reason} title={index === 0 ? `Predlozi · ${group.label}` : group.label}>
                      {group.rows.map((item) => (
                        <SuggestionRow
                          key={item.row.key}
                          item={item}
                          now={now}
                          full={full ? fullId : null}
                          onAdd={(event) => zapamtiRed(event, () => onAdd(item.row))}
                        />
                      ))}
                    </PlanSection>
                  ))
                ) : state.model.carryOver.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 py-6 text-center">
                    <span className="grid size-10 place-items-center rounded-lg bg-surface-control text-text-secondary">
                      <CalendarCheck2 className="size-5" aria-hidden="true" />
                    </span>
                    <p className="text-ui text-text-secondary">Nema predloga za danas. Zadatke dodaješ i Brzim unosom.</p>
                  </div>
                ) : null}

                {full ? (
                  <p id={fullId} role="status" className="rounded-md bg-surface-control px-3 py-2 text-ui text-text-secondary">
                    Moj dan može imati najviše {formatNumber(state.model.max)} stavki.
                  </p>
                ) : null}
              </div>
            </FlipGroup>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3">
          <p className="text-ui text-text-muted" aria-live="polite">
            {state.status === "ready" ? (
              <>
                U planu: <span className="font-semibold tabular-nums text-foreground">{formatNumber(state.model.plannedCount)}</span> od{" "}
                <span className="tabular-nums">{formatNumber(state.model.max)}</span>
              </>
            ) : null}
          </p>
          <Button variant="primary" type="button" onClick={() => onOpenChange(false)}>
            Gotovo
          </Button>
        </div>
      </DialogPopup>
    </Dialog>
  );
}

function PlanSection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <div className="mb-1 flex min-h-8 items-center justify-between gap-2 px-1">
        <h3 id={headingId} className="text-ui font-semibold text-text-secondary">
          {title}
        </h3>
        {action}
      </div>
      <ul className="space-y-0.5">{children}</ul>
    </section>
  );
}

const rowClass =
  "flex min-h-12 items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-surface-control focus-within:bg-surface-control";

function RowBody({ row, now, meta }: { row: PlanDaySuggestionRow["row"]; now: number; meta: ReactNode }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="truncate text-ui text-foreground" title={row.title}>
        {row.title}
      </span>
      <span className="flex min-w-0 items-center gap-1.5 text-meta text-text-muted">
        <StartupChip workspace={row.workspace} size="xs" showName className="max-w-[10rem]" nameClassName="text-meta" />
        {row.areaLabel ? <span className="truncate">· {row.areaLabel}</span> : null}
        {meta}
        <DueChip dueDate={row.dueDate} now={now} className="ml-auto" />
      </span>
    </span>
  );
}

function CarryRow({
  item,
  now,
  full,
  onReturn,
  onDismiss,
}: {
  item: PlanDayCarryRow;
  now: number;
  /** Plan je pun: id poruke sa razlogom (Devotion E15: aria-disabled, ne disabled). */
  full: string | null;
  onReturn: (event?: { currentTarget: EventTarget }) => void;
  onDismiss: (event?: { currentTarget: EventTarget }) => void;
}) {
  return (
    <li data-flip-id={item.row.key} className={rowClass}>
      <RowBody row={item.row} now={now} meta={<span className="shrink-0">· iz {item.fromLabel}</span>} />
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
        data-plan-primary
        aria-disabled={full !== null || undefined}
        aria-describedby={full ?? undefined}
        aria-label={`Vrati u danas: ${item.row.title}`}
        onClick={(event) => {
          if (full === null) onReturn(event);
        }}
        onKeyDown={(event) => {
          if (event.key === "Delete") {
            event.preventDefault();
            onDismiss(event);
          }
        }}
      >
        Vrati
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label={`Skloni: ${item.row.title}`}
        title="Skloni"
        onClick={onDismiss}
        className="text-text-muted"
      >
        <X aria-hidden="true" />
      </Button>
    </li>
  );
}

function SuggestionRow({
  item,
  now,
  full,
  onAdd,
}: {
  item: PlanDaySuggestionRow;
  now: number;
  full: string | null;
  onAdd: (event?: { currentTarget: EventTarget }) => void;
}) {
  return (
    <li data-flip-id={item.row.key} className={rowClass}>
      <RowBody row={item.row} now={now} meta={null} />
      <Button
        type="button"
        size="icon-sm"
        variant="outline"
        data-plan-primary
        aria-disabled={full !== null || undefined}
        aria-describedby={full ?? undefined}
        aria-label={`Dodaj u Moj dan: ${item.row.title}`}
        title="Dodaj u Moj dan"
        onClick={(event) => {
          if (full === null) onAdd(event);
        }}
        className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
      >
        <Plus aria-hidden="true" />
      </Button>
    </li>
  );
}
