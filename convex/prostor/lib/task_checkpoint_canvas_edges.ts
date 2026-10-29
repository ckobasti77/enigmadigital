// Preneto iz Devotion packages/backend/convex/lib/task_checkpoint_canvas_edges.ts (main @ c05c40f), SPAJANJE S03.
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";

export type TaskCheckpointCanvasEndpoint =
  | { kind: "page"; id: Id<"pages"> }
  | { kind: "task_checkpoint"; id: Id<"taskCheckpoints"> };

const MAX_CHECKPOINT_CANVAS_EDGES = 400;
const MAX_ENDPOINT_EDGE_ROWS = MAX_CHECKPOINT_CANVAS_EDGES * 3;

export function taskCheckpointCanvasEndpointKey(
  endpoint: TaskCheckpointCanvasEndpoint,
) {
  return `${endpoint.kind}:${endpoint.id}`;
}

export function canonicalTaskCheckpointCanvasEndpoints(
  first: TaskCheckpointCanvasEndpoint,
  second: TaskCheckpointCanvasEndpoint,
) {
  const firstKey = taskCheckpointCanvasEndpointKey(first);
  const secondKey = taskCheckpointCanvasEndpointKey(second);
  return firstKey <= secondKey
    ? {
        endpointA: first,
        endpointB: second,
        endpointAKey: firstKey,
        endpointBKey: secondKey,
        pairKey: `${firstKey}|${secondKey}`,
      }
    : {
        endpointA: second,
        endpointB: first,
        endpointAKey: secondKey,
        endpointBKey: firstKey,
        pairKey: `${secondKey}|${firstKey}`,
      };
}

async function archiveUniqueEdges(
  ctx: MutationCtx,
  rows: Doc<"taskCheckpointCanvasEdges">[],
  now: number,
) {
  const unique = new Map(rows.map((row) => [row._id, row]));
  if (unique.size > MAX_ENDPOINT_EDGE_ROWS) {
    throw new Error(
      "Endpoint ima previše checkpoint veza za jednu atomsku radnju.",
    );
  }
  for (const edge of unique.values()) {
    if (edge.archivedAt !== null) continue;
    await ctx.db.patch("taskCheckpointCanvasEdges", edge._id, {
      archivedAt: now,
      updatedAt: now,
    });
  }
}

function assertEndpointRowsAreBounded(
  rows: Doc<"taskCheckpointCanvasEdges">[],
) {
  if (rows.length > MAX_ENDPOINT_EDGE_ROWS) {
    throw new Error(
      "Endpoint ima previše checkpoint veza za jednu atomsku radnju.",
    );
  }
}

export async function archiveCheckpointCanvasEdgesForCheckpoint(
  ctx: MutationCtx,
  checkpointId: Id<"taskCheckpoints">,
  now: number,
) {
  const endpointKey = taskCheckpointCanvasEndpointKey({
    kind: "task_checkpoint",
    id: checkpointId,
  });
  const [asA, asB] = await Promise.all([
    ctx.db
      .query("taskCheckpointCanvasEdges")
      .withIndex("by_endpointAKey_and_archivedAt", (q) =>
        q.eq("endpointAKey", endpointKey).eq("archivedAt", null),
      )
      .take(MAX_ENDPOINT_EDGE_ROWS + 1),
    ctx.db
      .query("taskCheckpointCanvasEdges")
      .withIndex("by_endpointBKey_and_archivedAt", (q) =>
        q.eq("endpointBKey", endpointKey).eq("archivedAt", null),
      )
      .take(MAX_ENDPOINT_EDGE_ROWS + 1),
  ]);
  assertEndpointRowsAreBounded(asA);
  assertEndpointRowsAreBounded(asB);
  await archiveUniqueEdges(ctx, [...asA, ...asB], now);
}

export async function archiveCheckpointCanvasEdgesForMovedPage(
  ctx: MutationCtx,
  pageId: Id<"pages">,
  sourceRootPageId: Id<"pages"> | null,
  now: number,
) {
  const [asA, asB] = await Promise.all([
    ctx.db
      .query("taskCheckpointCanvasEdges")
      .withIndex("by_endpointAPageId_and_archivedAt", (q) =>
        q.eq("endpointAPageId", pageId).eq("archivedAt", null),
      )
      .take(MAX_ENDPOINT_EDGE_ROWS + 1),
    ctx.db
      .query("taskCheckpointCanvasEdges")
      .withIndex("by_endpointBPageId_and_archivedAt", (q) =>
        q.eq("endpointBPageId", pageId).eq("archivedAt", null),
      )
      .take(MAX_ENDPOINT_EDGE_ROWS + 1),
  ]);
  assertEndpointRowsAreBounded(asA);
  assertEndpointRowsAreBounded(asB);
  await archiveUniqueEdges(
    ctx,
    [...asA, ...asB].filter(
      (edge) => edge.rootPageId === sourceRootPageId,
    ),
    now,
  );
}

export async function archiveCheckpointCanvasEdgesForArchivedPage(
  ctx: MutationCtx,
  page: Doc<"pages">,
  now: number,
) {
  const [asA, asB, rooted] = await Promise.all([
    ctx.db
      .query("taskCheckpointCanvasEdges")
      .withIndex("by_endpointAPageId_and_archivedAt", (q) =>
        q.eq("endpointAPageId", page._id).eq("archivedAt", null),
      )
      .take(MAX_ENDPOINT_EDGE_ROWS + 1),
    ctx.db
      .query("taskCheckpointCanvasEdges")
      .withIndex("by_endpointBPageId_and_archivedAt", (q) =>
        q.eq("endpointBPageId", page._id).eq("archivedAt", null),
      )
      .take(MAX_ENDPOINT_EDGE_ROWS + 1),
    ctx.db
      .query("taskCheckpointCanvasEdges")
      .withIndex("by_scope_active_pair", (q) =>
        q
          .eq("workspaceId", page.workspaceId)
          .eq("areaId", page.areaId)
          .eq("rootPageId", page._id)
          .eq("archivedAt", null),
      )
      .take(MAX_CHECKPOINT_CANVAS_EDGES + 1),
  ]);
  assertEndpointRowsAreBounded(asA);
  assertEndpointRowsAreBounded(asB);
  if (rooted.length > MAX_CHECKPOINT_CANVAS_EDGES) {
    throw new Error(
      "Canvas ima previše checkpoint veza za jednu atomsku radnju.",
    );
  }
  await archiveUniqueEdges(ctx, [...asA, ...asB, ...rooted], now);
}
