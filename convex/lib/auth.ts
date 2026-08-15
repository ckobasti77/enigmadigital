import { ConvexError } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export type Membership = {
  userId: Id<"users">;
  workspaceId: Id<"workspaces">;
  role: "owner" | "client_viewer";
};

/**
 * Resolve the signed-in user's workspace membership, or throw. Use in every
 * write / privileged read (`connections`, `sync`). Reads return `null` on
 * unauth (see `workspaces.currentContext`), but a mutation can't silently
 * no-op, so we throw a `ConvexError` the client can branch on.
 *
 * Accepts a `MutationCtx` too (it's structurally assignable to `QueryCtx`).
 */
export async function requireMembership(ctx: QueryCtx): Promise<Membership> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    throw new ConvexError({ code: "unauthorized" });
  }
  const membership = await ctx.db
    .query("members")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  if (membership === null) {
    throw new ConvexError({ code: "forbidden" });
  }
  return {
    userId,
    workspaceId: membership.workspaceId,
    role: membership.role,
  };
}
