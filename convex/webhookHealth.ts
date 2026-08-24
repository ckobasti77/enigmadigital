import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireMembership } from "./lib/auth";
import {
  hasSignatureSecret,
  signatureFailureReason,
  type WebhookRoute,
} from "./lib/webhookSecrets";

/**
 * Whether Meta's webhooks are getting through — and if not, which variable is
 * to blame (P3, point 7).
 *
 * A rejected signature answers 401 and writes nothing. That is the worst shape
 * a failure can take: Meta keeps retrying, then unsubscribes the app, and the
 * only symptom anyone sees is that comments stopped arriving weeks ago. So
 * every refusal is counted here, with the moment it last happened and the name
 * of the environment variable that would fix it, and the Facebook card reads it
 * back out.
 *
 * The table has no `workspaceId`: the signature is checked before the payload
 * is parsed, so there is no workspace to attribute a refusal to yet.
 */

const routeValidator = v.union(
  v.literal("instagram"),
  v.literal("facebook"),
  v.literal("threads"),
);

/**
 * At most one failure write per route per minute (R1/5e).
 *
 * Both webhook routes are PUBLIC and write here on EVERY rejected request. Two
 * Settings cards subscribe reactively to this exact row, so an unauthenticated
 * flood of bad signatures used to hammer it — one write per garbage request,
 * each an OCC conflict against the cards. The counter is a health signal, not an
 * audit ledger: "broken" reads the same whether it counted 3 or 3000, so once a
 * minute is plenty and the flood cannot turn the row into the storm it names.
 */
const FAILURE_WRITE_INTERVAL_MS = 60 * 1000;

/** Called by the webhook route when `X-Hub-Signature-256` does not verify. */
export const recordSignatureFailure = internalMutation({
  args: { route: routeValidator, reason: v.string() },
  returns: v.null(),
  handler: async (ctx, { route, reason }) => {
    const existing = await ctx.db
      .query("webhookSignatureFailures")
      .withIndex("by_route", (q) => q.eq("route", route))
      .unique();

    const now = Date.now();
    if (existing === null) {
      await ctx.db.insert("webhookSignatureFailures", {
        route,
        failures: 1,
        lastFailureAt: now,
        lastReason: reason,
      });
      return null;
    }
    // Inside the window: the row already says "recently failing", so drop the
    // write rather than churn the document the cards are watching (R1/5e).
    if (now - existing.lastFailureAt < FAILURE_WRITE_INTERVAL_MS) {
      return null;
    }
    await ctx.db.patch(existing._id, {
      failures: existing.failures + 1,
      lastFailureAt: now,
      lastReason: reason,
    });
    return null;
  },
});

/**
 * Called when a signature DOES verify.
 *
 * A counter on its own cannot tell "broken since the day it was set up" from
 * "one stray probe last Tuesday", and the card would cry wolf over the second
 * one forever.
 */
export const recordSignatureOk = internalMutation({
  args: { route: routeValidator },
  returns: v.null(),
  handler: async (ctx, { route }) => {
    const existing = await ctx.db
      .query("webhookSignatureFailures")
      .withIndex("by_route", (q) => q.eq("route", route))
      .unique();
    if (existing === null) return null;
    await ctx.db.patch(existing._id, { lastOkAt: Date.now() });
    return null;
  },
});

const routeHealthValidator = v.object({
  route: routeValidator,
  failures: v.number(),
  lastFailureAt: v.union(v.number(), v.null()),
  lastOkAt: v.union(v.number(), v.null()),
  reason: v.union(v.string(), v.null()),
  /** Whether ANY candidate variable for this route is set at all. */
  secretConfigured: v.boolean(),
});

/** Signature health per route, for the Settings cards. */
export const status = query({
  args: {},
  returns: v.array(routeHealthValidator),
  handler: async (ctx) => {
    await requireMembership(ctx);

    const routes: WebhookRoute[] = ["instagram", "facebook", "threads"];
    const out = [];
    for (const route of routes) {
      const row = await ctx.db
        .query("webhookSignatureFailures")
        .withIndex("by_route", (q) => q.eq("route", route))
        .unique();
      out.push({
        route,
        failures: row?.failures ?? 0,
        lastFailureAt: row?.lastFailureAt ?? null,
        lastOkAt: row?.lastOkAt ?? null,
        // The stored reason is what the verifier said at the time; the live one
        // reflects the environment as it is now, which is what a person fixing
        // it needs to read.
        reason:
          row === null || row.failures === 0
            ? null
            : signatureFailureReason(route),
        secretConfigured: hasSignatureSecret(route),
      });
    }
    return out;
  },
});
