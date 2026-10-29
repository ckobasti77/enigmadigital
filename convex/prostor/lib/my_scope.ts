// Preneto iz Devotion packages/backend/convex/lib/my_scope.ts (main @ c05c40f), SPAJANJE S02.
import type { Infer } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { taskCompletedAt } from "./pages";
import { jeMenadzerProjekta } from "./auth";
import { isLockedForViewer, isPageLocked } from "./permissions";
import {
  MY_SCOPE_WORKSPACE_CAP,
  type areaMiniValidator,
  type personalTaskItemValidator,
  type workspaceMiniValidator,
  type taskItemValidator,
} from "./validators";

type ReadCtx = QueryCtx | MutationCtx;

export type WorkspaceMini = Infer<typeof workspaceMiniValidator>;
export type AreaMini = Infer<typeof areaMiniValidator>;
export type TaskItem = Infer<typeof taskItemValidator>;
export type PersonalTaskItem = Infer<typeof personalTaskItemValidator>;

/** Isti „bez roka" pomak kao `pageTaskSortAt` (`lib/pages.ts`). */
const NO_DUE_DATE_SORT_BASE = 8_000_000_000_000_000;

/**
 * Ključ sortiranja ličnog zadatka: rok, a bez roka najnoviji prvi posle onih
 * sa rokom. Računa se od `createdAt` (ne `updatedAt`), da izmena naslova ne
 * pomera zadatak u listi.
 */
export function personalTaskSortAt(dueDate: number | null, createdAt: number) {
  return dueDate ?? NO_DUE_DATE_SORT_BASE - createdAt;
}

export async function workspaceMiniOf(
  ctx: ReadCtx,
  workspace: Doc<"workspaces">,
): Promise<WorkspaceMini> {
  return {
    _id: workspace._id,
    name: workspace.name,
    logoUrl:
      workspace.brend?.logoStorageId === undefined
        ? null
        : await ctx.storage.getUrl(workspace.brend.logoStorageId),
  };
}

/**
 * Projekti u kojima je profil `owner` ili `urednik`, a projekat nije
 * arhiviran — jedini opseg iz koga lični nivo sme da čita (O5: bez
 * `client_viewer`; P28: najviše 50). Članstva se čitaju iz `members.by_user`,
 * najnovije prvo, i ostaju u read setu upita, pa uklanjanje iz projekta ili
 * arhiviranje reaktivno sakriva njegove stavke. Duplikat reda se preskače.
 */
export async function listMyActiveWorkspaces(
  ctx: ReadCtx,
  profileId: Id<"profiles">,
  cap: number = MY_SCOPE_WORKSPACE_CAP,
): Promise<Map<Id<"workspaces">, WorkspaceMini>> {
  const workspaces = new Map<Id<"workspaces">, WorkspaceMini>();
  const profile = await ctx.db.get("profiles", profileId);
  if (profile === null || profile.archivedAt !== null) return workspaces;
  const memberships = await ctx.db
    .query("members")
    .withIndex("by_user", (q) => q.eq("userId", profile.userId))
    .order("desc")
    .take(cap * 2);
  for (const membership of memberships) {
    if (membership.role === "client_viewer") continue;
    if (workspaces.has(membership.workspaceId)) continue;
    const workspace = await ctx.db.get("workspaces", membership.workspaceId);
    if (workspace === null || workspace.arhiviran === true) continue;
    workspaces.set(workspace._id, await workspaceMiniOf(ctx, workspace));
    if (workspaces.size === cap) break;
  }
  return workspaces;
}

/**
 * Da li je profil aktivan izvršilac zadatka. Kao `resolveTaskAssignees`: stari
 * zadatak bez join redova pada na skalarnu projekciju `assigneeProfileId`.
 */
export async function isActiveAssignee(
  ctx: ReadCtx,
  page: Doc<"pages">,
  profileId: Id<"profiles">,
) {
  const rows = await ctx.db
    .query("taskAssignees")
    .withIndex("by_task_and_profile", (q) =>
      q.eq("taskPageId", page._id).eq("profileId", profileId),
    )
    .take(4);
  if (rows.some((row) => row.archivedAt === null)) return true;
  if (rows.length > 0) return false;
  return page.assigneeProfileId === profileId;
}

/**
 * Vlasnik projekta ili vlasnik platforme (P7). Čita se samo za zaključane
 * zadatke, kojih je malo, pa dodatna čitanja ne opterećuju liste.
 */
async function isManagerOf(
  ctx: ReadCtx,
  workspaceId: Id<"workspaces">,
  profileId: Id<"profiles">,
) {
  return await jeMenadzerProjekta(ctx, workspaceId, profileId);
}

async function areaMiniOf(
  ctx: ReadCtx,
  areaId: Id<"areas">,
  cache: Map<Id<"areas">, AreaMini | null>,
) {
  if (cache.has(areaId)) return cache.get(areaId) ?? null;
  const area = await ctx.db.get("areas", areaId);
  const mini =
    area === null ? null : { _id: area._id, key: area.key, label: area.label };
  cache.set(areaId, mini);
  return mini;
}

/**
 * Stranica → stavka liste ličnog nivoa. `null` kad stranica ne postoji, nije
 * zadatak, arhivirana je ili joj startup nije u opsegu (`startups`). Polja se
 * NABRAJAJU — `taskItemValidator` odbija višak.
 */
export async function toTaskItem(
  ctx: ReadCtx,
  page: Doc<"pages"> | null,
  options: {
    profileId: Id<"profiles">;
    workspaces: Map<Id<"workspaces">, WorkspaceMini>;
    areaCache: Map<Id<"areas">, AreaMini | null>;
    /** Poznato iz reda izvršioca; inače se proverava. */
    isAssignee?: boolean;
  },
): Promise<TaskItem | null> {
  if (page === null || page.archivedAt !== null || page.kind !== "task") {
    return null;
  }
  const workspace = options.workspaces.get(page.workspaceId);
  if (workspace === undefined) return null;
  const isAssignee =
    options.isAssignee ?? (await isActiveAssignee(ctx, page, options.profileId));
  const isLocked = isPageLocked(page);
  return {
    _id: page._id,
    title: page.title,
    taskStatus: page.taskStatus,
    taskPriority: page.taskPriority,
    dueDate: page.dueDate,
    taskSortAt: page.taskSortAt,
    completedAt: taskCompletedAt(page),
    checkpointTotal: page.checkpointTotal ?? page.checkpoints?.length ?? 0,
    checkpointCompleted:
      page.checkpointCompleted ??
      page.checkpoints?.filter((item) => item.completed).length ??
      0,
    createdByProfileId: page.createdByProfileId,
    isCreator: page.createdByProfileId === options.profileId,
    isAssignee,
    isLocked,
    lockedForViewer:
      isLocked &&
      isLockedForViewer(page, {
        profileId: options.profileId,
        isManager: await isManagerOf(ctx, page.workspaceId, options.profileId),
      }),
    createdAt: page.createdAt,
    updatedAt: page.updatedAt,
    workspace,
    area: await areaMiniOf(ctx, page.areaId, options.areaCache),
  };
}

export function toPersonalTaskItem(doc: Doc<"personalTasks">): PersonalTaskItem {
  return {
    _id: doc._id,
    title: doc.title,
    notes: doc.notes ?? null,
    status: doc.status,
    priority: doc.priority,
    dueDate: doc.dueDate,
    sortAt: doc.sortAt,
    completedAt: doc.completedAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
