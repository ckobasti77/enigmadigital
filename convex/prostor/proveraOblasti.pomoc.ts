// Preneto iz Devotion packages/backend/convex/areasV2Migrations.ts (main @ c05c40f), SPAJANJE S03.
//
// Samo read-only verifikator `verifyAreasV2` sa svojim čistim pomoćnim
// funkcijama (S01 D2, §5.3). Backfill i karantin se ne prenose (P21). Fajl ima
// dve tačke u imenu, pa ga Convex ne deployuje; testovi ga zovu preko
// `makeFunctionReference<"query">("prostor/proveraOblasti.pomoc:verifyAreasV2")`.
import { v } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { internalQuery } from "../_generated/server";
import { hasExactCanvasPositionCollision } from "./canvasPlacement";
import { relationEndpoints } from "./lib/page_relations";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MAX_SCOPE_PLACEMENTS = 201;
const MAX_TREE_DEPTH = 64;
const MAX_ANCESTRY_VERIFIER_BATCH = 50;
const MAX_PENDING_ANCESTRY_VERIFIER_BATCH = 20;
type ReadCtx = MutationCtx | QueryCtx;

const cursorValidator = v.union(v.string(), v.null());
const verifierStageValidator = v.union(
  v.literal("areas"),
  v.literal("pages"),
  v.literal("placements"),
  v.literal("placement_rows"),
  v.literal("edges"),
  v.literal("viewports"),
  v.literal("relations"),
  v.literal("requests"),
);
const verifierResultValidator = v.object({
  stage: verifierStageValidator,
  continueCursor: v.string(),
  isDone: v.boolean(),
  scanned: v.number(),
  issueCount: v.number(),
  issueSamples: v.array(v.string()),
});

function boundedLimit(value: number | undefined) {
  if (value === undefined) return DEFAULT_LIMIT;
  if (!Number.isInteger(value) || value < 1 || value > MAX_LIMIT) {
    throw new Error(`Limit mora biti ceo broj od 1 do ${MAX_LIMIT}.`);
  }
  return value;
}

function pairKey(nodeAId: Id<"pages">, nodeBId: Id<"pages">) {
  return [nodeAId, nodeBId].sort().join(":");
}

async function hasInvalidActiveAncestry(
  ctx: ReadCtx,
  page: Doc<"pages">,
) {
  if (page.archivedAt !== null) return false;
  const seen = new Set<string>([page._id]);
  let parentPageId = page.parentPageId;
  for (let depth = 0; parentPageId !== null; depth += 1) {
    if (depth >= MAX_TREE_DEPTH || seen.has(parentPageId)) return true;
    seen.add(parentPageId);
    const parent = await ctx.db.get("pages", parentPageId);
    if (
      parent === null ||
      parent.archivedAt !== null ||
      parent.workspaceId !== page.workspaceId ||
      parent.areaId !== page.areaId
    ) {
      return true;
    }
    parentPageId = parent.parentPageId;
  }
  return false;
}

async function hasInvalidPendingTargetAncestry(
  ctx: ReadCtx,
  child: Doc<"pages">,
  targetParent: Doc<"pages">,
) {
  const seen = new Set<string>([child._id]);
  let cursor: Id<"pages"> | null = targetParent._id;
  for (let depth = 0; cursor !== null; depth += 1) {
    if (depth >= MAX_TREE_DEPTH || seen.has(cursor)) return true;
    seen.add(cursor);
    const currentPageId: Id<"pages"> = cursor;
    const page: Doc<"pages"> | null = await ctx.db.get(
      "pages",
      currentPageId,
    );
    const pendingRequests: Doc<"pageNestingRequests">[] = await ctx.db
      .query("pageNestingRequests")
      .withIndex("by_childPageId_and_status_and_updatedAt", (q) =>
        q.eq("childPageId", currentPageId).eq("status", "pending"),
      )
      .take(2);
    if (
      page === null ||
      page.archivedAt !== null ||
      page.workspaceId !== child.workspaceId ||
      page.areaId !== child.areaId
    ) {
      return true;
    }
    if (pendingRequests.length > 1) return true;
    const pending = pendingRequests[0];
    if (pending !== undefined) {
      if (
        pending.workspaceId !== child.workspaceId ||
        pending.areaId !== child.areaId ||
        pending.childPageId !== page._id ||
        pending.sourceParentPageId !== page.parentPageId ||
        pending.expectedTreeRevision !== (page.treeRevision ?? 0) ||
        pending.requesterProfileId !== page.createdByProfileId ||
        pending.resolvedAt !== null
      ) {
        return true;
      }
      cursor = pending.targetParentPageId;
      continue;
    }
    cursor = page.parentPageId;
  }
  return false;
}

function addIssue(
  issues: string[],
  value: string,
) {
  if (issues.length < 25) issues.push(value);
}

