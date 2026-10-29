// Preneto iz Devotion packages/backend/convex/lib/page_creation.ts (main @ c05c40f), SPAJANJE S03.
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { getAvailableCanvasPosition } from "../canvasPlacement";
import { recordActivity } from "./activity";
import { requireProfilUProjektu } from "./auth";
import { insertContribution } from "./collaboration";
import { createNotification, notificationCopy } from "./notifications";
import { supportsTaskData, type WorkspacePageKind } from "./page_kinds";
import {
  newTableKey,
  requireTableColumns,
  syncTableSummary,
} from "./page_tables";
import { pageSearchText, pageTaskSortAt, requireVisiblePage } from "./pages";
import {
  normalizeAssigneeProfileIds,
  reconcileTaskAssignees,
} from "./task_assignees";
import { reconcileLegacyTaskCheckpoints } from "./task_checkpoints";
import {
  cleanRequiredText,
  normalizeTaskCheckpoints,
  normalizeTaskInstructions,
  validateTaskDueDate,
} from "./validators";

type ReadCtx = QueryCtx | MutationCtx;

export type { WorkspacePageKind } from "./page_kinds";
export type WorkspaceTaskStatus =
  | "backlog"
  | "next"
  | "in_progress"
  | "blocked"
  | "done";
export type WorkspaceTaskPriority = "low" | "medium" | "high" | "urgent";

export type WorkspacePageTarget = {
  workspaceId: Id<"workspaces">;
  areaId: Id<"areas">;
  parentPageId: Id<"pages"> | null;
  kind: WorkspacePageKind;
  taskStatus: WorkspaceTaskStatus | null;
  taskPriority: WorkspaceTaskPriority | null;
  /** Projekcija prvog iz `assigneeProfileIds`; kanon je `taskAssignees`. */
  assigneeProfileId: Id<"profiles"> | null;
  assigneeProfileIds: Array<Id<"profiles">>;
  dueDate: number | null;
  instructions: string | null;
  checkpoints: Array<{ id: string; text: string; completed: boolean }> | null;
};

export type PreparedWorkspacePage = {
  title: string;
  content: string;
  position: number;
  taskSortAt: number;
};

export function cleanPageContent(content: string) {
  if (content.length > 80_000) {
    throw new Error("Sadržaj može imati najviše 80.000 znakova.");
  }
  return content;
}

export function workspaceCanvasPreview(
  title: string,
  content: string,
  instructions?: string | null,
) {
  const source = instructions || content || title;
  return source
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
    .slice(0, 480);
}

export function cleanPagePosition(position: number | undefined, fallback: number) {
  const value = position ?? fallback;
  if (!Number.isFinite(value)) {
    throw new Error("Pozicija stranice nije ispravna.");
  }
  return value;
}

export async function requirePageArea(
  ctx: ReadCtx,
  workspaceId: Id<"workspaces">,
  areaId: Id<"areas">,
) {
  const area = await ctx.db.get("areas", areaId);
  if (area === null || area.workspaceId !== workspaceId) {
    throw new Error("Oblast nije pronađena u ovom projektu.");
  }
  return area;
}

export async function requirePageParent(
  ctx: ReadCtx,
  workspaceId: Id<"workspaces">,
  areaId: Id<"areas">,
  parentPageId: Id<"pages"> | null,
) {
  if (parentPageId === null) return null;
  const parent = await requireVisiblePage(ctx, parentPageId);
  if (parent.workspaceId !== workspaceId || parent.areaId !== areaId) {
    throw new Error("Roditeljska stranica mora biti u istoj oblasti.");
  }
  return parent;
}

