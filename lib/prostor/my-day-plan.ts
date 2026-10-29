// Preneto iz Devotion packages/shared/src/my-day-plan.ts (main @ c05c40f), SPAJANJE S02.
/**
 * Moj dan — plan dana na klijentu, isto na webu i telefonu (plan K07 E4):
 *
 * - **Optimistička slika** (`withOptimisticUpdate`): klijent odmah pokaže
 *   ishod radnje nad odgovorom `myDay.overview` (rok, prioritet, stavka plana,
 *   redosled, „Preneto od ranije"), a Convex vrati pravo stanje čim server
 *   odgovori. Funkcije čuvaju tip odgovora servera (`as T`: `map` nad
 *   generičkim nizom vraća tip ograničenja, oblik je isti).
 * - **„Isplaniraj dan"** (plan K07 §2): predlozi i „Preneto od ranije" iz
 *   istog `overview`, kroz `planSuggestions` / `carryOverCandidates`.
 *
 * Napisao K10 u web `components/me/{my-day,plan-day}/`; K12 ga je preselio
 * ovde da ga telefon uvozi (web ga re-eksportuje, ponašanje isto). ČISTO.
 */
import { formatDayRelative, noonOfDayKey } from "./dates";
import {
  carryOverCandidates,
  fromOverview,
  type MyDayOverviewLike,
  PLAN_SUGGESTION_LABELS,
  planSuggestions,
  type PlanSuggestionReason,
} from "./my-day";
import type { TaskPriorityKey } from "./task-sort";
import { rowFromMyDay, type WorkspaceMini, type TaskRowModel } from "./task-row";

// --- Optimistička slika -----------------------------------------------------

type EntryLike = { _id: string; position: number };
type OverviewShape = {
  tasks: ReadonlyArray<{ _id: string; dueDate: number | null; taskPriority: TaskPriorityKey | null }>;
  personal: ReadonlyArray<{ _id: string; dueDate: number | null; priority: TaskPriorityKey | null }>;
  entries: ReadonlyArray<EntryLike>;
};

/** Privremeni id optimističke stavke plana (nikad ne ide na server). */
export const OPTIMISTIC_PREFIX = "optimistic:";

export function isOptimisticId(id: string | null): boolean {
  return id !== null && id.startsWith(OPTIMISTIC_PREFIX);
}

/** Izmena roka ili prioriteta jedne stavke. */
export function patchItem<T extends OverviewShape>(
  overview: T,
  target: { kind: "task" | "personal"; id: string },
  patch: { dueDate?: number | null; priority?: TaskPriorityKey | null },
): T {
  if (target.kind === "task") {
    return {
      ...overview,
      tasks: overview.tasks.map((task) =>
        task._id !== target.id
          ? task
          : {
              ...task,
              ...(patch.dueDate === undefined ? {} : { dueDate: patch.dueDate }),
              ...(patch.priority === undefined ? {} : { taskPriority: patch.priority }),
            },
      ),
    } as T;
  }
  return {
    ...overview,
    personal: overview.personal.map((task) =>
      task._id !== target.id
        ? task
        : {
            ...task,
            ...(patch.dueDate === undefined ? {} : { dueDate: patch.dueDate }),
            ...(patch.priority === undefined ? {} : { priority: patch.priority }),
          },
    ),
  } as T;
}

/** Nova stavka plana na kraju dana (pozicija kao `appendPlanEntry`: poslednja + 1024). */
export function withEntry<T extends OverviewShape>(overview: T, entry: T["entries"][number]): T {
  if (overview.entries.some((existing) => existing._id === entry._id)) return overview;
  const last = overview.entries.reduce((max, existing) => Math.max(max, existing.position), 0);
  return { ...overview, entries: [...overview.entries, { ...entry, position: last + 1024 }] } as T;
}

export function withoutEntry<T extends OverviewShape>(overview: T, entryId: string): T {
  return { ...overview, entries: overview.entries.filter((entry) => entry._id !== entryId) } as T;
}

/**
 * Novi redosled zadatih stavki — kao `myDay.reorder`: stavke zadržavaju SKUP
 * pozicija koje već zauzimaju, ostale stoje gde jesu.
 */
