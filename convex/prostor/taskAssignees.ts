// Preneto iz Devotion packages/backend/convex/taskAssignees.ts (main @ c05c40f), SPAJANJE S04.
import { v } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { recordActivity } from "./lib/activity";
import { requireClanProjekta } from "./lib/auth";
import { createNotification, notificationCopy } from "./lib/notifications";
import { requireVisiblePage } from "./lib/pages";
import { assertCanEditPage, canEditPage } from "./lib/permissions";
import { getProfileSummary } from "./lib/profile_summary";
import {
  normalizeAssigneeProfileIds,
  reconcileTaskAssignees,
  resolveTaskAssignees,
} from "./lib/task_assignees";
import { MAX_TASK_ASSIGNEES } from "./lib/validators";
import { projekatMutation, projekatQuery } from "../lib/projekat";

/** Gornja granica jednog batch čitanja spiskova izvršilaca. */
const MAX_ASSIGNEE_LOOKUP_PAGES = 300;

const assigneeValidator = v.object({
  profileId: v.id("profiles"),
  displayName: v.string(),
  avatarUrl: v.union(v.string(), v.null()),
  addedByProfileId: v.id("profiles"),
  createdAt: v.number(),
  canRemove: v.boolean(),
});

async function requireTaskPage(ctx: MutationCtx, taskPageId: Id<"pages">) {
  const page = await requireVisiblePage(ctx, taskPageId);
  if (page.kind !== "task") throw new Error("Ova stranica nije zadatak.");
  const actor = await requireClanProjekta(ctx, page.workspaceId);
  return { page, profile: actor.profile, actor };
}

async function notifyAssignmentChange(
  ctx: MutationCtx,
  args: {
    page: Doc<"pages">;
    added: Array<Id<"profiles">>;
    actorProfileId: Id<"profiles">;
  },
) {
  if (args.added.length === 0) return;
  const actor = await ctx.db.get("profiles", args.actorProfileId);
  const actorName = actor?.displayName ?? "Član tima";
  const copy = notificationCopy.taskAssigned(args.page.title, actorName);
  for (const recipientProfileId of args.added) {
    await createNotification(ctx, {
      recipientProfileId,
      workspaceId: args.page.workspaceId,
      type: "task_assigned",
      title: copy.title,
      body: copy.body,
      targetType: "page",
      targetId: args.page._id,
      actorProfileId: args.actorProfileId,
    });
  }
}

export const listForTask = projekatQuery({
  uloga: "urednik",
  args: { taskPageId: v.id("pages") },
  returns: v.array(assigneeValidator),
  handler: async (ctx, args) => {
    const page = await requireVisiblePage(ctx, args.taskPageId);
    if (page.kind !== "task") throw new Error("Ova stranica nije zadatak.");
    const actor = await requireClanProjekta(ctx, page.workspaceId);
    const { profile } = actor;
    const rows = await resolveTaskAssignees(ctx, page);
    // PROSTOR P1: tuđe učešće skida svako ko sme da menja zadatak.
    const canManage = canEditPage(actor, page);
    const summaries = await Promise.all(
      rows.map((row) => getProfileSummary(ctx, row.profileId)),
    );
    return rows.flatMap((row, index) => {
      const summary = summaries[index];
      if (summary === null) return [];
      return [
        {
          profileId: row.profileId,
          displayName: summary.displayName,
          avatarUrl: summary.avatarUrl,
          addedByProfileId: row.addedByProfileId,
          createdAt: row.createdAt,
          // Svoje učešće svako skida sam; tuđe — ko sme da menja zadatak.
          canRemove: canManage || row.profileId === profile._id,
        },
      ];
    });
  },
});

/**
 * Spiskovi izvršilaca za više zadataka odjednom. Tabele i komandni centar
 * prikazuju desetine redova — bez ovoga bi svaki red otvorio svoju subskripciju.
 */
export const listForTasks = projekatQuery({
  uloga: "urednik",
  args: {
    taskPageIds: v.array(v.id("pages")),
  },
  returns: v.array(
    v.object({
      taskPageId: v.id("pages"),
      assignees: v.array(assigneeValidator),
    }),
  ),
  handler: async (ctx, args) => {
    const actor = await requireClanProjekta(ctx, args.workspaceId);
    const { profile } = actor;
    if (args.taskPageIds.length > MAX_ASSIGNEE_LOOKUP_PAGES) {
      throw new Error(
        `Odjednom se može učitati najviše ${MAX_ASSIGNEE_LOOKUP_PAGES} zadataka.`,
      );
    }
    const summaries = new Map<
      Id<"profiles">,
      Awaited<ReturnType<typeof getProfileSummary>>
    >();
    const loadSummary = async (profileId: Id<"profiles">) => {
      const cached = summaries.get(profileId);
      if (cached !== undefined) return cached;
      const summary = await getProfileSummary(ctx, profileId);
      summaries.set(profileId, summary);
      return summary;
    };

    const result = [];
    for (const taskPageId of args.taskPageIds) {
      const page = await ctx.db.get("pages", taskPageId);
      if (
        page === null ||
        page.archivedAt !== null ||
        page.kind !== "task" ||
        page.workspaceId !== args.workspaceId
      ) {
        continue;
      }
      const rows = await resolveTaskAssignees(ctx, page);
      const canManage = canEditPage(actor, page);
      const assignees = [];
      for (const row of rows) {
        const summary = await loadSummary(row.profileId);
        if (summary === null) continue;
        assignees.push({
          profileId: row.profileId,
          displayName: summary.displayName,
          avatarUrl: summary.avatarUrl,
          addedByProfileId: row.addedByProfileId,
          createdAt: row.createdAt,
          canRemove: canManage || row.profileId === profile._id,
        });
      }
      result.push({ taskPageId: page._id, assignees });
    }
    return result;
  },
});

