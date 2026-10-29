// Preneto iz Devotion packages/backend/convex/tasks.ts (main @ c05c40f), SPAJANJE S04.
import { v } from "convex/values";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import type { Doc, Id } from "../_generated/dataModel";
import { type MutationCtx } from "../_generated/server";
import { recordActivity } from "./lib/activity";
import { belgradeDayKey, notifyTaskStakeholders } from "./lib/notifications";
import {
  clanstvoProfila,
  requireProfile,
  requireProfilUProjektu,
  requireClanProjekta,
} from "./lib/auth";
import {
  type AreaMini,
  listMyActiveWorkspaces,
  type WorkspaceMini,
  workspaceMiniOf,
  type TaskItem,
  toTaskItem,
} from "./lib/my_scope";
import { pageSnapshot, recordPageRevision } from "./lib/page_content";
import { requirePageArea, workspaceCanvasPreview } from "./lib/page_creation";
import {
  type Actor,
  canChangeTaskStatus,
  canEditPage,
  LOCKED_PAGE_MESSAGE,
  permissionError,
} from "./lib/permissions";
import {
  isPageVisible,
  nextCompletedAt,
  pageTaskSortAt,
  requireVisiblePage,
  summarizePage,
} from "./lib/pages";
import {
  isTaskAssignee,
  listActiveTaskAssigneeIds,
  normalizeAssigneeProfileIds,
  reconcileTaskAssignees,
  syncTaskAssigneeMirrors,
} from "./lib/task_assignees";
import { reconcileLegacyTaskCheckpoints } from "./lib/task_checkpoints";
import {
  boundedLimit,
  BULK_RESCHEDULE_MAX,
  checkpointItemValidator,
  COMMAND_CENTER_STATUS_CAP,
  MAX_TASK_PAGE_SIZE,
  normalizeTaskCheckpoints,
  normalizeTaskInstructions,
  OPEN_TASK_STATUSES,
  pageSummaryValidator,
  areaDocumentValidator,
  TASKS_EVERYWHERE_DONE_IN_ALL,
  TASKS_EVERYWHERE_MAX,
  TASKS_EVERYWHERE_STATUS_CAP,
  taskItemValidator,
  workspaceMiniValidator,
  taskPriorityValidator,
  taskStatusValidator,
  validateTaskDueDate,
} from "./lib/validators";
import { prijavljenQuery, projekatMutation, projekatQuery } from "../lib/projekat";

