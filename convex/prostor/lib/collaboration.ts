// Preneto iz Devotion packages/backend/convex/lib/collaboration.ts (main @ c05c40f), SPAJANJE S03.
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";

export function contributionTargetKey(
  kind: "idea" | "page" | "area" | "task_checkpoint" | "recovered",
  id: string,
) {
  return `${kind}:${id}`;
}

export async function insertContribution(
  ctx: MutationCtx,
  value: {
    workspaceId: Id<"workspaces">;
    targetKind:
      | "idea"
      | "page"
      | "area"
      | "task_checkpoint"
      | "recovered";
    targetId: string;
    authorProfileId?: Id<"profiles">;
    attribution?: "author" | "legacy_neutral";
    content: string;
    sourceKind?: "idea_original" | "page_entry" | "page_body";
    sourceId?: string;
    moderationStatus?: "pending" | "approved" | "rejected";
    /** Komentar: pomenuti aktivni članovi (već filtrirani, ≤ 20). */
    mentionProfileIds?: Array<Id<"profiles">>;
    createdAt?: number;
  },
) {
  const now = Date.now();
  return await ctx.db.insert("contentContributions", {
    workspaceId: value.workspaceId,
    targetKind: value.targetKind,
    targetKey: contributionTargetKey(value.targetKind, value.targetId),
    targetId: value.targetId,
    authorProfileId: value.authorProfileId,
    attribution: value.attribution ?? "author",
    content: value.content,
    sourceKind: value.sourceKind,
    sourceId: value.sourceId,
    moderationStatus: value.moderationStatus,
    mentionProfileIds:
      value.mentionProfileIds === undefined ||
      value.mentionProfileIds.length === 0
        ? undefined
        : value.mentionProfileIds,
    archivedAt: null,
    createdAt: value.createdAt ?? now,
    updatedAt: now,
  });
}

export async function detachIdeaChildren(
  ctx: MutationCtx,
  parentId: Id<"ideaNodes">,
  now: number,
) {
  const parent = await ctx.db.get("ideaNodes", parentId);
  if (parent === null) return;
  const children = await ctx.db
    .query("ideaNodes")
    .withIndex("by_parentIdeaId_and_archivedAt", (q) =>
      q.eq("parentIdeaId", parentId).eq("archivedAt", null),
    )
    .take(200);
  for (const child of children) {
    await ctx.db.patch("ideaNodes", child._id, {
      parentIdeaId: parent.parentIdeaId,
      x: child.x + parent.x,
      y: child.y + parent.y,
      updatedAt: now,
    });
  }
}
