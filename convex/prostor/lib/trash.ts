// Preneto iz Devotion packages/backend/convex/lib/trash.ts (main @ c05c40f), SPAJANJE S03.
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import {
  archiveCanvasEdgeWithLegacyProjection,
  archiveEdgesForMovedPage,
  assertCanvasCapacity,
  upsertPlacement,
} from "../areasV2";
import { getAvailableCanvasPosition, getPlacement } from "../canvasPlacement";
import { recordActivity } from "./activity";
import { contributionTargetKey, detachIdeaChildren } from "./collaboration";
import {
  listActivePageFiles,
  MAX_PAGE_FILES,
  syncPageFileSummary,
} from "./page_files";
import { getActivePageDescendants, isPageVisible } from "./pages";
import {
  assertCanArchivePage,
  assertCanEditPage,
  assertCanTouchLockedBranch,
  canArchiveIdea,
  canChangeChildren,
  canDismissRecovered,
  canRemoveComment,
  permissionError,
  type Actor,
} from "./permissions";
import { syncTaskCheckpointProjection } from "./task_checkpoints";
import { archiveCheckpointCanvasEdgesForCheckpoint } from "./task_checkpoint_canvas_edges";

/**
 * Korpa (PROSTOR P3, P19; plan K01 §5). Brisanje je uvek arhiviranje koje se
 * vraća: `archivedAt` + `archivedByProfileId` + `trashState`. Stranica ide u
 * Korpu sa celom granom (D1), a vraćanje vraća tačno podstranice istog poteza.
 * Veze, relacije, raspored, prilozi i komentari obrisane stavke se NE diraju
 * (D3) — skriveni su jer je stavka arhivirana, pa „Vrati" ništa ne gubi.
 * Trajnog brisanja ovde nema.
 */

type ReadCtx = QueryCtx | MutationCtx;

const MAX_TREE_DEPTH = 64;
const MAX_TRASH_BRANCH = 250;
const MAX_IDEA_EDGES_SCAN = 500;
const MAX_RECOVERED_CONTRIBUTIONS = 200;
const MAX_PRUNED_FILES_SCAN = 200;

/** „Sa 1 podstranicom" · „Sa 3 podstranice" · „Sa 7 podstranica". */
export function subpageCountLabel(count: number) {
  const lastTwo = count % 100;
  const last = count % 10;
  const noun =
    last === 1 && lastTwo !== 11
      ? "podstranicom"
      : last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)
        ? "podstranice"
        : "podstranica";
  return `Sa ${count} ${noun}`;
}

export function ideaTitleOf(idea: Pick<Doc<"ideaNodes">, "title" | "text">) {
  return idea.title ?? idea.text.slice(0, 80);
}

// --- Stranice ----------------------------------------------------------------

/**
 * R7 + D6: briše stranicu sa celom aktivnom granom (≤ 250). Na zaključanoj
 * stranici, pod zaključanim roditeljem ili sa zaključanom stranicom u grani
 * radi samo autor (te stranice), vlasnik startupa ili admin.
 */
export async function trashPageTree(
  ctx: MutationCtx,
  args: { actor: Actor; page: Doc<"pages">; now: number },
) {
  const { actor, page } = args;
  const parent =
    page.parentPageId === null
      ? null
      : await ctx.db.get("pages", page.parentPageId);
  assertCanArchivePage(
    actor,
    page,
    parent !== null && parent.archivedAt === null ? parent : null,
  );
  const descendants = await getActivePageDescendants(ctx, page._id);
  assertCanTouchLockedBranch(actor, descendants);
  return await moveBranchToTrash(ctx, {
    page,
    descendants,
    actorProfileId: actor.profile._id,
    now: args.now,
  });
}

