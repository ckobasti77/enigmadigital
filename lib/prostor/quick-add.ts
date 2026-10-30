// Preneto iz Devotion packages/shared/src/quick-add.ts (main @ c05c40f), SPAJANJE S02.
/**
 * Brzi unos (P8, plan K07 §2 i E16) — pravila odredišta, roka i poziva, isto
 * na webu i telefonu. ČISTO: skladište (localStorage / device-prefs) čita
 * klijent, ovde stižu samo vrednosti.
 *
 * - Podrazumevano odredište je **Lično**; zapamćen izbor pobeđuje, a izbor
 *   koji dolazi iz startupa (preset) pobeđuje zapamćen.
 * - Oblast u startupu: preset → poslednja oblast tog startupa → prva oblast.
 * - „Dodaj i u Moj dan" je podrazumevano uključeno kad je rok danas.
 * - Lični zadatak: `personalTasks.create({ addToMyDay })`; startup:
 *   `pages.create({ kind: "task", taskStatus: "backlog", assigneeProfileIds: [ja] })`
 *   pa `myDay.plan` ako je čekirano.
 */
import { dayDiff, type DayKey, DUE_SHORTCUTS, type DueShortcut, dueShortcutValue } from "./dates";
import { cleanNoteText, noteCreatedMessage } from "./notes";
import type { TaskPriorityKey } from "./task-sort";

/** Isto kao `MAX_PERSONAL_TASK_TITLE_LENGTH` i naslov stranice na serveru. */
export const QUICK_ADD_TITLE_MAX = 200;

export const QUICK_ADD_LAST_DESTINATION_KEY = "enigma:quick-add:destination";

/** Ključ skladišta za poslednju oblast po startupu. */
export function lastAreaKey(workspaceId: string): string {
  return `enigma:quick-add:area:${workspaceId}`;
}

export type QuickAddStartup = {
  _id: string;
  name: string;
  areas: ReadonlyArray<{ _id: string; label: string }>;
};

export type QuickAddDestination =
  | { kind: "personal" }
  | { kind: "startup"; workspaceId: string; areaId: string | null };

/** Šta se pamti između otvaranja (bez oblasti — ona se pamti po startupu). */
export type StoredDestination = { kind: "personal" } | { kind: "startup"; workspaceId: string };

export function serializeDestination(destination: QuickAddDestination): string {
  return JSON.stringify(
    destination.kind === "personal"
      ? { kind: "personal" }
      : { kind: "startup", workspaceId: destination.workspaceId },
  );
}

/** Pokvaren ili stran zapis = ništa zapamćeno. */
export function parseStoredDestination(raw: string | null | undefined): StoredDestination | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (value === null || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    if (record.kind === "personal") return { kind: "personal" };
    if (record.kind === "startup" && typeof record.workspaceId === "string" && record.workspaceId) {
      return { kind: "startup", workspaceId: record.workspaceId };
    }
    return null;
  } catch {
    return null;
  }
}

/** Oblast u startupu: zadata → zapamćena → prva; `null` kad startup nema oblasti. */
export function resolveArea(
  workspace: QuickAddStartup,
  remembered: string | null | undefined,
  preferred?: string | null,
): string | null {
  const has = (id: string | null | undefined) =>
    id !== null && id !== undefined && workspace.areas.some((area) => area._id === id);
  if (has(preferred)) return preferred as string;
  if (has(remembered)) return remembered as string;
  return workspace.areas[0]?._id ?? null;
}

/**
 * Početno odredište kad se brzi unos otvori. `preset` (npr. iz startupa u
 * kome si) pobeđuje zapamćen izbor; startup koji više nije u listi pada na
 * Lično.
 */
export function resolveDestination(
  last: StoredDestination | null,
  workspaces: ReadonlyArray<QuickAddStartup>,
  options: {
    preset?: { workspaceId: string; areaId?: string | null } | null;
    rememberedArea?: (workspaceId: string) => string | null;
  } = {},
): QuickAddDestination {
  const pick = (workspaceId: string, preferredArea?: string | null): QuickAddDestination | null => {
    const workspace = workspaces.find((item) => item._id === workspaceId);
    if (!workspace) return null;
    return {
      kind: "startup",
      workspaceId,
      areaId: resolveArea(workspace, options.rememberedArea?.(workspaceId) ?? null, preferredArea),
    };
  };
  if (options.preset) {
    const preset = pick(options.preset.workspaceId, options.preset.areaId);
    if (preset) return preset;
  }
  if (last?.kind === "startup") {
    const remembered = pick(last.workspaceId);
    if (remembered) return remembered;
  }
  return { kind: "personal" };
}

/** „Dodaj i u Moj dan": podrazumevano uključeno kad je rok danas. */
export function defaultAddToMyDay(dueDate: number | null, now: number, zone?: string): boolean {
  return dueDate !== null && dayDiff(dueDate, now, zone) === 0;
}

/** Koji čip roka je izabran (vrednost je lokalno podne tog dana). */
export function matchDueShortcut(
  dueDate: number | null,
  now: number,
  zone?: string,
): DueShortcut | null {
  if (dueDate === null) return null;
  for (const shortcut of DUE_SHORTCUTS) {
    if (dueShortcutValue(shortcut, now, zone) === dueDate) return shortcut;
  }
  return null;
}

export type TitleCheck = { ok: true; title: string } | { ok: false; reason: string | null };

