import { internalMutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireMembership } from "./lib/auth";

/**
 * ============================================================================
 * PER-ROUTE HOURLY CEILING FOR THE PUBLIC HTTP ROUTES (R1/2c, 2d)
 * ============================================================================
 *
 * `/ig-media/` and `/r/` are public and unauthenticated, and each drives a write
 * the caller never pays for — an outbound Graph call, or an `orLinkClicks`
 * insert. A fixed hourly window per (workspace, route) caps how many an hour of
 * traffic may start; over the ceiling the route stops the outbound work and
 * `cappedAt` is stamped so Settings can say it happened.
 *
 * The counter itself is written at most `limit`+1 times per window: once the
 * count reaches the ceiling the write stops, so a flood cannot turn this row
 * into the storm it exists to prevent.
 * ============================================================================
 */

/** How long one window lasts. */
export const ROUTE_WINDOW_MS = 60 * 60 * 1000;

/** Outbound Graph calls `/ig-media/` may start per workspace per hour. */
export const IG_MEDIA_HOURLY_CAP = 60;

/** Click writes `/r/` may make per workspace per hour. */
export const R_HOURLY_CAP = 60;

/**
 * Claim one call against a route's hourly budget. Returns `true` when it is
 * within the ceiling (and counts it), `false` when the ceiling is reached.
 *
 * A plain function, not just a mutation, because `orLinks.registerClick` is
 * itself a mutation and cannot call one — it uses this directly, while the
 * `/ig-media/` HTTP action reaches it through the `claimRouteCall` wrapper.
 */
export async function claimPublicRouteCall(
  ctx: MutationCtx,
  args: {
    workspaceId: Id<"workspaces">;
    route: string;
    limit: number;
    windowMs: number;
  },
): Promise<boolean> {
  const { workspaceId, route, limit, windowMs } = args;
  const now = Date.now();

  const row = await ctx.db
    .query("publicRouteUsage")
    .withIndex("by_workspace_route", (q) =>
      q.eq("workspaceId", workspaceId).eq("route", route),
    )
    .unique();

  if (row === null) {
    await ctx.db.insert("publicRouteUsage", {
      workspaceId,
      route,
      windowStartedAt: now,
      count: 1,
    });
    return true;
  }

  // A new window: reset and count this one.
  if (now - row.windowStartedAt >= windowMs) {
    await ctx.db.patch(row._id, {
      windowStartedAt: now,
      count: 1,
      cappedAt: undefined,
    });
    return true;
  }

  // At the ceiling: refuse, and stamp `cappedAt` ONCE so the flood does not keep
  // writing this row (R1/2c).
  if (row.count >= limit) {
    if (row.cappedAt === undefined) {
      await ctx.db.patch(row._id, { cappedAt: now });
    }
    return false;
  }

  await ctx.db.patch(row._id, { count: row.count + 1 });
  return true;
}

/** The `/ig-media/` HTTP action's way in — mutations, not actions, may write. */
export const claimRouteCall = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    route: v.string(),
    limit: v.number(),
    windowMs: v.number(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => claimPublicRouteCall(ctx, args),
});

/**
 * When each public route last hit its ceiling, for the Settings card (R1/2c,2d).
 * Only rows whose cap was tripped inside the current window are worth showing.
 */
export const routeUsageStatus = query({
  args: {},
  returns: v.array(
    v.object({
      route: v.string(),
      cappedAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const { workspaceId } = await requireMembership(ctx);
    const now = Date.now();
    const rows = await ctx.db
      .query("publicRouteUsage")
      .withIndex("by_workspace_route", (q) => q.eq("workspaceId", workspaceId))
      .collect();

    return rows
      .filter(
        (row) =>
          row.cappedAt !== undefined &&
          now - row.windowStartedAt < ROUTE_WINDOW_MS,
      )
      .map((row) => ({ route: row.route, cappedAt: row.cappedAt as number }));
  },
});
