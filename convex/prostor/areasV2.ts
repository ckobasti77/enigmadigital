// Preneto iz Devotion packages/backend/convex/areasV2.ts (main @ c05c40f), SPAJANJE S03.
import { v, type Infer } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

import {
  DEFAULT_CANVAS_NODE_HEIGHT,
  DEFAULT_CANVAS_NODE_WIDTH,
  getAvailableCanvasPosition,
  getPlacement,
  MAX_CANVAS_PAGES,
  type CanvasRoot,
} from "./canvasPlacement";
import { recordActivity } from "./lib/activity";
import {
  requireProfilUProjektu,
  requireClanProjekta,
  vlasnikProjektaProfileId,
} from "./lib/auth";
import {
  latestRevision,
  recordRevision,
  revisionTargetKey,
} from "./lib/history";
import {
  createNotification,
  notificationCopy,
  notifyTaskStakeholders,
} from "./lib/notifications";
import {
  getPageBody,
  pageSnapshot,
  recordPageRevision,
  syncPageBodyMirror,
} from "./lib/page_content";
import {
  assertCanChangeChildren,
  assertCanMovePage,
  assertCanTouchLockedBranch,
  canChangeTaskStatus,
  canComment,
  canEditArea,
  canEditPage,
  canLayoutOnMap,
  canMovePage,
  conflictError,
  isPageLocked,
  LEGACY_NESTING_MESSAGE,
  LOCKED_PAGE_MESSAGE,
  permissionError,
  type Actor,
} from "./lib/permissions";
import {
  cleanPageContent,
  cleanPagePosition,
  insertWorkspacePage,
  prepareWorkspacePage,
  validateWorkspacePageTarget,
} from "./lib/page_creation";
import {
  getActivePageDescendants,
  nextCompletedAt,
  pageSearchText,
  pageTaskSortAt,
} from "./lib/pages";
import {
  getProfileSummary,
  profileSummaryValidator as profileSummaryObjectValidator,
} from "./lib/profile_summary";
import {
  relationEndpoints,
  relationOtherEndpoint,
  relationTouchesPage,
} from "./lib/page_relations";
import {
  listActiveTaskAssigneeIds,
  normalizeAssigneeProfileIds,
  reconcileTaskAssignees,
  resolveTaskAssignees,
  syncTaskAssigneeMirrors,
} from "./lib/task_assignees";
import { reconcileLegacyTaskCheckpoints } from "./lib/task_checkpoints";
import { trashPageTree } from "./lib/trash";
import {
  archiveCheckpointCanvasEdgesForArchivedPage,
  archiveCheckpointCanvasEdgesForMovedPage,
} from "./lib/task_checkpoint_canvas_edges";
import {
  checkpointItemValidator,
  cleanOptionalText,
  pageFileCategoryValidator,
  cleanRequiredText,
  normalizeTaskCheckpoints,
  normalizeTaskInstructions,
  pageKindValidator,
  taskCheckpointCanvasEndpointValidator,
  taskPriorityValidator,
  taskStatusValidator,
  validateTaskDueDate,
} from "./lib/validators";
import { projekatMutation, projekatQuery } from "../lib/projekat";

const MAX_CANVAS_EDGES = 400;
const MAX_RELATIONS_PER_AREA = 400;
const MAX_RELATION_CANDIDATES = 100;
const MAX_TREE_DEPTH = 64;
const MAX_LABEL_LENGTH = 200;
const MAX_PREVIEW_LENGTH = 480;
const DEFAULT_WIDTH = DEFAULT_CANVAS_NODE_WIDTH;
const DEFAULT_HEIGHT = DEFAULT_CANVAS_NODE_HEIGHT;
const MIN_WIDTH = 240;
const MIN_HEIGHT = 168;
const MAX_WIDTH = 720;
const MAX_HEIGHT = 1_000;
const MAX_AREA_BODY_LENGTH = 20_000;
const MAX_BATCH_LAYOUT_UPDATES = 100;
const MAX_LEGACY_AREA_EDGE_ROWS = 1_000;

type ReadCtx = QueryCtx | MutationCtx;

const rootPageIdValidator = v.union(v.id("pages"), v.null());
const nestingStatusValidator = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("withdrawn"),
  v.literal("cancelled"),
);
const profileSummaryValidator = v.union(
  v.object({
    _id: v.id("profiles"),
    displayName: v.string(),
    avatarUrl: v.union(v.string(), v.null()),
  }),
  v.null(),
);
const canvasPageValidator = v.object({
  _id: v.id("pages"),
  title: v.string(),
  text: v.string(),
  kind: pageKindValidator,
  parentPageId: rootPageIdValidator,
  taskStatus: v.union(taskStatusValidator, v.null()),
  taskPriority: v.union(taskPriorityValidator, v.null()),
  dueDate: v.union(v.number(), v.null()),
  checkpointTotal: v.number(),
  checkpointCompleted: v.number(),
  /** Prvi izvršilac — zadržan radi kompatibilnosti prikaza jednog avatara. */
  assignee: profileSummaryValidator,
  assignees: v.array(profileSummaryObjectValidator),
  fileCount: v.number(),
  fileCategory: v.union(pageFileCategoryValidator, v.null()),
  filePreviewUrl: v.union(v.string(), v.null()),
  tableRowCount: v.number(),
  tableColumnCount: v.number(),
  updatedAt: v.number(),
  x: v.number(),
  y: v.number(),
  width: v.number(),
  height: v.number(),
  canMove: v.boolean(),
  canResize: v.boolean(),
  canDetach: v.boolean(),
  /** PROSTOR P1 (P25: nova polja): naslov i sadržaj kartice; zaključanost. */
  canEdit: v.boolean(),
  isLocked: v.boolean(),
  creator: profileSummaryValidator,
});
const visibleEdgeValidator = v.object({
  _id: v.union(v.id("pageCanvasEdgesV2"), v.id("pageRelations")),
  source: v.id("pages"),
  target: v.id("pages"),
  label: v.union(v.string(), v.null()),
  kind: v.union(v.literal("canvas"), v.literal("relation")),
  canDelete: v.boolean(),
  canRequestDeletion: v.boolean(),
});
const visibleCheckpointEdgeValidator = v.object({
  _id: v.id("taskCheckpointCanvasEdges"),
  source: taskCheckpointCanvasEndpointValidator,
  target: taskCheckpointCanvasEndpointValidator,
  canDelete: v.boolean(),
  canRequestDeletion: v.boolean(),
});
const ghostValidator = v.object({
  requestId: v.id("pageNestingRequests"),
  pageId: v.id("pages"),
  title: v.string(),
  kind: pageKindValidator,
  sourceParentPageId: rootPageIdValidator,
  targetParentPageId: v.id("pages"),
  x: v.number(),
  y: v.number(),
  status: v.literal("pending"),
  requester: profileSummaryValidator,
  canApprove: v.boolean(),
  canReject: v.boolean(),
  canWithdraw: v.boolean(),
});
const scopeValidator = v.object({
  kind: v.union(v.literal("area"), v.literal("page")),
  workspaceId: v.id("workspaces"),
  areaId: v.id("areas"),
  rootPageId: rootPageIdValidator,
  title: v.string(),
  pageKind: v.union(pageKindValidator, v.null()),
  briefing: v.object({
    content: v.string(),
    instructions: v.union(v.string(), v.null()),
    revision: v.number(),
    ownerProfileId: v.id("profiles"),
    canEdit: v.boolean(),
  }),
});
const viewportValidator = v.object({
  x: v.number(),
  y: v.number(),
  zoom: v.number(),
  persisted: v.boolean(),
});
/** Oblik canvas payload-a — deljen između `getCanvas` i resolvera po jednom id-u. */
const canvasPayloadValidator = v.object({
  pages: v.array(canvasPageValidator),
  edges: v.array(visibleEdgeValidator),
  relations: v.array(visibleEdgeValidator),
  checkpointEdges: v.array(visibleCheckpointEdgeValidator),
  ghosts: v.array(ghostValidator),
  viewport: viewportValidator,
  truncated: v.boolean(),
  scope: scopeValidator,
});
const moveResultValidator = v.object({
  nestingStatus: v.union(v.literal("none"), v.literal("pending")),
  requestId: v.union(v.id("pageNestingRequests"), v.null()),
});
/**
 * PROSTOR P4: premeštanje je uvek odmah (`none`), ali tip ostaje širok da stari
 * klijenti koji još proveravaju `"pending"` i dalje prolaze tsc (P25).
 */
type MoveResult = Infer<typeof moveResultValidator>;
const relationPageValidator = v.object({
  pageId: v.id("pages"),
  title: v.string(),
  kind: pageKindValidator,
  parentPageId: rootPageIdValidator,
  areaId: v.id("areas"),
});
const listedRelationValidator = v.object({
  _id: v.id("pageRelations"),
  label: v.union(v.string(), v.null()),
  linkedPage: relationPageValidator,
  canDelete: v.boolean(),
  canRequestDeletion: v.boolean(),
});
const nestingInboxItemValidator = v.object({
  requestId: v.id("pageNestingRequests"),
  child: v.object({
    pageId: v.id("pages"),
    title: v.string(),
    kind: pageKindValidator,
    parentPageId: rootPageIdValidator,
  }),
  targetParent: v.object({
    pageId: v.id("pages"),
    title: v.string(),
    kind: pageKindValidator,
  }),
  requester: profileSummaryValidator,
  createdAt: v.number(),
  canApprove: v.boolean(),
  canReject: v.boolean(),
  canWithdraw: v.boolean(),
});

function clamp(value: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value)) {
    throw new Error("Vrednost kanvasa nije ispravna.");
  }
  return Math.min(Math.max(value, minimum), maximum);
}

function plainText(content: string | undefined) {
  if (!content) return "";
  return content
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
    .trim();
}

function canvasPreview(title: string, content: string, instructions?: string) {
  return plainText(instructions || content || title).slice(0, MAX_PREVIEW_LENGTH);
}

function pairKey(nodeAId: Id<"pages">, nodeBId: Id<"pages">) {
  return [nodeAId, nodeBId].sort().join(":");
}

