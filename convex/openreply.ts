"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { Client } from "pg";
import { decryptCredentials } from "./lib/crypto";
import { runSync } from "./lib/runSync";
import {
  SELECT_CAMPAIGNS_STATS,
  SELECT_DAILY_TOTALS_90_DAYS,
  type RawCampaignRow,
  type RawDailyTotalRow,
} from "./lib/openreplySql";

/**
 * OpenReply sync (PLAN.md §4, M4).
 *
 * Connects directly to the self-hosted OpenReply Railway Postgres instance using
 * a short-lived, read-only `pg` connection with SSL and 10s timeouts.
 *
 * Reads:
 *   1. Campaigns (Automation) stats + DM sent/failed + link clicks → orCampaignStats
 *   2. Daily aggregate totals for the last 90 days → orDailyTotals
 *
 * All operations execute within `runSync` for unified logging in `syncRuns`.
 * If any query fails, the entire run fails atomically without partial writes.
 */

const PG_TIMEOUT_MS = 10_000;

function formatKeyword(rawKeywords: unknown): string {
  if (Array.isArray(rawKeywords)) {
    return rawKeywords.filter(Boolean).join(", ");
  }
  if (typeof rawKeywords === "string") {
    return rawKeywords;
  }
  return "";
}

export const syncOpenReply = internalAction({
  args: { connectionId: v.id("connections") },
  handler: async (ctx, { connectionId }) => {
    const conn = await ctx.runQuery(internal.connections.getForSync, {
      connectionId,
    });
    if (conn === null) {
      throw new Error("OpenReply konekcija nije pronađena.");
    }
    if (conn.provider !== "openreply") {
      throw new Error("Konekcija nije OpenReply provajder.");
    }
    const workspaceId = conn.workspaceId;

    await runSync(
      ctx,
      { workspaceId, provider: "openreply", connectionId },
      async () => {
        if (!conn.encryptedCredentials) {
          throw new Error("OpenReply nije povezan");
        }

        let connectionString: string;
        try {
          connectionString = await decryptCredentials(conn.encryptedCredentials);
        } catch {
          throw new Error("OpenReply nije povezan");
        }

        const trimmedConnStr = connectionString.trim();
        if (!trimmedConnStr || !/^postgres(?:ql)?:\/\//i.test(trimmedConnStr)) {
          throw new Error("OpenReply nije povezan");
        }

        const client = new Client({
          connectionString: trimmedConnStr,
          ssl: {
            rejectUnauthorized: false,
          },
          statement_timeout: PG_TIMEOUT_MS,
          query_timeout: PG_TIMEOUT_MS,
          connectionTimeoutMillis: PG_TIMEOUT_MS,
        });

        try {
          await client.connect();

          // 1. Fetch campaigns stats
          const campaignsRes = await client.query<RawCampaignRow>(
            SELECT_CAMPAIGNS_STATS,
          );
          const now = Date.now();
          const campaigns = campaignsRes.rows.map((r) => {
            const dmsSent = Number(r.dmsSent) || 0;
            const dmsFailed = Number(r.dmsFailed) || 0;
            const linkClicks = Number(r.linkClicks) || 0;
            const ctr = dmsSent > 0 ? linkClicks / dmsSent : 0;

            return {
              orCampaignId: String(r.orCampaignId),
              name: String(r.name || "Bez naziva"),
              keyword: formatKeyword(r.keywords),
              active: Boolean(r.active),
              dmsSent,
              dmsFailed,
              linkClicks,
              ctr,
              syncedAt: now,
            };
          });

          // 2. Fetch daily totals (last 90 days)
          const dailyRes = await client.query<RawDailyTotalRow>(
            SELECT_DAILY_TOTALS_90_DAYS,
          );
          const dailyTotals = dailyRes.rows.map((r) => ({
            date: String(r.date),
            dmsSent: Number(r.dmsSent) || 0,
            linkClicks: Number(r.linkClicks) || 0,
          }));

          // 3. Atomically persist both datasets
          const itemsWritten = await ctx.runMutation(
            internal.openreplyStore.upsertSnapshot,
            {
              workspaceId,
              campaigns,
              dailyTotals,
            },
          );

          return itemsWritten;
        } finally {
          await client.end().catch(() => {
            // Ignore clean teardown errors
          });
        }
      },
    );
  },
});

/**
 * Cron fan-out (every 1h): sync every OpenReply connection.
 */
export const syncAllOpenReply = internalAction({
  args: {},
  handler: async (ctx) => {
    const connectionIds = await ctx.runQuery(
      internal.connections.listByProvider,
      { provider: "openreply" },
    );
    for (const connectionId of connectionIds) {
      try {
        await ctx.runAction(internal.openreply.syncOpenReply, { connectionId });
      } catch {
        // Recorded on syncRuns; continue with the next connection
      }
    }
  },
});
