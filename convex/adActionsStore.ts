import {
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireMembership } from "./lib/auth";

export const actionTypeValidator = v.union(
  v.literal("pause"),
  v.literal("resume"),
  v.literal("budget_change"),
  v.literal("duplicate"),
);

export const targetTypeValidator = v.union(
  v.literal("campaign"),
  v.literal("adset"),
  v.literal("ad"),
);

export const actionStatusValidator = v.union(
  v.literal("pending"),
  v.literal("success"),
  v.literal("error"),
  v.literal("blocked"),
);

export const resolveUserWorkspace = internalQuery({
  args: {
    userId: v.id("users"),
    explicitWorkspaceId: v.optional(v.id("workspaces")),
  },
  handler: async (ctx, args) => {
    if (args.explicitWorkspaceId) {
      const membership = await ctx.db
        .query("members")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .filter((q) => q.eq(q.field("workspaceId"), args.explicitWorkspaceId))
        .first();
      if (!membership) {
        throw new ConvexError({
          code: "forbidden",
          message: "Nemate pristup navedenom radnom prostoru.",
        });
      }
      return { workspaceId: args.explicitWorkspaceId };
    }

    const membership = await ctx.db
      .query("members")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    if (!membership) {
      throw new ConvexError({
        code: "forbidden",
        message: "Nemate dodeljen radni prostor.",
      });
    }

    return { workspaceId: membership.workspaceId };
  },
});

export const getMetaConnectionForWorkspace = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    const conn = await ctx.db
      .query("connections")
      .withIndex("by_workspace_provider", (q) =>
        q.eq("workspaceId", workspaceId).eq("provider", "meta_ads"),
      )
      .first();

    if (!conn) return null;
    return {
      _id: conn._id,
      encryptedCredentials: conn.encryptedCredentials,
      status: conn.status,
      externalId: conn.externalId,
    };
  },
});

// ── Target Information for Confirmation & Guardrails ─────────────────────────

