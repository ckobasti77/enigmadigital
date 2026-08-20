import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";

/**
 * The action-side half of the cron self-overlap lock (P2). The table and the
 * mutations live in `convex/cronLocks.ts`; this is the one-line wrapper every
 * scheduled pass uses.
 */

/** Names, in one place, so a typo cannot quietly give a job two locks. */
export const CRON_LOCKS = {
  igHeadCheck: "meta:ig:head",
  fbHeadCheck: "meta:fb:head",
  metaHourly: "meta:hourly",
  igDeletion: "meta:ig:deletion",
  igSync: "meta:ig:sync",
  fbSync: "meta:fb:sync",
  igTokens: "meta:ig:tokens",
  fbTokens: "meta:fb:tokens",
  adsStructure: "meta:ads:structure",
  adsHot: "meta:ads:hot",
  adsAll: "meta:ads:all",
  adRules: "meta:ads:rules",
} as const;

/**
 * A lock's expiry is a statement about how long the job could legitimately
 * take, not about its cadence. Generous on purpose: expiring early would let a
 * second copy start over a run that is merely slow, which is the exact thing
 * the lock is here to prevent.
 */
export const CRON_LOCK_TTL_MS = 15 * 60 * 1000;

/**
 * Run `body` while holding the named lock; do nothing at all if another run
 * still holds it.
 *
 * Skipping rather than waiting is deliberate — the next tick is the retry, and
 * a queue of waiting syncs is the pile-up this prevents.
 */
export async function withCronLock(
  ctx: ActionCtx,
  name: string,
  body: () => Promise<void>,
  ttlMs: number = CRON_LOCK_TTL_MS,
): Promise<void> {
  const acquired: boolean = await ctx.runMutation(internal.cronLocks.acquire, {
    name,
    ttlMs,
  });
  if (!acquired) {
    console.warn(`Preskočen prolaz „${name}” — prethodni još traje.`);
    return;
  }

  try {
    await body();
  } finally {
    await ctx.runMutation(internal.cronLocks.release, { name });
  }
}
