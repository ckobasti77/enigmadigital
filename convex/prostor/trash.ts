// Preneto iz Devotion packages/backend/convex/trash.ts (main @ c05c40f), SPAJANJE S03.
import {
  paginationOptsValidator,
  paginationResultValidator,
  type PaginationOptions,
} from "convex/server";
import { v } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

import { requireClanProjekta } from "./lib/auth";
import { contributionTargetKey } from "./lib/collaboration";
import { revisionExcerpt } from "./lib/history";
import { isPageVisible } from "./lib/pages";
import {
  canDismissRecovered,
  canEditPage,
  type Actor,
} from "./lib/permissions";
import {
  getProfileSummary,
  profileSummaryValidator,
} from "./lib/profile_summary";
import {
  dismissRecoveredContent,
  ideaTitleOf,
  restoreFile,
  restoreIdea,
  restorePageTree,
  restoreTargetFor,
} from "./lib/trash";
import {
  pageFileCategoryValidator,
  pageKindValidator,
  TRASH_COUNT_CAP,
  TRASH_PAGE_MAX,
  TRASH_RECOVERED_CONTRIBUTIONS,
} from "./lib/validators";
import { projekatMutation, projekatQuery } from "../lib/projekat";

/**
 * Korpa startupa (PROSTOR P3, plan K01 §5.3). Čita i vraća svaki aktivan član;
 * nečlan, uklonjen član, arhiviran profil i drugi startup ne vide ništa.
 * Prikazuje samo ono što je obrisano posle uvođenja Korpe (D2). Rok „30 dana"
 * ne postoji — trajnog brisanja i čišćenja u ovom modelu nema.
 */

const trashKindValidator = v.union(
  v.literal("page"),
  v.literal("idea"),
  v.literal("file"),
  v.literal("recovered"),
);
const personValidator = v.union(profileSummaryValidator, v.null());

const trashItemValidator = v.union(
  v.object({
    kind: v.literal("page"),
    pageId: v.id("pages"),
    title: v.string(),
    pageKind: pageKindValidator,
    areaId: v.id("areas"),
    areaLabel: v.string(),
    parentPageId: v.union(v.id("pages"), v.null()),
    parentTitle: v.union(v.string(), v.null()),
    /** Vraća se pod starog roditelja; inače na vrh oblasti. */
    parentAvailable: v.boolean(),
    descendantCount: v.number(),
    archivedAt: v.number(),
    archivedBy: personValidator,
    canRestore: v.boolean(),
  }),
  v.object({
    kind: v.literal("idea"),
    ideaId: v.id("ideaNodes"),
    title: v.string(),
    archivedAt: v.number(),
    archivedBy: personValidator,
    canRestore: v.boolean(),
  }),
  v.object({
    kind: v.literal("file"),
    fileId: v.id("pageFiles"),
    name: v.string(),
    category: pageFileCategoryValidator,
    size: v.number(),
    pageId: v.id("pages"),
    pageTitle: v.string(),
    pageAvailable: v.boolean(),
    archivedAt: v.number(),
    archivedBy: personValidator,
    canRestore: v.boolean(),
  }),
  v.object({
    kind: v.literal("recovered"),
    recoveredId: v.id("recoveredContent"),
    title: v.string(),
    sourceKind: v.union(v.literal("idea"), v.literal("page")),
    createdAt: v.number(),
    owner: personValidator,
    contributions: v.array(
      v.object({
        _id: v.id("contentContributions"),
        excerpt: v.string(),
        author: personValidator,
        createdAt: v.number(),
      }),
    ),
    canDismiss: v.boolean(),
  }),
);

const counterValidator = v.object({ count: v.number(), capped: v.boolean() });

type Person = Awaited<ReturnType<typeof getProfileSummary>>;

function profileLoader(ctx: QueryCtx) {
  const cache = new Map<Id<"profiles">, Person>();
  return async (profileId: Id<"profiles"> | undefined) => {
    if (profileId === undefined) return null;
    if (!cache.has(profileId)) {
      cache.set(profileId, await getProfileSummary(ctx, profileId));
    }
    return cache.get(profileId) ?? null;
  };
}

async function listPages(
  ctx: QueryCtx,
  actor: Actor,
  paginationOpts: PaginationOptions,
) {
  const result = await ctx.db
    .query("pages")
    .withIndex("by_workspaceId_and_trashState_and_archivedAt", (q) =>
      q.eq("workspaceId", actor.workspace._id).eq("trashState", "root"),
    )
    .order("desc")
    .paginate(paginationOpts);
  const person = profileLoader(ctx);
  const areaLabels = new Map<Id<"areas">, string>();
  const page = [];
  for (const row of result.page) {
    if (row.archivedAt === null) continue;
    if (!areaLabels.has(row.areaId)) {
      const area = await ctx.db.get("areas", row.areaId);
      areaLabels.set(row.areaId, area?.label ?? "Oblast");
    }
    const parent =
      row.parentPageId === null
        ? null
        : await ctx.db.get("pages", row.parentPageId);
    const target = await restoreTargetFor(ctx, actor, row);
    page.push({
      kind: "page" as const,
      pageId: row._id,
      title: row.title,
      pageKind: row.kind,
      areaId: row.areaId,
      areaLabel: areaLabels.get(row.areaId) ?? "Oblast",
      parentPageId: row.parentPageId,
      parentTitle: parent?.title ?? null,
      parentAvailable: target !== null,
      descendantCount: row.trashDescendantCount ?? 0,
      archivedAt: row.archivedAt,
      archivedBy: await person(row.archivedByProfileId),
      canRestore: true,
    });
  }
  return { ...result, page };
}