export async function validateWorkspacePageTarget(
  ctx: ReadCtx,
  args: {
    workspaceId: Id<"workspaces">;
    areaId: Id<"areas">;
    parentPageId: Id<"pages"> | null;
    kind: WorkspacePageKind;
    taskStatus?: WorkspaceTaskStatus;
    taskPriority?: WorkspaceTaskPriority;
    assigneeProfileId?: Id<"profiles"> | null;
    assigneeProfileIds?: Array<Id<"profiles">> | null;
    dueDate?: number | null;
    instructions?: string;
    checkpoints?: Array<{ id: string; text: string; completed: boolean }>;
  },
): Promise<WorkspacePageTarget> {
  await requirePageArea(ctx, args.workspaceId, args.areaId);
  await requirePageParent(
    ctx,
    args.workspaceId,
    args.areaId,
    args.parentPageId,
  );

  // Skalarni `assigneeProfileId` je i dalje prihvaćen ulaz i znači spisak od
  // jednog člana; `assigneeProfileIds` ima prednost kad su oba prosleđena.
  const requestedAssignees =
    normalizeAssigneeProfileIds(args.assigneeProfileIds) ??
    (args.assigneeProfileId === undefined || args.assigneeProfileId === null
      ? undefined
      : [args.assigneeProfileId]);

  const hasTaskData =
    args.taskStatus !== undefined ||
    args.taskPriority !== undefined ||
    (requestedAssignees !== undefined && requestedAssignees.length > 0) ||
    (args.dueDate !== undefined && args.dueDate !== null) ||
    args.instructions !== undefined ||
    args.checkpoints !== undefined;
  if (!supportsTaskData(args.kind) && hasTaskData) {
    throw new Error("Task podaci se mogu dodati samo task stranici.");
  }

  for (const profileId of requestedAssignees ?? []) {
    await requireProfilUProjektu(ctx, args.workspaceId, profileId);
  }
  const dueDate = validateTaskDueDate(args.dueDate);
  const instructions = normalizeTaskInstructions(args.instructions);
  const checkpoints = normalizeTaskCheckpoints(args.checkpoints);

  const isTaskKind = supportsTaskData(args.kind);
  const assigneeProfileIds = isTaskKind ? requestedAssignees ?? [] : [];
  return {
    workspaceId: args.workspaceId,
    areaId: args.areaId,
    parentPageId: args.parentPageId,
    kind: args.kind,
    taskStatus: isTaskKind ? args.taskStatus ?? "backlog" : null,
    taskPriority: isTaskKind ? args.taskPriority ?? "medium" : null,
    assigneeProfileId: assigneeProfileIds[0] ?? null,
    assigneeProfileIds,
    dueDate: isTaskKind ? dueDate ?? null : null,
    instructions: isTaskKind ? instructions ?? null : null,
    checkpoints: isTaskKind ? checkpoints ?? null : null,
  };
}

export function prepareWorkspacePage(
  target: WorkspacePageTarget,
  args: {
    title: string;
    content: string;
    position?: number;
    now: number;
  },
): PreparedWorkspacePage {
  const title = cleanRequiredText(args.title, "Naslov", 200);
  const content = cleanPageContent(args.content);
  const position = cleanPagePosition(args.position, args.now);
  return {
    title,
    content,
    position,
    taskSortAt: pageTaskSortAt(target.dueDate, args.now),
  };
}

