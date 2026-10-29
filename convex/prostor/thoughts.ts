// Preneto iz Devotion packages/backend/convex/thoughts.ts (main @ c05c40f), SPAJANJE S05.
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { findAvailableCanvasPosition } from "./canvasPlacement";
import {
  requireProfile,
  requireClanProjekta,
  type ReadCtx as KontekstAdaptera,
} from "./lib/auth";
import { insertContribution } from "./lib/collaboration";
import {
  insertWorkspacePage,
  prepareWorkspacePage,
  validateWorkspacePageTarget,
} from "./lib/page_creation";
import {
  listMyActiveWorkspaces,
  workspaceMiniOf,
  type WorkspaceMini,
} from "./lib/my_scope";
import { nodeSearchText } from "./lib/pages";
import {
  boundedLimit,
  cleanRequiredText,
  pageKindValidator,
  workspaceMiniValidator,
  taskPriorityValidator,
  taskStatusValidator,
} from "./lib/validators";
import { prijavljenMutation, prijavljenQuery, projekatMutation, projekatQuery } from "../lib/projekat";

const MAX_NODE_PAGE_SIZE = 100;
const MAX_EDGE_PAGE_SIZE = 200;
const MAX_BULK_ITEMS = 50;
const MAX_CONNECTED_NODES = 200;
const MAX_CONNECTED_EDGES = 1_000;
const MAX_EDGES_IN_NODE_ACTION = 500;
const MAX_THOUGHT_TEXT = 12_000;
const MAX_THOUGHT_TITLE = 200;
const MAX_EDGE_LABEL = 120;
const MIN_THOUGHT_WIDTH = 240;
const MAX_THOUGHT_WIDTH = 720;
const MIN_THOUGHT_HEIGHT = 160;
const MAX_THOUGHT_HEIGHT = 1_000;

const thoughtColorValidator = v.union(
  v.literal("neutral"),
  v.literal("violet"),
  v.literal("blue"),
  v.literal("green"),
  v.literal("amber"),
  v.literal("rose"),
);

