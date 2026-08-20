import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import { requireMembership } from "./lib/auth";
import { providerValidator } from "./lib/providers";
import {
  BACKOFF_MIN_MS,
  USAGE_STOP_PCT,
  USAGE_TTL_MS,
  USAGE_WARN_PCT,
  nextBackoffMs,
  usagePeak,
  type GateState,
} from "./lib/metaRateLimit";

/**
 * ============================================================================
 * META SYNC BOOKKEEPING (V8 runtime) — F6
 * ============================================================================
 *
 * The database half of the three-level sync: the rate-limit gate, the debounce
 * claim for the event-driven refresh, and the "when did each pass last get
 * anywhere" ledger the Settings screen reads.
 *
 * Deliberately separate from `sync.ts`. That file is about SYNC RUNS — one row
 * per whole-integration sync, shown in Sync Health. These are the small
 * recurring passes that run every two minutes; putting them in the same table
 * would bury the runs that a person actually needs to see.
 * ============================================================================
 */

// `job` is one of: "event" | "head" | "account" | "hot" | "full" | "deletion".
// Kept as a plain string in the schema rather than a union: these keys are
// bookkeeping, and a stale row from a pass that no longer exists should age out
// quietly rather than fail a validator on read.

const gateStateValidator = v.union(
  v.literal("ok"),
  v.literal("warn"),
  v.literal("stop"),
  v.literal("backoff"),
);

const gateValidator = v.object({
  state: gateStateValidator,
  retryAt: v.union(v.number(), v.null()),
  peak: v.number(),
});

// ── Rate limit ──────────────────────────────────────────────────────────────

/**
 * Fold one pass's usage readings into the workspace row.
 *
 * The percentages are REPLACED, not accumulated: they already describe the
 * whole rolling window as of the last answer, so the newest reading is the only
 * true one. A pass that saw no headers at all (`callCount` 0 and friends) still
 * writes, because "the window rolled over and we are back at zero" is exactly
 * what that looks like.
 */
export const recordUsage = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    callCount: v.number(),
    cpuTime: v.number(),
    totalTime: v.number(),
    throttled: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, { workspaceId, callCount, cpuTime, totalTime, throttled }) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("metaApiUsage")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .unique();

    if (existing === null) {
      await ctx.db.insert("metaApiUsage", {
        workspaceId,
        callCount,
        cpuTime,
        totalTime,
        updatedAt: now,
        ...(throttled
          ? {
              backoffMs: BACKOFF_MIN_MS,
              backoffUntil: now + BACKOFF_MIN_MS,
              lastThrottleAt: now,
            }
          : {}),
      });
      return null;
    }

    if (!throttled) {
      // A clean pass ends the wait: Meta answered, so it is answering again.
      const cleared =
        existing.backoffUntil !== undefined && existing.backoffUntil <= now;
      await ctx.db.patch(existing._id, {
        callCount,
        cpuTime,
        totalTime,
        updatedAt: now,
        ...(cleared ? { backoffUntil: undefined, backoffMs: undefined } : {}),
      });
      return null;
    }

    // Refused. Double the wait from wherever the last refusal left it — but
    // only once per refusal, never in a loop: the caller is already finished.
    const step = nextBackoffMs(existing.backoffMs);
    await ctx.db.patch(existing._id, {
      callCount,
      cpuTime,
      totalTime,
      updatedAt: now,
      backoffMs: step,
      backoffUntil: now + step,
      lastThrottleAt: now,
    });
    return null;
  },
});

function resolveGate(
  row: {
    callCount: number;
    cpuTime: number;
    totalTime: number;
    updatedAt: number;
    backoffUntil?: number;
  } | null,
  now: number,
): { state: GateState; retryAt: number | null; peak: number } {
  if (row === null) return { state: "ok", retryAt: null, peak: 0 };

  // An explicit refusal outranks everything, including a stale reading — Meta
  // named the minute it will talk again and that is not a guess.
  if (row.backoffUntil !== undefined && row.backoffUntil > now) {
    return {
      state: "backoff",
      retryAt: row.backoffUntil,
      peak: usagePeak(row),
    };
  }

  // The percentages describe a rolling hour. Past that they describe a window
  // that no longer exists, and holding the schedulers back on them would be a
  // lockout with no way out: the only thing that writes a fresher reading is a
  // call, and the only thing allowed to make one would be a comment.
  if (now - row.updatedAt > USAGE_TTL_MS) {
    return { state: "ok", retryAt: null, peak: 0 };
  }

  const peak = usagePeak(row);
  if (peak > USAGE_STOP_PCT) return { state: "stop", retryAt: null, peak };
  if (peak > USAGE_WARN_PCT) return { state: "warn", retryAt: null, peak };
  return { state: "ok", retryAt: null, peak };
}

/** What the schedulers ask before spending a call. */
export const gate = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  returns: gateValidator,
  handler: async (ctx, { workspaceId }) => {
    const row = await ctx.db
      .query("metaApiUsage")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .unique();
    return resolveGate(row, Date.now());
  },
});

// ── Event-driven debounce ───────────────────────────────────────────────────