export const listForStartup = projekatQuery({
  uloga: "urednik",
  args: {
    status: v.optional(taskStatusValidator),
    assigneeProfileId: v.optional(v.id("profiles")),
    dueStart: v.optional(v.number()),
    dueEnd: v.optional(v.number()),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(pageSummaryValidator),
  handler: async (ctx, args) => {
    await requireClanProjekta(ctx, args.workspaceId);
    boundedLimit(
      args.paginationOpts.numItems,
      MAX_TASK_PAGE_SIZE,
      MAX_TASK_PAGE_SIZE,
    );
    if ((args.dueStart === undefined) !== (args.dueEnd === undefined)) {
      throw new Error("Za raspon roka potrebni su početak i kraj.");
    }
    if (args.assigneeProfileId !== undefined) {
      await requireProfilUProjektu(
        ctx,
        args.workspaceId,
        args.assigneeProfileId,
      );
    }
    if (args.dueStart !== undefined && args.dueEnd !== undefined) {
      validateTaskDueDate(args.dueStart);
      validateTaskDueDate(args.dueEnd);
      if (args.dueStart >= args.dueEnd) {
        throw new Error("Početak raspona roka mora biti pre kraja.");
      }
      if (args.status !== undefined || args.assigneeProfileId !== undefined) {
        throw new Error(
          "Raspon roka se ne kombinuje sa statusom ili dodeljenim članom.",
        );
      }
    }
    // Filtriranje po izvršiocu ide kroz spisak učešća — zadatak može imati više
    // izvršilaca, pa projekcija na `pages` nije dovoljna.
    if (args.assigneeProfileId !== undefined) {
      const assignments =
        args.status !== undefined
          ? await ctx.db
              .query("taskAssignees")
              .withIndex(
                "by_workspace_profile_status_active_sort",
                (q) =>
                  q
                    .eq("workspaceId", args.workspaceId)
                    .eq("profileId", args.assigneeProfileId!)
                    .eq("taskStatus", args.status!)
                    .eq("archivedAt", null),
              )
              .order("asc")
              .paginate(args.paginationOpts)
          : await ctx.db
              .query("taskAssignees")
              .withIndex(
                "by_workspace_profile_active_sort",
                (q) =>
                  q
                    .eq("workspaceId", args.workspaceId)
                    .eq("profileId", args.assigneeProfileId!)
                    .eq("archivedAt", null),
              )
              .order("asc")
              .paginate(args.paginationOpts);
      const assignedTasks = [];
      for (const assignment of assignments.page) {
        const task = await ctx.db.get("pages", assignment.taskPageId);
        if (
          task === null ||
          task.archivedAt !== null ||
          task.kind !== "task" ||
          task.workspaceId !== args.workspaceId ||
          (args.status !== undefined && task.taskStatus !== args.status)
        ) {
          continue;
        }
        assignedTasks.push(summarizePage(task));
      }
      return { ...assignments, page: assignedTasks };
    }

    const tasks = args.dueStart !== undefined && args.dueEnd !== undefined
      ? await ctx.db
          .query("pages")
          .withIndex("by_workspace_kind_active_sort", (q) =>
            q
              .eq("workspaceId", args.workspaceId)
              .eq("kind", "task")
              .eq("archivedAt", null)
              .gte("taskSortAt", args.dueStart!)
              .lt("taskSortAt", args.dueEnd!),
          )
          .order("asc")
          .paginate(args.paginationOpts)
      : args.status !== undefined
        ? await ctx.db
            .query("pages")
            .withIndex("by_workspace_status_active_sort", (q) =>
              q
                .eq("workspaceId", args.workspaceId)
                .eq("kind", "task")
                .eq("taskStatus", args.status!)
                .eq("archivedAt", null),
            )
            .order("asc")
            .paginate(args.paginationOpts)
        : await ctx.db
            .query("pages")
            .withIndex("by_workspace_kind_active_sort", (q) =>
              q
                .eq("workspaceId", args.workspaceId)
                .eq("kind", "task")
                .eq("archivedAt", null),
            )
            .order("asc")
            .paginate(args.paginationOpts);

    return { ...tasks, page: tasks.page.map(summarizePage) };
  },
});

export const listMine = prijavljenQuery({
  args: { status: v.optional(taskStatusValidator), limit: v.optional(v.number()) },
  returns: v.array(
    pageSummaryValidator.extend({
      workspace: workspaceMiniValidator,
      area: v.union(areaDocumentValidator, v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const limit = boundedLimit(args.limit, 40, 100);
    // Čita se spisak učešća, pa se stranice hidriraju. Arhivirane stranice se
    // ne ogledaju u join redovima, pa ih ovde filtriramo — zato se uzima
    // rezerva iznad tražene granice.
    const assignments = args.status === undefined
      ? await ctx.db
          .query("taskAssignees")
          .withIndex("by_profile_active_sort", (q) =>
            q.eq("profileId", profile._id).eq("archivedAt", null),
          )
          .order("asc")
          .take(limit * 2 + MAX_TASK_PAGE_SIZE)
      : await ctx.db
          .query("taskAssignees")
          .withIndex(
            "by_profile_status_active_sort",
            (q) =>
              q
                .eq("profileId", profile._id)
                .eq("taskStatus", args.status!)
                .eq("archivedAt", null),
          )
          .order("asc")
          .take(limit * 2 + MAX_TASK_PAGE_SIZE);

    const tasks = [];
    for (const assignment of assignments) {
      const task = await ctx.db.get("pages", assignment.taskPageId);
      if (
        task === null ||
        task.archivedAt !== null ||
        task.kind !== "task" ||
        (args.status !== undefined && task.taskStatus !== args.status)
      ) {
        continue;
      }
      tasks.push(task);
      if (tasks.length === limit) break;
    }

    const result = [];
    for (const task of tasks) {
      const workspace = await ctx.db.get("workspaces", task.workspaceId);
      if (workspace === null || workspace.arhiviran === true) continue;
      // Članstvo kroz adapter: samo `owner`/`urednik`, bez `.unique()` (O5, D20).
      const membership = await clanstvoProfila(ctx, workspace._id, profile._id);
      if (membership === null) continue;
      const area = await ctx.db.get("areas", task.areaId);
      result.push({
        ...summarizePage(task),
        workspace: await workspaceMiniOf(ctx, workspace),
        area,
      });
      if (result.length === limit) break;
    }
    return result;
  },
});

/**
 * „Moji zadaci" ličnog nivoa: moji dodeljeni zadaci iz SVIH startupa u kojima
 * sam aktivan član (ili samo iz `startupId`), sa mini podacima startupa i
 * oblasti. `open` je po roku (kao `listMine`), `done` po trenutku završetka,
 * `all` = otvoreni + do 50 poslednjih završenih. `listMine` ostaje za
 * postojeće ekrane.
 */
export const listEverywhere = prijavljenQuery({
  args: {
    scope: v.union(v.literal("open"), v.literal("done"), v.literal("all")),
    workspaceId: v.optional(v.id("workspaces")),
    limit: v.optional(v.number()),
  },
  returns: v.object({ items: v.array(taskItemValidator), capped: v.boolean() }),
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const limit = boundedLimit(args.limit, 100, TASKS_EVERYWHERE_MAX);
    const workspaceId = args.workspaceId;
    let workspaces: Map<Id<"workspaces">, WorkspaceMini>;
    if (workspaceId === undefined) {
      workspaces = await listMyActiveWorkspaces(ctx, profile._id);
    } else {
      const { workspace } = await requireClanProjekta(ctx, workspaceId);
      workspaces = new Map([[workspace._id, await workspaceMiniOf(ctx, workspace)]]);
    }
    const areaCache = new Map<Id<"areas">, AreaMini | null>();
    const hydrate = async (row: Doc<"taskAssignees">) => {
      if (!workspaces.has(row.workspaceId)) return null;
      return await toTaskItem(ctx, await ctx.db.get("pages", row.taskPageId), {
        profileId: profile._id,
        workspaces,
        areaCache,
        isAssignee: true,
      });
    };

    const items: TaskItem[] = [];
    let capped = false;

    if (args.scope === "open" || args.scope === "all") {
      const rows: Doc<"taskAssignees">[] = [];
      for (const status of OPEN_TASK_STATUSES) {
        const statusRows =
          workspaceId === undefined
            ? await ctx.db
                .query("taskAssignees")
                .withIndex("by_profile_status_active_sort", (q) =>
                  q
                    .eq("profileId", profile._id)
                    .eq("taskStatus", status)
                    .eq("archivedAt", null),
                )
                .order("asc")
                .take(TASKS_EVERYWHERE_STATUS_CAP)
            : await ctx.db
                .query("taskAssignees")
                .withIndex("by_workspace_profile_status_active_sort", (q) =>
                  q
                    .eq("workspaceId", workspaceId)
                    .eq("profileId", profile._id)
                    .eq("taskStatus", status)
                    .eq("archivedAt", null),
                )
                .order("asc")
                .take(TASKS_EVERYWHERE_STATUS_CAP);
        if (statusRows.length === TASKS_EVERYWHERE_STATUS_CAP) capped = true;
        rows.push(...statusRows);
      }
      rows.sort(
        (a, b) => a.taskSortAt - b.taskSortAt || a._creationTime - b._creationTime,
      );
      const seen = new Set<Id<"pages">>();
      let index = 0;
      for (; index < rows.length && items.length < limit; index += 1) {
        const row = rows[index];
        if (seen.has(row.taskPageId)) continue;
        seen.add(row.taskPageId);
        const item = await hydrate(row);
        if (item !== null) items.push(item);
      }
      if (index < rows.length) capped = true;
    }

    if (args.scope === "done" || args.scope === "all") {
      const doneLimit =
        args.scope === "all" ? Math.min(TASKS_EVERYWHERE_DONE_IN_ALL, limit) : limit;
      // Indeks završenih je po profilu (bez startupa), pa se uz filter startupa
      // čita širi prozor i filtrira posle čitanja.
      const scan =
        workspaceId === undefined
          ? doneLimit
          : Math.min(doneLimit * 2, TASKS_EVERYWHERE_MAX);
      const doneRows = await ctx.db
        .query("taskAssignees")
        .withIndex("by_profile_status_active_updated", (q) =>
          q
            .eq("profileId", profile._id)
            .eq("taskStatus", "done")
            .eq("archivedAt", null),
        )
        .order("desc")
        .take(scan);
      if (doneRows.length === scan) capped = true;
      const done: TaskItem[] = [];
      const seen = new Set<Id<"pages">>();
      for (const row of doneRows) {
        if (seen.has(row.taskPageId)) continue;
        seen.add(row.taskPageId);
        const item = await hydrate(row);
        if (item !== null && item.taskStatus === "done") done.push(item);
      }
      done.sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
      if (done.length > doneLimit) capped = true;
      items.push(...done.slice(0, doneLimit));
    }

    return { items, capped };
  },
});

/**
 * Sve otvoreno u jednom startupu, u jednoj reaktivnoj subskripciji — trijažne
 * zone, brojači i opterećenje tima moraju da se osvežavaju kao jedna slika.
 * Zone se namerno ne računaju ovde: query ne sme da čita sat, a ista logika
 * treba i tabeli, stablu i kanvasu (`lib/deadline.ts`).
 */
export const commandCenter = projekatQuery({
  uloga: "urednik",
  args: {},
  returns: v.object({
    tasks: v.array(pageSummaryValidator),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireClanProjekta(ctx, args.workspaceId);

    const tasks = [];
    let hasMore = false;
    for (const status of OPEN_TASK_STATUSES) {
      const rows = await ctx.db
        .query("pages")
        .withIndex("by_workspace_status_active_sort", (q) =>
          q
            .eq("workspaceId", args.workspaceId)
            .eq("kind", "task")
            .eq("taskStatus", status)
            .eq("archivedAt", null),
        )
        .order("asc")
        .take(COMMAND_CENTER_STATUS_CAP);
      if (rows.length === COMMAND_CENTER_STATUS_CAP) hasMore = true;
      for (const row of rows) tasks.push(summarizePage(row));
    }

    return { tasks, hasMore };
  },
});

export const updateMetadata = projekatMutation({
  uloga: "urednik",
  args: {
    pageId: v.id("pages"),
    status: v.optional(taskStatusValidator),
    priority: v.optional(taskPriorityValidator),
    /** Deprecated ulaz — znači „spisak izvršilaca = [x]” (ili prazan za null). */
    assigneeProfileId: v.optional(v.union(v.id("profiles"), v.null())),
    assigneeProfileIds: v.optional(v.array(v.id("profiles"))),
    dueDate: v.optional(v.union(v.number(), v.null())),
    instructions: v.optional(v.union(v.string(), v.null())),
    checkpoints: v.optional(v.union(v.array(checkpointItemValidator), v.null())),
  },
  returns: v.id("pages"),
  handler: async (ctx, args) => {
    const page = await requireVisiblePage(ctx, args.pageId);
    if (page.kind !== "task") throw new Error("Ova stranica nije task.");
    const actor = await requireClanProjekta(ctx, page.workspaceId);
    const { profile } = actor;
    const currentAssigneeIds = await listActiveTaskAssigneeIds(ctx, page._id);
    const requestedAssigneeIds =
      normalizeAssigneeProfileIds(args.assigneeProfileIds) ??
      (args.assigneeProfileId === undefined
        ? undefined
        : args.assigneeProfileId === null
          ? []
          : [args.assigneeProfileId]);
    for (const profileId of requestedAssigneeIds ?? []) {
      await requireProfilUProjektu(ctx, page.workspaceId, profileId);
    }
    const normalizedDueDate = validateTaskDueDate(args.dueDate);
    const normalizedInstructions =
      args.instructions === undefined
        ? undefined
        : normalizeTaskInstructions(args.instructions);
    const normalizedCheckpoints =
      args.checkpoints === undefined
        ? undefined
        : normalizeTaskCheckpoints(args.checkpoints);
    const updatedDueDate = normalizedDueDate ?? null;
    const dueDate =
      args.dueDate === undefined ? page.dueDate : updatedDueDate;
    const taskStatus =
      args.status === undefined ? page.taskStatus : args.status;
    const taskPriority =
      args.priority === undefined ? page.taskPriority : args.priority;
    const assigneeProfileIds = requestedAssigneeIds ?? currentAssigneeIds;
    const assigneeProfileId = assigneeProfileIds[0] ?? null;
    const instructions =
      args.instructions === undefined
        ? page.instructions
        : normalizedInstructions;
    const checkpoints =
      args.checkpoints === undefined
        ? page.checkpoints
        : (normalizedCheckpoints ?? []);
    const body = await ctx.db
      .query("pageBodies")
      .withIndex("by_pageId", (q) => q.eq("pageId", page._id))
      .unique();
    const canvasPreview = workspaceCanvasPreview(
      page.title,
      body?.content ?? "",
      instructions,
    );
    const changesStatus = taskStatus !== page.taskStatus;
    const changesPriority = taskPriority !== page.taskPriority;
    const addedAssignees = assigneeProfileIds.filter(
      (profileId) => !currentAssigneeIds.includes(profileId),
    );
    const removedAssignees = currentAssigneeIds.filter(
      (profileId) => !assigneeProfileIds.includes(profileId),
    );
    const changesAssignee =
      addedAssignees.length > 0 || removedAssignees.length > 0;
    const changesDueDate = dueDate !== page.dueDate;
    const changesInstructions = instructions !== page.instructions;
    const changesCheckpoints =
      JSON.stringify(checkpoints ?? null) !==
      JSON.stringify(page.checkpoints ?? null);

    const unchanged =
      !changesStatus &&
      !changesPriority &&
      !changesAssignee &&
      !changesDueDate &&
      !changesInstructions &&
      !changesCheckpoints &&
      canvasPreview === page.canvasPreview;
    if (unchanged) return page._id;

    // Dozvole se sude po stvarnoj razlici, ne po prisustvu argumenta. PROSTOR
    // P1: svaki član menja sve osobine zadatka; na zaključanom zadatku autor,
    // vlasnik startupa i admin, a izvršilac još i status (ODLUKA K01 D5); svako
    // sme sebe da doda ili skine.
    const isAssignee = currentAssigneeIds.includes(profile._id);
    const touchesOnlySelf = [...addedAssignees, ...removedAssignees].every(
      (profileId) => profileId === profile._id,
    );
    const claimsForSelf = addedAssignees.includes(profile._id);

    if (!canEditPage(actor, page)) {
      if (
        changesPriority ||
        changesDueDate ||
        changesInstructions ||
        changesCheckpoints ||
        (changesAssignee && !touchesOnlySelf) ||
        (changesStatus &&
          !canChangeTaskStatus(actor, page, isAssignee || claimsForSelf))
      ) {
        throw permissionError("ZAKLJUCANO", LOCKED_PAGE_MESSAGE);
      }
    }

    const now = Date.now();
    const taskSortAt = pageTaskSortAt(dueDate, now);
    await ctx.db.patch("pages", page._id, {
      taskStatus,
      taskPriority,
      assigneeProfileId,
      dueDate,
      instructions,
      checkpoints,
      revision: page.revision + 1,
      canvasPreview,
      taskSortAt,
      completedAt: nextCompletedAt(page, taskStatus, now),
      updatedByProfileId: profile._id,
      updatedAt: now,
    });
    if (changesAssignee) {
      const patched = await ctx.db.get("pages", page._id);
      if (patched === null) throw new Error("Zadatak nije pronađen.");
      await reconcileTaskAssignees(ctx, {
        page: patched,
        profileIds: assigneeProfileIds,
        actorProfileId: profile._id,
        now,
        membershipChecked: true,
      });
    }
    if (changesStatus || changesDueDate) {
      await syncTaskAssigneeMirrors(ctx, {
        taskPageId: page._id,
        taskStatus,
        taskSortAt,
        now,
      });
    }
    if (args.checkpoints !== undefined) {
      await reconcileLegacyTaskCheckpoints(ctx, {
        page,
        checkpoints,
        actorProfileId: profile._id,
        now,
      });
    }
    if (changesInstructions) {
      // Instrukcije su sadržaj zadatka → Istorija izmena (P2, P14).
      const content = body?.content ?? "";
      await recordPageRevision(ctx, {
        page,
        before: pageSnapshot(page, page.title, content, page.instructions),
        after: pageSnapshot(page, page.title, content, instructions),
        actorProfileId: profile._id,
        now,
        revision: page.revision + 1,
      });
    }
    await recordActivity(ctx, {
      workspaceId: page.workspaceId,
      actorProfileId: profile._id,
      action: "task_updated",
      targetType: "page",
      targetId: page._id,
      title: `Task „${page.title}” je ažuriran`,
      ...(claimsForSelf
        ? { detail: `Preuzeo/la: ${profile.displayName}` }
        : {}),
    });
    await notifyTaskStakeholders(ctx, {
      page,
      addedAssigneeProfileIds: addedAssignees,
      assigneeProfileIdsAfterChange: assigneeProfileIds,
      nextTaskStatus: taskStatus,
      actorProfileId: profile._id,
    });
    return page._id;
  },
});

/**
 * Zadaci jedne oblasti, najnovije izmenjeni prvi (Komandni centar → oblast,
 * PROSTOR P12). Status se filtrira posle čitanja strane, pa strana može biti
 * kraća od `numItems`; klijent učitava dalje dok `isDone` nije `true`.
 */
export const listForArea = projekatQuery({
  uloga: "urednik",
  args: {
    areaId: v.id("areas"),
    status: v.optional(taskStatusValidator),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(pageSummaryValidator),
  handler: async (ctx, args) => {
    await requireClanProjekta(ctx, args.workspaceId);
    await requirePageArea(ctx, args.workspaceId, args.areaId);
    boundedLimit(
      args.paginationOpts.numItems,
      MAX_TASK_PAGE_SIZE,
      MAX_TASK_PAGE_SIZE,
    );
    const tasks = await ctx.db
      .query("pages")
      .withIndex("by_workspace_area_kind_active_updated", (q) =>
        q
          .eq("workspaceId", args.workspaceId)
          .eq("areaId", args.areaId)
          .eq("kind", "task")
          .eq("archivedAt", null),
      )
      .order("desc")
      .paginate(args.paginationOpts);
    const status = args.status;
    return {
      ...tasks,
      page: tasks.page
        .filter((task) => status === undefined || task.taskStatus === status)
        .map(summarizePage),
    };
  },
});

// --- „Sredi rokove” (PROSTOR P10, plan K01 §10.2) ---------------------------

type BulkSkipReason =
  | "nije_pronadjen"
  | "nije_zadatak"
  | "zakljucan"
  | "drugi_startup";

const bulkSkipReasonValidator = v.union(
  v.literal("nije_pronadjen"),
  v.literal("nije_zadatak"),
  v.literal("zakljucan"),
  v.literal("drugi_startup"),
);

/** Prethodne vrednosti zadatka — to je sve što „Poništi” treba da vrati. */
const scheduleSnapshotValidator = v.object({
  dueDate: v.union(v.number(), v.null()),
  taskStatus: taskStatusValidator,
});

type TaskStatusValue = NonNullable<Doc<"pages">["taskStatus"]>;

function assertBulkTaskIds(taskPageIds: Array<Id<"pages">>) {
  if (taskPageIds.length === 0) throw new Error("Izaberi bar jedan zadatak.");
  if (taskPageIds.length > BULK_RESCHEDULE_MAX) {
    throw new Error(
      `Odjednom se menja najviše ${BULK_RESCHEDULE_MAX} zadataka.`,
    );
  }
  if (new Set(taskPageIds).size !== taskPageIds.length) {
    throw new Error("Isti zadatak je naveden više puta.");
  }
}

/** Zadatak za grupnu izmenu: vidljiv, task, iz ovog startupa — ili razlog preskakanja. */
async function loadBulkTask(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  taskPageId: Id<"pages">,
): Promise<
  { page: Doc<"pages">; taskStatus: TaskStatusValue } | { reason: BulkSkipReason }
> {
  const page = await ctx.db.get("pages", taskPageId);
  if (page === null) return { reason: "nije_pronadjen" };
  if (page.workspaceId !== workspaceId) return { reason: "drugi_startup" };
  if (page.archivedAt !== null) return { reason: "nije_pronadjen" };
  if (page.kind !== "task" || page.taskStatus === null) {
    return { reason: "nije_zadatak" };
  }
  if (!(await isPageVisible(ctx, page._id))) {
    return { reason: "nije_pronadjen" };
  }
  return { page, taskStatus: page.taskStatus };
}

/**
 * R19: rok traži pravo izmene stranice (R2), „Završi” pravo nad statusom (R3) —
 * izvršilac zaključanog zadatka ga sme završiti, ali mu ne sme pomeriti rok.
 */
async function canBulkChange(
  ctx: MutationCtx,
  actor: Actor,
  page: Doc<"pages">,
  change: "due" | "status",
) {
  if (canEditPage(actor, page)) return true;
  if (change === "due") return false;
  return canChangeTaskStatus(
    actor,
    page,
    await isTaskAssignee(ctx, page, actor.profile._id),
  );
}

/** „1 zadatak”, „2 zadatka”, „5 zadataka”, „11 zadataka”, „21 zadatak”. */
function taskCountLabel(count: number) {
  const lastTwo = count % 100;
  const last = count % 10;
  const word =
    last === 1 && lastTwo !== 11
      ? "zadatak"
      : last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)
        ? "zadatka"
        : "zadataka";
  return `${count} ${word}`;
}

/** Oznaka novog roka za aktivnost; rok je lokalno podne, pa Beograd daje isti dan. */
function rescheduleLabel(dueDate: number | null, complete: boolean) {
  if (complete) return "završeno";
  if (dueDate === null) return "bez roka";
  const [, month, day] = belgradeDayKey(dueDate).split("-");
  return `${Number(day)}. ${Number(month)}.`;
}

/** Jedna aktivnost za celu grupnu izmenu (D14); jedan zadatak vodi na sebe. */
async function recordRescheduleActivity(
  ctx: MutationCtx,
  actor: Actor,
  touched: Array<Pick<Doc<"pages">, "_id" | "title">>,
  detail: string,
) {
  const single = touched.length === 1 ? touched[0] : null;
  await recordActivity(ctx, {
    workspaceId: actor.workspace._id,
    actorProfileId: actor.profile._id,
    action: "tasks_rescheduled",
    targetType: single === null ? "startup" : "page",
    targetId: single === null ? actor.workspace._id : single._id,
    title: single === null ? actor.workspace.name : single.title,
    detail,
  });
}

/**
 * „Sredi rokove”: isti novi rok (ili bez roka) ili „Završi” za najviše 50
 * zadataka jednog startupa. Dozvole su po zadatku (R19) — što član ne sme,
 * vraća se kao `skipped`, a ostalo prolazi. Obaveštenja nema (D14), samo jedna
 * aktivnost. Vraća prethodne vrednosti i novu reviziju za `bulkRestoreSchedule`.
 *
 * `dueDate` je lokalno podne (klijent ga računa); upit ne zna zonu.
 */
export const bulkReschedule = projekatMutation({
  uloga: "urednik",
  args: {
    taskPageIds: v.array(v.id("pages")),
    dueDate: v.optional(v.union(v.number(), v.null())),
    complete: v.optional(v.boolean()),
  },
  returns: v.object({
    updated: v.array(
      v.object({
        taskPageId: v.id("pages"),
        previous: scheduleSnapshotValidator,
        /** Revizija posle izmene — štiti „Poništi” od tuđe kasnije izmene. */
        revision: v.number(),
      }),
    ),
    skipped: v.array(
      v.object({ taskPageId: v.id("pages"), reason: bulkSkipReasonValidator }),
    ),
    /** Zadaci koji već imaju traženi rok ili status — ništa se ne menja. */
    unchanged: v.number(),
  }),
  handler: async (ctx, args) => {
    const actor = await requireClanProjekta(ctx, args.workspaceId);
    assertBulkTaskIds(args.taskPageIds);
    const complete = args.complete === true;
    const changesDue = args.dueDate !== undefined;
    if (complete === changesDue) {
      throw new Error(
        changesDue
          ? "Rok i završetak se ne menjaju zajedno."
          : "Navedi novi rok ili završetak.",
      );
    }
    const dueDate = changesDue ? (validateTaskDueDate(args.dueDate) ?? null) : null;

    const now = Date.now();
    const updated: Array<{
      taskPageId: Id<"pages">;
      previous: { dueDate: number | null; taskStatus: TaskStatusValue };
      revision: number;
    }> = [];
    const skipped: Array<{ taskPageId: Id<"pages">; reason: BulkSkipReason }> = [];
    const touched: Array<Pick<Doc<"pages">, "_id" | "title">> = [];
    let unchanged = 0;

    for (const taskPageId of args.taskPageIds) {
      const loaded = await loadBulkTask(ctx, args.workspaceId, taskPageId);
      if ("reason" in loaded) {
        skipped.push({ taskPageId, reason: loaded.reason });
        continue;
      }
      const { page, taskStatus } = loaded;
      if (complete ? taskStatus === "done" : page.dueDate === dueDate) {
        unchanged += 1;
        continue;
      }
      if (!(await canBulkChange(ctx, actor, page, complete ? "status" : "due"))) {
        skipped.push({ taskPageId, reason: "zakljucan" });
        continue;
      }

      const taskSortAt = complete
        ? page.taskSortAt
        : pageTaskSortAt(dueDate, now);
      await ctx.db.patch("pages", page._id, {
        ...(complete
          ? {
              taskStatus: "done" as const,
              completedAt: nextCompletedAt(page, "done", now),
            }
          : { dueDate, taskSortAt }),
        revision: page.revision + 1,
        updatedByProfileId: actor.profile._id,
        updatedAt: now,
      });
      await syncTaskAssigneeMirrors(ctx, {
        taskPageId: page._id,
        taskStatus: complete ? "done" : taskStatus,
        taskSortAt,
        now,
      });
      updated.push({
        taskPageId: page._id,
        previous: { dueDate: page.dueDate, taskStatus },
        revision: page.revision + 1,
      });
      touched.push({ _id: page._id, title: page.title });
    }

    if (touched.length > 0) {
      await recordRescheduleActivity(
        ctx,
        actor,
        touched,
        `${taskCountLabel(touched.length)} → ${rescheduleLabel(dueDate, complete)}`,
      );
    }
    return { updated, skipped, unchanged };
  },
});

/**
 * „Poništi” za `bulkReschedule`: vraća rok i status po zadatku. Zadatak koji je
 * u međuvremenu izmenjen (`expectedRevision` se ne poklapa) se preskače da
 * poništavanje ne pregazi tuđu izmenu — zato je revizija obavezna, a odgovor
 * vraća nove revizije (`revisions`) da klijent može da ulanča sledeće „Poništi”.
 * Bez obaveštenja, jedna aktivnost.
 */
export const bulkRestoreSchedule = projekatMutation({
  uloga: "urednik",
  args: {
    items: v.array(
      v.object({
        taskPageId: v.id("pages"),
        dueDate: v.union(v.number(), v.null()),
        taskStatus: taskStatusValidator,
        /** Revizija koju je klijent video posle izmene (`updated[].revision`). */
        expectedRevision: v.number(),
      }),
    ),
  },
  returns: v.object({
    restored: v.number(),
    /** Nova revizija svakog vraćenog zadatka — ulaz za sledeće „Poništi”. */
    revisions: v.array(
      v.object({ taskPageId: v.id("pages"), revision: v.number() }),
    ),
    skipped: v.array(
      v.object({
        taskPageId: v.id("pages"),
        reason: v.union(bulkSkipReasonValidator, v.literal("izmenjen")),
      }),
    ),
    /** Zadaci koji već imaju tražene vrednosti — ništa se ne menja. */
    unchanged: v.number(),
  }),
  handler: async (ctx, args) => {
    const actor = await requireClanProjekta(ctx, args.workspaceId);
    assertBulkTaskIds(args.items.map((item) => item.taskPageId));

    const now = Date.now();
    const skipped: Array<{
      taskPageId: Id<"pages">;
      reason: BulkSkipReason | "izmenjen";
    }> = [];
    const touched: Array<Pick<Doc<"pages">, "_id" | "title">> = [];
    const revisions: Array<{ taskPageId: Id<"pages">; revision: number }> = [];
    let unchanged = 0;

    for (const item of args.items) {
      const dueDate = validateTaskDueDate(item.dueDate) ?? null;
      const loaded = await loadBulkTask(ctx, args.workspaceId, item.taskPageId);
      if ("reason" in loaded) {
        skipped.push({ taskPageId: item.taskPageId, reason: loaded.reason });
        continue;
      }
      const { page, taskStatus } = loaded;
      if (page.revision !== item.expectedRevision) {
        skipped.push({ taskPageId: item.taskPageId, reason: "izmenjen" });
        continue;
      }
      const dueChanged = page.dueDate !== dueDate;
      const statusChanged = taskStatus !== item.taskStatus;
      if (!dueChanged && !statusChanged) {
        unchanged += 1;
        continue;
      }
      if (
        !(await canBulkChange(ctx, actor, page, dueChanged ? "due" : "status"))
      ) {
        skipped.push({ taskPageId: item.taskPageId, reason: "zakljucan" });
        continue;
      }

      const taskSortAt = dueChanged
        ? pageTaskSortAt(dueDate, now)
        : page.taskSortAt;
      await ctx.db.patch("pages", page._id, {
        ...(dueChanged ? { dueDate, taskSortAt } : {}),
        ...(statusChanged
          ? {
              taskStatus: item.taskStatus,
              completedAt: nextCompletedAt(page, item.taskStatus, now),
            }
          : {}),
        revision: page.revision + 1,
        updatedByProfileId: actor.profile._id,
        updatedAt: now,
      });
      await syncTaskAssigneeMirrors(ctx, {
        taskPageId: page._id,
        taskStatus: item.taskStatus,
        taskSortAt,
        now,
      });
      touched.push({ _id: page._id, title: page.title });
      revisions.push({ taskPageId: page._id, revision: page.revision + 1 });
    }

    if (touched.length > 0) {
      await recordRescheduleActivity(
        ctx,
        actor,
        touched,
        `vraćeno ${taskCountLabel(touched.length)}`,
      );
    }
    return { restored: touched.length, revisions, skipped, unchanged };
  },
});
