// Preneto iz Devotion packages/shared/src/task-create.ts (main @ c05c40f), SPAJANJE S02.
/**
 * Brzo pravljenje zadatka u startupu (K17, plan K07 §2: „Nova stranica →
 * Zadatak") — podrazumevane vrednosti čipova i poziv, isto na webu i telefonu.
 * ČISTO: skladište (poslednja oblast) čita klijent, ovde stižu vrednosti.
 *
 * - Naslov je prvi, Enter pravi zadatak.
 * - Status „Neplanirano", prioritet „Srednji", bez roka, izvršilac = ja.
 * - Oblast: zadata (gde praviš) → poslednja u tom startupu → prva.
 * - Instrukcije i koraci su iza „Više opcija" i ne šalju se kad su prazni.
 */
import { resolveArea } from "./quick-add";
import type { StartupTaskStatus } from "./startup-tasks";
import type { TaskPriorityKey } from "./task-sort";

/** Isto kao `MAX_TASK_ASSIGNEES` na serveru. */
export const TASK_CREATE_MAX_ASSIGNEES = 10;
/** Isto kao `MAX_TASK_INSTRUCTIONS_LENGTH` na serveru. */
export const TASK_CREATE_INSTRUCTIONS_MAX = 20_000;

export const TASK_CREATE_DEFAULT_STATUS: StartupTaskStatus = "backlog";
export const TASK_CREATE_DEFAULT_PRIORITY: TaskPriorityKey = "medium";

export type TaskCreateCheckpoint = { id: string; text: string; completed: boolean };

export type TaskCreateDraft = {
  status: StartupTaskStatus;
  priority: TaskPriorityKey;
  /** Lokalno podne dana roka ili `null`. */
  dueDate: number | null;
  assigneeProfileIds: string[];
  /** `null` kad startup nema oblasti. */
  areaId: string | null;
  instructions: string;
  checkpoints: TaskCreateCheckpoint[];
};

/** Početne vrednosti čipova kad se otvori „Nova stranica → Zadatak". */
export function defaultTaskDraft(input: {
  profileId: string;
  areas: ReadonlyArray<{ _id: string; label: string }>;
  /** Oblast mesta gde praviš (oblast, stranica, komandni centar sa filterom). */
  presetAreaId?: string | null;
  /** Poslednja oblast u ovom startupu (isti ključ kao brzi unos). */
  rememberedAreaId?: string | null;
}): TaskCreateDraft {
  return {
    status: TASK_CREATE_DEFAULT_STATUS,
    priority: TASK_CREATE_DEFAULT_PRIORITY,
    dueDate: null,
    assigneeProfileIds: [input.profileId],
    areaId: resolveArea(
      { _id: "", name: "", areas: input.areas },
      input.rememberedAreaId ?? null,
      input.presetAreaId ?? null,
    ),
    instructions: "",
    checkpoints: [],
  };
}

/** Koliko polja iza „Više opcija" je popunjeno (broj uz dugme kad je skupljeno). */
export function taskCreateExtrasCount(draft: Pick<TaskCreateDraft, "instructions" | "checkpoints">): number {
  return (draft.instructions.trim() ? 1 : 0) + (draft.checkpoints.length > 0 ? 1 : 0);
}

/** Uključi/isključi izvršioca; granica od 10 ne pušta novog (server bi odbio). */
export function toggleTaskAssignee(ids: ReadonlyArray<string>, profileId: string): string[] {
  if (ids.includes(profileId)) return ids.filter((id) => id !== profileId);
  if (ids.length >= TASK_CREATE_MAX_ASSIGNEES) return [...ids];
  return [...ids, profileId];
}

/**
 * Tekst čipa izvršilaca: „Niko", „Ja", „Ja + 2", „Ana Ilić", „Ana Ilić + 1".
 * Ja sam uvek prvi kad sam izabran; nepoznat član se broji, ali bez imena.
 */
export function assigneesChipValue(
  ids: ReadonlyArray<string>,
  profileId: string,
  names: ReadonlyMap<string, string>,
): string {
  if (ids.length === 0) return "Niko";
  const includesMe = ids.includes(profileId);
  const first = includesMe ? "Ja" : (names.get(ids[0]) ?? "1 član");
  const rest = ids.length - 1;
  return rest > 0 ? `${first} + ${rest}` : first;
}

export type TaskCreateFields = {
  taskStatus: StartupTaskStatus;
  taskPriority: TaskPriorityKey;
  assigneeProfileIds?: string[];
  dueDate?: number;
  instructions?: string;
  checkpoints?: TaskCreateCheckpoint[];
};

/**
 * Polja zadatka za `areasV2.createPage` (kao do sada: prazno se ne šalje).
 * Prazni koraci se izbacuju, instrukcije se seku na granicu servera.
 */
export function taskCreateFields(draft: TaskCreateDraft): TaskCreateFields {
  const instructions = draft.instructions.trim().slice(0, TASK_CREATE_INSTRUCTIONS_MAX);
  const checkpoints = draft.checkpoints
    .map((item) => ({ ...item, text: item.text.trim() }))
    .filter((item) => item.text.length > 0);
  return {
    taskStatus: draft.status,
    taskPriority: draft.priority,
    ...(draft.assigneeProfileIds.length === 0 ? {} : { assigneeProfileIds: [...draft.assigneeProfileIds] }),
    ...(draft.dueDate === null ? {} : { dueDate: draft.dueDate }),
    ...(instructions ? { instructions } : {}),
    ...(checkpoints.length > 0 ? { checkpoints } : {}),
  };
}
