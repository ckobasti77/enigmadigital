import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireMembership } from "./lib/auth";

export const metricValidator = v.union(
  v.literal("cpa"),
  v.literal("spend"),
  v.literal("ctr"),
  v.literal("cpc"),
  v.literal("roas"),
);

export const operatorValidator = v.union(
  v.literal("gt"),
  v.literal("gte"),
  v.literal("lt"),
  v.literal("lte"),
);

export const scopeValidator = v.union(
  v.literal("account"),
  v.literal("campaign"),
  v.literal("adset"),
);

export const actionValidator = v.union(
  v.literal("notify"),
  v.literal("pause"),
  v.literal("pause_and_notify"),
);

export const ruleConditionValidator = v.object({
  metric: metricValidator,
  operator: operatorValidator,
  value: v.number(),
  windowDays: v.number(),
  minImpressions: v.number(),
});

export const TEMPLATE_RULES = [
  {
    name: "CPA Guard (zaštita od skupih konverzija)",
    scope: "campaign" as const,
    condition: {
      metric: "cpa" as const,
      operator: "gt" as const,
      value: 15,
      windowDays: 3,
      minImpressions: 1000,
    },
    action: "pause_and_notify" as const,
    cooldownHours: 24,
    enabled: false,
  },
  {
    name: "Spend Spike Guard (skok potrošnje)",
    scope: "campaign" as const,
    condition: {
      metric: "spend" as const,
      operator: "gt" as const,
      value: 100,
      windowDays: 1,
      minImpressions: 500,
    },
    action: "notify" as const,
    cooldownHours: 12,
    enabled: false,
  },
];

// ── Public Queries & Mutations ───────────────────────────────────────────────

/**
 * List all rules for the current workspace.
 */
export const listRules = query({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
  },
  handler: async (ctx, args) => {
    const { workspaceId } = await requireMembership(ctx);
    const targetWorkspaceId = args.workspaceId ?? workspaceId;

    const rules = await ctx.db
      .query("rules")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", targetWorkspaceId))
      .collect();

    return rules;
  },
});

/**
 * Ensures template rules exist for the workspace if table is empty.
 */
export const ensureTemplateRules = mutation({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
  },
  handler: async (ctx, args) => {
    const { workspaceId } = await requireMembership(ctx);
    const targetWorkspaceId = args.workspaceId ?? workspaceId;

    const existing = await ctx.db
      .query("rules")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", targetWorkspaceId))
      .collect();

    if (existing.length === 0) {
      for (const tpl of TEMPLATE_RULES) {
        await ctx.db.insert("rules", {
          workspaceId: targetWorkspaceId,
          name: tpl.name,
          scope: tpl.scope,
          condition: tpl.condition,
          action: tpl.action,
          cooldownHours: tpl.cooldownHours,
          enabled: false,
        });
      }
    }

    return true;
  },
});

/**
 * Get a single rule by ID.
 */
export const getRule = query({
  args: {
    ruleId: v.id("rules"),
  },
  handler: async (ctx, args) => {
    const { workspaceId } = await requireMembership(ctx);
    const rule = await ctx.db.get(args.ruleId);
    if (!rule || rule.workspaceId !== workspaceId) {
      return null;
    }
    return rule;
  },
});

/**
 * Create a new rule.
 */
