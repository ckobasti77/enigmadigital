// Preneto iz Devotion packages/backend/convex/notifications.ts (main @ c05c40f), SPAJANJE S06.
import { v } from "convex/values";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, type QueryCtx } from "../_generated/server";
import { requireProfile, requireClanProjekta } from "./lib/auth";
import {
  belgradeDayKey,
  createNotification,
  notificationCopy,
} from "./lib/notifications";
import { resolveTaskAssignees } from "./lib/task_assignees";
import {
  boundedLimit,
  notificationTargetTypeValidator,
  notificationTypeValidator,
} from "./lib/validators";
import { prijavljenMutation, projekatMutation, projekatQuery } from "../lib/projekat";

/** Preko ovoga brojač prikazuje „99+” umesto tačnog broja. */
const UNREAD_COUNT_CAP = 100;
const MARK_ALL_BATCH = 200;
const LATEST_LIMIT = 10;

/** Prozor u kome cron traži rokove: dovoljno unazad za prekoračene. */
const REMINDER_LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;
const REMINDER_LOOKAHEAD_MS = 48 * 60 * 60 * 1000;
/** Projekata po strani crona (D11: bez odsecanja, nastavak kroz kursor). */
const REMINDER_WORKSPACE_PAGE = 50;
/**
 * Zadataka po transakciji. Svaki primalac zakazuje dve dostave (web + Expo), a
 * mutacija sme najviše 1.000 zakazanih poslova: 40 × 10 izvršilaca × 2 = 800.
 */
const REMINDER_TASK_PAGE = 40;

export const notificationItemValidator = v.object({
  _id: v.id("notifications"),
  _creationTime: v.number(),
  recipientProfileId: v.id("profiles"),
  // `null` samo za lična obaveštenja; upiti po startupu ih nikad ne vraćaju.
  workspaceId: v.union(v.id("workspaces"), v.null()),
  type: notificationTypeValidator,
  title: v.string(),
  body: v.optional(v.string()),
  targetType: notificationTargetTypeValidator,
  targetId: v.union(v.string(), v.null()),
  actorProfileId: v.union(v.id("profiles"), v.null()),
  dedupeKey: v.union(v.string(), v.null()),
  readAt: v.union(v.number(), v.null()),
  createdAt: v.number(),
  actor: v.union(
    v.object({
      _id: v.id("profiles"),
      displayName: v.string(),
      avatarUrl: v.union(v.string(), v.null()),
    }),
    v.null(),
  ),
});

export async function withActors(
  ctx: QueryCtx,
  rows: Array<Doc<"notifications">>,
) {
  const actorIds = [
    ...new Set(
      rows
        .map((row) => row.actorProfileId)
        .filter((id): id is Id<"profiles"> => id !== null),
    ),
  ];
  const actors = new Map(
    await Promise.all(
      actorIds.map(async (actorId) => {
        const actor = await ctx.db.get("profiles", actorId);
        return [
          actorId,
          actor === null
            ? null
            : {
                _id: actor._id,
                displayName: actor.displayName,
                avatarUrl:
                  actor.avatarStorageId === undefined
                    ? null
                    : await ctx.storage.getUrl(actor.avatarStorageId),
              },
        ] as const;
      }),
    ),
  );

  return rows.map((row) => ({
    ...row,
    actor:
      row.actorProfileId === null
        ? null
        : actors.get(row.actorProfileId) ?? null,
  }));
}

export const list = projekatQuery({
  uloga: "urednik",
  args: {
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(notificationItemValidator),
  handler: async (ctx, args) => {
    const { profile } = await requireClanProjekta(ctx, args.workspaceId);
    const page = await ctx.db
      .query("notifications")
      .withIndex("by_recipient_and_workspace_and_createdAt", (q) =>
        q
          .eq("recipientProfileId", profile._id)
          .eq("workspaceId", args.workspaceId),
      )
      .order("desc")
      .paginate(args.paginationOpts);

    return { ...page, page: await withActors(ctx, page.page) };
  },
});

/** Glava liste — služi samo detekciji novih obaveštenja za toast. */
export const latest = projekatQuery({
  uloga: "urednik",
  args: { limit: v.optional(v.number()) },
  returns: v.array(notificationItemValidator),
  handler: async (ctx, args) => {
    const { profile } = await requireClanProjekta(ctx, args.workspaceId);
    const limit = boundedLimit(args.limit, LATEST_LIMIT, 50);
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_recipient_and_workspace_and_createdAt", (q) =>
        q
          .eq("recipientProfileId", profile._id)
          .eq("workspaceId", args.workspaceId),
      )
      .order("desc")
      .take(limit);
    return await withActors(ctx, rows);
  },
});