/**
 * Claim the right to refresh one post, or be told somebody just did.
 *
 * A mutation and not a check-then-write in the action, because ten comments can
 * land on the same post in the same second and Convex only serializes what is
 * inside a transaction. Whoever writes the stamp wins; the other nine return
 * false and cost nothing.
 */
export const claimTargeted = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    provider: providerValidator,
    mediaId: v.string(),
    minIntervalMs: v.number(),
  },
  returns: v.boolean(),
  handler: async (ctx, { workspaceId, provider, mediaId, minIntervalMs }) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("metaTargetedSyncs")
      .withIndex("by_provider_media", (q) =>
        q.eq("provider", provider).eq("mediaId", mediaId),
      )
      .first();

    if (existing !== null) {
      if (now - existing.lastSyncAt < minIntervalMs) return false;
      await ctx.db.patch(existing._id, { lastSyncAt: now });
      return true;
    }

    await ctx.db.insert("metaTargetedSyncs", {
      workspaceId,
      provider,
      mediaId,
      lastSyncAt: now,
    });
    return true;
  },
});

// ── Job ledger ──────────────────────────────────────────────────────────────

/**
 * Record that a pass ran. `ok: false` means it stood down (rate limit, backoff)
 * or failed — `lastOkAt` is left alone, so the Settings screen keeps showing
 * the last time this pass actually did something.
 *
 * `lastOkAt` and `lastDataAt` answer two different questions and P2 split them
 * apart because conflating them made the header lie. "The call went through"
 * is what the Settings table reports; "the numbers on screen got fresher" is
 * what the header counts from. The two-minute head check succeeds all day
 * while writing nothing, so only a pass that actually WROTE something moves
 * `lastDataAt`.
 */
export const recordJob = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    provider: providerValidator,
    job: v.string(),
    ok: v.boolean(),
    itemsWritten: v.optional(v.number()),
    skipReason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (
    ctx,
    { workspaceId, provider, job, ok, itemsWritten, skipReason },
  ) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("metaSyncJobs")
      .withIndex("by_workspace_provider_job", (q) =>
        q.eq("workspaceId", workspaceId).eq("provider", provider).eq("job", job),
      )
      .unique();

    // A pass that succeeded and wrote nothing did not make the screen fresher.
    // Every caller passes `itemsWritten`, including the passes whose whole job
    // is to write one row, so this is the honest test rather than a proxy.
    const refreshedData = ok && (itemsWritten ?? 0) > 0;

    if (existing === null) {
      await ctx.db.insert("metaSyncJobs", {
        workspaceId,
        provider,
        job,
        lastRunAt: now,
        ...(ok ? { lastOkAt: now } : {}),
        ...(refreshedData ? { lastDataAt: now } : {}),
        ...(itemsWritten !== undefined ? { itemsWritten } : {}),
        ...(skipReason !== undefined ? { lastSkipReason: skipReason } : {}),
      });
      return null;
    }

    await ctx.db.patch(existing._id, {
      lastRunAt: now,
      ...(ok ? { lastOkAt: now } : {}),
      ...(refreshedData ? { lastDataAt: now } : {}),
      ...(itemsWritten !== undefined ? { itemsWritten } : {}),
      // Cleared on success so a resolved rate limit does not keep explaining
      // itself hours later.
      lastSkipReason: ok ? undefined : skipReason,
    });
    return null;
  },
});

/** Latest successful pass across every job — the header's "synced N s ago". */
export const lastOkAt = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  returns: v.union(v.number(), v.null()),
  handler: async (ctx, { workspaceId }) => {
    const rows = await ctx.db
      .query("metaSyncJobs")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();

    let best: number | null = null;
    for (const row of rows) {
      if (row.lastOkAt === undefined) continue;
      if (best === null || row.lastOkAt > best) best = row.lastOkAt;
    }
    return best;
  },
});

// ── Public queries ──────────────────────────────────────────────────────────

/**
 * The yellow band. `limited` is true only when something is actually being held
 * back right now — a workspace at 40 % of its allowance is not news.
 */
export const rateLimit = query({
  args: {},
  returns: v.object({
    state: gateStateValidator,
    limited: v.boolean(),
    retryAt: v.union(v.number(), v.null()),
    peak: v.number(),
  }),
  handler: async (ctx) => {
    const { workspaceId } = await requireMembership(ctx);
    const row = await ctx.db
      .query("metaApiUsage")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .unique();

    const resolved = resolveGate(row, Date.now());
    return { ...resolved, limited: resolved.state !== "ok" };
  },
});

/**
 * When each scheduled pass last got somewhere, for the Settings table. The
 * cadences themselves are NOT returned — they are compiled into `crons.ts`, and
 * a second copy in the database would be a second thing to keep true.
 */
export const jobStatus = query({
  args: {},
  returns: v.array(
    v.object({
      provider: providerValidator,
      job: v.string(),
      lastRunAt: v.number(),
      lastOkAt: v.union(v.number(), v.null()),
      lastSkipReason: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx) => {
    const { workspaceId } = await requireMembership(ctx);
    const rows = await ctx.db
      .query("metaSyncJobs")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();

    return rows.map((row) => ({
      provider: row.provider,
      job: row.job,
      lastRunAt: row.lastRunAt,
      lastOkAt: row.lastOkAt ?? null,
      lastSkipReason: row.lastSkipReason ?? null,
    }));
  },
});
