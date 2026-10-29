// Preneto iz Devotion packages/backend/convex/canvases.ts (main @ c05c40f), SPAJANJE S05.
import { v } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

import { requireClanProjekta } from "./lib/auth";
import { requirePageArea } from "./lib/page_creation";
import { canLayoutOnMap } from "./lib/permissions";
import {
  pageKindValidator,
  taskPriorityValidator,
  taskStatusValidator,
} from "./lib/validators";
import { projekatMutation, projekatQuery } from "../lib/projekat";

const canvasViewportValidator = v.object({
  x: v.number(),
  y: v.number(),
  zoom: v.number(),
  persisted: v.boolean(),
});

const canvasPageValidator = v.object({
  _id: v.id("pages"),
  title: v.string(),
  text: v.string(),
  kind: pageKindValidator,
  taskStatus: v.union(taskStatusValidator, v.null()),
  taskPriority: v.union(taskPriorityValidator, v.null()),
  updatedAt: v.number(),
  x: v.number(),
  y: v.number(),
  width: v.number(),
  height: v.number(),
  canMove: v.boolean(),
  canResize: v.boolean(),
  creator: v.union(
    v.object({
      displayName: v.string(),
      avatarUrl: v.union(v.string(), v.null()),
    }),
    v.null(),
  ),
});

const canvasEdgeValidator = v.object({
  _id: v.id("pageEdges"),
  source: v.id("pages"),
  target: v.id("pages"),
  label: v.union(v.string(), v.null()),
});

function clamp(value: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value)) throw new Error("Koordinata kanvasa nije ispravna.");
  return Math.min(Math.max(value, minimum), maximum);
}