export const getTargetForAction = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    targetType: targetTypeValidator,
    targetId: v.string(), // externalId
  },
  handler: async (ctx, args) => {
    let name = "";
    let status = "";
    let dailyBudget: number | undefined;
    let currency = "";
    let internalId: string | undefined;

    // Today's date string YYYY-MM-DD
    const today = new Date().toISOString().slice(0, 10);
    let spendToday = 0;

    if (args.targetType === "campaign") {
      const campaign = await ctx.db
        .query("adCampaigns")
        .withIndex("by_workspace_external", (q) =>
          q.eq("workspaceId", args.workspaceId).eq("externalId", args.targetId),
        )
        .first();

      if (!campaign) {
        throw new ConvexError({
          code: "not_found",
          message: `Kampanja sa ID ${args.targetId} nije pronađena u bazi.`,
        });
      }

      name = campaign.name;
      status = campaign.status;
      dailyBudget = campaign.dailyBudget;
      internalId = campaign._id;

      // Get account currency
      const account = await ctx.db.get(campaign.accountId);
      if (account) currency = account.currency;

      // Calculate spend today across all ads in this campaign
      const adSets = await ctx.db
        .query("adSets")
        .withIndex("by_workspace_campaign", (q) =>
          q.eq("workspaceId", args.workspaceId).eq("campaignId", campaign._id),
        )
        .collect();

      const adSetIds = new Set(adSets.map((s) => s._id));
      for (const setId of adSetIds) {
        const ads = await ctx.db
          .query("ads")
          .withIndex("by_workspace_adset", (q) =>
            q.eq("workspaceId", args.workspaceId).eq("adSetId", setId),
          )
          .collect();

        for (const ad of ads) {
          const insights = await ctx.db
            .query("adInsights")
            .withIndex("by_ad_date", (q) =>
              q.eq("adId", ad._id).eq("date", today),
            )
            .collect();

          for (const ins of insights) {
            if (ins.breakdownHash === "none") {
              spendToday += ins.spend;
            }
          }
        }
      }
    } else if (args.targetType === "adset") {
      const adSet = await ctx.db
        .query("adSets")
        .withIndex("by_workspace_external", (q) =>
          q.eq("workspaceId", args.workspaceId).eq("externalId", args.targetId),
        )
        .first();

      if (!adSet) {
        throw new ConvexError({
          code: "not_found",
          message: `Ad Set sa ID ${args.targetId} nije pronađen u bazi.`,
        });
      }

      name = adSet.name;
      status = adSet.status;
      dailyBudget = adSet.dailyBudget;
      internalId = adSet._id;

      const campaign = await ctx.db.get(adSet.campaignId);
      if (campaign) {
        const account = await ctx.db.get(campaign.accountId);
        if (account) currency = account.currency;
      }

      const ads = await ctx.db
        .query("ads")
        .withIndex("by_workspace_adset", (q) =>
          q.eq("workspaceId", args.workspaceId).eq("adSetId", adSet._id),
        )
        .collect();

      for (const ad of ads) {
        const insights = await ctx.db
          .query("adInsights")
          .withIndex("by_ad_date", (q) =>
            q.eq("adId", ad._id).eq("date", today),
          )
          .collect();

        for (const ins of insights) {
          if (ins.breakdownHash === "none") {
            spendToday += ins.spend;
          }
        }
      }
    } else if (args.targetType === "ad") {
      const ad = await ctx.db
        .query("ads")
        .withIndex("by_workspace_external", (q) =>
          q.eq("workspaceId", args.workspaceId).eq("externalId", args.targetId),
        )
        .first();

      if (!ad) {
        throw new ConvexError({
          code: "not_found",
          message: `Oglas sa ID ${args.targetId} nije pronađen u bazi.`,
        });
      }

      name = ad.name;
      status = ad.status;
      internalId = ad._id;

      const adSet = await ctx.db.get(ad.adSetId);
      if (adSet) {
        dailyBudget = adSet.dailyBudget;
        const campaign = await ctx.db.get(adSet.campaignId);
        if (campaign) {
          const account = await ctx.db.get(campaign.accountId);
          if (account) currency = account.currency;
        }
      }

      const insights = await ctx.db
        .query("adInsights")
        .withIndex("by_ad_date", (q) =>
          q.eq("adId", ad._id).eq("date", today),
        )
        .collect();

      for (const ins of insights) {
        if (ins.breakdownHash === "none") {
          spendToday += ins.spend;
        }
      }
    }

    return {
      targetType: args.targetType,
      targetId: args.targetId,
      name,
      status,
      dailyBudget,
      currency,
      spendToday: Math.round(spendToday * 100) / 100,
      internalId,
    };
  },
});

