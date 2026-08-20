import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v, ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { providerValidator, type Provider } from "./lib/providers";
import { requireMembership, requireOwner } from "./lib/auth";
import { decryptCredentials } from "./lib/crypto";
import { PURGE_BATCH, purgeSteps } from "./lib/purgeMap";
import { revokeProviderAccess } from "./lib/revokeAccess";

/**
 * ============================================================================
 * ERASURE THAT ACTUALLY HAPPENS (P3)
 * ============================================================================
 *
 * The version this replaces was a single chain: a mutation that deleted a
 * batch and scheduled its own successor from inside the same transaction. On a
 * channel with fifty thousand rows that is around two hundred and fifty links,
 * and a chain is exactly as long as its weakest one. An OCC conflict — the
 * 15-minute comment poller writes `ytCommentLogs` and `ytQuotaUsage`, the same
 * tables the purge is emptying — rolls the transaction back TOGETHER WITH the
 * scheduled continuation. The chain is dead, nobody is told, and forty-nine
 * thousand rows of comment text and author names stay forever.
 *
 * Three things fix that, and all three are needed:
 *
 *   1. A `purgeRuns` row. Every pass commits `stepIndex` / `deletedTotal` /
 *      `updatedAt` in the same transaction as the deletions it just made, so
 *      the record of what is gone is exactly as durable as the deletions
 *      themselves. A pass that dies loses its own batch and nothing else.
 *
 *   2. A watchdog cron. It is the only thing that turns a chain into something
 *      that can be relied on: a run whose heartbeat stopped is picked back up
 *      from its last committed step, ten minutes later, with no one watching.
 *
 *   3. A fence token. The watchdog bumps it before rescheduling, and a pass
 *      whose token no longer matches the row returns without doing anything.
 *      Without it the "dead" chain that turns out to be alive would run beside
 *      the new one, and both would be deleting and double-counting.
 *
 * And the promise is only made once it is kept: `status: "done"` is written the
 * first time every step reports zero remaining rows, and at no earlier moment.
 * The connection row — the last thing that says this workspace has provider
 * data at all — is deleted in that same transaction, and not before.
 * ============================================================================
 */

/** How long a run may go untouched before the watchdog assumes it died. */
const STALL_MS = 5 * 60 * 1000;

/**
 * Consecutive watchdog restarts that delete nothing before the run is declared
 * failed. Any pass that deletes something resets the count, so a large slow
 * purge can be resumed as often as it needs to be — three restarts in a row
 * with nothing to show for them is a different thing entirely.
 */
const MAX_DEAD_RESUMES = 3;

// ── the batch pass ───────────────────────────────────────────────────────────

/**
 * Delete one batch of one provider's data, then write down where that leaves
 * things, then schedule the next pass. In that order.
 *
 * The scheduling is last for a reason: it commits with the progress or not at
 * all, so there is never a successor that believes in a step index nobody
 * wrote down.
 */
export const runPass = internalMutation({
  args: { runId: v.id("purgeRuns"), fenceToken: v.number() },
  returns: v.null(),
  handler: async (ctx, { runId, fenceToken }) => {
    const run = await ctx.db.get(runId);
    if (run === null) return null;

    // Somebody else owns this run now (watchdog restart, or a manual retry).
    // Two chains deleting at once would double-count `deletedTotal` and fight
    // each other for the same documents.
    if (run.status !== "running" || run.fenceToken !== fenceToken) return null;

    const steps = purgeSteps(run.provider);
    let stepIndex = Math.max(0, Math.min(run.stepIndex, steps.length));
    let budget = PURGE_BATCH;
    let deleted = 0;

    while (stepIndex < steps.length && budget > 0) {
      const result = await steps[stepIndex].run(ctx, run.workspaceId, budget);
      deleted += result.deleted;
      budget -= result.deleted;
      if (!result.exhausted) break; // budget spent inside this step
      stepIndex++;
    }

    const now = Date.now();
    const finished = stepIndex >= steps.length;

    await ctx.db.patch(runId, {
      stepIndex,
      deletedTotal: run.deletedTotal + deleted,
      updatedAt: now,
      // A pass that deleted something is proof the run is alive; the watchdog's
      // patience starts over.
      ...(deleted > 0 ? { resumes: 0 } : {}),
      ...(finished
        ? { status: "done" as const, finishedAt: now }
        : {}),
    });

    if (finished) {
      // Only now. The connection row is what every remaining query, cron and
      // admin path uses to find this workspace's provider data; deleting it
      // first (which is what YA2 did) turns anything left behind into rows no
      // index can reach.
      await deleteConnectionRow(ctx, run.connectionId);
      return null;
    }

    await ctx.scheduler.runAfter(0, internal.purge.runPass, {
      runId,
      fenceToken,
    });
    return null;
  },
});

