// Preneto iz Devotion packages/backend/convex/lib/activity.ts (main @ c05c40f), SPAJANJE S02.
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";

/** Radnje i ciljevi aktivnosti — jedini izvor je `activities` u `schema.ts`. */
export type ActivityAction = Doc<"activities">["action"];
export type ActivityTargetType = Doc<"activities">["targetType"];

export async function recordActivity(
  ctx: MutationCtx,
  value: {
    workspaceId: Id<"workspaces">;
    actorProfileId: Id<"profiles">;
    action: ActivityAction;
    targetType: ActivityTargetType;
    targetId: string;
    title: string;
    detail?: string;
  },
) {
  return await ctx.db.insert("activities", {
    ...value,
    createdAt: Date.now(),
  });
}