// Client query for dialog context
export const getTargetContext = query({
  args: {
    targetType: targetTypeValidator,
    targetId: v.string(),
  },
  handler: async (ctx, args) => {
    const { workspaceId } = await requireMembership(ctx);
    // Reuse internal query logic
    const today = new Date().toISOString().slice(0, 10);
    let name = "";
    let status = "";
    let dailyBudget: number | undefined;
    let currency = "";
    let spendToday = 0;

    if (args.targetType === "campaign") {
      const campaign = await ctx.db
        .query("adCampaigns")
        .withIndex("by_workspace_external", (q) =>
          q.eq("workspaceId", workspaceId).eq("externalId", args.targetId),
        )
        .first();

      if (campaign) {
        name = campaign.name;
        status = campaign.status;
        dailyBudget = campaign.dailyBudget;
        const account = await ctx.db.get(campaign.accountId);
        if (account) currency = account.currency;

        const adSets = await ctx.db
          .query("adSets")
          .withIndex("by_workspace_campaign", (q) =>
            q.eq("workspaceId", workspaceId).eq("campaignId", campaign._id),
          )
          .collect();

        for (const set of adSets) {
          const ads = await ctx.db
            .query("ads")
            .withIndex("by_workspace_adset", (q) =>
              q.eq("workspaceId", workspaceId).eq("adSetId", set._id),
            )
            .collect();

          for (const ad of ads) {
            const insights = await ctx.db
              .query("adInsights")
              .withIndex("by_ad_date", (q) =>
                q.eq("adId", ad._id).eq("date", today),
              )
              .collect();

            for (const ins of insights) {
              if (ins.breakdownHash === "none") {
                spendToday += ins.spend;
              }
            }
          }
        }
      }
    } else if (args.targetType === "adset") {
      const adSet = await ctx.db
        .query("adSets")
        .withIndex("by_workspace_external", (q) =>
          q.eq("workspaceId", workspaceId).eq("externalId", args.targetId),
        )
        .first();

      if (adSet) {
        name = adSet.name;
        status = adSet.status;
        dailyBudget = adSet.dailyBudget;
        const campaign = await ctx.db.get(adSet.campaignId);
        if (campaign) {
          const account = await ctx.db.get(campaign.accountId);
          if (account) currency = account.currency;
        }

        const ads = await ctx.db
          .query("ads")
          .withIndex("by_workspace_adset", (q) =>
            q.eq("workspaceId", workspaceId).eq("adSetId", adSet._id),
          )
          .collect();

        for (const ad of ads) {
          const insights = await ctx.db
            .query("adInsights")
            .withIndex("by_ad_date", (q) =>
              q.eq("adId", ad._id).eq("date", today),
            )
            .collect();

          for (const ins of insights) {
            if (ins.breakdownHash === "none") {
              spendToday += ins.spend;
            }
          }
        }
      }
    } else if (args.targetType === "ad") {
      const ad = await ctx.db
        .query("ads")
        .withIndex("by_workspace_external", (q) =>
          q.eq("workspaceId", workspaceId).eq("externalId", args.targetId),
        )
        .first();

      if (ad) {
        name = ad.name;
        status = ad.status;
        const adSet = await ctx.db.get(ad.adSetId);
        if (adSet) {
          dailyBudget = adSet.dailyBudget;
          const campaign = await ctx.db.get(adSet.campaignId);
          if (campaign) {
            const account = await ctx.db.get(campaign.accountId);
            if (account) currency = account.currency;
          }
        }

        const insights = await ctx.db
          .query("adInsights")
          .withIndex("by_ad_date", (q) =>
            q.eq("adId", ad._id).eq("date", today),
          )
          .collect();

        for (const ins of insights) {
          if (ins.breakdownHash === "none") {
            spendToday += ins.spend;
          }
        }
      }
    }

    return {
      targetType: args.targetType,
      targetId: args.targetId,
      name: name || args.targetId,
      status: status || "UNKNOWN",
      dailyBudget,
      currency,
      spendToday: Math.round(spendToday * 100) / 100,
    };
  },
});

// ── Pending Action with Idempotency Check ────────────────────────────────────

export const recordPendingAction = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    userId: v.optional(v.id("users")),
    targetType: targetTypeValidator,
    targetId: v.string(),
    targetName: v.optional(v.string()),
    action: actionTypeValidator,
    params: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // 1. Idempotency Check: Refuse duplicate pending action for this target & action
    const existingPending = await ctx.db
      .query("adActions")
      .withIndex("by_workspace_target_status", (q) =>
        q
          .eq("workspaceId", args.workspaceId)
          .eq("targetType", args.targetType)
          .eq("targetId", args.targetId)
          .eq("status", "pending"),
      )
      .first();

    if (existingPending !== null) {
      // Check if pending action is still fresh (< 5 min old)
      const isFresh = Date.now() - existingPending.executedAt < 5 * 60 * 1000;
      if (isFresh && existingPending.action === args.action) {
        throw new ConvexError({
          code: "conflict",
          message:
            "Identična akcija za ovaj objekat je već u toku (status: na čekanju). Molimo sačekajte završetak.",
        });
      }
    }

    // 2. Insert new pending action row
    const actionId = await ctx.db.insert("adActions", {
      workspaceId: args.workspaceId,
      userId: args.userId,
      targetType: args.targetType,
      targetId: args.targetId,
      targetName: args.targetName,
      action: args.action,
      status: "pending",
      params: args.params,
      executedAt: Date.now(),
    });

    return actionId;
  },
});

// ── Complete Action (Success) ────────────────────────────────────────────────

