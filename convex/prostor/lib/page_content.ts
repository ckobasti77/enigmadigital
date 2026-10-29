// Preneto iz Devotion packages/backend/convex/lib/page_content.ts (main @ c05c40f), SPAJANJE S03.
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { insertContribution } from "./collaboration";
import {
  insertRestoreRevision,
  pageBaseline,
  recordRevision,
  type RevisionSnapshot,
} from "./history";
import { workspaceCanvasPreview } from "./page_creation";
import { pageSearchText, pageTaskSortAt } from "./pages";

type ReadCtx = QueryCtx | MutationCtx;

/**
 * Pisanje naslova i tela stranice na jednom mestu (plan K01 §3.1), da se
 * `pages.update` i `history.restore` ne raziđu. `areasV2.updatePage` i
 * `tasks.updateMetadata` pišu i osobine zadatka u istom patch-u, pa koriste
 * pojedinačne delove odavde (`getPageBody`, `syncPageBodyMirror`,
 * `recordPageRevision`).
 */

export async function getPageBody(ctx: ReadCtx, pageId: Id<"pages">) {
  return await ctx.db
    .query("pageBodies")
    .withIndex("by_pageId", (q) => q.eq("pageId", pageId))
    .unique();
}

async function getPageBodyContributions(
  ctx: ReadCtx,
  pageId: Id<"pages">,
  bodyId: Id<"pageBodies"> | null,
) {
  const sourceIds = bodyId === null ? [pageId] : [pageId, bodyId];
  const batches = await Promise.all(
    sourceIds.map((sourceId) =>
      ctx.db
        .query("contentContributions")
        .withIndex("by_sourceKind_and_sourceId", (q) =>
          q.eq("sourceKind", "page_body").eq("sourceId", sourceId),
        )
        .take(2),
    ),
  );
  return Array.from(
    new Map(
      batches
        .flat()
        .filter(
          (row) =>
            row.targetKind === "page" &&
            row.targetId === pageId &&
            row.archivedAt === null,
        )
        .map((row) => [row._id, row]),
    ).values(),
  );
}

/**
 * Mirror tela (`sourceKind: page_body`) ostaje kakav je bio (ODLUKA K01 D11):
 * autorov red prati sadržaj, a prazno telo bez zapisa „prisvaja" onaj ko prvi
 * upiše. Tuđi i `legacy_neutral` red se ne diraju — više ne zaključavaju telo.
 */
export async function syncPageBodyMirror(
  ctx: MutationCtx,
  args: {
    page: Doc<"pages">;
    bodyId: Id<"pageBodies"> | null;
    previousContent: string;
    content: string;
    actorProfileId: Id<"profiles">;
    now: number;
  },
) {
  if (args.content === args.previousContent) return;
  const rows = await getPageBodyContributions(ctx, args.page._id, args.bodyId);
  const authored = rows.find(
    (row) =>
      row.attribution === "author" &&
      row.authorProfileId === args.actorProfileId,
  );
  if (authored !== undefined) {
    await ctx.db.patch("contentContributions", authored._id, {
      content: args.content,
      updatedAt: args.now,
    });
    return;
  }
  if (rows.length === 0 && !args.previousContent.trim()) {
    await insertContribution(ctx, {
      workspaceId: args.page.workspaceId,
      targetKind: "page",
      targetId: args.page._id,
      authorProfileId: args.actorProfileId,
      content: args.content,
      sourceKind: "page_body",
      sourceId: args.page._id,
      createdAt: args.now,
    });
  }
}

/** Snimak stranice za Istoriju; instrukcije samo za zadatke. */
export function pageSnapshot(
  page: Pick<Doc<"pages">, "kind">,
  title: string,
  content: string,
  instructions: string | undefined,
): RevisionSnapshot {
  return page.kind === "task"
    ? { title, content, instructions: instructions ?? null }
    : { title, content };
}

export async function recordPageRevision(
  ctx: MutationCtx,
  args: {
    page: Doc<"pages">;
    before: RevisionSnapshot;
    after: RevisionSnapshot;
    actorProfileId: Id<"profiles">;
    now: number;
    revision: number;
  },
) {
  return await recordRevision(ctx, {
    workspaceId: args.page.workspaceId,
    target: { kind: "page", id: args.page._id },
    before: args.before,
    after: args.after,
    baseline: pageBaseline(args.page),
    actorProfileId: args.actorProfileId,
    now: args.now,
    targetRevision: args.revision,
  });
}

/**
 * Upisuje naslov, telo i (za zadatak) instrukcije. Podiže `revision` tačno
 * jednom, ažurira pretragu, pregled kartice, telo, mirror i Istoriju.
 * Vraća `changed: false` kad nema razlike (ništa se ne upisuje).
 */
export async function writePageContent(
  ctx: MutationCtx,
  args: {
    page: Doc<"pages">;
    actorProfileId: Id<"profiles">;
    now: number;
    title: string;
    content: string;
    /** `undefined` = instrukcije se ne menjaju. */
    instructions?: string | null;
    /** „Vrati ovu verziju": upisuje `restore` reviziju umesto obične izmene. */
    restoredFromId?: Id<"contentRevisions">;
  },
): Promise<{ changed: boolean; revision: number }> {
  const { page, now } = args;
  const body = await getPageBody(ctx, page._id);
  const currentContent = body?.content ?? "";
  const nextInstructions =
    page.kind === "task" && args.instructions !== undefined
      ? (args.instructions ?? undefined)
      : page.instructions;
  if (
    args.title === page.title &&
    args.content === currentContent &&
    nextInstructions === page.instructions
  ) {
    return { changed: false, revision: page.revision };
  }
  const revision = page.revision + 1;
  await ctx.db.patch("pages", page._id, {
    title: args.title,
    searchText: pageSearchText(args.title, args.content),
    canvasPreview: workspaceCanvasPreview(
      args.title,
      args.content,
      nextInstructions,
    ),
    ...(page.kind === "task" && args.instructions !== undefined
      ? { instructions: nextInstructions }
      : {}),
    revision,
    taskSortAt: pageTaskSortAt(page.dueDate, now),
    updatedByProfileId: args.actorProfileId,
    updatedAt: now,
  });
  if (body === null) {
    await ctx.db.insert("pageBodies", {
      pageId: page._id,
      content: args.content,
      updatedAt: now,
    });
  } else if (args.content !== currentContent) {
    await ctx.db.patch("pageBodies", body._id, {
      content: args.content,
      updatedAt: now,
    });
  }
  await syncPageBodyMirror(ctx, {
    page,
    bodyId: body?._id ?? null,
    previousContent: currentContent,
    content: args.content,
    actorProfileId: args.actorProfileId,
    now,
  });
  const after = pageSnapshot(page, args.title, args.content, nextInstructions);
  if (args.restoredFromId !== undefined) {
    await insertRestoreRevision(ctx, {
      workspaceId: page.workspaceId,
      target: { kind: "page", id: page._id },
      snapshot: after,
      actorProfileId: args.actorProfileId,
      now,
      restoredFromId: args.restoredFromId,
      targetRevision: revision,
    });
  } else {
    await recordPageRevision(ctx, {
      page,
      before: pageSnapshot(page, page.title, currentContent, page.instructions),
      after,
      actorProfileId: args.actorProfileId,
      now,
      revision,
    });
  }
  return { changed: true, revision };
}
