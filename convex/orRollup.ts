import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { resolvePlatform } from "./lib/orPlatform";

/**
 * OpenReply Rollup Mutation.
 * Recomputes aggregates from raw log and click rows and idempotently updates
 * orDailyTotals and orCampaignStats tables.
 */
export const recompute = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    date: v.optional(v.string()),
    automationId: v.optional(v.id("orAutomations")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // (a) When date is given, refresh orDailyTotals for that workspace+date
    if (args.date !== undefined) {
      const date = args.date;
      const logs = await ctx.db
        .query("orDmLogs")
        .withIndex("by_workspace_date", (q) =>
          q.eq("workspaceId", args.workspaceId).eq("date", date),
        )
        .collect();

      // The split is counted here rather than queried later: the day's rows
      // are already in hand, and a screen that had to walk orDmLogs itself to
      // answer "how many on Facebook" would walk it once per visitor.
      let dmsSent = 0;
      let dmsSentInstagram = 0;
      let dmsSentFacebook = 0;
      for (const log of logs) {
        if (log.status !== "sent") continue;
        dmsSent++;
        if (resolvePlatform(log.platform) === "facebook") dmsSentFacebook++;
        else dmsSentInstagram++;
      }

      const clicks = await ctx.db
        .query("orLinkClicks")
        .withIndex("by_workspace_date", (q) =>
          q.eq("workspaceId", args.workspaceId).eq("date", date),
        )
        .collect();

      const linkClicks = clicks.length;

      const existingDaily = await ctx.db
        .query("orDailyTotals")
        .withIndex("by_workspace_date", (q) =>
          q.eq("workspaceId", args.workspaceId).eq("date", date),
        )
        .unique();

      if (existingDaily !== null) {
        await ctx.db.patch(existingDaily._id, {
          dmsSent,
          dmsSentInstagram,
          dmsSentFacebook,
          linkClicks,
        });
      } else if (dmsSent > 0 || linkClicks > 0) {
        await ctx.db.insert("orDailyTotals", {
          workspaceId: args.workspaceId,
          date,
          dmsSent,
          dmsSentInstagram,
          dmsSentFacebook,
          linkClicks,
        });
      }
    }

    // (b) When automationId is given, refresh orCampaignStats
    if (args.automationId !== undefined) {
      const automationId = args.automationId;
      const automation = await ctx.db.get(automationId);
      const campaignIdStr: string = automationId;

      if (automation === null) {
        const existingCampaign = await ctx.db
          .query("orCampaignStats")
          .withIndex("by_workspace_campaign", (q) =>
            q
              .eq("workspaceId", args.workspaceId)
              .eq("orCampaignId", campaignIdStr),
          )
          .unique();

        if (existingCampaign !== null) {
          await ctx.db.delete(existingCampaign._id);
        }
      } else {
        const autoLogs = await ctx.db
          .query("orDmLogs")
          .withIndex("by_automation", (q) =>
            q.eq("automationId", automationId),
          )
          .collect();

        let dmsSent = 0;
        let dmsFailed = 0;
        for (const log of autoLogs) {
          if (log.status === "sent") {
            dmsSent++;
          } else if (log.status === "failed") {
            dmsFailed++;
          }
        }

        const autoClicks = await ctx.db
          .query("orLinkClicks")
          .withIndex("by_workspace_automation", (q) =>
            q
              .eq("workspaceId", args.workspaceId)
              .eq("automationId", automationId),
          )
          .collect();

        const linkClicks = autoClicks.length;
        const ctr = dmsSent > 0 ? linkClicks / dmsSent : 0;

        const existingCampaign = await ctx.db
          .query("orCampaignStats")
          .withIndex("by_workspace_campaign", (q) =>
            q
              .eq("workspaceId", args.workspaceId)
              .eq("orCampaignId", campaignIdStr),
          )
          .unique();

        const campaignPayload = {
          orCampaignId: campaignIdStr,
          name: automation.name,
          keyword: automation.keywords.join(", "),
          active: automation.isActive,
          dmsSent,
          dmsFailed,
          linkClicks,
          ctr,
          syncedAt: Date.now(),
        };

        if (existingCampaign !== null) {
          await ctx.db.patch(existingCampaign._id, campaignPayload);
        } else {
          await ctx.db.insert("orCampaignStats", {
            workspaceId: args.workspaceId,
            ...campaignPayload,
          });
        }
      }
    }

    return null;
  },
});
