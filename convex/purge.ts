import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v, ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { providerValidator, type Provider } from "./lib/providers";
import { requireMembership, requireOwner } from "./lib/auth";
import { decryptCredentials } from "./lib/crypto";
import { PURGE_BATCH, purgeSteps } from "./lib/purgeMap";
import { manualRevokeMessage, revokeProviderAccess } from "./lib/revokeAccess";

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

/**
 * How many full verification re-scans may run before the erasure gives up
 * (R1/4b). Each cycle re-walks every step; the run is "done" only after one
 * cycle deletes nothing. If new rows keep arriving after three, something is
 * still writing and the run fails loudly rather than sealing them in.
 */
const MAX_FINAL_SWEEPS = 3;

/**
 * How many times the token is handed back to the provider before the erasure
 * stops trying and tells the operator to do it by hand (R1/4d).
 */
const MAX_REVOKE_ATTEMPTS = 3;

/** Growing wait between revoke attempts, kept below `STALL_MS` on purpose. */
function revokeRetryDelayMs(attempts: number): number {
  return attempts <= 1 ? 60 * 1000 : 3 * 60 * 1000;
}

/**
 * The connection this run is erasing, but ONLY if it is still the same grant
 * (R1/4c). A reconnect flips the row back to `active` and bumps `generation`; a
 * later disconnect makes a NEW run against a NEW generation. Either way a stale
 * chain reads `null` here and stops, so it can never reach into a reconnected
 * account's data.
 */
async function loadPurgeConnection(
  ctx: QueryCtx,
  run: Doc<"purgeRuns">,
): Promise<Doc<"connections"> | null> {
  if (run.connectionId === undefined) return null;
  const connection = await ctx.db.get(run.connectionId);
  if (connection === null) return null;
  if (connection.status !== "disconnecting") return null;
  if ((connection.generation ?? 0) !== (run.connectionGeneration ?? 0)) {
    return null;
  }
  return connection;
}

/**
 * Seal the run as done — but only when BOTH halves are finished (R1/4b, 4d).
 *
 * Deletion runs in parallel with the revoke retries, and the connection row
 * (which still holds the credentials the revoke needs) must survive until the
 * revoke has settled. So "done" and the connection-row deletion wait for
 * `deletionDone` AND a revoke that is no longer `pending`. Idempotent: whichever
 * half finishes last calls it, and a second call finds the run already done.
 */
