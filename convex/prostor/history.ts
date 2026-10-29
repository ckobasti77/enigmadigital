// Preneto iz Devotion packages/backend/convex/history.ts (main @ c05c40f), SPAJANJE S03.
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { type MutationCtx, type QueryCtx } from "../_generated/server";
import { recordActivity } from "./lib/activity";
import { requireClanProjekta, vlasnikProjektaProfileId } from "./lib/auth";
import {
  HISTORY_PAGE_MAX,
  insertRestoreRevision,
  revisionExcerpt,
  revisionKindValidator,
  revisionTargetKey,
  revisionTargetKindValidator,
  revisionTargetValidator,
  type RevisionTarget,
} from "./lib/history";
import { writePageContent } from "./lib/page_content";
import { nodeSearchText, requireVisiblePage } from "./lib/pages";
import { unprunePageFiles } from "./lib/trash";
import {
  assertCanEditPage,
  canEditArea,
  canEditIdea,
  canEditPage,
  conflictError,
  permissionError,
  type Actor,
} from "./lib/permissions";
import {
  getProfileSummary,
  profileSummaryValidator,
} from "./lib/profile_summary";
import { projekatMutation, projekatQuery } from "../lib/projekat";

/**
 * Istorija izmena (PROSTOR P2): pregled revizija stranice, opisa oblasti i
 * ideje, i „Vrati ovu verziju". Čita svaki član startupa; vraća ko sme da menja
 * cilj (zaključana stranica: autor, vlasnik startupa, admin). Upiti ne čitaju
 * sat.
 */

type ReadCtx = QueryCtx | MutationCtx;

type ResolvedTarget =
  | { kind: "page"; actor: Actor; page: Doc<"pages">; title: string }
  | { kind: "area"; actor: Actor; area: Doc<"areas">; title: string }
  | { kind: "idea"; actor: Actor; idea: Doc<"ideaNodes">; title: string };

const NOT_FOUND = "Istorija nije pronađena.";

async function resolveTarget(
  ctx: ReadCtx,
  target: RevisionTarget,
): Promise<ResolvedTarget> {
  if (target.kind === "page") {
    const page = await requireVisiblePage(ctx, target.id);
    const actor = await requireClanProjekta(ctx, page.workspaceId);
    return { kind: "page", actor, page, title: page.title };
  }
  if (target.kind === "area") {
    const area = await ctx.db.get("areas", target.id);
    if (area === null) throw new Error("Oblast nije pronađena.");
    const actor = await requireClanProjekta(ctx, area.workspaceId);
    return { kind: "area", actor, area, title: area.label };
  }
  const idea = await ctx.db.get("ideaNodes", target.id);
  if (idea === null || idea.archivedAt !== null) {
    throw new Error("Ideja nije pronađena.");
  }
  const actor = await requireClanProjekta(ctx, idea.workspaceId);
  return {
    kind: "idea",
    actor,
    idea,
    title: idea.title ?? idea.text.slice(0, 80),
  };
}

function targetOf(revision: Doc<"contentRevisions">, ctx: ReadCtx): RevisionTarget {
  if (revision.targetKind === "page") {
    const id = ctx.db.normalizeId("pages", revision.targetId);
    if (id === null) throw new Error(NOT_FOUND);
    return { kind: "page", id };
  }
  if (revision.targetKind === "area") {
    const id = ctx.db.normalizeId("areas", revision.targetId);
    if (id === null) throw new Error(NOT_FOUND);
    return { kind: "area", id };
  }
  const id = ctx.db.normalizeId("ideaNodes", revision.targetId);
  if (id === null) throw new Error(NOT_FOUND);
  return { kind: "idea", id };
}

function canRestoreTarget(resolved: ResolvedTarget) {
  if (resolved.kind === "page") return canEditPage(resolved.actor, resolved.page);
  if (resolved.kind === "area") return canEditArea(resolved.actor, resolved.area);
  return canEditIdea(resolved.actor, resolved.idea);
}

function startupOf(resolved: ResolvedTarget): Id<"workspaces"> {
  if (resolved.kind === "page") return resolved.page.workspaceId;
  if (resolved.kind === "area") return resolved.area.workspaceId;
  return resolved.idea.workspaceId;
}

const revisionSummaryValidator = v.object({
  _id: v.id("contentRevisions"),
  kind: revisionKindValidator,
  author: v.union(profileSummaryValidator, v.null()),
  title: v.union(v.string(), v.null()),
  excerpt: v.string(),
  contentLength: v.number(),
  restoredFromId: v.union(v.id("contentRevisions"), v.null()),
  createdAt: v.number(),
  updatedAt: v.number(),
  canRestore: v.boolean(),
});

