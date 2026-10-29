// Preneto iz Devotion packages/backend/convex/personalTasks.ts (main @ c05c40f), SPAJANJE S04.
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { requireProfile, requireClanProjekta } from "./lib/auth";
import { assertDayKey } from "./lib/day_key";
import {
  appendPlanEntry,
  assertOpenPersonalTaskRoom,
  getOwnedPersonalTask,
  refKeyOf,
  requireOwnedPersonalTask,
} from "./lib/my_day";
import { personalTaskSortAt, toPersonalTaskItem } from "./lib/my_scope";
import {
  insertWorkspacePage,
  prepareWorkspacePage,
  validateWorkspacePageTarget,
} from "./lib/page_creation";
import {
  boundedLimit,
  cleanOptionalText,
  cleanRequiredText,
  MAX_PERSONAL_TASK_NOTES_LENGTH,
  MAX_PERSONAL_TASK_TITLE_LENGTH,
  PERSONAL_TASKS_LIST_DONE_IN_ALL,
  PERSONAL_TASKS_LIST_MAX,
  personalTaskItemValidator,
  personalTaskStatusValidator,
  taskPriorityValidator,
  validateTaskDueDate,
} from "./lib/validators";
import { prijavljenMutation, prijavljenQuery, projekatMutation } from "../lib/projekat";

/*
 * Lični zadaci (docs/LICNO-PLAN.md §4.1, plan K01 §2.1): privatne obaveze van
 * startupa. Sve funkcije rade ISKLJUČIVO nad zadacima pozivaoca — tuđ id se
 * ponaša kao nepostojeći (`get` → null, mutacije → „Lični zadatak nije
 * pronađen.").
 */

function cleanTitle(title: string) {
  return cleanRequiredText(title, "Naslov", MAX_PERSONAL_TASK_TITLE_LENGTH);
}

/** Prazna beleška se ne čuva: `undefined` = bez beleške. */
function cleanNotes(notes: string | null | undefined) {
  if (notes === undefined || notes === null) return undefined;
  const cleaned = cleanOptionalText(notes, "Beleška", MAX_PERSONAL_TASK_NOTES_LENGTH);
  return cleaned === undefined || cleaned.length === 0 ? undefined : cleaned;
}

function cleanDueDate(dueDate: number | null | undefined) {
  return validateTaskDueDate(dueDate) ?? null;
}

export const list = prijavljenQuery({
  args: {
    /** Podrazumevano `open`. */
    status: v.optional(
      v.union(v.literal("open"), v.literal("done"), v.literal("all")),
    ),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    items: v.array(personalTaskItemValidator),
    capped: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const status = args.status ?? "open";
    const limit = boundedLimit(args.limit, 100, PERSONAL_TASKS_LIST_MAX);

    const readOpen = async (take: number) =>
      await ctx.db
        .query("personalTasks")
        .withIndex("by_profile_status_archived_sort", (q) =>
          q.eq("profileId", profile._id).eq("status", "open").eq("archivedAt", null),
        )
        .order("asc")
        .take(take + 1);
    const readDone = async (take: number) =>
      await ctx.db
        .query("personalTasks")
        .withIndex("by_profile_status_archived_completed", (q) =>
          q.eq("profileId", profile._id).eq("status", "done").eq("archivedAt", null),
        )
        .order("desc")
        .take(take + 1);

    const items: Doc<"personalTasks">[] = [];
    let capped = false;
    if (status === "open" || status === "all") {
      const open = await readOpen(limit);
      if (open.length > limit) capped = true;
      items.push(...open.slice(0, limit));
    }
    if (status === "done" || status === "all") {
      const doneLimit =
        status === "all" ? Math.min(PERSONAL_TASKS_LIST_DONE_IN_ALL, limit) : limit;
      const done = await readDone(doneLimit);
      if (done.length > doneLimit) capped = true;
      items.push(...done.slice(0, doneLimit));
    }
    return { items: items.map(toPersonalTaskItem), capped };
  },
});

export const get = prijavljenQuery({
  args: { personalTaskId: v.id("personalTasks") },
  returns: v.union(personalTaskItemValidator, v.null()),
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const task = await getOwnedPersonalTask(ctx, args.personalTaskId, profile._id);
    return task === null ? null : toPersonalTaskItem(task);
  },
});

