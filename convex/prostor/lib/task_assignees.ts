// Preneto iz Devotion packages/backend/convex/lib/task_assignees.ts (main @ c05c40f), SPAJANJE S03.
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { requireProfilUProjektu } from "./auth";
import { MAX_TASK_ASSIGNEES } from "./validators";

type ReadCtx = QueryCtx | MutationCtx;

/**
 * Aktivni izvršioci u redosledu priključivanja. Prvi red je ujedno i vrednost
 * koja se ogleda u `pages.assigneeProfileId`.
 */
export async function listActiveTaskAssignees(
  ctx: ReadCtx,
  taskPageId: Id<"pages">,
) {
  const rows = await ctx.db
    .query("taskAssignees")
    .withIndex("by_task_active_created", (q) =>
      q.eq("taskPageId", taskPageId).eq("archivedAt", null),
    )
    .order("asc")
    .take(MAX_TASK_ASSIGNEES + 1);
  if (rows.length > MAX_TASK_ASSIGNEES) {
    throw new Error(
      `Zadatak može imati najviše ${MAX_TASK_ASSIGNEES} izvršilaca.`,
    );
  }
  return rows;
}

export type TaskAssigneeEntry = {
  profileId: Id<"profiles">;
  addedByProfileId: Id<"profiles">;
  createdAt: number;
};

/**
 * Spisak izvršilaca sa fallback-om na staru skalarnu kolonu. Zadatak koji je
 * nastao pre `taskAssignees` nema join redove sve dok migracija ne prođe — bez
 * ovog fallback-a bi se između deploya i backfilla prikazao kao nedodeljen.
 * Prvi upis u spisak sam popravlja red, jer polazi od ove iste liste.
 */
export async function resolveTaskAssignees(
  ctx: ReadCtx,
  page: Doc<"pages">,
): Promise<TaskAssigneeEntry[]> {
  if (page.kind !== "task") return [];
  const rows = await listActiveTaskAssignees(ctx, page._id);
  if (rows.length > 0) {
    return rows.map((row) => ({
      profileId: row.profileId,
      addedByProfileId: row.addedByProfileId,
      createdAt: row.createdAt,
    }));
  }
  if (page.assigneeProfileId === null) return [];
  return [
    {
      profileId: page.assigneeProfileId,
      addedByProfileId: page.createdByProfileId,
      createdAt: page.createdAt,
    },
  ];
}

export async function listActiveTaskAssigneeIds(
  ctx: ReadCtx,
  taskPageId: Id<"pages">,
) {
  const page = await ctx.db.get("pages", taskPageId);
  if (page === null) return [];
  const entries = await resolveTaskAssignees(ctx, page);
  return entries.map((entry) => entry.profileId);
}

export async function isTaskAssignee(
  ctx: ReadCtx,
  page: Doc<"pages">,
  profileId: Id<"profiles">,
) {
  const entries = await resolveTaskAssignees(ctx, page);
  return entries.some((entry) => entry.profileId === profileId);
}

/**
 * Prepisuje `pages.assigneeProfileId` iz kanonskog spiska. Poziva se posle svake
 * promene spiska, da projekcija i indeksi po izvršiocu nikad ne odlutaju.
 */
export async function syncTaskAssigneeProjection(
  ctx: MutationCtx,
  taskPageId: Id<"pages">,
  actorProfileId: Id<"profiles">,
  now: number,
) {
  const page = await ctx.db.get("pages", taskPageId);
  if (page === null || page.kind !== "task") return [];
  const rows = await listActiveTaskAssignees(ctx, taskPageId);
  const nextPrimary = rows[0]?.profileId ?? null;
  if (page.assigneeProfileId !== nextPrimary) {
    await ctx.db.patch("pages", taskPageId, {
      assigneeProfileId: nextPrimary,
      updatedByProfileId: actorProfileId,
      updatedAt: now,
    });
  }
  return rows;
}

/**
 * Osvežava ogledala statusa i sortiranja na redovima izvršilaca. Mora se pozvati
 * svaki put kad se zadatku promeni `taskStatus` ili `taskSortAt`, inače lista
 * „Moji zadaci” čita zastarele vrednosti iz indeksa.
 */
export async function syncTaskAssigneeMirrors(
  ctx: MutationCtx,
  args: {
    taskPageId: Id<"pages">;
    taskStatus: Doc<"pages">["taskStatus"];
    taskSortAt: number;
    now: number;
  },
) {
  const rows = await listActiveTaskAssignees(ctx, args.taskPageId);
  for (const row of rows) {
    if (
      row.taskStatus === args.taskStatus &&
      row.taskSortAt === args.taskSortAt
    ) {
      continue;
    }
    await ctx.db.patch("taskAssignees", row._id, {
      taskStatus: args.taskStatus,
      taskSortAt: args.taskSortAt,
      updatedAt: args.now,
    });
  }
}

