// Preneto iz Devotion apps/web/components/me/my-day/my-day-model.ts (main @ c05c40f), SPAJANJE S19.
/**
 * Moj dan — od odgovora `myDay.overview` do sekcija za prikaz. ČISTO (vitest).
 * Grupisanje je iz `@devotion/shared` (isto na telefonu, P5), a red je
 * zajednički `TaskRowModel` (shared `task-row.ts`, plan K07 §1).
 */
import {
  applyCompletionHolds,
  type CompletionHold,
  countOpenByStartup,
  fromOverview,
  groupMyDay,
  groupMyDayByStartup,
  type MyDayGrouping,
  type MyDayOverviewLike,
  type MyDaySectionId,
  rowFromMyDay,
  type TaskRowModel,
  type WorkspaceMini,
} from "..";

export type OverviewStartup = WorkspaceMini;

/** Strukturni oblik `api.myDay.overview` koji ovaj prikaz koristi. */
export type MyDayOverviewData = MyDayOverviewLike & {
  workspaces: ReadonlyArray<OverviewStartup>;
  capped: { tasks: boolean; personal: boolean; history: boolean };
};

export type MyDaySectionModel = {
  id: MyDaySectionId;
  title: string;
  collapsedByDefault: boolean;
  rows: TaskRowModel[];
};

export type MyDayStartupGroupModel = {
  /** „personal" ili id startupa. */
  key: string;
  workspace: OverviewStartup | null;
  title: string;
  rows: TaskRowModel[];
};

export type MyDayModel = {
  sections: MyDaySectionModel[];
  /** Isti skup stavki „po startupu": Lično prvo, pa startupi redom iz `overview.startups`. */
  byStartup: { groups: MyDayStartupGroupModel[]; doneToday: TaskRowModel[] };
  progress: MyDayGrouping["progress"];
  counts: MyDayGrouping["counts"];
  /** Neki izvor u `overview` je odsečen — prikaz je deo zadataka. */
  capped: boolean;
  /** Ukupno redova na ekranu (granica za Flip, plan K07 E12). */
  rowCount: number;
};

export type MyDayGroupMode = "time" | "startup";

/** Ključ lokalnog skladišta za prekidač „po vremenu / po projektu" (plan K07 §1.2). */
export const GROUP_MODE_STORAGE_KEY = "enigma:danas:grupisanje";

export function parseGroupMode(raw: string | null | undefined): MyDayGroupMode {
  return raw === "startup" ? "startup" : "time";
}

/** Iznad ovoliko redova nema Flip-a, samo neprozirnost (plan K07 E12). */
export const FLIP_MAX_ROWS = 80;

export function buildMyDay(overview: MyDayOverviewData, now: number, zone?: string): MyDayModel {
  const input = fromOverview(overview, now, zone);
  const grouping = groupMyDay(input);
  const workspaces = new Map(overview.workspaces.map((workspace) => [workspace._id, workspace] as const));
  const toRow = (row: Parameters<typeof rowFromMyDay>[0]) => rowFromMyDay(row, workspaces);
  const sections = grouping.sections.map((section) => ({
    id: section.id,
    title: section.title,
    collapsedByDefault: section.collapsedByDefault,
    rows: section.rows.map(toRow),
  }));
  const byStartup = groupMyDayByStartup(
    input,
    overview.workspaces.map((workspace) => workspace._id),
  );
  return {
    sections,
    byStartup: {
      groups: byStartup.groups.map((group) => ({
        key: group.workspaceId ?? "personal",
        workspace: group.workspaceId === null ? null : (workspaces.get(group.workspaceId) ?? null),
        title: group.title,
        rows: group.rows.map(toRow),
      })),
      doneToday: byStartup.doneToday.map(toRow),
    },
    progress: grouping.progress,
    counts: grouping.counts,
    capped: overview.capped.tasks || overview.capped.personal,
    rowCount: sections.reduce((sum, section) => sum + section.rows.length, 0),
  };
}

/** Broj u meniju „Ja" uz Moj dan: otvoreno za danas (prekoračeno + danas + planirano). */
export function openTodayCount(counts: Record<MyDaySectionId, number>): number {
  return counts.overdue + counts.today + counts.planned;
}

/** Moji otvoreni dodeljeni zadaci po startupu (meni „Ja", plan K01 D13). */
export function openByStartup(overview: MyDayOverviewData, now: number, zone?: string): Record<string, number> {
  return countOpenByStartup(fromOverview(overview, now, zone).items);
}