export const create = prijavljenMutation({
  args: {
    title: v.string(),
    notes: v.optional(v.string()),
    priority: v.optional(v.union(taskPriorityValidator, v.null())),
    dueDate: v.optional(v.union(v.number(), v.null())),
    /** Brzi unos: „Dodaj i u Moj dan" za lokalni dan uređaja. */
    addToMyDay: v.optional(v.object({ dayKey: v.string() })),
  },
  returns: v.id("personalTasks"),
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const title = cleanTitle(args.title);
    const notes = cleanNotes(args.notes);
    const dueDate = cleanDueDate(args.dueDate);
    const dayKey =
      args.addToMyDay === undefined ? null : assertDayKey(args.addToMyDay.dayKey);
    await assertOpenPersonalTaskRoom(ctx, profile._id);

    const now = Date.now();
    const personalTaskId = await ctx.db.insert("personalTasks", {
      profileId: profile._id,
      title,
      ...(notes === undefined ? {} : { notes }),
      status: "open",
      priority: args.priority ?? null,
      dueDate,
      sortAt: personalTaskSortAt(dueDate, now),
      completedAt: null,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    if (dayKey !== null) {
      await appendPlanEntry(ctx, {
        profileId: profile._id,
        dayKey,
        ref: { kind: "personal", personalTaskId },
        now,
      });
    }
    return personalTaskId;
  },
});

export const update = prijavljenMutation({
  args: {
    personalTaskId: v.id("personalTasks"),
    title: v.optional(v.string()),
    /** `null` ili prazno briše belešku. */
    notes: v.optional(v.union(v.string(), v.null())),
    priority: v.optional(v.union(taskPriorityValidator, v.null())),
    dueDate: v.optional(v.union(v.number(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const task = await requireOwnedPersonalTask(ctx, args.personalTaskId, profile._id);
    const title = args.title === undefined ? task.title : cleanTitle(args.title);
    const notes = args.notes === undefined ? task.notes : cleanNotes(args.notes);
    const priority = args.priority === undefined ? task.priority : args.priority;
    const dueDate =
      args.dueDate === undefined ? task.dueDate : cleanDueDate(args.dueDate);
    if (
      title === task.title &&
      notes === task.notes &&
      priority === task.priority &&
      dueDate === task.dueDate
    ) {
      return null;
    }
    await ctx.db.patch("personalTasks", task._id, {
      title,
      // `undefined` u patch-u uklanja polje (beleška obrisana).
      notes,
      priority,
      dueDate,
      sortAt: personalTaskSortAt(dueDate, task.createdAt),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const setStatus = prijavljenMutation({
  args: {
    personalTaskId: v.id("personalTasks"),
    status: personalTaskStatusValidator,
  },
  returns: v.object({ previousStatus: personalTaskStatusValidator }),
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const task = await requireOwnedPersonalTask(ctx, args.personalTaskId, profile._id);
    const previousStatus = task.status;
    if (previousStatus === args.status) return { previousStatus };
    if (args.status === "open") {
      await assertOpenPersonalTaskRoom(ctx, profile._id);
    }
    const now = Date.now();
    await ctx.db.patch("personalTasks", task._id, {
      status: args.status,
      completedAt: args.status === "done" ? now : null,
      updatedAt: now,
    });
    return { previousStatus };
  },
});

/** „Obriši" = arhiva, da bi „Poništi" (`restore`) mogao da ga vrati. */
export const archive = prijavljenMutation({
  args: { personalTaskId: v.id("personalTasks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const task = await requireOwnedPersonalTask(ctx, args.personalTaskId, profile._id);
    const now = Date.now();
    await ctx.db.patch("personalTasks", task._id, {
      archivedAt: now,
      updatedAt: now,
    });
    return null;
  },
});

export const restore = prijavljenMutation({
  args: { personalTaskId: v.id("personalTasks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const task = await requireOwnedPersonalTask(ctx, args.personalTaskId, profile._id, {
      allowArchived: true,
    });
    if (task.archivedAt === null) return null;
    // Prebačen zadatak već živi kao stranica u startupu; vraćanje bi ga
    // udvostručilo (plan K01 D12: prebacivanje nema „Poništi").
    if (task.movedToPageId !== undefined) {
      throw new Error("Zadatak je prebačen u projekat i ne može da se vrati.");
    }
    if (task.status === "open") {
      await assertOpenPersonalTaskRoom(ctx, profile._id);
    }
    await ctx.db.patch("personalTasks", task._id, {
      archivedAt: null,
      updatedAt: Date.now(),
    });
    return null;
  },
});

/**
 * „Prebaci u startup": pravi `task` stranicu kroz ISTI put kao `pages.create`
 * (`lib/page_creation.ts`), sa pozivaocem kao izvršiocem; rok i prioritet se
 * prenose, beleška postaje instrukcije. Lični zadatak se arhivira (sa tragom
 * `movedToPageId`), a stavke plana se prepisuju na novu stranicu.
 */
export const moveToStartup = projekatMutation({
  uloga: "urednik",
  args: {
    personalTaskId: v.id("personalTasks"),
    areaId: v.id("areas"),
  },
  returns: v.object({ pageId: v.id("pages") }),
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const task = await requireOwnedPersonalTask(ctx, args.personalTaskId, profile._id);
    if (task.status !== "open") {
      throw new Error("Završen zadatak se ne prebacuje u projekat.");
    }
    await requireClanProjekta(ctx, args.workspaceId);

    const now = Date.now();
    const target = await validateWorkspacePageTarget(ctx, {
      workspaceId: args.workspaceId,
      areaId: args.areaId,
      parentPageId: null,
      kind: "task",
      taskPriority: task.priority ?? "medium",
      assigneeProfileIds: [profile._id],
      dueDate: task.dueDate,
      instructions: task.notes,
    });
    const page = prepareWorkspacePage(target, {
      title: task.title,
      content: "",
      now,
    });
    const pageId = await insertWorkspacePage(ctx, {
      target,
      page,
      actorProfileId: profile._id,
      now,
    });

    await ctx.db.patch("personalTasks", task._id, {
      archivedAt: now,
      movedToPageId: pageId,
      updatedAt: now,
    });

    // Plan prati zadatak: stavke ličnog zadatka postaju stavke nove stranice.
    // Najnoviji dani prvi — oni su u „Danas" i „Preneto od ranije"; starije
    // stavke koje ne stanu se ionako tiho preskaču pri čitanju (arhiviran cilj).
    const fromKey = refKeyOf({ kind: "personal", personalTaskId: task._id });
    const toKey = refKeyOf({ kind: "task", taskPageId: pageId });
    const entries = await ctx.db
      .query("myDayEntries")
      .withIndex("by_profile_ref", (q) =>
        q.eq("profileId", profile._id).eq("refKey", fromKey),
      )
      .order("desc")
      .take(20);
    for (const entry of entries) {
      await ctx.db.patch("myDayEntries", entry._id, {
        refKind: "task",
        taskPageId: pageId,
        personalTaskId: null,
        refKey: toKey,
      });
    }
    return { pageId };
  },
});