export const completeAction = internalMutation({
  args: {
    actionId: v.id("adActions"),
    apiResponse: v.optional(v.string()),
    // Optional local updates
    newStatus: v.optional(v.string()),
    newDailyBudget: v.optional(v.number()),
    createdAd: v.optional(
      v.object({
        externalId: v.string(),
        name: v.string(),
        status: v.string(),
        adSetId: v.id("adSets"),
        creativeId: v.optional(v.string()),
        thumbnailUrl: v.optional(v.string()),
        previewUrl: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const action = await ctx.db.get(args.actionId);
    if (!action) return;

    // 1. Update adActions record
    await ctx.db.patch(args.actionId, {
      status: "success",
      apiResponse: args.apiResponse ?? JSON.stringify({ success: true }),
    });

    // 2. Optimistically / locally update target table
    if (args.newStatus) {
      const normalizedStatus = args.newStatus.toUpperCase();
      if (action.targetType === "campaign") {
        const campaign = await ctx.db
          .query("adCampaigns")
          .withIndex("by_workspace_external", (q) =>
            q
              .eq("workspaceId", action.workspaceId)
              .eq("externalId", action.targetId),
          )
          .first();
        if (campaign) {
          await ctx.db.patch(campaign._id, {
            status: normalizedStatus,
            syncedAt: Date.now(),
          });
        }
      } else if (action.targetType === "adset") {
        const adSet = await ctx.db
          .query("adSets")
          .withIndex("by_workspace_external", (q) =>
            q
              .eq("workspaceId", action.workspaceId)
              .eq("externalId", action.targetId),
          )
          .first();
        if (adSet) {
          await ctx.db.patch(adSet._id, {
            status: normalizedStatus,
            syncedAt: Date.now(),
          });
        }
      } else if (action.targetType === "ad") {
        const ad = await ctx.db
          .query("ads")
          .withIndex("by_workspace_external", (q) =>
            q
              .eq("workspaceId", action.workspaceId)
              .eq("externalId", action.targetId),
          )
          .first();
        if (ad) {
          await ctx.db.patch(ad._id, {
            status: normalizedStatus,
            syncedAt: Date.now(),
          });
        }
      }
    }

    if (args.newDailyBudget !== undefined) {
      if (action.targetType === "campaign") {
        const campaign = await ctx.db
          .query("adCampaigns")
          .withIndex("by_workspace_external", (q) =>
            q
              .eq("workspaceId", action.workspaceId)
              .eq("externalId", action.targetId),
          )
          .first();
        if (campaign) {
          await ctx.db.patch(campaign._id, {
            dailyBudget: args.newDailyBudget,
            syncedAt: Date.now(),
          });
        }
      } else if (action.targetType === "adset") {
        const adSet = await ctx.db
          .query("adSets")
          .withIndex("by_workspace_external", (q) =>
            q
              .eq("workspaceId", action.workspaceId)
              .eq("externalId", action.targetId),
          )
          .first();
        if (adSet) {
          await ctx.db.patch(adSet._id, {
            dailyBudget: args.newDailyBudget,
            syncedAt: Date.now(),
          });
        }
      }
    }

    if (args.createdAd) {
      const existing = await ctx.db
        .query("ads")
        .withIndex("by_workspace_external", (q) =>
          q
            .eq("workspaceId", action.workspaceId)
            .eq("externalId", args.createdAd!.externalId),
        )
        .first();

      if (!existing) {
        await ctx.db.insert("ads", {
          workspaceId: action.workspaceId,
          adSetId: args.createdAd.adSetId,
          externalId: args.createdAd.externalId,
          name: args.createdAd.name,
          status: args.createdAd.status,
          creativeId: args.createdAd.creativeId,
          thumbnailUrl: args.createdAd.thumbnailUrl,
          previewUrl: args.createdAd.previewUrl,
          syncedAt: Date.now(),
        });
      }
    }
  },
});

// ── Fail Action (Error) ──────────────────────────────────────────────────────

export const failAction = internalMutation({
  args: {
    actionId: v.id("adActions"),
    error: v.string(),
    apiResponse: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const action = await ctx.db.get(args.actionId);
    if (!action) return;

    await ctx.db.patch(args.actionId, {
      status: "error",
      error: args.error,
      apiResponse:
        args.apiResponse ?? JSON.stringify({ error: args.error }),
    });
  },
});

// ── Audit Trail Queries ──────────────────────────────────────────────────────

const auditActionRowValidator = v.object({
  _id: v.id("adActions"),
  _creationTime: v.number(),
  targetType: targetTypeValidator,
  targetId: v.string(),
  targetName: v.union(v.string(), v.null()),
  action: actionTypeValidator,
  status: actionStatusValidator,
  params: v.union(v.string(), v.null()),
  executedAt: v.number(),
  apiResponse: v.union(v.string(), v.null()),
  error: v.union(v.string(), v.null()),
  user: v.union(
    v.object({
      id: v.id("users"),
      name: v.union(v.string(), v.null()),
      email: v.union(v.string(), v.null()),
    }),
    v.null(),
  ),
});

export const listActions = query({
  args: {
    targetType: v.optional(
      v.union(
        v.literal("all"),
        v.literal("campaign"),
        v.literal("adset"),
        v.literal("ad"),
      ),
    ),
    status: v.optional(
      v.union(
        v.literal("all"),
        v.literal("success"),
        v.literal("error"),
        v.literal("pending"),
        v.literal("blocked"),
      ),
    ),
    limit: v.optional(v.number()),
  },
  returns: v.array(auditActionRowValidator),
  handler: async (ctx, args) => {
    const { workspaceId } = await requireMembership(ctx);
    const limit = args.limit ?? 100;

    const rows = await ctx.db
      .query("adActions")
      .withIndex("by_workspace_executed", (q) =>
        q.eq("workspaceId", workspaceId),
      )
      .order("desc")
      .take(limit * 2);

    // Apply filtering
    let filtered = rows;
    if (args.targetType && args.targetType !== "all") {
      filtered = filtered.filter((r) => r.targetType === args.targetType);
    }
    if (args.status && args.status !== "all") {
      filtered = filtered.filter((r) => r.status === args.status);
    }

    const sliced = filtered.slice(0, limit);

    // Hydrate users
    const results = await Promise.all(
      sliced.map(async (row) => {
        let user: {
          id: Id<"users">;
          name: string | null;
          email: string | null;
        } | null = null;

        if (row.userId) {
          const userDoc = await ctx.db.get(row.userId);
          if (userDoc) {
            user = {
              id: userDoc._id,
              name: userDoc.name ?? null,
              email: userDoc.email ?? null,
            };
          }
        }

        return {
          _id: row._id,
          _creationTime: row._creationTime,
          targetType: row.targetType,
          targetId: row.targetId,
          targetName: row.targetName ?? null,
          action: row.action,
          status: row.status,
          params: row.params ?? null,
          executedAt: row.executedAt,
          apiResponse: row.apiResponse ?? null,
          error: row.error ?? null,
          user,
        };
      }),
    );

    return results;
  },
});

export const getActionStats = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireMembership(ctx);

    const rows = await ctx.db
      .query("adActions")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();

    let total = 0;
    let success = 0;
    let error = 0;
    let pending = 0;

    for (const r of rows) {
      total++;
      if (r.status === "success") success++;
      else if (r.status === "error") error++;
      else if (r.status === "pending") pending++;
    }

    return {
      total,
      success,
      error,
      pending,
    };
  },
});

