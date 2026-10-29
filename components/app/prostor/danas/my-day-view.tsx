"use client";

// Preneto iz Devotion apps/web/components/me/my-day/my-day-view.tsx (main @ c05c40f), SPAJANJE S19.
import { useRef, type FocusEvent, type RefObject } from "react";
import { CalendarPlus, CheckCheck, Coffee, Plus, RefreshCw } from "lucide-react";
import type { TaskRowModel } from "@/lib/prostor/task-row";

import { PageHeader } from "@/components/app/page-header";
import { FlipGroup } from "@/components/motion/flip-group";
import { ProgressRing } from "@/components/app/system/progress";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { EmptyState } from "@/components/app/prostor/zajednicko/radni-ui";
import type { RowRequest } from "@/lib/prostor/precice/lista-zadataka";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

import { TaskSection } from "@/components/app/prostor/zadaci/section-header";
import { StartupChip } from "@/components/app/prostor/zajednicko/projekat-cip";
import { TaskRow, type TaskRowActions } from "@/components/app/prostor/zadaci/task-row";
import {
  FLIP_MAX_ROWS,
  plannedOrder,
  progressValueText,
  type MyDayGroupMode,
  type MyDayModel,
} from "@/lib/prostor/modeli/my-day-model";
import { podnaslovDelovi } from "@/lib/prostor/modeli/danas-model";
import { MyDayStrana, SazetakCipovi, type MyDayStranaProps } from "@/components/app/prostor/danas/my-day-strana";
import { MyDaySkeleton } from "@/components/app/prostor/danas/my-day-skeleton";

export type MyDayViewState =
  | { status: "loading" }
  | { status: "error"; retry: () => void }
  | { status: "ready"; model: MyDayModel };

export type MyDayViewProps = {
  now: number;
  firstName: string | null;
  state: MyDayViewState;
  groupMode: MyDayGroupMode;
  onGroupModeChange: (mode: MyDayGroupMode) => void;
  /** Desna kolona (≥ xl; ispod nje ide ispod Moj dan) i sažeti čipovi. */
  side: Omit<MyDayStranaProps, "now">;
  /** Bez radnji redovi su samo za čitanje. */
  actions?: TaskRowActions;
  canOpen: (row: TaskRowModel) => boolean;
  onQuickAdd: () => void;
  onPlanDay: () => void;
  /** „Moji zadaci" iz praznog stanja kad je sve završeno. */
  onOpenTasks: () => void;
  /** Opseg za Flip i prečice liste. */
  listRef?: RefObject<HTMLDivElement | null>;
  /** Jedan `aria-live` region po prikazu („Završeno: …"). */
  announcement?: string;
  /** Prečice liste (K11): izabran red, red sa otvorenim panelom, zahtev `d`/`p`. */
  selectedKey?: string | null;
  activeKey?: string | null;
  request?: RowRequest | null;
  onListFocus?: (event: FocusEvent<HTMLElement>) => void;
};

/**
 * Danas (`/`, O7, P17; plan S18 §1). Zaglavlje ekrana sa jedinom primarnom
 * radnjom („Brzi unos"), pa dve kolone od `xl`: levo Moj dan (traka sa
 * prstenom, „Dodaj zadatak…", sekcije Devotion P5 — prazne se preskaču,
 * Blokirano i Završeno danas su sklopljene), desno Čeka te iz svih projekata,
 * napredak, Inbox, Poruke i Ideje za glasanje. Ispod `xl` je jedna kolona sa
 * trakom čipova na vrhu.
 *
 * Radni ekran se ne animira pri učitavanju. Kvačica, rok i grupisanje pomeraju
 * redove kroz `FlipGroup` (snimak pre commit-a), koji i nov red uvede
 * neprozirnošću (dolazak sa brzog unosa ili drugog uređaja); iznad 80 redova
 * bez pokreta. Prezentacija: podaci i radnje stižu kroz props.
 */