async function moveBranchToTrash(
  ctx: MutationCtx,
  args: {
    page: Doc<"pages">;
    descendants: Doc<"pages">[];
    actorProfileId: Id<"profiles">;
    now: number;
  },
) {
  const { page, descendants, actorProfileId, now } = args;
  // Raspored se čuva (D3), ali kartica izlazi iz opsega roditeljevog kanvasa:
  // obrisane kartice inače zauzimaju mesta i granicu `MAX_CANVAS_PAGES` koju
  // auto-raspored i Mapa čitaju po opsegu. Opseg = sama stranica (njen kanvas se
  // ne otvara dok je u Korpi); „Vrati" ga vraća. Raspored potomaka je ionako u
  // opsezima obrisanih stranica.
  const placement = await getPlacement(ctx, page._id);
  if (placement !== null) {
    await ctx.db.patch("pageCanvasPlacements", placement._id, {
      rootPageId: page._id,
    });
  }
  await ctx.db.patch("pages", page._id, {
    archivedAt: now,
    archivedByProfileId: actorProfileId,
    trashState: "root",
    trashDescendantCount: descendants.length,
    treeRevision: (page.treeRevision ?? 0) + 1,
    updatedByProfileId: actorProfileId,
    updatedAt: now,
  });
  for (const descendant of descendants) {
    await ctx.db.patch("pages", descendant._id, {
      archivedAt: now,
      archivedByProfileId: actorProfileId,
      trashState: "descendant",
      archivedWithPageId: page._id,
    });
  }
  await recordActivity(ctx, {
    workspaceId: page.workspaceId,
    actorProfileId,
    action: "page_archived",
    targetType: "page",
    targetId: page._id,
    title: `„${page.title}” je premešten/a u Korpu`,
    ...(descendants.length > 0
      ? { detail: subpageCountLabel(descendants.length) }
      : {}),
  });
  return { descendantCount: descendants.length };
}

/**
 * Gde se vraća obrisana stranica: stari roditelj ako je i dalje vidljiv, u istoj
 * oblasti i član sme da menja njegov spisak dece (R6); inače vrh oblasti.
 */
export async function restoreTargetFor(
  ctx: ReadCtx,
  actor: Actor,
  page: Doc<"pages">,
): Promise<Doc<"pages"> | null> {
  if (page.parentPageId === null) return null;
  const parent = await ctx.db.get("pages", page.parentPageId);
  if (
    parent === null ||
    parent.workspaceId !== page.workspaceId ||
    parent.areaId !== page.areaId ||
    !(await isPageVisible(ctx, parent._id)) ||
    !canChangeChildren(actor, parent)
  ) {
    return null;
  }
  return parent;
}

/** Podstranice obrisane ISTIM potezom (isti `archivedAt` i isti koren). */
async function listTrashedDescendants(
  ctx: ReadCtx,
  root: Doc<"pages">,
  archivedAt: number,
) {
  const descendants: Doc<"pages">[] = [];
  const queue: Array<{ pageId: Id<"pages">; depth: number }> = [
    { pageId: root._id, depth: 0 },
  ];
  const seen = new Set<string>([root._id]);
  let maxDepth = 0;
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    const children = await ctx.db
      .query("pages")
      .withIndex("by_parentPageId_and_archivedAt", (q) =>
        q.eq("parentPageId", current.pageId).eq("archivedAt", archivedAt),
      )
      .take(MAX_TRASH_BRANCH + 1);
    for (const child of children) {
      if (
        child.trashState !== "descendant" ||
        child.archivedWithPageId !== root._id ||
        seen.has(child._id)
      ) {
        continue;
      }
      seen.add(child._id);
      descendants.push(child);
      if (descendants.length > MAX_TRASH_BRANCH) {
        throw new Error(
          "Ova grana ima više od 250 stranica. Podelite je pre ove radnje.",
        );
      }
      const depth = current.depth + 1;
      maxDepth = Math.max(maxDepth, depth);
      queue.push({ pageId: child._id, depth });
    }
  }
  return { descendants, maxDepth };
}

async function chainDepthOf(ctx: ReadCtx, page: Doc<"pages">) {
  let depth = 1;
  let parentPageId = page.parentPageId;
  while (parentPageId !== null) {
    if (depth >= MAX_TREE_DEPTH) {
      throw new Error("Hijerarhija stranica je preduboka.");
    }
    const parent = await ctx.db.get("pages", parentPageId);
    if (parent === null) break;
    depth += 1;
    parentPageId = parent.parentPageId;
  }
  return depth;
}

