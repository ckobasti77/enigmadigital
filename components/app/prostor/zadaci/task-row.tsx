"use client";

// Preneto iz Devotion apps/web/components/me/task-row.tsx (main @ c05c40f), SPAJANJE S12.
import { useId, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  CircleDot,
  CalendarDays,
  CalendarX2,
  Check,
  ExternalLink,
  Flag,
  LogIn,
  Lock,
  MoreHorizontal,
  RotateCcw,
  Sun,
  SunDim,
} from "lucide-react";
import {
  DUE_SHORTCUT_LABELS,
  DUE_SHORTCUTS,
  dueShortcutValue,
  formatDateShort,
  matchDueShortcut,
  PRIORITY_LABELS,
  STATUS_LABELS,
  STARTUP_TASK_STATUSES,
  type Perm,
  type StartupTaskStatus,
  type TaskPriorityKey,
  type TaskRowModel,
} from "@/lib/prostor";

import { AnimatedCheck } from "@/components/motion/animated-check";
import { DatePicker } from "@/components/app/prostor/zajednicko/birac-datuma";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DUR_REDUCED, DUR_UI, EASE_UI, MOTION_QUERIES } from "@/lib/motion";
import type { RowRequest } from "@/lib/prostor/precice/lista-zadataka";
import { cn } from "@/lib/utils";

import { DueChip } from "@/components/app/prostor/zadaci/due-chip";
import { FirmaOznaka } from "@/components/app/prostor/zadaci/firma-cip";
import { PriorityDot } from "@/components/app/prostor/zadaci/priority-dot";
import { StartupChip } from "@/components/app/prostor/zajednicko/projekat-cip";

/** Radnje reda (plan K07 §1.2). Prezentacija samo javlja nameru; kontejner zove mutacije. */
export type TaskRowActions = {
  onToggleDone: (row: TaskRowModel, done: boolean) => void;
  onTogglePlan: (row: TaskRowModel) => void;
  onSetDue: (row: TaskRowModel, due: number | null) => void;
  onSetPriority: (row: TaskRowModel, priority: TaskPriorityKey | null) => void;
  onOpen: (row: TaskRowModel) => void;
  /** Redosled u „Planirano" (`myDay.reorder`). */
  onMove?: (row: TaskRowModel, direction: -1 | 1) => void;
  /** Liste u startupu (K17): ceo izbor statusa u meniju „…". */
  onSetStatus?: (row: TaskRowModel, status: StartupTaskStatus) => void;
  /** Liste u startupu (K17): „Priključi se" (svaki član sme sebe da doda). */
  onJoin?: (row: TaskRowModel) => void;
};

export type TaskRowProps = {
  row: TaskRowModel;
  now: number;
  actions?: TaskRowActions;
  /** Ima li stavka prikaz za otvaranje (od K11 panel zadatka za obe vrste). */
  canOpen?: boolean;
  showStartup?: boolean;
  /** Pomeranje u planu: koje strane su moguće (samo u „Planirano"). */
  movable?: { up: boolean; down: boolean };
  /** Izabran red (prečice `j`/`k`). */
  selected?: boolean;
  /** Panel ovog reda je otvoren (red ostaje istaknut, trenutak 3). */
  active?: boolean;
  /** Prečica `d`/`p` za ovaj red: otvori birač roka ili meni prioriteta. */
  request?: RowRequest | null;
  /**
   * Kolone (Moji zadaci, plan K07 §1.3): na `lg` oblast 120 · status 96 ·
   * rok 104 · prioritet 88; uže — isti podaci u drugom redu. `showStatus`
   * gasi kolonu statusa kad je lista grupisana po statusu.
   */
  columns?: boolean;
  showStatus?: boolean;
  /** Dodatni podatak u redu (npr. izvršioci u Komandnom centru). */
  extraMeta?: ReactNode;
  /**
   * `card`: kartica table (K17) — naslov u dva reda, podaci ispod, radnje
   * samo kroz „…" (uska kolona nema mesta za dugmad na hover).
   */
  variant?: "row" | "card";
  /** Nudi „Priključi se" u meniju (ne-kreator koji nije izvršilac). */
  canJoin?: boolean;
  className?: string;
};

/** Stavke menija na dodir ≥ 44 px (globalno pravilo pokriva samo dugmad). */
const touchItem = "pointer-coarse:min-h-11";