function plainText(content: string | undefined) {
  if (!content) return "";
  return content
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

const DEFAULT_PAGE_NODE_WIDTH = 288;
const DEFAULT_PAGE_NODE_HEIGHT = 196;
const MIN_PAGE_NODE_WIDTH = 240;
const MIN_PAGE_NODE_HEIGHT = 168;
const MAX_PAGE_NODE_WIDTH = 720;
const MAX_PAGE_NODE_HEIGHT = 1_000;
const MAX_V2_CANVAS_EDGES = 400;

type CanvasSizeUpdate =
  | { kind: "preserve" }
  | { kind: "set"; width: number; height: number }
  | { kind: "reset" };

async function syncLegacyAndV2Placement(
  ctx: MutationCtx,
  args: {
    page: Doc<"pages">;
    actorProfileId: Id<"profiles">;
    position?: { x: number; y: number };
    size: CanvasSizeUpdate;
    now: number;
  },
) {
  const [legacy, v2] = await Promise.all([
    ctx.db
      .query("pageCanvasNodes")
      .withIndex("by_pageId", (q) => q.eq("pageId", args.page._id))
      .unique(),
    ctx.db
      .query("pageCanvasPlacements")
      .withIndex("by_pageId", (q) => q.eq("pageId", args.page._id))
      .unique(),
  ]);
  const legacyX = clamp(
    args.position?.x ?? legacy?.x ?? v2?.x ?? 0,
    -100_000,
    100_000,
  );
  const legacyY = clamp(
    args.position?.y ?? legacy?.y ?? v2?.y ?? 0,
    -100_000,
    100_000,
  );
  const v2X = clamp(
    args.position?.x ?? v2?.x ?? legacy?.x ?? 0,
    -100_000,
    100_000,
  );
  const v2Y = clamp(
    args.position?.y ?? v2?.y ?? legacy?.y ?? 0,
    -100_000,
    100_000,
  );
  const legacyWidth =
    args.size.kind === "set"
      ? args.size.width
      : args.size.kind === "preserve"
        ? (legacy?.width ?? v2?.width)
        : undefined;
  const legacyHeight =
    args.size.kind === "set"
      ? args.size.height
      : args.size.kind === "preserve"
        ? (legacy?.height ?? v2?.height)
        : undefined;
  const v2Width =
    args.size.kind === "set"
      ? args.size.width
      : args.size.kind === "preserve"
        ? (v2?.width ?? legacy?.width)
        : undefined;
  const v2Height =
    args.size.kind === "set"
      ? args.size.height
      : args.size.kind === "preserve"
        ? (v2?.height ?? legacy?.height)
        : undefined;

  const legacyValue = {
    workspaceId: args.page.workspaceId,
    areaId: args.page.areaId,
    pageId: args.page._id,
    x: legacyX,
    y: legacyY,
    updatedAt: args.now,
  };
  if (legacy === null) {
    await ctx.db.insert("pageCanvasNodes", {
      ...legacyValue,
      ...(legacyWidth === undefined ? {} : { width: legacyWidth }),
      ...(legacyHeight === undefined ? {} : { height: legacyHeight }),
    });
  } else {
    await ctx.db.patch("pageCanvasNodes", legacy._id, {
      ...legacyValue,
      width: legacyWidth,
      height: legacyHeight,
    });
  }

  const v2Value = {
    workspaceId: args.page.workspaceId,
    areaId: args.page.areaId,
    rootPageId: args.page.parentPageId,
    pageId: args.page._id,
    x: v2X,
    y: v2Y,
    updatedByProfileId: args.actorProfileId,
    updatedAt: args.now,
  };
  if (v2 === null) {
    await ctx.db.insert("pageCanvasPlacements", {
      ...v2Value,
      ...(v2Width === undefined ? {} : { width: v2Width }),
      ...(v2Height === undefined ? {} : { height: v2Height }),
      createdAt: args.now,
    });
  } else {
    await ctx.db.patch("pageCanvasPlacements", v2._id, {
      ...v2Value,
      width: v2Width,
      height: v2Height,
    });
  }
}

export const getPageCanvasSize = projekatQuery({
  uloga: "urednik",
  args: {
    pageId: v.id("pages"),
  },
  returns: v.union(
    v.object({
      width: v.optional(v.number()),
      height: v.optional(v.number()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    await requireClanProjekta(ctx, args.workspaceId);
    const page = await ctx.db.get("pages", args.pageId);
    if (!page || page.workspaceId !== args.workspaceId || page.archivedAt !== null) {
      return null;
    }
    const layout = await ctx.db
      .query("pageCanvasNodes")
      .withIndex("by_pageId", (q) => q.eq("pageId", args.pageId))
      .unique();
    return {
      width: layout?.width,
      height: layout?.height,
    };
  },
});

export const getAreaCanvas = projekatQuery({
  uloga: "urednik",
  args: {
    areaId: v.id("areas"),
    kind: pageKindValidator,
  },
  returns: v.object({
    pages: v.array(canvasPageValidator),
    edges: v.array(canvasEdgeValidator),
    viewport: canvasViewportValidator,
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const member = await requireClanProjekta(ctx, args.workspaceId);
    const { profile } = member;
    await requirePageArea(ctx, args.workspaceId, args.areaId);

    const rawPages = await ctx.db
      .query("pages")
      .withIndex(
        "by_areaId_and_kind_and_parentPageId_and_archivedAt_and_position",
        (q) =>
          q
            .eq("areaId", args.areaId)
            .eq("kind", args.kind)
            .eq("parentPageId", null)
            .eq("archivedAt", null),
      )
      .order("desc")
      .take(251);
    const truncated = rawPages.length > 250;
    const pages = rawPages.slice(0, 250);

    const [layouts, rawEdges, savedViewport] = await Promise.all([
      ctx.db
        .query("pageCanvasNodes")
        .withIndex("by_areaId", (q) => q.eq("areaId", args.areaId))
        .take(500),
      ctx.db
        .query("pageEdges")
        .withIndex("by_areaId", (q) => q.eq("areaId", args.areaId))
        .take(500),
      ctx.db
        .query("pageCanvases")
        .withIndex("by_ownerProfileId_and_areaId_and_kind", (q) =>
          q
            .eq("ownerProfileId", profile._id)
            .eq("areaId", args.areaId)
            .eq("kind", args.kind),
        )
        .unique(),
    ]);

    const layoutsByPageId = new Map(layouts.map((layout) => [layout.pageId, layout]));
    const creatorIds = Array.from(new Set(pages.map((page) => page.createdByProfileId)));
    const creators = await Promise.all(
      creatorIds.map(async (profileId) => {
        const creator = await ctx.db.get("profiles", profileId);
        const avatarUrl = creator?.avatarStorageId
          ? await ctx.storage.getUrl(creator.avatarStorageId)
          : null;
        return [
          profileId,
          creator
            ? { displayName: creator.displayName, avatarUrl }
            : null,
        ] as const;
      }),
    );
    const creatorsById = new Map(creators);

    const columnCount = Math.max(1, Math.ceil(Math.sqrt(pages.length)));
    const canvasPages = await Promise.all(pages.map(async (page, index) => {
      const layout = layoutsByPageId.get(page._id);
      const body = await ctx.db
        .query("pageBodies")
        .withIndex("by_pageId", (q) => q.eq("pageId", page._id))
        .unique();
      const column = index % columnCount;
      const row = Math.floor(index / columnCount);
      return {
        _id: page._id,
        title: page.title,
        text:
          page.kind === "task" && page.instructions?.trim()
            ? page.instructions.trim()
            : plainText(body?.content),
        kind: page.kind,
        taskStatus: page.taskStatus,
        taskPriority: page.taskPriority,
        updatedAt: page.updatedAt,
        x: layout?.x ?? (column - (columnCount - 1) / 2) * 310,
        y: layout?.y ?? (row - 1) * 205,
        width: layout?.width ?? DEFAULT_PAGE_NODE_WIDTH,
        height: layout?.height ?? DEFAULT_PAGE_NODE_HEIGHT,
        // Raspored menja svaki član (PROSTOR P1, D20).
        canMove: canLayoutOnMap(member),
        canResize: canLayoutOnMap(member),
        creator: creatorsById.get(page.createdByProfileId) ?? null,
      };
    }));

    const visiblePageIds = new Set(canvasPages.map((page) => page._id));
    const edges = rawEdges
      .filter(
        (edge) =>
          edge.workspaceId === args.workspaceId &&
          (edge.archivedAt === undefined || edge.archivedAt === null) &&
          visiblePageIds.has(edge.nodeAId) && visiblePageIds.has(edge.nodeBId),
      )
      .map((edge) => ({
        _id: edge._id,
        source: edge.nodeAId,
        target: edge.nodeBId,
        label: edge.label,
      }));

    return {
      pages: canvasPages,
      edges,
      viewport: savedViewport
        ? {
            x: savedViewport.x,
            y: savedViewport.y,
            zoom: savedViewport.zoom,
            persisted: true,
          }
        : { x: 0, y: 0, zoom: 1, persisted: false },
      truncated,
    };
  },
});

export const moveAreaCanvasPages = projekatMutation({
  uloga: "urednik",
  args: {
    areaId: v.id("areas"),
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
    await requirePageArea(ctx, args.workspaceId, args.areaId);
    if (args.updates.length > 250) {
      throw new Error("Pomeri najviše 250 kartica odjednom.");
    }

    const now = Date.now();
    for (const update of args.updates) {
      const page = await ctx.db.get("pages", update.pageId);
      if (
        !page ||
        page.workspaceId !== args.workspaceId ||
        page.areaId !== args.areaId ||
        page.archivedAt !== null ||
        page.parentPageId !== null
      ) {
        throw new Error("Pomeri samo dostupne kartice sa kanvasa oblasti.");
      }
      await syncLegacyAndV2Placement(ctx, {
        page,
        actorProfileId: profile._id,
        position: {
          x: clamp(update.x, -100_000, 100_000),
          y: clamp(update.y, -100_000, 100_000),
        },
        size: { kind: "preserve" },
        now,
      });
    }
    return null;
  },
});

export const resizeAreaCanvasPage = projekatMutation({
  uloga: "urednik",
  args: {
    pageId: v.id("pages"),
    width: v.number(),
    height: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile } = await requireClanProjekta(ctx, args.workspaceId);
    const page = await ctx.db.get("pages", args.pageId);
    if (
      page === null ||
      page.workspaceId !== args.workspaceId ||
      page.archivedAt !== null
    ) {
      throw new Error("Kartica više nije dostupna.");
    }
    const now = Date.now();
    await syncLegacyAndV2Placement(ctx, {
      page,
      actorProfileId: profile._id,
      size: {
        kind: "set",
        width: clamp(
        args.width,
        MIN_PAGE_NODE_WIDTH,
        MAX_PAGE_NODE_WIDTH,
        ),
        height: clamp(
          args.height,
          MIN_PAGE_NODE_HEIGHT,
          MAX_PAGE_NODE_HEIGHT,
        ),
      },
      now,
    });
    return null;
  },
});

export const resetAreaCanvasPageSize = projekatMutation({
  uloga: "urednik",
  args: {
    pageId: v.id("pages"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile } = await requireClanProjekta(ctx, args.workspaceId);
    const page = await ctx.db.get("pages", args.pageId);
    if (
      page === null ||
      page.workspaceId !== args.workspaceId ||
      page.archivedAt !== null
    ) {
      throw new Error("Kartica više nije dostupna.");
    }
    await syncLegacyAndV2Placement(ctx, {
      page,
      actorProfileId: profile._id,
      size: { kind: "reset" },
      now: Date.now(),
    });
    return null;
  },
});

export const saveAreaCanvasViewport = projekatMutation({
  uloga: "urednik",
  args: {
    areaId: v.id("areas"),
    kind: pageKindValidator,
    x: v.number(),
    y: v.number(),
    zoom: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile } = await requireClanProjekta(ctx, args.workspaceId);
    await requirePageArea(ctx, args.workspaceId, args.areaId);
    const now = Date.now();
    const [existing, v2Viewport] = await Promise.all([
      ctx.db
        .query("pageCanvases")
        .withIndex("by_ownerProfileId_and_areaId_and_kind", (q) =>
          q
            .eq("ownerProfileId", profile._id)
            .eq("areaId", args.areaId)
            .eq("kind", args.kind),
        )
        .unique(),
      ctx.db
        .query("pageCanvasViewports")
        .withIndex(
          "by_viewerProfileId_and_workspaceId_and_areaId_and_rootPageId",
          (q) =>
            q
              .eq("viewerProfileId", profile._id)
              .eq("workspaceId", args.workspaceId)
              .eq("areaId", args.areaId)
              .eq("rootPageId", null),
        )
        .unique(),
    ]);
    const x = clamp(args.x, -100_000, 100_000);
    const y = clamp(args.y, -100_000, 100_000);
    const zoom = clamp(args.zoom, 0.5, 1.6);
    const viewport = {
      workspaceId: args.workspaceId,
      areaId: args.areaId,
      ownerProfileId: profile._id,
      kind: args.kind,
      x,
      y,
      zoom,
      updatedAt: now,
    };
    if (existing) {
      await ctx.db.patch(existing._id, viewport);
    } else {
      await ctx.db.insert("pageCanvases", { ...viewport, createdAt: now });
    }
    const v2Value = {
      workspaceId: args.workspaceId,
      areaId: args.areaId,
      rootPageId: null,
      viewerProfileId: profile._id,
      x,
      y,
      zoom,
      updatedAt: now,
    };
    if (v2Viewport === null) {
      await ctx.db.insert("pageCanvasViewports", {
        ...v2Value,
        createdAt: now,
      });
    } else {
      await ctx.db.patch("pageCanvasViewports", v2Viewport._id, v2Value);
    }
    return null;
  },
});

export const connectAreaCanvasPages = projekatMutation({
  uloga: "urednik",
  args: {
    areaId: v.id("areas"),
    source: v.id("pages"),
    target: v.id("pages"),
  },
  returns: v.id("pageEdges"),
  handler: async (ctx, args) => {
    const { profile } = await requireClanProjekta(ctx, args.workspaceId);
    await requirePageArea(ctx, args.workspaceId, args.areaId);
    if (args.source === args.target) {
      throw new Error("Kartica ne može biti povezana sa samom sobom.");
    }
    const [source, target] = await Promise.all([
      ctx.db.get("pages", args.source),
      ctx.db.get("pages", args.target),
    ]);
    if (
      !source ||
      !target ||
      source.workspaceId !== args.workspaceId ||
      target.workspaceId !== args.workspaceId ||
      source.areaId !== args.areaId ||
      target.areaId !== args.areaId ||
      source.archivedAt !== null ||
      target.archivedAt !== null ||
      source.parentPageId !== null ||
      target.parentPageId !== null
    ) {
      throw new Error(
        "Poveži samo dostupne kartice sa kanvasa iste poslovne oblasti.",
      );
    }
    if (source.kind !== target.kind) {
      throw new Error("Na podeljenom kanvasu poveži kartice istog tipa.");
    }
    // Veze pravi svaki član (PROSTOR D20).

    const pairKey = [args.source, args.target].sort().join(":");
    const [existing, existingV2] = await Promise.all([
      ctx.db
        .query("pageEdges")
        .withIndex("by_areaId_and_pairKey", (q) =>
          q.eq("areaId", args.areaId).eq("pairKey", pairKey),
        )
        .unique(),
      ctx.db
        .query("pageCanvasEdgesV2")
        .withIndex("by_scope_active_pair", (q) =>
          q
            .eq("workspaceId", args.workspaceId)
            .eq("areaId", args.areaId)
            .eq("rootPageId", null)
            .eq("archivedAt", null)
            .eq("pairKey", pairKey),
        )
        .unique(),
    ]);
    const now = Date.now();
    if (existing !== null && existing.workspaceId !== args.workspaceId) {
      throw new Error("Postojeća veza ne pripada ovom projektu.");
    }
    const legacyIsActive =
      existing !== null &&
      (existing.archivedAt === undefined || existing.archivedAt === null);
    if (
      legacyIsActive &&
      existingV2 !== null &&
      existing.authorProfileId !== existingV2.authorProfileId
    ) {
      throw new Error("Postojeća veza ima neusaglašeno autorstvo.");
    }
    if (existingV2 === null) {
      const activeV2Edges = await ctx.db
        .query("pageCanvasEdgesV2")
        .withIndex("by_scope_active_pair", (q) =>
          q
            .eq("workspaceId", args.workspaceId)
            .eq("areaId", args.areaId)
            .eq("rootPageId", null)
            .eq("archivedAt", null),
        )
        .take(MAX_V2_CANVAS_EDGES + 1);
      if (activeV2Edges.length >= MAX_V2_CANVAS_EDGES) {
        throw new Error(
          `Kanvas može imati najviše ${MAX_V2_CANVAS_EDGES} veza.`,
        );
      }
    }

    const authorProfileId =
      existingV2 !== null
        ? existingV2.authorProfileId
        : legacyIsActive
          ? existing.authorProfileId
          : profile._id;
    const label =
      existingV2 !== null ? existingV2.label : (existing?.label ?? null);
    let legacyEdgeId: Id<"pageEdges">;
    if (existing === null) {
      legacyEdgeId = await ctx.db.insert("pageEdges", {
        workspaceId: args.workspaceId,
        areaId: args.areaId,
        nodeAId: args.source,
        nodeBId: args.target,
        pairKey,
        label,
        ...(authorProfileId === undefined ? {} : { authorProfileId }),
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      legacyEdgeId = existing._id;
      if (!legacyIsActive) {
        await ctx.db.patch("pageEdges", existing._id, {
          nodeAId: args.source,
          nodeBId: args.target,
          label,
          authorProfileId,
          archivedAt: null,
          updatedAt: now,
        });
      }
    }
    if (existingV2 === null) {
      await ctx.db.insert("pageCanvasEdgesV2", {
        workspaceId: args.workspaceId,
        areaId: args.areaId,
        rootPageId: null,
        nodeAId: args.source,
        nodeBId: args.target,
        pairKey,
        label,
        ...(authorProfileId === undefined ? {} : { authorProfileId }),
        attribution:
          authorProfileId === undefined ? "legacy_neutral" : "author",
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
    }
    return legacyEdgeId;
  },
});

export const disconnectAreaCanvasPages = projekatMutation({
  uloga: "urednik",
  args: {
    edgeIds: v.array(v.id("pageEdges")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireClanProjekta(ctx, args.workspaceId);
    if (args.edgeIds.length > 100) {
      throw new Error("Ukloni najviše 100 veza odjednom.");
    }
    const now = Date.now();
    for (const edgeId of args.edgeIds) {
      const edge = await ctx.db.get("pageEdges", edgeId);
      if (edge === null || edge.workspaceId !== args.workspaceId) {
        throw new Error("Veza nije pronađena.");
      }
      await requirePageArea(ctx, args.workspaceId, edge.areaId);
      // Vezu uklanja svaki član (PROSTOR D20).
      if (edge.archivedAt === undefined || edge.archivedAt === null) {
        const existingV2 = await ctx.db
          .query("pageCanvasEdgesV2")
          .withIndex("by_scope_active_pair", (q) =>
            q
              .eq("workspaceId", args.workspaceId)
              .eq("areaId", edge.areaId)
              .eq("rootPageId", null)
              .eq("archivedAt", null)
              .eq("pairKey", edge.pairKey),
          )
          .unique();
        if (existingV2 !== null) {
          await ctx.db.patch("pageCanvasEdgesV2", existingV2._id, {
            archivedAt: now,
            updatedAt: now,
          });
        }
        await ctx.db.delete("pageEdges", edgeId);
      }
    }
    return null;
  },
});
