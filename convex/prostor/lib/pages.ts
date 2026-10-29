// Preneto iz Devotion packages/backend/convex/lib/pages.ts (main @ c05c40f), SPAJANJE S02.
import { ConvexError } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";

type ReadCtx = QueryCtx | MutationCtx;

// ConvexError (ne obična greška): produkcija tekst obične greške krije iza „Server Error",
// pa klijent ne bi razlikovao „obrisano" od prekida veze (K22).
function pageNotFound() {
  return new ConvexError({ code: "NEMA_DOZVOLU", message: "Stranica nije pronađena." });
}

export async function requireVisiblePage(ctx: ReadCtx, pageId: Id<"pages">) {
  const page = await ctx.db.get("pages", pageId);
  if (page === null || page.archivedAt !== null) throw pageNotFound();

  let parentPageId = page.parentPageId;
  for (let depth = 0; parentPageId !== null && depth < 64; depth += 1) {
    const parent = await ctx.db.get("pages", parentPageId);
    if (
      parent === null ||
      parent.archivedAt !== null ||
      parent.workspaceId !== page.workspaceId ||
      parent.areaId !== page.areaId
    ) {
      throw pageNotFound();
    }
    parentPageId = parent.parentPageId;
    if (depth === 63 && parentPageId !== null) {
      throw new Error("Hijerarhija stranica je preduboka.");
    }
  }
  return page;
}

export async function isPageVisible(ctx: ReadCtx, pageId: Id<"pages">) {
  try {
    await requireVisiblePage(ctx, pageId);
    return true;
  } catch {
    return false;
  }
}

export async function getActivePageDescendants(
  ctx: ReadCtx,
  pageId: Id<"pages">,
) {
  const descendants: Doc<"pages">[] = [];
  const queue: Id<"pages">[] = [pageId];
  const visited = new Set<string>([pageId]);

  for (let index = 0; index < queue.length; index += 1) {
    const children = await ctx.db
      .query("pages")
      .withIndex("by_parentPageId_and_archivedAt", (q) =>
        q.eq("parentPageId", queue[index]).eq("archivedAt", null),
      )
      .take(251);
    if (descendants.length + children.length > 250) {
      throw new Error("Ova grana ima više od 250 stranica. Podelite je pre ove radnje.");
    }
    for (const child of children) {
      if (visited.has(child._id)) throw new Error("Hijerarhija stranica sadrži kružnu vezu.");
      visited.add(child._id);
      descendants.push(child);
      queue.push(child._id);
    }
  }
  return descendants;
}

export function summarizePage(page: Doc<"pages">) {
  return {
    _id: page._id,
    _creationTime: page._creationTime,
    workspaceId: page.workspaceId,
    areaId: page.areaId,
    parentPageId: page.parentPageId,
    kind: page.kind,
    title: page.title,
    searchText: "",
    revision: page.revision,
    position: page.position,
    taskStatus: page.taskStatus,
    taskPriority: page.taskPriority,
    assigneeProfileId: page.assigneeProfileId,
    dueDate: page.dueDate,
    instructions: page.instructions,
    checkpoints: page.checkpoints,
    checkpointTotal: page.checkpointTotal,
    checkpointCompleted: page.checkpointCompleted,
    checkpointRevision: page.checkpointRevision,
    taskSortAt: page.taskSortAt,
    completedAt: page.completedAt,
    createdByProfileId: page.createdByProfileId,
    updatedByProfileId: page.updatedByProfileId,
    lockedAt: page.lockedAt ?? null,
    archivedAt: page.archivedAt,
    createdAt: page.createdAt,
    updatedAt: page.updatedAt,
  };
}

export function pageSearchText(title: string, content: string) {
  return `${title}\n${content}`.slice(0, 16_000);
}

/**
 * Denormalizovan tekst za full-text pretragu čvorova ideja i misli. Naslov im je
 * `string | null`, pa se null tretira kao prazan. Isti izvor istine mora da se
 * koristi i na upisu (ideas/thoughts mutacije) i u backfill migraciji, da indeks
 * i podaci nikad ne razlaze. Paralela `pageSearchText` za `pages`.
 */
export function nodeSearchText(title: string | null, text: string) {
  return `${title ?? ""}\n${text}`.slice(0, 16_000);
}

export function pageTaskSortAt(dueDate: number | null, updatedAt: number) {
  return dueDate ?? 8_000_000_000_000_000 - updatedAt;
}

/**
 * Kada je zadatak završen. Za zapise od pre uvođenja `completedAt` pada na
 * `updatedAt`, pa Puls daje ispravne brojeve i pre nego što backfill prođe.
 */
export function taskCompletedAt(page: Doc<"pages">) {
  if (page.taskStatus !== "done") return null;
  return page.completedAt ?? page.updatedAt;
}

/**
 * Nova vrednost `completedAt` pri promeni statusa: ulazak u „Gotovo” je pečat
 * vremena, izlazak ga briše, a izmena već završenog zadatka ga ne pomera.
 */
export function nextCompletedAt(
  page: Doc<"pages">,
  nextTaskStatus: Doc<"pages">["taskStatus"],
  now: number,
) {
  if (nextTaskStatus !== "done") return null;
  if (page.taskStatus === "done") return page.completedAt ?? page.updatedAt;
  return now;
}