function MenuItem({ className, ...props }: React.ComponentProps<typeof DropdownMenuItem>) {
  return <DropdownMenuItem className={cn(touchItem, className)} {...props} />;
}

const PRIORITIES: ReadonlyArray<TaskPriorityKey> = ["urgent", "high", "medium", "low"];

/** Dugme radnje u redu: vidi se na hover/fokus (miš), na dodir samo „…" (plan K07 §1.2). */
const hoverReveal =
  "md:pointer-fine:opacity-0 md:pointer-fine:group-hover/row:opacity-100 md:pointer-fine:group-focus-within/row:opacity-100 data-open:opacity-100";
const iconButton =
  "grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors pointer-coarse:size-11 hover:bg-surface-control-hover hover:text-foreground aria-disabled:cursor-not-allowed aria-disabled:hover:bg-transparent aria-disabled:hover:text-muted-foreground";

/**
 * Red zadatka ličnog nivoa (pun, K10): kvačica (`AnimatedCheck` + precrt),
 * naslov, čip startupa ili „Lično", oblast, rok, tačka prioriteta i radnje
 * (Moj dan, rok, „…"). Na širokom ekranu jedan red od 40 px, na uskom dva
 * reda (≥ 56 px). Zabranjena radnja je onemogućena sa razlogom (E15), nikad
 * sakrivena bez objašnjenja.
 */