function verifierResult(
  stage:
    | "areas"
    | "pages"
    | "placements"
    | "placement_rows"
    | "edges"
    | "viewports"
    | "relations"
    | "requests",
  result: {
    continueCursor: string;
    isDone: boolean;
    page: unknown[];
  },
  issueCount: number,
  issueSamples: string[],
) {
  return {
    stage,
    continueCursor: result.continueCursor,
    isDone: result.isDone,
    scanned: result.page.length,
    issueCount,
    issueSamples,
  };
}

export const verifyAreasV2 = internalQuery({
  args: {
    stage: verifierStageValidator,
    cursor: cursorValidator,
    limit: v.optional(v.number()),
  },
  returns: verifierResultValidator,
  handler: async (ctx, args) => {
    const requestedLimit = boundedLimit(args.limit);
    const paginationOpts = {
      cursor: args.cursor,
      numItems:
        args.stage === "requests"
          ? Math.min(
              requestedLimit,
              MAX_PENDING_ANCESTRY_VERIFIER_BATCH,
            )
          : args.stage === "pages"
            ? Math.min(requestedLimit, MAX_ANCESTRY_VERIFIER_BATCH)
            : requestedLimit,
    };
    let issueCount = 0;
    const issueSamples: string[] = [];
    if (args.stage === "areas") {
      const result = await ctx.db
        .query("areas")
        .order("asc")
        .paginate(paginationOpts);
      for (const area of result.page) {
        const rows = await ctx.db
          .query("areaBodies")
          .withIndex("by_areaId", (q) => q.eq("areaId", area._id))
          .take(2);
        if (
          rows.length !== 1 ||
          rows[0].workspaceId !== area.workspaceId ||
          rows[0].areaId !== area._id
        ) {
          issueCount += 1;
          addIssue(issueSamples, `areas:${area._id}:briefing`);
        }
      }
      return verifierResult(args.stage, result, issueCount, issueSamples);
    }
    if (args.stage === "pages") {
      const result = await ctx.db
        .query("pages")
        .order("asc")
        .paginate(paginationOpts);
      for (const page of result.page) {
        const [area, parent] = await Promise.all([
          ctx.db.get("areas", page.areaId),
          page.parentPageId === null
            ? Promise.resolve(null)
            : ctx.db.get("pages", page.parentPageId),
        ]);
        const invalidAncestry = await hasInvalidActiveAncestry(ctx, page);
        const invalidActiveParent =
          page.archivedAt === null &&
          page.parentPageId !== null &&
          (parent === null ||
            parent.archivedAt !== null ||
            parent.workspaceId !== page.workspaceId ||
            parent.areaId !== page.areaId);
        if (
          area === null ||
          area.workspaceId !== page.workspaceId ||
          page.treeRevision === undefined ||
          page.canvasPreview === undefined ||
          invalidActiveParent ||
          invalidAncestry
        ) {
          issueCount += 1;
          addIssue(issueSamples, `pages:${page._id}:scope_or_sidecar`);
        }
      }
      return verifierResult(args.stage, result, issueCount, issueSamples);
    }
    if (args.stage === "placements") {
      const result = await ctx.db
        .query("pages")
        .order("asc")
        .paginate(paginationOpts);
      for (const page of result.page) {
        if (page.archivedAt !== null) continue;
        const [placements, parent] = await Promise.all([
          ctx.db
            .query("pageCanvasPlacements")
            .withIndex("by_pageId", (q) => q.eq("pageId", page._id))
            .take(2),
          page.parentPageId === null
            ? Promise.resolve(null)
            : ctx.db.get("pages", page.parentPageId),
        ]);
        const placement = placements[0] ?? null;
        if (
          placements.length !== 1 ||
          placement === null ||
          placement.workspaceId !== page.workspaceId ||
          placement.areaId !== page.areaId ||
          placement.rootPageId !== page.parentPageId ||
          !Number.isFinite(placement.x) ||
          !Number.isFinite(placement.y) ||
          (placement.width !== undefined &&
            (!Number.isFinite(placement.width) || placement.width <= 0)) ||
          (placement.height !== undefined &&
            (!Number.isFinite(placement.height) || placement.height <= 0)) ||
          (page.parentPageId !== null &&
            (parent === null ||
              parent.archivedAt !== null ||
              parent.workspaceId !== page.workspaceId ||
              parent.areaId !== page.areaId))
        ) {
          issueCount += 1;
          addIssue(issueSamples, `pages:${page._id}:placement`);
        }
      }
      return verifierResult(args.stage, result, issueCount, issueSamples);
    }
    if (args.stage === "placement_rows") {
      const result = await ctx.db
        .query("pageCanvasPlacements")
        .order("asc")
        .paginate(paginationOpts);
      for (const placement of result.page) {
        const page = await ctx.db.get("pages", placement.pageId);
        const [duplicates, root, scopePlacements] = await Promise.all([
          ctx.db
            .query("pageCanvasPlacements")
            .withIndex("by_pageId", (q) => q.eq("pageId", placement.pageId))
            .take(2),
          placement.rootPageId === null
            ? Promise.resolve(null)
            : ctx.db.get("pages", placement.rootPageId),
          ctx.db
            .query("pageCanvasPlacements")
            .withIndex(
              "by_workspaceId_and_areaId_and_rootPageId",
              (q) =>
                q
                  .eq("workspaceId", placement.workspaceId)
                  .eq("areaId", placement.areaId)
                  .eq("rootPageId", placement.rootPageId),
            )
            .take(MAX_SCOPE_PLACEMENTS),
        ]);
        const collidingPlacements = scopePlacements
          .filter((candidate) =>
            hasExactCanvasPositionCollision(candidate, placement),
          )
          .sort(
            (first, second) =>
              first.createdAt - second.createdAt ||
              first._id.localeCompare(second._id),
          );
        const hasNonCanonicalCollision =
          collidingPlacements.length > 1 &&
          collidingPlacements[0]._id !== placement._id;
        if (
          page === null ||
          page.archivedAt !== null ||
          duplicates.length !== 1 ||
          page.workspaceId !== placement.workspaceId ||
          page.areaId !== placement.areaId ||
          page.parentPageId !== placement.rootPageId ||
          !Number.isFinite(placement.x) ||
          !Number.isFinite(placement.y) ||
          (placement.width !== undefined &&
            (!Number.isFinite(placement.width) || placement.width <= 0)) ||
          (placement.height !== undefined &&
            (!Number.isFinite(placement.height) || placement.height <= 0)) ||
          (placement.rootPageId !== null &&
            (root === null ||
              root.archivedAt !== null ||
              root.workspaceId !== placement.workspaceId ||
              root.areaId !== placement.areaId)) ||
          hasNonCanonicalCollision
        ) {
          issueCount += 1;
          addIssue(
            issueSamples,
            `pageCanvasPlacements:${placement._id}:orphan_or_duplicate`,
          );
        }
      }
      return verifierResult(args.stage, result, issueCount, issueSamples);
    }
    if (args.stage === "edges") {
      const result = await ctx.db
        .query("pageCanvasEdgesV2")
        .order("asc")
        .paginate(paginationOpts);
      for (const edge of result.page) {
        if (edge.archivedAt !== null) continue;
        const [nodeA, nodeB, duplicates] = await Promise.all([
          ctx.db.get("pages", edge.nodeAId),
          ctx.db.get("pages", edge.nodeBId),
          ctx.db
            .query("pageCanvasEdgesV2")
            .withIndex("by_scope_active_pair", (q) =>
              q
                .eq("workspaceId", edge.workspaceId)
                .eq("areaId", edge.areaId)
                .eq("rootPageId", edge.rootPageId)
                .eq("archivedAt", null)
                .eq("pairKey", edge.pairKey),
            )
            .take(2),
        ]);
        if (
          nodeA === null ||
          nodeB === null ||
          nodeA.archivedAt !== null ||
          nodeB.archivedAt !== null ||
          nodeA._id === nodeB._id ||
          nodeA.workspaceId !== edge.workspaceId ||
          nodeB.workspaceId !== edge.workspaceId ||
          nodeA.areaId !== edge.areaId ||
          nodeB.areaId !== edge.areaId ||
          nodeA.parentPageId !== edge.rootPageId ||
          nodeB.parentPageId !== edge.rootPageId ||
          nodeA.kind !== nodeB.kind ||
          edge.pairKey !== pairKey(edge.nodeAId, edge.nodeBId) ||
          duplicates.length !== 1
        ) {
          issueCount += 1;
          addIssue(issueSamples, `pageCanvasEdgesV2:${edge._id}:scope`);
        }
      }
      return verifierResult(args.stage, result, issueCount, issueSamples);
    }
    if (args.stage === "viewports") {
      const result = await ctx.db
        .query("pageCanvasViewports")
        .order("asc")
        .paginate(paginationOpts);
      for (const viewport of result.page) {
        const [area, root, duplicates] = await Promise.all([
          ctx.db.get("areas", viewport.areaId),
          viewport.rootPageId === null
            ? Promise.resolve(null)
            : ctx.db.get("pages", viewport.rootPageId),
          ctx.db
            .query("pageCanvasViewports")
            .withIndex(
              "by_viewerProfileId_and_workspaceId_and_areaId_and_rootPageId",
              (q) =>
                q
                  .eq("viewerProfileId", viewport.viewerProfileId)
                  .eq("workspaceId", viewport.workspaceId)
                  .eq("areaId", viewport.areaId)
                  .eq("rootPageId", viewport.rootPageId),
            )
            .take(2),
        ]);
        if (
          area === null ||
          area.workspaceId !== viewport.workspaceId ||
          duplicates.length !== 1 ||
          !Number.isFinite(viewport.x) ||
          !Number.isFinite(viewport.y) ||
          !Number.isFinite(viewport.zoom) ||
          viewport.x < -100_000 ||
          viewport.x > 100_000 ||
          viewport.y < -100_000 ||
          viewport.y > 100_000 ||
          viewport.zoom < 0.1 ||
          viewport.zoom > 4 ||
          (viewport.rootPageId !== null &&
            (root === null ||
              root.archivedAt !== null ||
              root.workspaceId !== viewport.workspaceId ||
              root.areaId !== viewport.areaId))
        ) {
          issueCount += 1;
          addIssue(issueSamples, `pageCanvasViewports:${viewport._id}:scope`);
        }
      }
      return verifierResult(args.stage, result, issueCount, issueSamples);
    }
    if (args.stage === "relations") {
      const result = await ctx.db
        .query("pageRelations")
        .order("asc")
        .paginate(paginationOpts);
      for (const relation of result.page) {
        if (relation.archivedAt !== null) continue;
        const { pageAId, pageBId } = relationEndpoints(relation);
        const [note, task, duplicates] = await Promise.all([
          ctx.db.get("pages", pageAId),
          ctx.db.get("pages", pageBId),
          ctx.db
            .query("pageRelations")
            .withIndex("by_workspaceId_and_pairKey_and_archivedAt", (q) =>
              q
                .eq("workspaceId", relation.workspaceId)
                .eq("pairKey", relation.pairKey)
                .eq("archivedAt", null),
            )
            .take(2),
        ]);
        if (
          note === null ||
          task === null ||
          note.archivedAt !== null ||
          task.archivedAt !== null ||
          // Vrsta i oblast endpointa se namerno ne proveravaju: relacija spaja
          // bilo koje dve stranice istog projekta, i preko granica oblasti.
          note.workspaceId !== relation.workspaceId ||
          task.workspaceId !== relation.workspaceId ||
          relation.pairKey !== pairKey(note._id, task._id) ||
          duplicates.length !== 1
        ) {
          issueCount += 1;
          addIssue(issueSamples, `pageRelations:${relation._id}:scope`);
        }
      }
      return verifierResult(args.stage, result, issueCount, issueSamples);
    }
    const result = await ctx.db
      .query("pageNestingRequests")
      .order("asc")
      .paginate(paginationOpts);
    for (const request of result.page) {
      if (request.status !== "pending") continue;
      const [child, parent, sourceParent, area, duplicates] = await Promise.all([
        ctx.db.get("pages", request.childPageId),
        ctx.db.get("pages", request.targetParentPageId),
        request.sourceParentPageId === null
          ? Promise.resolve(null)
          : ctx.db.get("pages", request.sourceParentPageId),
        ctx.db.get("areas", request.areaId),
        ctx.db
          .query("pageNestingRequests")
          .withIndex("by_childPageId_and_status_and_updatedAt", (q) =>
            q.eq("childPageId", request.childPageId).eq("status", "pending"),
          )
          .take(2),
      ]);
      const invalidPendingAncestry =
        child !== null && parent !== null
          ? await hasInvalidPendingTargetAncestry(ctx, child, parent)
          : false;
      if (
        child === null ||
        parent === null ||
        child.archivedAt !== null ||
        parent.archivedAt !== null ||
        child._id === parent._id ||
        area === null ||
        area.workspaceId !== request.workspaceId ||
        child.workspaceId !== request.workspaceId ||
        parent.workspaceId !== request.workspaceId ||
        child.areaId !== request.areaId ||
        parent.areaId !== request.areaId ||
        child.parentPageId !== request.sourceParentPageId ||
        (child.treeRevision ?? 0) !== request.expectedTreeRevision ||
        child.createdByProfileId !== request.requesterProfileId ||
        parent.createdByProfileId !== request.parentAuthorProfileId ||
        request.requesterProfileId === request.parentAuthorProfileId ||
        request.resolvedAt !== null ||
        duplicates.length !== 1 ||
        invalidPendingAncestry ||
        (request.sourceParentPageId !== null &&
          (sourceParent === null ||
            sourceParent.archivedAt !== null ||
            sourceParent.workspaceId !== request.workspaceId ||
            sourceParent.areaId !== request.areaId))
      ) {
        issueCount += 1;
        addIssue(issueSamples, `pageNestingRequests:${request._id}:scope`);
      }
    }
    return verifierResult(args.stage, result, issueCount, issueSamples);
  },
});