async function maybeFinalize(
  ctx: MutationCtx,
  runId: Id<"purgeRuns">,
): Promise<void> {
  const run = await ctx.db.get(runId);
  if (run === null || run.status !== "running") return;
  if (run.deletionDone !== true) return;
  // Revoke still retrying — keep the row and its credentials alive.
  if (run.revokeStatus === "pending") return;

  const now = Date.now();
  await ctx.db.patch(runId, { status: "done", finishedAt: now, updatedAt: now });
  await deleteConnectionRow(ctx, run);
}

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

    // The connection must still be the disconnecting grant this run opened for
    // (R1/4c). A reconnect flips it to "active" and bumps `generation`; carrying
    // on would delete the reconnected account's live data. `runPass` reads the
    // connection every pass, not just `run.status`, precisely so a chain the
    // watchdog resumed after a reconnect stops here instead.
    const connection = await loadPurgeConnection(ctx, run);
    if (connection === null) {
      const now = Date.now();
      await ctx.db.patch(runId, {
        status: "failed",
        updatedAt: now,
        finishedAt: now,
        lastError:
          "Veza je u međuvremenu promenjena (ponovo povezana ili prekinuta iznova), pa je brisanje zaustavljeno da ne bi diralo nove podatke.",
      });
      return null;
    }

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
    const reachedEnd = stepIndex >= steps.length;
    const verifying = (run.finalSweeps ?? 0) > 0;
    const aliveReset = deleted > 0 ? { resumes: 0 } : {};

    // More work left inside this traversal (forward pass, or a verification
    // cycle) — commit progress and continue.
    if (!reachedEnd) {
      await ctx.db.patch(runId, {
        stepIndex,
        deletedTotal: run.deletedTotal + deleted,
        updatedAt: now,
        ...(verifying ? { sweepDeleted: (run.sweepDeleted ?? 0) + deleted } : {}),
        ...aliveReset,
      });
      await ctx.scheduler.runAfter(0, internal.purge.runPass, { runId, fenceToken });
      return null;
    }

    // Reached the end of the FORWARD pass. Do not declare "done" yet: a webhook
    // write that landed in an already-finished step's table (R1/4b) is only
    // caught by re-scanning every step and finding nothing. Begin cycle 1.
    if (!verifying) {
      await ctx.db.patch(runId, {
        stepIndex: 0,
        deletedTotal: run.deletedTotal + deleted,
        finalSweeps: 1,
        sweepDeleted: 0,
        updatedAt: now,
        ...aliveReset,
      });
      await ctx.scheduler.runAfter(0, internal.purge.runPass, { runId, fenceToken });
      return null;
    }

    // Reached the end of a VERIFICATION cycle. If the whole cycle deleted
    // nothing, deletion is provably complete.
    const sweepTotal = (run.sweepDeleted ?? 0) + deleted;
    if (sweepTotal === 0) {
      await ctx.db.patch(runId, {
        stepIndex,
        deletedTotal: run.deletedTotal + deleted,
        updatedAt: now,
        deletionDone: true,
        ...aliveReset,
      });
      // Finalises only if the revoke has also settled; otherwise the revoke
      // side will finalise when it does (R1/4d).
      await maybeFinalize(ctx, runId);
      return null;
    }

    // Stragglers were found and cleared this cycle. Go round again, bounded — if
    // rows keep arriving after MAX_FINAL_SWEEPS, something is still writing and
    // the run fails loudly instead of sealing them in.
    const nextSweep = (run.finalSweeps ?? 1) + 1;
    if (nextSweep > MAX_FINAL_SWEEPS) {
      await ctx.db.patch(runId, {
        status: "failed",
        updatedAt: now,
        finishedAt: now,
        deletedTotal: run.deletedTotal + deleted,
        lastError: `Novi redovi su nastavljali da stižu i posle ${MAX_FINAL_SWEEPS} kontrolna prolaza; deo podataka je možda ostao. Proveri da je veza stvarno prekinuta pa klikni „Pokušaj ponovo”.`,
      });
      return null;
    }
    await ctx.db.patch(runId, {
      stepIndex: 0,
      deletedTotal: run.deletedTotal + deleted,
      finalSweeps: nextSweep,
      sweepDeleted: 0,
      updatedAt: now,
      ...aliveReset,
    });
    await ctx.scheduler.runAfter(0, internal.purge.runPass, { runId, fenceToken });
    return null;
  },
});

/**
 * Drop the connection row, but only if it is still the same disconnecting grant
 * this run was erasing (R1/4c).
 *
 * The connection row is what every remaining query, cron and admin path uses to
 * find this workspace's provider data; deleting it first (which is what YA2 did)
 * turns anything left behind into rows no index can reach — so it goes last, and
 * only for the exact grant that was erased.
 */
