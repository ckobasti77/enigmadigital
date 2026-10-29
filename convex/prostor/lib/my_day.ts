// Preneto iz Devotion packages/backend/convex/lib/my_day.ts (main @ c05c40f), SPAJANJE S04.
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { clanstvoProfila } from "./auth";
import { requireVisiblePage } from "./pages";
import {
  MAX_MY_DAY_ENTRIES,
  MAX_OPEN_PERSONAL_TASKS,
  MY_DAY_POSITION_STEP,
} from "./validators";

type ReadCtx = QueryCtx | MutationCtx;

export type MyDayRef =
  | { kind: "task"; taskPageId: Id<"pages"> }
  | { kind: "personal"; personalTaskId: Id<"personalTasks"> };

const PERSONAL_TASK_NOT_FOUND = "Lični zadatak nije pronađen.";
const TASK_NOT_FOUND = "Zadatak nije pronađen.";

/** "task:<id>" | "personal:<id>" — isto kao shared `myDayRefKey`. */
export function refKeyOf(ref: MyDayRef) {
  return ref.kind === "task"
    ? `task:${ref.taskPageId}`
    : `personal:${ref.personalTaskId}`;
}

/**
 * Ključ sa klijenta → referenca. `null` za sve što nije ispravan id tabele,
 * pa nepostojeći ili izmišljen ključ nikad ne pogodi tuđi red.
 */
export function parseRefKey(ctx: ReadCtx, refKey: string): MyDayRef | null {
  if (refKey.length > 128) return null;
  const separator = refKey.indexOf(":");
  if (separator < 0) return null;
  const kind = refKey.slice(0, separator);
  const raw = refKey.slice(separator + 1);
  if (kind === "task") {
    const taskPageId = ctx.db.normalizeId("pages", raw);
    return taskPageId === null ? null : { kind: "task", taskPageId };
  }
  if (kind === "personal") {
    const personalTaskId = ctx.db.normalizeId("personalTasks", raw);
    return personalTaskId === null ? null : { kind: "personal", personalTaskId };
  }
  return null;
}

export function refOfEntry(entry: Doc<"myDayEntries">): MyDayRef {
  if (entry.refKind === "task" && entry.taskPageId !== null) {
    return { kind: "task", taskPageId: entry.taskPageId };
  }
  if (entry.refKind === "personal" && entry.personalTaskId !== null) {
    return { kind: "personal", personalTaskId: entry.personalTaskId };
  }
  throw new Error("Stavka plana nije ispravna.");
}

/**
 * Lični zadatak koji pripada pozivaocu. Nepostojeći, tuđ i (osim kad je
 * `allowArchived`) arhiviran zadatak daju ISTU grešku, da tuđ id ne otkrije
 * ništa o sebi.
 */
export async function requireOwnedPersonalTask(
  ctx: ReadCtx,
  personalTaskId: Id<"personalTasks">,
  profileId: Id<"profiles">,
  options: { allowArchived?: boolean } = {},
) {
  const task = await ctx.db.get("personalTasks", personalTaskId);
  if (
    task === null ||
    task.profileId !== profileId ||
    (task.archivedAt !== null && options.allowArchived !== true)
  ) {
    throw new Error(PERSONAL_TASK_NOT_FOUND);
  }
  return task;
}

export async function getOwnedPersonalTask(
  ctx: ReadCtx,
  personalTaskId: Id<"personalTasks">,
  profileId: Id<"profiles">,
) {
  const task = await ctx.db.get("personalTasks", personalTaskId);
  if (task === null || task.profileId !== profileId || task.archivedAt !== null) {
    return null;
  }
  return task;
}

/** Granica otvorenih ličnih zadataka, pre upisa koji dodaje otvoren zadatak. */
export async function assertOpenPersonalTaskRoom(
  ctx: ReadCtx,
  profileId: Id<"profiles">,
) {
  const open = await ctx.db
    .query("personalTasks")
    .withIndex("by_profile_status_archived_sort", (q) =>
      q.eq("profileId", profileId).eq("status", "open").eq("archivedAt", null),
    )
    .take(MAX_OPEN_PERSONAL_TASKS);
  if (open.length >= MAX_OPEN_PERSONAL_TASKS) {
    throw new Error(
      `Možeš imati najviše ${MAX_OPEN_PERSONAL_TASKS} otvorenih ličnih zadataka.`,
    );
  }
}

