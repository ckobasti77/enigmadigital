// Preneto iz Devotion packages/backend/convex/puls.ts (main @ c05c40f), SPAJANJE S04.
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation } from "../_generated/server";
import { requireClanProjekta } from "./lib/auth";
import { aktivniClanoviProjekta } from "./lib/ljudi";
import {
  belgradeDayKey,
  createNotification,
  notificationCopy,
} from "./lib/notifications";
import { taskCompletedAt } from "./lib/pages";
import { resolveTaskAssignees } from "./lib/task_assignees";
import {
  taskPriorityValidator,
  taskStatusValidator,
} from "./lib/validators";
import { projekatQuery } from "../lib/projekat";

/** „U toku” bez izmene ovoliko radnih dana smatramo zapelim. */
export const STUCK_IN_PROGRESS_WORK_DAYS = 4;
/** „Čeka” duže od ovoliko kalendarskih dana je zapelo. */
export const STUCK_BLOCKED_DAYS = 2;

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MAX_WEEK_MS = 8 * DAY_MS;

const MAX_PULS_TASKS = 1_000;
const MAX_PULS_ACTIVITIES = 4_000;
const MAX_PULS_IDEAS = 500;
const MAX_PULS_VOTES = 2_000;
const MAX_PULS_AREAS = 50;
const MAX_PULS_MEMBERS = 50;
const MAX_STUCK_ROWS = 30;

const MAX_CRON_STARTUPS = 200;

/**
 * Radni dani između dva trenutka, bez vikenda. Dan se određuje po UTC+1, što je
 * dovoljno tačno za prag „zapelog” i ne zavisi od zone servera.
 */
export function workDaysBetween(startMs: number, endMs: number) {
  if (endMs <= startMs) return 0;
  let workDays = 0;
  let cursor = startMs;
  for (let guard = 0; guard < 60 && cursor < endMs; guard += 1) {
    const weekday = new Date(cursor + HOUR_MS).getUTCDay();
    if (weekday !== 0 && weekday !== 6) workDays += 1;
    cursor += DAY_MS;
  }
  return workDays;
}

const trendValidator = v.object({
  current: v.number(),
  previous: v.number(),
});

const memberSummaryValidator = v.object({
  profileId: v.id("profiles"),
  displayName: v.string(),
  avatarUrl: v.union(v.string(), v.null()),
  isArchived: v.boolean(),
  completedThisWeek: v.number(),
  activityCount: v.number(),
  openCount: v.number(),
  overdueCount: v.number(),
});

