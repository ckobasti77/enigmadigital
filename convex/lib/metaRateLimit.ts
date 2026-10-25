import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";

/**
 * ============================================================================
 * META GRAPH API RATE LIMIT (F6)
 * ============================================================================
 *
 * Meta does not publish a fixed call ceiling. The allowance is derived from the
 * account's own traffic (roughly 4800 × impressions over 24 h) and — crucially —
 * every answer already tells us how much of it is spent:
 *
 *   X-App-Usage                 {"call_count":12,"total_cputime":3,"total_time":5}
 *   X-Business-Use-Case-Usage   {"<business-id>":[{"call_count":…, …}]}
 *
 * All three are PERCENTAGES of the current window. So the honest way to stay
 * inside the limit is not to count calls ourselves and guess — it is to read
 * what Meta just said and stop while there is still room.
 *
 * Two independent brakes live here:
 *
 *   1. The soft one — the percentages. Over 80 the background schedulers stand
 *      down; over 95 even a hand-pressed "Sinhronizuj" is refused. Nothing that
 *      a person is waiting on is ever silently delayed: the UI says so.
 *   2. The hard one — an actual refusal (HTTP 429, or error code 4 / 17 / 32).
 *      That one doubles a wait from 1 minute up to 30, per workspace, and while
 *      it is running NOTHING calls Meta, event-driven work included. There is
 *      no retry loop: each scheduled pass either goes or does not, and the next
 *      tick is the retry.
 *
 * ONE APP, MANY PROJECTS (PROJEKTI-PLAN §9). `X-App-Usage` and error code 4
 * describe the Meta APP, which every project shares; `X-Business-Use-Case-
 * Usage` and codes 17 / 32 / 613 / 429 describe one page or ad account, i.e.
 * one project. The two are kept apart: the app part goes to the shared row in
 * `globalneKvote` (`globalneKvoteStore.zabeleziMetaApp`), the BUC part to the
 * project's `metaApiUsage` row, and the gate takes the worse of the two. The
 * app percentage is not split between projects — it is a percentage, not a
 * count (decision E17) — so every project sees the same app ceiling.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * THE RULE, AND IT HAS NO EXCEPTIONS (P2)
 *
 *   EVERY call to graph.instagram.com or graph.facebook.com goes through
 *   `tracker.fetch`. A new one does too. Always.
 *
 * Both brakes above are derived from what Meta says in its ANSWERS, so a call
 * made with a bare `fetch` is not merely untracked — it is a call the gate
 * cannot see and will therefore under-count. That was the state of things
 * before P2: exactly two passes used the tracker while twenty-odd other call
 * sites (Ads every fifteen minutes, all of publishing, all of comment
 * moderation, both OAuth flows, the picture proxy) went straight out. The gate
 * reported "ok" at a hundred per cent, the banner told the operator a number
 * that was systematically too low, and background work walked into the wall.
 *
 * A pass that LOOPS must also read `tracker.throttled` between iterations and
 * stop. Meta refusing the first of thirty calls does not make the other
 * twenty-nine likelier to land; it makes the block longer.
 * ────────────────────────────────────────────────────────────────────────────
 * ============================================================================
 */

/** Over this percentage, the background schedulers (levels 2 and 3) stand down. */
export const USAGE_WARN_PCT = 80;

/** Over this percentage, only event-driven work is left running. */
export const USAGE_STOP_PCT = 95;

/**
 * How long one reading means anything at all.
 *
 * `X-App-Usage` describes a ROLLING ONE-HOUR window, so a reading older than
 * that is not a cautious estimate — it is a statement about a window that has
 * already rolled past. Without this the app would lock itself out for good:
 * one reading of 96 %, no comments overnight to produce a fresher one, and
 * levels 2 and 3 would still be standing down in the morning.
 */
export const USAGE_TTL_MS = 60 * 60 * 1000;

export const BACKOFF_MIN_MS = 60 * 1000;
export const BACKOFF_MAX_MS = 30 * 60 * 1000;

/** How long one post is left alone after an event-driven refresh. */
export const TARGETED_DEBOUNCE_MS = 30 * 1000;

export interface MetaUsage {
  callCount: number;
  cpuTime: number;
  totalTime: number;
}

const ZERO_USAGE: MetaUsage = { callCount: 0, cpuTime: 0, totalTime: 0 };

/** Meta blocks on whichever of the three runs out first, so the peak decides. */
export function usagePeak(usage: MetaUsage): number {
  return Math.max(usage.callCount, usage.cpuTime, usage.totalTime);
}

function toPercent(value: unknown): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.min(100, num);
}

function readUsageObject(raw: unknown): MetaUsage {
  if (typeof raw !== "object" || raw === null) return ZERO_USAGE;
  const obj = raw as Record<string, unknown>;
  return {
    callCount: toPercent(obj.call_count),
    cpuTime: toPercent(obj.total_cputime),
    totalTime: toPercent(obj.total_time),
  };
}

