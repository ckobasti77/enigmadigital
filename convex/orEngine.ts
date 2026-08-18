import { query, mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { requireMembership } from "./lib/auth";
import { encryptCredentials } from "./lib/crypto";

/**
 * OpenReply Native Engine Status & Configuration (PLAN.md §4 / Step 1).
 */

export const status = query({
  args: {},
  returns: v.object({
    enabled: v.boolean(),
    webhookUrl: v.union(v.string(), v.null()),
    verifyTokenSet: v.boolean(),
    appSecretSet: v.boolean(),
    igConnected: v.boolean(),
    igProfessionalIdSet: v.boolean(),
  }),
  handler: async (ctx) => {
    const { workspaceId } = await requireMembership(ctx);

    const orConn = await ctx.db
      .query("connections")
      .withIndex("by_workspace_provider", (q) =>
        q.eq("workspaceId", workspaceId).eq("provider", "openreply"),
      )
      .first();
    const enabled = orConn !== null && orConn.status === "active";

    const igConn = await ctx.db
      .query("connections")
      .withIndex("by_workspace_provider", (q) =>
        q.eq("workspaceId", workspaceId).eq("provider", "meta_ig"),
      )
      .first();
    const igConnected = igConn !== null;
    const igProfessionalIdSet =
      igConn !== null &&
      typeof igConn.externalIdAlt === "string" &&
      igConn.externalIdAlt.trim().length > 0;

    const webhookUrl = process.env.CONVEX_SITE_URL
      ? `${process.env.CONVEX_SITE_URL}/instagram/webhook`
      : null;

    const verifyTokenSet = Boolean(
      process.env.IG_WEBHOOK_VERIFY_TOKEN?.trim(),
    );

    const appSecretSet = Boolean(
      process.env.META_APP_SECRET?.trim() ||
        process.env.INSTAGRAM_APP_SECRET?.trim(),
    );

    return {
      enabled,
      webhookUrl,
      verifyTokenSet,
      appSecretSet,
      igConnected,
      igProfessionalIdSet,
    };
  },
});

export const enable = mutation({
  args: {},
  returns: v.id("connections"),
  handler: async (ctx) => {
    const { workspaceId } = await requireMembership(ctx);

    const igConn = await ctx.db
      .query("connections")
      .withIndex("by_workspace_provider", (q) =>
        q.eq("workspaceId", workspaceId).eq("provider", "meta_ig"),
      )
      .first();

    if (igConn === null) {
      throw new ConvexError({
        code: "invalid",
        message: "Prvo poveži Instagram nalog.",
      });
    }

    const existing = await ctx.db
      .query("connections")
      .withIndex("by_workspace_provider", (q) =>
        q.eq("workspaceId", workspaceId).eq("provider", "openreply"),
      )
      .first();

    if (existing !== null) {
      await ctx.db.patch(existing._id, { status: "active" });
      return existing._id;
    }

    const encryptedCredentials = await encryptCredentials("native-engine");
    return await ctx.db.insert("connections", {
      workspaceId,
      provider: "openreply",
      status: "active",
      encryptedCredentials,
    });
  },
});

export const disable = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const { workspaceId } = await requireMembership(ctx);

    const existing = await ctx.db
      .query("connections")
      .withIndex("by_workspace_provider", (q) =>
        q.eq("workspaceId", workspaceId).eq("provider", "openreply"),
      )
      .first();

    if (existing !== null) {
      await ctx.db.delete(existing._id);
    }

    return null;
  },
});
