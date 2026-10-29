// Preneto iz Devotion packages/backend/convex/canvasPlacement.ts (main @ c05c40f), SPAJANJE S03.
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export const DEFAULT_CANVAS_NODE_WIDTH = 288;
export const DEFAULT_CANVAS_NODE_HEIGHT = 196;

/** Najviše direktnih kartica po kanvasu (roditelju). */
export const MAX_CANVAS_PAGES = 200;

/** Koren kanvasa: `null` = kanvas oblasti, `Id<"pages">` = kanvas stranice. */
export type CanvasRoot = Id<"pages"> | null;

type ReadCtx = QueryCtx | MutationCtx;

const CANVAS_NODE_GAP = 32;
const AUTOMATIC_COLUMNS = 4;
const MAX_AUTOMATIC_POSITION_ATTEMPTS = 2_048;

export type CanvasPlacementBox = {
  x: number;
  y: number;
  width?: number;
  height?: number;
};

function positiveDimension(value: number | undefined, fallback: number) {
  return value !== undefined && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function overlapsWithGap(
  first: CanvasPlacementBox,
  second: CanvasPlacementBox,
) {
  const firstWidth = positiveDimension(
    first.width,
    DEFAULT_CANVAS_NODE_WIDTH,
  );
  const firstHeight = positiveDimension(
    first.height,
    DEFAULT_CANVAS_NODE_HEIGHT,
  );
  const secondWidth = positiveDimension(
    second.width,
    DEFAULT_CANVAS_NODE_WIDTH,
  );
  const secondHeight = positiveDimension(
    second.height,
    DEFAULT_CANVAS_NODE_HEIGHT,
  );

  return !(
    first.x + firstWidth + CANVAS_NODE_GAP <= second.x ||
    second.x + secondWidth + CANVAS_NODE_GAP <= first.x ||
    first.y + firstHeight + CANVAS_NODE_GAP <= second.y ||
    second.y + secondHeight + CANVAS_NODE_GAP <= first.y
  );
}

export function hasExactCanvasPositionCollision(
  first: Pick<CanvasPlacementBox, "x" | "y">,
  second: Pick<CanvasPlacementBox, "x" | "y">,
) {
  return first.x === second.x && first.y === second.y;
}

export function findAvailableCanvasPosition(
  occupied: readonly CanvasPlacementBox[],
  preferredSize: Pick<CanvasPlacementBox, "width" | "height"> = {},
) {
  const validOccupied = occupied.filter(
    (placement) =>
      Number.isFinite(placement.x) && Number.isFinite(placement.y),
  );
  const horizontalStep =
    DEFAULT_CANVAS_NODE_WIDTH + CANVAS_NODE_GAP * 2;
  const verticalStep =
    DEFAULT_CANVAS_NODE_HEIGHT + CANVAS_NODE_GAP * 2;
  const attemptCount = Math.min(
    MAX_AUTOMATIC_POSITION_ATTEMPTS,
    Math.max(64, (validOccupied.length + 1) * 8),
  );

  for (let index = 0; index < attemptCount; index += 1) {
    const candidate = {
      x: (index % AUTOMATIC_COLUMNS) * horizontalStep,
      y: Math.floor(index / AUTOMATIC_COLUMNS) * verticalStep,
      width: positiveDimension(
        preferredSize.width,
        DEFAULT_CANVAS_NODE_WIDTH,
      ),
      height: positiveDimension(
        preferredSize.height,
        DEFAULT_CANVAS_NODE_HEIGHT,
      ),
    };
    if (
      validOccupied.every(
        (placement) => !overlapsWithGap(candidate, placement),
      )
    ) {
      return { x: candidate.x, y: candidate.y };
    }
  }

  return {
    x: 0,
    y: (validOccupied.length + 1) * verticalStep,
  };
}

/** Placement (pozicija na kanvasu) za jednu stranicu, ili `null` ako nema. */
export async function getPlacement(ctx: ReadCtx, pageId: Id<"pages">) {
  return await ctx.db
    .query("pageCanvasPlacements")
    .withIndex("by_pageId", (q) => q.eq("pageId", pageId))
    .unique();
}

/**
 * Nađe slobodno (ne-preklapajuće) mesto na kanvasu za novu/premeštenu karticu.
 * Uzima u obzir postojeće placement-e I predložene pozicije pending nesting
 * zahteva (ghost-ova) da se nova kartica ne poklopi ni sa čim vidljivim. Baca ako
 * kanvas ima previše stavki za automatski raspored (pozivalac bira degradaciju).
 *
 * Deljeno između `areasV2` (create/move/reparent) i `lib/page_creation`
 * (`insertWorkspacePage`) — jedini izvor istine, bez cirkularnog importa (oba
 * uvoze odavde; `areasV2` uvozi `page_creation`, pa `page_creation` ne sme nazad).
 */
export async function getAvailableCanvasPosition(
  ctx: ReadCtx,
  args: {
    workspaceId: Id<"workspaces">;
    areaId: Id<"areas">;
    rootPageId: CanvasRoot;
    excludePageId?: Id<"pages">;
    excludeRequestId?: Id<"pageNestingRequests">;
    width?: number;
    height?: number;
  },
) {
  const rootPageId = args.rootPageId;
  const [placements, pendingRequests] = await Promise.all([
    ctx.db
      .query("pageCanvasPlacements")
      .withIndex(
        "by_workspaceId_and_areaId_and_rootPageId",
        (q) =>
          q
            .eq("workspaceId", args.workspaceId)
            .eq("areaId", args.areaId)
            .eq("rootPageId", rootPageId),
      )
      .take(MAX_CANVAS_PAGES + 1),
    rootPageId === null
      ? Promise.resolve([])
      : ctx.db
          .query("pageNestingRequests")
          .withIndex(
            "by_targetParentPageId_and_status_and_createdAt",
            (q) =>
              q
                .eq("targetParentPageId", rootPageId)
                .eq("status", "pending"),
          )
          .take(MAX_CANVAS_PAGES + 1),
  ]);
  if (
    placements.length > MAX_CANVAS_PAGES ||
    pendingRequests.length > MAX_CANVAS_PAGES
  ) {
    throw new Error("Kanvas ima previše stavki za automatski raspored.");
  }
  const pendingPlacements = await Promise.all(
    pendingRequests.map((request) => getPlacement(ctx, request.childPageId)),
  );

  return findAvailableCanvasPosition(
    [
      ...placements
        .filter((placement) => placement.pageId !== args.excludePageId)
        .map((placement) => ({
          x: placement.x,
          y: placement.y,
          width: placement.width,
          height: placement.height,
        })),
      ...pendingRequests.flatMap((request, index) => {
        if (
          request._id === args.excludeRequestId ||
          request.workspaceId !== args.workspaceId ||
          request.areaId !== args.areaId ||
          request.proposedX === undefined ||
          request.proposedY === undefined
        ) {
          return [];
        }
        const placement = pendingPlacements[index];
        return [{
          x: request.proposedX,
          y: request.proposedY,
          width: placement?.width,
          height: placement?.height,
        }];
      }),
    ],
    { width: args.width, height: args.height },
  );
}