/** „2 kasni, 3 za danas." — sažetak ispod pozdrava; delovi sa nulom se izostavljaju. */
export function daySummary(counts: Record<MyDaySectionId, number>): string {
  const parts: string[] = [];
  if (counts.overdue > 0) parts.push(`${counts.overdue} kasni`);
  if (counts.today > 0) parts.push(`${counts.today} za danas`);
  return parts.length === 0 ? "Ništa ne gori." : `${parts.join(", ")}.`;
}

/** Ime za pozdrav: prva reč imena za prikaz. */
export function firstNameOf(displayName: string): string | null {
  const first = displayName.trim().split(/\s+/)[0];
  return first ? first : null;
}

/** „3 od 7 završeno" / „Dan je završen." — vrednost prstena za čitač ekrana. */
export function progressValueText(progress: { done: number; total: number }): string {
  if (progress.total > 0 && progress.done >= progress.total) return "Dan je završen.";
  return `${progress.done} od ${progress.total} završeno`;
}

/** Id-jevi stavki plana redom kako se vide u „Planirano" (za `myDay.reorder`). */
export function plannedOrder(model: MyDayModel): string[] {
  const planned = model.sections.find((section) => section.id === "planned");
  return (planned?.rows ?? [])
    .map((row) => row.planEntryId)
    .filter((id): id is string => id !== null);
}

// --- Optimistička slika (`withOptimisticUpdate`) -----------------------------
// Klijent odmah pokaže ishod (pa Flip ima šta da animira), a Convex vrati
// pravo stanje čim server odgovori. Pravila su od K12 u `@devotion/shared`
// (`my-day-plan.ts`), da ih telefon deli; ovde ostaju isti izvozi.

export {
  isOptimisticId,
  OPTIMISTIC_PREFIX,
  patchItem,
  withEntry,
  withEntryOrder,
  withoutEntry,
  withoutHistory,
} from "..";

// --- Zadržavanje reda posle kvačice (E7) u oba prikaza -----------------------

/** Zadržan red: `section` je `time:<sekcija>` ili `startup:<ključ grupe>`. */
export type RowHold = CompletionHold<TaskRowModel>;

export function holdSectionKey(mode: MyDayGroupMode, id: string): string {
  return `${mode}:${id}`;
}

/** Gde je red sada (za zadržavanje na istom mestu). */
export function locateRow(
  model: MyDayModel,
  mode: MyDayGroupMode,
  key: string,
): { section: string; index: number } | null {
  const lists =
    mode === "time"
      ? model.sections.map((section) => ({ id: section.id as string, rows: section.rows }))
      : [
          ...model.byStartup.groups.map((group) => ({ id: group.key, rows: group.rows })),
          { id: "doneToday", rows: model.byStartup.doneToday },
        ];
  for (const list of lists) {
    const index = list.rows.findIndex((row) => row.key === key);
    if (index !== -1) return { section: holdSectionKey(mode, list.id), index };
  }
  return null;
}

/**
 * Primeni zadržane redove i stanje „čeka potvrdu" na oba prikaza. Zadržan red
 * važi samo u prikazu u kome je kliknut (u drugom ga vode podaci).
 */
export function applyHolds(
  model: MyDayModel,
  holds: ReadonlyMap<string, RowHold>,
  pending: ReadonlyMap<string, boolean>,
): MyDayModel {
  if (holds.size === 0 && pending.size === 0) return model;
  const holdsFor = (mode: MyDayGroupMode) =>
    new Map([...holds].filter(([, hold]) => hold.section.startsWith(`${mode}:`)));

  const prefix = (mode: MyDayGroupMode) => `${mode}:`.length;
  const sections = applyCompletionHolds(
    model.sections.map((section) => ({ ...section, id: holdSectionKey("time", section.id) })),
    holdsFor("time"),
    pending,
  ).map((section) => ({ ...section, id: section.id.slice(prefix("time")) as MyDaySectionId }));

  const startupLists = applyCompletionHolds(
    [
      ...model.byStartup.groups.map((group) => ({ id: holdSectionKey("startup", group.key), rows: group.rows })),
      { id: holdSectionKey("startup", "doneToday"), rows: model.byStartup.doneToday },
    ],
    holdsFor("startup"),
    pending,
  );
  const rowsOf = (id: string) =>
    startupLists.find((list) => list.id === holdSectionKey("startup", id))?.rows ?? [];

  return {
    ...model,
    sections,
    byStartup: {
      groups: model.byStartup.groups.map((group) => ({ ...group, rows: rowsOf(group.key) })),
      doneToday: rowsOf("doneToday"),
    },
  };
}