export async function insertWorkspacePage(
  ctx: MutationCtx,
  args: {
    target: WorkspacePageTarget;
    page: PreparedWorkspacePage;
    actorProfileId: Id<"profiles">;
    now: number;
  },
) {
  const pageId = await ctx.db.insert("pages", {
    workspaceId: args.target.workspaceId,
    areaId: args.target.areaId,
    parentPageId: args.target.parentPageId,
    kind: args.target.kind,
    title: args.page.title,
    searchText: pageSearchText(args.page.title, args.page.content),
    revision: 0,
    treeRevision: 0,
    canvasPreview: workspaceCanvasPreview(
      args.page.title,
      args.page.content,
      args.target.instructions,
    ),
    position: args.page.position,
    taskStatus: args.target.taskStatus,
    taskPriority: args.target.taskPriority,
    assigneeProfileId: args.target.assigneeProfileId,
    dueDate: args.target.dueDate,
    ...(args.target.instructions === null
      ? {}
      : { instructions: args.target.instructions }),
    ...(args.target.checkpoints === null
      ? {}
      : { checkpoints: args.target.checkpoints }),
    ...(supportsTaskData(args.target.kind)
      ? {
          checkpointTotal: args.target.checkpoints?.length ?? 0,
          checkpointCompleted:
            args.target.checkpoints?.filter((item) => item.completed).length ?? 0,
          checkpointRevision: 0,
        }
      : {}),
    taskSortAt: args.page.taskSortAt,
    completedAt:
      supportsTaskData(args.target.kind) && args.target.taskStatus === "done"
        ? args.now
        : null,
    createdByProfileId: args.actorProfileId,
    updatedByProfileId: args.actorProfileId,
    archivedAt: null,
    createdAt: args.now,
    updatedAt: args.now,
  });
  await ctx.db.insert("pageBodies", {
    pageId,
    content: args.page.content,
    updatedAt: args.now,
  });
  // Ne-preklapajuća pozicija umesto tvrdo kodiranog (0,0): bez ovoga se SVAKA
  // stranica napravljena sa kanvasa slaže na koordinatni početak i „nestane" pod
  // prethodnima. Web `areasV2.createPage` posle ovoga upiše svoju poziciju
  // (upsertPlacement), pa tu ostaje merodavna; direktni pozivaoci
  // (`pages.create` — mobilni kanvas, `thoughts` konverzija) dobijaju baš ovu.
  // Ako je kanvas prepun za auto-raspored, degradiraj na (0,0) umesto pada.
  let placementX = 0;
  let placementY = 0;
  try {
    const available = await getAvailableCanvasPosition(ctx, {
      workspaceId: args.target.workspaceId,
      areaId: args.target.areaId,
      rootPageId: args.target.parentPageId,
    });
    placementX = available.x;
    placementY = available.y;
  } catch {
    // Kanvas ima previše stavki za automatski raspored — zadrži (0,0).
  }
  await ctx.db.insert("pageCanvasPlacements", {
    workspaceId: args.target.workspaceId,
    areaId: args.target.areaId,
    rootPageId: args.target.parentPageId,
    pageId,
    x: placementX,
    y: placementY,
    updatedByProfileId: args.actorProfileId,
    createdAt: args.now,
    updatedAt: args.now,
  });
  if (args.target.kind === "table") {
    // Prazna tabela nije upotrebljiva — startuje sa jednom kolonom i jednim
    // redom, pa korisnik odmah ima gde da kuca.
    const insertedPage = await ctx.db.get("pages", pageId);
    if (insertedPage === null) {
      throw new Error("Kreirana tabela nije moguće učitati.");
    }
    await requireTableColumns(ctx, insertedPage, args.actorProfileId, args.now);
    await ctx.db.insert("pageTableRows", {
      workspaceId: args.target.workspaceId,
      areaId: args.target.areaId,
      pageId,
      rowKey: newTableKey("row", 0, args.now),
      position: 0,
      cells: {},
      updatedByProfileId: args.actorProfileId,
      archivedAt: null,
      createdAt: args.now,
      updatedAt: args.now,
    });
    await syncTableSummary(ctx, insertedPage, args.actorProfileId, args.now);
  }
  if (args.target.kind === "file") {
    await ctx.db.patch("pages", pageId, { fileCount: 0 });
  }
  if (supportsTaskData(args.target.kind)) {
    const insertedPage = await ctx.db.get("pages", pageId);
    if (insertedPage === null) {
      throw new Error("Kreirani zadatak nije moguće učitati.");
    }
    await reconcileTaskAssignees(ctx, {
      page: insertedPage,
      profileIds: args.target.assigneeProfileIds,
      actorProfileId: args.actorProfileId,
      now: args.now,
      membershipChecked: true,
    });
    await reconcileLegacyTaskCheckpoints(ctx, {
      page: insertedPage,
      checkpoints: args.target.checkpoints,
      actorProfileId: args.actorProfileId,
      now: args.now,
    });
  }
  await insertContribution(ctx, {
    workspaceId: args.target.workspaceId,
    targetKind: "page",
    targetId: pageId,
    authorProfileId: args.actorProfileId,
    content: args.page.content,
    sourceKind: "page_body",
    sourceId: pageId,
    createdAt: args.now,
  });
  await recordActivity(ctx, {
    workspaceId: args.target.workspaceId,
    actorProfileId: args.actorProfileId,
    action: "page_created",
    targetType: "page",
    targetId: pageId,
    title: `${supportsTaskData(args.target.kind) ? "Task" : "Stranica"} „${args.page.title}” je kreiran/a`,
  });
  // Zadatak koji odmah dobije izvršioce ih i obavesti — inače bi dodela
  // postojala samo u bazi dok je slučajno ne primete.
  if (supportsTaskData(args.target.kind)) {
    const actor = await ctx.db.get("profiles", args.actorProfileId);
    const copy = notificationCopy.taskAssigned(
      args.page.title,
      actor?.displayName ?? "Član tima",
    );
    for (const recipientProfileId of args.target.assigneeProfileIds) {
      await createNotification(ctx, {
        recipientProfileId,
        workspaceId: args.target.workspaceId,
        type: "task_assigned",
        title: copy.title,
        body: copy.body,
        targetType: "page",
        targetId: pageId,
        actorProfileId: args.actorProfileId,
      });
    }
  }
  return pageId;
}