function maxUsage(a: MetaUsage, b: MetaUsage): MetaUsage {
  return {
    callCount: Math.max(a.callCount, b.callCount),
    cpuTime: Math.max(a.cpuTime, b.cpuTime),
    totalTime: Math.max(a.totalTime, b.totalTime),
  };
}

/** The two usage readings of one response, kept apart (shared app vs project). */
export interface UsageReadings {
  /** `X-App-Usage`: the Meta app, shared by every project. */
  app: MetaUsage | null;
  /** `X-Business-Use-Case-Usage`: this project's page or ad account. */
  buc: MetaUsage | null;
}

/**
 * Pull the usage percentages out of one response's headers.
 *
 * The two headers have different shapes on purpose: `X-App-Usage` is a single
 * object, while `X-Business-Use-Case-Usage` is keyed by business id and holds
 * an ARRAY per id (one entry per business use case), folded into one triple by
 * taking the highest number seen. They are returned SEPARATELY: the app reading
 * belongs to every project at once, the BUC reading to this one.
 *
 * A field is null when its header is absent, which is what a non-Graph
 * response (a CDN redirect, a network error page) looks like.
 */
export function parseUsageHeaders(headers: Headers): UsageReadings {
  let app: MetaUsage | null = null;
  let buc: MetaUsage | null = null;

  const appHeader = headers.get("x-app-usage");
  if (appHeader) {
    try {
      app = readUsageObject(JSON.parse(appHeader));
    } catch {
      // A malformed header is not worth failing a sync over.
    }
  }

  const bucHeader = headers.get("x-business-use-case-usage");
  if (bucHeader) {
    try {
      const parsed = JSON.parse(bucHeader) as Record<string, unknown>;
      for (const entries of Object.values(parsed)) {
        if (!Array.isArray(entries)) continue;
        for (const entry of entries) {
          buc = maxUsage(buc ?? ZERO_USAGE, readUsageObject(entry));
        }
      }
    } catch {
      // Same.
    }
  }

  return { app, buc };
}

/**
 * Graph API error codes that mean "you are going too fast", not "you are wrong".
 *
 * THE ONLY COPY OF THIS LIST (V3). It used to be written out three times — here,
 * in `translateModerationError` and in `translateFacebookError` — and the two
 * translators are the ones an operator reads, so a code added to only one of
 * them would produce the worst possible pairing: a sentence saying "Instagram
 * has throttled you, wait" from a path that never armed the backoff. The
 * refusal would then be re-run by the next scheduled pass ninety seconds later
 * and the block extended, while the screen claimed the situation was
 * understood.
 *
 * That cannot happen while every reader goes through `isThrottleCode`: the
 * message the operator sees and the brake the gate applies are now two answers
 * to one question, and neither can be given without the other.
 */
export const THROTTLE_CODES: ReadonlySet<number> = new Set([4, 17, 32, 613]);

/** Does this Graph API `error.code` mean "too fast"? */
export function isThrottleCode(code: number | undefined): boolean {
  return code !== undefined && THROTTLE_CODES.has(code);
}

/**
 * Code 4 is the APP's limit ("Application request limit reached"): it stops
 * every project at once. 17 (user), 32 (page) and 613 (call rate) belong to one
 * project's account, and so does a bare 429.
 */
export const APP_THROTTLE_CODE = 4;

/**
 * Whose throttle is this: the whole app's (code 4), one project's (17, 32,
 * 613, a bare 429), or not a throttle at all.
 */
export function throttleScope(
  status: number,
  body: string,
): "aplikacija" | "projekat" | null {
  let code: number | undefined;
  try {
    const parsed = JSON.parse(body) as { error?: { code?: number } };
    code = typeof parsed.error?.code === "number" ? parsed.error.code : undefined;
  } catch {
    code = undefined;
  }
  if (code === APP_THROTTLE_CODE) return "aplikacija";
  if (isThrottleCode(code) || status === 429) return "projekat";
  return null;
}

/**
 * Is this failure a throttle rather than a bad request?
 *
 * `body` is the raw error text. A 429 answers the question on its own; below
 * that, Meta signals throttling through `error.code`, and 4 / 17 / 32 / 613 are
 * the ones that mean the app, the user, or the page has run out of calls.
 */
export function isThrottleResponse(status: number, body: string): boolean {
  if (status === 429) return true;

  try {
    const parsed = JSON.parse(body) as {
      error?: { code?: number; error_subcode?: number };
    };
    const code = parsed.error?.code;
    if (typeof code === "number" && isThrottleCode(code)) return true;
  } catch {
    // Not JSON — the status was the only evidence and it said no.
  }
  return false;
}

/** Doubling wait, floored at 1 minute and capped at 30. Never unbounded. */
export function nextBackoffMs(previous?: number): number {
  if (!previous || previous < BACKOFF_MIN_MS) return BACKOFF_MIN_MS;
  return Math.min(BACKOFF_MAX_MS, previous * 2);
}