export function TaskRow({
  row,
  now,
  actions,
  canOpen = false,
  showStartup = true,
  movable,
  selected = false,
  active = false,
  request = null,
  columns = false,
  showStatus = true,
  extraMeta,
  variant = "row",
  canJoin = false,
  className,
}: TaskRowProps) {
  const card = variant === "card";
  const statusPerm = row.permissions.status;
  const rootRef = useRef<HTMLDivElement>(null);
  const [dueOpen, setDueOpen] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(false);
  // Prečica `d`/`p` stiže kao nov `nonce` (izvedeno stanje, bez efekta).
  const [seenRequest, setSeenRequest] = useState(request?.nonce ?? 0);
  if (request && request.nonce !== seenRequest) {
    setSeenRequest(request.nonce);
    if (request.kind === "due") setDueOpen(true);
    else setPriorityOpen(true);
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!actions?.onMove || !movable || !event.altKey) return;
    if (event.key === "ArrowUp" && movable.up) {
      event.preventDefault();
      actions.onMove(row, -1);
    } else if (event.key === "ArrowDown" && movable.down) {
      event.preventDefault();
      actions.onMove(row, 1);
    }
  };

  // Firma iz Leadova (S23): uz naslov kad je red u jednoj liniji, a u redu sa
  // podacima kad se lomi u dva (na uskom bi gurala naslov).
  const firmaUzNaslov = row.leadCompanyId ? (
    <FirmaOznaka
      leadCompanyId={row.leadCompanyId}
      className={card ? undefined : columns ? "hidden xl:inline-flex" : "hidden md:inline-flex"}
    />
  ) : null;
  const firmaUPodacima =
    row.leadCompanyId && !card ? (
      <FirmaOznaka leadCompanyId={row.leadCompanyId} className={columns ? "xl:hidden" : "md:hidden"} />
    ) : null;

  const meta = columns ? (
    <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground xl:shrink-0 xl:flex-nowrap xl:gap-0">
      {showStartup ? (
        <StartupChip workspace={row.workspace} size="xs" showName className="max-w-[11rem] xl:w-[9rem] xl:max-w-[9rem] xl:shrink-0 xl:pr-3" nameClassName="text-xs" />
      ) : null}
      <span className={cn("min-w-0 truncate xl:w-[120px] xl:pr-3", !row.areaLabel && "max-xl:hidden")}>
        {showStartup ? <span aria-hidden="true" className="xl:hidden">· </span> : null}
        {row.areaLabel ?? (
          <>
            <span aria-hidden="true">—</span>
            <span className="sr-only">Bez oblasti</span>
          </>
        )}
      </span>
      {firmaUPodacima}
      {extraMeta ? <span className="flex min-w-0 shrink-0 items-center xl:w-28 xl:pr-3">{extraMeta}</span> : null}
      {showStatus ? (
        <span className="shrink-0 whitespace-nowrap xl:w-24 xl:pr-3">
          {showStartup || row.areaLabel ? (
            <span aria-hidden="true" className="xl:hidden">
              ·{" "}
            </span>
          ) : null}
          <span className="sr-only">Status: </span>
          {STATUS_LABELS[row.status]}
        </span>
      ) : null}
      <span className="ml-auto flex shrink-0 items-center gap-1.5 xl:ml-0 xl:w-[104px]">
        <DueChip dueDate={row.dueDate} now={now} done={row.done} />
        <PriorityDot priority={row.priority} className="xl:hidden" />
      </span>
      <span className="hidden shrink-0 items-center gap-1.5 xl:flex xl:w-[88px]">
        {row.priority ? (
          <>
            <PriorityDot priority={row.priority} />
            <span className="sr-only">Prioritet: </span>
            {PRIORITY_LABELS[row.priority]}
          </>
        ) : (
          <>
            <span aria-hidden="true">—</span>
            <span className="sr-only">Bez prioriteta</span>
          </>
        )}
      </span>
    </span>
  ) : (
    <span
      className={cn(
        "flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground",
        // Kartica: oblast ne seče se u ništa — rok prelazi u novi red kad nema mesta.
        card ? "flex-wrap gap-y-1" : "md:max-w-[52%] md:shrink-0",
      )}
    >
      {showStartup ? (
        <StartupChip workspace={row.workspace} size="xs" showName className="max-w-[11rem]" nameClassName="text-xs" />
      ) : null}
      {row.areaLabel ? (
        <span className={cn("truncate", card ? "max-w-full shrink-0" : "min-w-0")}>
          {showStartup ? <span aria-hidden="true">· </span> : null}
          {row.areaLabel}
        </span>
      ) : null}
      {firmaUPodacima}
      {extraMeta ? <span className="flex min-w-0 shrink-0 items-center">{extraMeta}</span> : null}
      <span className={cn("flex shrink-0 items-center gap-1.5", card ? null : "ml-auto md:ml-1")}>
        <DueChip dueDate={row.dueDate} now={now} done={row.done} />
        <PriorityDot priority={row.priority} />
      </span>
    </span>
  );

  return (
    <div
      ref={rootRef}
      data-row-key={row.key}
      data-selected={selected ? "true" : undefined}
      onKeyDown={onKeyDown}
      className={cn(
        "group/row relative isolate flex min-h-14 w-full items-start gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-surface-control-hover focus-within:bg-surface-control-hover data-[selected=true]:bg-surface-control-hover",
        // Lista je gusta (36–40 px po redu); na uskom ekranu dva reda.
        !card && "md:min-h-10 md:items-center md:py-0.5",
        card && "border border-line-soft bg-card px-2.5 py-2.5",
        active && "bg-surface-control-hover hover:bg-surface-control-hover focus-within:bg-surface-control-hover data-[selected=true]:bg-surface-control-hover",
        className,
      )}
    >
      {/* Podloga „nove stavke": kontejner je pali i gasi (trenutak 4). */}
      <span data-arrive aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 rounded-lg bg-surface-control-hover opacity-0" />
      <span className="grid size-6 shrink-0 place-items-center md:size-8">
        {statusPerm.allowed ? (
          <AnimatedCheck
            checked={row.done}
            onCheckedChange={(next) => actions?.onToggleDone(row, next)}
            disabled={!actions}
            label={`Završi: ${row.title}`}
          />
        ) : (
          <LockedCheck
            title={row.title}
            reason={statusPerm.reason}
            done={row.done}
            onPress={() => actions?.onToggleDone(row, !row.done)}
          />
        )}
      </span>

      <TitleArea
        row={row}
        columns={columns}
        card={card}
        canOpen={canOpen && Boolean(actions)}
        onOpen={() => actions?.onOpen(row)}
        uzNaslov={firmaUzNaslov}
      >
        {meta}
      </TitleArea>

      {actions ? (
        <span className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            aria-pressed={row.planned}
            aria-label={`Moj dan: ${row.title}`}
            title={row.planned ? "Ukloni iz Moj dan" : "Dodaj u Moj dan"}
            onClick={() => actions.onTogglePlan(row)}
            className={cn(
              iconButton,
              "hidden",
              !card && "md:pointer-fine:grid",
              hoverReveal,
              row.planned && "text-foreground md:pointer-fine:opacity-100",
            )}
          >
            {row.planned ? <Sun className="size-4" aria-hidden="true" /> : <SunDim className="size-4" aria-hidden="true" />}
          </button>
          <DueButton
            row={row}
            now={now}
            hidden={card}
            open={dueOpen}
            onOpenChange={setDueOpen}
            rootRef={rootRef}
            onSetDue={(due) => actions.onSetDue(row, due)}
          />
          <MoreMenu
            row={row}
            now={now}
            actions={actions}
            canOpen={canOpen}
            movable={movable}
            canJoin={canJoin}
            onPickDate={() => setDueOpen(true)}
          />
          {priorityOpen && row.permissions.priority.allowed ? (
            <PriorityMenu
              row={row}
              rootRef={rootRef}
              onClose={() => setPriorityOpen(false)}
              onSetPriority={(priority) => actions.onSetPriority(row, priority)}
            />
          ) : null}
        </span>
      ) : null}
    </div>
  );
}