// ── Hook Version Helpers & Mutations ─────────────────────────────────────────

export const countAdsInAdSetByAdExternalId = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    adExternalId: v.string(),
  },
  handler: async (ctx, args) => {
    const ad = await ctx.db
      .query("ads")
      .withIndex("by_workspace_external", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("externalId", args.adExternalId),
      )
      .first();
    if (!ad) return 0;

    const adsInSet = await ctx.db
      .query("ads")
      .withIndex("by_workspace_adset", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("adSetId", ad.adSetId),
      )
      .collect();

    return adsInSet.length;
  },
});

export const getSourceAdForHookVersion = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    adExternalId: v.string(),
  },
  handler: async (ctx, args) => {
    const ad = await ctx.db
      .query("ads")
      .withIndex("by_workspace_external", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("externalId", args.adExternalId),
      )
      .first();

    if (!ad) {
      throw new ConvexError({
        code: "not_found",
        message: `Izvorni oglas sa ID ${args.adExternalId} nije pronađen u bazi.`,
      });
    }

    const adSet = await ctx.db.get(ad.adSetId);
    if (!adSet) {
      throw new ConvexError({
        code: "not_found",
        message: "Povezani Ad Set nije pronađen.",
      });
    }

    const campaign = await ctx.db.get(adSet.campaignId);
    let accountExternalId: string | undefined;
    if (campaign) {
      const account = await ctx.db.get(campaign.accountId);
      if (account) {
        accountExternalId = account.externalId;
      }
    }

    return {
      _id: ad._id,
      externalId: ad.externalId,
      name: ad.name,
      status: ad.status,
      hookLabel: ad.hookLabel,
      primaryText: ad.primaryText,
      headline: ad.headline,
      thumbnailUrl: ad.thumbnailUrl,
      previewUrl: ad.previewUrl,
      creativeId: ad.creativeId,
      adSetId: ad.adSetId,
      adSetExternalId: adSet.externalId,
      adSetName: adSet.name,
      campaignId: adSet.campaignId,
      campaignName: campaign?.name ?? "Kampanja",
      accountExternalId,
    };
  },
});

