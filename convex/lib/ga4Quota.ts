import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
export interface QuotaBucket {
  consumed: number;
  remaining: number;
}

export interface Ga4PropertyQuota {
  tokensPerDay?: QuotaBucket;
  tokensPerHour?: QuotaBucket;
  tokensPerProjectPerHour?: QuotaBucket;
  concurrentRequests?: QuotaBucket;
  serverErrorsPerProjectPerHour?: QuotaBucket;
  potentiallyThresholdedRequestsPerHour?: QuotaBucket;
}

/**
 * ============================================================================
 * GA4 DATA API RATE LIMIT & QUOTA GATE (A1)
 * ============================================================================
 *
 * Implements property quota gating modeled after Meta rate limit gate
 * (convex/lib/metaRateLimit.ts).
 *
 * Google Analytics Data API returns `propertyQuota` on requests with
 * `returnPropertyQuota: true`. We track all 6 quota dimensions:
 *   1. tokensPerDay (200,000)
 *   2. tokensPerHour (40,000)
 *   3. tokensPerProjectPerHour (14,000 - the real bottleneck)
 *   4. concurrentRequests (10)
 *   5. serverErrorsPerProjectPerHour (50)
 *   6. potentiallyThresholdedRequestsPerHour (120)
 *
 * Two gates:
 *   - Soft gate (80%): background crons stand down.
 *   - Hard gate (95%): manual sync is refused.
 *
 * TTL: 1 hour (60 minutes). A reading older than 1 hour expires and resets to "ok".
 * ============================================================================
 */

/** Over this percentage, background sync jobs stand down. */
export const QUOTA_WARN_PCT = 80;

/** Over this percentage, all sync attempts are blocked. */
export const QUOTA_STOP_PCT = 95;

/**
 * How long an hourly quota reading is considered valid (1 hour).
 * GA4 hourly token pools roll over every hour.
 */
export const QUOTA_TTL_MS = 60 * 60 * 1000;

/**
 * How long a daily quota reading is considered valid (24 hours).
 * GA4 tokensPerDay rolls over on a 24-hour cycle.
 */
export const QUOTA_DAILY_TTL_MS = 24 * 60 * 60 * 1000;

export type Ga4GateState = "ok" | "warn" | "stop";

export interface Ga4RateGate {
  state: Ga4GateState;
  peakPct: number;
  stale: boolean;
  fetchedAt?: number;
}

export function bucketUsagePct(bucket?: QuotaBucket): number {
  if (!bucket) return 0;
  const total = bucket.consumed + bucket.remaining;
  if (total <= 0) return 0;
  return (bucket.consumed / total) * 100;
}

/**
 * Calculate highest utilization percentage across the 5 hourly quota buckets.
 */
export function quotaHourlyPeak(quota: Ga4PropertyQuota): number {
  const p2 = bucketUsagePct(quota.tokensPerHour);
  const p3 = bucketUsagePct(quota.tokensPerProjectPerHour);
  const p4 = bucketUsagePct(quota.concurrentRequests);
  const p5 = bucketUsagePct(quota.serverErrorsPerProjectPerHour);
  const p6 = bucketUsagePct(quota.potentiallyThresholdedRequestsPerHour);

  return Math.max(p2, p3, p4, p5, p6);
}

/**
 * Calculate utilization percentage for daily token pool (tokensPerDay).
 */
export function quotaDailyPeak(quota: Ga4PropertyQuota): number {
  return bucketUsagePct(quota.tokensPerDay);
}

/**
 * Calculate highest utilization percentage across all 6 property quota buckets.
 */
export function quotaPeak(quota: Ga4PropertyQuota): number {
  return Math.max(quotaHourlyPeak(quota), quotaDailyPeak(quota));
}

/**
 * Determine gate state from peak usage percentage.
 */
export function determineGateState(peakPct: number): Ga4GateState {
  if (peakPct >= QUOTA_STOP_PCT) return "stop";
  if (peakPct >= QUOTA_WARN_PCT) return "warn";
  return "ok";
}

/** Background schedulers only run when gate state is "ok". */
export function allowsBackground(gate: Ga4RateGate): boolean {
  return gate.state === "ok";
}

/** Manual run allows "ok" and "warn", stopping only on "stop". */
export function allowsManual(gate: Ga4RateGate): boolean {
  return gate.state === "ok" || gate.state === "warn";
}

/**
 * Read the stored quota gate for a workspace. Passes current timestamp.
 */
export async function readGate(
  ctx: ActionCtx,
  workspaceId: Id<"workspaces">,
): Promise<Ga4RateGate> {
  return await ctx.runQuery(internal.ga4Store.getGate, {
    workspaceId,
    now: Date.now(),
  });
}

/**
 * Limit concurrency of async tasks.
 * Enforces n <= 10 because GA4's concurrentRequests limit is 10.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  n: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const concurrency = Math.max(1, Math.min(Math.floor(n), 10));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const idx = nextIndex++;
      results[idx] = await fn(items[idx]);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}
