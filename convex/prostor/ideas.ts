// Preneto iz Devotion packages/backend/convex/ideas.ts (main @ c05c40f), SPAJANJE S05.
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";

import { findAvailableCanvasPosition } from "./canvasPlacement";
import { recordActivity } from "./lib/activity";
import { requireClanProjekta } from "./lib/auth";
import { insertContribution } from "./lib/collaboration";
import { countVisibleComments } from "./lib/comments";
import { ideaBaseline, recordRevision } from "./lib/history";
import {
  IDEA_CONVERT_MESSAGE,
  IDEA_CONVERT_STAGE_MESSAGE,
  IDEA_CONVERTED_MESSAGE,
  IDEA_STAGE_CHANGE_MESSAGE,
  IDEA_STAGE_LABELS,
  ideaDisplayStage,
  ideaStoredStage,
} from "./lib/idea_stages";
import { createNotification, notificationCopy } from "./lib/notifications";
import {
  canConvertIdea,
  canEditIdea,
  canLayoutOnMap,
  canSetIdeaStage,
  canVoteIdea,
  ideaPermissions,
  isManager,
  permissionError,
} from "./lib/permissions";
import {
  prepareWorkspacePage,
  validateWorkspacePageTarget,
  workspaceCanvasPreview,
} from "./lib/page_creation";
import { nodeSearchText, pageSearchText } from "./lib/pages";
import { reconcileTaskAssignees } from "./lib/task_assignees";
import { ideaTitleOf, restoreIdea, trashIdea } from "./lib/trash";
import {
  cleanRequiredText,
  ideaStageValidator,
  pageKindValidator,
  taskPriorityValidator,
  taskStatusValidator,
} from "./lib/validators";
import { projekatMutation, projekatQuery } from "../lib/projekat";

const ideaColorValidator = v.union(
  v.literal("neutral"),
  v.literal("violet"),
  v.literal("blue"),
  v.literal("green"),
  v.literal("amber"),
  v.literal("rose"),
);

const MAX_IDEA_TITLE = 200;
const MAX_IDEA_TEXT = 12_000;
const MAX_EDGE_LABEL = 120;
const MIN_IDEA_WIDTH = 264;
const MAX_IDEA_WIDTH = 720;
const MIN_IDEA_HEIGHT = 196;
const MAX_IDEA_HEIGHT = 1_000;
const MAX_AREA_CANVAS_PAGES = 200;

function cleanOptionalText(
  value: string | null,
  label: string,
  maxLength: number,
) {
  const cleaned = value?.trim() ?? "";
  if (cleaned.length > maxLength) {
    throw new Error(`${label} može imati najviše ${maxLength} znakova.`);
  }
  return cleaned.length > 0 ? cleaned : null;
}