/**
 * R8: svaki član vraća stranicu iz Korpe sa podstranicama istog poteza.
 * Zaključanost ostaje kakva je bila.
 */
export async function restorePageTree(
  ctx: MutationCtx,
  args: { actor: Actor; page: Doc<"pages">; now: number },
) {
  const { actor, page, now } = args;
  if (page.workspaceId !== actor.workspace._id) {
    throw permissionError("NEMA_DOZVOLU", "Stranica nije pronađena.");
  }
  if (page.archivedAt === null || page.trashState !== "root") {
    throw new Error("Ova stranica nije u Korpi.");
  }
  const area = await ctx.db.get("areas", page.areaId);
  if (area === null || area.workspaceId !== page.workspaceId) {
    throw new Error("Oblast ove stranice više ne postoji.");
  }
  const target = await restoreTargetFor(ctx, actor, page);
  const targetPageId = target?._id ?? null;
  const movedToAreaRoot = page.parentPageId !== null && target === null;
  const { descendants, maxDepth } = await listTrashedDescendants(
    ctx,
    page,
    page.archivedAt,
  );
  await assertCanvasCapacity(ctx, page.workspaceId, page.areaId, targetPageId);
  const targetDepth = target === null ? 0 : await chainDepthOf(ctx, target);
  if (targetDepth + maxDepth > MAX_TREE_DEPTH) {
    throw new Error("Vraćanje bi napravilo preduboku hijerarhiju.");
  }

  await ctx.db.patch("pages", page._id, {
    archivedAt: null,
    archivedByProfileId: undefined,
    trashState: undefined,
    trashDescendantCount: undefined,
    parentPageId: targetPageId,
    treeRevision: (page.treeRevision ?? 0) + 1,
    updatedByProfileId: actor.profile._id,
    updatedAt: now,
  });
  const placement = await getPlacement(ctx, page._id);
  if (!movedToAreaRoot && placement !== null) {
    // Ista pozicija i veličina, nazad u opseg roditelja (vidi `moveBranchToTrash`).
    await ctx.db.patch("pageCanvasPlacements", placement._id, {
      rootPageId: targetPageId,
      updatedByProfileId: actor.profile._id,
      updatedAt: now,
    });
  }
  if (movedToAreaRoot) {
    // Veze na kanvasu starog roditelja više nemaju smisla; raspored dobija
    // slobodno mesto na vrhu oblasti.
    await archiveEdgesForMovedPage(ctx, page, page.parentPageId, now);
    const position = await getAvailableCanvasPosition(ctx, {
      workspaceId: page.workspaceId,
      areaId: page.areaId,
      rootPageId: null,
      excludePageId: page._id,
      width: placement?.width,
      height: placement?.height,
    });
    await upsertPlacement(ctx, {
      page: { ...page, parentPageId: null },
      rootPageId: null,
      actorProfileId: actor.profile._id,
      x: position.x,
      y: position.y,
      width: placement?.width,
      height: placement?.height,
      now,
    });
  }
  for (const descendant of descendants) {
    await ctx.db.patch("pages", descendant._id, {
      archivedAt: null,
      archivedByProfileId: undefined,
      trashState: undefined,
      archivedWithPageId: undefined,
    });
  }
  await recordActivity(ctx, {
    workspaceId: page.workspaceId,
    actorProfileId: actor.profile._id,
    action: "page_restored",
    targetType: "page",
    targetId: page._id,
    title: page.title,
    ...(descendants.length > 0
      ? { detail: subpageCountLabel(descendants.length) }
      : {}),
  });
  return { restoredCount: 1 + descendants.length, movedToAreaRoot };
}

// --- Ideje -------------------------------------------------------------------