export function MyDayView({
  now,
  firstName,
  state,
  groupMode,
  onGroupModeChange,
  side,
  actions,
  canOpen,
  onQuickAdd,
  onPlanDay,
  onOpenTasks,
  listRef,
  announcement = "",
  selectedKey = null,
  activeKey = null,
  request = null,
  onListFocus,
}: MyDayViewProps) {
  const rowState = { selectedKey, activeKey, request };
  const ownListRef = useRef<HTMLDivElement>(null);
  const scopeRef = listRef ?? ownListRef;
  const model = state.status === "ready" ? state.model : null;
  const podnaslov = podnaslovDelovi({ ime: firstName, now, counts: model ? model.counts : null });

  return (
    <div className="flex w-full flex-col gap-5 pb-16">
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      <PageHeader
        variant="module"
        title="Danas"
        description={
          <>
            {/* Na telefonu red je uzak: ostaju samo brojevi dana (ili datum dok se učitava). */}
            {podnaslov.pozdrav ? <span className="max-md:hidden">{podnaslov.pozdrav} · </span> : null}
            {podnaslov.sazetak ? (
              <>
                <span className="max-md:hidden">{podnaslov.dan} · </span>
                {podnaslov.sazetak}
              </>
            ) : (
              podnaslov.dan
            )}
          </>
        }
        actions={
          <Button variant="primary" type="button" onClick={onQuickAdd} aria-keyshortcuts="Q">
            <Plus aria-hidden="true" />
            Brzi unos
            <span aria-hidden="true" className="ml-1 hidden md:pointer-fine:inline-flex">
              <Kbd>Q</Kbd>
            </span>
          </Button>
        }
      />

      <SazetakCipovi cekaTe={side.cekaTe} inbox={side.inbox} chat={side.chat} pending={side.pending} />

      <div className="grid grid-cols-1 gap-x-6 gap-y-8 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
        <section aria-labelledby="moj-dan-naslov" className="flex min-w-0 flex-col gap-3">
          <MyDayTraka
            progress={model?.progress ?? null}
            groupMode={groupMode}
            onGroupModeChange={onGroupModeChange}
            onPlanDay={onPlanDay}
          />
          <button
            type="button"
            onClick={onQuickAdd}
            className="flex h-10 min-w-0 items-center gap-2 rounded-lg border border-dashed border-line px-3 text-left text-ui text-text-muted transition-colors hover:border-line-strong hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11"
          >
            <Plus className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">Dodaj zadatak…</span>
          </button>

          {state.status === "loading" ? (
            <MyDaySkeleton />
          ) : state.status === "error" ? (
            <EmptyState
              headingAs="h2"
              icon={RefreshCw}
              title="Moj dan nije učitan."
              description="Proveri vezu i pokušaj ponovo."
              action={
                <Button type="button" variant="secondary" onClick={state.retry}>
                  <RefreshCw aria-hidden="true" />
                  Pokušaj ponovo
                </Button>
              }
            />
          ) : (
            <MyDayLista
              model={state.model}
              now={now}
              groupMode={groupMode}
              actions={actions}
              canOpen={canOpen}
              onPlanDay={onPlanDay}
              onOpenTasks={onOpenTasks}
              scopeRef={scopeRef}
              onListFocus={onListFocus}
              rowState={rowState}
            />
          )}
        </section>

        <MyDayStrana now={now} {...side} />
      </div>
    </div>
  );
}

function MyDayLista({
  model,
  now,
  groupMode,
  actions,
  canOpen,
  onPlanDay,
  onOpenTasks,
  scopeRef,
  onListFocus,
  rowState,
}: {
  model: MyDayModel;
  now: number;
  groupMode: MyDayGroupMode;
  actions?: TaskRowActions;
  canOpen: (row: TaskRowModel) => boolean;
  onPlanDay: () => void;
  onOpenTasks: () => void;
  scopeRef: RefObject<HTMLDivElement | null>;
  onListFocus?: (event: FocusEvent<HTMLElement>) => void;
  rowState: { selectedKey: string | null; activeKey: string | null; request: RowRequest | null };
}) {
  const visible = model.sections.filter((section) => section.rows.length > 0);
  const openRows = visible.filter((section) => section.id !== "doneToday").length;
  const doneToday = model.counts.doneToday;
  const order = plannedOrder(model);
  const movableOf = (row: TaskRowModel, sectionId: string) => {
    if (sectionId !== "planned" || row.planEntryId === null) return undefined;
    const index = order.indexOf(row.planEntryId);
    return { up: index > 0, down: index !== -1 && index < order.length - 1 };
  };
  // Potpis rasporeda: grupisanje i ključevi redova po sekcijama (kvačica, rok, plan pomeraju red).
  const layoutKey =
    groupMode === "time"
      ? model.sections.map((section) => `${section.id}:${section.rows.map((row) => row.key).join(",")}`).join("|")
      : [
          ...model.byStartup.groups.map((group) => `${group.key}:${group.rows.map((row) => row.key).join(",")}`),
          `done:${model.byStartup.doneToday.map((row) => row.key).join(",")}`,
        ].join("|");

  return (
    <FlipGroup scope={scopeRef} layoutKey={`${groupMode}#${layoutKey}`} disabled={model.rowCount > FLIP_MAX_ROWS}>
      <div ref={scopeRef} onFocus={onListFocus} className="flex flex-col gap-5">
        {openRows === 0 ? (
          doneToday > 0 ? (
            <EmptyState
              headingAs="h2"
              icon={CheckCheck}
              title="Sve za danas je završeno."
              description={`Završeno danas: ${formatNumber(doneToday)}. Pogledaj šta je sledeće.`}
              action={
                <Button type="button" variant="secondary" onClick={onOpenTasks}>
                  Moji zadaci
                </Button>
              }
            />
          ) : (
            <EmptyState
              headingAs="h2"
              icon={Coffee}
              title="Danas je mirno."
              description="Nema rokova ni planova za danas."
              action={
                <Button type="button" variant="secondary" onClick={onPlanDay}>
                  <CalendarPlus aria-hidden="true" />
                  Isplaniraj dan
                </Button>
              }
            />
          )
        ) : null}

        {groupMode === "time" ? (
          visible.map((section) => (
            <TaskSection
              key={section.id}
              title={section.title}
              count={section.rows.length}
              collapsible={section.collapsedByDefault}
              defaultCollapsed={section.collapsedByDefault}
              tone={section.id === "overdue" ? "danger" : "default"}
            >
              <RowList
                sectionId={section.id}
                rows={section.rows}
                now={now}
                actions={actions}
                canOpen={canOpen}
                movable={(row) => movableOf(row, section.id)}
                rowState={rowState}
              />
            </TaskSection>
          ))
        ) : (
          <>
            {model.byStartup.groups.map((group) => (
              <TaskSection
                key={group.key}
                title={group.title}
                count={group.rows.length}
                leading={<StartupChip workspace={group.rows[0]?.workspace ?? group.workspace} size="sm" />}
              >
                <RowList
                  sectionId={group.key}
                  rows={group.rows}
                  now={now}
                  actions={actions}
                  canOpen={canOpen}
                  showStartup={false}
                  rowState={rowState}
                />
              </TaskSection>
            ))}
            {model.byStartup.doneToday.length > 0 ? (
              <TaskSection title="Završeno danas" count={model.byStartup.doneToday.length} collapsible defaultCollapsed>
                <RowList
                  sectionId="doneToday"
                  rows={model.byStartup.doneToday}
                  now={now}
                  actions={actions}
                  canOpen={canOpen}
                  rowState={rowState}
                />
              </TaskSection>
            ) : null}
          </>
        )}

        {model.capped ? (
          <p className="px-2 text-meta text-text-muted">Prikazan je deo zadataka. Sve nađi u Mojim zadacima.</p>
        ) : null}
      </div>
    </FlipGroup>
  );
}