/** Prazan naslov = dugme onemogućeno (bez poruke); predug = poruka. */
export function cleanQuickAddTitle(raw: string): TitleCheck {
  // Naslov je jedan red: prelomi (npr. iz beleške) postaju razmak.
  const title = raw.replace(/\s*\r?\n\s*/gu, " ").trim();
  if (title.length === 0) return { ok: false, reason: null };
  if (title.length > QUICK_ADD_TITLE_MAX) {
    return { ok: false, reason: `Naslov može imati najviše ${QUICK_ADD_TITLE_MAX} znakova.` };
  }
  return { ok: true, title };
}

export type QuickAddDraft = {
  title: string;
  destination: QuickAddDestination;
  dueDate: number | null;
  priority?: TaskPriorityKey | null;
  addToMyDay: boolean;
};

export type QuickAddCall =
  | {
      fn: "personalTasks.create";
      args: {
        title: string;
        dueDate: number | null;
        priority?: TaskPriorityKey | null;
        addToMyDay?: { dayKey: DayKey };
      };
    }
  | {
      fn: "pages.create";
      args: {
        workspaceId: string;
        areaId: string;
        parentPageId: null;
        kind: "task";
        title: string;
        taskStatus: "backlog";
        taskPriority?: TaskPriorityKey;
        assigneeProfileIds: string[];
        dueDate?: number;
      };
      /** Posle pravljenja: `myDay.plan` za `dayKey`. */
      planDayKey: DayKey | null;
    }
  | { fn: "invalid"; reason: string | null };

/** Startup bez oblasti (plan K07 §3). */
export const NO_AREA_REASON = "Ovaj projekat još nema oblasti — dodaj ih u projektu.";

/** Koji poziv pravi zadatak iz nacrta (E16). */
export function quickAddCall(
  draft: QuickAddDraft,
  context: { profileId: string; dayKey: DayKey },
): QuickAddCall {
  const title = cleanQuickAddTitle(draft.title);
  if (!title.ok) return { fn: "invalid", reason: title.reason };
  if (draft.destination.kind === "personal") {
    return {
      fn: "personalTasks.create",
      args: {
        title: title.title,
        dueDate: draft.dueDate,
        ...(draft.priority === undefined ? {} : { priority: draft.priority }),
        ...(draft.addToMyDay ? { addToMyDay: { dayKey: context.dayKey } } : {}),
      },
    };
  }
  if (draft.destination.areaId === null) return { fn: "invalid", reason: NO_AREA_REASON };
  return {
    fn: "pages.create",
    args: {
      workspaceId: draft.destination.workspaceId,
      areaId: draft.destination.areaId,
      parentPageId: null,
      kind: "task",
      title: title.title,
      taskStatus: "backlog",
      ...(draft.priority ? { taskPriority: draft.priority } : {}),
      assigneeProfileIds: [context.profileId],
      ...(draft.dueDate === null ? {} : { dueDate: draft.dueDate }),
    },
    planDayKey: draft.addToMyDay ? context.dayKey : null,
  };
}

/** Toast posle uspeha: „Dodato u Lično." / „Dodato u Cluck Rush · Marketing." */
export function quickAddSuccessMessage(
  destination: QuickAddDestination,
  workspaces: ReadonlyArray<QuickAddStartup>,
): string {
  if (destination.kind === "personal") return "Dodato u Lično.";
  const workspace = workspaces.find((item) => item._id === destination.workspaceId);
  const area = workspace?.areas.find((item) => item._id === destination.areaId);
  const name = workspace?.name ?? "projekat";
  return area ? `Dodato u ${name} · ${area.label}.` : `Dodato u ${name}.`;
}

// --- Beleška u brzom unosu (PROSTOR P7, K18) -------------------------------

/** Vrsta brzog unosa: zadatak (podrazumevano) ili beleška. */
export type QuickAddKind = "task" | "note";

export const QUICK_ADD_KINDS: ReadonlyArray<{ kind: QuickAddKind; label: string }> = [
  { kind: "task", label: "Zadatak" },
  { kind: "note", label: "Beleška" },
];

export type QuickAddNoteDraft = { destination: QuickAddDestination; text: string };

export type QuickAddNoteCall =
  | { fn: "thoughts.createNote"; args: { workspaceId: string | null; text: string } }
  | { fn: "invalid"; reason: string | null };

/**
 * Koji poziv pravi belešku iz nacrta. Oblast se ne traži (beleška nema oblast):
 * odredište je samo Lično ili startup.
 */
export function quickAddNoteCall(draft: QuickAddNoteDraft): QuickAddNoteCall {
  const text = cleanNoteText(draft.text);
  if (!text.ok) return { fn: "invalid", reason: text.reason };
  return {
    fn: "thoughts.createNote",
    args: {
      workspaceId: draft.destination.kind === "personal" ? null : draft.destination.workspaceId,
      text: text.text,
    },
  };
}

/** Poruka posle pravljenja beleške: „Beleška je sačuvana u Lično." / „…u Cluck Rush." */
export function quickAddNoteSuccessMessage(
  destination: QuickAddDestination,
  workspaces: ReadonlyArray<Pick<QuickAddStartup, "_id" | "name">>,
): string {
  if (destination.kind === "personal") return noteCreatedMessage(null);
  const workspace = workspaces.find((item) => item._id === destination.workspaceId);
  return noteCreatedMessage(workspace?.name ?? "projekat");
}
