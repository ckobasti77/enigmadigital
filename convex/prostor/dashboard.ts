// Preneto iz Devotion packages/backend/convex/dashboard.ts (main @ c05c40f), SPAJANJE S03.

import { requireProfile } from "./lib/auth";
import { listMyActiveWorkspaces } from "./lib/my_scope";
import { summarizePage } from "./lib/pages";
import { prijavljenQuery } from "../lib/projekat";

export const getOverview = prijavljenQuery({
  args: {},
  handler: async (ctx) => {
    const profile = await requireProfile(ctx);
    // Devotion: prvih 20 članstava. Ovde: prvih 20 owner/urednik projekata
    // (bez client_viewer i arhiviranih), najnovije članstvo prvo (S01 §3.3).
    const moji = await listMyActiveWorkspaces(ctx, profile._id, 20);

    const workspaces = [];
    const workspaceIds = new Set<string>();
    for (const workspace of moji.values()) {
      workspaceIds.add(workspace._id);
      const areas = await ctx.db
        .query("areas")
        .withIndex("by_workspaceId_and_position", (q) =>
          q.eq("workspaceId", workspace._id),
        )
        .take(50);
      workspaces.push({ ...workspace, areas });
    }

    // Zadatak može imati više izvršilaca, pa se polazi od spiska učešća.
    const assignments = await ctx.db
      .query("taskAssignees")
      .withIndex("by_profile_active_sort", (q) =>
        q.eq("profileId", profile._id).eq("archivedAt", null),
      )
      .order("asc")
      .take(100);
    const myTasks = [];
    for (const assignment of assignments) {
      const task = await ctx.db.get("pages", assignment.taskPageId);
      if (
        task === null ||
        task.archivedAt !== null ||
        task.kind !== "task" ||
        !workspaceIds.has(task.workspaceId)
      ) {
        continue;
      }
      const workspace = workspaces.find((item) => item._id === task.workspaceId) ?? null;
      myTasks.push({ ...summarizePage(task), workspace });
    }
    myTasks.sort((a, b) => {
      if (a.taskStatus === "done" && b.taskStatus !== "done") return 1;
      if (a.taskStatus !== "done" && b.taskStatus === "done") return -1;
      if (a.dueDate === null && b.dueDate === null) return b.updatedAt - a.updatedAt;
      if (a.dueDate === null) return 1;
      if (b.dueDate === null) return -1;
      return a.dueDate - b.dueDate;
    });

    const recentActivity = [];
    for (const workspace of workspaces) {
      const rows = await ctx.db
        .query("activities")
        .withIndex("by_workspaceId_and_createdAt", (q) =>
          q.eq("workspaceId", workspace._id),
        )
        .order("desc")
        .take(8);
      for (const activity of rows) {
        const actor = await ctx.db.get("profiles", activity.actorProfileId);
        recentActivity.push({ ...activity, workspace, actor });
      }
    }
    recentActivity.sort((a, b) => b.createdAt - a.createdAt);

    return {
      profile: {
        ...profile,
        avatarUrl:
          profile.avatarStorageId === undefined
            ? null
            : await ctx.storage.getUrl(profile.avatarStorageId),
      },
      // `workspaces` nema `updatedAt`; redosled je redosled članstva.
      workspaces,
      myTasks: myTasks.slice(0, 40),
      recentActivity: recentActivity.slice(0, 30),
      summary: {
        startupCount: workspaces.length,
        openTaskCount: myTasks.filter((task) => task.taskStatus !== "done").length,
        blockedTaskCount: myTasks.filter((task) => task.taskStatus === "blocked").length,
      },
    };
  },
});
