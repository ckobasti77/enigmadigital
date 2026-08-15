import { query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

/**
 * The signed-in user together with their workspace + role.
 * Powers the workspace context available to every page in the app shell.
 * Returns `null` when unauthenticated.
 */
export const currentContext = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;

    const user = await ctx.db.get(userId);

    const membership = await ctx.db
      .query("members")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    const workspace = membership
      ? await ctx.db.get(membership.workspaceId)
      : null;

    return {
      user: user
        ? { id: user._id, email: user.email ?? null, name: user.name ?? null }
        : null,
      workspace: workspace
        ? { id: workspace._id, name: workspace.name, slug: workspace.slug }
        : null,
      role: membership?.role ?? null,
    };
  },
});
