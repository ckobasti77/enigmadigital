// Preneto iz Devotion apps/web/lib/shortcuts/task-list.ts (main @ c05c40f), SPAJANJE S08.
/**
 * Prečice liste zadataka — ČIST deo (vitest): mapiranje prečica na radnje i
 * kretanje kroz redove. Kuka `useTaskListShortcuts` ga koristi.
 */
import { DATE_PICKER_HELP, TASK_LIST_SHORTCUTS, type ShortcutDef } from "./registar";

export type TaskListAction = "next" | "prev" | "complete" | "open" | "due" | "priority" | "plan" | "search";

const ACTION_BY_ID: Record<string, TaskListAction> = {
  [TASK_LIST_SHORTCUTS.next.id]: "next",
  [TASK_LIST_SHORTCUTS.nextArrow.id]: "next",
  [TASK_LIST_SHORTCUTS.prev.id]: "prev",
  [TASK_LIST_SHORTCUTS.prevArrow.id]: "prev",
  [TASK_LIST_SHORTCUTS.complete.id]: "complete",
  [TASK_LIST_SHORTCUTS.open.id]: "open",
  [TASK_LIST_SHORTCUTS.due.id]: "due",
  [TASK_LIST_SHORTCUTS.priority.id]: "priority",
  [TASK_LIST_SHORTCUTS.plan.id]: "plan",
  [TASK_LIST_SHORTCUTS.search.id]: "search",
};

/** Id prečice → radnja liste (`null` za tuđu prečicu). */
export function taskListAction(id: string): TaskListAction | null {
  return ACTION_BY_ID[id] ?? null;
}

/** Alt+↑/↓ u „Planirano" (Moj dan) obrađuje sam red (K10) — ovde je samo za pomoć. */
export const PLAN_REORDER_HELP: ShortcutDef = {
  id: "list-reorder",
  key: "ArrowUp",
  label: "Pomeri u planu (Planirano)",
  group: "Liste zadataka",
  displayOnly: true,
  helpKeys: [
    ["Alt", "↑"],
    ["Alt", "↓"],
  ],
};

/**
 * Definicije za registar; `/` samo gde postoji pretraga (Moji zadaci),
 * Alt+↑/↓ samo gde postoji redosled plana (Moj dan).
 */
export function taskListShortcutDefs({ search, reorder = false }: { search: boolean; reorder?: boolean }): ShortcutDef[] {
  const { search: searchDef, ...rest } = TASK_LIST_SHORTCUTS;
  return [
    ...Object.values(rest),
    ...(search ? [searchDef] : []),
    ...(reorder ? [PLAN_REORDER_HELP] : []),
    ...DATE_PICKER_HELP,
  ];
}

/**
 * Sledeći/prethodni red. Bez izbora: dole → prvi, gore → poslednji. Na
 * krajevima ostaje (bez kruženja). Izbor koji više nije u listi kreće ispočetka.
 */
export function nextRowKey(keys: ReadonlyArray<string>, current: string | null, direction: 1 | -1): string | null {
  if (keys.length === 0) return null;
  const index = current === null ? -1 : keys.indexOf(current);
  if (index === -1) return direction === 1 ? keys[0] : keys[keys.length - 1];
  const next = Math.min(Math.max(index + direction, 0), keys.length - 1);
  return keys[next];
}

export type RowRequest = { key: string; kind: "due" | "priority"; nonce: number };