/** R16: svaki član briše ideju u Korpu; deca se izvlače kao i ranije. */
export async function trashIdea(
  ctx: MutationCtx,
  args: { actor: Actor; idea: Doc<"ideaNodes">; now: number },
) {
  const { actor, idea, now } = args;
  if (!canArchiveIdea(actor, idea)) {
    throw permissionError("NEMA_DOZVOLU", "Ideja nije pronađena.");
  }
  await detachIdeaChildren(ctx, idea._id, now);
  await ctx.db.patch("ideaNodes", idea._id, {
    archivedAt: now,
    archivedByProfileId: actor.profile._id,
    trashState: "root",
    updatedAt: now,
  });
  const edges = await ctx.db
    .query("ideaEdges")
    .withIndex("by_workspaceId_and_archivedAt", (q) =>
      q.eq("workspaceId", idea.workspaceId).eq("archivedAt", null),
    )
    .take(MAX_IDEA_EDGES_SCAN);
  for (const edge of edges) {
    if (edge.nodeAId !== idea._id && edge.nodeBId !== idea._id) continue;
    await ctx.db.patch("ideaEdges", edge._id, {
      archivedAt: now,
      updatedAt: now,
    });
  }
  await recordActivity(ctx, {
    workspaceId: idea.workspaceId,
    actorProfileId: actor.profile._id,
    action: "idea_archived",
    targetType: "idea",
    targetId: idea._id,
    title: ideaTitleOf(idea),
  });
}

/**
 * Roditelj obrisane ideje je možda u međuvremenu i sam obrisan. Tada se ideja
 * kači na prvog aktivnog pretka (ili na vrh), a pozicija se preračunava da na
 * platnu ostane na istom mestu.
 */
async function reattachIdeaPosition(ctx: MutationCtx, idea: Doc<"ideaNodes">) {
  let x = idea.x;
  let y = idea.y;
  let parentId = idea.parentIdeaId;
  const seen = new Set<string>([idea._id]);
  for (let depth = 0; parentId !== undefined && depth < 512; depth += 1) {
    if (seen.has(parentId)) break;
    seen.add(parentId);
    const parent: Doc<"ideaNodes"> | null = await ctx.db.get(
      "ideaNodes",
      parentId,
    );
    if (parent === null || parent.workspaceId !== idea.workspaceId) {
      return { parentIdeaId: undefined, x, y };
    }
    if (parent.archivedAt === null) {
      return { parentIdeaId: parent._id, x, y };
    }
    x += parent.x;
    y += parent.y;
    parentId = parent.parentIdeaId;
  }
  return { parentIdeaId: undefined, x, y };
}

/** R16: svaki član vraća ideju; vraćaju se i njene veze obrisane istim potezom. */
export async function restoreIdea(
  ctx: MutationCtx,
  args: { actor: Actor; idea: Doc<"ideaNodes">; now: number },
) {
  const { actor, idea, now } = args;
  if (idea.workspaceId !== actor.workspace._id) {
    throw permissionError("NEMA_DOZVOLU", "Ideja nije pronađena.");
  }
  if (idea.archivedAt === null || idea.trashState !== "root") {
    throw new Error("Ova ideja nije u Korpi.");
  }
  const archivedAt = idea.archivedAt;
  const position = await reattachIdeaPosition(ctx, idea);
  await ctx.db.patch("ideaNodes", idea._id, {
    archivedAt: null,
    archivedByProfileId: undefined,
    trashState: undefined,
    parentIdeaId: position.parentIdeaId,
    x: position.x,
    y: position.y,
    updatedAt: now,
  });
  const edges = await ctx.db
    .query("ideaEdges")
    .withIndex("by_workspaceId_and_archivedAt", (q) =>
      q.eq("workspaceId", idea.workspaceId).eq("archivedAt", archivedAt),
    )
    .take(MAX_IDEA_EDGES_SCAN);
  for (const edge of edges) {
    if (edge.nodeAId !== idea._id && edge.nodeBId !== idea._id) continue;
    const otherId = edge.nodeAId === idea._id ? edge.nodeBId : edge.nodeAId;
    const other = await ctx.db.get("ideaNodes", otherId);
    if (other === null || other.workspaceId !== idea.workspaceId) continue;
    if (other.archivedAt !== null) {
      // Drugi kraj je i sam u Korpi: veza prelazi na njegov potez, pa je vraća
      // njegovo „Vrati" (inače bi se izgubila, zavisno od redosleda vraćanja).
      if (other.trashState === "root" && other.archivedAt !== edge.archivedAt) {
        await ctx.db.patch("ideaEdges", edge._id, {
          archivedAt: other.archivedAt,
          updatedAt: now,
        });
      }
      continue;
    }
    await ctx.db.patch("ideaEdges", edge._id, {
      archivedAt: null,
      updatedAt: now,
    });
  }
  await recordActivity(ctx, {
    workspaceId: idea.workspaceId,
    actorProfileId: actor.profile._id,
    action: "idea_restored",
    targetType: "idea",
    targetId: idea._id,
    title: ideaTitleOf(idea),
  });
}