async function listIdeas(
  ctx: QueryCtx,
  actor: Actor,
  paginationOpts: PaginationOptions,
) {
  const result = await ctx.db
    .query("ideaNodes")
    .withIndex("by_workspaceId_and_trashState_and_archivedAt", (q) =>
      q.eq("workspaceId", actor.workspace._id).eq("trashState", "root"),
    )
    .order("desc")
    .paginate(paginationOpts);
  const person = profileLoader(ctx);
  const page = [];
  for (const row of result.page) {
    if (row.archivedAt === null) continue;
    page.push({
      kind: "idea" as const,
      ideaId: row._id,
      title: ideaTitleOf(row),
      archivedAt: row.archivedAt,
      archivedBy: await person(row.archivedByProfileId),
      canRestore: true,
    });
  }
  return { ...result, page };
}

async function listFiles(
  ctx: QueryCtx,
  actor: Actor,
  paginationOpts: PaginationOptions,
) {
  const result = await ctx.db
    .query("pageFiles")
    .withIndex("by_workspaceId_and_trashState_and_archivedAt", (q) =>
      q.eq("workspaceId", actor.workspace._id).eq("trashState", "root"),
    )
    .order("desc")
    .paginate(paginationOpts);
  const person = profileLoader(ctx);
  const pages = new Map<Id<"pages">, { doc: Doc<"pages"> | null; visible: boolean }>();
  const page = [];
  for (const row of result.page) {
    if (row.archivedAt === null) continue;
    if (!pages.has(row.pageId)) {
      const doc = await ctx.db.get("pages", row.pageId);
      pages.set(row.pageId, {
        doc,
        visible: doc !== null && (await isPageVisible(ctx, doc._id)),
      });
    }
    const owner = pages.get(row.pageId)!;
    page.push({
      kind: "file" as const,
      fileId: row._id,
      name: row.name,
      category: row.category,
      size: row.size,
      pageId: row.pageId,
      pageTitle: owner.doc?.title ?? "Stranica",
      pageAvailable: owner.visible,
      archivedAt: row.archivedAt,
      archivedBy: await person(row.archivedByProfileId),
      canRestore:
        owner.visible && owner.doc !== null && canEditPage(actor, owner.doc),
    });
  }
  return { ...result, page };
}

async function listRecovered(
  ctx: QueryCtx,
  actor: Actor,
  paginationOpts: PaginationOptions,
) {
  const result = await ctx.db
    .query("recoveredContent")
    .withIndex("by_workspaceId_and_archivedAt_and_createdAt", (q) =>
      q.eq("workspaceId", actor.workspace._id).eq("archivedAt", null),
    )
    .order("desc")
    .paginate(paginationOpts);
  const person = profileLoader(ctx);
  const page = [];
  for (const row of result.page) {
    const contributions = await ctx.db
      .query("contentContributions")
      .withIndex("by_targetKey_and_archivedAt_and_createdAt", (q) =>
        q
          .eq("targetKey", contributionTargetKey("recovered", row._id))
          .eq("archivedAt", null),
      )
      .order("asc")
      .take(TRASH_RECOVERED_CONTRIBUTIONS);
    const items = [];
    for (const contribution of contributions) {
      items.push({
        _id: contribution._id,
        excerpt: revisionExcerpt(contribution.content),
        author: await person(contribution.authorProfileId),
        createdAt: contribution.createdAt,
      });
    }
    page.push({
      kind: "recovered" as const,
      recoveredId: row._id,
      title: row.title,
      sourceKind: row.sourceKind,
      createdAt: row.createdAt,
      owner: await person(row.createdByProfileId),
      contributions: items,
      canDismiss: canDismissRecovered(actor, row),
    });
  }
  return { ...result, page };
}