export const setAssignees = projekatMutation({
  uloga: "urednik",
  args: {
    taskPageId: v.id("pages"),
    profileIds: v.array(v.id("profiles")),
  },
  returns: v.array(v.id("profiles")),
  handler: async (ctx, args) => {
    const { page, profile, actor } = await requireTaskPage(ctx, args.taskPageId);
    assertCanEditPage(actor, page);
    const profileIds = normalizeAssigneeProfileIds(args.profileIds) ?? [];
    const now = Date.now();
    const { added, removed } = await reconcileTaskAssignees(ctx, {
      page,
      profileIds,
      actorProfileId: profile._id,
      now,
    });
    if (added.length > 0 || removed.length > 0) {
      await recordActivity(ctx, {
        workspaceId: page.workspaceId,
        actorProfileId: profile._id,
        action: "task_updated",
        targetType: "page",
        targetId: page._id,
        title: `Izvršioci zadatka „${page.title}” su ažurirani`,
        detail: `Dodato: ${added.length}, uklonjeno: ${removed.length}`,
      });
    }
    await notifyAssignmentChange(ctx, {
      page,
      added,
      actorProfileId: profile._id,
    });
    return profileIds;
  },
});

export const join = projekatMutation({
  uloga: "urednik",
  args: { taskPageId: v.id("pages") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { page, profile } = await requireTaskPage(ctx, args.taskPageId);
    const current = await resolveTaskAssignees(ctx, page);
    if (current.some((row) => row.profileId === profile._id)) return null;
    if (current.length >= MAX_TASK_ASSIGNEES) {
      throw new Error(
        `Zadatak već ima najviše ${MAX_TASK_ASSIGNEES} izvršilaca.`,
      );
    }
    const now = Date.now();
    await reconcileTaskAssignees(ctx, {
      page,
      profileIds: [...current.map((row) => row.profileId), profile._id],
      actorProfileId: profile._id,
      now,
      membershipChecked: true,
    });
    await recordActivity(ctx, {
      workspaceId: page.workspaceId,
      actorProfileId: profile._id,
      action: "task_updated",
      targetType: "page",
      targetId: page._id,
      title: `Task „${page.title}” je ažuriran`,
      detail: `Priključio/la se: ${profile.displayName}`,
    });
    // Autor zadatka saznaje ko se sam priključio; `createNotification` ćuti kad
    // je autor ujedno i taj koji se priključio.
    const copy = notificationCopy.taskJoined(page.title, profile.displayName);
    await createNotification(ctx, {
      recipientProfileId: page.createdByProfileId,
      workspaceId: page.workspaceId,
      type: "task_assigned",
      title: copy.title,
      body: copy.body,
      targetType: "page",
      targetId: page._id,
      actorProfileId: profile._id,
    });
    return null;
  },
});

export const leave = projekatMutation({
  uloga: "urednik",
  args: { taskPageId: v.id("pages") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { page, profile } = await requireTaskPage(ctx, args.taskPageId);
    const current = await resolveTaskAssignees(ctx, page);
    if (!current.some((row) => row.profileId === profile._id)) return null;
    const now = Date.now();
    await reconcileTaskAssignees(ctx, {
      page,
      profileIds: current
        .map((row) => row.profileId)
        .filter((profileId) => profileId !== profile._id),
      actorProfileId: profile._id,
      now,
      membershipChecked: true,
    });
    return null;
  },
});

export const remove = projekatMutation({
  uloga: "urednik",
  args: { taskPageId: v.id("pages"), profileId: v.id("profiles") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { page, profile, actor } = await requireTaskPage(ctx, args.taskPageId);
    // Sebe skida svako; tuđe učešće — ko sme da menja zadatak (P1).
    if (args.profileId !== profile._id) assertCanEditPage(actor, page);
    const current = await resolveTaskAssignees(ctx, page);
    if (!current.some((row) => row.profileId === args.profileId)) return null;
    const now = Date.now();
    await reconcileTaskAssignees(ctx, {
      page,
      profileIds: current
        .map((row) => row.profileId)
        .filter((profileId) => profileId !== args.profileId),
      actorProfileId: profile._id,
      now,
      membershipChecked: true,
    });
    return null;
  },
});