async function requireArea(
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

async function requireStrictVisiblePage(
  ctx: ReadCtx,
  pageId: Id<"pages">,
  expected?: {
    workspaceId?: Id<"workspaces">;
    areaId?: Id<"areas">;
  },
) {
  const page = await ctx.db.get("pages", pageId);
  if (page === null || page.archivedAt !== null) {
    throw new Error("Stranica nije pronađena.");
  }
  if (
    (expected?.workspaceId !== undefined &&
      page.workspaceId !== expected.workspaceId) ||
    (expected?.areaId !== undefined && page.areaId !== expected.areaId)
  ) {
    throw new Error("Stranica nije pronađena u traženoj oblasti.");
  }

  const seen = new Set<string>([page._id]);
  let parentPageId = page.parentPageId;
  for (let depth = 0; parentPageId !== null; depth += 1) {
    if (depth >= MAX_TREE_DEPTH) {
      throw new Error("Hijerarhija stranica je preduboka.");
    }
    if (seen.has(parentPageId)) {
      throw new Error("Hijerarhija stranica sadrži kružnu vezu.");
    }
    seen.add(parentPageId);
    const parent = await ctx.db.get("pages", parentPageId);
    if (
      parent === null ||
      parent.archivedAt !== null ||
      parent.workspaceId !== page.workspaceId ||
      parent.areaId !== page.areaId
    ) {
      throw new Error("Hijerarhija stranica nije ispravna.");
    }
    parentPageId = parent.parentPageId;
  }
  return page;
}

async function requireScope(
  ctx: ReadCtx,
  workspaceId: Id<"workspaces">,
  areaId: Id<"areas">,
  rootPageId: CanvasRoot,
) {
  const area = await requireArea(ctx, workspaceId, areaId);
  const root =
    rootPageId === null
      ? null
      : await requireStrictVisiblePage(ctx, rootPageId, {
          workspaceId,
          areaId,
        });
  return { area, root };
}

export async function upsertPlacement(
  ctx: MutationCtx,
  args: {
    page: Doc<"pages">;
    rootPageId: CanvasRoot;
    actorProfileId: Id<"profiles">;
    x: number;
    y: number;
    width?: number;
    height?: number;
    now: number;
  },
) {
  const existing = await getPlacement(ctx, args.page._id);
  const value = {
    workspaceId: args.page.workspaceId,
    areaId: args.page.areaId,
    rootPageId: args.rootPageId,
    pageId: args.page._id,
    x: clamp(args.x, -100_000, 100_000),
    y: clamp(args.y, -100_000, 100_000),
    ...(args.width === undefined ? {} : { width: args.width }),
    ...(args.height === undefined ? {} : { height: args.height }),
    updatedByProfileId: args.actorProfileId,
    updatedAt: args.now,
  };
  if (existing === null) {
    await ctx.db.insert("pageCanvasPlacements", {
      ...value,
      createdAt: args.now,
    });
  } else {
    await ctx.db.patch("pageCanvasPlacements", existing._id, value);
  }

  const legacy = await ctx.db
    .query("pageCanvasNodes")
    .withIndex("by_pageId", (q) => q.eq("pageId", args.page._id))
    .unique();
  const legacyValue = {
    workspaceId: args.page.workspaceId,
    areaId: args.page.areaId,
    pageId: args.page._id,
    x: value.x,
    y: value.y,
    ...(args.width === undefined ? {} : { width: args.width }),
    ...(args.height === undefined ? {} : { height: args.height }),
    updatedAt: args.now,
  };
  if (legacy === null) {
    await ctx.db.insert("pageCanvasNodes", legacyValue);
  } else {
    await ctx.db.patch("pageCanvasNodes", legacy._id, legacyValue);
  }
}

export async function assertCanvasCapacity(
  ctx: ReadCtx,
  workspaceId: Id<"workspaces">,
  areaId: Id<"areas">,
  rootPageId: CanvasRoot,
  added = 1,
) {
  const pages = await ctx.db
    .query("pages")
    .withIndex(
      "by_workspace_area_parent_active_position",
      (q) =>
        q
          .eq("workspaceId", workspaceId)
          .eq("areaId", areaId)
          .eq("parentPageId", rootPageId)
          .eq("archivedAt", null),
    )
    .take(MAX_CANVAS_PAGES + 1);
  const pending =
    rootPageId === null
      ? []
      : await ctx.db
          .query("pageNestingRequests")
          .withIndex(
            "by_targetParentPageId_and_status_and_createdAt",
            (q) =>
              q
                .eq("targetParentPageId", rootPageId)
                .eq("status", "pending"),
          )
          .take(MAX_CANVAS_PAGES + 1);
  if (pages.length + pending.length + added > MAX_CANVAS_PAGES) {
    throw new Error(
      `Jedan kanvas može imati najviše ${MAX_CANVAS_PAGES} direktnih kartica.`,
    );
  }
}

async function pendingForChild(ctx: ReadCtx, childPageId: Id<"pages">) {
  return await ctx.db
    .query("pageNestingRequests")
    .withIndex("by_childPageId_and_status_and_updatedAt", (q) =>
      q.eq("childPageId", childPageId).eq("status", "pending"),
    )
    .unique();
}

async function assertNoPageCycle(
  ctx: ReadCtx,
  childPageId: Id<"pages">,
  targetParentPageId: Id<"pages">,
) {
  const initialTarget = await ctx.db.get("pages", targetParentPageId);
  if (initialTarget === null || initialTarget.archivedAt !== null) {
    throw new Error("Roditeljska stranica više nije dostupna.");
  }
  let cursor: Id<"pages"> | null = targetParentPageId;
  const seen = new Set<string>();
  let chainDepth = 0;
  while (cursor !== null) {
    if (chainDepth >= MAX_TREE_DEPTH) {
      throw new Error("Hijerarhija stranica je preduboka.");
    }
    if (cursor === childPageId || seen.has(cursor)) {
      throw new Error("Ugnježđavanje bi napravilo kružnu hijerarhiju.");
    }
    seen.add(cursor);
    const pending = await pendingForChild(ctx, cursor);
    if (pending !== null) {
      if (
        pending.workspaceId !== initialTarget.workspaceId ||
        pending.areaId !== initialTarget.areaId
      ) {
        throw new Error("Zahtev za ugnježđavanje ima neispravan opseg.");
      }
      cursor = pending.targetParentPageId;
      chainDepth += 1;
      continue;
    }
    const page: Doc<"pages"> | null = await ctx.db.get("pages", cursor);
    if (
      page === null ||
      page.archivedAt !== null ||
      page.workspaceId !== initialTarget.workspaceId ||
      page.areaId !== initialTarget.areaId
    ) {
      throw new Error("Roditeljska stranica više nije dostupna.");
    }
    cursor = page.parentPageId;
    chainDepth += 1;
  }
  return chainDepth;
}

async function assertReparentDepth(
  ctx: ReadCtx,
  childPageId: Id<"pages">,
  targetParentPageId: Id<"pages">,
) {
  const root = await ctx.db.get("pages", childPageId);
  if (root === null || root.archivedAt !== null) {
    throw new Error("Stranica nije dostupna za premeštanje.");
  }
  const targetChainDepth = await assertNoPageCycle(
    ctx,
    childPageId,
    targetParentPageId,
  );
  const queue: Array<{ pageId: Id<"pages">; depth: number }> = [
    { pageId: childPageId, depth: 0 },
  ];
  const seen = new Set<string>([childPageId]);
  let descendantCount = 0;
  let maximumDescendantDepth = 0;
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    const children = await ctx.db
      .query("pages")
      .withIndex("by_parentPageId_and_archivedAt", (q) =>
        q.eq("parentPageId", current.pageId).eq("archivedAt", null),
      )
      .take(251);
    descendantCount += children.length;
    if (descendantCount > 250) {
      throw new Error("Grana ima više od 250 aktivnih stranica.");
    }
    for (const child of children) {
      if (
        child.workspaceId !== root.workspaceId ||
        child.areaId !== root.areaId
      ) {
        throw new Error("Grana sadrži stranicu iz neispravnog opsega.");
      }
      if (seen.has(child._id)) {
        throw new Error("Hijerarhija stranica sadrži kružnu vezu.");
      }
      seen.add(child._id);
      const depth = current.depth + 1;
      maximumDescendantDepth = Math.max(maximumDescendantDepth, depth);
      queue.push({ pageId: child._id, depth });
    }
  }
  if (
    targetChainDepth + maximumDescendantDepth >
    MAX_TREE_DEPTH
  ) {
    throw new Error("Premeštanje bi napravilo preduboku hijerarhiju.");
  }
}

async function listActiveLegacyAreaEdges(
  ctx: ReadCtx,
  areaId: Id<"areas">,
) {
  const rows = await ctx.db
    .query("pageEdges")
    .withIndex("by_areaId", (q) => q.eq("areaId", areaId))
    .take(MAX_LEGACY_AREA_EDGE_ROWS + 1);
  if (rows.length > MAX_LEGACY_AREA_EDGE_ROWS) {
    throw new Error(
      "Oblast ima previše rollback veza za jednu atomsku radnju.",
    );
  }
  return rows.filter((edge) => edge.archivedAt == null);
}

export async function archiveCanvasEdgeWithLegacyProjection(
  ctx: MutationCtx,
  edge: Doc<"pageCanvasEdgesV2">,
  now: number,
) {
  await ctx.db.patch("pageCanvasEdgesV2", edge._id, {
    archivedAt: now,
    updatedAt: now,
  });
  if (edge.rootPageId !== null) return;
  const legacy = await ctx.db
    .query("pageEdges")
    .withIndex("by_areaId_and_pairKey", (q) =>
      q.eq("areaId", edge.areaId).eq("pairKey", edge.pairKey),
    )
    .unique();
  if (legacy === null) return;
  if (legacy.workspaceId !== edge.workspaceId) {
    throw new Error("Postojeća veza ne pripada ovom projektu.");
  }
  await ctx.db.patch("pageEdges", legacy._id, {
    archivedAt: now,
    updatedAt: now,
  });
}

export async function archiveEdgesForMovedPage(
  ctx: MutationCtx,
  page: Doc<"pages">,
  sourceRootPageId: CanvasRoot,
  now: number,
) {
  await archiveCheckpointCanvasEdgesForMovedPage(
    ctx,
    page._id,
    sourceRootPageId,
    now,
  );
  const batches = await Promise.all([
    ctx.db
      .query("pageCanvasEdgesV2")
      .withIndex("by_nodeAId_and_archivedAt", (q) =>
        q.eq("nodeAId", page._id).eq("archivedAt", null),
      )
      .take(MAX_CANVAS_EDGES + 1),
    ctx.db
      .query("pageCanvasEdgesV2")
      .withIndex("by_nodeBId_and_archivedAt", (q) =>
        q.eq("nodeBId", page._id).eq("archivedAt", null),
      )
      .take(MAX_CANVAS_EDGES + 1),
  ]);
  const edges = new Map(
    batches
      .flat()
      .filter(
        (edge) =>
          edge.workspaceId === page.workspaceId &&
          edge.areaId === page.areaId &&
          edge.rootPageId === sourceRootPageId,
      )
      .map((edge) => [edge._id, edge]),
  );
  if (edges.size > MAX_CANVAS_EDGES) {
    throw new Error("Kartica ima previše veza za jedno atomsko pomeranje.");
  }
  for (const edge of edges.values()) {
    await ctx.db.patch("pageCanvasEdgesV2", edge._id, {
      archivedAt: now,
      updatedAt: now,
    });
  }
  const legacyEdges = await listActiveLegacyAreaEdges(ctx, page.areaId);
  for (const edge of legacyEdges) {
    if (edge.nodeAId !== page._id && edge.nodeBId !== page._id) continue;
    await ctx.db.patch("pageEdges", edge._id, {
      archivedAt: now,
      updatedAt: now,
    });
  }
}

async function applySameAreaReparent(
  ctx: MutationCtx,
  args: {
    child: Doc<"pages">;
    targetParentPageId: CanvasRoot;
    actorProfileId: Id<"profiles">;
    position?: number;
    x?: number;
    y?: number;
    now: number;
    excludeRequestId?: Id<"pageNestingRequests">;
  },
) {
  await archiveEdgesForMovedPage(
    ctx,
    args.child,
    args.child.parentPageId,
    args.now,
  );
  const placement = await getPlacement(ctx, args.child._id);
  const targetPosition =
    args.x !== undefined && args.y !== undefined
      ? { x: args.x, y: args.y }
      : await getAvailableCanvasPosition(ctx, {
          workspaceId: args.child.workspaceId,
          areaId: args.child.areaId,
          rootPageId: args.targetParentPageId,
          excludePageId: args.child._id,
          excludeRequestId: args.excludeRequestId,
          width: placement?.width,
          height: placement?.height,
        });
  await ctx.db.patch("pages", args.child._id, {
    parentPageId: args.targetParentPageId,
    position: cleanPagePosition(args.position, args.now),
    treeRevision: (args.child.treeRevision ?? 0) + 1,
    updatedByProfileId: args.actorProfileId,
    updatedAt: args.now,
  });
  const patchedChild = {
    ...args.child,
    parentPageId: args.targetParentPageId,
  };
  await upsertPlacement(ctx, {
    page: patchedChild,
    rootPageId: args.targetParentPageId,
    actorProfileId: args.actorProfileId,
    x: targetPosition.x,
    y: targetPosition.y,
    width: placement?.width,
    height: placement?.height,
    now: args.now,
  });

  const pending = await pendingForChild(ctx, args.child._id);
  if (
    pending !== null &&
    pending._id !== args.excludeRequestId
  ) {
    await ctx.db.patch("pageNestingRequests", pending._id, {
      status: "cancelled",
      resolvedAt: args.now,
      updatedAt: args.now,
    });
  }
}

function cleanCanvasLabel(value: string | undefined) {
  const cleaned = cleanOptionalText(value, "Naziv veze", MAX_LABEL_LENGTH);
  return cleaned && cleaned.length > 0 ? cleaned : null;
}

function assertDirectCanvasPage(
  page: Doc<"pages">,
  rootPageId: CanvasRoot,
) {
  if (page.parentPageId !== rootPageId) {
    throw new Error("Kartica ne pripada ovom kanvasu.");
  }
}

/** Podnosilac zahteva za ugnježđavanje saznaje ishod, bez obzira na smer. */
async function notifyNestingResolution(
  ctx: MutationCtx,
  args: {
    request: Doc<"pageNestingRequests">;
    childTitle: string;
    approved: boolean;
    actorProfileId: Id<"profiles">;
    actorName: string;
  },
) {
  const copy = notificationCopy.requestResolved(
    args.childTitle,
    args.approved,
    args.actorName,
  );
  await createNotification(ctx, {
    recipientProfileId: args.request.requesterProfileId,
    workspaceId: args.request.workspaceId,
    type: "request_resolved",
    title: copy.title,
    body: copy.body,
    targetType: "approvals",
    targetId: args.request._id,
    actorProfileId: args.actorProfileId,
  });
}

