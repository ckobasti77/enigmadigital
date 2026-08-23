/**
 * ============================================================================
 * GOOGLE ADS API RATE LIMIT & QUOTA GATE
 * ============================================================================
 *
 * Implements 24-hour sliding window quota tracking for Google Ads API operations.
 *
 * Quota Rules:
 *   - 1 searchStream call = 1 operation, regardless of number of returned rows.
 *   - Paging continuation with a valid `next_page_token` = 0 operations.
 *   - Sliding 24-hour window (NOT calendar day).
 *   - Daily limit by access tier (from GOOGLE_ADS_ACCESS_LEVEL):
 *       - "explorer": 2,880 operations / 24h
 *       - "basic": 15,000 operations / 24h
 *       - "standard": 100,000 operations / 24h
 *       - Unknown / missing: fallback to lowest tier ("explorer" = 2,880).
 *
 * Pre-flight Gating:
 *   - Soft gate (80%): warning state.
 *   - Hard gate (95% or insufficient operations): returns `{ skipped: true, reason }`.
 * ============================================================================
 */

import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";

export type GoogleAdsAccessLevel = "explorer" | "basic" | "standard";

export const ACCESS_LEVEL_LIMITS: Record<GoogleAdsAccessLevel, number> = {
  explorer: 2880,
  basic: 15000,
  standard: 100000,
};

export const DEFAULT_ACCESS_LEVEL: GoogleAdsAccessLevel = "explorer";
export const DEFAULT_DAILY_LIMIT = ACCESS_LEVEL_LIMITS.explorer; // 2880

/** Over this percentage, warning state is triggered (80%). */
export const QUOTA_WARN_PCT = 80;

/** Over this percentage, all sync attempts are blocked (95%). */
export const QUOTA_STOP_PCT = 95;

/** Rolling 24-hour window in milliseconds. */
export const ROLLING_WINDOW_MS = 24 * 60 * 60 * 1000;

export type GadsGateState = "ok" | "warn" | "stop";

export interface GoogleAdsRateGate {
  state: GadsGateState;
  peakPct: number;
  consumed24h: number;
  remaining24h: number;
  dailyLimit: number;
  accessLevel: GoogleAdsAccessLevel;
  stale: boolean;
  updatedAt?: number;
}

export interface OperationLogEntry {
  timestamp: number;
  count: number;
}

export type QuotaCheckResult =
  | {
      skipped: false;
      remaining: number;
      peakPct: number;
      state: "ok" | "warn";
    }
  | {
      skipped: true;
      reason: string;
      remaining: number;
      peakPct: number;
      state: "stop";
    };

/**
 * Resolves daily operation limit based on GOOGLE_ADS_ACCESS_LEVEL env variable.
 * An unknown or missing value is strictly treated as lowest tier ("explorer" = 2,880).
 */
export function getGoogleAdsDailyLimit(accessLevelEnv?: string): {
  level: GoogleAdsAccessLevel;
  dailyLimit: number;
} {
  const raw = (
    accessLevelEnv ??
    process.env.GOOGLE_ADS_ACCESS_LEVEL ??
    ""
  )
    .trim()
    .toLowerCase();

  if (raw === "standard") {
    return { level: "standard", dailyLimit: ACCESS_LEVEL_LIMITS.standard };
  }
  if (raw === "basic") {
    return { level: "basic", dailyLimit: ACCESS_LEVEL_LIMITS.basic };
  }
  // Unknown or explorer fallback to lowest
  return { level: "explorer", dailyLimit: ACCESS_LEVEL_LIMITS.explorer };
}

/**
 * Calculates operation cost for a Google Ads API call.
 *
 * Rules:
 *   - 1 searchStream call = 1 operation, regardless of number of rows returned.
 *   - Initial search request = 1 operation.
 *   - Continuation search with a valid non-empty next_page_token = 0 operations.
 */
export function calculateOperationCost(options: {
  isSearchStream?: boolean;
  nextPageToken?: string | null;
}): number {
  if (options.isSearchStream) {
    return 1;
  }
  if (options.nextPageToken && options.nextPageToken.trim().length > 0) {
    return 0;
  }
  return 1;
}

/**
 * Prunes operations outside the sliding 24-hour window.
 */
export function pruneOperationLogs(
  entries: OperationLogEntry[],
  now: number = Date.now(),
): OperationLogEntry[] {
  const cutoff = now - ROLLING_WINDOW_MS;
  return entries.filter((e) => e.timestamp >= cutoff);
}

/**
 * Calculates rolling quota usage and gate state over the sliding 24-hour window.
 */
export function calculateRollingQuota(
  entries: OperationLogEntry[],
  dailyLimit: number,
  now: number = Date.now(),
): {
  consumed24h: number;
  remaining24h: number;
  peakPct: number;
  state: GadsGateState;
} {
  const activeEntries = pruneOperationLogs(entries, now);
  const consumed24h = activeEntries.reduce((acc, e) => acc + e.count, 0);
  const remaining24h = Math.max(0, dailyLimit - consumed24h);
  const peakPct = dailyLimit > 0 ? (consumed24h / dailyLimit) * 100 : 100;

  let state: GadsGateState = "ok";
  if (peakPct >= QUOTA_STOP_PCT) {
    state = "stop";
  } else if (peakPct >= QUOTA_WARN_PCT) {
    state = "warn";
  }

  return { consumed24h, remaining24h, peakPct, state };
}

/**
 * Pre-flight quota check before running a Google Ads synchronization job.
 * Returns `{ skipped: true, reason }` if there is insufficient quota or hard gate is hit.
 */
export function checkGoogleAdsQuota(
  consumed24h: number,
  dailyLimit: number,
  requiredOperations: number = 1,
): QuotaCheckResult {
  const remaining = Math.max(0, dailyLimit - consumed24h);
  const peakPct = dailyLimit > 0 ? (consumed24h / dailyLimit) * 100 : 100;

  if (remaining < requiredOperations || peakPct >= QUOTA_STOP_PCT) {
    return {
      skipped: true,
      reason: `Nedovoljno preostale Google Ads API kvote (preostalo ${remaining}/${dailyLimit} operacija u poslednja 24h, iskorišćenost ${peakPct.toFixed(1)}%). Sinhronizacija je odložena kako ne bi došlo do blokade naloga.`,
      remaining,
      peakPct,
      state: "stop",
    };
  }

  return {
    skipped: false,
    remaining,
    peakPct,
    state: peakPct >= QUOTA_WARN_PCT ? "warn" : "ok",
  };
}

/**
 * Reads stored quota gate for a workspace from Convex database.
 */
export async function readGadsGate(
  ctx: ActionCtx,
  workspaceId: Id<"workspaces">,
  customerId?: string,
): Promise<GoogleAdsRateGate> {
  return await ctx.runQuery(internal.googleAdsStore.getGadsGate, {
    workspaceId,
    customerId,
    now: Date.now(),
  });
}