export function normalizeAssigneeProfileIds(
  profileIds: Array<Id<"profiles">> | null | undefined,
) {
  if (profileIds === undefined || profileIds === null) return undefined;
  const unique: Array<Id<"profiles">> = [];
  for (const profileId of profileIds) {
    if (!unique.includes(profileId)) unique.push(profileId);
  }
  if (unique.length > MAX_TASK_ASSIGNEES) {
    throw new Error(
      `Zadatak može imati najviše ${MAX_TASK_ASSIGNEES} izvršilaca.`,
    );
  }
  return unique;
}

/**
 * Dovodi spisak izvršilaca u traženo stanje i vraća koga je dodala ova izmena —
 * pozivaocu je to jedini ulaz za obaveštenja o dodeli.
 */
export async function reconcileTaskAssignees(
  ctx: MutationCtx,
  args: {
    page: Doc<"pages">;
    profileIds: Array<Id<"profiles">>;
    actorProfileId: Id<"profiles">;
    now: number;
    /** Preskače proveru članstva kad je pozivalac već proverio profile. */
    membershipChecked?: boolean;
  },
) {
  if (args.page.kind !== "task") {
    return { added: [], removed: [] as Array<Id<"profiles">> };
  }
  const desired = normalizeAssigneeProfileIds(args.profileIds) ?? [];
  if (args.membershipChecked !== true) {
    for (const profileId of desired) {
      await requireProfilUProjektu(ctx, args.page.workspaceId, profileId);
    }
  }

  const existing = await ctx.db
    .query("taskAssignees")
    .withIndex("by_task_active_created", (q) =>
      q.eq("taskPageId", args.page._id),
    )
    .take(MAX_TASK_ASSIGNEES * 4);
  const byProfileId = new Map(existing.map((row) => [row.profileId, row]));

  const removed: Array<Id<"profiles">> = [];
  for (const row of existing) {
    if (row.archivedAt !== null || desired.includes(row.profileId)) continue;
    await ctx.db.patch("taskAssignees", row._id, {
      archivedAt: args.now,
      updatedAt: args.now,
    });
    removed.push(row.profileId);
  }

  const added: Array<Id<"profiles">> = [];
  for (const profileId of desired) {
    const row = byProfileId.get(profileId);
    if (row === undefined) {
      await ctx.db.insert("taskAssignees", {
        workspaceId: args.page.workspaceId,
        taskPageId: args.page._id,
        profileId,
        taskStatus: args.page.taskStatus,
        taskSortAt: args.page.taskSortAt,
        addedByProfileId: args.actorProfileId,
        archivedAt: null,
        createdAt: args.now,
        updatedAt: args.now,
      });
      added.push(profileId);
    } else if (row.archivedAt !== null) {
      await ctx.db.patch("taskAssignees", row._id, {
        archivedAt: null,
        taskStatus: args.page.taskStatus,
        taskSortAt: args.page.taskSortAt,
        addedByProfileId: args.actorProfileId,
        updatedAt: args.now,
      });
      added.push(profileId);
    }
  }

  await syncTaskAssigneeProjection(
    ctx,
    args.page._id,
    args.actorProfileId,
    args.now,
  );
  return { added, removed };
}

/** Skida jednog člana sa svih njegovih zadataka; koristi se u kaskadama. */
export async function archiveAssignmentsForProfile(
  ctx: MutationCtx,
  args: {
    profileId: Id<"profiles">;
    workspaceId?: Id<"workspaces">;
    now: number;
    limit: number;
  },
) {
  // Sa projektom se čita indeks tog projekta: član mnogih projekata bi kroz
  // indeks profila uz filter posle čitanja tiho ostao na delu zadataka (S04).
  const workspaceId = args.workspaceId;
  const scoped =
    workspaceId === undefined
      ? await ctx.db
          .query("taskAssignees")
          .withIndex("by_profile_active_sort", (q) =>
            q.eq("profileId", args.profileId).eq("archivedAt", null),
          )
          .take(args.limit + 1)
      : await ctx.db
          .query("taskAssignees")
          .withIndex("by_workspace_profile_active_sort", (q) =>
            q
              .eq("workspaceId", workspaceId)
              .eq("profileId", args.profileId)
              .eq("archivedAt", null),
          )
          .take(args.limit + 1);
  if (scoped.length > args.limit) {
    throw new Error(
      `Član je dodeljen na više od ${args.limit} zadataka. Prvo ih preraspodelite.`,
    );
  }
  for (const row of scoped) {
    await ctx.db.patch("taskAssignees", row._id, {
      archivedAt: args.now,
      updatedAt: args.now,
    });
    await syncTaskAssigneeProjection(
      ctx,
      row.taskPageId,
      args.profileId,
      args.now,
    );
  }
  return scoped.length;
}