export const getAdCreativeDetails = query({
  args: {
    adExternalId: v.string(),
  },
  handler: async (ctx, args) => {
    const { workspaceId } = await requireMembership(ctx);

    const ad = await ctx.db
      .query("ads")
      .withIndex("by_workspace_external", (q) =>
        q.eq("workspaceId", workspaceId).eq("externalId", args.adExternalId),
      )
      .first();

    if (!ad) return null;

    const adSet = await ctx.db.get(ad.adSetId);
    const campaign = adSet ? await ctx.db.get(adSet.campaignId) : null;

    const adsInSet = await ctx.db
      .query("ads")
      .withIndex("by_workspace_adset", (q) =>
        q.eq("workspaceId", workspaceId).eq("adSetId", ad.adSetId),
      )
      .collect();

    return {
      _id: ad._id,
      externalId: ad.externalId,
      name: ad.name,
      status: ad.status,
      hookLabel: ad.hookLabel ?? null,
      primaryText: ad.primaryText ?? null,
      headline: ad.headline ?? null,
      thumbnailUrl: ad.thumbnailUrl ?? null,
      previewUrl: ad.previewUrl ?? null,
      creativeId: ad.creativeId ?? null,
      adSetId: ad.adSetId,
      adSetName: adSet?.name ?? "Ad Set",
      campaignName: campaign?.name ?? "Kampanja",
      existingAdCount: adsInSet.length,
    };
  },
});

export const completeHookVersionAction = internalMutation({
  args: {
    actionId: v.id("adActions"),
    createdAd: v.object({
      externalId: v.string(),
      name: v.string(),
      status: v.string(),
      adSetId: v.id("adSets"),
      hookLabel: v.optional(v.string()),
      primaryText: v.optional(v.string()),
      headline: v.optional(v.string()),
      creativeId: v.optional(v.string()),
      thumbnailUrl: v.optional(v.string()),
      previewUrl: v.optional(v.string()),
    }),
    apiResponse: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const action = await ctx.db.get(args.actionId);
    if (!action) return;

    // 1. Update action status
    await ctx.db.patch(args.actionId, {
      status: "success",
      apiResponse: args.apiResponse ?? JSON.stringify({ success: true }),
    });

    // 2. Upsert newly duplicated ad into ads table
    const existing = await ctx.db
      .query("ads")
      .withIndex("by_workspace_external", (q) =>
        q
          .eq("workspaceId", action.workspaceId)
          .eq("externalId", args.createdAd.externalId),
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.createdAd.name,
        status: args.createdAd.status,
        hookLabel: args.createdAd.hookLabel,
        primaryText: args.createdAd.primaryText,
        headline: args.createdAd.headline,
        creativeId: args.createdAd.creativeId,
        thumbnailUrl: args.createdAd.thumbnailUrl,
        previewUrl: args.createdAd.previewUrl,
        syncedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("ads", {
        workspaceId: action.workspaceId,
        adSetId: args.createdAd.adSetId,
        externalId: args.createdAd.externalId,
        name: args.createdAd.name,
        status: args.createdAd.status,
        hookLabel: args.createdAd.hookLabel,
        primaryText: args.createdAd.primaryText,
        headline: args.createdAd.headline,
        creativeId: args.createdAd.creativeId,
        thumbnailUrl: args.createdAd.thumbnailUrl,
        previewUrl: args.createdAd.previewUrl,
        syncedAt: Date.now(),
      });
    }
  },
});