export function withEntryOrder<T extends OverviewShape>(overview: T, orderedIds: ReadonlyArray<string>): T {
  const wanted = new Set(orderedIds);
  const positions = overview.entries
    .filter((entry) => wanted.has(entry._id))
    .map((entry) => entry.position)
    .sort((a, b) => a - b);
  const nextPosition = new Map(orderedIds.map((id, index) => [id, positions[index]] as const));
  const entries = overview.entries
    .map((entry) => {
      const position = nextPosition.get(entry._id);
      return position === undefined ? entry : { ...entry, position };
    })
    .sort((a, b) => a.position - b.position);
  return { ...overview, entries } as T;
}

/** Skloni stavke istorije (`clearOld`, `carryOver`); `null` = sve. */
export function withoutHistory<T extends { history: ReadonlyArray<{ refKey: string }> }>(
  overview: T,
  refKeys: ReadonlySet<string> | null,
): T {
  return {
    ...overview,
    history: refKeys === null ? [] : overview.history.filter((entry) => !refKeys.has(entry.refKey)),
  } as T;
}

// --- Isplaniraj dan ---------------------------------------------------------

/** Isto kao `MAX_MY_DAY_ENTRIES` na serveru. */
export const MY_DAY_MAX_ENTRIES = 50;
/** Najviše predloga u dijalogu (plan K07 §2). */
export const PLAN_SUGGESTIONS_LIMIT = 30;

/** Strukturni oblik `myDay.overview` za plan dana (startupi sa logom za čip). */
export type PlanDayOverviewLike = MyDayOverviewLike & { workspaces: ReadonlyArray<WorkspaceMini> };

export type PlanDayCarryRow = { row: TaskRowModel; fromDayKey: string; fromLabel: string };
export type PlanDaySuggestionRow = { row: TaskRowModel; reason: PlanSuggestionReason; reasonLabel: string };

export type PlanDayModel = {
  carryOver: PlanDayCarryRow[];
  suggestions: PlanDaySuggestionRow[];
  /** Stavke plana za danas („U planu: n od 50"). */
  plannedCount: number;
  max: number;
};

export function buildPlanDay(overview: PlanDayOverviewLike, now: number, zone?: string): PlanDayModel {
  const input = fromOverview(overview, now, zone);
  const workspaces = new Map(overview.workspaces.map((workspace) => [workspace._id, workspace] as const));
  const carryOver = carryOverCandidates(input);
  // Stavka iz „Preneto od ranije" se ne nudi dvaput (i kao predlog).
  const carried = new Set(carryOver.map((candidate) => candidate.row.key));
  return {
    carryOver: carryOver.map((candidate) => ({
      row: rowFromMyDay(candidate.row, workspaces),
      fromDayKey: candidate.fromDayKey,
      fromLabel: formatDayRelative(noonOfDayKey(candidate.fromDayKey, zone), now, zone),
    })),
    suggestions: planSuggestions(input, PLAN_SUGGESTIONS_LIMIT + carried.size)
      .filter((suggestion) => !carried.has(suggestion.row.key))
      .slice(0, PLAN_SUGGESTIONS_LIMIT)
      .map((suggestion) => ({
        row: rowFromMyDay(suggestion.row, workspaces),
        reason: suggestion.reason,
        reasonLabel: PLAN_SUGGESTION_LABELS[suggestion.reason],
      })),
    plannedCount: overview.entries.length,
    max: MY_DAY_MAX_ENTRIES,
  };
}

/** Grupe predloga po razlogu, redom kako ih shared vraća. */
export function groupSuggestions(
  suggestions: ReadonlyArray<PlanDaySuggestionRow>,
): Array<{ reason: PlanSuggestionReason; label: string; rows: PlanDaySuggestionRow[] }> {
  const groups: Array<{ reason: PlanSuggestionReason; label: string; rows: PlanDaySuggestionRow[] }> = [];
  for (const suggestion of suggestions) {
    const last = groups.at(-1);
    if (last && last.reason === suggestion.reason) last.rows.push(suggestion);
    else groups.push({ reason: suggestion.reason, label: suggestion.reasonLabel, rows: [suggestion] });
  }
  return groups;
}