// --- Prilozi -----------------------------------------------------------------

async function renumberActiveFiles(
  ctx: MutationCtx,
  pageId: Id<"pages">,
  now: number,
) {
  const rows = await listActivePageFiles(ctx, pageId);
  for (const [position, row] of rows.entries()) {
    if (row.position === position) continue;
    await ctx.db.patch("pageFiles", row._id, { position, updatedAt: now });
  }
}

/** R2 nad stranicom: prilog ide u Korpu, blob ostaje u storage-u (P19, D8). */
export async function trashFile(
  ctx: MutationCtx,
  args: {
    actor: Actor;
    file: Doc<"pageFiles">;
    page: Doc<"pages">;
    now: number;
  },
) {
  const { actor, file, page, now } = args;
  assertCanEditPage(actor, page);
  await ctx.db.patch("pageFiles", file._id, {
    archivedAt: now,
    archivedByProfileId: actor.profile._id,
    trashState: "root",
    updatedAt: now,
  });
  await renumberActiveFiles(ctx, page._id, now);
  await syncPageFileSummary(ctx, page, actor.profile._id, now);
  await recordActivity(ctx, {
    workspaceId: page.workspaceId,
    actorProfileId: actor.profile._id,
    action: "page_updated",
    targetType: "page",
    targetId: page._id,
    title: `Fajl je uklonjen iz „${page.title}”`,
    detail: file.name,
  });
}

export async function restoreFile(
  ctx: MutationCtx,
  args: { actor: Actor; file: Doc<"pageFiles">; now: number },
) {
  const { actor, file, now } = args;
  if (file.workspaceId !== actor.workspace._id) {
    throw permissionError("NEMA_DOZVOLU", "Fajl nije pronađen.");
  }
  if (file.archivedAt === null || file.trashState !== "root") {
    throw new Error("Ovaj prilog nije u Korpi.");
  }
  const page = await ctx.db.get("pages", file.pageId);
  if (page === null || !(await isPageVisible(ctx, page._id))) {
    throw new Error(
      "Stranica ovog fajla je obrisana — prvo vrati nju iz Korpe.",
    );
  }
  assertCanEditPage(actor, page);
  const rows = await listActivePageFiles(ctx, page._id);
  if (rows.length >= MAX_PAGE_FILES) {
    throw new Error(`Oblačić već ima najviše ${MAX_PAGE_FILES} fajlova.`);
  }
  await ctx.db.patch("pageFiles", file._id, {
    archivedAt: null,
    archivedByProfileId: undefined,
    trashState: undefined,
    position: rows.length,
    updatedAt: now,
  });
  await syncPageFileSummary(ctx, page, actor.profile._id, now);
  await recordActivity(ctx, {
    workspaceId: page.workspaceId,
    actorProfileId: actor.profile._id,
    action: "page_updated",
    targetType: "page",
    targetId: page._id,
    title: `Fajl je vraćen u „${page.title}”`,
    detail: file.name,
  });
}

/**
 * Prilozi beleške koje je `prune` sklonio (arhivirani, ali NE u Korpi) vraćaju
 * se kad im se id ponovo pojavi u telu — poništeno brisanje slike u editoru ili
 * „Vrati ovu verziju". Vraća broj vraćenih.
 */
