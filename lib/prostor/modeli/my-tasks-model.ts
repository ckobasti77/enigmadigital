// Preneto iz Devotion apps/web/components/me/tasks/my-tasks-model.ts (main @ c05c40f), SPAJANJE S16.
/**
 * Moji zadaci (K11, plan K07 §1.3) — web ulaz u model prikaza. Čista logika
 * (redovi, filteri → grupe, zadržavanje, optimistička slika) je od K13 u
 * `@devotion/shared` (`my-tasks.ts`), da je telefon uvozi (E4); ovde ostaju
 * ista imena i samo ono što važi samo za web.
 */
export {
  buildMyTasks,
  buildTaskRows,
  enterKey,
  findRow,
  locateTaskRow,
  patchPersonalItems,
  patchTaskItems,
  PERSONAL_TASKS_LIMIT,
  plannedKeysOf,
  taskHoldSection,
  TASKS_EVERYWHERE_LIMIT,
  TASKS_GROUP_PAGE,
  type MyTasksGroup,
  type MyTasksModel,
  type MyTasksSource,
  type TaskRowHold,
} from "..";

/** Iznad ovoliko redova nema Flip-a, samo neprozirnost (plan K07 E12). */
export const TASKS_FLIP_MAX_ROWS = 80;