/**
 * Startup zadatak koji pozivalac sme da stavi u plan: vidljiva stranica vrste
 * `task` u aktivnom startupu u kome je aktivan član. Svaki neuspeh daje istu
 * grešku — zadatak iz tuđeg startupa se ponaša kao nepostojeći.
 */
export async function getPlannableTask(
  ctx: ReadCtx,
  taskPageId: Id<"pages">,
  profileId: Id<"profiles">,
) {
  let page: Doc<"pages">;
  try {
    page = await requireVisiblePage(ctx, taskPageId);
  } catch {
    return null;
  }
  if (page.kind !== "task") return null;
  const workspace = await ctx.db.get("workspaces", page.workspaceId);
  if (workspace === null || workspace.arhiviran === true) return null;
  // Članstvo kroz adapter: `owner`/`urednik`, bez `.unique()` (O5, D20).
  const membership = await clanstvoProfila(ctx, page.workspaceId, profileId);
  if (membership === null) return null;
  return page;
}

export async function requirePlannableTask(
  ctx: ReadCtx,
  taskPageId: Id<"pages">,
  profileId: Id<"profiles">,
) {
  const page = await getPlannableTask(ctx, taskPageId, profileId);
  if (page === null) throw new Error(TASK_NOT_FOUND);
  return page;
}

/** Stavka plana za taj ref i dan, ako postoji. */
export async function findPlanEntry(
  ctx: ReadCtx,
  profileId: Id<"profiles">,
  refKey: string,
  dayKey: string,
) {
  return await ctx.db
    .query("myDayEntries")
    .withIndex("by_profile_ref", (q) =>
      q.eq("profileId", profileId).eq("refKey", refKey).eq("dayKey", dayKey),
    )
    .unique();
}

/**
 * Dodaje ref u plan dana; idempotentno — ako je ref već u planu tog dana,
 * vraća postojeću stavku (`created: false`). Pozivalac je već proverio da je
 * cilj dostupan. Nova stavka ide na kraj, osim kad je zadata `position`.
 */
export async function appendPlanEntry(
  ctx: MutationCtx,
  args: {
    profileId: Id<"profiles">;
    dayKey: string;
    ref: MyDayRef;
    position?: number;
    now: number;
  },
) {
  const refKey = refKeyOf(args.ref);
  const existing = await findPlanEntry(ctx, args.profileId, refKey, args.dayKey);
  if (existing !== null) return { entryId: existing._id, created: false };

  if (args.position !== undefined && !Number.isFinite(args.position)) {
    throw new Error("Pozicija stavke plana nije ispravna.");
  }
  const day = await ctx.db
    .query("myDayEntries")
    .withIndex("by_profile_day_position", (q) =>
      q.eq("profileId", args.profileId).eq("dayKey", args.dayKey),
    )
    .take(MAX_MY_DAY_ENTRIES);
  if (day.length >= MAX_MY_DAY_ENTRIES) {
    throw new Error(`Moj dan može imati najviše ${MAX_MY_DAY_ENTRIES} stavki.`);
  }
  const last = day.at(-1);
  const position =
    args.position ??
    (last === undefined ? MY_DAY_POSITION_STEP : last.position + MY_DAY_POSITION_STEP);
  const entryId = await ctx.db.insert("myDayEntries", {
    profileId: args.profileId,
    dayKey: args.dayKey,
    refKind: args.ref.kind,
    taskPageId: args.ref.kind === "task" ? args.ref.taskPageId : null,
    personalTaskId: args.ref.kind === "personal" ? args.ref.personalTaskId : null,
    refKey,
    position,
    createdAt: args.now,
  });
  return { entryId, created: true };
}