export const createRule = mutation({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    name: v.string(),
    scope: scopeValidator,
    condition: ruleConditionValidator,
    action: actionValidator,
    cooldownHours: v.number(),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { workspaceId } = await requireMembership(ctx);
    const targetWorkspaceId = args.workspaceId ?? workspaceId;

    if (!args.name.trim()) {
      throw new ConvexError({
        code: "invalid_argument",
        message: "Naziv pravila ne može biti prazan.",
      });
    }

    if (args.condition.value < 0) {
      throw new ConvexError({
        code: "invalid_argument",
        message: "Vrednost praga mora biti nenegativan broj.",
      });
    }

    if (args.condition.windowDays < 1 || args.condition.windowDays > 90) {
      throw new ConvexError({
        code: "invalid_argument",
        message: "Vremenski prozor mora biti između 1 i 90 dana.",
      });
    }

    if (args.condition.minImpressions < 0) {
      throw new ConvexError({
        code: "invalid_argument",
        message: "Minimalan broj impresija ne može biti negativan.",
      });
    }

    if (args.cooldownHours < 1 || args.cooldownHours > 720) {
      throw new ConvexError({
        code: "invalid_argument",
        message: "Period mirovanja (cooldown) mora biti između 1h i 720h (30 dana).",
      });
    }

    const ruleId = await ctx.db.insert("rules", {
      workspaceId: targetWorkspaceId,
      name: args.name.trim(),
      scope: args.scope,
      condition: args.condition,
      action: args.action,
      cooldownHours: args.cooldownHours,
      enabled: args.enabled,
    });

    return ruleId;
  },
});

/**
 * Update an existing rule.
 */
export const updateRule = mutation({
  args: {
    ruleId: v.id("rules"),
    name: v.string(),
    scope: scopeValidator,
    condition: ruleConditionValidator,
    action: actionValidator,
    cooldownHours: v.number(),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { workspaceId } = await requireMembership(ctx);
    const existing = await ctx.db.get(args.ruleId);
    if (!existing || existing.workspaceId !== workspaceId) {
      throw new ConvexError({
        code: "not_found",
        message: "Pravilo nije pronađeno.",
      });
    }

    if (!args.name.trim()) {
      throw new ConvexError({
        code: "invalid_argument",
        message: "Naziv pravila ne može biti prazan.",
      });
    }

    if (args.condition.value < 0) {
      throw new ConvexError({
        code: "invalid_argument",
        message: "Vrednost praga mora biti nenegativan broj.",
      });
    }

    if (args.condition.windowDays < 1 || args.condition.windowDays > 90) {
      throw new ConvexError({
        code: "invalid_argument",
        message: "Vremenski prozor mora biti između 1 i 90 dana.",
      });
    }

    if (args.condition.minImpressions < 0) {
      throw new ConvexError({
        code: "invalid_argument",
        message: "Minimalan broj impresija ne može biti negativan.",
      });
    }

    if (args.cooldownHours < 1 || args.cooldownHours > 720) {
      throw new ConvexError({
        code: "invalid_argument",
        message: "Period mirovanja (cooldown) mora biti između 1h i 720h.",
      });
    }

    await ctx.db.patch(args.ruleId, {
      name: args.name.trim(),
      scope: args.scope,
      condition: args.condition,
      action: args.action,
      cooldownHours: args.cooldownHours,
      enabled: args.enabled,
    });

    return args.ruleId;
  },
});

/**
 * Delete a rule and its firing history.
 */
export const deleteRule = mutation({
  args: {
    ruleId: v.id("rules"),
  },
  handler: async (ctx, args) => {
    const { workspaceId } = await requireMembership(ctx);
    const existing = await ctx.db.get(args.ruleId);
    if (!existing || existing.workspaceId !== workspaceId) {
      throw new ConvexError({
        code: "not_found",
        message: "Pravilo nije pronađeno.",
      });
    }

    // Delete associated firings
    const firings = await ctx.db
      .query("ruleFirings")
      .withIndex("by_ruleId", (q) => q.eq("ruleId", args.ruleId))
      .collect();

    for (const f of firings) {
      await ctx.db.delete(f._id);
    }

    await ctx.db.delete(args.ruleId);
    return true;
  },
});

/**
 * Toggle enabled status of a rule.
 */
export const toggleRule = mutation({
  args: {
    ruleId: v.id("rules"),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { workspaceId } = await requireMembership(ctx);
    const existing = await ctx.db.get(args.ruleId);
    if (!existing || existing.workspaceId !== workspaceId) {
      throw new ConvexError({
        code: "not_found",
        message: "Pravilo nije pronađeno.",
      });
    }

    await ctx.db.patch(args.ruleId, { enabled: args.enabled });
    return { ruleId: args.ruleId, enabled: args.enabled };
  },
});