export const unreadCount = projekatQuery({
  uloga: "urednik",
  args: { },
  returns: v.object({ count: v.number(), capped: v.boolean() }),
  handler: async (ctx, args) => {
    const { profile } = await requireClanProjekta(ctx, args.workspaceId);
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_recipient_and_workspace_and_readAt", (q) =>
        q
          .eq("recipientProfileId", profile._id)
          .eq("workspaceId", args.workspaceId)
          .eq("readAt", null),
      )
      .take(UNREAD_COUNT_CAP);
    return { count: rows.length, capped: rows.length === UNREAD_COUNT_CAP };
  },
});

export const markRead = prijavljenMutation({
  args: { notificationId: v.id("notifications") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const notification = await ctx.db.get("notifications", args.notificationId);
    if (
      notification === null ||
      notification.recipientProfileId !== profile._id
    ) {
      throw new Error("Obaveštenje nije pronađeno.");
    }
    if (notification.readAt === null) {
      await ctx.db.patch("notifications", notification._id, {
        readAt: Date.now(),
      });
    }
    return null;
  },
});

export const markAllRead = projekatMutation({
  uloga: "urednik",
  args: { },
  returns: v.object({ marked: v.number(), hasMore: v.boolean() }),
  handler: async (ctx, args) => {
    const { profile } = await requireClanProjekta(ctx, args.workspaceId);
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_recipient_and_workspace_and_readAt", (q) =>
        q
          .eq("recipientProfileId", profile._id)
          .eq("workspaceId", args.workspaceId)
          .eq("readAt", null),
      )
      .take(MARK_ALL_BATCH);

    const now = Date.now();
    for (const row of rows) {
      await ctx.db.patch("notifications", row._id, { readAt: now });
    }

    const hasMore = rows.length === MARK_ALL_BATCH;
    if (hasMore) {
      await ctx.scheduler.runAfter(0, internal.prostor.notifications.markAllReadBatch, {
        profileId: profile._id,
        workspaceId: args.workspaceId,
      });
    }
    return { marked: rows.length, hasMore };
  },
});

/** Nastavak `markAllRead` u novoj transakciji kad ih je previše za jednu. */
export const markAllReadBatch = internalMutation({
  args: { profileId: v.id("profiles"), workspaceId: v.id("workspaces") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_recipient_and_workspace_and_readAt", (q) =>
        q
          .eq("recipientProfileId", args.profileId)
          .eq("workspaceId", args.workspaceId)
          .eq("readAt", null),
      )
      .take(MARK_ALL_BATCH);
    if (rows.length === 0) return null;

    const now = Date.now();
    for (const row of rows) {
      await ctx.db.patch("notifications", row._id, { readAt: now });
    }
    if (rows.length === MARK_ALL_BATCH) {
      await ctx.scheduler.runAfter(0, internal.prostor.notifications.markAllReadBatch, args);
    }
    return null;
  },
});

/**
 * Cron: podsetnici za rokove. Radi na kalendarskom danu po Beogradu, a ne na
 * „24 sata unazad”, pa se pokretanje više puta dnevno ne pretvara u gnjavljenje —
 * dedupe ključ nosi tip i datum roka, tako da svaki podsetnik ide jednom.
 *
 * SPAJANJE (plan S01 D11, §3.6e): Devotion je sve radio u jednoj transakciji
 * (100 startupa × 200 zadataka) i tiho odsecao višak. Ovde je fan-out: strana
 * od 50 projekata zakazuje po jedan posao po projektu, a sledeća strana ide
 * kroz kursor. Niko nije odsečen.
 */