/** Fokus na naslov reda (posle birača/menija otvorenog prečicom, kad okidač nije vidljiv). */
function focusRowTitle(rootRef: RefObject<HTMLDivElement | null>) {
  const target =
    rootRef.current?.querySelector<HTMLElement>("[data-row-focus]") ??
    rootRef.current?.querySelector<HTMLElement>("button");
  target?.focus({ preventScroll: true });
}

function isShown(element: Element | null | undefined) {
  return element instanceof HTMLElement && element.getClientRects().length > 0 && getComputedStyle(element).opacity !== "0";
}

/** Tačka uz desnu ivicu reda: birač i meni otvoreni prečicom se postavljaju uz nju. */
const rowAnchorClass = "pointer-events-none absolute bottom-1 right-2 size-px";

/** Naslov + metapodaci; klik otvara stavku kad postoji prikaz. Precrt prolazi sleva nadesno. */
function TitleArea({
  row,
  columns = false,
  card = false,
  canOpen,
  onOpen,
  uzNaslov,
  children,
}: {
  row: TaskRowModel;
  /** Kolone: naslov i podaci u istom redu tek od `lg` (na `md` podaci idu ispod). */
  columns?: boolean;
  /** Kartica table: naslov do dva reda, podaci uvek ispod. */
  card?: boolean;
  canOpen: boolean;
  onOpen: () => void;
  /** Uz naslov, u istoj koloni (firma iz Leadova, S23). */
  uzNaslov?: ReactNode;
  children: ReactNode;
}) {
  const [initiallyDone] = useState(row.done);
  const strikeRef = useRef<HTMLSpanElement>(null);
  const settled = useRef(row.done);

  // Precrt prati kvačicu (isti trenutak, `DUR_UI`); prvo crtanje se ne animira.
  useGSAP(
    () => {
      if (settled.current === row.done) return;
      settled.current = row.done;
      const strike = strikeRef.current;
      if (!strike) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_QUERIES, (ctx) => {
        if (ctx.conditions?.still) {
          gsap.set(strike, { scaleX: 1 });
          gsap.to(strike, { opacity: row.done ? 1 : 0, duration: DUR_REDUCED, ease: "none", overwrite: "auto" });
          return;
        }
        gsap.set(strike, { opacity: 1 });
        gsap.to(strike, { scaleX: row.done ? 1 : 0, duration: DUR_UI, ease: EASE_UI, overwrite: "auto" });
      });
    },
    { dependencies: [row.done] },
  );

  const body = (
    <>
      <span
        className={cn(
          "min-w-0 max-w-full",
          card ? null : columns ? "xl:flex-1" : "md:flex-1",
          uzNaslov && (card ? "flex flex-col items-start gap-1" : "flex items-center gap-2"),
        )}
      >
        {/* Precrt je širok koliko tekst (ne cela kolona), pa omotač skuplja na sadržaj. */}
        <span className="relative block w-fit min-w-0 max-w-full">
          <span
            title={row.title}
            data-row-title
            className={cn(
              "block text-sm transition-colors",
              // Kartica ima naslov u dva reda: precrt je `line-through` (crta preko sredine
              // bloka bi izgledala kao podvlaka); kvačica i pokret ostaju isti.
              card ? "line-clamp-2 font-medium leading-5" : "truncate",
              card && row.done && "line-through decoration-muted-foreground",
              row.done ? "text-muted-foreground" : "text-foreground",
            )}
          >
            {row.title}
            {row.done ? <span className="sr-only"> (završeno)</span> : null}
          </span>
          <span
            ref={strikeRef}
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute left-0 top-1/2 h-px w-full max-w-full origin-left bg-muted-foreground",
              card && "hidden",
            )}
            style={{ transform: `scaleX(${initiallyDone ? 1 : 0})`, opacity: initiallyDone ? 1 : 0 }}
          />
        </span>
        {uzNaslov}
      </span>
      {children}
    </>
  );

  const layout = card
    ? "flex min-w-0 flex-1 flex-col gap-1.5 py-0.5 text-left"
    : columns
      ? "flex min-w-0 flex-1 flex-col gap-0.5 py-0.5 text-left xl:flex-row xl:items-center xl:gap-3"
      : "flex min-w-0 flex-1 flex-col gap-0.5 py-0.5 text-left md:flex-row md:items-center md:gap-3";
  if (!canOpen) return <span className={layout}>{body}</span>;
  return (
    <OpenButton className={layout} onOpen={onOpen}>
      {body}
    </OpenButton>
  );
}