// Stranica može biti na bilo kojoj strani relacije, pa se čitaju oba para
// indeksa — stari (note/task) i novi (A/B) — i rezultat se dedupira.
async function listActiveRelationsTouchingPage(
  ctx: MutationCtx,
  pageId: Id<"pages">,
): Promise<Doc<"pageRelations">[]> {
  const [asNote, asTask, asA, asB] = await Promise.all([
    ctx.db
      .query("pageRelations")
      .withIndex("by_notePageId_and_archivedAt", (q) =>
        q.eq("notePageId", pageId).eq("archivedAt", null),
      )
      .take(MAX_RELATIONS_PER_AREA + 1),
    ctx.db
      .query("pageRelations")
      .withIndex("by_taskPageId_and_archivedAt", (q) =>
        q.eq("taskPageId", pageId).eq("archivedAt", null),
      )
      .take(MAX_RELATIONS_PER_AREA + 1),
    ctx.db
      .query("pageRelations")
      .withIndex("by_pageAId_and_archivedAt", (q) =>
        q.eq("pageAId", pageId).eq("archivedAt", null),
      )
      .take(MAX_RELATIONS_PER_AREA + 1),
    ctx.db
      .query("pageRelations")
      .withIndex("by_pageBId_and_archivedAt", (q) =>
        q.eq("pageBId", pageId).eq("archivedAt", null),
      )
      .take(MAX_RELATIONS_PER_AREA + 1),
  ]);
  const rows = new Map(
    [...asNote, ...asTask, ...asA, ...asB].map((relation) => [
      relation._id,
      relation,
    ]),
  );
  if (rows.size > MAX_RELATIONS_PER_AREA) {
    throw new Error("Stranica ima previše relacija za jednu atomsku radnju.");
  }
  return Array.from(rows.values());
}

export async function moveWithinArea(
  ctx: MutationCtx,
  args: {
    child: Doc<"pages">;
    targetParent: Doc<"pages"> | null;
    actorProfileId: Id<"profiles">;
    position?: number;
    x?: number;
    y?: number;
    now: number;
  },
): Promise<MoveResult> {
  const targetParentPageId = args.targetParent?._id ?? null;
  if (args.child.parentPageId === targetParentPageId) {
    const pending = await pendingForChild(ctx, args.child._id);
    if (pending !== null) {
      await ctx.db.patch("pageNestingRequests", pending._id, {
        status: "withdrawn",
        resolvedAt: args.now,
        updatedAt: args.now,
      });
    }
    return {
      nestingStatus: "none" as const,
      requestId: null,
    };
  }
  // PROSTOR P4: ugnežđavanje je uvek direktno — dozvole (R5/R6) proverava
  // pozivalac; ovde ostaju ciklus, dubina i kapacitet kanvasa.
  if (args.targetParent !== null) {
    await assertReparentDepth(ctx, args.child._id, args.targetParent._id);
  }
  await assertCanvasCapacity(
    ctx,
    args.child.workspaceId,
    args.child.areaId,
    targetParentPageId,
  );
  await applySameAreaReparent(ctx, {
    child: args.child,
    targetParentPageId,
    actorProfileId: args.actorProfileId,
    position: args.position,
    x: args.x,
    y: args.y,
    now: args.now,
  });
  return {
    nestingStatus: "none" as const,
    requestId: null,
  };
}