function finiteWithin(
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

export const list = projekatQuery({
  uloga: "urednik",
  args: {},
  handler: async (ctx, args) => {
    const actor = await requireClanProjekta(ctx, args.workspaceId);
    const { profile } = actor;

    // Fetch active idea nodes
    const nodes = await ctx.db
      .query("ideaNodes")
      .withIndex("by_workspaceId_and_archivedAt_and_updatedAt", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("archivedAt", null)
      )
      .take(500);

    // Fetch active edges
    const edges = await ctx.db
      .query("ideaEdges")
      .withIndex("by_workspaceId_and_archivedAt", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("archivedAt", null)
      )
      .take(1_000);

    // Fetch all votes for startup
    const votes = await ctx.db
      .query("ideaVotes")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
      .take(5_000);

    // Map profiles for author info
    const profileIds = new Set<Id<"profiles">>();
    nodes.forEach((n) => profileIds.add(n.authorProfileId));
    votes.forEach((v) => profileIds.add(v.profileId));

    const profilesMap = new Map();
    for (const pid of Array.from(profileIds)) {
      const p = await ctx.db.get(pid);
      if (p) {
        let avatarUrl = null;
        if (p.avatarStorageId) {
          avatarUrl = await ctx.storage.getUrl(p.avatarStorageId);
        }
        profilesMap.set(pid.toString(), {
          _id: p._id,
          displayName: p.displayName,
          email: p.email,
          avatarUrl,
        });
      }
    }

    // PROSTOR P6 (K01 §8.3): faza, glasovi tima, broj komentara i dozvole.
    // Stari zahtevi za brisanje i ugnežđavanje se više ne čitaju (P4); njihova
    // polja ostaju u odgovoru (prazna) zbog starih klijenata (P25).
    const processedNodes = await Promise.all(nodes.map(async (node) => {
      const nodeVotes = votes.filter((v) => v.ideaId === node._id);
      const upvotes = nodeVotes.filter((v) => v.voteType === "up").length;
      const downvotes = nodeVotes.filter((v) => v.voteType === "down").length;
      const userVote = nodeVotes.find((v) => v.profileId === profile._id)?.voteType ?? null;
      const stage = ideaDisplayStage(node);
      const comments = await countVisibleComments(ctx, {
        workspaceId: args.workspaceId,
        kind: "idea",
        targetId: node._id,
      });
      const permissions = ideaPermissions(actor, node);

      return {
        ...node,
        stage,
        storedStage: ideaStoredStage(node),
        stageChangedAt: node.stageChangedAt ?? null,
        author: profilesMap.get(node.authorProfileId.toString()) ?? null,
        upvotes,
        downvotes,
        userVote,
        myVote: userVote,
        // Staro „Pretvori" (P25) prati novo pravilo: faza „Odobreno".
        isApproved: stage === "odobreno",
        netVotes: upvotes - downvotes,
        commentCount: comments.count,
        commentCountCapped: comments.capped,
        contributionCount: comments.count,
        permissions,
        pendingDeletionRequest: null as Doc<"deletionRequests"> | null,
        canEdit: permissions.canEdit,
        canMove: permissions.canEdit,
        canResize: permissions.canEdit,
        canDeleteDirectly: permissions.canArchive,
        canRequestDeletion: false,
        canDetach: node.parentIdeaId !== undefined && permissions.canEdit,
        nestingRequestId: null as Id<"nestingRequests"> | null,
        nestingModerationStatus: null as "pending" | "rejected" | null,
        canModerateNesting: false,
      };
    }));

    // Fetch canvas viewport state for user
    const canvasState = await ctx.db
      .query("ideaCanvases")
      .withIndex("by_ownerProfileId_and_workspaceId", (q) =>
        q.eq("ownerProfileId", profile._id).eq("workspaceId", args.workspaceId)
      )
      .unique();

    return {
      nodes: processedNodes,
      // Veze menja i uklanja svaki član (PROSTOR D20).
      edges: edges.map((edge) => ({
        ...edge,
        canEdit: true,
        canDeleteDirectly: true,
        canRequestDeletion: false,
      })),
      canvasState: canvasState ?? { x: 0, y: 0, zoom: 1 },
      currentProfileId: profile._id,
      viewer: {
        profileId: profile._id,
        isManager: isManager(actor),
      },
    };
  },
});

export const create = projekatMutation({
  uloga: "urednik",
  args: {
    title: v.string(),
    text: v.string(),
    x: v.optional(v.number()),
    y: v.optional(v.number()),
    color: v.optional(ideaColorValidator),
    isParent: v.optional(v.boolean()),
    parentIdeaId: v.optional(v.id("ideaNodes")),
  },
  handler: async (ctx, args) => {
    const { profile } = await requireClanProjekta(ctx, args.workspaceId);
    const cleanedText = cleanRequiredText(args.text, "Tekst ideje", 12000);
    const cleanedTitle = cleanRequiredText(
      args.title,
      "Naslov ideje",
      MAX_IDEA_TITLE,
    );
    const now = Date.now();

    const ideaId = await ctx.db.insert("ideaNodes", {
      workspaceId: args.workspaceId,
      authorProfileId: profile._id,
      title: cleanedTitle,
      text: cleanedText,
      searchText: nodeSearchText(cleanedTitle, cleanedText),
      x: args.x ?? Math.round((Math.random() - 0.5) * 300),
      y: args.y ?? Math.round((Math.random() - 0.5) * 300),
      color: args.color ?? "violet",
      isParent: args.isParent ?? false,
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
      content: cleanedText,
      sourceKind: "idea_original",
      sourceId: ideaId,
      moderationStatus: "approved",
      createdAt: now,
    });

    // Auto upvote by creator
    await ctx.db.insert("ideaVotes", {
      workspaceId: args.workspaceId,
      ideaId,
      profileId: profile._id,
      voteType: "up",
      createdAt: now,
    });

    // If parentIdeaId provided, create connecting edge
    if (args.parentIdeaId) {
      const parentIdea = await ctx.db.get(args.parentIdeaId);
      if (parentIdea && parentIdea.workspaceId === args.workspaceId) {
        const pairKey = [args.parentIdeaId, ideaId].sort().join(":");
        await ctx.db.insert("ideaEdges", {
          workspaceId: args.workspaceId,
          authorProfileId: profile._id,
          nodeAId: args.parentIdeaId,
          nodeBId: ideaId,
          pairKey,
          label: null,
          archivedAt: null,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    return ideaId;
  },
});

export const vote = projekatMutation({
  uloga: "urednik",
  args: {
    ideaId: v.id("ideaNodes"),
    voteType: v.union(v.literal("up"), v.literal("down")),
  },
  returns: v.object({
    action: v.union(
      v.literal("created"),
      v.literal("updated"),
      v.literal("removed"),
    ),
  }),
  handler: async (ctx, args) => {
    const actor = await requireClanProjekta(ctx, args.workspaceId);
    const { profile } = actor;
    const idea = await ctx.db.get(args.ideaId);
    if (!idea || idea.workspaceId !== args.workspaceId || idea.archivedAt !== null) {
      throw new Error("Ideja nije pronađena.");
    }
    // PROSTOR P6/D17: glasa svaki član (signal), dok ideja nije pretvorena.
    if (!canVoteIdea(actor, idea)) {
      throw permissionError("NEMA_DOZVOLU", IDEA_CONVERTED_MESSAGE);
    }

    const existingVote = await ctx.db
      .query("ideaVotes")
      .withIndex("by_ideaId_and_profileId", (q) =>
        q.eq("ideaId", args.ideaId).eq("profileId", profile._id)
      )
      .unique();

    // Skidanje glasa nikoga ne obaveštava — samo dat ili promenjen glas.
    async function notifyAuthor() {
      const ideaLabel = idea!.title ?? idea!.text.slice(0, 60);
      const copy = notificationCopy.ideaVoted(
        ideaLabel,
        profile.displayName,
        args.voteType,
      );
      await createNotification(ctx, {
        recipientProfileId: idea!.authorProfileId,
        workspaceId: args.workspaceId,
        type: "idea_voted",
        title: copy.title,
        targetType: "ideas",
        targetId: args.ideaId,
        actorProfileId: profile._id,
      });
    }

    if (existingVote) {
      if (existingVote.voteType === args.voteType) {
        await ctx.db.delete(existingVote._id);
        return { action: "removed" as const };
      } else {
        await ctx.db.patch(existingVote._id, { voteType: args.voteType });
        await notifyAuthor();
        return { action: "updated" as const };
      }
    } else {
      await ctx.db.insert("ideaVotes", {
        workspaceId: args.workspaceId,
        ideaId: args.ideaId,
        profileId: profile._id,
        voteType: args.voteType,
        createdAt: Date.now(),
      });
      await notifyAuthor();
      return { action: "created" as const };
    }
  },
});

/**
 * Faza ideje (PROSTOR P6, R17): menjaju je autor ideje, vlasnik startupa i
 * admin, dok ideja nije postala zadatak. Ista faza → bez upisa. Beleži
 * aktivnost `idea_stage_changed`; obaveštenja nema.
 */
export const setStage = projekatMutation({
  uloga: "urednik",
  args: {
    ideaId: v.id("ideaNodes"),
    stage: ideaStageValidator,
  },
  returns: v.object({
    stage: ideaStageValidator,
    previousStage: ideaStageValidator,
  }),
  handler: async (ctx, args) => {
    const actor = await requireClanProjekta(ctx, args.workspaceId);
    const idea = await ctx.db.get("ideaNodes", args.ideaId);
    if (
      idea === null ||
      idea.workspaceId !== args.workspaceId ||
      idea.archivedAt !== null
    ) {
      throw new Error("Ideja nije pronađena.");
    }
    if (idea.convertedPageId !== null) {
      throw permissionError("NEMA_DOZVOLU", IDEA_CONVERTED_MESSAGE);
    }
    if (!canSetIdeaStage(actor, idea)) {
      throw permissionError("NEMA_DOZVOLU", IDEA_STAGE_CHANGE_MESSAGE);
    }
    const previousStage = ideaStoredStage(idea);
    if (previousStage === args.stage) {
      return { stage: args.stage, previousStage };
    }
    const now = Date.now();
    await ctx.db.patch("ideaNodes", idea._id, {
      stage: args.stage,
      stageChangedAt: now,
      stageChangedByProfileId: actor.profile._id,
      updatedAt: now,
    });
    await recordActivity(ctx, {
      workspaceId: idea.workspaceId,
      actorProfileId: actor.profile._id,
      action: "idea_stage_changed",
      targetType: "idea",
      targetId: idea._id,
      title: ideaTitleOf(idea),
      detail: IDEA_STAGE_LABELS[args.stage],
    });
    return { stage: args.stage, previousStage };
  },
});

export const updatePositions = projekatMutation({
  uloga: "urednik",
  args: {
    updates: v.array(
      v.object({
        id: v.id("ideaNodes"),
        x: v.number(),
        y: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    await requireClanProjekta(ctx, args.workspaceId);
    const now = Date.now();
    // PROSTOR P4: raspored menja svaki član i uvek se upisuje na čvor — stari
    // predlozi ugnežđavanja se više ne pomeraju.
    for (const update of args.updates) {
      const x = finiteWithin(update.x, "X pozicija", -100_000, 100_000);
      const y = finiteWithin(update.y, "Y pozicija", -100_000, 100_000);
      const idea = await ctx.db.get(update.id);
      if (
        idea &&
        idea.workspaceId === args.workspaceId &&
        idea.archivedAt === null
      ) {
        await ctx.db.patch(update.id, { x, y, updatedAt: now });
      }
    }
  },
});

export const update = projekatMutation({
  uloga: "urednik",
  args: {
    ideaId: v.id("ideaNodes"),
    title: v.string(),
    text: v.string(),
    color: ideaColorValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireClanProjekta(ctx, args.workspaceId);
    const { profile } = actor;
    const idea = await ctx.db.get(args.ideaId);
    if (
      idea === null ||
      idea.workspaceId !== args.workspaceId ||
      idea.archivedAt !== null
    ) {
      throw new Error("Ideja nije pronađena.");
    }
    // PROSTOR P6/O1: tekst ideje menja svaki član; izmena ide u Istoriju.
    if (!canEditIdea(actor, idea)) {
      throw permissionError("NEMA_DOZVOLU", "Ideja nije pronađena.");
    }

    const title = cleanRequiredText(
      args.title,
      "Naslov ideje",
      MAX_IDEA_TITLE,
    );
    const text = cleanRequiredText(args.text, "Tekst ideje", MAX_IDEA_TEXT);
    const now = Date.now();
    await ctx.db.patch(args.ideaId, {
      title,
      text,
      searchText: nodeSearchText(title, text),
      color: args.color,
      updatedAt: now,
    });
    await recordRevision(ctx, {
      workspaceId: idea.workspaceId,
      target: { kind: "idea", id: idea._id },
      before: { title: idea.title, content: idea.text },
      after: { title, content: text },
      baseline: ideaBaseline(idea),
      actorProfileId: profile._id,
      now,
      targetRevision: null,
    });
    const original = await ctx.db
      .query("contentContributions")
      .withIndex("by_sourceKind_and_sourceId", (q) =>
        q.eq("sourceKind", "idea_original").eq("sourceId", args.ideaId),
      )
      .unique();
    if (original !== null && original.authorProfileId === profile._id) {
      await ctx.db.patch("contentContributions", original._id, {
        content: text,
        updatedAt: Date.now(),
      });
    }
    return null;
  },
});

export const updateLayout = projekatMutation({
  uloga: "urednik",
  args: {
    ideaId: v.id("ideaNodes"),
    x: v.number(),
    y: v.number(),
    width: v.number(),
    height: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireClanProjekta(ctx, args.workspaceId);
    const idea = await ctx.db.get(args.ideaId);
    if (
      idea === null ||
      idea.workspaceId !== args.workspaceId ||
      idea.archivedAt !== null
    ) {
      throw new Error("Ideja nije pronađena.");
    }
    // Raspored na Mapi menja svaki član (PROSTOR P1, D20).
    if (!canLayoutOnMap(actor)) {
      throw new Error("Nemaš pristup ovom projektu.");
    }

    await ctx.db.patch(args.ideaId, {
      x: finiteWithin(args.x, "Horizontalna pozicija", -10_000_000, 10_000_000),
      y: finiteWithin(args.y, "Vertikalna pozicija", -10_000_000, 10_000_000),
      width: finiteWithin(
        args.width,
        "Širina oblačića",
        MIN_IDEA_WIDTH,
        MAX_IDEA_WIDTH,
      ),
      height: finiteWithin(
        args.height,
        "Visina oblačića",
        MIN_IDEA_HEIGHT,
        MAX_IDEA_HEIGHT,
      ),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const resetLayoutSize = projekatMutation({
  uloga: "urednik",
  args: {
    ideaId: v.id("ideaNodes"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireClanProjekta(ctx, args.workspaceId);
    const idea = await ctx.db.get(args.ideaId);
    if (
      idea === null ||
      idea.workspaceId !== args.workspaceId ||
      idea.archivedAt !== null
    ) {
      throw new Error("Ideja nije pronađena.");
    }
    // Raspored na Mapi menja svaki član (PROSTOR P1, D20).
    if (!canLayoutOnMap(actor)) {
      throw new Error("Nemaš pristup ovom projektu.");
    }

    await ctx.db.patch(args.ideaId, {
      width: undefined,
      height: undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const saveViewport = projekatMutation({
  uloga: "urednik",
  args: {
    x: v.number(),
    y: v.number(),
    zoom: v.number(),
  },
  handler: async (ctx, args) => {
    const { profile } = await requireClanProjekta(ctx, args.workspaceId);
    const now = Date.now();

    const existing = await ctx.db
      .query("ideaCanvases")
      .withIndex("by_ownerProfileId_and_workspaceId", (q) =>
        q.eq("ownerProfileId", profile._id).eq("workspaceId", args.workspaceId)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        x: args.x,
        y: args.y,
        zoom: args.zoom,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("ideaCanvases", {
        workspaceId: args.workspaceId,
        ownerProfileId: profile._id,
        x: args.x,
        y: args.y,
        zoom: args.zoom,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

export const connect = projekatMutation({
  uloga: "urednik",
  args: {
    nodeAId: v.id("ideaNodes"),
    nodeBId: v.id("ideaNodes"),
    label: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { profile } = await requireClanProjekta(ctx, args.workspaceId);
    if (args.nodeAId === args.nodeBId) throw new Error("Ne možete povezati ideju sa samom sobom.");

    const [nodeA, nodeB] = await Promise.all([
      ctx.db.get("ideaNodes", args.nodeAId),
      ctx.db.get("ideaNodes", args.nodeBId),
    ]);
    if (
      nodeA === null ||
      nodeB === null ||
      nodeA.workspaceId !== args.workspaceId ||
      nodeB.workspaceId !== args.workspaceId ||
      nodeA.archivedAt !== null ||
      nodeB.archivedAt !== null
    ) {
      throw new Error("Ideje nisu pronađene u ovom projektu.");
    }
    // Veze između ideja pravi svaki član (PROSTOR D20).
    const pairKey = [args.nodeAId, args.nodeBId].sort().join(":");
    const existing = await ctx.db
      .query("ideaEdges")
      .withIndex("by_workspaceId_and_pairKey", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("pairKey", pairKey)
      )
      .first();

    const now = Date.now();
    if (existing) {
      if (existing.archivedAt !== null) {
        await ctx.db.patch(existing._id, {
          archivedAt: null,
          authorProfileId: profile._id,
          label: args.label ? args.label.trim() : existing.label,
          updatedAt: now,
        });
        return existing._id;
      }
      return existing._id;
    }

    return await ctx.db.insert("ideaEdges", {
      workspaceId: args.workspaceId,
      authorProfileId: profile._id,
      nodeAId: args.nodeAId,
      nodeBId: args.nodeBId,
      pairKey,
      label: args.label ? args.label.trim() : null,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const disconnect = projekatMutation({
  uloga: "urednik",
  args: {
    edgeId: v.id("ideaEdges"),
  },
  handler: async (ctx, args) => {
    await requireClanProjekta(ctx, args.workspaceId);
    const edge = await ctx.db.get(args.edgeId);
    // Vezu uklanja svaki član (PROSTOR D20).
    if (edge && edge.workspaceId === args.workspaceId) {
      await ctx.db.patch(args.edgeId, {
        archivedAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  },
});

export const updateEdgeLabel = projekatMutation({
  uloga: "urednik",
  args: {
    edgeId: v.id("ideaEdges"),
    label: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireClanProjekta(ctx, args.workspaceId);
    const edge = await ctx.db.get(args.edgeId);
    if (
      edge === null ||
      edge.workspaceId !== args.workspaceId ||
      edge.archivedAt !== null
    ) {
      throw new Error("Veza nije pronađena.");
    }
    // Naziv veze menja svaki član (PROSTOR D20).
    await ctx.db.patch(args.edgeId, {
      label: cleanOptionalText(args.label, "Naziv veze", MAX_EDGE_LABEL),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const convertToPage = projekatMutation({
  uloga: "urednik",
  args: {
    ideaId: v.id("ideaNodes"),
    areaId: v.id("areas"),
    kind: pageKindValidator,
    title: v.optional(v.string()),
    status: v.optional(taskStatusValidator),
    priority: v.optional(taskPriorityValidator),
    assigneeProfileId: v.optional(v.union(v.id("profiles"), v.null())),
  },
  returns: v.id("pages"),
  handler: async (ctx, args) => {
    const actor = await requireClanProjekta(ctx, args.workspaceId);
    const { profile } = actor;
    const idea = await ctx.db.get(args.ideaId);
    if (!idea || idea.workspaceId !== args.workspaceId || idea.archivedAt !== null) {
      throw new Error("Ideja nije pronađena.");
    }
    // PROSTOR P6 (R17): pretvara autor, vlasnik startupa ili admin, i samo u
    // fazi „Odobreno". Stari uslov „više za nego protiv" je ukinut — glasovi
    // su samo signal.
    if (idea.convertedPageId !== null) {
      throw permissionError("NEMA_DOZVOLU", IDEA_CONVERTED_MESSAGE);
    }
    if (!canSetIdeaStage(actor, idea)) {
      throw permissionError("NEMA_DOZVOLU", IDEA_CONVERT_MESSAGE);
    }
    if (!canConvertIdea(actor, idea)) {
      throw permissionError("NEMA_DOZVOLU", IDEA_CONVERT_STAGE_MESSAGE);
    }

    const now = Date.now();
    const pageContent = `<p>${idea.text.replace(/\n/g, "<br/>")}</p>`;
    const target = await validateWorkspacePageTarget(ctx, {
      workspaceId: args.workspaceId,
      areaId: args.areaId,
      parentPageId: null,
      kind: args.kind,
      taskStatus: args.status,
      taskPriority: args.priority,
      assigneeProfileId: args.assigneeProfileId,
    });
    const page = prepareWorkspacePage(target, {
      title: args.title?.trim() || idea.title || idea.text.slice(0, 60),
      content: pageContent,
      now,
    });
    const [activeRootPages, occupiedPlacements] = await Promise.all([
      ctx.db
        .query("pages")
        .withIndex(
          "by_workspace_area_parent_active_position",
          (q) =>
            q
              .eq("workspaceId", args.workspaceId)
              .eq("areaId", args.areaId)
              .eq("parentPageId", null)
              .eq("archivedAt", null),
        )
        .take(MAX_AREA_CANVAS_PAGES + 1),
      ctx.db
        .query("pageCanvasPlacements")
        .withIndex(
          "by_workspaceId_and_areaId_and_rootPageId",
          (q) =>
            q
              .eq("workspaceId", args.workspaceId)
              .eq("areaId", args.areaId)
              .eq("rootPageId", null),
        )
        .take(MAX_AREA_CANVAS_PAGES + 1),
    ]);
    if (
      activeRootPages.length >= MAX_AREA_CANVAS_PAGES ||
      occupiedPlacements.length > MAX_AREA_CANVAS_PAGES
    ) {
      throw new Error(
        `Jedan kanvas može imati najviše ${MAX_AREA_CANVAS_PAGES} direktnih kartica.`,
      );
    }
    const canvasPosition = findAvailableCanvasPosition(
      occupiedPlacements.map((placement) => ({
        x: placement.x,
        y: placement.y,
        width: placement.width,
        height: placement.height,
      })),
    );

    const pageId = await ctx.db.insert("pages", {
      workspaceId: target.workspaceId,
      areaId: target.areaId,
      parentPageId: target.parentPageId,
      kind: target.kind,
      title: page.title,
      searchText: pageSearchText(page.title, page.content),
      revision: 0,
      treeRevision: 0,
      canvasPreview: workspaceCanvasPreview(
        page.title,
        page.content,
        target.instructions,
      ),
      position: page.position,
      taskStatus: target.taskStatus,
      taskPriority: target.taskPriority,
      assigneeProfileId: target.assigneeProfileId,
      dueDate: target.dueDate,
      ...(target.instructions === null
        ? {}
        : { instructions: target.instructions }),
      ...(target.checkpoints === null
        ? {}
        : { checkpoints: target.checkpoints }),
      taskSortAt: page.taskSortAt,
      completedAt:
        target.kind === "task" && target.taskStatus === "done" ? now : null,
      createdByProfileId: profile._id,
      updatedByProfileId: profile._id,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    // Ovaj insert zaobilazi `insertWorkspacePage`, pa spisak izvršilaca mora da
    // se upiše ovde — inače bi konvertovan zadatak imao projekciju bez kanona.
    if (target.kind === "task" && target.assigneeProfileIds.length > 0) {
      const insertedPage = await ctx.db.get("pages", pageId);
      if (insertedPage === null) {
        throw new Error("Kreirani zadatak nije moguće učitati.");
      }
      await reconcileTaskAssignees(ctx, {
        page: insertedPage,
        profileIds: target.assigneeProfileIds,
        actorProfileId: profile._id,
        now,
        membershipChecked: true,
      });
    }

    await ctx.db.insert("pageBodies", {
      pageId,
      content: page.content,
      updatedAt: now,
    });

    await ctx.db.insert("pageCanvasPlacements", {
      workspaceId: args.workspaceId,
      areaId: args.areaId,
      rootPageId: null,
      pageId,
      x: canvasPosition.x,
      y: canvasPosition.y,
      updatedByProfileId: profile._id,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("pageCanvasNodes", {
      workspaceId: args.workspaceId,
      areaId: args.areaId,
      pageId,
      x: canvasPosition.x,
      y: canvasPosition.y,
      updatedAt: now,
    });

    await ctx.db.insert("pageEntries", {
      pageId,
      authorProfileId: idea.authorProfileId,
      content: page.content,
      position: 1,
      createdAt: idea.createdAt,
      updatedAt: now,
    });

    await insertContribution(ctx, {
      workspaceId: args.workspaceId,
      targetKind: "page",
      targetId: pageId,
      authorProfileId: idea.authorProfileId,
      content: page.content,
      sourceKind: "page_entry",
      sourceId: `idea:${idea._id}`,
      createdAt: idea.createdAt,
    });

    await ctx.db.patch(args.ideaId, {
      convertedPageId: pageId,
      convertedAt: now,
      updatedAt: now,
    });

    // Autor ideje treba da zna gde mu je ideja završila; link vodi na rezultat.
    const ideaLabel = idea.title ?? idea.text.slice(0, 60);
    const convertedCopy = notificationCopy.ideaConverted(
      ideaLabel,
      args.kind,
      profile.displayName,
    );
    await createNotification(ctx, {
      recipientProfileId: idea.authorProfileId,
      workspaceId: args.workspaceId,
      type: "idea_converted",
      title: convertedCopy.title,
      body: convertedCopy.body,
      targetType: "page",
      targetId: pageId,
      actorProfileId: profile._id,
    });

    return pageId;
  },
});

/**
 * Brisanje ideje (PROSTOR P3, R16): svaki član šalje ideju u Korpu. Komentari,
 * glasovi i tekst ostaju (D3); veze se arhiviraju i vraćaju sa idejom. Povratni
 * oblik je isti kao ranije (`recoveredId` je uvek `null` — „Oporavljeno" se
 * više ne pravi), a `undoUntil` hrani stari „Poništi".
 */
export const archive = projekatMutation({
  uloga: "urednik",
  args: {
    ideaId: v.id("ideaNodes"),
  },
  handler: async (ctx, args) => {
    const actor = await requireClanProjekta(ctx, args.workspaceId);
    const idea = await ctx.db.get(args.ideaId);
    if (
      idea === null ||
      idea.workspaceId !== args.workspaceId ||
      idea.archivedAt !== null
    ) {
      throw new Error("Ideja nije pronađena.");
    }
    const now = Date.now();
    await trashIdea(ctx, { actor, idea, now });
    return {
      ideaId: idea._id,
      recoveredId: null as Id<"recoveredContent"> | null,
      undoUntil: now + 8_000,
    };
  },
});

export const restoreOwn = projekatMutation({
  uloga: "urednik",
  args: {
    ideaId: v.id("ideaNodes"),
  },
  handler: async (ctx, args) => {
    const actor = await requireClanProjekta(ctx, args.workspaceId);
    const idea = await ctx.db.get(args.ideaId);
    if (
      idea === null ||
      idea.workspaceId !== args.workspaceId ||
      idea.archivedAt === null
    ) {
      throw new Error("Ideja nije pronađena.");
    }
    // „Poništi" posle brisanja = vraćanje iz Korpe (svaki član, R16).
    await restoreIdea(ctx, { actor, idea, now: Date.now() });
    return idea._id;
  },
});
