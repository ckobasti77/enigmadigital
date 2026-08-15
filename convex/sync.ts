import { internalMutation, query } from "./_generated/server";
import { v, type Infer } from "convex/values";
import { providerValidator, ALL_PROVIDERS } from "./lib/providers";
import { requireMembership } from "./lib/auth";

/** A "running" row older than this is reported as stale (a crashed/timed-out sync). */
const STALE_MS = 15 * 60 * 1000;

// ── sync-run write helpers (called by runSync via ctx.runMutation) ──────────

export const startSyncRun = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    provider: providerValidator,
    connectionId: v.optional(v.id("connections")),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("syncRuns", {
      workspaceId: args.workspaceId,
      provider: args.provider,
      startedAt: Date.now(),
      status: "running",
      itemsWritten: 0,
      ...(args.connectionId ? { connectionId: args.connectionId } : {}),
    });
  },
});

export const finishSyncRun = internalMutation({
  args: { syncRunId: v.id("syncRuns"), itemsWritten: v.number() },
  handler: async (ctx, { syncRunId, itemsWritten }) => {
    const run = await ctx.db.get(syncRunId);
    if (run === null) return;
    const now = Date.now();
    await ctx.db.patch(syncRunId, {
      status: "ok",
      finishedAt: now,
      itemsWritten,
    });
    if (run.connectionId) {
      const conn = await ctx.db.get(run.connectionId);
      if (conn) {
        // Refresh lastSyncAt and clear a prior "error"; leave "expired" alone —
        // only a real token refresh should resolve that.
        const status = conn.status === "expired" ? "expired" : "active";
        await ctx.db.patch(run.connectionId, { lastSyncAt: now, status });
      }
    }
  },
});

export const failSyncRun = internalMutation({
  args: { syncRunId: v.id("syncRuns"), error: v.string() },
  handler: async (ctx, { syncRunId, error }) => {
    const run = await ctx.db.get(syncRunId);
    if (run === null) return;
    await ctx.db.patch(syncRunId, {
      status: "error",
      finishedAt: Date.now(),
      error,
    });
    if (run.connectionId) {
      const conn = await ctx.db.get(run.connectionId);
      if (conn) await ctx.db.patch(run.connectionId, { status: "error" });
    }
  },
});

// ── Sync Health widget ──────────────────────────────────────────────────────

const healthEntryValidator = v.object({
  provider: providerValidator,
  status: v.union(
    v.literal("running"),
    v.literal("ok"),
    v.literal("error"),
    v.literal("stale"),
  ),
  startedAt: v.number(),
  finishedAt: v.union(v.number(), v.null()),
  error: v.union(v.string(), v.null()),
  itemsWritten: v.number(),
});

type HealthEntry = Infer<typeof healthEntryValidator>;

/** Latest sync run per provider for the caller's workspace. */
export const health = query({
  args: {},
  returns: v.array(healthEntryValidator),
  handler: async (ctx): Promise<HealthEntry[]> => {
    const { workspaceId } = await requireMembership(ctx);
    const now = Date.now();
    const entries: HealthEntry[] = [];
    for (const provider of ALL_PROVIDERS) {
      const run = await ctx.db
        .query("syncRuns")
        .withIndex("by_workspace_provider", (q) =>
          q.eq("workspaceId", workspaceId).eq("provider", provider),
        )
        .order("desc")
        .first();
      if (run === null) continue;
      const stale =
        run.status === "running" && run.startedAt < now - STALE_MS;
      entries.push({
        provider: run.provider,
        status: stale ? "stale" : run.status,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt ?? null,
        error: run.error ?? null,
        itemsWritten: run.itemsWritten,
      });
    }
    return entries;
  },
});