export const getWeekly = projekatQuery({
  uloga: "urednik",
  args: {
    prevWeekStart: v.number(),
    weekStart: v.number(),
    weekEnd: v.number(),
    now: v.number(),
  },
  returns: v.object({
    range: v.object({ weekStart: v.number(), weekEnd: v.number() }),
    startupCreatedAt: v.number(),
    summary: v.object({
      completed: trendValidator,
      created: trendValidator,
      overdueOpen: trendValidator,
      stuck: v.object({ current: v.number(), previous: v.null() }),
    }),
    stuckTasks: v.array(
      v.object({
        pageId: v.id("pages"),
        title: v.string(),
        taskStatus: taskStatusValidator,
        taskPriority: v.union(taskPriorityValidator, v.null()),
        areaId: v.id("areas"),
        areaLabel: v.string(),
        assignee: v.union(
          v.object({
            profileId: v.id("profiles"),
            displayName: v.string(),
            avatarUrl: v.union(v.string(), v.null()),
          }),
          v.null(),
        ),
        assignees: v.array(
          v.object({
            profileId: v.id("profiles"),
            displayName: v.string(),
            avatarUrl: v.union(v.string(), v.null()),
          }),
        ),
        dueDate: v.union(v.number(), v.null()),
        lastTouchedAt: v.number(),
      }),
    ),
    areas: v.array(
      v.object({
        areaId: v.id("areas"),
        key: v.string(),
        label: v.string(),
        openCount: v.number(),
        doneCount: v.number(),
        completedThisWeek: v.number(),
      }),
    ),
    members: v.array(memberSummaryValidator),
    unassigned: v.object({
      completedThisWeek: v.number(),
      openCount: v.number(),
      overdueCount: v.number(),
    }),
    ideas: v.object({
      created: trendValidator,
      votes: trendValidator,
      converted: trendValidator,
    }),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const { workspace } = await requireClanProjekta(ctx, args.workspaceId);

    // Granice nedelje računa klijent po svojoj zoni; server ih samo proverava,
    // jer query ne sme da čita sat.
    if (
      !(args.prevWeekStart < args.weekStart && args.weekStart < args.weekEnd)
    ) {
      throw new Error("Granice nedelje nisu ispravne.");
    }
    if (
      args.weekEnd - args.weekStart > MAX_WEEK_MS ||
      args.weekStart - args.prevWeekStart > MAX_WEEK_MS
    ) {
      throw new Error("Raspon nedelje je preveliki.");
    }
    if (args.weekStart > args.now + DAY_MS) {
      throw new Error("Puls za buduće nedelje još ne postoji.");
    }

    const tasks = await ctx.db
      .query("pages")
      .withIndex("by_workspaceId_and_kind_and_archivedAt", (q) =>
        q
          .eq("workspaceId", args.workspaceId)
          .eq("kind", "task")
          .eq("archivedAt", null),
      )
      .take(MAX_PULS_TASKS);

    const areas = await ctx.db
      .query("areas")
      .withIndex("by_workspaceId_and_position", (q) =>
        q.eq("workspaceId", args.workspaceId),
      )
      .take(MAX_PULS_AREAS);

    // P9: ljudi su `owner`/`urednik` sa profilom, bez duplikata (S01 §3.3).
    const memberships = await aktivniClanoviProjekta(
      ctx,
      args.workspaceId,
      MAX_PULS_MEMBERS,
    );

    // Jedan raspon pokriva obe nedelje, pa trend ne traži drugo čitanje.
    const activities = await ctx.db
      .query("activities")
      .withIndex("by_workspaceId_and_createdAt", (q) =>
        q
          .eq("workspaceId", args.workspaceId)
          .gte("createdAt", args.prevWeekStart)
          .lt("createdAt", args.weekEnd),
      )
      .take(MAX_PULS_ACTIVITIES);

    // `createdAt <= updatedAt` i `convertedAt <= updatedAt`, pa sve što je
    // nastalo ili pretvoreno od prošle nedelje ulazi u ovaj raspon.
    const ideas = await ctx.db
      .query("ideaNodes")
      .withIndex("by_workspaceId_and_archivedAt_and_updatedAt", (q) =>
        q
          .eq("workspaceId", args.workspaceId)
          .eq("archivedAt", null)
          .gte("updatedAt", args.prevWeekStart),
      )
      .take(MAX_PULS_IDEAS);

    const votes = await ctx.db
      .query("ideaVotes")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
      .take(MAX_PULS_VOTES);

    const inCurrent = (timestamp: number) =>
      timestamp >= args.weekStart && timestamp < args.weekEnd;
    const inPrevious = (timestamp: number) =>
      timestamp >= args.prevWeekStart && timestamp < args.weekStart;

    /**
     * Stanje „otvoreno i prekoračeno” u trenutku T. Za tekuću nedelju je tačno;
     * za prošlu je procena, jer izmene roka i arhiviranje nisu rekonstruisani.
     */
    const overdueAt = (task: Doc<"pages">, at: number) => {
      if (task.createdAt >= at) return false;
      if (task.dueDate === null || task.dueDate >= at) return false;
      const completedAt = taskCompletedAt(task);
      return completedAt === null || completedAt > at;
    };
    const currentBoundary = Math.min(args.now, args.weekEnd);

    let completedCurrent = 0;
    let completedPrevious = 0;
    let createdCurrent = 0;
    let createdPrevious = 0;
    let overdueCurrent = 0;
    let overduePrevious = 0;

    const areaStats = new Map(
      areas.map((area) => [
        area._id as Id<"areas">,
        { openCount: 0, doneCount: 0, completedThisWeek: 0 },
      ]),
    );
    type MemberStats = {
      completedThisWeek: number;
      activityCount: number;
      openCount: number;
      overdueCount: number;
    };
    const emptyStats = (): MemberStats => ({
      completedThisWeek: 0,
      activityCount: 0,
      openCount: 0,
      overdueCount: 0,
    });
    const memberStats = new Map<Id<"profiles">, MemberStats>(
      memberships.map((membership) => [membership.profile._id, emptyStats()]),
    );
    const unassigned = {
      completedThisWeek: 0,
      openCount: 0,
      overdueCount: 0,
    };
    const stuckCandidates: Array<Doc<"pages">> = [];

    for (const task of tasks) {
      const completedAt = taskCompletedAt(task);
      const isDone = task.taskStatus === "done";
      // Svi izvršioci su ravnopravni, pa zadatak ulazi u učinak svakog od njih.
      // Zbir po članovima zato može biti veći od broja zadataka — to su učešća,
      // ne zadaci.
      const assigneeIds = (await resolveTaskAssignees(ctx, task)).map(
        (entry) => entry.profileId,
      );
      const buckets: Array<Pick<
        MemberStats,
        "completedThisWeek" | "openCount" | "overdueCount"
      >> =
        assigneeIds.length === 0
          ? [unassigned]
          : assigneeIds.map(
              (profileId) =>
                memberStats.get(profileId) ??
                (() => {
                  // Zadatak zadužen članu koji je u međuvremenu arhiviran.
                  const created = emptyStats();
                  memberStats.set(profileId, created);
                  return created;
                })(),
            );

      if (completedAt !== null && inCurrent(completedAt)) {
        completedCurrent += 1;
        for (const stats of buckets) stats.completedThisWeek += 1;
      }
      if (completedAt !== null && inPrevious(completedAt)) {
        completedPrevious += 1;
      }
      if (inCurrent(task.createdAt)) createdCurrent += 1;
      if (inPrevious(task.createdAt)) createdPrevious += 1;

      if (overdueAt(task, currentBoundary)) {
        overdueCurrent += 1;
        for (const stats of buckets) stats.overdueCount += 1;
      }
      if (overdueAt(task, args.weekStart)) overduePrevious += 1;

      if (!isDone) {
        for (const stats of buckets) stats.openCount += 1;
      }

      const areaStat = areaStats.get(task.areaId);
      if (areaStat !== undefined) {
        if (isDone) areaStat.doneCount += 1;
        else areaStat.openCount += 1;
        if (completedAt !== null && inCurrent(completedAt)) {
          areaStat.completedThisWeek += 1;
        }
      }

      const stalledInProgress =
        task.taskStatus === "in_progress" &&
        workDaysBetween(task.updatedAt, args.now) >=
          STUCK_IN_PROGRESS_WORK_DAYS;
      const stalledBlocked =
        task.taskStatus === "blocked" &&
        args.now - task.updatedAt >= STUCK_BLOCKED_DAYS * DAY_MS;
      if (stalledInProgress || stalledBlocked) stuckCandidates.push(task);
    }

    for (const activity of activities) {
      if (!inCurrent(activity.createdAt)) continue;
      const stats = memberStats.get(activity.actorProfileId);
      if (stats !== undefined) stats.activityCount += 1;
    }

    const profileCache = new Map<
      Id<"profiles">,
      { displayName: string; avatarUrl: string | null } | null
    >();
    const loadProfile = async (profileId: Id<"profiles">) => {
      const cached = profileCache.get(profileId);
      if (cached !== undefined) return cached;
      const profile = await ctx.db.get("profiles", profileId);
      const value =
        profile === null
          ? null
          : {
              displayName: profile.displayName,
              avatarUrl:
                profile.avatarStorageId === undefined
                  ? null
                  : await ctx.storage.getUrl(profile.avatarStorageId),
            };
      profileCache.set(profileId, value);
      return value;
    };

    const activeMemberIds = new Set(
      memberships.map((membership) => membership.profile._id as string),
    );
    const members = [];
    for (const [profileId, stats] of memberStats) {
      const profile = await loadProfile(profileId);
      if (profile === null) continue;
      members.push({
        profileId,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        isArchived: !activeMemberIds.has(profileId),
        ...stats,
      });
    }
    members.sort(
      (a, b) =>
        b.completedThisWeek - a.completedThisWeek ||
        b.activityCount - a.activityCount ||
        a.displayName.localeCompare(b.displayName, "sr-Latn-RS"),
    );

    const areaLabels = new Map(areas.map((area) => [area._id, area.label]));
    stuckCandidates.sort((a, b) => a.updatedAt - b.updatedAt);
    const stuckTasks = [];
    for (const task of stuckCandidates.slice(0, MAX_STUCK_ROWS)) {
      const assigneeIds = (await resolveTaskAssignees(ctx, task)).map(
        (entry) => entry.profileId,
      );
      const assignees = [];
      for (const profileId of assigneeIds) {
        const assigneeProfile = await loadProfile(profileId);
        if (assigneeProfile === null) continue;
        assignees.push({
          profileId,
          displayName: assigneeProfile.displayName,
          avatarUrl: assigneeProfile.avatarUrl,
        });
      }
      stuckTasks.push({
        pageId: task._id,
        title: task.title,
        taskStatus: (task.taskStatus ?? "in_progress") as "in_progress" | "blocked",
        taskPriority: task.taskPriority,
        areaId: task.areaId,
        areaLabel: areaLabels.get(task.areaId) ?? "Bez oblasti",
        assignee: assignees[0] ?? null,
        assignees,
        dueDate: task.dueDate,
        lastTouchedAt: task.updatedAt,
      });
    }

    let ideasCreatedCurrent = 0;
    let ideasCreatedPrevious = 0;
    let ideasConvertedCurrent = 0;
    let ideasConvertedPrevious = 0;
    for (const idea of ideas) {
      if (inCurrent(idea.createdAt)) ideasCreatedCurrent += 1;
      if (inPrevious(idea.createdAt)) ideasCreatedPrevious += 1;
      if (idea.convertedAt !== null) {
        if (inCurrent(idea.convertedAt)) ideasConvertedCurrent += 1;
        if (inPrevious(idea.convertedAt)) ideasConvertedPrevious += 1;
      }
    }

    let votesCurrent = 0;
    let votesPrevious = 0;
    for (const vote of votes) {
      if (inCurrent(vote.createdAt)) votesCurrent += 1;
      if (inPrevious(vote.createdAt)) votesPrevious += 1;
    }

    return {
      range: { weekStart: args.weekStart, weekEnd: args.weekEnd },
      // `workspaces` nema `createdAt`; trenutak nastanka je `_creationTime`.
      startupCreatedAt: workspace._creationTime,
      summary: {
        completed: { current: completedCurrent, previous: completedPrevious },
        created: { current: createdCurrent, previous: createdPrevious },
        overdueOpen: { current: overdueCurrent, previous: overduePrevious },
        stuck: { current: stuckCandidates.length, previous: null },
      },
      stuckTasks,
      areas: areas.map((area) => ({
        areaId: area._id,
        key: area.key,
        label: area.label,
        ...(areaStats.get(area._id) ?? {
          openCount: 0,
          doneCount: 0,
          completedThisWeek: 0,
        }),
      })),
      members,
      unassigned,
      ideas: {
        created: {
          current: ideasCreatedCurrent,
          previous: ideasCreatedPrevious,
        },
        votes: { current: votesCurrent, previous: votesPrevious },
        converted: {
          current: ideasConvertedCurrent,
          previous: ideasConvertedPrevious,
        },
      },
      truncated:
        tasks.length === MAX_PULS_TASKS ||
        activities.length === MAX_PULS_ACTIVITIES ||
        ideas.length === MAX_PULS_IDEAS ||
        votes.length === MAX_PULS_VOTES,
    };
  },
});

/**
 * PROSTOR P9: nema cron-a — `crons.ts` ga više ne registruje (Puls je kartica u
 * Komandnom centru, bez obaveštenja). Funkcija ostaje nepozvana, a tip
 * `puls_ready` u validatoru i katalogu, da se postojeća obaveštenja i dalje
 * prikazuju i utišavaju.
 *
 * Ponedeljak ujutru: javlja svakom aktivnom članu da je Puls prošle nedelje
 * spreman. `weekRef` je četiri dana unazad — u svakoj zoni to pada u prošlu
 * nedelju, a klijent ga normalizuje na svoj lokalni ponedeljak.
 */
export const sendWeeklyPulsNotifications = internalMutation({
  args: {},
  returns: v.object({ notified: v.number(), workspaces: v.number() }),
  handler: async (ctx) => {
    const weekRef = Date.now() - 4 * DAY_MS;
    const weekKey = belgradeDayKey(weekRef);

    // `workspaces` nema indeks po arhivi: arhivirani se preskaču u prolazu, a
    // granica važi za aktivne projekte, kao u Devotionu.
    const workspaces: Array<Doc<"workspaces">> = [];
    for await (const workspace of ctx.db.query("workspaces")) {
      if (workspace.arhiviran === true) continue;
      workspaces.push(workspace);
      if (workspaces.length === MAX_CRON_STARTUPS) break;
    }

    let notified = 0;
    for (const workspace of workspaces) {
      const memberships = await aktivniClanoviProjekta(
        ctx,
        workspace._id,
        MAX_PULS_MEMBERS,
      );

      const copy = notificationCopy.pulsReady(workspace.name);
      for (const membership of memberships) {
        const notificationId = await createNotification(ctx, {
          recipientProfileId: membership.profile._id,
          workspaceId: workspace._id,
          type: "puls_ready",
          title: copy.title,
          body: copy.body,
          targetType: "puls",
          targetId: String(weekRef),
          actorProfileId: null,
          // Primalac je u ključu jer Puls ide svima, pa bi zajednički ključ
          // pustio samo prvog člana.
          dedupeKey: `puls_ready:${workspace._id}:${weekKey}:${membership.profile._id}`,
        });
        if (notificationId !== null) notified += 1;
      }
    }

    return { notified, workspaces: workspaces.length };
  },
});