async function deleteConnectionRow(
  ctx: MutationCtx,
  run: Doc<"purgeRuns">,
): Promise<void> {
  const connection = await loadPurgeConnection(ctx, run);
  if (connection === null) return;
  await ctx.db.delete(connection._id);
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

      // Revoke and deletion are independent chains now (R1/4d): restart whichever
      // is still outstanding. Both are gated by the fresh fence token, so any
      // copy still alive from before stops on its next write.
      if (run.revokeStatus === "pending") {
        await ctx.scheduler.runAfter(0, internal.purge.revokeAndStart, {
          runId: run._id,
          fenceToken,
        });
      }
      if (run.deletionDone !== true) {
        await ctx.scheduler.runAfter(0, internal.purge.runPass, {
          runId: run._id,
          fenceToken,
        });
      }
      // Both halves already finished but the run never got sealed (the isolate
      // died between the last write and `maybeFinalize`) — finish it here.
      if (run.revokeStatus !== "pending" && run.deletionDone === true) {
        await maybeFinalize(ctx, run._id);
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

    // Only revoke while this is still the disconnecting grant the run opened for
    // (R1/4d). Without this the watchdog could revoke a token the operator has
    // since reconnected — the retry loop would keep trying long after a fresh
    // grant replaced the old one.
    const connection = await loadPurgeConnection(ctx, run);
    if (connection === null) return null;
    // Already wiped by a settled attempt — nothing left to revoke with.
    if (connection.encryptedCredentials.length === 0) return null;

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
 * Record one revoke attempt (R1/4d).
 *
 * A FAILED attempt with tries left keeps the credentials and schedules a retry:
 * the old code wiped the token on the first failure, so ten seconds of Google
 * latency left a `youtube.force-ssl` grant alive forever, unrevokable. Only when
 * the revoke settles — success, "unsupported", or the last failed attempt — are
 * the credentials destroyed. On exhaustion the card says the operator has to do
 * it by hand, with the link.
 *
 * Deletion is NOT scheduled from here: it runs in parallel (started in
 * `beginPurgeRun`), so a slow revoke never holds the data. `revokeStatus`
 * staying `pending` is what keeps the run from finalising while a retry is out.
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

    const connection = await loadPurgeConnection(ctx, run);
    const now = Date.now();
    const attempts = (run.revokeAttempts ?? 0) + 1;
    const settledOk = revokeStatus === "ok" || revokeStatus === "unsupported";
    const exhausted = attempts >= MAX_REVOKE_ATTEMPTS;

    // Superseded by a reconnect (R1/4c): these credentials belong to the new
    // grant. Do not wipe or retry — record the attempt and let the run's own
    // connection checks stop the chain.
    if (connection === null) {
      await ctx.db.patch(runId, { revokeAttempts: attempts, updatedAt: now });
      return null;
    }

    // Failed, but tries remain: keep the token, stay `pending`, retry later.
    if (!settledOk && !exhausted) {
      await ctx.db.patch(runId, {
        revokeStatus: "pending",
        revokeAttempts: attempts,
        ...(revokeError !== undefined ? { revokeError } : {}),
        updatedAt: now,
      });
      await ctx.scheduler.runAfter(
        revokeRetryDelayMs(attempts),
        internal.purge.revokeAndStart,
        { runId, fenceToken },
      );
      return null;
    }

    // Settled. Now — and only now — the stored token is destroyed.
    await ctx.db.patch(connection._id, {
      encryptedCredentials: "",
      encryptedUserCredentials: undefined,
    });

    const finalError = settledOk
      ? revokeError
      : manualRevokeMessage(connection.provider);

    await ctx.db.patch(runId, {
      revokeStatus: settledOk ? revokeStatus : "failed",
      ...(finalError !== undefined ? { revokeError: finalError } : {}),
      revokeAttempts: attempts,
      updatedAt: now,
    });

    // If deletion already finished, this is the last piece — finalise (R1/4d).
    await maybeFinalize(ctx, runId);
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
  const connection = await ctx.db.get(args.connectionId);
  const runId = await ctx.db.insert("purgeRuns", {
    workspaceId: args.workspaceId,
    provider: args.provider,
    connectionId: args.connectionId,
    // The grant this run is bound to (R1/4c): a later reconnect bumps this on
    // the row and the run stops.
    connectionGeneration: connection?.generation ?? 0,
    startedAt: now,
    updatedAt: now,
    status: "running",
    stepIndex: 0,
    deletedTotal: 0,
    fenceToken: 1,
    resumes: 0,
    revokeStatus: "pending",
    revokeAttempts: 0,
  });
  // Revoke and deletion run in PARALLEL (R1/4d). Deletion needs no credentials,
  // so it must not wait behind revoke retries that can span minutes; the
  // connection row survives (holding the token) until the revoke settles.
  await ctx.scheduler.runAfter(0, internal.purge.revokeAndStart, {
    runId,
    fenceToken: 1,
  });
  await ctx.scheduler.runAfter(0, internal.purge.runPass, {
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
    // If deletion had not finished, give it a FRESH forward pass + verification
    // (R1/4b): a run that failed because stragglers kept arriving would
    // otherwise inherit the exhausted `finalSweeps`/`sweepDeleted` and fail on
    // its first pass again. `deletedTotal` is kept — re-walking empty tables is
    // cheap and those deletions really happened.
    const restartDeletion = failed.deletionDone !== true;
    await ctx.db.patch(failed._id, {
      status: "running",
      fenceToken,
      resumes: 0,
      lastError: undefined,
      finishedAt: undefined,
      updatedAt: Date.now(),
      ...(restartDeletion
        ? { stepIndex: 0, finalSweeps: undefined, sweepDeleted: undefined }
        : {}),
    });

    // Pick up whichever half had not finished (R1/4d). A revoke that exhausted
    // its tries is `failed`, not `pending`, so retrying does not re-hammer it.
    if (failed.revokeStatus === "pending") {
      await ctx.scheduler.runAfter(0, internal.purge.revokeAndStart, {
        runId: failed._id,
        fenceToken,
      });
    }
    if (restartDeletion) {
      await ctx.scheduler.runAfter(0, internal.purge.runPass, {
        runId: failed._id,
        fenceToken,
      });
    }
    if (failed.revokeStatus !== "pending" && !restartDeletion) {
      await maybeFinalize(ctx, failed._id);
    }
    return null;
  },
});