export async function unprunePageFiles(
  ctx: MutationCtx,
  args: {
    page: Doc<"pages">;
    isReferenced: (fileId: Id<"pageFiles">) => boolean;
    now: number;
  },
) {
  const pruned = await ctx.db
    .query("pageFiles")
    .withIndex("by_pageId_and_archivedAt_and_position", (q) =>
      q.eq("pageId", args.page._id).gt("archivedAt", 0),
    )
    .order("desc")
    .take(MAX_PRUNED_FILES_SCAN);
  const candidates = pruned.filter(
    (row) => row.trashState === undefined && args.isReferenced(row._id),
  );
  if (candidates.length === 0) return 0;
  let position = (await listActivePageFiles(ctx, args.page._id)).length;
  let restored = 0;
  for (const row of candidates) {
    if (position >= MAX_PAGE_FILES) break;
    await ctx.db.patch("pageFiles", row._id, {
      archivedAt: null,
      archivedByProfileId: undefined,
      position,
      updatedAt: args.now,
    });
    position += 1;
    restored += 1;
  }
  return restored;
}

// --- Oporavljeno -------------------------------------------------------------

/** R20: sklanja red „Oporavljeno" i njegove sačuvane priloge (meko). */
export async function dismissRecoveredContent(
  ctx: MutationCtx,
  args: { actor: Actor; recovered: Doc<"recoveredContent">; now: number },
) {
  const { actor, recovered, now } = args;
  if (!canDismissRecovered(actor, recovered)) {
    throw permissionError(
      "NEMA_DOZVOLU",
      "Oporavljeno uklanja onaj čiji je sadržaj sačuvan ili vlasnik projekta.",
    );
  }
  if (recovered.archivedAt !== null) return;
  await ctx.db.patch("recoveredContent", recovered._id, {
    archivedAt: now,
    updatedAt: now,
  });
  const contributions = await ctx.db
    .query("contentContributions")
    .withIndex("by_targetKey_and_archivedAt_and_createdAt", (q) =>
      q
        .eq("targetKey", contributionTargetKey("recovered", recovered._id))
        .eq("archivedAt", null),
    )
    .take(MAX_RECOVERED_CONTRIBUTIONS);
  for (const contribution of contributions) {
    await ctx.db.patch("contentContributions", contribution._id, {
      archivedAt: now,
      updatedAt: now,
    });
  }
}

// --- Stari tok „Zatraži brisanje" (P4, D9) -----------------------------------

export type LegacyDeletionTarget =
  | { kind: "idea"; id: Id<"ideaNodes"> }
  | { kind: "idea_edge"; id: Id<"ideaEdges"> }
  | { kind: "page"; id: Id<"pages"> }
  | { kind: "task_checkpoint"; id: Id<"taskCheckpoints"> }
  | { kind: "page_edge"; id: Id<"pageCanvasEdgesV2"> }
  | { kind: "page_relation"; id: Id<"pageRelations"> }
  | {
      kind: "task_checkpoint_edge";
      id: Id<"taskCheckpointCanvasEdges">;
    }
  | { kind: "contribution"; id: Id<"contentContributions"> }
  | { kind: "recovered"; id: Id<"recoveredContent"> };

function assertSameStartup(
  actor: Actor,
  workspaceId: Id<"workspaces">,
  message: string,
) {
  if (workspaceId !== actor.workspace._id) {
    throw permissionError("NEMA_DOZVOLU", message);
  }
}

/**
 * `collaboration.requestDeletion` (stari klijenti): umesto glasanja odmah
 * uklanja stavku po novom pravilu — stranica i ideja u Korpu, veze i relacije
 * direktno, korak po R2 nad zadatkom, komentar po R14, Oporavljeno po R20.
 * Ne pravi zahtev, listiće ni obaveštenja.
 */