function RowList({
  sectionId,
  rows,
  now,
  actions,
  canOpen,
  showStartup = true,
  movable,
  rowState,
}: {
  rowState: { selectedKey: string | null; activeKey: string | null; request: RowRequest | null };
  /** Za vraćanje fokusa kad red pređe u skupljenu sekciju. */
  sectionId: string;
  rows: TaskRowModel[];
  now: number;
  actions?: TaskRowActions;
  canOpen: (row: TaskRowModel) => boolean;
  showStartup?: boolean;
  movable?: (row: TaskRowModel) => { up: boolean; down: boolean } | undefined;
}) {
  return (
    <ul data-section={sectionId} className="space-y-0.5">
      {rows.map((row) => (
        <li key={row.key} data-flip-id={row.key}>
          <TaskRow
            row={row}
            now={now}
            actions={actions}
            canOpen={canOpen(row)}
            showStartup={showStartup}
            movable={movable?.(row)}
            selected={rowState.selectedKey === row.key}
            active={rowState.activeKey === row.key}
            request={rowState.request?.key === row.key ? rowState.request : null}
          />
        </li>
      ))}
    </ul>
  );
}

/**
 * Traka Moj dan (Devotion zaglavlje, plan S18 E15): naslov grupe, prsten dana
 * (završeno / planirano + rok danas), prekidač „Po vremenu / Po projektu" i
 * „Isplaniraj dan". Naslov ekrana je u `PageHeader`-u. Prsten se ne animira
 * pri učitavanju; pomeri se tek kad se vrednost promeni.
 */
function MyDayTraka({
  progress,
  groupMode,
  onGroupModeChange,
  onPlanDay,
}: {
  progress: { done: number; total: number } | null;
  groupMode: MyDayGroupMode;
  onGroupModeChange: (mode: MyDayGroupMode) => void;
  onPlanDay: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <h2 id="moj-dan-naslov" className="text-copy font-bold text-foreground">
        Moj dan
      </h2>
      {progress && progress.total > 0 ? (
        <ProgressRing
          value={progress.done}
          max={progress.total}
          size={32}
          stroke={4}
          label={`Napredak dana: ${progressValueText(progress)}`}
        >
          <span className="sr-only">{progressValueText(progress)}</span>
        </ProgressRing>
      ) : null}
      {progress && progress.total > 0 ? (
        <span aria-hidden="true" className="text-ui tabular-nums text-text-muted">
          {formatNumber(progress.done)} / {formatNumber(progress.total)}
        </span>
      ) : null}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <GroupModeToggle value={groupMode} onChange={onGroupModeChange} />
        <Button type="button" variant="secondary" onClick={onPlanDay}>
          <CalendarPlus aria-hidden="true" />
          Isplaniraj dan
        </Button>
      </div>
    </div>
  );
}

/** „Po vremenu / Po projektu" — pamti se lokalno (kontejner). Izbor je neutralan, ne boja radnje. */
function GroupModeToggle({ value, onChange }: { value: MyDayGroupMode; onChange: (mode: MyDayGroupMode) => void }) {
  const options: Array<{ value: MyDayGroupMode; label: string }> = [
    { value: "time", label: "Po vremenu" },
    { value: "startup", label: "Po projektu" },
  ];
  return (
    <div role="group" aria-label="Grupisanje" className="inline-flex shrink-0 rounded-lg border border-line bg-surface-control p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "inline-flex h-7 items-center rounded-md px-2.5 text-meta font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11",
            value === option.value
              ? "bg-surface-control-hover text-foreground"
              : "text-text-muted hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
