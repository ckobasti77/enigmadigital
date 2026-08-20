import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * ============================================================================
 * CRON SELF-OVERLAP LOCK (P2)
 * ============================================================================
 *
 * `crons.interval` and `crons.cron` both fire on a clock and neither one asks
 * whether the previous firing has finished. That is fine for a job that always
 * takes a second, and it is not fine for any of the Meta passes: a six-hourly
 * sync that starts taking seven hours does not slow down, it starts running as
 * two copies — both walking the same posts, both spending the same allowance,
 * and each new firing making the next one likelier to overlap too.
 *
 * So every scheduled Meta pass takes a named lock first, and skips its turn if
 * somebody else holds it. Skipping is the right answer rather than queueing:
 * the next tick is only minutes away, and a queue of syncs is the pile-up this
 * exists to prevent.
 *
 * The expiry is what keeps this from being a foot-gun. A run can die between
 * the claim and the release — deploy, isolate kill, action timeout — and a
 * lock with no expiry would then stop that job forever with no way to notice.
 * A lock past its expiry is simply taken over.
 * ============================================================================
 */

/**
 * Take the lock, or be told somebody else has it.
 *
 * A mutation, so the read and the write are one transaction: two firings that
 * land in the same second both see "free" in a check-then-write and both go.
 */
export const acquire = internalMutation({
  args: { name: v.string(), ttlMs: v.number() },
  returns: v.boolean(),
  handler: async (ctx, { name, ttlMs }) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("cronLocks")
      .withIndex("by_name", (q) => q.eq("name", name))
      .unique();

    if (existing !== null) {
      // Still held by a run that is genuinely alive.
      if (existing.expiresAt > now) return false;
      await ctx.db.patch(existing._id, {
        startedAt: now,
        expiresAt: now + ttlMs,
      });
      return true;
    }

    await ctx.db.insert("cronLocks", {
      name,
      startedAt: now,
      expiresAt: now + ttlMs,
    });
    return true;
  },
});

/**
 * Give the lock back. Idempotent, and safe to call from a `finally` — the row
 * is expired rather than deleted so the next run's `acquire` is one patch
 * instead of an insert, and so the last run time stays readable.
 */
export const release = internalMutation({
  args: { name: v.string() },
  returns: v.null(),
  handler: async (ctx, { name }) => {
    const existing = await ctx.db
      .query("cronLocks")
      .withIndex("by_name", (q) => q.eq("name", name))
      .unique();
    if (existing === null) return null;
    await ctx.db.patch(existing._id, { expiresAt: Date.now() });
    return null;
  },
});