export async function archiveTargetForLegacyRequest(
  ctx: MutationCtx,
  args: { actor: Actor; target: LegacyDeletionTarget; now: number },
) {
  const { actor, target, now } = args;
  switch (target.kind) {
    case "page": {
      const page = await ctx.db.get("pages", target.id);
      if (page === null || !(await isPageVisible(ctx, page._id))) {
        throw new Error("Stranica nije pronađena.");
      }
      assertSameStartup(actor, page.workspaceId, "Stranica nije pronađena.");
      await trashPageTree(ctx, { actor, page, now });
      return;
    }
    case "idea": {
      const idea = await ctx.db.get("ideaNodes", target.id);
      if (idea === null || idea.archivedAt !== null) {
        throw new Error("Ideja nije pronađena.");
      }
      await trashIdea(ctx, { actor, idea, now });
      return;
    }
    case "idea_edge": {
      const edge = await ctx.db.get("ideaEdges", target.id);
      if (edge === null || edge.archivedAt !== null) {
        throw new Error("Veza nije pronađena.");
      }
      assertSameStartup(actor, edge.workspaceId, "Veza nije pronađena.");
      await ctx.db.patch("ideaEdges", edge._id, {
        archivedAt: now,
        updatedAt: now,
      });
      return;
    }
    case "page_edge": {
      const edge = await ctx.db.get("pageCanvasEdgesV2", target.id);
      if (edge === null || edge.archivedAt !== null) {
        throw new Error("Veza stranica nije pronađena.");
      }
      assertSameStartup(actor, edge.workspaceId, "Veza stranica nije pronađena.");
      await archiveCanvasEdgeWithLegacyProjection(ctx, edge, now);
      return;
    }
    case "page_relation": {
      const relation = await ctx.db.get("pageRelations", target.id);
      if (relation === null || relation.archivedAt !== null) {
        throw new Error("Relacija stranica nije pronađena.");
      }
      assertSameStartup(
        actor,
        relation.workspaceId,
        "Relacija stranica nije pronađena.",
      );
      await ctx.db.patch("pageRelations", relation._id, {
        archivedAt: now,
        updatedAt: now,
      });
      return;
    }
    case "task_checkpoint_edge": {
      const edge = await ctx.db.get("taskCheckpointCanvasEdges", target.id);
      if (edge === null || edge.archivedAt !== null) {
        throw new Error("Checkpoint veza nije pronađena.");
      }
      assertSameStartup(actor, edge.workspaceId, "Checkpoint veza nije pronađena.");
      await ctx.db.patch("taskCheckpointCanvasEdges", edge._id, {
        archivedAt: now,
        updatedAt: now,
      });
      return;
    }
    case "task_checkpoint": {
      const checkpoint = await ctx.db.get("taskCheckpoints", target.id);
      if (checkpoint === null || checkpoint.archivedAt !== null) {
        throw new Error("Checkpoint nije pronađen.");
      }
      const page = await ctx.db.get("pages", checkpoint.taskPageId);
      if (
        page === null ||
        page.kind !== "task" ||
        !(await isPageVisible(ctx, page._id))
      ) {
        throw new Error("Zadatak checkpointa nije pronađen.");
      }
      assertCanEditPage(actor, page);
      await archiveCheckpointCanvasEdgesForCheckpoint(ctx, checkpoint._id, now);
      await ctx.db.patch("taskCheckpoints", checkpoint._id, {
        archivedAt: now,
        updatedAt: now,
      });
      await syncTaskCheckpointProjection(ctx, page._id, actor.profile._id, now);
      return;
    }
    case "contribution": {
      const row = await ctx.db.get("contentContributions", target.id);
      if (row === null || row.archivedAt !== null) {
        throw new Error("Tekst nije pronađen.");
      }
      assertSameStartup(actor, row.workspaceId, "Tekst nije pronađen.");
      if (row.sourceKind === "page_body" || row.sourceKind === "idea_original") {
        throw permissionError(
          "NEMA_DOZVOLU",
          "Sadržaj stranice ili ideje se ne briše kao komentar.",
        );
      }
      if (!canRemoveComment(actor, row)) {
        throw permissionError(
          "NEMA_DOZVOLU",
          "Tuđi komentar uklanja njegov autor ili vlasnik projekta.",
        );
      }
      await ctx.db.patch("contentContributions", row._id, {
        archivedAt: now,
        updatedAt: now,
      });
      return;
    }
    case "recovered": {
      const recovered = await ctx.db.get("recoveredContent", target.id);
      if (recovered === null || recovered.archivedAt !== null) {
        throw new Error("Oporavljeni sadržaj nije pronađen.");
      }
      await dismissRecoveredContent(ctx, { actor, recovered, now });
      return;
    }
  }
}