// ── The gate every scheduled pass asks before spending a call ───────────────

export type GateState = "ok" | "warn" | "stop" | "backoff";

export interface RateGate {
  state: GateState;
  /** When the next attempt makes sense; null when nothing is holding us back. */
  retryAt: number | null;
  peak: number;
}

/** Levels 2 and 3 — the background schedulers. Only a clean gate lets them run. */
export function allowsBackground(gate: RateGate): boolean {
  return gate.state === "ok";
}

/**
 * Level 1 — the event-driven refresh. Percentages do not stop it (a comment
 * that just arrived is the one call worth making), but an outright refusal does:
 * calling into a 429 buys nothing and extends the block.
 */
export function allowsTargeted(gate: RateGate): boolean {
  return gate.state !== "backoff";
}

/** A person pressed a button. Everything short of the hard ceiling goes. */
export function allowsManual(gate: RateGate): boolean {
  return gate.state === "ok" || gate.state === "warn";
}

/** Read the stored gate for a workspace (its own row and the shared app row). */
export async function readGate(
  ctx: ActionCtx,
  workspaceId: Id<"workspaces">,
): Promise<RateGate> {
  return await ctx.runQuery(internal.metaSyncStore.gate, { workspaceId });
}

// ── Usage tracker ───────────────────────────────────────────────────────────

export interface UsageTracker {
  /** Same signature as `fetch`; records whatever the answer says about usage. */
  fetch(input: string, init?: RequestInit): Promise<Response>;
  /** True once Meta has actually refused a call in this pass. */
  readonly throttled: boolean;
  readonly peak: number;
  /**
   * One write per row at the end of a pass, not one per call: the app part to
   * the shared row, the BUC part to the project's row.
   */
  flush(ctx: ActionCtx, workspaceId: Id<"workspaces">): Promise<void>;
}

/**
 * Wraps `fetch` so a sync reads the usage headers without every call site
 * remembering to. Accumulates in memory and writes ONCE, because a mutation per
 * HTTP call would cost more than the calls it is guarding.
 *
 * A failed response is cloned before the caller reads it, so throttling is
 * detected automatically — the alternative was asking twenty call sites to
 * report their error bodies back here, and nineteen of them would forget.
 */
export function createUsageTracker(): UsageTracker {
  let app: MetaUsage | null = null;
  let buc: MetaUsage | null = null;
  // Code 4 stops the whole app (every project); the rest stop this project.
  let throttledApp = false;
  let throttledProject = false;

  return {
    async fetch(input, init) {
      const res = await fetch(input, init);

      const parsed = parseUsageHeaders(res.headers);
      if (parsed.app) app = app === null ? parsed.app : maxUsage(app, parsed.app);
      if (parsed.buc) buc = buc === null ? parsed.buc : maxUsage(buc, parsed.buc);

      if (!res.ok && !throttledApp && !throttledProject) {
        try {
          const body = await res.clone().text();
          const scope = throttleScope(res.status, body);
          if (scope === "aplikacija") throttledApp = true;
          else if (scope === "projekat") throttledProject = true;
        } catch {
          // Body unavailable — the status alone still counts.
          if (res.status === 429) throttledProject = true;
        }
      }

      return res;
    },
    get throttled() {
      return throttledApp || throttledProject;
    },
    get peak() {
      return Math.max(
        app === null ? 0 : usagePeak(app),
        buc === null ? 0 : usagePeak(buc),
      );
    },
    async flush(ctx, workspaceId) {
      if (app !== null || throttledApp) {
        await ctx.runMutation(internal.globalneKvoteStore.zabeleziMetaApp, {
          ...(app ?? ZERO_USAGE),
          throttled: throttledApp,
        });
      }
      // The project's row is written whenever Meta answered at all, as before:
      // a clean answer is what ends the project's own wait.
      if (app !== null || buc !== null || throttledProject) {
        await ctx.runMutation(internal.metaSyncStore.recordUsage, {
          workspaceId,
          ...(buc ?? ZERO_USAGE),
          throttled: throttledProject,
        });
      }
    },
  };
}

/**
 * Run `body` with a tracker and flush it whatever happens (P2).
 *
 * For the call sites that were never written around a tracker — an action that
 * throws its errors at the UI, a pass with a dozen early returns — where an
 * explicit `flush` before every exit is a line somebody will eventually forget
 * to add. The reading is worth just as much on the failed path: a call that
 * came back 429 is precisely the one the gate needs to hear about.
 */
export async function withUsageTracker<T>(
  ctx: ActionCtx,
  workspaceId: Id<"workspaces">,
  body: (tracker: UsageTracker) => Promise<T>,
): Promise<T> {
  const tracker = createUsageTracker();
  try {
    return await body(tracker);
  } finally {
    await tracker.flush(ctx, workspaceId);
  }
}