/**
 * Naslov koji otvara panel: pritisak ga utisne (CSS `--press-scale`, kao
 * Enigmina dugmad). `data-row-focus` je cilj fokusa za prečice `j`/`k`, a
 * `data-row-title` izvor „leteće kopije" naslova u zaglavlje panela.
 */
function OpenButton({ className, onOpen, children }: { className: string; onOpen: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      data-row-focus
      onClick={onOpen}
      className={cn(
        className,
        "rounded-md outline-none transition-transform duration-(--duration-press) focus-visible:ring-2 focus-visible:ring-ring active:scale-(--press-scale)",
      )}
    >
      {children}
    </button>
  );
}

/** Kvačica bez dozvole (E15): `aria-disabled`, katanac, razlog u tooltipu i `aria-describedby`. */
function LockedCheck({
  title,
  reason,
  done,
  onPress,
}: {
  title: string;
  reason: string | null;
  done: boolean;
  /** Klik/dodir: kontejner pokaže razlog (tooltip se na dodir ne otvara). */
  onPress: () => void;
}) {
  const reasonId = useId();
  return (
    <Tooltip>
      <TooltipTrigger render={<button type="button"
          role="checkbox"
          aria-checked={done}
          aria-disabled="true"
          aria-label={`Završi: ${title}`}
          aria-describedby={reasonId}
          onClick={(event) => {
            event.preventDefault();
            onPress();
          }}
          className="grid size-6 cursor-not-allowed place-items-center rounded-full" />}>
          <span className="grid size-5 place-items-center rounded-full border-[1.5px] border-dashed border-line-control text-muted-foreground">
            <Lock className="size-2.5" aria-hidden="true" />
          </span>
        </TooltipTrigger>
      <TooltipContent className="max-w-64">{reason}</TooltipContent>
      <span id={reasonId} className="sr-only">
        {reason}
      </span>
    </Tooltip>
  );
}

/**
 * Rok kroz birač datuma (P9, K11): čipovi + kalendar. Okidač se vidi na
 * hover/fokus (miš); prečica `d` i „Datum…" iz menija ga otvaraju i kad
 * okidač nije vidljiv — popover se tada postavlja uz desnu ivicu reda.
 */
function DueButton({
  row,
  now,
  hidden = false,
  open,
  onOpenChange,
  rootRef,
  onSetDue,
}: {
  row: TaskRowModel;
  now: number;
  /** Kartica table: okidač se ne vidi; birač otvaraju „Datum…" i prečica `d`. */
  hidden?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rootRef: RefObject<HTMLDivElement | null>;
  onSetDue: (due: number | null) => void;
}) {
  const perm = row.permissions.due;
  const label = `Rok za ${row.title}`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const classes = cn(iconButton, "hidden", !hidden && "md:pointer-fine:grid", hoverReveal);
  if (!perm.allowed) return <DisabledAction label={label} reason={perm.reason} className={classes} icon={CalendarClock} />;
  return (
    <DatePicker
      value={row.dueDate}
      now={now}
      onChange={onSetDue}
      open={open}
      onOpenChange={onOpenChange}
      align="end"
      anchor={<span aria-hidden="true" className={rowAnchorClass} />}
      finalFocus={() => {
        if (isShown(triggerRef.current)) return true;
        focusRowTitle(rootRef);
        return false;
      }}
    >
      <button ref={triggerRef} type="button" aria-label={label} title="Rok" className={classes}>
        <CalendarClock className="size-4" aria-hidden="true" />
      </button>
    </DatePicker>
  );
}