export const listRuleFiringsInternal = internalQuery({
  args: {
    ruleId: v.optional(v.id("rules")),
    workspaceId: v.optional(v.id("workspaces")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    let firings;
    if (args.ruleId) {
      firings = await ctx.db
        .query("ruleFirings")
        .withIndex("by_ruleId_and_firedAt", (q) => q.eq("ruleId", args.ruleId!))
        .order("desc")
        .take(limit);
    } else if (args.workspaceId) {
      firings = await ctx.db
        .query("ruleFirings")
        .withIndex("by_workspace_and_firedAt", (q) =>
          q.eq("workspaceId", args.workspaceId!),
        )
        .order("desc")
        .take(limit);
    } else {
      firings = await ctx.db.query("ruleFirings").order("desc").take(limit);
    }

    return firings;
  },
});

/**
 * List firing history for the workspace or specific rule.
 */
export const listRuleFirings = query({
  args: {
    ruleId: v.optional(v.id("rules")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { workspaceId } = await requireMembership(ctx);
    const limit = args.limit ?? 50;

    let firings;
    if (args.ruleId) {
      firings = await ctx.db
        .query("ruleFirings")
        .withIndex("by_ruleId_and_firedAt", (q) => q.eq("ruleId", args.ruleId!))
        .order("desc")
        .take(limit);
    } else {
      firings = await ctx.db
        .query("ruleFirings")
        .withIndex("by_workspace_and_firedAt", (q) =>
          q.eq("workspaceId", workspaceId),
        )
        .order("desc")
        .take(limit);
    }

    // Enrich with rule name
    const ruleIds = Array.from(new Set(firings.map((f) => f.ruleId)));
    const rulesMap = new Map<Id<"rules">, string>();
    for (const rId of ruleIds) {
      const rule = await ctx.db.get(rId);
      if (rule) {
        rulesMap.set(rId, rule.name);
      }
    }

    return firings.map((f) => ({
      ...f,
      ruleName: rulesMap.get(f.ruleId) ?? "Obrisano pravilo",
    }));
  },
});

// ── Internal Evaluator Context Gathering ─────────────────────────────────────

export interface EvaluationTargetMetric {
  targetId: string; // externalId
  targetName: string;
  targetType: "account" | "campaign" | "adset";
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
  results: number;
  conversionValue: number;
  isCoolingDown: boolean;
  lastFiredAt?: number;
}

export interface EvaluationRuleContext {
  rule: {
    _id: Id<"rules">;
    workspaceId: Id<"workspaces">;
    name: string;
    scope: "account" | "campaign" | "adset";
    condition: {
      metric: "cpa" | "spend" | "ctr" | "cpc" | "roas";
      operator: "gt" | "gte" | "lt" | "lte";
      value: number;
      windowDays: number;
      minImpressions: number;
    };
    action: "notify" | "pause" | "pause_and_notify";
    cooldownHours: number;
    lastFiredAt?: number;
  };
  from: string;
  to: string;
  targets: EvaluationTargetMetric[];
  connection: {
    encryptedCredentials?: string;
    externalId?: string;
  } | null;
  allowedEmails: string[];
}

/**
 * Collects all enabled rules and aggregates fresh adInsights metrics for their respective windows.
 */
export const getEvaluationContext = internalQuery({
  args: {
    now: v.number(),
    specificRuleId: v.optional(v.id("rules")),
    specificWorkspaceId: v.optional(v.id("workspaces")),
  },
  handler: async (ctx, args): Promise<EvaluationRuleContext[]> => {
    const toDate = new Date(args.now).toISOString().slice(0, 10);

    let rules: Array<{
      _id: Id<"rules">;
      workspaceId: Id<"workspaces">;
      name: string;
      enabled: boolean;
      scope: "account" | "campaign" | "adset";
      condition: {
        metric: "cpa" | "spend" | "ctr" | "cpc" | "roas";
        operator: "gt" | "gte" | "lt" | "lte";
        value: number;
        windowDays: number;
        minImpressions: number;
      };
      action: "notify" | "pause" | "pause_and_notify";
      cooldownHours: number;
      lastFiredAt?: number;
    }> = [];

    if (args.specificRuleId) {
      const single = await ctx.db.get(args.specificRuleId);
      if (single) rules = [single];
    } else if (args.specificWorkspaceId) {
      rules = await ctx.db
        .query("rules")
        .withIndex("by_workspace_and_enabled", (q) =>
          q
            .eq("workspaceId", args.specificWorkspaceId!)
            .eq("enabled", true),
        )
        .collect();
    } else {
      // Find all workspaces
      const allWorkspaces = await ctx.db.query("workspaces").collect();
      for (const ws of allWorkspaces) {
        const wsRules = await ctx.db
          .query("rules")
          .withIndex("by_workspace_and_enabled", (q) =>
            q.eq("workspaceId", ws._id).eq("enabled", true),
          )
          .collect();
        rules.push(...wsRules);
      }
    }

    const results: EvaluationRuleContext[] = [];

    for (const rule of rules) {
      const windowDays = Math.max(1, rule.condition.windowDays);
      const fromTimestamp = args.now - (windowDays - 1) * 24 * 60 * 60 * 1000;
      const fromDate = new Date(fromTimestamp).toISOString().slice(0, 10);

      // Fetch connection for credentials if needed
      const conn = await ctx.db
        .query("connections")
        .withIndex("by_workspace_provider", (q) =>
          q.eq("workspaceId", rule.workspaceId).eq("provider", "meta_ads"),
        )
        .first();

      // Fetch allowed emails (workspace members + users)
      const members = await ctx.db
        .query("members")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", rule.workspaceId))
        .collect();

      const memberEmails: string[] = [];
      for (const m of members) {
        const u = await ctx.db.get(m.userId);
        if (u?.email) {
          memberEmails.push(u.email.trim().toLowerCase());
        }
      }

      // Collect target objects
      const targets: EvaluationTargetMetric[] = [];

      if (rule.scope === "campaign") {
        const campaigns = await ctx.db
          .query("adCampaigns")
          .withIndex("by_workspace_priority", (q) =>
            q.eq("workspaceId", rule.workspaceId),
          )
          .collect();

        for (const campaign of campaigns) {
          // Find all ad sets and ads
          const adSets = await ctx.db
            .query("adSets")
            .withIndex("by_workspace_campaign", (q) =>
              q.eq("workspaceId", rule.workspaceId).eq("campaignId", campaign._id),
            )
            .collect();

          let spend = 0;
          let impressions = 0;
          let clicks = 0;
          let convResults = 0;
          let conversionValue = 0;

          for (const set of adSets) {
            const ads = await ctx.db
              .query("ads")
              .withIndex("by_workspace_adset", (q) =>
                q.eq("workspaceId", rule.workspaceId).eq("adSetId", set._id),
              )
              .collect();

            for (const ad of ads) {
              const insights = await ctx.db
                .query("adInsights")
                .withIndex("by_ad_date", (q) =>
                  q
                    .eq("adId", ad._id)
                    .gte("date", fromDate)
                    .lte("date", toDate),
                )
                .collect();

              for (const ins of insights) {
                if (ins.breakdownHash === "none" && ins.hour === undefined) {
                  spend += ins.spend;
                  impressions += ins.impressions;
                  clicks += ins.clicks;
                  if (ins.results !== undefined) convResults += ins.results;
                  if (ins.conversionValue !== undefined) conversionValue += ins.conversionValue;
                }
              }
            }
          }

          // Check cooldown for this rule + target
          const cooldownThreshold = args.now - rule.cooldownHours * 3600 * 1000;
          const recentFiring = await ctx.db
            .query("ruleFirings")
            .withIndex("by_ruleId_and_targetId_and_firedAt", (q) =>
              q
                .eq("ruleId", rule._id)
                .eq("targetId", campaign.externalId)
                .gt("firedAt", cooldownThreshold),
            )
            .first();

          targets.push({
            targetId: campaign.externalId,
            targetName: campaign.name,
            targetType: "campaign",
            status: campaign.status,
            spend: Number(spend.toFixed(2)),
            impressions,
            clicks,
            results: convResults,
            conversionValue: Number(conversionValue.toFixed(2)),
            isCoolingDown: recentFiring !== null,
            lastFiredAt: recentFiring?.firedAt,
          });
        }
      } else if (rule.scope === "adset") {
        const campaigns = await ctx.db
          .query("adCampaigns")
          .withIndex("by_workspace_priority", (q) =>
            q.eq("workspaceId", rule.workspaceId),
          )
          .collect();

        const adSets: Array<{
          _id: Id<"adSets">;
          workspaceId: Id<"workspaces">;
          campaignId: Id<"adCampaigns">;
          externalId: string;
          name: string;
          status: string;
        }> = [];

        for (const camp of campaigns) {
          const sets = await ctx.db
            .query("adSets")
            .withIndex("by_workspace_campaign", (q) =>
              q.eq("workspaceId", rule.workspaceId).eq("campaignId", camp._id),
            )
            .collect();
          adSets.push(...sets);
        }

        for (const adSet of adSets) {
          const ads = await ctx.db
            .query("ads")
            .withIndex("by_workspace_adset", (q) =>
              q.eq("workspaceId", rule.workspaceId).eq("adSetId", adSet._id),
            )
            .collect();

          let spend = 0;
          let impressions = 0;
          let clicks = 0;
          let convResults = 0;
          let conversionValue = 0;

          for (const ad of ads) {
            const insights = await ctx.db
              .query("adInsights")
              .withIndex("by_ad_date", (q) =>
                q
                  .eq("adId", ad._id)
                  .gte("date", fromDate)
                  .lte("date", toDate),
              )
              .collect();

              for (const ins of insights) {
                if (ins.breakdownHash === "none" && ins.hour === undefined) {
                  spend += ins.spend;
                  impressions += ins.impressions;
                  clicks += ins.clicks;
                  if (ins.results !== undefined) convResults += ins.results;
                  if (ins.conversionValue !== undefined) conversionValue += ins.conversionValue;
                }
              }
          }

          const cooldownThreshold = args.now - rule.cooldownHours * 3600 * 1000;
          const recentFiring = await ctx.db
            .query("ruleFirings")
            .withIndex("by_ruleId_and_targetId_and_firedAt", (q) =>
              q
                .eq("ruleId", rule._id)
                .eq("targetId", adSet.externalId)
                .gt("firedAt", cooldownThreshold),
            )
            .first();

          targets.push({
            targetId: adSet.externalId,
            targetName: adSet.name,
            targetType: "adset",
            status: adSet.status,
            spend: Number(spend.toFixed(2)),
            impressions,
            clicks,
            results: convResults,
            conversionValue: Number(conversionValue.toFixed(2)),
            isCoolingDown: recentFiring !== null,
            lastFiredAt: recentFiring?.firedAt,
          });
        }
      } else if (rule.scope === "account") {
        const accounts = await ctx.db
          .query("adAccounts")
          .withIndex("by_workspace", (q) => q.eq("workspaceId", rule.workspaceId))
          .collect();

        for (const account of accounts) {
          const campaigns = await ctx.db
            .query("adCampaigns")
            .withIndex("by_account", (q) => q.eq("accountId", account._id))
            .collect();

          let spend = 0;
          let impressions = 0;
          let clicks = 0;
          let convResults = 0;
          let conversionValue = 0;

          for (const camp of campaigns) {
            const adSets = await ctx.db
              .query("adSets")
              .withIndex("by_workspace_campaign", (q) =>
                q.eq("workspaceId", rule.workspaceId).eq("campaignId", camp._id),
              )
              .collect();

            for (const set of adSets) {
              const ads = await ctx.db
                .query("ads")
                .withIndex("by_workspace_adset", (q) =>
                  q.eq("workspaceId", rule.workspaceId).eq("adSetId", set._id),
                )
                .collect();

              for (const ad of ads) {
                const insights = await ctx.db
                  .query("adInsights")
                  .withIndex("by_ad_date", (q) =>
                    q
                      .eq("adId", ad._id)
                      .gte("date", fromDate)
                      .lte("date", toDate),
                  )
                  .collect();

                for (const ins of insights) {
                  if (ins.breakdownHash === "none" && ins.hour === undefined) {
                    spend += ins.spend;
                    impressions += ins.impressions;
                    clicks += ins.clicks;
                    if (ins.results !== undefined) convResults += ins.results;
                    if (ins.conversionValue !== undefined) conversionValue += ins.conversionValue;
                  }
                }
              }
            }
          }

          const cooldownThreshold = args.now - rule.cooldownHours * 3600 * 1000;
          const recentFiring = await ctx.db
            .query("ruleFirings")
            .withIndex("by_ruleId_and_targetId_and_firedAt", (q) =>
              q
                .eq("ruleId", rule._id)
                .eq("targetId", account.externalId)
                .gt("firedAt", cooldownThreshold),
            )
            .first();

          targets.push({
            targetId: account.externalId,
            targetName: account.name,
            targetType: "account",
            status: "ACTIVE",
            spend: Number(spend.toFixed(2)),
            impressions,
            clicks,
            results: convResults,
            conversionValue: Number(conversionValue.toFixed(2)),
            isCoolingDown: recentFiring !== null,
            lastFiredAt: recentFiring?.firedAt,
          });
        }
      }

      results.push({
        rule,
        from: fromDate,
        to: toDate,
        targets,
        connection: conn
          ? {
              encryptedCredentials: conn.encryptedCredentials,
              externalId: conn.externalId,
            }
          : null,
        allowedEmails: memberEmails,
      });
    }

    return results;
  },
});

// ── Internal Recording Mutations ─────────────────────────────────────────────

export const recordFiring = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    ruleId: v.id("rules"),
    targetId: v.string(),
    targetName: v.optional(v.string()),
    targetType: v.optional(
      v.union(v.literal("account"), v.literal("campaign"), v.literal("adset")),
    ),
    firedAt: v.number(),
    metricValue: v.number(),
    actionTaken: v.union(
      v.literal("notify"),
      v.literal("pause"),
      v.literal("pause_and_notify"),
      v.literal("notify_only_write_disabled"),
    ),
    notified: v.boolean(),
    details: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const firingId = await ctx.db.insert("ruleFirings", {
      workspaceId: args.workspaceId,
      ruleId: args.ruleId,
      targetId: args.targetId,
      targetName: args.targetName,
      targetType: args.targetType,
      firedAt: args.firedAt,
      metricValue: args.metricValue,
      actionTaken: args.actionTaken,
      notified: args.notified,
      details: args.details,
    });

    // Update rule's lastFiredAt
    await ctx.db.patch(args.ruleId, {
      lastFiredAt: args.firedAt,
    });

    return firingId;
  },
});

export const updateTargetStatusLocally = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    targetType: v.union(
      v.literal("account"),
      v.literal("campaign"),
      v.literal("adset"),
    ),
    targetId: v.string(), // externalId
    newStatus: v.string(), // "PAUSED"
  },
  handler: async (ctx, args) => {
    if (args.targetType === "campaign") {
      const campaign = await ctx.db
        .query("adCampaigns")
        .withIndex("by_workspace_external", (q) =>
          q
            .eq("workspaceId", args.workspaceId)
            .eq("externalId", args.targetId),
        )
        .first();

      if (campaign) {
        await ctx.db.patch(campaign._id, {
          status: args.newStatus,
          syncedAt: Date.now(),
        });
      }
    } else if (args.targetType === "adset") {
      const adSet = await ctx.db
        .query("adSets")
        .withIndex("by_workspace_external", (q) =>
          q
            .eq("workspaceId", args.workspaceId)
            .eq("externalId", args.targetId),
        )
        .first();

      if (adSet) {
        await ctx.db.patch(adSet._id, {
          status: args.newStatus,
          syncedAt: Date.now(),
        });
      }
    }
  },
});