/** Drop the connection row, if it is still there and still mid-disconnect. */
async function deleteConnectionRow(
  ctx: MutationCtx,
  connectionId: Id<"connections"> | undefined,
): Promise<void> {
  if (connectionId === undefined) return;
  const connection = await ctx.db.get(connectionId);
  if (connection === null) return;
  // Reconnecting during the purge writes fresh credentials and flips the row
  // back to "active". Deleting it here would then throw away a connection the
  // operator has just made.
  if (connection.status !== "disconnecting") return;
  await ctx.db.delete(connectionId);
}

// ── the watchdog ─────────────────────────────────────────────────────────────

/**
 * Restart every purge whose heartbeat has stopped (cron, every 10 minutes).
 *
 * This is the piece that makes the whole thing something to rely on rather than
 * something that usually works. It reads `by_status_updated`, so it costs one
 * indexed read on a deployment where nothing is being purged, which is almost
 * always.
 */
export const resumeStalled = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const cutoff = Date.now() - STALL_MS;
    const stalled = await ctx.db
      .query("purgeRuns")
      .withIndex("by_status_updated", (q) =>
        q.eq("status", "running").lt("updatedAt", cutoff),
      )
      .take(20);

    for (const run of stalled) {
      const deadResumes = run.resumes + 1;

      if (deadResumes > MAX_DEAD_RESUMES) {
        // Say so out loud. Silently retrying forever, or silently stopping, is
        // the behaviour this rewrite exists to remove.
        await ctx.db.patch(run._id, {
          status: "failed",
          updatedAt: Date.now(),
          finishedAt: Date.now(),
          lastError: `Brisanje se zaustavilo na koraku ${run.stepIndex + 1} i nije nastavljeno ni posle ${MAX_DEAD_RESUMES} pokušaja. Obrisano je ${run.deletedTotal} redova. Klikni „Pokušaj ponovo”.`,
        });
        continue;
      }

      const fenceToken = run.fenceToken + 1;
      await ctx.db.patch(run._id, {
        fenceToken,
        resumes: deadResumes,
        updatedAt: Date.now(),
      });

      // A run that never got past the revoke step has no credentials wiped and
      // no batches run yet, so it restarts from there rather than from the
      // deletions.
      if (run.revokeStatus === "pending") {
        await ctx.scheduler.runAfter(0, internal.purge.revokeAndStart, {
          runId: run._id,
          fenceToken,
        });
      } else {
        await ctx.scheduler.runAfter(0, internal.purge.runPass, {
          runId: run._id,
          fenceToken,
        });
      }
    }
    return null;
  },
});

// ── revoke, then wipe, then delete ───────────────────────────────────────────

/**
 * The credentials, one last time, for the revoke call — and nothing else.
 *
 * Returns ciphertext to an action that immediately decrypts it, which is the
 * same trip every sync action already makes (`connections.getForSync`).
 */