export const resolveRoute = projekatQuery({
  uloga: "urednik",
  args: {
    areaId: v.optional(v.string()),
    pageId: v.optional(v.string()),
  },
  returns: v.union(
    v.object({
      kind: v.literal("area"),
      areaId: v.id("areas"),
    }),
    v.object({
      kind: v.literal("page"),
      pageId: v.id("pages"),
      areaId: v.id("areas"),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    await requireClanProjekta(ctx, args.workspaceId);
    if (args.pageId !== undefined) {
      const pageId = ctx.db.normalizeId("pages", args.pageId);
      if (pageId !== null) {
        const rawPage = await ctx.db.get("pages", pageId);
        try {
          const page = await requireStrictVisiblePage(ctx, pageId, {
            workspaceId: args.workspaceId,
          });
          return { kind: "page" as const, pageId: page._id, areaId: page.areaId };
        } catch {
          if (rawPage !== null && rawPage.workspaceId === args.workspaceId) {
            const fallbackArea = await ctx.db.get(
              "areas",
              rawPage.areaId,
            );
            if (
              fallbackArea !== null &&
              fallbackArea.workspaceId === args.workspaceId
            ) {
              return {
                kind: "area" as const,
                areaId: fallbackArea._id,
              };
            }
          }
        }
      }
    }
    if (args.areaId !== undefined) {
      const areaId = ctx.db.normalizeId("areas", args.areaId);
      if (areaId !== null) {
        const area = await ctx.db.get("areas", areaId);
        if (area !== null && area.workspaceId === args.workspaceId) {
          return { kind: "area" as const, areaId: area._id };
        }
      }
    }
    return null;
  },
});

export const getCanvas = projekatQuery({
  uloga: "urednik",
  args: {
    areaId: v.id("areas"),
    rootPageId: rootPageIdValidator,
  },
  returns: canvasPayloadValidator,
  handler: async (ctx, args) => {
    const member = await requireClanProjekta(ctx, args.workspaceId);
    const { area, root } = await requireScope(
      ctx,
      args.workspaceId,
      args.areaId,
      args.rootPageId,
    );
    return await assembleCanvas(ctx, {
      workspaceId: args.workspaceId,
      areaId: args.areaId,
      rootPageId: args.rootPageId,
      member,
      area,
      root,
    });
  },
});

type CanvasMember = Awaited<ReturnType<typeof requireClanProjekta>>;
type CanvasScope = Awaited<ReturnType<typeof requireScope>>;

/**
 * Sklapa canvas payload (stranice, ivice, relacije, checkpoint-ivice, ghosts,
 * viewport, scope) iz već razrešenog scope-a. Izdvojeno iz `getCanvas` da ga dele i
 * resolveri po jednom id-u (`getAreaCanvasByArea`/`getPageCanvasByPage`) — oni sami
 * urade `requireStartupMember` + `requireScope`, pa pozovu ovo. Lokalni `args` čuva
 * isti oblik kao ranije da telo (ispod) ostane nepromenjeno.
 */
async function assembleCanvas(
  ctx: ReadCtx,
  params: {
    workspaceId: Id<"workspaces">;
    areaId: Id<"areas">;
    rootPageId: CanvasRoot;
    member: CanvasMember;
    area: CanvasScope["area"];
    root: CanvasScope["root"];
  },
) {
  const { member, area, root } = params;
  const { profile } = member;
  const args = {
    workspaceId: params.workspaceId,
    areaId: params.areaId,
    rootPageId: params.rootPageId,
  };
  const rawPages = await ctx.db
      .query("pages")
      .withIndex(
        "by_workspace_area_parent_active_position",
        (q) =>
          q
            .eq("workspaceId", args.workspaceId)
            .eq("areaId", args.areaId)
            .eq("parentPageId", args.rootPageId)
            .eq("archivedAt", null),
      )
      .order("desc")
      .take(MAX_CANVAS_PAGES + 1);
    const pages = rawPages.slice(0, MAX_CANVAS_PAGES);
    const visibleIds = new Set(pages.map((page) => page._id));
    const [
      placements,
      rawEdges,
      rawRelations,
      rawCheckpointEdges,
      viewport,
      areaBody,
      rootBody,
    ] = await Promise.all([
        ctx.db
          .query("pageCanvasPlacements")
          .withIndex(
            "by_workspaceId_and_areaId_and_rootPageId",
            (q) =>
              q
                .eq("workspaceId", args.workspaceId)
                .eq("areaId", args.areaId)
                .eq("rootPageId", args.rootPageId),
          )
          .take(MAX_CANVAS_PAGES + 1),
        ctx.db
          .query("pageCanvasEdgesV2")
          .withIndex(
            "by_scope_active_pair",
            (q) =>
              q
                .eq("workspaceId", args.workspaceId)
                .eq("areaId", args.areaId)
                .eq("rootPageId", args.rootPageId)
                .eq("archivedAt", null),
          )
          .take(MAX_CANVAS_EDGES + 1),
        ctx.db
          .query("pageRelations")
          .withIndex("by_workspace_area_active_created", (q) =>
            q
              .eq("workspaceId", args.workspaceId)
              .eq("areaId", args.areaId)
              .eq("archivedAt", null),
          )
          .take(MAX_RELATIONS_PER_AREA + 1),
        ctx.db
          .query("taskCheckpointCanvasEdges")
          .withIndex("by_scope_active_pair", (q) =>
            q
              .eq("workspaceId", args.workspaceId)
              .eq("areaId", args.areaId)
              .eq("rootPageId", args.rootPageId)
              .eq("archivedAt", null),
          )
          .take(MAX_CANVAS_EDGES + 1),
        ctx.db
          .query("pageCanvasViewports")
          .withIndex(
            "by_viewerProfileId_and_workspaceId_and_areaId_and_rootPageId",
            (q) =>
              q
                .eq("viewerProfileId", profile._id)
                .eq("workspaceId", args.workspaceId)
                .eq("areaId", args.areaId)
                .eq("rootPageId", args.rootPageId),
          )
          .unique(),
        root === null
          ? ctx.db
              .query("areaBodies")
              .withIndex("by_areaId", (q) => q.eq("areaId", area._id))
              .unique()
          : Promise.resolve(null),
        root === null ? Promise.resolve(null) : getPageBody(ctx, root._id),
      ]);
    const placementsByPageId = new Map(
      placements.map((placement) => [placement.pageId, placement]),
    );
    const columnCount = Math.max(1, Math.ceil(Math.sqrt(pages.length)));
    // Tim je mali, a ista lica se ponavljaju na desetinama kartica — bez keša
    // bi jedan kanvas povukao stotine istih profila i potpisa avatara.
    const profileSummaries = new Map<
      Id<"profiles">,
      Awaited<ReturnType<typeof getProfileSummary>>
    >();
    const loadProfileSummary = async (profileId: Id<"profiles">) => {
      const cached = profileSummaries.get(profileId);
      if (cached !== undefined) return cached;
      const summary = await getProfileSummary(ctx, profileId);
      profileSummaries.set(profileId, summary);
      return summary;
    };
    const canvasPages = [];
    for (const [index, page] of pages.entries()) {
      {
        const placement = placementsByPageId.get(page._id);
        const assigneeEntries = await resolveTaskAssignees(ctx, page);
        const [body, creator] = await Promise.all([
          page.canvasPreview === undefined
            ? getPageBody(ctx, page._id)
            : Promise.resolve(null),
          loadProfileSummary(page.createdByProfileId),
        ]);
        const assignees = [];
        for (const entry of assigneeEntries) {
          const summary = await loadProfileSummary(entry.profileId);
          if (summary !== null) assignees.push(summary);
        }
        const column = index % columnCount;
        const row = Math.floor(index / columnCount);
        canvasPages.push({
          _id: page._id,
          title: page.title,
          text:
            page.canvasPreview ??
            canvasPreview(page.title, body?.content ?? "", page.instructions),
          kind: page.kind,
          parentPageId: page.parentPageId,
          taskStatus: page.taskStatus,
          taskPriority: page.taskPriority,
          dueDate: page.kind === "task" ? (page.dueDate ?? null) : null,
          checkpointTotal:
            page.kind === "task"
              ? (page.checkpointTotal ?? page.checkpoints?.length ?? 0)
              : 0,
          checkpointCompleted:
            page.kind === "task"
              ? (page.checkpointCompleted ??
                page.checkpoints?.filter((checkpoint) => checkpoint.completed)
                  .length ??
                0)
              : 0,
          assignee: assignees[0] ?? null,
          assignees,
          fileCount: page.kind === "file" ? page.fileCount ?? 0 : 0,
          fileCategory:
            page.kind === "file" ? page.filePrimaryCategory ?? null : null,
          filePreviewUrl:
            page.kind === "file" && page.filePreviewStorageId !== undefined
              ? await ctx.storage.getUrl(page.filePreviewStorageId)
              : null,
          tableRowCount: page.kind === "table" ? page.tableRowCount ?? 0 : 0,
          tableColumnCount:
            page.kind === "table" ? page.tableColumnCount ?? 0 : 0,
          updatedAt: page.updatedAt,
          x: placement?.x ?? (column - (columnCount - 1) / 2) * 310,
          y: placement?.y ?? Math.max(0, row) * 220,
          width: placement?.width ?? DEFAULT_WIDTH,
          height: placement?.height ?? DEFAULT_HEIGHT,
          // Raspored (pozicija, veličina) menja svaki član (PROSTOR P1, D20).
          canMove: canLayoutOnMap(member),
          canResize: canLayoutOnMap(member),
          canDetach: root !== null && canMovePage(member, page, root, null),
          canEdit: canEditPage(member, page),
          isLocked: isPageLocked(page),
          creator,
        });
      }
    }
    const canvasEdges = rawEdges
      .slice(0, MAX_CANVAS_EDGES)
      .filter(
        (edge) =>
          visibleIds.has(edge.nodeAId) && visibleIds.has(edge.nodeBId),
      )
      .map((edge) => ({
        _id: edge._id,
        source: edge.nodeAId,
        target: edge.nodeBId,
        label: edge.label,
        kind: "canvas" as const,
        // Veze i relacije menja svaki član (PROSTOR D20); glasanja nema (P4).
        canDelete: true,
        canRequestDeletion: false,
      }));
    const visibleRelations = rawRelations
      .slice(0, MAX_RELATIONS_PER_AREA)
      .map((relation) => ({ relation, ...relationEndpoints(relation) }))
      .filter(
        ({ relation, pageAId, pageBId }) =>
          relation.workspaceId === args.workspaceId &&
          visibleIds.has(pageAId) &&
          visibleIds.has(pageBId),
      )
      .map(({ relation, pageAId, pageBId }) => ({
        _id: relation._id,
        source: pageAId,
        target: pageBId,
        label: relation.label,
        kind: "relation" as const,
        canDelete: true,
        canRequestDeletion: false,
      }));
    const checkpointIds = new Set<Id<"taskCheckpoints">>();
    for (const edge of rawCheckpointEdges.slice(0, MAX_CANVAS_EDGES)) {
      if (edge.endpointA.kind === "task_checkpoint") {
        checkpointIds.add(edge.endpointA.id);
      }
      if (edge.endpointB.kind === "task_checkpoint") {
        checkpointIds.add(edge.endpointB.id);
      }
    }
    const checkpointRows = await Promise.all(
      [...checkpointIds].map((checkpointId) =>
        ctx.db.get("taskCheckpoints", checkpointId),
      ),
    );
    const activeCheckpointsById = new Map(
      checkpointRows
        .filter(
          (checkpoint): checkpoint is Doc<"taskCheckpoints"> =>
            checkpoint !== null &&
            checkpoint.archivedAt === null &&
            checkpoint.workspaceId === args.workspaceId &&
            checkpoint.areaId === args.areaId,
        )
        .map((checkpoint) => [checkpoint._id, checkpoint]),
    );
    const checkpointEndpointIsPresent = (
      endpoint:
        | { kind: "page"; id: Id<"pages"> }
        | { kind: "task_checkpoint"; id: Id<"taskCheckpoints"> },
      endpointPageId: Id<"pages">,
    ) => {
      if (endpoint.kind === "page") {
        return endpoint.id === endpointPageId && visibleIds.has(endpoint.id);
      }
      const checkpoint = activeCheckpointsById.get(endpoint.id);
      return (
        checkpoint?.taskPageId === endpointPageId &&
        (endpointPageId === args.rootPageId ||
          visibleIds.has(endpointPageId))
      );
    };
    const checkpointEdges = rawCheckpointEdges
      .slice(0, MAX_CANVAS_EDGES)
      .filter(
        (edge) =>
          checkpointEndpointIsPresent(
            edge.endpointA,
            edge.endpointAPageId,
          ) &&
          checkpointEndpointIsPresent(
            edge.endpointB,
            edge.endpointBPageId,
          ),
      )
      .map((edge) => ({
        _id: edge._id,
        source: edge.endpointA,
        target: edge.endpointB,
        canDelete: true,
        canRequestDeletion: false,
      }));
    // Zahteva za ugnežđavanje više nema (PROSTOR P4): duhovi se ne crtaju, a
    // polje ostaje u validatoru zbog starih klijenata (P25).
    const ghosts: Infer<typeof ghostValidator>[] = [];
    const ownerProfileId =
      root === null
        ? areaBody?.ownerProfileId ??
          (await vlasnikProjektaProfileId(ctx, member.workspace, member.profile._id))
        : root.createdByProfileId;
    return {
      pages: canvasPages,
      edges: canvasEdges,
      relations: visibleRelations,
      checkpointEdges,
      ghosts,
      viewport:
        viewport === null
          ? { x: 0, y: 0, zoom: 1, persisted: false }
          : {
              x: viewport.x,
              y: viewport.y,
              zoom: viewport.zoom,
              persisted: true,
            },
      truncated:
        rawPages.length > MAX_CANVAS_PAGES ||
        rawEdges.length > MAX_CANVAS_EDGES ||
        rawRelations.length > MAX_RELATIONS_PER_AREA ||
        rawCheckpointEdges.length > MAX_CANVAS_EDGES,
      scope: {
        kind: root === null ? ("area" as const) : ("page" as const),
        workspaceId: args.workspaceId,
        areaId: args.areaId,
        rootPageId: args.rootPageId,
        title: root?.title ?? area.label,
        pageKind: root?.kind ?? null,
        briefing: {
          content: rootBody?.content ?? areaBody?.content ?? "",
          instructions: root?.kind === "task" ? root.instructions ?? null : null,
          revision: root?.revision ?? areaBody?.revision ?? 0,
          ownerProfileId,
          // Opis oblasti menja svaki član; telo korena — po pravilu stranice.
          canEdit:
            root === null ? canEditArea(member, area) : canEditPage(member, root),
        },
      },
    };
}

/**
 * Resolver za embed: iz jednog `areaId` (koji mobilni prosleđuje kroz URL) razreši
 * pun scope i vrati canvas oblasti (`rootPageId: null`). `ctx.db.get` zaobilazi
 * proveru pristupa, ali ništa se ne vraća pre `requireStartupMember` — ne-član koji
 * pošalje tuđi `areaId` dobije grešku članstva; `requireScope` dodatno potvrđuje da
 * oblast pripada startup-u. Bez curenja podataka.
 */
export const getAreaCanvasByArea = projekatQuery({
  uloga: "urednik",
  args: { areaId: v.id("areas") },
  returns: canvasPayloadValidator,
  handler: async (ctx, args) => {
    const area = await ctx.db.get("areas", args.areaId);
    if (area === null) throw new Error("Oblast ne postoji.");
    const member = await requireClanProjekta(ctx, area.workspaceId);
    const { area: scopedArea, root } = await requireScope(
      ctx,
      area.workspaceId,
      args.areaId,
      null,
    );
    return await assembleCanvas(ctx, {
      workspaceId: area.workspaceId,
      areaId: args.areaId,
      rootPageId: null,
      member,
      area: scopedArea,
      root,
    });
  },
});

/**
 * Resolver za embed: iz jednog `pageId` razreši pun scope (startupId + areaId iz
 * dokumenta stranice) i vrati canvas te stranice (`rootPageId: pageId`). Ista
 * authz priča kao gore — vidi komentar na `getAreaCanvasByArea`; `requireScope`
 * (preko `requireStrictVisiblePage`) potvrđuje da je stranica vidljiva u startup-u.
 */
export const getPageCanvasByPage = projekatQuery({
  uloga: "urednik",
  args: { pageId: v.id("pages") },
  returns: canvasPayloadValidator,
  handler: async (ctx, args) => {
    const page = await ctx.db.get("pages", args.pageId);
    if (page === null) throw new Error("Stranica ne postoji.");
    const member = await requireClanProjekta(ctx, page.workspaceId);
    const { area, root } = await requireScope(
      ctx,
      page.workspaceId,
      page.areaId,
      args.pageId,
    );
    return await assembleCanvas(ctx, {
      workspaceId: page.workspaceId,
      areaId: page.areaId,
      rootPageId: args.pageId,
      member,
      area,
      root,
    });
  },
});

export const updateAreaBody = projekatMutation({
  uloga: "urednik",
  args: {
    areaId: v.id("areas"),
    content: v.string(),
    expectedRevision: v.number(),
  },
  returns: v.object({
    revision: v.number(),
    updatedAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const actor = await requireClanProjekta(ctx, args.workspaceId);
    const { profile, workspace } = actor;
    const area = await requireArea(ctx, args.workspaceId, args.areaId);
    if (
      !Number.isSafeInteger(args.expectedRevision) ||
      args.expectedRevision < 0
    ) {
      throw new Error("Revizija briefinga nije ispravna.");
    }
    if (args.content.length > MAX_AREA_BODY_LENGTH) {
      throw new Error(
        `Briefing može imati najviše ${MAX_AREA_BODY_LENGTH.toLocaleString("sr-Latn-RS")} znakova.`,
      );
    }
    // PROSTOR P1: opis oblasti je dokument tima — menja ga svaki član, a svaka
    // izmena ostaje u Istoriji izmena.
    if (!canEditArea(actor, area)) {
      throw permissionError("NEMA_DOZVOLU", "Oblast nije pronađena u ovom projektu.");
    }
    const existing = await ctx.db
      .query("areaBodies")
      .withIndex("by_areaId", (q) => q.eq("areaId", args.areaId))
      .unique();
    const currentRevision = existing?.revision ?? 0;
    if (currentRevision !== args.expectedRevision) {
      throw conflictError(
        {
          revision: currentRevision,
          updatedByProfileId: null,
          updatedAt: existing?.updatedAt ?? 0,
        },
        "KONFLIKT_IZMENA: Briefing je u međuvremenu izmenjen.",
      );
    }
    if (existing !== null && existing.content === args.content) {
      return {
        revision: existing.revision,
        updatedAt: existing.updatedAt,
      };
    }
    const now = Date.now();
    const revision = currentRevision + 1;
    if (existing === null) {
      await ctx.db.insert("areaBodies", {
        workspaceId: args.workspaceId,
        areaId: args.areaId,
        // Stari „vlasnik briefinga"; polje ostaje zbog šeme, prava ne daje.
        ownerProfileId: await vlasnikProjektaProfileId(ctx, workspace, profile._id),
        content: args.content,
        revision,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      await ctx.db.patch("areaBodies", existing._id, {
        content: args.content,
        revision,
        updatedAt: now,
      });
    }
    await recordRevision(ctx, {
      workspaceId: args.workspaceId,
      target: { kind: "area", id: area._id },
      before: { title: area.label, content: existing?.content ?? "" },
      after: { title: area.label, content: args.content },
      baseline: { authorProfileId: null, at: existing?.updatedAt ?? now },
      actorProfileId: profile._id,
      now,
      targetRevision: revision,
    });
    return { revision, updatedAt: now };
  },
});

/**
 * Opis oblasti za kartice Pregled (P12) bez celog kanvasa. `lastEditor` je
 * autor poslednje revizije iz Istorije izmena.
 */
export const getAreaBody = projekatQuery({
  uloga: "urednik",
  args: {
    areaId: v.id("areas"),
  },
  returns: v.object({
    areaId: v.id("areas"),
    label: v.string(),
    content: v.string(),
    revision: v.number(),
    updatedAt: v.union(v.number(), v.null()),
    lastEditor: v.union(profileSummaryObjectValidator, v.null()),
    permissions: v.object({
      canEdit: v.boolean(),
      canComment: v.boolean(),
    }),
  }),
  handler: async (ctx, args) => {
    const actor = await requireClanProjekta(ctx, args.workspaceId);
    const area = await requireArea(ctx, args.workspaceId, args.areaId);
    const [body, latest] = await Promise.all([
      ctx.db
        .query("areaBodies")
        .withIndex("by_areaId", (q) => q.eq("areaId", area._id))
        .unique(),
      latestRevision(
        ctx,
        revisionTargetKey({ kind: "area", id: area._id }),
      ),
    ]);
    const lastEditor =
      latest?.authorProfileId
        ? await getProfileSummary(ctx, latest.authorProfileId)
        : null;
    return {
      areaId: area._id,
      label: area.label,
      content: body?.content ?? "",
      revision: body?.revision ?? 0,
      updatedAt: body?.updatedAt ?? null,
      lastEditor,
      permissions: {
        canEdit: canEditArea(actor, area),
        canComment: canComment(actor),
      },
    };
  },
});

export const createPage = projekatMutation({
  uloga: "urednik",
  args: {
    areaId: v.id("areas"),
    rootPageId: rootPageIdValidator,
    kind: pageKindValidator,
    title: v.string(),
    content: v.optional(v.string()),
    position: v.optional(v.number()),
    taskStatus: v.optional(taskStatusValidator),
    taskPriority: v.optional(taskPriorityValidator),
    assigneeProfileId: v.optional(v.union(v.id("profiles"), v.null())),
    assigneeProfileIds: v.optional(v.array(v.id("profiles"))),
    dueDate: v.optional(v.union(v.number(), v.null())),
    instructions: v.optional(v.union(v.string(), v.null())),
    checkpoints: v.optional(
      v.union(v.array(checkpointItemValidator), v.null()),
    ),
    x: v.optional(v.number()),
    y: v.optional(v.number()),
  },
  returns: v.object({
    pageId: v.id("pages"),
    nestingStatus: v.union(v.literal("none"), v.literal("pending")),
    requestId: v.union(v.id("pageNestingRequests"), v.null()),
  }),
  handler: async (ctx, args): Promise<{ pageId: Id<"pages"> } & MoveResult> => {
    const actor = await requireClanProjekta(ctx, args.workspaceId);
    const { profile } = actor;
    const { root } = await requireScope(
      ctx,
      args.workspaceId,
      args.areaId,
      args.rootPageId,
    );
    // PROSTOR P4: nova kartica ide odmah pod koren (R6 nad korenom).
    assertCanChangeChildren(actor, root);
    const actualParentPageId = args.rootPageId;
    await assertCanvasCapacity(
      ctx,
      args.workspaceId,
      args.areaId,
      actualParentPageId,
    );
    const target = await validateWorkspacePageTarget(ctx, {
      workspaceId: args.workspaceId,
      areaId: args.areaId,
      parentPageId: actualParentPageId,
      kind: args.kind,
      taskStatus: args.taskStatus,
      taskPriority: args.taskPriority,
      assigneeProfileId: args.assigneeProfileId,
      assigneeProfileIds: args.assigneeProfileIds,
      dueDate: args.dueDate,
      instructions: args.instructions ?? undefined,
      checkpoints: args.checkpoints ?? undefined,
    });
    const now = Date.now();
    const page = prepareWorkspacePage(target, {
      title: args.title,
      content: cleanPageContent(args.content ?? ""),
      position: args.position,
      now,
    });
    const pageId = await insertWorkspacePage(ctx, {
      target,
      page,
      actorProfileId: profile._id,
      now,
    });
    await ctx.db.patch("pages", pageId, {
      treeRevision: 0,
      canvasPreview: canvasPreview(
        page.title,
        page.content,
        target.instructions ?? undefined,
      ),
    });
    const createdPage = await ctx.db.get("pages", pageId);
    if (createdPage === null) {
      throw new Error("Nova stranica nije sačuvana.");
    }
    const canvasPosition =
      args.x !== undefined && args.y !== undefined
        ? { x: args.x, y: args.y }
        : await getAvailableCanvasPosition(ctx, {
            workspaceId: args.workspaceId,
            areaId: args.areaId,
            rootPageId: actualParentPageId,
          });
    await upsertPlacement(ctx, {
      page: createdPage,
      rootPageId: actualParentPageId,
      actorProfileId: profile._id,
      x: canvasPosition.x,
      y: canvasPosition.y,
      now,
    });
    if (root !== null) {
      await assertReparentDepth(ctx, createdPage._id, root._id);
    }
    return {
      pageId,
      nestingStatus: "none" as const,
      requestId: null,
    };
  },
});

export const updatePage = projekatMutation({
  uloga: "urednik",
  args: {
    pageId: v.id("pages"),
    expectedRevision: v.number(),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    taskStatus: v.optional(taskStatusValidator),
    taskPriority: v.optional(taskPriorityValidator),
    /** Deprecated ulaz — znači „spisak izvršilaca = [x]” (ili prazan za null). */
    assigneeProfileId: v.optional(v.union(v.id("profiles"), v.null())),
    assigneeProfileIds: v.optional(v.array(v.id("profiles"))),
    dueDate: v.optional(v.union(v.number(), v.null())),
    instructions: v.optional(v.union(v.string(), v.null())),
    checkpoints: v.optional(
      v.union(v.array(checkpointItemValidator), v.null()),
    ),
  },
  returns: v.object({ revision: v.number() }),
  handler: async (ctx, args) => {
    const page = await requireStrictVisiblePage(ctx, args.pageId, {
      workspaceId: args.workspaceId,
    });
    const actor = await requireClanProjekta(ctx, args.workspaceId);
    const { profile } = actor;
    if (
      !Number.isSafeInteger(args.expectedRevision) ||
      page.revision !== args.expectedRevision
    ) {
      throw conflictError(page);
    }
    const hasTaskPatch =
      args.taskStatus !== undefined ||
      args.taskPriority !== undefined ||
      args.assigneeProfileId !== undefined ||
      args.assigneeProfileIds !== undefined ||
      args.dueDate !== undefined ||
      args.instructions !== undefined ||
      args.checkpoints !== undefined;
    if (page.kind !== "task" && hasTaskPatch) {
      throw new Error("Task podaci se mogu menjati samo na task stranici.");
    }
    const currentAssigneeIds =
      page.kind === "task"
        ? await listActiveTaskAssigneeIds(ctx, page._id)
        : [];
    const requestedAssigneeIds =
      normalizeAssigneeProfileIds(args.assigneeProfileIds) ??
      (args.assigneeProfileId === undefined
        ? undefined
        : args.assigneeProfileId === null
          ? []
          : [args.assigneeProfileId]);
    for (const profileId of requestedAssigneeIds ?? []) {
      await requireProfilUProjektu(ctx, args.workspaceId, profileId);
    }
    const body = await getPageBody(ctx, page._id);
    const title =
      args.title === undefined
        ? page.title
        : cleanRequiredText(args.title, "Naslov", 200);
    const currentContent = body?.content ?? "";
    const content =
      args.content === undefined
        ? currentContent
        : cleanPageContent(args.content);
    const taskStatus =
      page.kind === "task"
        ? args.taskStatus ?? page.taskStatus ?? "backlog"
        : null;
    const taskPriority =
      page.kind === "task"
        ? args.taskPriority ?? page.taskPriority ?? "medium"
        : null;
    const assigneeProfileIds =
      page.kind === "task"
        ? requestedAssigneeIds ?? currentAssigneeIds
        : [];
    const addedAssignees = assigneeProfileIds.filter(
      (profileId) => !currentAssigneeIds.includes(profileId),
    );
    const removedAssignees = currentAssigneeIds.filter(
      (profileId) => !assigneeProfileIds.includes(profileId),
    );
    const changesAssignee =
      addedAssignees.length > 0 || removedAssignees.length > 0;
    const assigneeProfileId =
      page.kind === "task" ? assigneeProfileIds[0] ?? null : null;
    const dueDate =
      page.kind === "task" && args.dueDate !== undefined
        ? validateTaskDueDate(args.dueDate) ?? null
        : page.dueDate;
    const instructions =
      page.kind === "task" && args.instructions !== undefined
        ? normalizeTaskInstructions(args.instructions)
        : page.instructions;
    const checkpoints =
      page.kind === "task" && args.checkpoints !== undefined
        ? (normalizeTaskCheckpoints(args.checkpoints) ?? [])
        : page.checkpoints;
    const changesCheckpoints =
      JSON.stringify(checkpoints ?? null) !==
      JSON.stringify(page.checkpoints ?? null);
    const unchanged =
      title === page.title &&
      content === currentContent &&
      taskStatus === page.taskStatus &&
      taskPriority === page.taskPriority &&
      !changesAssignee &&
      dueDate === page.dueDate &&
      instructions === page.instructions &&
      !changesCheckpoints;
    if (unchanged) return { revision: page.revision };

    // PROSTOR P1: svaki član menja sve; na zaključanoj stranici autor,
    // vlasnik startupa i admin, a izvršilac još i status (ODLUKA K01 D5) i
    // svoje učešće.
    if (!canEditPage(actor, page)) {
      const touchesOnlySelf = [...addedAssignees, ...removedAssignees].every(
        (profileId) => profileId === profile._id,
      );
      const claimsForSelf = addedAssignees.includes(profile._id);
      const isAssignee = currentAssigneeIds.includes(profile._id);
      if (
        title !== page.title ||
        content !== currentContent ||
        taskPriority !== page.taskPriority ||
        dueDate !== page.dueDate ||
        instructions !== page.instructions ||
        changesCheckpoints ||
        (changesAssignee && !touchesOnlySelf) ||
        (taskStatus !== page.taskStatus &&
          !canChangeTaskStatus(actor, page, isAssignee || claimsForSelf))
      ) {
        throw permissionError("ZAKLJUCANO", LOCKED_PAGE_MESSAGE);
      }
    }

    const now = Date.now();
    const revision = page.revision + 1;
    await ctx.db.patch("pages", page._id, {
      title,
      searchText: pageSearchText(title, content),
      canvasPreview: canvasPreview(title, content, instructions),
      revision,
      taskStatus,
      taskPriority,
      assigneeProfileId,
      dueDate,
      instructions,
      checkpoints,
      taskSortAt: pageTaskSortAt(dueDate, now),
      completedAt: nextCompletedAt(page, taskStatus, now),
      updatedByProfileId: profile._id,
      updatedAt: now,
    });
    if (page.kind === "task" && changesAssignee) {
      const patched = await ctx.db.get("pages", page._id);
      if (patched === null) throw new Error("Stranica nije pronađena.");
      await reconcileTaskAssignees(ctx, {
        page: patched,
        profileIds: assigneeProfileIds,
        actorProfileId: profile._id,
        now,
        membershipChecked: true,
      });
    }
    if (
      page.kind === "task" &&
      (taskStatus !== page.taskStatus || dueDate !== page.dueDate)
    ) {
      await syncTaskAssigneeMirrors(ctx, {
        taskPageId: page._id,
        taskStatus,
        taskSortAt: pageTaskSortAt(dueDate, now),
        now,
      });
    }
    if (page.kind === "task" && args.checkpoints !== undefined) {
      await reconcileLegacyTaskCheckpoints(ctx, {
        page,
        checkpoints,
        actorProfileId: profile._id,
        now,
      });
    }
    if (body === null) {
      await ctx.db.insert("pageBodies", {
        pageId: page._id,
        content,
        updatedAt: now,
      });
    } else if (content !== currentContent) {
      await ctx.db.patch("pageBodies", body._id, { content, updatedAt: now });
    }
    await syncPageBodyMirror(ctx, {
      page,
      bodyId: body?._id ?? null,
      previousContent: currentContent,
      content,
      actorProfileId: profile._id,
      now,
    });
    await recordPageRevision(ctx, {
      page,
      before: pageSnapshot(page, page.title, currentContent, page.instructions),
      after: pageSnapshot(page, title, content, instructions),
      actorProfileId: profile._id,
      now,
      revision,
    });
    await recordActivity(ctx, {
      workspaceId: page.workspaceId,
      actorProfileId: profile._id,
      action: page.kind === "task" ? "task_updated" : "page_updated",
      targetType: "page",
      targetId: page._id,
      title: `„${title}” je izmenjen/a`,
    });
    await notifyTaskStakeholders(ctx, {
      page,
      addedAssigneeProfileIds: addedAssignees,
      assigneeProfileIdsAfterChange: assigneeProfileIds,
      nextTaskStatus: taskStatus,
      actorProfileId: profile._id,
    });
    return { revision };
  },
});

export const archivePage = projekatMutation({
  uloga: "urednik",
  args: {
    pageId: v.id("pages"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const page = await requireStrictVisiblePage(ctx, args.pageId, {
      workspaceId: args.workspaceId,
    });
    const actor = await requireClanProjekta(ctx, args.workspaceId);
    // PROSTOR P3: cela grana ide u Korpu (svaki član, R7 + D6).
    await trashPageTree(ctx, { actor, page, now: Date.now() });
    return null;
  },
});

export const movePages = projekatMutation({
  uloga: "urednik",
  args: {
    areaId: v.id("areas"),
    rootPageId: rootPageIdValidator,
    updates: v.array(
      v.object({
        pageId: v.id("pages"),
        x: v.number(),
        y: v.number(),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile } = await requireClanProjekta(ctx, args.workspaceId);
    await requireScope(
      ctx,
      args.workspaceId,
      args.areaId,
      args.rootPageId,
    );
    if (args.updates.length > MAX_BATCH_LAYOUT_UPDATES) {
      throw new Error(
        `Odjednom se može pomeriti najviše ${MAX_BATCH_LAYOUT_UPDATES} kartica.`,
      );
    }
    const seen = new Set<string>();
    const pages = [];
    for (const update of args.updates) {
      if (seen.has(update.pageId)) {
        throw new Error("Ista kartica je poslata više puta.");
      }
      seen.add(update.pageId);
      const page = await requireStrictVisiblePage(ctx, update.pageId, {
        workspaceId: args.workspaceId,
        areaId: args.areaId,
      });
      assertDirectCanvasPage(page, args.rootPageId);
      pages.push({ page, update });
    }
    const now = Date.now();
    for (const { page, update } of pages) {
      const placement = await getPlacement(ctx, page._id);
      await upsertPlacement(ctx, {
        page,
        rootPageId: args.rootPageId,
        actorProfileId: profile._id,
        x: update.x,
        y: update.y,
        width: placement?.width,
        height: placement?.height,
        now,
      });
    }
    return null;
  },
});

export const resizePage = projekatMutation({
  uloga: "urednik",
  args: {
    areaId: v.id("areas"),
    rootPageId: rootPageIdValidator,
    pageId: v.id("pages"),
    width: v.number(),
    height: v.number(),
    x: v.optional(v.number()),
    y: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile } = await requireClanProjekta(ctx, args.workspaceId);
    await requireScope(
      ctx,
      args.workspaceId,
      args.areaId,
      args.rootPageId,
    );
    const page = await requireStrictVisiblePage(ctx, args.pageId, {
      workspaceId: args.workspaceId,
      areaId: args.areaId,
    });
    assertDirectCanvasPage(page, args.rootPageId);
    if ((args.x === undefined) !== (args.y === undefined)) {
      throw new Error("Pozicija kartice mora imati i x i y koordinatu.");
    }
    const placement = await getPlacement(ctx, page._id);
    const now = Date.now();
    await upsertPlacement(ctx, {
      page,
      rootPageId: args.rootPageId,
      actorProfileId: profile._id,
      x:
        args.x === undefined
          ? (placement?.x ?? 0)
          : clamp(args.x, -100_000, 100_000),
      y:
        args.y === undefined
          ? (placement?.y ?? 0)
          : clamp(args.y, -100_000, 100_000),
      width: clamp(args.width, MIN_WIDTH, MAX_WIDTH),
      height: clamp(args.height, MIN_HEIGHT, MAX_HEIGHT),
      now,
    });
    return null;
  },
});

export const resetPageSize = projekatMutation({
  uloga: "urednik",
  args: {
    areaId: v.id("areas"),
    rootPageId: rootPageIdValidator,
    pageId: v.id("pages"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile } = await requireClanProjekta(ctx, args.workspaceId);
    await requireScope(
      ctx,
      args.workspaceId,
      args.areaId,
      args.rootPageId,
    );
    const page = await requireStrictVisiblePage(ctx, args.pageId, {
      workspaceId: args.workspaceId,
      areaId: args.areaId,
    });
    assertDirectCanvasPage(page, args.rootPageId);
    const placement = await getPlacement(ctx, page._id);
    if (placement !== null) {
      const now = Date.now();
      await ctx.db.patch("pageCanvasPlacements", placement._id, {
        width: undefined,
        height: undefined,
        updatedByProfileId: profile._id,
        updatedAt: now,
      });
      const legacy = await ctx.db
        .query("pageCanvasNodes")
        .withIndex("by_pageId", (q) => q.eq("pageId", page._id))
        .unique();
      if (legacy === null) {
        await ctx.db.insert("pageCanvasNodes", {
          workspaceId: page.workspaceId,
          areaId: page.areaId,
          pageId: page._id,
          x: placement.x,
          y: placement.y,
          updatedAt: now,
        });
      } else {
        await ctx.db.patch("pageCanvasNodes", legacy._id, {
          width: undefined,
          height: undefined,
          updatedAt: now,
        });
      }
    }
    return null;
  },
});

export const saveViewport = projekatMutation({
  uloga: "urednik",
  args: {
    areaId: v.id("areas"),
    rootPageId: rootPageIdValidator,
    x: v.number(),
    y: v.number(),
    zoom: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile } = await requireClanProjekta(ctx, args.workspaceId);
    await requireScope(
      ctx,
      args.workspaceId,
      args.areaId,
      args.rootPageId,
    );
    const value = {
      workspaceId: args.workspaceId,
      areaId: args.areaId,
      rootPageId: args.rootPageId,
      viewerProfileId: profile._id,
      x: clamp(args.x, -100_000, 100_000),
      y: clamp(args.y, -100_000, 100_000),
      zoom: clamp(args.zoom, 0.1, 4),
      updatedAt: Date.now(),
    };
    const existing = await ctx.db
      .query("pageCanvasViewports")
      .withIndex(
        "by_viewerProfileId_and_workspaceId_and_areaId_and_rootPageId",
        (q) =>
          q
            .eq("viewerProfileId", profile._id)
            .eq("workspaceId", args.workspaceId)
            .eq("areaId", args.areaId)
            .eq("rootPageId", args.rootPageId),
      )
      .unique();
    if (existing === null) {
      await ctx.db.insert("pageCanvasViewports", {
        ...value,
        createdAt: value.updatedAt,
      });
    } else {
      await ctx.db.patch("pageCanvasViewports", existing._id, value);
    }
    if (args.rootPageId === null) {
      const legacyZoom = clamp(value.zoom, 0.5, 1.6);
      for (const kind of ["note", "task"] as const) {
        const legacy = await ctx.db
          .query("pageCanvases")
          .withIndex("by_ownerProfileId_and_areaId_and_kind", (q) =>
            q
              .eq("ownerProfileId", profile._id)
              .eq("areaId", args.areaId)
              .eq("kind", kind),
          )
          .unique();
        const legacyValue = {
          workspaceId: args.workspaceId,
          areaId: args.areaId,
          ownerProfileId: profile._id,
          kind,
          x: value.x,
          y: value.y,
          zoom: legacyZoom,
          updatedAt: value.updatedAt,
        };
        if (legacy === null) {
          await ctx.db.insert("pageCanvases", {
            ...legacyValue,
            createdAt: value.updatedAt,
          });
        } else {
          await ctx.db.patch("pageCanvases", legacy._id, legacyValue);
        }
      }
    }
    return null;
  },
});

export const connectPages = projekatMutation({
  uloga: "urednik",
  args: {
    areaId: v.id("areas"),
    rootPageId: rootPageIdValidator,
    sourcePageId: v.id("pages"),
    targetPageId: v.id("pages"),
    label: v.optional(v.string()),
  },
  returns: v.id("pageCanvasEdgesV2"),
  handler: async (ctx, args) => {
    const { profile } = await requireClanProjekta(ctx, args.workspaceId);
    await requireScope(
      ctx,
      args.workspaceId,
      args.areaId,
      args.rootPageId,
    );
    if (args.sourcePageId === args.targetPageId) {
      throw new Error("Kartica ne može biti povezana sama sa sobom.");
    }
    const [source, target] = await Promise.all([
      requireStrictVisiblePage(ctx, args.sourcePageId, {
        workspaceId: args.workspaceId,
        areaId: args.areaId,
      }),
      requireStrictVisiblePage(ctx, args.targetPageId, {
        workspaceId: args.workspaceId,
        areaId: args.areaId,
      }),
    ]);
    assertDirectCanvasPage(source, args.rootPageId);
    assertDirectCanvasPage(target, args.rootPageId);
    // Veze pravi svaki član (PROSTOR D20).
    const key = pairKey(source._id, target._id);
    const existing = await ctx.db
      .query("pageCanvasEdgesV2")
      .withIndex(
        "by_scope_active_pair",
        (q) =>
          q
            .eq("workspaceId", args.workspaceId)
            .eq("areaId", args.areaId)
            .eq("rootPageId", args.rootPageId)
            .eq("archivedAt", null)
            .eq("pairKey", key),
      )
      .first();
    const label = cleanCanvasLabel(args.label);
    const now = Date.now();
    let edgeId: Id<"pageCanvasEdgesV2">;
    let edgeLabel: string | null;
    let edgeAuthorProfileId: Id<"profiles"> | undefined;
    if (existing !== null) {
      edgeId = existing._id;
      edgeLabel = existing.label;
      edgeAuthorProfileId = existing.authorProfileId;
    } else {
      const activeEdges = await ctx.db
        .query("pageCanvasEdgesV2")
        .withIndex(
          "by_scope_active_pair",
          (q) =>
            q
              .eq("workspaceId", args.workspaceId)
              .eq("areaId", args.areaId)
              .eq("rootPageId", args.rootPageId)
              .eq("archivedAt", null),
        )
        .take(MAX_CANVAS_EDGES + 1);
      if (activeEdges.length >= MAX_CANVAS_EDGES) {
        throw new Error(`Kanvas može imati najviše ${MAX_CANVAS_EDGES} veza.`);
      }
      edgeId = await ctx.db.insert("pageCanvasEdgesV2", {
        workspaceId: args.workspaceId,
        areaId: args.areaId,
        rootPageId: args.rootPageId,
        nodeAId: source._id,
        nodeBId: target._id,
        pairKey: key,
        label,
        authorProfileId: profile._id,
        attribution: "author",
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      edgeLabel = label;
      edgeAuthorProfileId = profile._id;
    }
    if (args.rootPageId === null) {
      const legacy = await ctx.db
        .query("pageEdges")
        .withIndex("by_areaId_and_pairKey", (q) =>
          q.eq("areaId", args.areaId).eq("pairKey", key),
        )
        .unique();
      const legacyValue = {
        workspaceId: args.workspaceId,
        areaId: args.areaId,
        nodeAId: source._id,
        nodeBId: target._id,
        pairKey: key,
        label: edgeLabel,
        ...(edgeAuthorProfileId === undefined
          ? {}
          : { authorProfileId: edgeAuthorProfileId }),
        archivedAt: null,
        updatedAt: now,
      };
      if (legacy === null) {
        await ctx.db.insert("pageEdges", {
          ...legacyValue,
          createdAt: now,
        });
      } else {
        if (legacy.workspaceId !== args.workspaceId) {
          throw new Error("Postojeća veza ne pripada ovom projektu.");
        }
        await ctx.db.patch("pageEdges", legacy._id, legacyValue);
      }
    }
    return edgeId;
  },
});

export const disconnectPages = projekatMutation({
  uloga: "urednik",
  args: {
    areaId: v.id("areas"),
    rootPageId: rootPageIdValidator,
    edgeId: v.id("pageCanvasEdgesV2"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireClanProjekta(ctx, args.workspaceId);
    await requireScope(
      ctx,
      args.workspaceId,
      args.areaId,
      args.rootPageId,
    );
    const edge = await ctx.db.get("pageCanvasEdgesV2", args.edgeId);
    if (
      edge === null ||
      edge.archivedAt !== null ||
      edge.workspaceId !== args.workspaceId ||
      edge.areaId !== args.areaId ||
      edge.rootPageId !== args.rootPageId
    ) {
      throw new Error("Veza nije pronađena na ovom kanvasu.");
    }
    // Vezu uklanja svaki član (PROSTOR D20).
    const now = Date.now();
    await archiveCanvasEdgeWithLegacyProjection(ctx, edge, now);
    return null;
  },
});

export const listRelations = projekatQuery({
  uloga: "urednik",
  args: {
    pageId: v.id("pages"),
  },
  returns: v.object({
    relations: v.array(listedRelationValidator),
    candidates: v.array(relationPageValidator),
    candidatesTruncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const page = await requireStrictVisiblePage(ctx, args.pageId, {
      workspaceId: args.workspaceId,
    });
    await requireClanProjekta(ctx, args.workspaceId);
    // Stranica može biti na bilo kojoj strani relacije, pa se čitaju oba para
    // indeksa — stari (note/task) i novi (A/B) — i rezultat se dedupira.
    const relationBatches = await Promise.all(
      (
        [
          ["by_notePageId_and_archivedAt", "notePageId"],
          ["by_taskPageId_and_archivedAt", "taskPageId"],
          ["by_pageAId_and_archivedAt", "pageAId"],
          ["by_pageBId_and_archivedAt", "pageBId"],
        ] as const
      ).map(([indexName, field]) =>
        ctx.db
          .query("pageRelations")
          .withIndex(indexName, (q) =>
            q.eq(field, page._id).eq("archivedAt", null),
          )
          .take(MAX_RELATIONS_PER_AREA + 1),
      ),
    );
    const rawRelations = Array.from(
      new Map(
        relationBatches.flat().map((relation) => [relation._id, relation]),
      ).values(),
    );
    // Vidljivost relacije je po stranici, ne po oblasti — relacija sme da
    // spaja stranice iz različitih oblasti istog startupa.
    const scopedRelations = rawRelations
      .slice(0, MAX_RELATIONS_PER_AREA)
      .filter(
        (relation) =>
          relation.workspaceId === args.workspaceId &&
          relationTouchesPage(relation, page._id),
      );
    const linkedPageIds = Array.from(
      new Set(
        scopedRelations.flatMap((relation) => {
          const other = relationOtherEndpoint(relation, page._id);
          return other === null ? [] : [other];
        }),
      ),
    );
    const linkedPages = new Map(
      await Promise.all(
        linkedPageIds.map(async (linkedPageId) => [
          linkedPageId,
          await ctx.db.get("pages", linkedPageId),
        ] as const),
      ),
    );
    const relations = [];
    const linkedIds = new Set<string>();
    for (const relation of scopedRelations) {
      const linkedPageId = relationOtherEndpoint(relation, page._id);
      const linked =
        linkedPageId === null ? undefined : linkedPages.get(linkedPageId);
      if (
        linked === null ||
        linked === undefined ||
        linked.archivedAt !== null ||
        linked.workspaceId !== args.workspaceId
      ) {
        continue;
      }
      linkedIds.add(linked._id);
      relations.push({
        _id: relation._id,
        label: relation.label,
        linkedPage: {
          pageId: linked._id,
          title: linked.title,
          kind: linked.kind,
          parentPageId: linked.parentPageId,
          areaId: linked.areaId,
        },
        // Relacije menja svaki član (PROSTOR D20).
        canDelete: true,
        canRequestDeletion: false,
      });
    }
    // Veže se sve sa svim, pa su kandidati sve aktivne stranice startupa bez
    // obzira na vrstu i oblast — sem same stranice i onih koje su već
    // povezane. Redosled po poslednjoj izmeni, najskorije prve.
    const rawCandidates = await ctx.db
      .query("pages")
      .withIndex("by_workspaceId_and_archivedAt_and_updatedAt", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("archivedAt", null),
      )
      .order("desc")
      .take(MAX_RELATION_CANDIDATES * 3 + 1);
    const validCandidates = [];
    for (const candidate of rawCandidates) {
      if (candidate._id === page._id || linkedIds.has(candidate._id)) {
        continue;
      }
      validCandidates.push({
        pageId: candidate._id,
        title: candidate.title,
        kind: candidate.kind,
        parentPageId: candidate.parentPageId,
        areaId: candidate.areaId,
      });
    }
    return {
      relations,
      candidates: validCandidates.slice(0, MAX_RELATION_CANDIDATES),
      candidatesTruncated:
        validCandidates.length > MAX_RELATION_CANDIDATES ||
        rawCandidates.length > MAX_RELATION_CANDIDATES * 3,
    };
  },
});

export const createRelation = projekatMutation({
  uloga: "urednik",
  args: {
    pageAId: v.id("pages"),
    pageBId: v.id("pages"),
    label: v.optional(v.string()),
  },
  returns: v.id("pageRelations"),
  handler: async (ctx, args) => {
    const { profile } = await requireClanProjekta(ctx, args.workspaceId);
    if (args.pageAId === args.pageBId) {
      throw new Error("Stranica ne može biti povezana sama sa sobom.");
    }
    const [pageA, pageB] = await Promise.all([
      requireStrictVisiblePage(ctx, args.pageAId, {
        workspaceId: args.workspaceId,
      }),
      requireStrictVisiblePage(ctx, args.pageBId, {
        workspaceId: args.workspaceId,
      }),
    ]);
    // Relaciju pravi svaki član (PROSTOR D20).
    // Poredak endpointa je kanonski (isti `pairKey` bez obzira ko je izvor),
    // pa duplikat u suprotnom smeru ne može da nastane. Jedinstvenost para je
    // na nivou startupa jer relacija sme da spaja stranice različitih oblasti.
    const [firstPage, secondPage] =
      pageA._id < pageB._id ? [pageA, pageB] : [pageB, pageA];
    const key = pairKey(firstPage._id, secondPage._id);
    const existing = await ctx.db
      .query("pageRelations")
      .withIndex("by_workspaceId_and_pairKey_and_archivedAt", (q) =>
        q
          .eq("workspaceId", args.workspaceId)
          .eq("pairKey", key)
          .eq("archivedAt", null),
      )
      .first();
    if (existing !== null) {
      return existing._id;
    }
    // Limit ostaje po oblasti u kojoj red nastaje (oblast stranice A): on
    // ograničava koliko `getCanvas` čita za jednu oblast, pa mora da prati
    // `areaId` reda, a ne ukupan broj relacija startupa.
    const active = await ctx.db
      .query("pageRelations")
      .withIndex("by_workspace_area_active_created", (q) =>
        q
          .eq("workspaceId", args.workspaceId)
          .eq("areaId", pageA.areaId)
          .eq("archivedAt", null),
      )
      .take(MAX_RELATIONS_PER_AREA + 1);
    if (active.length >= MAX_RELATIONS_PER_AREA) {
      throw new Error(
        `Oblast može imati najviše ${MAX_RELATIONS_PER_AREA} relacija.`,
      );
    }
    const now = Date.now();
    return await ctx.db.insert("pageRelations", {
      workspaceId: args.workspaceId,
      areaId: pageA.areaId,
      // Stari par se i dalje popunjava dok migracija ne prođe kroz sve redove.
      notePageId: firstPage._id,
      taskPageId: secondPage._id,
      pageAId: firstPage._id,
      pageBId: secondPage._id,
      pairKey: key,
      label: cleanCanvasLabel(args.label),
      authorProfileId: profile._id,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const deleteRelation = projekatMutation({
  uloga: "urednik",
  args: {
    relationId: v.id("pageRelations"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireClanProjekta(ctx, args.workspaceId);
    const relation = await ctx.db.get("pageRelations", args.relationId);
    if (
      relation === null ||
      relation.archivedAt !== null ||
      relation.workspaceId !== args.workspaceId
    ) {
      throw new Error("Relacija nije pronađena.");
    }
    // Relaciju uklanja svaki član (PROSTOR D20).
    const now = Date.now();
    await ctx.db.patch("pageRelations", relation._id, {
      archivedAt: now,
      updatedAt: now,
    });
    return null;
  },
});

export const requestNesting = projekatMutation({
  uloga: "urednik",
  args: {
    childPageId: v.id("pages"),
    targetParentPageId: v.id("pages"),
    position: v.optional(v.number()),
    x: v.optional(v.number()),
    y: v.optional(v.number()),
  },
  returns: moveResultValidator,
  handler: async (ctx, args) => {
    const actor = await requireClanProjekta(ctx, args.workspaceId);
    const { profile } = actor;
    const [child, targetParent] = await Promise.all([
      requireStrictVisiblePage(ctx, args.childPageId, {
        workspaceId: args.workspaceId,
      }),
      requireStrictVisiblePage(ctx, args.targetParentPageId, {
        workspaceId: args.workspaceId,
      }),
    ]);
    if (child.areaId !== targetParent.areaId) {
      throw new Error("Ugnježđavanje je moguće samo unutar iste oblasti.");
    }
    if (child._id === targetParent._id) {
      throw new Error("Stranica ne može biti sopstveni roditelj.");
    }
    // PROSTOR P4: stari „zahtev" sada premešta odmah (R5 + R6).
    const currentParent =
      child.parentPageId === null
        ? null
        : await requireStrictVisiblePage(ctx, child.parentPageId, {
            workspaceId: args.workspaceId,
            areaId: child.areaId,
          });
    assertCanMovePage(actor, child, currentParent, targetParent);
    return await moveWithinArea(ctx, {
      child,
      targetParent,
      actorProfileId: profile._id,
      position: args.position,
      x: args.x,
      y: args.y,
      now: Date.now(),
    });
  },
});

export const approveNesting = projekatMutation({
  uloga: "urednik",
  args: {
    requestId: v.id("pageNestingRequests"),
  },
  returns: v.object({ status: nestingStatusValidator }),
  handler: async (ctx, args) => {
    await requireClanProjekta(ctx, args.workspaceId);
    // PROSTOR P4: odobravanje ugnežđavanja je ugašeno; stari klijent dobija
    // jasnu poruku, a zahtev ostaje kakav jeste (`closeLegacyRequests`).
    throw permissionError("STARI_TOK", LEGACY_NESTING_MESSAGE);
  },
});

export const rejectNesting = projekatMutation({
  uloga: "urednik",
  args: {
    requestId: v.id("pageNestingRequests"),
  },
  returns: v.object({ status: nestingStatusValidator }),
  handler: async (ctx, args) => {
    const { profile } = await requireClanProjekta(ctx, args.workspaceId);
    const request = await ctx.db.get("pageNestingRequests", args.requestId);
    if (request === null || request.workspaceId !== args.workspaceId) {
      throw new Error("Zahtev nije pronađen.");
    }
    if (request.parentAuthorProfileId !== profile._id) {
      throw new Error("Samo autor roditeljske stranice može odbiti zahtev.");
    }
    if (request.status !== "pending") return { status: request.status };
    const now = Date.now();
    await ctx.db.patch("pageNestingRequests", request._id, {
      status: "rejected",
      resolvedAt: now,
      updatedAt: now,
    });
    const rejectedChild = await ctx.db.get("pages", request.childPageId);
    await notifyNestingResolution(ctx, {
      request,
      childTitle: rejectedChild?.title ?? "stranica",
      approved: false,
      actorProfileId: profile._id,
      actorName: profile.displayName,
    });
    return { status: "rejected" as const };
  },
});

export const withdrawNesting = projekatMutation({
  uloga: "urednik",
  args: {
    requestId: v.id("pageNestingRequests"),
  },
  returns: v.object({ status: nestingStatusValidator }),
  handler: async (ctx, args) => {
    const { profile } = await requireClanProjekta(ctx, args.workspaceId);
    const request = await ctx.db.get("pageNestingRequests", args.requestId);
    if (request === null || request.workspaceId !== args.workspaceId) {
      throw new Error("Zahtev nije pronađen.");
    }
    if (request.requesterProfileId !== profile._id) {
      throw new Error("Samo podnosilac može povući zahtev.");
    }
    if (request.status !== "pending") return { status: request.status };
    const now = Date.now();
    await ctx.db.patch("pageNestingRequests", request._id, {
      status: "withdrawn",
      resolvedAt: now,
      updatedAt: now,
    });
    return { status: "withdrawn" as const };
  },
});

export const detachPage = projekatMutation({
  uloga: "urednik",
  args: {
    pageId: v.id("pages"),
  },
  returns: v.object({
    status: v.union(
      v.literal("detached"),
      v.literal("withdrawn"),
      v.literal("rejected"),
      v.literal("none"),
    ),
  }),
  handler: async (ctx, args) => {
    const page = await requireStrictVisiblePage(ctx, args.pageId, {
      workspaceId: args.workspaceId,
    });
    const actor = await requireClanProjekta(ctx, args.workspaceId);
    const pending = await pendingForChild(ctx, page._id);
    if (page.parentPageId !== null) {
      // PROSTOR P4 (R5): svaki član odvaja stranicu na vrh oblasti; stari
      // zahtev deteta se pri tome zatvara (`applySameAreaReparent`).
      const parent = await requireStrictVisiblePage(ctx, page.parentPageId, {
        workspaceId: args.workspaceId,
        areaId: page.areaId,
      });
      assertCanMovePage(actor, page, parent, null);
      await moveWithinArea(ctx, {
        child: page,
        targetParent: null,
        actorProfileId: actor.profile._id,
        now: Date.now(),
      });
      return { status: "detached" as const };
    }
    if (pending !== null) {
      const now = Date.now();
      await ctx.db.patch("pageNestingRequests", pending._id, {
        status: "withdrawn",
        resolvedAt: now,
        updatedAt: now,
      });
      return { status: "withdrawn" as const };
    }
    return { status: "none" as const };
  },
});

export const listNestingInbox = projekatQuery({
  uloga: "urednik",
  args: { },
  returns: v.object({
    incoming: v.array(nestingInboxItemValidator),
    outgoing: v.array(nestingInboxItemValidator),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireClanProjekta(ctx, args.workspaceId);
    // PROSTOR P4: zahteva za ugnežđavanje više nema; stari zahtevi se ne nude
    // kao radnje (zatvara ih `closeLegacyRequests`). Oblik ostaje (P25).
    return {
      incoming: [] as Infer<typeof nestingInboxItemValidator>[],
      outgoing: [] as Infer<typeof nestingInboxItemValidator>[],
      truncated: false,
    };
  },
});

export async function movePageAcrossAreasWithSidecars(
  ctx: MutationCtx,
  args: {
    page: Doc<"pages">;
    targetAreaId: Id<"areas">;
    actor: Actor;
    position?: number;
    now: number;
  },
): Promise<MoveResult> {
  const actorProfileId = args.actor.profile._id;
  if (args.page.areaId === args.targetAreaId) {
    throw new Error("Stranica je već u ciljnoj oblasti.");
  }
  const descendants = await getActivePageDescendants(ctx, args.page._id);
  const movedPages = [args.page, ...descendants];
  if (
    movedPages.some(
      (item) =>
        item.workspaceId !== args.page.workspaceId ||
        item.areaId !== args.page.areaId,
    )
  ) {
    throw new Error("Grana sadrži stranicu iz neispravnog opsega.");
  }
  // PROSTOR D6: granu sa zaključanom stranicom seli samo autor te stranice,
  // vlasnik startupa ili admin.
  assertCanTouchLockedBranch(args.actor, movedPages);
  await assertCanvasCapacity(
    ctx,
    args.page.workspaceId,
    args.targetAreaId,
    null,
  );

  const rootPlacement = await getPlacement(ctx, args.page._id);
  const targetRootPosition = await getAvailableCanvasPosition(ctx, {
    workspaceId: args.page.workspaceId,
    areaId: args.targetAreaId,
    rootPageId: null,
    width: rootPlacement?.width,
    height: rootPlacement?.height,
  });
  const movedIds = new Set(movedPages.map((item) => item._id));
  const movedPagesById = new Map(
    movedPages.map((item) => [item._id, item]),
  );
  const scopedEdges: Doc<"pageCanvasEdgesV2">[] = [];
  const scopedViewports: Doc<"pageCanvasViewports">[] = [];
  const pendingRequests = new Map<
    Id<"pageNestingRequests">,
    Doc<"pageNestingRequests">
  >();

  for (const moved of movedPages) {
    const [edges, viewports, pendingChild, pendingTargets] =
      await Promise.all([
        ctx.db
          .query("pageCanvasEdgesV2")
          .withIndex(
            "by_scope_active_pair",
            (q) =>
              q
                .eq("workspaceId", args.page.workspaceId)
                .eq("areaId", args.page.areaId)
                .eq("rootPageId", moved._id)
                .eq("archivedAt", null),
          )
          .take(MAX_CANVAS_EDGES + 1),
        ctx.db
          .query("pageCanvasViewports")
          .withIndex("by_rootPageId", (q) =>
            q.eq("rootPageId", moved._id),
          )
          .take(MAX_CANVAS_PAGES + 1),
        pendingForChild(ctx, moved._id),
        ctx.db
          .query("pageNestingRequests")
          .withIndex(
            "by_targetParentPageId_and_status_and_createdAt",
            (q) =>
              q
                .eq("targetParentPageId", moved._id)
                .eq("status", "pending"),
          )
          .take(MAX_CANVAS_PAGES + 1),
      ]);
    if (
      edges.length > MAX_CANVAS_EDGES ||
      viewports.length > MAX_CANVAS_PAGES ||
      pendingTargets.length > MAX_CANVAS_PAGES
    ) {
      throw new Error("Grana ima previše povezanih podataka za jednu radnju.");
    }
    scopedEdges.push(...edges);
    scopedViewports.push(
      ...viewports.filter(
        (viewport) =>
          viewport.workspaceId === args.page.workspaceId &&
          viewport.areaId === args.page.areaId,
      ),
    );
    if (pendingChild !== null) {
      pendingRequests.set(pendingChild._id, pendingChild);
    }
    for (const request of pendingTargets) {
      if (
        request.workspaceId === args.page.workspaceId &&
        request.areaId === args.page.areaId
      ) {
        pendingRequests.set(request._id, request);
      }
    }
    if (
      scopedEdges.length > MAX_CANVAS_EDGES ||
      scopedViewports.length > MAX_CANVAS_EDGES ||
      pendingRequests.size > MAX_CANVAS_EDGES
    ) {
      throw new Error("Grana ima previše sidecar zapisa za jednu radnju.");
    }
  }

  const edgeMoveDecisions = new Map<
    Id<"pageCanvasEdgesV2">,
    "move" | "archive"
  >();
  let targetEdgeReadCount = 0;
  for (const moved of movedPages) {
    const sourceScopeEdges = scopedEdges.filter(
      (edge) => edge.rootPageId === moved._id,
    );
    if (sourceScopeEdges.length === 0) continue;
    const targetScopeEdges = await ctx.db
      .query("pageCanvasEdgesV2")
      .withIndex("by_scope_active_pair", (q) =>
        q
          .eq("workspaceId", args.page.workspaceId)
          .eq("areaId", args.targetAreaId)
          .eq("rootPageId", moved._id)
          .eq("archivedAt", null),
      )
      .take(MAX_CANVAS_EDGES + 1);
    if (targetScopeEdges.length > MAX_CANVAS_EDGES) {
      throw new Error("Ciljni kanvas već ima previše aktivnih veza.");
    }
    targetEdgeReadCount += targetScopeEdges.length;
    if (targetEdgeReadCount > MAX_CANVAS_EDGES) {
      throw new Error("Ciljna grana ima previše sidecar veza za jednu radnju.");
    }
    const occupiedKeys = new Set(
      targetScopeEdges.map((edge) => edge.pairKey),
    );
    let addedEdges = 0;
    for (const edge of sourceScopeEdges) {
      if (
        !movedIds.has(edge.nodeAId) ||
        !movedIds.has(edge.nodeBId) ||
        movedPagesById.get(edge.nodeAId)?.kind !==
          movedPagesById.get(edge.nodeBId)?.kind ||
        occupiedKeys.has(edge.pairKey)
      ) {
        edgeMoveDecisions.set(edge._id, "archive");
        continue;
      }
      occupiedKeys.add(edge.pairKey);
      addedEdges += 1;
      edgeMoveDecisions.set(edge._id, "move");
    }
    if (targetScopeEdges.length + addedEdges > MAX_CANVAS_EDGES) {
      throw new Error(
        `Ciljni kanvas može imati najviše ${MAX_CANVAS_EDGES} veza.`,
      );
    }
  }

  // Relacije prate stranice, ne oblast. Red menja `areaId` (kanvas-scope)
  // samo kad se oba kraja sele zajedno; relacija čiji drugi kraj ostaje se ne
  // dira — postaje relacija preko granica oblasti i vidi se sa obe strane.
  const touchingRelations = new Map<
    Id<"pageRelations">,
    Doc<"pageRelations">
  >();
  for (const moved of movedPages) {
    const rows = await listActiveRelationsTouchingPage(ctx, moved._id);
    for (const relation of rows) {
      if (relation.workspaceId !== args.page.workspaceId) continue;
      touchingRelations.set(relation._id, relation);
    }
    if (touchingRelations.size > MAX_RELATIONS_PER_AREA) {
      throw new Error("Grana ima previše relacija za jednu radnju.");
    }
  }
  const relationRescopes: Doc<"pageRelations">[] = [];
  for (const relation of touchingRelations.values()) {
    const { pageAId, pageBId } = relationEndpoints(relation);
    const aMoves = movedIds.has(pageAId);
    const bMoves = movedIds.has(pageBId);
    if (!aMoves && !bMoves) continue;
    if (relation.areaId === args.targetAreaId) continue;
    if (aMoves && bMoves) {
      relationRescopes.push(relation);
      continue;
    }
    // Jedan kraj se seli: kanvas-scope se pomera samo kad drugi kraj VEĆ živi
    // u ciljnoj oblasti — posle premeštanja su oba kraja u njoj, pa linija
    // mora da se crta na njenom kanvasu. Bez ovoga bi red zauvek ostao vezan
    // za oblast u kojoj više nema nijednog kraja (nevidljiva linija + zauzet
    // limit stare oblasti), a dedup po pairKey bi sprečio ponovno kreiranje.
    const otherEndpoint = await ctx.db.get("pages", aMoves ? pageBId : pageAId);
    if (
      otherEndpoint !== null &&
      otherEndpoint.archivedAt === null &&
      otherEndpoint.areaId === args.targetAreaId
    ) {
      relationRescopes.push(relation);
    }
  }
  if (relationRescopes.length > 0) {
    const targetRelations = await ctx.db
      .query("pageRelations")
      .withIndex("by_workspace_area_active_created", (q) =>
        q
          .eq("workspaceId", args.page.workspaceId)
          .eq("areaId", args.targetAreaId)
          .eq("archivedAt", null),
      )
      .take(MAX_RELATIONS_PER_AREA + 1);
    if (
      targetRelations.length + relationRescopes.length >
      MAX_RELATIONS_PER_AREA
    ) {
      throw new Error(
        `Ciljna oblast može imati najviše ${MAX_RELATIONS_PER_AREA} relacija.`,
      );
    }
  }

  const legacySourceEdges = await listActiveLegacyAreaEdges(
    ctx,
    args.page.areaId,
  );

  for (const moved of movedPages) {
    await archiveCheckpointCanvasEdgesForArchivedPage(
      ctx,
      moved,
      args.now,
    );
  }
  await archiveEdgesForMovedPage(
    ctx,
    args.page,
    args.page.parentPageId,
    args.now,
  );
  for (const edge of scopedEdges) {
    if (edgeMoveDecisions.get(edge._id) !== "move") {
      await ctx.db.patch("pageCanvasEdgesV2", edge._id, {
        archivedAt: args.now,
        updatedAt: args.now,
      });
      continue;
    }
    await ctx.db.patch("pageCanvasEdgesV2", edge._id, {
      areaId: args.targetAreaId,
      updatedAt: args.now,
    });
  }
  for (const edge of legacySourceEdges) {
    const nodeAMoves = movedIds.has(edge.nodeAId);
    const nodeBMoves = movedIds.has(edge.nodeBId);
    if (!nodeAMoves && !nodeBMoves) continue;
    await ctx.db.patch("pageEdges", edge._id, {
      archivedAt: args.now,
      updatedAt: args.now,
    });
  }
  for (const relation of relationRescopes) {
    await ctx.db.patch("pageRelations", relation._id, {
      areaId: args.targetAreaId,
      updatedAt: args.now,
    });
  }
  for (const viewport of scopedViewports) {
    const duplicate = await ctx.db
      .query("pageCanvasViewports")
      .withIndex(
        "by_viewerProfileId_and_workspaceId_and_areaId_and_rootPageId",
        (q) =>
          q
            .eq("viewerProfileId", viewport.viewerProfileId)
            .eq("workspaceId", args.page.workspaceId)
            .eq("areaId", args.targetAreaId)
            .eq("rootPageId", viewport.rootPageId),
      )
      .first();
    if (duplicate === null) {
      await ctx.db.patch("pageCanvasViewports", viewport._id, {
        areaId: args.targetAreaId,
        updatedAt: args.now,
      });
    } else {
      await ctx.db.delete("pageCanvasViewports", viewport._id);
    }
  }
  for (const request of pendingRequests.values()) {
    await ctx.db.patch("pageNestingRequests", request._id, {
      status: "cancelled",
      resolvedAt: args.now,
      updatedAt: args.now,
    });
  }
  for (const moved of movedPages) {
    const isRoot = moved._id === args.page._id;
    const parentPageId = isRoot ? null : moved.parentPageId;
    await ctx.db.patch("pages", moved._id, {
      areaId: args.targetAreaId,
      parentPageId,
      ...(isRoot && args.position !== undefined
        ? { position: cleanPagePosition(args.position, args.now) }
        : {}),
      treeRevision: (moved.treeRevision ?? 0) + 1,
      updatedByProfileId: actorProfileId,
      updatedAt: args.now,
    });
    const placement = isRoot
      ? rootPlacement
      : await getPlacement(ctx, moved._id);
    await upsertPlacement(ctx, {
      page: {
        ...moved,
        areaId: args.targetAreaId,
        parentPageId,
      },
      rootPageId: parentPageId,
      actorProfileId,
      x: isRoot ? targetRootPosition.x : (placement?.x ?? 0),
      y: isRoot ? targetRootPosition.y : (placement?.y ?? 0),
      width: placement?.width,
      height: placement?.height,
      now: args.now,
    });
  }
  await recordActivity(ctx, {
    workspaceId: args.page.workspaceId,
    actorProfileId,
    action: "page_moved",
    targetType: "page",
    targetId: args.page._id,
    title: `„${args.page.title}“ je premešten/a u drugu oblast`,
  });
  return {
    nestingStatus: "none" as const,
    requestId: null,
  };
}

export const movePage = projekatMutation({
  uloga: "urednik",
  args: {
    pageId: v.id("pages"),
    targetAreaId: v.id("areas"),
    targetParentPageId: rootPageIdValidator,
  },
  returns: moveResultValidator,
  handler: async (ctx, args) => {
    const page = await requireStrictVisiblePage(ctx, args.pageId, {
      workspaceId: args.workspaceId,
    });
    const actor = await requireClanProjekta(ctx, args.workspaceId);
    const { profile } = actor;
    await requireArea(ctx, args.workspaceId, args.targetAreaId);
    const targetParent =
      args.targetParentPageId === null
        ? null
        : await requireStrictVisiblePage(ctx, args.targetParentPageId, {
            workspaceId: args.workspaceId,
            areaId: args.targetAreaId,
          });
    if (targetParent?._id === page._id) {
      throw new Error("Stranica ne može biti sopstveni roditelj.");
    }
    // PROSTOR P4 (R5 + R6): svaki član premešta odmah.
    const currentParent =
      page.parentPageId === null
        ? null
        : await requireStrictVisiblePage(ctx, page.parentPageId, {
            workspaceId: args.workspaceId,
            areaId: page.areaId,
          });
    assertCanMovePage(actor, page, currentParent, targetParent);
    const now = Date.now();
    if (page.areaId === args.targetAreaId) {
      return await moveWithinArea(ctx, {
        child: page,
        targetParent,
        actorProfileId: profile._id,
        now,
      });
    }
    if (targetParent !== null) {
      // Premeštanje u DRUGU oblast pod određenu stranicu je kompozicija dva
      // postojeća koraka u jednoj transakciji: prvo se cela grana seli u koren
      // ciljne oblasti (sidecars: ivice, viewport-i, relacije, pending zahtevi),
      // pa se u toj oblasti radi obično ugnježdavanje.
      await movePageAcrossAreasWithSidecars(ctx, {
        page,
        targetAreaId: args.targetAreaId,
        actor,
        now,
      });
      // OBAVEZNO ponovno čitanje: `page` u ruci je posle prvog koraka USTAJAO
      // (helper je patch-ovao `areaId` i `parentPageId`). `moveWithinArea` čita
      // `child.areaId` za kapacitet i za slobodnu poziciju na kanvasu — sa starim
      // dokumentom bi kartica sletela u STARU oblast (ZA-POPRAVKU Z12).
      const moved = await ctx.db.get("pages", page._id);
      if (moved === null) {
        throw new Error("Stranica nije pronađena posle premeštanja.");
      }
      return await moveWithinArea(ctx, {
        child: moved,
        targetParent,
        actorProfileId: profile._id,
        now,
      });
    }
    return await movePageAcrossAreasWithSidecars(ctx, {
      page,
      targetAreaId: args.targetAreaId,
      actor,
      now,
    });
  },
});