/** Meni prioriteta otvoren prečicom `p` — postavlja se uz desnu ivicu reda. */
function PriorityMenu({
  row,
  rootRef,
  onClose,
  onSetPriority,
}: {
  row: TaskRowModel;
  rootRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onSetPriority: (priority: TaskPriorityKey | null) => void;
}) {
  return (
    <DropdownMenu
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      modal={false}
    >
      <DropdownMenuTrigger tabIndex={-1} aria-hidden="true" className={cn(rowAnchorClass, "opacity-0")} />
      <DropdownMenuContent
        align="end"
        className="w-48"
        aria-label={`Prioritet: ${row.title}`}
        finalFocus={() => {
          focusRowTitle(rootRef);
          return false;
        }}
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>Prioritet</DropdownMenuLabel>
          <PriorityItems row={row} onSetPriority={onSetPriority} />
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DueItems({
  row,
  now,
  onSetDue,
  onPickDate,
}: {
  row: TaskRowModel;
  now: number;
  onSetDue: (due: number | null) => void;
  /** „Datum…" otvara birač datuma (kalendar). */
  onPickDate?: () => void;
}) {
  // Petkom/subotom/nedeljom dve prečice mogu biti isti dan: kvačica samo na prvoj.
  const selected = matchDueShortcut(row.dueDate, now);
  return (
    <>
      {DUE_SHORTCUTS.map((shortcut) => {
        const value = dueShortcutValue(shortcut, now);
        return (
          <MenuItem key={shortcut} onClick={() => onSetDue(value)}>
            <span className="flex-1">{DUE_SHORTCUT_LABELS[shortcut]}</span>
            <span className="text-xs tabular-nums text-muted-foreground">{formatDateShort(value)}</span>
            {selected === shortcut ? <Check className="size-3.5" aria-label="izabrano" /> : null}
          </MenuItem>
        );
      })}
      {onPickDate ? (
        <MenuItem onClick={onPickDate}>
          <CalendarDays aria-hidden="true" />
          Datum…
        </MenuItem>
      ) : null}
      {row.dueDate !== null ? (
        <>
          <DropdownMenuSeparator />
          <MenuItem onClick={() => onSetDue(null)}>
            <CalendarX2 aria-hidden="true" />
            Bez roka
          </MenuItem>
        </>
      ) : null}
    </>
  );
}

function PriorityItems({ row, onSetPriority }: { row: TaskRowModel; onSetPriority: (priority: TaskPriorityKey | null) => void }) {
  return (
    <>
      {PRIORITIES.map((priority) => (
        <MenuItem key={priority} onClick={() => onSetPriority(priority)}>
          <span className="flex-1">{PRIORITY_LABELS[priority]}</span>
          {row.priority === priority ? <Check className="size-3.5" aria-label="izabrano" /> : null}
        </MenuItem>
      ))}
      {row.kind === "personal" ? (
        <MenuItem onClick={() => onSetPriority(null)}>
          <span className="flex-1">Bez prioriteta</span>
          {row.priority === null ? <Check className="size-3.5" aria-label="izabrano" /> : null}
        </MenuItem>
      ) : null}
    </>
  );
}

/**
 * Zabranjena stavka menija (E15): `aria-disabled` (ne `disabled`), pa dobija
 * fokus i čitač ekrana pročita razlog ispod nje; izbor ne radi ništa.
 */
function DeniedItem({ icon: Icon, label, perm }: { icon: typeof Flag; label: string; perm: Perm }) {
  return (
    <MenuItem
      aria-disabled="true"
      closeOnClick={false} onClick={(event) => event.preventDefault()}
      className="cursor-not-allowed flex-col items-start gap-0.5 focus:bg-surface-control-hover"
    >
      <span className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-4" aria-hidden="true" />
        {label}
        <Lock className="size-3" aria-hidden="true" />
      </span>
      <span className="pl-6 text-xs leading-4 text-muted-foreground">{perm.reason}</span>
    </MenuItem>
  );
}

function MoreMenu({
  row,
  now,
  actions,
  canOpen,
  movable,
  canJoin,
  onPickDate,
}: {
  row: TaskRowModel;
  now: number;
  actions: TaskRowActions;
  canOpen: boolean;
  movable?: { up: boolean; down: boolean };
  canJoin: boolean;
  onPickDate: () => void;
}) {
  const { status, due, priority } = row.permissions;
  // „Datum…": birač se otvara tek kad se meni zatvori, inače bi ga povratak
  // fokusa na „…" odmah zatvorio.
  const pickDate = useRef(false);
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger aria-label={`Radnje: ${row.title}`} title="Radnje" className={cn(iconButton, hoverReveal)}>
        <MoreHorizontal className="size-4" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-60"
        finalFocus={() => {
          if (!pickDate.current) return true;
          pickDate.current = false;
          onPickDate();
          return false;
        }}
      >
        {canOpen ? (
          <MenuItem onClick={() => actions.onOpen(row)}>
            <ExternalLink aria-hidden="true" />
            Otvori
          </MenuItem>
        ) : null}
        {status.allowed ? (
          <MenuItem onClick={() => actions.onToggleDone(row, !row.done)}>
            {row.done ? <RotateCcw aria-hidden="true" /> : <Check aria-hidden="true" />}
            {row.done ? "Vrati u otvoreno" : "Završi"}
          </MenuItem>
        ) : (
          <DeniedItem icon={Check} label="Završi" perm={status} />
        )}
        <MenuItem onClick={() => actions.onTogglePlan(row)}>
          {row.planned ? <SunDim aria-hidden="true" /> : <Sun aria-hidden="true" />}
          {row.planned ? "Ukloni iz Moj dan" : "Dodaj u Moj dan"}
        </MenuItem>
        {canJoin && actions.onJoin ? (
          <MenuItem onClick={() => actions.onJoin?.(row)}>
            <LogIn aria-hidden="true" />
            Priključi se
          </MenuItem>
        ) : null}
        <DropdownMenuSeparator />
        {actions.onSetStatus && row.kind === "task" ? (
          status.allowed ? (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className={touchItem}>
                <CircleDot aria-hidden="true" />
                Status
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-48">
                <DropdownMenuRadioGroup
                  value={row.status}
                  onValueChange={(value) => actions.onSetStatus?.(row, value as StartupTaskStatus)}
                >
                  {STARTUP_TASK_STATUSES.map((value) => (
                    <DropdownMenuRadioItem key={value} value={value} className={touchItem}>
                      {STATUS_LABELS[value]}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ) : (
            <DeniedItem icon={CircleDot} label="Status" perm={status} />
          )
        ) : null}
        {due.allowed ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className={touchItem}>
              <CalendarClock aria-hidden="true" />
              Rok
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-56">
              <DueItems
                row={row}
                now={now}
                onSetDue={(value) => actions.onSetDue(row, value)}
                onPickDate={() => {
                  pickDate.current = true;
                }}
              />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : (
          <DeniedItem icon={CalendarClock} label="Rok" perm={due} />
        )}
        {priority.allowed ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className={touchItem}>
              <Flag aria-hidden="true" />
              Prioritet
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-48">
              <PriorityItems row={row} onSetPriority={(value) => actions.onSetPriority(row, value)} />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : (
          <DeniedItem icon={Flag} label="Prioritet" perm={priority} />
        )}
        {movable && actions.onMove ? (
          <>
            <DropdownMenuSeparator />
            <MenuItem disabled={!movable.up} onClick={() => actions.onMove?.(row, -1)}>
              <ArrowUp aria-hidden="true" />
              Pomeri gore
              <span className="ml-auto text-xs text-muted-foreground">Alt+↑</span>
            </MenuItem>
            <MenuItem disabled={!movable.down} onClick={() => actions.onMove?.(row, 1)}>
              <ArrowDown aria-hidden="true" />
              Pomeri dole
              <span className="ml-auto text-xs text-muted-foreground">Alt+↓</span>
            </MenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DisabledAction({
  label,
  reason,
  className,
  icon: Icon,
}: {
  label: string;
  reason: string | null;
  className?: string;
  icon: typeof Flag;
}) {
  const reasonId = useId();
  return (
    <Tooltip>
      <TooltipTrigger render={<button type="button"
          aria-disabled="true"
          aria-label={label}
          aria-describedby={reasonId}
          onClick={(event) => event.preventDefault()}
          className={cn(className, "cursor-not-allowed")} />}>
          <span className="relative" aria-hidden="true">
            <Icon className="size-4" />
            <Lock className="absolute -bottom-1 -right-1 size-2.5 rounded-sm bg-card" />
          </span>
        </TooltipTrigger>
      <TooltipContent className="max-w-64">{reason}</TooltipContent>
      <span id={reasonId} className="sr-only">
        {reason}
      </span>
    </Tooltip>
  );
}
