// Preneto iz Devotion packages/backend/convex/lib/page_relations.ts (main @ c05c40f), SPAJANJE S03.
import type { Doc, Id } from "../../_generated/dataModel";

/**
 * Endpointi relacije, sa fallback-om na stari `notePageId`/`taskPageId` par.
 * Redovi upisani pre generalizacije nemaju `pageAId`/`pageBId` sve dok migracija
 * ne prođe; čitanje mora da radi i pre nje.
 */
export function relationEndpoints(relation: Doc<"pageRelations">): {
  pageAId: Id<"pages">;
  pageBId: Id<"pages">;
} {
  return {
    pageAId: relation.pageAId ?? relation.notePageId,
    pageBId: relation.pageBId ?? relation.taskPageId,
  };
}

/** Druga strana relacije gledano iz zadate stranice; `null` ako nije endpoint. */
export function relationOtherEndpoint(
  relation: Doc<"pageRelations">,
  pageId: Id<"pages">,
): Id<"pages"> | null {
  const { pageAId, pageBId } = relationEndpoints(relation);
  if (pageAId === pageId) return pageBId;
  if (pageBId === pageId) return pageAId;
  return null;
}

export function relationTouchesPage(
  relation: Doc<"pageRelations">,
  pageId: Id<"pages">,
) {
  const { pageAId, pageBId } = relationEndpoints(relation);
  return pageAId === pageId || pageBId === pageId;
}
