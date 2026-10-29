// Preneto iz Devotion apps/web/components/map/map-card.tsx (main @ c05c40f), SPAJANJE S14.
import type { ReactNode } from "react";
import {
  CalendarDays,
  Layers,
  Lightbulb,
  ListChecks,
  Lock,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";

import { PAGE_KIND_META } from "@/lib/prostor/web/vrste-stranica";
import { BOJA_MAPE_SLOT } from "@/lib/prostor/web/boja-mape";
import { cn } from "@/lib/utils";

import styles from "@/components/app/prostor/mape/map/map-card.module.css";
import {
  MAP_NEST_PROMPT,
  type MapCardContent,
  type MapCardTask,
  type MapTaskTone,
} from "@/lib/prostor/modeli/map-model";

// Crvena je samo greška i kašnjenje: „blokirano" je upozorenje (S09), a „u toku" info.
const TONE_DOT: Record<MapTaskTone, string> = {
  done: "bg-success",
  blocked: "bg-warning",
  progress: "bg-info",
  idle: "bg-text-muted",
};

export type MapCardProps = MapCardContent & {
  selected?: boolean;
  /** Kartica preko koje se trenutno prevlači druga (K07 §7). */
  nestingTarget?: boolean;
  /** Prigušena kartica (embed i dalje može da pošalje stari „duh"). */
  dimmed?: boolean;
  /** Koraci zadatka su prikazani na Mapi (dugme „2/5" je pritisnuto). */
  stepsExpanded?: boolean;
  onToggleSteps?: () => void;
  onVote?: (vote: "up" | "down") => void;
  className?: string;
};

/**
 * Kartica Mape (PROSTOR P15, plan K07 §7): pravougaona, čitljiva na 100 % zuma.
 * Red 1 vrsta (+ zaključano / faza), naslov u dva reda, isečak u tri, a na dnu
 * zadatak (status, rok, koraci) ili glasovi ideje i „ko · kad" sa brojem
 * podstranica. Čista komponenta: bez Convex-a i bez xyflow-a — isti izgled
 * koriste kanvas oblasti i stranice, Mapa ideja, embed za telefon i izlog.
 */
export function MapCard({
  kind,
  kindLabel,
  title,
  snippet,
  byline,
  childCount,
  locked,
  task,
  idea,
  color,
  selected = false,
  nestingTarget = false,
  dimmed = false,
  stepsExpanded = false,
  onToggleSteps,
  onVote,
  className,
}: MapCardProps) {
  const KindIcon = kind === null ? null : kind === "idea" ? Lightbulb : PAGE_KIND_META[kind].icon;

  return (
    <div
      data-map-card
      className={cn(
        "relative flex h-full w-full min-w-0 flex-col overflow-hidden rounded-lg border border-line bg-card p-3 text-left text-card-foreground",
        selected && "ring-2 ring-ring",
        nestingTarget && "border-dashed border-line-strong",
        dimmed && "pointer-events-none border-dashed opacity-60",
        className,
      )}
    >
      {KindIcon || color || kindLabel || idea || locked ? (
      <div className="flex min-w-0 items-center gap-1.5 text-xs leading-5 text-muted-foreground">
        {KindIcon ? <KindIcon className="size-3.5 shrink-0" aria-hidden="true" /> : null}
        {color ? (
          <span
            className={styles.dot}
            data-cat={BOJA_MAPE_SLOT[color] ?? undefined}
            aria-hidden="true"
          />
        ) : null}
        <span className="min-w-0 truncate">{kindLabel}</span>
        {idea ? (
          <span className="ml-auto shrink-0 rounded-md border border-line px-1.5 text-xs leading-[1.125rem] text-foreground">
            {idea.stageLabel}
          </span>
        ) : null}
        {locked ? (
          <Lock
            className={cn("size-3.5 shrink-0", !idea && "ml-auto")}
            role="img"
            aria-label="Zaključano"
          />
        ) : null}
      </div>
      ) : null}

      <p className="mt-1 line-clamp-2 first:mt-0 text-copy font-semibold leading-5 tracking-[-0.01em] text-foreground">
        {title}
      </p>

      {snippet ? (
        <p className="mt-1 line-clamp-3 min-h-0 text-xs leading-4 text-muted-foreground">
          {snippet}
        </p>
      ) : null}

      <div className="mt-auto flex min-w-0 flex-col gap-1 pt-2">
        {task ? (
          <MapTaskLine
            task={task}
            title={title}
            expanded={stepsExpanded}
            onToggleSteps={onToggleSteps}
          />
        ) : null}

        {idea ? (
          <div className="flex items-center gap-1 text-xs leading-5">
            <Vote
              direction="up"
              count={idea.up}
              mine={idea.myVote === "up"}
              onVote={onVote}
            />
            <Vote
              direction="down"
              count={idea.down}
              mine={idea.myVote === "down"}
              onVote={onVote}
            />
          </div>
        ) : null}

        {byline || childCount ? (
          <div className="flex min-w-0 items-center gap-2 text-xs leading-5 text-muted-foreground">
            {byline ? <span className="min-w-0 truncate">{byline}</span> : null}
            {childCount ? (
              <span className="ml-auto inline-flex shrink-0 items-center gap-1 tabular-nums">
                <Layers className="size-3.5" aria-hidden="true" />
                <span aria-hidden="true">{childCount}</span>
                <span className="sr-only">Podstranice: {childCount}</span>
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {nestingTarget ? (
        <div
          className="pointer-events-none absolute inset-x-2 top-2 rounded-md border border-line-strong bg-surface-raised px-2 py-1 text-center text-xs font-medium text-foreground shadow-elev-1"
          role="status"
          aria-live="polite"
        >
          {MAP_NEST_PROMPT}
        </div>
      ) : null}
    </div>
  );
}

/** Red zadatka: status, rok i koraci (kartica Mape i fioka Pregled). */
export function MapTaskLine({
  task,
  title,
  expanded = false,
  onToggleSteps,
}: {
  task: MapCardTask;
  title: string;
  expanded?: boolean;
  onToggleSteps?: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs leading-5">
      <span className="inline-flex items-center gap-1.5 text-foreground">
        <span className={cn("size-1.5 rounded-full", TONE_DOT[task.statusTone])} aria-hidden="true" />
        {task.statusLabel}
      </span>
      {task.due ? (
        <span
          className={cn(
            "inline-flex items-center gap-1 tabular-nums",
            task.due.overdue ? "text-danger" : "text-muted-foreground",
          )}
        >
          <CalendarDays className="size-3.5" aria-hidden="true" />
          <span aria-hidden="true">{task.due.label}</span>
          <span className="sr-only">{task.due.ariaLabel}</span>
        </span>
      ) : null}
      {task.steps ? (
        <StepsCount
          done={task.steps.done}
          total={task.steps.total}
          title={title}
          expanded={expanded}
          onToggle={onToggleSteps}
        />
      ) : null}
    </div>
  );
}

function StepsCount({
  done,
  total,
  title,
  expanded,
  onToggle,
}: {
  done: number;
  total: number;
  title: string;
  expanded: boolean;
  onToggle?: () => void;
}) {
  const content = (
    <>
      <ListChecks className="size-3.5" aria-hidden="true" />
      {done}/{total}
    </>
  );
  if (!onToggle) {
    return (
      <span className="inline-flex items-center gap-1 tabular-nums text-muted-foreground">
        <span aria-hidden="true" className="inline-flex items-center gap-1">{content}</span>
        <span className="sr-only">Koraci: {done} od {total}</span>
      </span>
    );
  }
  return (
    <button
      type="button"
      className={cn(
        "nodrag nopan inline-flex min-h-6 items-center gap-1 rounded-md px-1 tabular-nums transition-colors hover:bg-surface-control-hover focus-visible:outline-2 focus-visible:outline-ring",
        expanded ? "bg-surface-control-hover text-foreground" : "text-muted-foreground",
      )}
      aria-expanded={expanded}
      aria-label={`${expanded ? "Sakrij" : "Prikaži"} korake na mapi za ${title}: ${done} od ${total}`}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      {content}
    </button>
  );
}

function Vote({
  direction,
  count,
  mine,
  onVote,
}: {
  direction: "up" | "down";
  count: number;
  mine: boolean;
  onVote?: (vote: "up" | "down") => void;
}) {
  const Icon = direction === "up" ? ThumbsUp : ThumbsDown;
  const label = `${direction === "up" ? "Za" : "Protiv"}: ${count}`;
  if (!onVote) {
    return (
      <span className="inline-flex items-center gap-1 px-1 tabular-nums text-muted-foreground">
        <Icon className="size-3.5" aria-hidden="true" />
        <span aria-hidden="true">{count}</span>
        <span className="sr-only">{label}</span>
      </span>
    );
  }
  return (
    <button
      type="button"
      className={cn(
        "nodrag nopan inline-flex min-h-7 items-center gap-1 rounded-md px-1.5 tabular-nums transition-colors hover:bg-surface-control-hover focus-visible:outline-2 focus-visible:outline-ring",
        mine ? "bg-surface-control-hover font-medium text-foreground" : "text-muted-foreground",
      )}
      aria-pressed={mine}
      aria-label={`Glasaj ${direction === "up" ? "za" : "protiv"}. Trenutno ${count}`}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onVote(direction);
      }}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {count}
    </button>
  );
}

/**
 * Korak zadatka na Mapi (K07 §7): ostaje na orbitalnoj POZICIJI oko zadatka
 * (`task-checkpoint-layout.ts`, koristi je i embed), ali je izgled mala
 * pravougaona pilula. `toggle` je kvačica koju daje čvor (radnja traži Convex).
 */
export function MapStepPill({
  eyebrow,
  text,
  completed = false,
  selected = false,
  toggle,
  children,
  className,
}: {
  eyebrow: string;
  text: string;
  completed?: boolean;
  selected?: boolean;
  toggle?: ReactNode;
  /** Sadržaj umesto teksta (npr. polje za izmenu). */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-map-step
      className={cn(
        "relative flex h-full w-full min-w-0 items-start gap-2 overflow-hidden rounded-md border border-line bg-card px-2.5 py-2 text-left text-card-foreground",
        selected && "ring-2 ring-ring",
        className,
      )}
    >
      {toggle}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs leading-4 text-muted-foreground">{eyebrow}</p>
        {children ?? (
          <p
            className={cn(
              "line-clamp-3 text-xs font-medium leading-4",
              completed ? "text-muted-foreground line-through decoration-text-muted" : "text-foreground",
            )}
          >
            {text}
          </p>
        )}
      </div>
    </div>
  );
}