export const credentialsForRevoke = internalQuery({
  args: { runId: v.id("purgeRuns"), fenceToken: v.number() },
  returns: v.union(
    v.null(),
    v.object({
      provider: providerValidator,
      encryptedCredentials: v.string(),
      encryptedUserCredentials: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, { runId, fenceToken }) => {
    const run = await ctx.db.get(runId);
    if (run === null || run.status !== "running") return null;
    if (run.fenceToken !== fenceToken) return null;
    if (run.connectionId === undefined) return null;

    const connection = await ctx.db.get(run.connectionId);
    if (connection === null) return null;

    return {
      provider: connection.provider,
      encryptedCredentials: connection.encryptedCredentials,
      encryptedUserCredentials: connection.encryptedUserCredentials ?? null,
    };
  },
});

/**
 * Hand the token back to the provider, then start the deletions.
 *
 * An action rather than a mutation because it makes an outbound call, and the
 * outbound call has to happen while the credentials still exist. Everything it
 * can go wrong on is caught: whatever the provider answers, `finishRevoke`
 * runs, the credentials are destroyed and the erasure begins. A revoke that
 * failed becomes a sentence on the card, not a reason to keep the data.
 */
export const revokeAndStart = internalAction({
  args: { runId: v.id("purgeRuns"), fenceToken: v.number() },
  returns: v.null(),
  handler: async (ctx, { runId, fenceToken }) => {
    let status: "ok" | "failed" | "unsupported" = "failed";
    let error: string | undefined =
      "Opoziv nije pokušan jer kredencijali više nisu bili dostupni.";

    try {
      const credentials = await ctx.runQuery(
        internal.purge.credentialsForRevoke,
        { runId, fenceToken },
      );
      if (credentials === null) return null; // superseded, or already wiped

      const secret = await decryptCredentials(credentials.encryptedCredentials);
      const userSecret =
        credentials.encryptedUserCredentials === null
          ? undefined
          : await decryptCredentials(credentials.encryptedUserCredentials);

      const outcome = await revokeProviderAccess(
        credentials.provider,
        secret,
        userSecret,
      );
      status = outcome.status;
      error = outcome.error;
    } catch (caught) {
      status = "failed";
      error = `Opoziv nije uspeo: ${
        caught instanceof Error ? caught.message : "nepoznata greška"
      }`;
    }

    await ctx.runMutation(internal.purge.finishRevoke, {
      runId,
      fenceToken,
      revokeStatus: status,
      ...(error !== undefined ? { revokeError: error } : {}),
    });
    return null;
  },
});

/**
 * Record what the revoke did, destroy the stored credentials, and let the
 * batches go.
 *
 * The credentials are cleared HERE rather than at disconnect time, because
 * clearing them earlier is what made revocation impossible in the first place.
 */
export const finishRevoke = internalMutation({
  args: {
    runId: v.id("purgeRuns"),
    fenceToken: v.number(),
    revokeStatus: v.union(
      v.literal("ok"),
      v.literal("failed"),
      v.literal("unsupported"),
    ),
    revokeError: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { runId, fenceToken, revokeStatus, revokeError }) => {
    const run = await ctx.db.get(runId);
    if (run === null) return null;
    if (run.status !== "running" || run.fenceToken !== fenceToken) return null;

    if (run.connectionId !== undefined) {
      const connection = await ctx.db.get(run.connectionId);
      if (connection !== null && connection.status === "disconnecting") {
        await ctx.db.patch(run.connectionId, {
          encryptedCredentials: "",
          encryptedUserCredentials: undefined,
        });
      }
    }

    await ctx.db.patch(runId, {
      revokeStatus,
      ...(revokeError !== undefined ? { revokeError } : {}),
      updatedAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.purge.runPass, {
      runId,
      fenceToken,
    });
    return null;
  },
});

// ── starting one ─────────────────────────────────────────────────────────────

/**
 * Open a run for `connections.remove`. Called from inside that mutation, so it
 * commits with the "disconnecting" flag on the connection or not at all.
 */
export async function beginPurgeRun(
  ctx: MutationCtx,
  args: {
    workspaceId: Id<"workspaces">;
    provider: Provider;
    connectionId: Id<"connections">;
  },
): Promise<Id<"purgeRuns">> {
  const now = Date.now();
  const runId = await ctx.db.insert("purgeRuns", {
    workspaceId: args.workspaceId,
    provider: args.provider,
    connectionId: args.connectionId,
    startedAt: now,
    updatedAt: now,
    status: "running",
    stepIndex: 0,
    deletedTotal: 0,
    fenceToken: 1,
    resumes: 0,
    revokeStatus: "pending",
  });
  await ctx.scheduler.runAfter(0, internal.purge.revokeAndStart, {
    runId,
    fenceToken: 1,
  });
  return runId;
}

/** Forget a finished run, so a fresh connection does not inherit its notice. */
export async function clearFinishedRuns(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  provider: Provider,
): Promise<void> {
  const rows = await ctx.db
    .query("purgeRuns")
    .withIndex("by_workspace_provider", (q) =>
      q.eq("workspaceId", workspaceId).eq("provider", provider),
    )
    .collect();
  for (const row of rows) {
    if (row.status !== "running") await ctx.db.delete(row._id);
  }
}

// ── what Settings reads ──────────────────────────────────────────────────────

const purgeRunViewValidator = v.object({
  provider: providerValidator,
  status: v.union(v.literal("running"), v.literal("done"), v.literal("failed")),
  startedAt: v.number(),
  updatedAt: v.number(),
  finishedAt: v.union(v.number(), v.null()),
  deletedTotal: v.number(),
  lastError: v.union(v.string(), v.null()),
  revokeStatus: v.union(
    v.literal("pending"),
    v.literal("ok"),
    v.literal("failed"),
    v.literal("unsupported"),
  ),
  revokeError: v.union(v.string(), v.null()),
});

/**
 * The state of the most recent erasure per provider.
 *
 * Reading is deliberately open to every member, not just the owner: "is my data
 * gone yet" is not a privileged question, and a viewer who watched an owner
 * press the button deserves the same answer.
 */
export const status = query({
  args: {},
  returns: v.array(purgeRunViewValidator),
  handler: async (ctx) => {
    const { workspaceId } = await requireMembership(ctx);
    const rows = await ctx.db
      .query("purgeRuns")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();

    const latest = new Map<Provider, Doc<"purgeRuns">>();
    for (const row of rows) {
      const current = latest.get(row.provider);
      if (current === undefined || row.startedAt > current.startedAt) {
        latest.set(row.provider, row);
      }
    }

    return [...latest.values()].map((row) => ({
      provider: row.provider,
      status: row.status,
      startedAt: row.startedAt,
      updatedAt: row.updatedAt,
      finishedAt: row.finishedAt ?? null,
      deletedTotal: row.deletedTotal,
      lastError: row.lastError ?? null,
      revokeStatus: row.revokeStatus,
      revokeError: row.revokeError ?? null,
    }));
  },
});

/**
 * "Pokušaj ponovo" — pick a failed run back up from where it stopped.
 *
 * It resumes rather than restarts: `stepIndex` and `deletedTotal` describe
 * deletions that really happened, and throwing them away would re-walk tables
 * that are already empty for no reason.
 */
export const retry = mutation({
  args: { provider: providerValidator },
  returns: v.null(),
  handler: async (ctx, { provider }) => {
    const { workspaceId } = await requireOwner(ctx);

    const rows = await ctx.db
      .query("purgeRuns")
      .withIndex("by_workspace_provider", (q) =>
        q.eq("workspaceId", workspaceId).eq("provider", provider),
      )
      .collect();
    const failed = rows
      .filter((row) => row.status === "failed")
      .sort((a, b) => b.startedAt - a.startedAt)[0];

    if (failed === undefined) {
      throw new ConvexError({
        code: "invalid",
        message: "Nema neuspelog brisanja koje bi se ponovilo.",
      });
    }

    const fenceToken = failed.fenceToken + 1;
    await ctx.db.patch(failed._id, {
      status: "running",
      fenceToken,
      resumes: 0,
      lastError: undefined,
      finishedAt: undefined,
      updatedAt: Date.now(),
    });

    if (failed.revokeStatus === "pending") {
      await ctx.scheduler.runAfter(0, internal.purge.revokeAndStart, {
        runId: failed._id,
        fenceToken,
      });
    } else {
      await ctx.scheduler.runAfter(0, internal.purge.runPass, {
        runId: failed._id,
        fenceToken,
      });
    }
    return null;
  },
});