const thoughtCanvasDocumentValidator = v.object({
  _id: v.id("thoughtCanvases"),
  _creationTime: v.number(),
  workspaceId: v.id("workspaces"),
  ownerProfileId: v.id("profiles"),
  x: v.number(),
  y: v.number(),
  zoom: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const thoughtNodeDocumentValidator = v.object({
  _id: v.id("thoughtNodes"),
  _creationTime: v.number(),
  workspaceId: v.id("workspaces"),
  ownerProfileId: v.id("profiles"),
  title: v.union(v.string(), v.null()),
  text: v.string(),
  // Deo dokumenta otkako je uvedena pretraga (search_thoughts); vlasnički su
  // ionako scope-ovani, pa denormalizovani blob ne curi van vlasnika.
  // EXPAND faza: opcionalno da listNodes/getConnectedGroup ne pukne return
  // validaciju na starim redovima pre backfill-a. Narrow → v.string() zajedno sa
  // schema.ts (vidi docs/mobile/ZA-POPRAVKU.md).
  searchText: v.optional(v.string()),
  x: v.number(),
  y: v.number(),
  width: v.optional(v.number()),
  height: v.optional(v.number()),
  parentThoughtId: v.optional(v.id("thoughtNodes")),
  color: thoughtColorValidator,
  isParent: v.optional(v.boolean()),
  conversionCount: v.number(),
  lastConvertedIdeaId: v.optional(v.id("ideaNodes")),
  lastConvertedPageId: v.union(v.id("pages"), v.null()),
  lastConvertedAt: v.union(v.number(), v.null()),
  archivedAt: v.union(v.number(), v.null()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const thoughtEdgeDocumentValidator = v.object({
  _id: v.id("thoughtEdges"),
  _creationTime: v.number(),
  workspaceId: v.id("workspaces"),
  ownerProfileId: v.id("profiles"),
  nodeAId: v.id("thoughtNodes"),
  nodeBId: v.id("thoughtNodes"),
  pairKey: v.string(),
  label: v.union(v.string(), v.null()),
  archivedAt: v.union(v.number(), v.null()),
  archivedByNode: v.optional(v.boolean()),
  archivedForNodeIds: v.optional(v.array(v.id("thoughtNodes"))),
  createdAt: v.number(),
  updatedAt: v.number(),
});

type ReadCtx = QueryCtx | MutationCtx;
type ThoughtColor = Doc<"thoughtNodes">["color"];

function validatePageSize(numItems: number, max: number) {
  if (!Number.isInteger(numItems) || numItems < 1 || numItems > max) {
    throw new Error(`Po stranici možete učitati najviše ${max} stavki.`);
  }
}

function validateFinite(value: number, label: string) {
  if (!Number.isFinite(value)) throw new Error(`${label} nije ispravan.`);
  return value;
}

function validateZoom(zoom: number) {
  if (!Number.isFinite(zoom) || zoom < 0.1 || zoom > 4) {
    throw new Error("Nivo uvećanja mora biti između 0,1 i 4.");
  }
  return zoom;
}

function validateWithin(
  value: number,
  label: string,
  minimum: number,
  maximum: number,
) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${label} mora biti između ${minimum} i ${maximum}.`);
  }
  return value;
}

function cleanThoughtText(text: string) {
  const cleaned = text.trim();
  if (cleaned.length === 0) throw new Error("Tekst misli je obavezan.");
  if (cleaned.length > MAX_THOUGHT_TEXT) {
    throw new Error(`Tekst misli može imati najviše ${MAX_THOUGHT_TEXT} znakova.`);
  }
  return cleaned;
}

function cleanNullableText(
  value: string | null | undefined,
  label: string,
  maxLength: number,
) {
  if (value === null || value === undefined) return null;
  const cleaned = value.trim();
  if (cleaned.length > maxLength) {
    throw new Error(`${label} može imati najviše ${maxLength} znakova.`);
  }
  return cleaned.length === 0 ? null : cleaned;
}

function validateUniqueIds<TableName extends "thoughtNodes" | "thoughtEdges">(
  ids: Id<TableName>[],
  label: string,
  max = MAX_BULK_ITEMS,
) {
  if (ids.length < 1 || ids.length > max) {
    throw new Error(`${label} mora sadržati između 1 i ${max} stavki.`);
  }
  if (new Set<string>(ids).size !== ids.length) {
    throw new Error(`${label} ne sme sadržati duplikate.`);
  }
}

async function ensureCanvas(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  ownerProfileId: Id<"profiles">,
) {
  const existing = await ctx.db
    .query("thoughtCanvases")
    .withIndex("by_ownerProfileId_and_workspaceId", (q) =>
      q.eq("ownerProfileId", ownerProfileId).eq("workspaceId", workspaceId),
    )
    .unique();
  if (existing !== null) return existing._id;
  const now = Date.now();
  return await ctx.db.insert("thoughtCanvases", {
    workspaceId,
    ownerProfileId,
    x: 0,
    y: 0,
    zoom: 1,
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Ko sme da dira beleške jednog opsega (PROSTOR P7, R21). Lična beleška
 * (`startupId: null`) — samo aktivan profil vlasnika; beleška startupa — samo
 * dok je vlasnik aktivan član tog startupa. Vlasništvo proveravaju pozivaoci.
 */
async function requireNoteScope(
  ctx: ReadCtx,
  workspaceId: Id<"workspaces"> | null,
) {
  return workspaceId === null
    ? await requireProfile(ctx)
    : (await requireClanProjekta(ctx, workspaceId)).profile;
}

/**
 * Upiti Mape idu po startupu, pa im `startupId` nikad nije `null`; suženje
 * drži stari oblik odgovora (`v.id("startups")`) za postojeće klijente.
 */
function inStartupScope<T extends { workspaceId: Id<"workspaces"> | null }>(
  doc: T,
) {
  const workspaceId = doc.workspaceId;
  if (workspaceId === null) {
    throw new Error("Lična beleška nije deo mape projekta.");
  }
  return { ...doc, workspaceId };
}

async function requireOwnedNodes(
  ctx: ReadCtx,
  nodeIds: Id<"thoughtNodes">[],
  options?: {
    /** `null` = lične beleške; odsutno = opseg prve izabrane. */
    workspaceId?: Id<"workspaces"> | null;
    allowArchived?: boolean;
  },
) {
  validateUniqueIds(nodeIds, "Izbor misli");
  const first = await ctx.db.get("thoughtNodes", nodeIds[0]);
  const workspaceId =
    options?.workspaceId !== undefined ? options.workspaceId : first?.workspaceId;
  if (workspaceId === undefined) throw new Error("Misao nije pronađena.");
  const profile = await requireNoteScope(ctx, workspaceId);
  const nodes: Doc<"thoughtNodes">[] = [];
  for (const nodeId of nodeIds) {
    const node = nodeId === nodeIds[0] ? first : await ctx.db.get("thoughtNodes", nodeId);
    if (
      node === null ||
      node.workspaceId !== workspaceId ||
      node.ownerProfileId !== profile._id ||
      (!options?.allowArchived && node.archivedAt !== null)
    ) {
      throw new Error("Misao nije pronađena.");
    }
    nodes.push(node);
  }
  return { nodes, profile, workspaceId };
}

async function requireOwnedEdges(
  ctx: ReadCtx,
  edgeIds: Id<"thoughtEdges">[],
  options?: { allowArchived?: boolean },
) {
  validateUniqueIds(edgeIds, "Izbor veza");
  const first = await ctx.db.get("thoughtEdges", edgeIds[0]);
  if (first === null) throw new Error("Veza nije pronađena.");
  const profile = await requireNoteScope(ctx, first.workspaceId);
  const edges: Doc<"thoughtEdges">[] = [];
  for (const edgeId of edgeIds) {
    const edge = edgeId === edgeIds[0] ? first : await ctx.db.get("thoughtEdges", edgeId);
    if (
      edge === null ||
      edge.workspaceId !== first.workspaceId ||
      edge.ownerProfileId !== profile._id ||
      (!options?.allowArchived && edge.archivedAt !== null)
    ) {
      throw new Error("Veza nije pronađena.");
    }
    edges.push(edge);
  }
  return { edges, profile, workspaceId: first.workspaceId };
}

function normalizedPair(
  firstId: Id<"thoughtNodes">,
  secondId: Id<"thoughtNodes">,
) {
  const [nodeAId, nodeBId] =
    firstId < secondId ? [firstId, secondId] : [secondId, firstId];
  return { nodeAId, nodeBId, pairKey: `${nodeAId}:${nodeBId}` };
}

async function absoluteThoughtPosition(
  ctx: ReadCtx,
  node: Doc<"thoughtNodes">,
) {
  let x = node.x;
  let y = node.y;
  let parentId = node.parentThoughtId;
  const seen = new Set<string>([node._id]);
  for (let depth = 0; parentId !== undefined && depth < 512; depth += 1) {
    if (seen.has(parentId)) throw new Error("Otkrivena je kružna hijerarhija.");
    seen.add(parentId);
    const parent = await ctx.db.get("thoughtNodes", parentId);
    if (parent === null || parent.archivedAt !== null) break;
    x += parent.x;
    y += parent.y;
    parentId = parent.parentThoughtId;
  }
  return { x, y };
}

async function assertNoThoughtCycle(
  ctx: ReadCtx,
  childId: Id<"thoughtNodes">,
  parentId: Id<"thoughtNodes">,
) {
  if (childId === parentId) throw new Error("Misao ne može biti sopstveni Parent.");
  let cursor: Id<"thoughtNodes"> | undefined = parentId;
  for (let depth = 0; cursor !== undefined && depth < 512; depth += 1) {
    if (cursor === childId) {
      throw new Error("Ugnježđavanje bi napravilo kružnu hijerarhiju.");
    }
    const node: Doc<"thoughtNodes"> | null = await ctx.db.get(
      "thoughtNodes",
      cursor,
    );
    cursor = node?.parentThoughtId;
  }
  if (cursor !== undefined) {
    throw new Error("Hijerarhija je preduboka za bezbednu proveru.");
  }
}

export const getCanvas = projekatQuery({
  uloga: "urednik",
  args: {},
  returns: v.union(thoughtCanvasDocumentValidator, v.null()),
  handler: async (ctx, args) => {
    const { profile } = await requireClanProjekta(ctx, args.workspaceId);
    return await ctx.db
      .query("thoughtCanvases")
      .withIndex("by_ownerProfileId_and_workspaceId", (q) =>
        q
          .eq("ownerProfileId", profile._id)
          .eq("workspaceId", args.workspaceId),
      )
      .unique();
  },
});

export const listNodes = projekatQuery({
  uloga: "urednik",
  args: {
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(thoughtNodeDocumentValidator),
  handler: async (ctx, args) => {
    validatePageSize(args.paginationOpts.numItems, MAX_NODE_PAGE_SIZE);
    const { profile } = await requireClanProjekta(ctx, args.workspaceId);
    const result = await ctx.db
      .query("thoughtNodes")
      .withIndex(
        "by_ownerProfileId_and_workspaceId_and_archivedAt_and_updatedAt",
        (q) =>
          q
            .eq("ownerProfileId", profile._id)
            .eq("workspaceId", args.workspaceId)
            .eq("archivedAt", null),
      )
      .order("desc")
      .paginate(args.paginationOpts);
    return { ...result, page: result.page.map(inStartupScope) };
  },
});

export const listEdges = projekatQuery({
  uloga: "urednik",
  args: {
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(thoughtEdgeDocumentValidator),
  handler: async (ctx, args) => {
    validatePageSize(args.paginationOpts.numItems, MAX_EDGE_PAGE_SIZE);
    const { profile } = await requireClanProjekta(ctx, args.workspaceId);
    const result = await ctx.db
      .query("thoughtEdges")
      .withIndex(
        "by_ownerProfileId_and_workspaceId_and_archivedAt_and_updatedAt",
        (q) =>
          q
            .eq("ownerProfileId", profile._id)
            .eq("workspaceId", args.workspaceId)
            .eq("archivedAt", null),
      )
      .order("desc")
      .paginate(args.paginationOpts);
    return { ...result, page: result.page.map(inStartupScope) };
  },
});

export const saveViewport = projekatMutation({
  uloga: "urednik",
  args: {
    x: v.number(),
    y: v.number(),
    zoom: v.number(),
  },
  returns: v.id("thoughtCanvases"),
  handler: async (ctx, args) => {
    const { profile } = await requireClanProjekta(ctx, args.workspaceId);
    const x = validateFinite(args.x, "Horizontalna pozicija kanvasa");
    const y = validateFinite(args.y, "Vertikalna pozicija kanvasa");
    const zoom = validateZoom(args.zoom);
    const existing = await ctx.db
      .query("thoughtCanvases")
      .withIndex("by_ownerProfileId_and_workspaceId", (q) =>
        q
          .eq("ownerProfileId", profile._id)
          .eq("workspaceId", args.workspaceId),
      )
      .unique();
    const now = Date.now();
    if (existing !== null) {
      await ctx.db.patch("thoughtCanvases", existing._id, {
        x,
        y,
        zoom,
        updatedAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("thoughtCanvases", {
      workspaceId: args.workspaceId,
      ownerProfileId: profile._id,
      x,
      y,
      zoom,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const createNode = projekatMutation({
  uloga: "urednik",
  args: {
    title: v.string(),
    text: v.string(),
    x: v.number(),
    y: v.number(),
    color: thoughtColorValidator,
    isParent: v.optional(v.boolean()),
  },
  returns: v.id("thoughtNodes"),
  handler: async (ctx, args) => {
    const { profile } = await requireClanProjekta(ctx, args.workspaceId);
    const title = cleanRequiredText(
      args.title,
      "Naslov misli",
      MAX_THOUGHT_TITLE,
    );
    const text = cleanThoughtText(args.text);
    const x = validateFinite(args.x, "Horizontalna pozicija misli");
    const y = validateFinite(args.y, "Vertikalna pozicija misli");
    await ensureCanvas(ctx, args.workspaceId, profile._id);
    const now = Date.now();
    return await ctx.db.insert("thoughtNodes", {
      workspaceId: args.workspaceId,
      ownerProfileId: profile._id,
      title,
      text,
      searchText: nodeSearchText(title, text),
      x,
      y,
      color: args.color,
      isParent: args.isParent ?? false,
      conversionCount: 0,
      lastConvertedPageId: null,
      lastConvertedAt: null,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateNode = prijavljenMutation({
  args: {
    nodeId: v.id("thoughtNodes"),
    title: v.optional(v.string()),
    text: v.optional(v.string()),
    color: v.optional(thoughtColorValidator),
    isParent: v.optional(v.boolean()),
  },
  returns: v.id("thoughtNodes"),
  handler: async (ctx, args) => {
    const { nodes } = await requireOwnedNodes(ctx, [args.nodeId]);
    const node = nodes[0];
    const title =
      args.title === undefined
        ? node.title
        : cleanRequiredText(
            args.title,
            "Naslov misli",
            MAX_THOUGHT_TITLE,
          );
    const text =
      args.text === undefined ? node.text : cleanThoughtText(args.text);
    const color: ThoughtColor = args.color ?? node.color;
    const isParent = args.isParent === undefined ? node.isParent : args.isParent;
    if (
      title === node.title &&
      text === node.text &&
      color === node.color &&
      isParent === node.isParent
    ) {
      return node._id;
    }
    await ctx.db.patch("thoughtNodes", node._id, {
      title,
      text,
      searchText: nodeSearchText(title, text),
      color,
      isParent,
      updatedAt: Date.now(),
    });
    return node._id;
  },
});

export const toggleNodeParent = prijavljenMutation({
  args: {
    nodeId: v.id("thoughtNodes"),
    isParent: v.optional(v.boolean()),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const { nodes } = await requireOwnedNodes(ctx, [args.nodeId]);
    const node = nodes[0];
    const nextState = args.isParent ?? !node.isParent;
    await ctx.db.patch("thoughtNodes", node._id, {
      isParent: nextState,
      updatedAt: Date.now(),
    });
    return nextState;
  },
});

export const moveNodes = prijavljenMutation({
  args: {
    moves: v.array(
      v.object({
        nodeId: v.id("thoughtNodes"),
        x: v.number(),
        y: v.number(),
      }),
    ),
  },
  returns: v.array(v.id("thoughtNodes")),
  handler: async (ctx, args) => {
    const nodeIds = args.moves.map((move) => move.nodeId);
    validateUniqueIds(nodeIds, "Izbor misli");
    const { nodes } = await requireOwnedNodes(ctx, nodeIds);
    const coordinates = args.moves.map((move) => ({
      x: validateFinite(move.x, "Horizontalna pozicija misli"),
      y: validateFinite(move.y, "Vertikalna pozicija misli"),
    }));
    const now = Date.now();
    for (let index = 0; index < nodes.length; index += 1) {
      await ctx.db.patch("thoughtNodes", nodes[index]._id, {
        ...coordinates[index],
        updatedAt: now,
      });
    }
    return nodeIds;
  },
});

export const updateNodeLayout = prijavljenMutation({
  args: {
    nodeId: v.id("thoughtNodes"),
    x: v.number(),
    y: v.number(),
    width: v.number(),
    height: v.number(),
  },
  returns: v.id("thoughtNodes"),
  handler: async (ctx, args) => {
    const { nodes } = await requireOwnedNodes(ctx, [args.nodeId]);
    await ctx.db.patch("thoughtNodes", args.nodeId, {
      x: validateFinite(args.x, "Horizontalna pozicija misli"),
      y: validateFinite(args.y, "Vertikalna pozicija misli"),
      width: validateWithin(
        args.width,
        "Širina misli",
        MIN_THOUGHT_WIDTH,
        MAX_THOUGHT_WIDTH,
      ),
      height: validateWithin(
        args.height,
        "Visina misli",
        MIN_THOUGHT_HEIGHT,
        MAX_THOUGHT_HEIGHT,
      ),
      updatedAt: Date.now(),
    });
    return nodes[0]._id;
  },
});

export const resetNodeLayoutSize = prijavljenMutation({
  args: {
    nodeId: v.id("thoughtNodes"),
  },
  returns: v.id("thoughtNodes"),
  handler: async (ctx, args) => {
    const { nodes } = await requireOwnedNodes(ctx, [args.nodeId]);
    await ctx.db.patch("thoughtNodes", args.nodeId, {
      width: undefined,
      height: undefined,
      updatedAt: Date.now(),
    });
    return nodes[0]._id;
  },
});

export const nestNode = prijavljenMutation({
  args: {
    childNodeId: v.id("thoughtNodes"),
    parentNodeId: v.id("thoughtNodes"),
  },
  returns: v.id("thoughtNodes"),
  handler: async (ctx, args) => {
    const { nodes } = await requireOwnedNodes(ctx, [
      args.childNodeId,
      args.parentNodeId,
    ]);
    const child = nodes.find((node) => node._id === args.childNodeId)!;
    const parent = nodes.find((node) => node._id === args.parentNodeId)!;
    await assertNoThoughtCycle(ctx, child._id, parent._id);
    const childAbsolute = await absoluteThoughtPosition(ctx, child);
    const parentAbsolute = await absoluteThoughtPosition(ctx, parent);
    await ctx.db.patch("thoughtNodes", child._id, {
      parentThoughtId: parent._id,
      x: childAbsolute.x - parentAbsolute.x,
      y: childAbsolute.y - parentAbsolute.y,
      updatedAt: Date.now(),
    });
    return child._id;
  },
});

export const detachNode = prijavljenMutation({
  args: { nodeId: v.id("thoughtNodes") },
  returns: v.id("thoughtNodes"),
  handler: async (ctx, args) => {
    const { nodes } = await requireOwnedNodes(ctx, [args.nodeId]);
    const node = nodes[0];
    if (node.parentThoughtId === undefined) return node._id;
    const absolute = await absoluteThoughtPosition(ctx, node);
    await ctx.db.patch("thoughtNodes", node._id, {
      parentThoughtId: undefined,
      x: absolute.x,
      y: absolute.y,
      updatedAt: Date.now(),
    });
    return node._id;
  },
});

export const duplicateNodes = prijavljenMutation({
  args: {
    nodeIds: v.array(v.id("thoughtNodes")),
    offsetX: v.number(),
    offsetY: v.number(),
  },
  returns: v.array(v.id("thoughtNodes")),
  handler: async (ctx, args) => {
    const { nodes, profile, workspaceId } = await requireOwnedNodes(
      ctx,
      args.nodeIds,
    );
    const offsetX = validateFinite(args.offsetX, "Horizontalni pomeraj");
    const offsetY = validateFinite(args.offsetY, "Vertikalni pomeraj");
    for (const node of nodes) {
      validateFinite(node.x + offsetX, "Horizontalna pozicija misli");
      validateFinite(node.y + offsetY, "Vertikalna pozicija misli");
    }
    // Lične beleške nemaju Mapu (P7).
    if (workspaceId !== null) await ensureCanvas(ctx, workspaceId, profile._id);
    const now = Date.now();
    const ids: Id<"thoughtNodes">[] = [];
    for (const node of nodes) {
      ids.push(
        await ctx.db.insert("thoughtNodes", {
          workspaceId,
          ownerProfileId: profile._id,
          title: node.title,
          text: node.text,
          searchText: nodeSearchText(node.title, node.text),
          x: node.x + offsetX,
          y: node.y + offsetY,
          width: node.width,
          height: node.height,
          color: node.color,
          conversionCount: 0,
          lastConvertedPageId: null,
          lastConvertedAt: null,
          archivedAt: null,
          createdAt: now,
          updatedAt: now,
        }),
      );
    }
    return ids;
  },
});

async function collectEdgesTouchingNodes(
  ctx: ReadCtx,
  ownerProfileId: Id<"profiles">,
  workspaceId: Id<"workspaces"> | null,
  nodeIds: Id<"thoughtNodes">[],
  options: { includeActive: boolean; includeNodeArchived: boolean },
) {
  const edges = new Map<Id<"thoughtEdges">, Doc<"thoughtEdges">>();
  const addEdges = (candidates: Doc<"thoughtEdges">[], allowance: number) => {
    if (candidates.length > allowance) {
      throw new Error(
        `Izabrane misli imaju više od ${MAX_EDGES_IN_NODE_ACTION} veza. Prvo arhivirajte deo veza.`,
      );
    }
    for (const edge of candidates) edges.set(edge._id, edge);
  };

  for (const nodeId of nodeIds) {
    if (options.includeActive) {
      const knownOutgoing = [...edges.values()].filter(
        (edge) => edge.nodeAId === nodeId,
      ).length;
      const outgoingAllowance =
        MAX_EDGES_IN_NODE_ACTION - edges.size + knownOutgoing;
      const outgoing = await ctx.db
        .query("thoughtEdges")
        .withIndex(
          "by_ownerProfileId_and_workspaceId_and_nodeAId_and_archivedAt",
          (q) =>
            q
              .eq("ownerProfileId", ownerProfileId)
              .eq("workspaceId", workspaceId)
              .eq("nodeAId", nodeId)
              .eq("archivedAt", null),
        )
        .take(Math.max(1, outgoingAllowance + 1));
      addEdges(outgoing, outgoingAllowance);

      const knownIncoming = [...edges.values()].filter(
        (edge) => edge.nodeBId === nodeId,
      ).length;
      const incomingAllowance =
        MAX_EDGES_IN_NODE_ACTION - edges.size + knownIncoming;
      const incoming = await ctx.db
        .query("thoughtEdges")
        .withIndex(
          "by_ownerProfileId_and_workspaceId_and_nodeBId_and_archivedAt",
          (q) =>
            q
              .eq("ownerProfileId", ownerProfileId)
              .eq("workspaceId", workspaceId)
              .eq("nodeBId", nodeId)
              .eq("archivedAt", null),
        )
        .take(Math.max(1, incomingAllowance + 1));
      addEdges(incoming, incomingAllowance);
    }

    if (options.includeNodeArchived) {
      const knownOutgoing = [...edges.values()].filter(
        (edge) => edge.nodeAId === nodeId,
      ).length;
      const outgoingAllowance =
        MAX_EDGES_IN_NODE_ACTION - edges.size + knownOutgoing;
      const outgoing = await ctx.db
        .query("thoughtEdges")
        .withIndex(
          "by_ownerProfileId_and_workspaceId_and_nodeAId_and_archivedByNode",
          (q) =>
            q
              .eq("ownerProfileId", ownerProfileId)
              .eq("workspaceId", workspaceId)
              .eq("nodeAId", nodeId)
              .eq("archivedByNode", true),
        )
        .take(Math.max(1, outgoingAllowance + 1));
      addEdges(outgoing, outgoingAllowance);

      const knownIncoming = [...edges.values()].filter(
        (edge) => edge.nodeBId === nodeId,
      ).length;
      const incomingAllowance =
        MAX_EDGES_IN_NODE_ACTION - edges.size + knownIncoming;
      const incoming = await ctx.db
        .query("thoughtEdges")
        .withIndex(
          "by_ownerProfileId_and_workspaceId_and_nodeBId_and_archivedByNode",
          (q) =>
            q
              .eq("ownerProfileId", ownerProfileId)
              .eq("workspaceId", workspaceId)
              .eq("nodeBId", nodeId)
              .eq("archivedByNode", true),
        )
        .take(Math.max(1, incomingAllowance + 1));
      addEdges(incoming, incomingAllowance);
    }
  }
  return [...edges.values()];
}

export const getConnectedGroup = projekatQuery({
  uloga: "urednik",
  args: {
    nodeId: v.id("thoughtNodes"),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    nodes: v.array(thoughtNodeDocumentValidator),
    edges: v.array(thoughtEdgeDocumentValidator),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const limit = args.limit ?? MAX_CONNECTED_NODES;
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_CONNECTED_NODES) {
      throw new Error(
        `Povezana grupa može imati najviše ${MAX_CONNECTED_NODES} misli.`,
      );
    }
    const { profile } = await requireClanProjekta(ctx, args.workspaceId);
    const start = await ctx.db.get("thoughtNodes", args.nodeId);
    if (
      start === null ||
      start.workspaceId !== args.workspaceId ||
      start.ownerProfileId !== profile._id ||
      start.archivedAt !== null
    ) {
      throw new Error("Misao nije pronađena.");
    }

    const nodes = new Map<Id<"thoughtNodes">, Doc<"thoughtNodes">>([
      [start._id, start],
    ]);
    const edges = new Map<Id<"thoughtEdges">, Doc<"thoughtEdges">>();
    const queue: Id<"thoughtNodes">[] = [start._id];
    let truncated = false;

    for (let index = 0; index < queue.length && !truncated; index += 1) {
      const nodeId = queue[index];
      const knownOutgoing = [...edges.values()].filter(
        (edge) => edge.nodeAId === nodeId,
      ).length;
      const outgoingAllowance =
        MAX_CONNECTED_EDGES - edges.size + knownOutgoing;
      const outgoing = await ctx.db
        .query("thoughtEdges")
        .withIndex(
          "by_ownerProfileId_and_workspaceId_and_nodeAId_and_archivedAt",
          (q) =>
            q
              .eq("ownerProfileId", profile._id)
              .eq("workspaceId", args.workspaceId)
              .eq("nodeAId", nodeId)
              .eq("archivedAt", null),
        )
        .take(Math.max(1, outgoingAllowance + 1));
      if (outgoing.length > outgoingAllowance) truncated = true;
      for (const edge of outgoing.slice(0, Math.max(0, outgoingAllowance))) {
        edges.set(edge._id, edge);
      }

      if (!truncated) {
        const knownIncoming = [...edges.values()].filter(
          (edge) => edge.nodeBId === nodeId,
        ).length;
        const incomingAllowance =
          MAX_CONNECTED_EDGES - edges.size + knownIncoming;
        const incoming = await ctx.db
          .query("thoughtEdges")
          .withIndex(
            "by_ownerProfileId_and_workspaceId_and_nodeBId_and_archivedAt",
            (q) =>
              q
                .eq("ownerProfileId", profile._id)
                .eq("workspaceId", args.workspaceId)
                .eq("nodeBId", nodeId)
                .eq("archivedAt", null),
          )
          .take(Math.max(1, incomingAllowance + 1));
        if (incoming.length > incomingAllowance) truncated = true;
        for (const edge of incoming.slice(0, Math.max(0, incomingAllowance))) {
          edges.set(edge._id, edge);
        }
      }

      for (const edge of edges.values()) {
        if (edge.nodeAId !== nodeId && edge.nodeBId !== nodeId) continue;
        const neighbourId =
          edge.nodeAId === nodeId ? edge.nodeBId : edge.nodeAId;
        if (nodes.has(neighbourId)) continue;
        if (nodes.size >= limit) {
          truncated = true;
          break;
        }
        const neighbour = await ctx.db.get("thoughtNodes", neighbourId);
        if (
          neighbour !== null &&
          neighbour.workspaceId === args.workspaceId &&
          neighbour.ownerProfileId === profile._id &&
          neighbour.archivedAt === null
        ) {
          nodes.set(neighbour._id, neighbour);
          queue.push(neighbour._id);
        }
      }
    }

    const includedIds = new Set(nodes.keys());
    return {
      nodes: [...nodes.values()].map(inStartupScope),
      edges: [...edges.values()]
        .filter(
          (edge) =>
            includedIds.has(edge.nodeAId) && includedIds.has(edge.nodeBId),
        )
        .map(inStartupScope),
      truncated,
    };
  },
});

export const archiveNodes = prijavljenMutation({
  args: { nodeIds: v.array(v.id("thoughtNodes")) },
  returns: v.array(v.id("thoughtNodes")),
  handler: async (ctx, args) => {
    const { nodes, profile, workspaceId } = await requireOwnedNodes(
      ctx,
      args.nodeIds,
      { allowArchived: true },
    );
    const edges = await collectEdgesTouchingNodes(
      ctx,
      profile._id,
      workspaceId,
      args.nodeIds,
      { includeActive: true, includeNodeArchived: true },
    );
    const selectedNodeIds = new Set<Id<"thoughtNodes">>(args.nodeIds);
    const now = Date.now();
    for (const node of nodes) {
      if (node.archivedAt === null) {
        const children = await ctx.db
          .query("thoughtNodes")
          .withIndex("by_parentThoughtId_and_archivedAt", (q) =>
            q.eq("parentThoughtId", node._id).eq("archivedAt", null),
          )
          .take(200);
        for (const child of children) {
          if (!selectedNodeIds.has(child._id)) {
            await ctx.db.patch("thoughtNodes", child._id, {
              parentThoughtId: node.parentThoughtId,
              x: child.x + node.x,
              y: child.y + node.y,
              updatedAt: now,
            });
          }
        }
        await ctx.db.patch("thoughtNodes", node._id, {
          archivedAt: now,
          updatedAt: now,
        });
      }
    }
    for (const edge of edges) {
      const archivedForNodeIds = new Set<Id<"thoughtNodes">>(
        edge.archivedByNode ? edge.archivedForNodeIds ?? [] : [],
      );
      if (selectedNodeIds.has(edge.nodeAId)) archivedForNodeIds.add(edge.nodeAId);
      if (selectedNodeIds.has(edge.nodeBId)) archivedForNodeIds.add(edge.nodeBId);
      await ctx.db.patch("thoughtEdges", edge._id, {
        archivedAt: edge.archivedAt ?? now,
        archivedByNode: true,
        archivedForNodeIds: [...archivedForNodeIds],
        updatedAt: now,
      });
    }
    return args.nodeIds;
  },
});

export const restoreNodes = prijavljenMutation({
  args: { nodeIds: v.array(v.id("thoughtNodes")) },
  returns: v.array(v.id("thoughtNodes")),
  handler: async (ctx, args) => {
    const { nodes, profile, workspaceId } = await requireOwnedNodes(
      ctx,
      args.nodeIds,
      { allowArchived: true },
    );
    const edges = await collectEdgesTouchingNodes(
      ctx,
      profile._id,
      workspaceId,
      args.nodeIds,
      { includeActive: false, includeNodeArchived: true },
    );
    const restoring = new Set<Id<"thoughtNodes">>(args.nodeIds);
    const nodeCache = new Map<Id<"thoughtNodes">, Doc<"thoughtNodes">>(
      nodes.map((node) => [node._id, node]),
    );
    const edgeUpdates: Array<{
      edge: Doc<"thoughtEdges">;
      archivedForNodeIds: Id<"thoughtNodes">[];
      restore: boolean;
    }> = [];
    for (const edge of edges) {
      let nodeA = nodeCache.get(edge.nodeAId);
      if (nodeA === undefined) {
        nodeA = (await ctx.db.get("thoughtNodes", edge.nodeAId)) ?? undefined;
        if (nodeA !== undefined) nodeCache.set(nodeA._id, nodeA);
      }
      let nodeB = nodeCache.get(edge.nodeBId);
      if (nodeB === undefined) {
        nodeB = (await ctx.db.get("thoughtNodes", edge.nodeBId)) ?? undefined;
        if (nodeB !== undefined) nodeCache.set(nodeB._id, nodeB);
      }
      if (
        nodeA === undefined ||
        nodeB === undefined ||
        nodeA.workspaceId !== workspaceId ||
        nodeB.workspaceId !== workspaceId ||
        nodeA.ownerProfileId !== profile._id ||
        nodeB.ownerProfileId !== profile._id
      ) {
        throw new Error("Veza upućuje na nepostojeću privatnu misao.");
      }
      const nodeAActive = nodeA.archivedAt === null || restoring.has(nodeA._id);
      const nodeBActive = nodeB.archivedAt === null || restoring.has(nodeB._id);
      const archivedForNodeIds = (edge.archivedForNodeIds ?? []).filter(
        (nodeId) => !restoring.has(nodeId),
      );
      edgeUpdates.push({
        edge,
        archivedForNodeIds,
        restore:
          edge.archivedAt !== null &&
          archivedForNodeIds.length === 0 &&
          nodeAActive &&
          nodeBActive,
      });
    }

    const now = Date.now();
    for (const node of nodes) {
      if (node.archivedAt !== null) {
        await ctx.db.patch("thoughtNodes", node._id, {
          archivedAt: null,
          updatedAt: now,
        });
      }
    }
    for (const update of edgeUpdates) {
      await ctx.db.patch(
        "thoughtEdges",
        update.edge._id,
        update.restore
          ? {
              archivedAt: null,
              archivedByNode: false,
              archivedForNodeIds: [],
              updatedAt: now,
            }
          : {
              archivedByNode: true,
              archivedForNodeIds: update.archivedForNodeIds,
              updatedAt: now,
            },
      );
    }
    return args.nodeIds;
  },
});

export const createEdge = projekatMutation({
  uloga: "urednik",
  args: {
    nodeAId: v.id("thoughtNodes"),
    nodeBId: v.id("thoughtNodes"),
    label: v.optional(v.string()),
  },
  returns: v.id("thoughtEdges"),
  handler: async (ctx, args) => {
    if (args.nodeAId === args.nodeBId) {
      throw new Error("Misao ne može biti povezana sama sa sobom.");
    }
    const { profile } = await requireClanProjekta(ctx, args.workspaceId);
    await requireOwnedNodes(ctx, [args.nodeAId, args.nodeBId], {
      workspaceId: args.workspaceId,
    });
    const pair = normalizedPair(args.nodeAId, args.nodeBId);
    const label = cleanNullableText(args.label, "Naziv veze", MAX_EDGE_LABEL);
    const existing = await ctx.db
      .query("thoughtEdges")
      .withIndex("by_ownerProfileId_and_workspaceId_and_pairKey", (q) =>
        q
          .eq("ownerProfileId", profile._id)
          .eq("workspaceId", args.workspaceId)
          .eq("pairKey", pair.pairKey),
      )
      .unique();
    const now = Date.now();
    if (existing !== null) {
      if (existing.archivedAt === null) throw new Error("Veza već postoji.");
      await ctx.db.patch("thoughtEdges", existing._id, {
        ...pair,
        label,
        archivedAt: null,
        archivedByNode: false,
        archivedForNodeIds: [],
        updatedAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("thoughtEdges", {
      workspaceId: args.workspaceId,
      ownerProfileId: profile._id,
      ...pair,
      label,
      archivedAt: null,
      archivedByNode: false,
      archivedForNodeIds: [],
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateEdge = prijavljenMutation({
  args: {
    edgeId: v.id("thoughtEdges"),
    nodeAId: v.optional(v.id("thoughtNodes")),
    nodeBId: v.optional(v.id("thoughtNodes")),
    label: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.id("thoughtEdges"),
  handler: async (ctx, args) => {
    const { edges } = await requireOwnedEdges(ctx, [args.edgeId]);
    const edge = edges[0];
    const nodeAId = args.nodeAId ?? edge.nodeAId;
    const nodeBId = args.nodeBId ?? edge.nodeBId;
    if (nodeAId === nodeBId) {
      throw new Error("Misao ne može biti povezana sama sa sobom.");
    }
    if (args.nodeAId !== undefined || args.nodeBId !== undefined) {
      await requireOwnedNodes(ctx, [nodeAId, nodeBId], {
        workspaceId: edge.workspaceId,
      });
    }
    const pair = normalizedPair(nodeAId, nodeBId);
    const label =
      args.label === undefined
        ? edge.label
        : cleanNullableText(args.label, "Naziv veze", MAX_EDGE_LABEL);
    await ctx.db.patch("thoughtEdges", edge._id, {
      ...pair,
      label,
      updatedAt: Date.now(),
    });
    return edge._id;
  },
});

export const archiveEdges = prijavljenMutation({
  args: { edgeIds: v.array(v.id("thoughtEdges")) },
  returns: v.array(v.id("thoughtEdges")),
  handler: async (ctx, args) => {
    const { edges } = await requireOwnedEdges(ctx, args.edgeIds, {
      allowArchived: true,
    });
    const now = Date.now();
    for (const edge of edges) {
      if (edge.archivedAt === null || edge.archivedByNode === true) {
        await ctx.db.patch("thoughtEdges", edge._id, {
          archivedAt: edge.archivedAt ?? now,
          archivedByNode: false,
          archivedForNodeIds: [],
          updatedAt: now,
        });
      }
    }
    return args.edgeIds;
  },
});

export const restoreEdges = prijavljenMutation({
  args: { edgeIds: v.array(v.id("thoughtEdges")) },
  returns: v.array(v.id("thoughtEdges")),
  handler: async (ctx, args) => {
    const { edges, profile, workspaceId } = await requireOwnedEdges(
      ctx,
      args.edgeIds,
      { allowArchived: true },
    );
    for (const edge of edges) {
      const [nodeA, nodeB] = await Promise.all([
        ctx.db.get("thoughtNodes", edge.nodeAId),
        ctx.db.get("thoughtNodes", edge.nodeBId),
      ]);
      if (
        nodeA === null ||
        nodeB === null ||
        nodeA.workspaceId !== workspaceId ||
        nodeB.workspaceId !== workspaceId ||
        nodeA.ownerProfileId !== profile._id ||
        nodeB.ownerProfileId !== profile._id ||
        nodeA.archivedAt !== null ||
        nodeB.archivedAt !== null
      ) {
        throw new Error("Obe misli moraju biti aktivne pre vraćanja veze.");
      }
    }
    const now = Date.now();
    for (const edge of edges) {
      if (edge.archivedAt !== null) {
        await ctx.db.patch("thoughtEdges", edge._id, {
          archivedAt: null,
          archivedByNode: false,
          archivedForNodeIds: [],
          updatedAt: now,
        });
      }
    }
    return args.edgeIds;
  },
});

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function thoughtTextHtml(text: string) {
  return text
    .split(/\n{2,}/u)
    .map(
      (paragraph) =>
        `<p>${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`,
    )
    .join("");
}

function titleFromText(text: string) {
  const firstLine = text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return cleanRequiredText(
    (firstLine ?? "Nova misao").slice(0, MAX_THOUGHT_TITLE),
    "Naslov",
    MAX_THOUGHT_TITLE,
  );
}

function defaultThoughtTitle(node: Doc<"thoughtNodes">) {
  if (node.title !== null) return node.title;
  return titleFromText(node.text);
}

const IDEA_PLACEMENT_SCAN = 200;
const IDEA_BOX = { width: 264, height: 196 };

/**
 * Lična beleška nema mesto na Mapi (0, 0), pa ideja iz nje dobija slobodno
 * mesto na kanvasu ideja ciljnog startupa — ne preklapa postojeće gornje
 * ideje ni ideje iz iste serije.
 */
async function ideaPlacementPlanner(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
) {
  const existing = await ctx.db
    .query("ideaNodes")
    .withIndex("by_workspaceId_and_archivedAt_and_updatedAt", (q) =>
      q.eq("workspaceId", workspaceId).eq("archivedAt", null),
    )
    .order("desc")
    .take(IDEA_PLACEMENT_SCAN);
  const occupied = existing
    .filter((idea) => idea.parentIdeaId === undefined)
    .map((idea) => ({
      x: idea.x,
      y: idea.y,
      width: idea.width ?? IDEA_BOX.width,
      height: idea.height ?? IDEA_BOX.height,
    }));
  return () => {
    const position = findAvailableCanvasPosition(occupied, IDEA_BOX);
    occupied.push({ ...position, ...IDEA_BOX });
    return { x: position.x, y: position.y };
  };
}

function combinedNoteHtml(nodes: Doc<"thoughtNodes">[]) {
  const parent = nodes.find((n) => n.isParent);
  if (parent && nodes.length > 1) {
    const children = nodes.filter((n) => n._id !== parent._id);
    const parentTitle = defaultThoughtTitle(parent);
    const parentHeader = `<h2 style="font-size: 1.35rem; font-weight: 700; margin-bottom: 0.5rem;">${escapeHtml(parentTitle)}</h2>${thoughtTextHtml(parent.text)}`;
    const childrenList = `<ul style="margin-top: 1rem; list-style-type: disc; padding-left: 1.5rem;">${children
      .map(
        (child) =>
          `<li><strong>${escapeHtml(defaultThoughtTitle(child))}</strong>: ${escapeHtml(child.text).replaceAll("\n", "<br>")}</li>`,
      )
      .join("")}</ul>`;
    return parentHeader + childrenList;
  }
  return nodes
    .map(
      (node) =>
        `<h2>${escapeHtml(defaultThoughtTitle(node))}</h2>${thoughtTextHtml(node.text)}`,
    )
    .join("");
}

function combinedTaskHtml(nodes: Doc<"thoughtNodes">[]) {
  const parent = nodes.find((n) => n.isParent);
  if (parent && nodes.length > 1) {
    const children = nodes.filter((n) => n._id !== parent._id);
    const items = children
      .map(
        (node) =>
          `<li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>${escapeHtml(node.text).replaceAll("\n", "<br>")}</p></div></li>`,
      )
      .join("");
    return `<p><strong>${escapeHtml(defaultThoughtTitle(parent))}</strong>: ${escapeHtml(parent.text).replaceAll("\n", "<br>")}</p><ul data-type="taskList">${items}</ul>`;
  }
  const items = nodes
    .map(
      (node) =>
        `<li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>${escapeHtml(node.text).replaceAll("\n", "<br>")}</p></div></li>`,
    )
    .join("");
  return `<ul data-type="taskList">${items}</ul>`;
}

/**
 * „Pošalji u startup" (PROSTOR P7, K01 D10): moje beleške postaju ideje (faza
 * Predlog) u startupu `startupId`. Beleške su lične ili iz mog aktivnog
 * startupa, sve iz istog opsega; ciljni startup je bilo koji u kome sam aktivan
 * član. Stari klijenti šalju startup samih misli — ponašanje je isto kao ranije.
 */
export const convertToIdeas = projekatMutation({
  uloga: "urednik",
  args: {
    nodeIds: v.array(v.id("thoughtNodes")),
  },
  returns: v.object({
    ideaIds: v.array(v.id("ideaNodes")),
    createdEdgeCount: v.number(),
  }),
  handler: async (ctx, args) => {
    // SPAJANJE S05: izvor sme biti lična beleška ili beleška iz drugog mog
    // projekta. Omotač je proverio CILJ (`ctx.projekat`), pa se članstvo u
    // izvoru proverava kao na ličnom nivou (bar urednik), bez cilja.
    const izvor: KontekstAdaptera = { ...ctx, projekat: undefined };
    const {
      nodes,
      profile,
      workspaceId: sourceStartupId,
    } = await requireOwnedNodes(izvor, args.nodeIds);
    if (sourceStartupId !== args.workspaceId) {
      await requireClanProjekta(ctx, args.workspaceId);
    }
    // Lične beleške nemaju raspored na Mapi — redosled je redosled izbora
    // (`requireOwnedNodes` čuva redosled `nodeIds`).
    const sortedNodes =
      sourceStartupId === null
        ? [...nodes]
        : [...nodes].sort(
            (first, second) =>
              first.y - second.y ||
              first.x - second.x ||
              first._id.localeCompare(second._id),
          );
    const nextPersonalPosition =
      sourceStartupId === null
        ? await ideaPlacementPlanner(ctx, args.workspaceId)
        : null;
    const selectedNodeIds = new Set<string>(args.nodeIds);
    const sourceEdges = new Map<Id<"thoughtEdges">, Doc<"thoughtEdges">>();

    for (const node of sortedNodes) {
      const [edgesFromA, edgesFromB] = await Promise.all([
        ctx.db
          .query("thoughtEdges")
          .withIndex(
            "by_ownerProfileId_and_workspaceId_and_nodeAId_and_archivedAt",
            (q) =>
              q
                .eq("ownerProfileId", profile._id)
                .eq("workspaceId", sourceStartupId)
                .eq("nodeAId", node._id)
                .eq("archivedAt", null),
          )
          .collect(),
        ctx.db
          .query("thoughtEdges")
          .withIndex(
            "by_ownerProfileId_and_workspaceId_and_nodeBId_and_archivedAt",
            (q) =>
              q
                .eq("ownerProfileId", profile._id)
                .eq("workspaceId", sourceStartupId)
                .eq("nodeBId", node._id)
                .eq("archivedAt", null),
          )
          .collect(),
      ]);

      for (const edge of [...edgesFromA, ...edgesFromB]) {
        if (
          selectedNodeIds.has(edge.nodeAId) &&
          selectedNodeIds.has(edge.nodeBId)
        ) {
          sourceEdges.set(edge._id, edge);
        }
      }
    }

    const now = Date.now();
    const ideaIdByThoughtId = new Map<
      Id<"thoughtNodes">,
      Id<"ideaNodes">
    >();
    const ideaIds: Id<"ideaNodes">[] = [];

    for (const node of sortedNodes) {
      const position =
        nextPersonalPosition === null
          ? { x: node.x, y: node.y }
          : nextPersonalPosition();
      const ideaId = await ctx.db.insert("ideaNodes", {
        workspaceId: args.workspaceId,
        authorProfileId: profile._id,
        title: node.title ?? defaultThoughtTitle(node),
        text: node.text,
        searchText: nodeSearchText(node.title ?? defaultThoughtTitle(node), node.text),
        ...position,
        color: node.color,
        isParent: node.isParent ?? false,
        convertedPageId: null,
        convertedAt: null,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      await insertContribution(ctx, {
        workspaceId: args.workspaceId,
        targetKind: "idea",
        targetId: ideaId,
        authorProfileId: profile._id,
        content: node.text,
        sourceKind: "idea_original",
        sourceId: ideaId,
        moderationStatus: "approved",
        createdAt: now,
      });
      await ctx.db.insert("ideaVotes", {
        workspaceId: args.workspaceId,
        ideaId,
        profileId: profile._id,
        voteType: "up",
        createdAt: now,
      });
      ideaIdByThoughtId.set(node._id, ideaId);
      ideaIds.push(ideaId);
    }

    let createdEdgeCount = 0;
    for (const edge of sourceEdges.values()) {
      const firstIdeaId = ideaIdByThoughtId.get(edge.nodeAId);
      const secondIdeaId = ideaIdByThoughtId.get(edge.nodeBId);
      if (firstIdeaId === undefined || secondIdeaId === undefined) continue;
      const [nodeAId, nodeBId] =
        firstIdeaId < secondIdeaId
          ? [firstIdeaId, secondIdeaId]
          : [secondIdeaId, firstIdeaId];
      await ctx.db.insert("ideaEdges", {
        workspaceId: args.workspaceId,
        authorProfileId: profile._id,
        nodeAId,
        nodeBId,
        pairKey: `${nodeAId}:${nodeBId}`,
        label: edge.label,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      createdEdgeCount += 1;
    }

    for (const node of nodes) {
      const ideaId = ideaIdByThoughtId.get(node._id);
      if (ideaId === undefined) {
        throw new Error("Konverzija nije povezala svaku misao sa idejom.");
      }
      await ctx.db.patch("thoughtNodes", node._id, {
        conversionCount: node.conversionCount + 1,
        lastConvertedIdeaId: ideaId,
        lastConvertedAt: now,
        updatedAt: now,
      });
    }

    return { ideaIds, createdEdgeCount };
  },
});

export const convertToPages = projekatMutation({
  uloga: "urednik",
  args: {
    nodeIds: v.array(v.id("thoughtNodes")),
    targetAreaId: v.id("areas"),
    targetParentPageId: v.union(v.id("pages"), v.null()),
    layoutMode: v.union(v.literal("combined"), v.literal("separate")),
    pageKind: pageKindValidator,
    combinedTitle: v.optional(v.string()),
    titleOverrides: v.optional(
      v.array(
        v.object({
          nodeId: v.id("thoughtNodes"),
          title: v.string(),
        }),
      ),
    ),
    taskStatus: v.optional(taskStatusValidator),
    taskPriority: v.optional(taskPriorityValidator),
    assigneeProfileId: v.optional(v.union(v.id("profiles"), v.null())),
    dueDate: v.optional(v.union(v.number(), v.null())),
  },
  returns: v.object({ pageIds: v.array(v.id("pages")) }),
  handler: async (ctx, args) => {
    const { nodes, profile } = await requireOwnedNodes(ctx, args.nodeIds, {
      workspaceId: args.workspaceId,
    });
    if (args.nodeIds.length > 0) {
      throw new Error(
        "Misli se prvo šalju u Ideje. Zadatak ili belešku zatim kreirajte iz odobrene ideje.",
      );
    }

    if (args.layoutMode === "combined" && (args.titleOverrides?.length ?? 0) > 0) {
      throw new Error("Pojedinačni naslovi se koriste samo za odvojene stranice.");
    }
    if (
      args.layoutMode === "separate" &&
      args.combinedTitle !== undefined &&
      args.combinedTitle.trim().length > 0
    ) {
      throw new Error("Zajednički naslov se koristi samo za spojenu stranicu.");
    }

    const selectedIds = new Set<Id<"thoughtNodes">>(args.nodeIds);
    const titleOverrides = new Map<Id<"thoughtNodes">, string>();
    if ((args.titleOverrides?.length ?? 0) > MAX_BULK_ITEMS) {
      throw new Error(
        `Možete zadati najviše ${MAX_BULK_ITEMS} pojedinačnih naslova.`,
      );
    }
    for (const override of args.titleOverrides ?? []) {
      if (!selectedIds.has(override.nodeId)) {
        throw new Error("Naslov je zadat za misao koja nije izabrana.");
      }
      if (titleOverrides.has(override.nodeId)) {
        throw new Error("Naslov iste misli je zadat više puta.");
      }
      titleOverrides.set(
        override.nodeId,
        cleanRequiredText(override.title, "Naslov", MAX_THOUGHT_TITLE),
      );
    }

    const sortedNodes = [...nodes].sort(
      (first, second) =>
        first.y - second.y ||
        first.x - second.x ||
        first._id.localeCompare(second._id),
    );

    const now = Date.now();
    const parentNode = sortedNodes.find((n) => n.isParent);
    const childNodes = parentNode
      ? sortedNodes.filter((n) => n._id !== parentNode._id)
      : [];

    const checkpoints =
      args.pageKind === "task" && parentNode && childNodes.length > 0
        ? childNodes.map((child, idx) => ({
            id: `cp-${now}-${idx}`,
            text: child.title ? `${child.title}: ${child.text}` : child.text,
            completed: false,
          }))
        : undefined;

    const instructions =
      args.pageKind === "task" && parentNode ? parentNode.text : undefined;

    const target = await validateWorkspacePageTarget(ctx, {
      workspaceId: args.workspaceId,
      areaId: args.targetAreaId,
      parentPageId: args.targetParentPageId,
      kind: args.pageKind,
      taskStatus: args.taskStatus,
      taskPriority: args.taskPriority,
      assigneeProfileId: args.assigneeProfileId,
      dueDate: args.dueDate,
      instructions,
      checkpoints,
    });
    const pageInputs =
      args.layoutMode === "combined"
        ? [
            {
              nodes: sortedNodes,
              title: cleanRequiredText(
                (args.combinedTitle?.trim().length ?? 0) > 0
                  ? args.combinedTitle!
                  : parentNode
                    ? defaultThoughtTitle(parentNode)
                    : sortedNodes.length === 1
                      ? defaultThoughtTitle(sortedNodes[0])
                      : "Misli za radni prostor",
                "Naslov",
                MAX_THOUGHT_TITLE,
              ),
              content:
                args.pageKind === "task"
                  ? combinedTaskHtml(sortedNodes)
                  : combinedNoteHtml(sortedNodes),
              position: now,
            },
          ]
        : sortedNodes.map((node, index) => ({
            nodes: [node],
            title: titleOverrides.get(node._id) ?? defaultThoughtTitle(node),
            content: thoughtTextHtml(node.text),
            // List children are ordered descending, so the first visual thought
            // receives the largest position and remains first in the sidebar.
            position: now + (sortedNodes.length - index) / 1_000,
          }));

    // Prepare every page before the first write. This keeps validation failures
    // ahead of page, body, activity, and source-marker changes.
    const preparedPages = pageInputs.map((input) => ({
      ...input,
      page: prepareWorkspacePage(target, {
        title: input.title,
        content: input.content,
        position: input.position,
        now,
      }),
    }));

    const pageIds: Id<"pages">[] = [];
    const convertedPageByNode = new Map<Id<"thoughtNodes">, Id<"pages">>();
    for (const prepared of preparedPages) {
      const pageId = await insertWorkspacePage(ctx, {
        target,
        page: prepared.page,
        actorProfileId: profile._id,
        now,
      });
      pageIds.push(pageId);
      for (const node of prepared.nodes) {
        convertedPageByNode.set(node._id, pageId);
      }
    }
    for (const node of nodes) {
      const pageId = convertedPageByNode.get(node._id);
      if (pageId === undefined) {
        throw new Error("Konverzija nije povezala svaku misao sa stranicom.");
      }
      await ctx.db.patch("thoughtNodes", node._id, {
        conversionCount: node.conversionCount + 1,
        lastConvertedPageId: pageId,
        lastConvertedAt: now,
        updatedAt: now,
      });
    }
    return { pageIds };
  },
});

// --- Beleške u „Ja" (PROSTOR P7, K01 §9.2) ----------------------------------
//
// Beleška je misao: iz nekog mog aktivnog startupa ili lična (`startupId:
// null`). Vidi je i menja SAMO vlasnik (R21) — svaki upit `.eq`-uje
// `ownerProfileId`, i admin vidi samo svoje. Beleška iz startupa koji sam
// napustio (ili koji je arhiviran) se ne vraća. Izmena, arhiva i vraćanje idu
// kroz postojeće `updateNode`/`archiveNodes`/`restoreNodes` (rade i za lične),
// a „Pošalji u startup" kroz `convertToIdeas`.

const MAX_NOTE_SEARCH_SCAN = 100;
const NOTE_TEXT_SNIPPET = 280;
/** Nova podbeleška na Mapi: ispod roditelja (koordinate su relativne). */
const NOTE_CHILD_OFFSET = { x: 0, y: MIN_THOUGHT_HEIGHT + 24 };

const noteItemValidator = v.object({
  _id: v.id("thoughtNodes"),
  workspaceId: v.union(v.id("workspaces"), v.null()),
  workspace: v.union(workspaceMiniValidator, v.null()),
  title: v.union(v.string(), v.null()),
  text: v.string(),
  color: thoughtColorValidator,
  parentThoughtId: v.union(v.id("thoughtNodes"), v.null()),
  isParent: v.boolean(),
  conversionCount: v.number(),
  lastConvertedIdeaId: v.union(v.id("ideaNodes"), v.null()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

/** Filter opsega: odsutno = sve moje beleške, `null` = lične, Id = jedan startup. */
const noteScopeArgValidator = v.optional(v.union(v.id("workspaces"), v.null()));

/**
 * Opseg beleški za čitanje. `scope` su startupi čije beleške smem da vidim —
 * aktivno članstvo, startup nije arhiviran (`listMyActiveStartups`).
 */
async function noteReadScope(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces"> | null | undefined,
) {
  if (workspaceId === undefined) {
    const profile = await requireProfile(ctx);
    return { profile, scope: await listMyActiveWorkspaces(ctx, profile._id) };
  }
  if (workspaceId === null) {
    return {
      profile: await requireProfile(ctx),
      scope: new Map<Id<"workspaces">, WorkspaceMini>(),
    };
  }
  const member = await requireClanProjekta(ctx, workspaceId);
  return {
    profile: member.profile,
    scope: new Map([[workspaceId, await workspaceMiniOf(ctx, member.workspace)]]),
  };
}

function noteVisibleIn(
  workspaceId: Id<"workspaces"> | null,
  scope: Map<Id<"workspaces">, WorkspaceMini>,
) {
  return workspaceId === null || scope.has(workspaceId);
}

function noteItem(
  node: Doc<"thoughtNodes">,
  scope: Map<Id<"workspaces">, WorkspaceMini>,
) {
  return {
    _id: node._id,
    workspaceId: node.workspaceId,
    workspace:
      node.workspaceId === null ? null : (scope.get(node.workspaceId) ?? null),
    title: node.title,
    text: node.text,
    color: node.color,
    parentThoughtId: node.parentThoughtId ?? null,
    isParent: node.isParent ?? false,
    conversionCount: node.conversionCount,
    lastConvertedIdeaId: node.lastConvertedIdeaId ?? null,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
  };
}

/**
 * Moje beleške, najskorije menjane prvo. Bez `startupId` — lične i iz svih
 * mojih aktivnih startupa (beleške iz startupa van opsega se izbacuju POSLE
 * čitanja, pa strana može biti kraća od `numItems`; klijent učitava dalje dok
 * `isDone` nije true). `null` — samo lične. Id — samo taj startup (član).
 */
export const listMine = prijavljenQuery({
  args: {
    workspaceId: noteScopeArgValidator,
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(noteItemValidator),
  handler: async (ctx, args) => {
    validatePageSize(args.paginationOpts.numItems, MAX_NODE_PAGE_SIZE);
    const { profile, scope } = await noteReadScope(ctx, args.workspaceId);
    const scoped = args.workspaceId;
    const result =
      scoped === undefined
        ? await ctx.db
            .query("thoughtNodes")
            .withIndex("by_ownerProfileId_and_archivedAt_and_updatedAt", (q) =>
              q.eq("ownerProfileId", profile._id).eq("archivedAt", null),
            )
            .order("desc")
            .paginate(args.paginationOpts)
        : await ctx.db
            .query("thoughtNodes")
            .withIndex(
              "by_ownerProfileId_and_workspaceId_and_archivedAt_and_updatedAt",
              (q) =>
                q
                  .eq("ownerProfileId", profile._id)
                  .eq("workspaceId", scoped)
                  .eq("archivedAt", null),
            )
            .order("desc")
            .paginate(args.paginationOpts);
    return {
      ...result,
      page: result.page
        .filter((node) => noteVisibleIn(node.workspaceId, scope))
        .map((node) => noteItem(node, scope)),
    };
  },
});

/**
 * Jedna moja beleška po id-ju (detalj na telefonu; lične beleške nemaju Mapu,
 * pa ih `getConnectedGroup` ne vidi). Tuđa, arhivirana, nepostojeća i beleška
 * iz startupa van opsega daju isti odgovor — `null` (ne odaje da postoji).
 */
export const getNote = prijavljenQuery({
  args: { nodeId: v.id("thoughtNodes") },
  returns: v.union(noteItemValidator, v.null()),
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const node = await ctx.db.get("thoughtNodes", args.nodeId);
    if (
      node === null ||
      node.ownerProfileId !== profile._id ||
      node.archivedAt !== null
    ) {
      return null;
    }
    const scope = await listMyActiveWorkspaces(ctx, profile._id);
    if (!noteVisibleIn(node.workspaceId, scope)) return null;
    return noteItem(node, scope);
  },
});

/**
 * Nova beleška. Lična (`startupId: null`): bez Mape, pozicija (0, 0). U
 * startupu: član, Mapa se pravi po potrebi i beleška dobija slobodno mesto
 * (podbeleška ide ispod roditelja). Prazan naslov = prvi red teksta.
 */
export const createNote = prijavljenMutation({
  args: {
    workspaceId: v.union(v.id("workspaces"), v.null()),
    title: v.optional(v.string()),
    text: v.string(),
    parentThoughtId: v.optional(v.id("thoughtNodes")),
  },
  returns: v.id("thoughtNodes"),
  handler: async (ctx, args) => {
    const profile = await requireNoteScope(ctx, args.workspaceId);
    const text = cleanThoughtText(args.text);
    const title =
      args.title === undefined || args.title.trim().length === 0
        ? titleFromText(text)
        : cleanRequiredText(args.title, "Naslov misli", MAX_THOUGHT_TITLE);

    if (args.parentThoughtId !== undefined) {
      const parent = await ctx.db.get("thoughtNodes", args.parentThoughtId);
      if (
        parent === null ||
        parent.ownerProfileId !== profile._id ||
        parent.workspaceId !== args.workspaceId ||
        parent.archivedAt !== null
      ) {
        throw new Error("Misao nije pronađena.");
      }
    }

    let position = { x: 0, y: 0 };
    if (args.workspaceId !== null) {
      const workspaceId = args.workspaceId;
      await ensureCanvas(ctx, workspaceId, profile._id);
      if (args.parentThoughtId !== undefined) {
        position = NOTE_CHILD_OFFSET;
      } else {
        const existing = await ctx.db
          .query("thoughtNodes")
          .withIndex(
            "by_ownerProfileId_and_workspaceId_and_archivedAt_and_updatedAt",
            (q) =>
              q
                .eq("ownerProfileId", profile._id)
                .eq("workspaceId", workspaceId)
                .eq("archivedAt", null),
          )
          .order("desc")
          .take(MAX_CONNECTED_NODES);
        position = findAvailableCanvasPosition(
          existing
            .filter((node) => node.parentThoughtId === undefined)
            .map((node) => ({
              x: node.x,
              y: node.y,
              width: node.width ?? MIN_THOUGHT_WIDTH,
              height: node.height ?? MIN_THOUGHT_HEIGHT,
            })),
          { width: MIN_THOUGHT_WIDTH, height: MIN_THOUGHT_HEIGHT },
        );
      }
    }

    const now = Date.now();
    return await ctx.db.insert("thoughtNodes", {
      workspaceId: args.workspaceId,
      ownerProfileId: profile._id,
      title,
      text,
      searchText: nodeSearchText(title, text),
      x: position.x,
      y: position.y,
      ...(args.parentThoughtId === undefined
        ? {}
        : { parentThoughtId: args.parentThoughtId }),
      color: "neutral",
      isParent: false,
      conversionCount: 0,
      lastConvertedPageId: null,
      lastConvertedAt: null,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Pretraga mojih beleški (`search_thoughts`, uvek `.eq("ownerProfileId")`).
 * Opseg kao `listMine`. Pretraga startupa (`search.ideasAndThoughts`) i dalje
 * `.eq`-uje `startupId`, pa lične beleške tamo nikad ne izlaze.
 */
export const searchMine = prijavljenQuery({
  args: {
    query: v.string(),
    workspaceId: noteScopeArgValidator,
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id("thoughtNodes"),
      title: v.union(v.string(), v.null()),
      text: v.string(),
      workspaceId: v.union(v.id("workspaces"), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    const { profile, scope } = await noteReadScope(ctx, args.workspaceId);
    const searchTerm = args.query.trim().slice(0, 200);
    if (searchTerm.length < 2) return [];
    const limit = boundedLimit(args.limit, 20, 50);
    const scoped = args.workspaceId;
    const matches =
      scoped === undefined
        ? await ctx.db
            .query("thoughtNodes")
            .withSearchIndex("search_thoughts", (q) =>
              q
                .search("searchText", searchTerm)
                .eq("ownerProfileId", profile._id) // ← privatnost beleški
                .eq("archivedAt", null),
            )
            .take(MAX_NOTE_SEARCH_SCAN)
        : await ctx.db
            .query("thoughtNodes")
            .withSearchIndex("search_thoughts", (q) =>
              q
                .search("searchText", searchTerm)
                .eq("ownerProfileId", profile._id) // ← privatnost beleški
                .eq("workspaceId", scoped)
                .eq("archivedAt", null),
            )
            .take(limit);
    return matches
      .filter((node) => noteVisibleIn(node.workspaceId, scope))
      .slice(0, limit)
      .map((node) => ({
        _id: node._id,
        title: node.title,
        text: node.text.slice(0, NOTE_TEXT_SNIPPET),
        workspaceId: node.workspaceId,
      }));
  },
});