/** Jedan segment Korpe, najnovije obrisano prvo (≤ `TRASH_PAGE_MAX` po strani). */
export const list = projekatQuery({
  uloga: "urednik",
  args: {
    kind: trashKindValidator,
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(trashItemValidator),
  handler: async (ctx, args) => {
    const actor = await requireClanProjekta(ctx, args.workspaceId);
    const { numItems } = args.paginationOpts;
    if (!Number.isInteger(numItems) || numItems < 1 || numItems > TRASH_PAGE_MAX) {
      throw new Error(
        `Po stranici možete učitati najviše ${TRASH_PAGE_MAX} stavki Korpe.`,
      );
    }
    switch (args.kind) {
      case "page":
        return await listPages(ctx, actor, args.paginationOpts);
      case "idea":
        return await listIdeas(ctx, actor, args.paginationOpts);
      case "file":
        return await listFiles(ctx, actor, args.paginationOpts);
      case "recovered":
        return await listRecovered(ctx, actor, args.paginationOpts);
    }
  },
});

/** Brojevi za segmente Korpe (preko `TRASH_COUNT_CAP` klijent piše „99+"). */
export const counts = projekatQuery({
  uloga: "urednik",
  args: { },
  returns: v.object({
    page: counterValidator,
    idea: counterValidator,
    file: counterValidator,
    recovered: counterValidator,
  }),
  handler: async (ctx, args) => {
    await requireClanProjekta(ctx, args.workspaceId);
    const limit = TRASH_COUNT_CAP + 1;
    const [pages, ideas, files, recovered] = await Promise.all([
      ctx.db
        .query("pages")
        .withIndex("by_workspaceId_and_trashState_and_archivedAt", (q) =>
          q.eq("workspaceId", args.workspaceId).eq("trashState", "root"),
        )
        .take(limit),
      ctx.db
        .query("ideaNodes")
        .withIndex("by_workspaceId_and_trashState_and_archivedAt", (q) =>
          q.eq("workspaceId", args.workspaceId).eq("trashState", "root"),
        )
        .take(limit),
      ctx.db
        .query("pageFiles")
        .withIndex("by_workspaceId_and_trashState_and_archivedAt", (q) =>
          q.eq("workspaceId", args.workspaceId).eq("trashState", "root"),
        )
        .take(limit),
      ctx.db
        .query("recoveredContent")
        .withIndex("by_workspaceId_and_archivedAt_and_createdAt", (q) =>
          q.eq("workspaceId", args.workspaceId).eq("archivedAt", null),
        )
        .take(limit),
    ]);
    const counter = (rows: unknown[]) => ({
      count: Math.min(rows.length, TRASH_COUNT_CAP),
      capped: rows.length > TRASH_COUNT_CAP,
    });
    return {
      page: counter(pages),
      idea: counter(ideas),
      file: counter(files),
      recovered: counter(recovered),
    };
  },
});

/**
 * „Vrati" (R8): svaki član. Stranica se vraća sa podstranicama istog poteza na
 * staro mesto, a kad je roditelj i dalje obrisan — na vrh svoje oblasti
 * (`movedToAreaRoot`). Prilog traži pravo izmene stranice (R2).
 */
export const restore = projekatMutation({
  uloga: "urednik",
  args: {
    target: v.union(
      v.object({ kind: v.literal("page"), id: v.id("pages") }),
      v.object({ kind: v.literal("idea"), id: v.id("ideaNodes") }),
      v.object({ kind: v.literal("file"), id: v.id("pageFiles") }),
    ),
  },
  returns: v.object({
    kind: v.union(v.literal("page"), v.literal("idea"), v.literal("file")),
    restoredCount: v.number(),
    movedToAreaRoot: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const { target } = args;
    if (target.kind === "page") {
      const page = await ctx.db.get("pages", target.id);
      if (page === null) throw new Error("Stranica nije pronađena.");
      const actor = await requireClanProjekta(ctx, page.workspaceId);
      const result = await restorePageTree(ctx, { actor, page, now });
      return { kind: "page" as const, ...result };
    }
    if (target.kind === "idea") {
      const idea = await ctx.db.get("ideaNodes", target.id);
      if (idea === null) throw new Error("Ideja nije pronađena.");
      const actor = await requireClanProjekta(ctx, idea.workspaceId);
      await restoreIdea(ctx, { actor, idea, now });
      return { kind: "idea" as const, restoredCount: 1, movedToAreaRoot: false };
    }
    const file = await ctx.db.get("pageFiles", target.id);
    if (file === null) throw new Error("Fajl nije pronađen.");
    const actor = await requireClanProjekta(ctx, file.workspaceId);
    await restoreFile(ctx, { actor, file, now });
    return { kind: "file" as const, restoredCount: 1, movedToAreaRoot: false };
  },
});

/** „Oporavljeno" › „Ukloni" (R20): onaj za koga je sačuvano, vlasnik ili admin. */
export const dismissRecovered = projekatMutation({
  uloga: "urednik",
  args: { recoveredId: v.id("recoveredContent") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const recovered = await ctx.db.get("recoveredContent", args.recoveredId);
    if (recovered === null) {
      throw new Error("Oporavljeni sadržaj nije pronađen.");
    }
    const actor = await requireClanProjekta(ctx, recovered.workspaceId);
    await dismissRecoveredContent(ctx, { actor, recovered, now: Date.now() });
    return null;
  },
});