export const remindDueTasks = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.object({ zakazano: v.number() }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const strana = await ctx.db
      .query("workspaces")
      .paginate({ numItems: REMINDER_WORKSPACE_PAGE, cursor: args.cursor ?? null });
    let zakazano = 0;
    for (const workspace of strana.page) {
      if (workspace.arhiviran === true) continue;
      await ctx.scheduler.runAfter(
        0,
        internal.prostor.notifications.remindDueTasksForWorkspace,
        { workspaceId: workspace._id, cursor: null, now },
      );
      zakazano += 1;
    }
    if (!strana.isDone) {
      await ctx.scheduler.runAfter(0, internal.prostor.notifications.remindDueTasks, {
        cursor: strana.continueCursor,
      });
    }
    return { zakazano };
  },
});

/**
 * Podsetnici jednog projekta, `REMINDER_TASK_PAGE` zadataka po transakciji; nastavak nosi isti
 * `now`, pa svi delovi računaju isti „danas” i „sutra”.
 */
export const remindDueTasksForWorkspace = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    cursor: v.union(v.string(), v.null()),
    now: v.number(),
  },
  returns: v.object({ created: v.number(), scanned: v.number() }),
  handler: async (ctx, { workspaceId, cursor, now }) => {
    const workspace = await ctx.db.get("workspaces", workspaceId);
    if (workspace === null || workspace.arhiviran === true) {
      return { created: 0, scanned: 0 };
    }
    const todayKey = belgradeDayKey(now);
    const tomorrowKey = belgradeDayKey(now + 24 * 60 * 60 * 1000);

    // `taskSortAt === dueDate` kad rok postoji, pa ovaj opseg strukturno
    // isključuje zadatke bez roka i arhivirane.
    const strana = await ctx.db
      .query("pages")
      .withIndex("by_workspace_kind_active_sort", (q) =>
        q
          .eq("workspaceId", workspaceId)
          .eq("kind", "task")
          .eq("archivedAt", null)
          .gte("taskSortAt", now - REMINDER_LOOKBACK_MS)
          .lt("taskSortAt", now + REMINDER_LOOKAHEAD_MS),
      )
      .paginate({ numItems: REMINDER_TASK_PAGE, cursor });

    let created = 0;
    let scanned = 0;

    for (const task of strana.page) {
      scanned += 1;
      if (task.taskStatus === "done" || task.dueDate === null) continue;

      const dueKey = belgradeDayKey(task.dueDate);
      const type =
        dueKey === tomorrowKey
          ? "task_due_soon"
          : dueKey === todayKey
            ? "task_due_today"
            : dueKey < todayKey
              ? "task_overdue"
              : null;
      if (type === null) continue;

      const copy =
        type === "task_due_soon"
          ? notificationCopy.taskDueSoon(task.title, task.dueDate)
          : type === "task_due_today"
            ? notificationCopy.taskDueToday(task.title, task.dueDate)
            : notificationCopy.taskOverdue(task.title, task.dueDate);

      // Podsetnik ide svakom izvršiocu; nedodeljen zadatak podseća onoga koji
      // ga je otvorio. Primalac mora biti u dedupe ključu, inače bi samo prvi
      // izvršilac ikada dobio podsetnik za taj dan.
      const assigneeIds = (await resolveTaskAssignees(ctx, task)).map(
        (entry) => entry.profileId,
      );
      const recipients =
        assigneeIds.length > 0 ? assigneeIds : [task.createdByProfileId];

      for (const recipientProfileId of recipients) {
        const notificationId = await createNotification(ctx, {
          recipientProfileId,
          workspaceId: task.workspaceId,
          type,
          title: copy.title,
          body: copy.body,
          targetType: "page",
          targetId: task._id,
          actorProfileId: null,
          dedupeKey: `${task._id}:${recipientProfileId}:${type}:${dueKey}`,
        });
        if (notificationId !== null) created += 1;
      }
    }

    if (!strana.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.prostor.notifications.remindDueTasksForWorkspace,
        { workspaceId, cursor: strana.continueCursor, now },
      );
    }
    return { created, scanned };
  },
});