async function summarize(
  ctx: ReadCtx,
  revision: Doc<"contentRevisions">,
  canRestore: boolean,
  authors: Map<Id<"profiles">, Awaited<ReturnType<typeof getProfileSummary>>>,
) {
  let author = null;
  if (revision.authorProfileId !== null) {
    if (!authors.has(revision.authorProfileId)) {
      authors.set(
        revision.authorProfileId,
        await getProfileSummary(ctx, revision.authorProfileId),
      );
    }
    author = authors.get(revision.authorProfileId) ?? null;
  }
  return {
    _id: revision._id,
    kind: revision.kind,
    author,
    title: revision.title,
    excerpt: revisionExcerpt(revision.content),
    contentLength: revision.content.length,
    restoredFromId: revision.restoredFromId ?? null,
    createdAt: revision.createdAt,
    updatedAt: revision.updatedAt,
    canRestore,
  };
}

/** Revizije cilja, najnovija prva. Sadržaj se ne vraća (samo isečak). */
export const list = projekatQuery({
  uloga: "urednik",
  args: {
    target: revisionTargetValidator,
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(revisionSummaryValidator),
  handler: async (ctx, args) => {
    if (
      !Number.isInteger(args.paginationOpts.numItems) ||
      args.paginationOpts.numItems < 1 ||
      args.paginationOpts.numItems > HISTORY_PAGE_MAX
    ) {
      throw new Error(
        `Po stranici možete učitati najviše ${HISTORY_PAGE_MAX} revizija.`,
      );
    }
    const resolved = await resolveTarget(ctx, args.target);
    const canRestore = canRestoreTarget(resolved);
    const result = await ctx.db
      .query("contentRevisions")
      .withIndex("by_targetKey_and_updatedAt", (q) =>
        q.eq("targetKey", revisionTargetKey(args.target)),
      )
      .order("desc")
      .paginate(args.paginationOpts);
    const authors = new Map<
      Id<"profiles">,
      Awaited<ReturnType<typeof getProfileSummary>>
    >();
    const page = [];
    for (const revision of result.page) {
      page.push(await summarize(ctx, revision, canRestore, authors));
    }
    return { ...result, page };
  },
});

/** Jedna revizija sa celim sadržajem i prethodnom (za poređenje). */
export const get = projekatQuery({
  uloga: "urednik",
  args: { revisionId: v.id("contentRevisions") },
  returns: revisionSummaryValidator.extend({
    content: v.string(),
    instructions: v.union(v.string(), v.null()),
    targetKind: revisionTargetKindValidator,
    targetId: v.string(),
    previousRevisionId: v.union(v.id("contentRevisions"), v.null()),
  }),
  handler: async (ctx, args) => {
    const revision = await ctx.db.get("contentRevisions", args.revisionId);
    if (revision === null) throw new Error(NOT_FOUND);
    const resolved = await resolveTarget(ctx, targetOf(revision, ctx));
    if (startupOf(resolved) !== revision.workspaceId) throw new Error(NOT_FOUND);
    const previous = await ctx.db
      .query("contentRevisions")
      .withIndex("by_targetKey_and_updatedAt", (q) =>
        q.eq("targetKey", revision.targetKey).lt("updatedAt", revision.updatedAt),
      )
      .order("desc")
      .first();
    const summary = await summarize(
      ctx,
      revision,
      canRestoreTarget(resolved),
      new Map(),
    );
    return {
      ...summary,
      content: revision.content,
      instructions: revision.instructions ?? null,
      targetKind: revision.targetKind,
      targetId: revision.targetId,
      previousRevisionId: previous?._id ?? null,
    };
  },
});

/**
 * „Vrati ovu verziju": upisuje sadržaj revizije kao NOVU izmenu (revizija
 * `restore`) — ništa se ne briše. Stranica i opis oblasti traže
 * `expectedRevision` (konflikt kao pri čuvanju).
 */
export const restore = projekatMutation({
  uloga: "urednik",
  args: {
    revisionId: v.id("contentRevisions"),
    expectedRevision: v.optional(v.number()),
  },
  returns: v.object({
    changed: v.boolean(),
    revisionId: v.union(v.id("contentRevisions"), v.null()),
    targetRevision: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, args) => {
    const revision = await ctx.db.get("contentRevisions", args.revisionId);
    if (revision === null) throw new Error(NOT_FOUND);
    const resolved = await resolveTarget(ctx, targetOf(revision, ctx));
    if (startupOf(resolved) !== revision.workspaceId) throw new Error(NOT_FOUND);
    const { actor } = resolved;
    const now = Date.now();

    if (resolved.kind === "page") {
      const { page } = resolved;
      assertCanEditPage(actor, page);
      if (args.expectedRevision === undefined) {
        throw new Error("Nedostaje revizija stranice.");
      }
      if (args.expectedRevision !== page.revision) throw conflictError(page);
      const result = await writePageContent(ctx, {
        page,
        actorProfileId: actor.profile._id,
        now,
        title: revision.title ?? page.title,
        content: revision.content,
        instructions:
          page.kind === "task" ? (revision.instructions ?? null) : undefined,
        restoredFromId: revision._id,
      });
      if (!result.changed) {
        return { changed: false, revisionId: null, targetRevision: page.revision };
      }
      if (page.kind === "note") {
        // Prilozi koje je `prune` sklonio, a vraćena verzija ih ponovo
        // koristi, vraćaju se u belešku (PROSTOR D8).
        await unprunePageFiles(ctx, {
          page,
          isReferenced: (fileId) => revision.content.includes(fileId),
          now,
        });
      }
      await recordActivity(ctx, {
        workspaceId: page.workspaceId,
        actorProfileId: actor.profile._id,
        action: "revision_restored",
        targetType: "page",
        targetId: page._id,
        title: revision.title ?? page.title,
      });
      return {
        changed: true,
        revisionId: await latestRestoreId(ctx, revision.targetKey),
        targetRevision: result.revision,
      };
    }

    if (resolved.kind === "area") {
      const { area } = resolved;
      if (!canEditArea(actor, area)) {
        throw permissionError("NEMA_DOZVOLU", "Oblast nije pronađena.");
      }
      const body = await ctx.db
        .query("areaBodies")
        .withIndex("by_areaId", (q) => q.eq("areaId", area._id))
        .unique();
      const currentRevision = body?.revision ?? 0;
      if (args.expectedRevision === undefined) {
        throw new Error("Nedostaje revizija opisa oblasti.");
      }
      if (args.expectedRevision !== currentRevision) {
        throw conflictError(
          {
            revision: currentRevision,
            updatedByProfileId: null,
            updatedAt: body?.updatedAt ?? 0,
          },
          "KONFLIKT_IZMENA: Briefing je u međuvremenu izmenjen.",
        );
      }
      if ((body?.content ?? "") === revision.content) {
        return { changed: false, revisionId: null, targetRevision: currentRevision };
      }
      const nextRevision = currentRevision + 1;
      if (body === null) {
        await ctx.db.insert("areaBodies", {
          workspaceId: area.workspaceId,
          areaId: area._id,
          ownerProfileId: await vlasnikProjektaProfileId(
            ctx,
            actor.workspace,
            actor.profile._id,
          ),
          content: revision.content,
          revision: nextRevision,
          createdAt: now,
          updatedAt: now,
        });
      } else {
        await ctx.db.patch("areaBodies", body._id, {
          content: revision.content,
          revision: nextRevision,
          updatedAt: now,
        });
      }
      const revisionId = await insertRestoreRevision(ctx, {
        workspaceId: area.workspaceId,
        target: { kind: "area", id: area._id },
        snapshot: { title: area.label, content: revision.content },
        actorProfileId: actor.profile._id,
        now,
        restoredFromId: revision._id,
        targetRevision: nextRevision,
      });
      await recordActivity(ctx, {
        workspaceId: area.workspaceId,
        actorProfileId: actor.profile._id,
        action: "revision_restored",
        targetType: "area",
        targetId: area._id,
        title: area.label,
      });
      return { changed: true, revisionId, targetRevision: nextRevision };
    }

    const { idea } = resolved;
    if (!canEditIdea(actor, idea)) {
      throw permissionError("NEMA_DOZVOLU", "Ideja nije pronađena.");
    }
    const title = revision.title ?? idea.title;
    if (title === idea.title && revision.content === idea.text) {
      return { changed: false, revisionId: null, targetRevision: null };
    }
    await ctx.db.patch("ideaNodes", idea._id, {
      title,
      text: revision.content,
      searchText: nodeSearchText(title, revision.content),
      updatedAt: now,
    });
    const original = await ctx.db
      .query("contentContributions")
      .withIndex("by_sourceKind_and_sourceId", (q) =>
        q.eq("sourceKind", "idea_original").eq("sourceId", idea._id),
      )
      .unique();
    if (original !== null && original.authorProfileId === actor.profile._id) {
      await ctx.db.patch("contentContributions", original._id, {
        content: revision.content,
        updatedAt: now,
      });
    }
    const revisionId = await insertRestoreRevision(ctx, {
      workspaceId: idea.workspaceId,
      target: { kind: "idea", id: idea._id },
      snapshot: { title, content: revision.content },
      actorProfileId: actor.profile._id,
      now,
      restoredFromId: revision._id,
      targetRevision: null,
    });
    await recordActivity(ctx, {
      workspaceId: idea.workspaceId,
      actorProfileId: actor.profile._id,
      action: "revision_restored",
      targetType: "idea",
      targetId: idea._id,
      title: title ?? revision.content.slice(0, 80),
    });
    return { changed: true, revisionId, targetRevision: null };
  },
});

async function latestRestoreId(ctx: MutationCtx, targetKey: string) {
  const latest = await ctx.db
    .query("contentRevisions")
    .withIndex("by_targetKey_and_updatedAt", (q) => q.eq("targetKey", targetKey))
    .order("desc")
    .first();
  return latest?._id ?? null;
}
