import { internalQuery } from "./_generated/server";
import { v } from "convex/values";
import type { DocumentByName, SystemDataModel } from "convex/server";

/** The `_storage` system table's row — size and content type, as stored. */
type StorageMetadata = DocumentByName<SystemDataModel, "_storage">;

/**
 * ============================================================================
 * WHO IS ALLOWED TO READ AN UPLOAD (P2)
 * ============================================================================
 *
 * `/ig-upload/<storageId>` in `http.ts` is public and has to stay public —
 * Instagram fetches the file for itself and carries no credentials of ours.
 * What it must NOT be is a general reader of Convex storage: before this, the
 * route did `ctx.storage.get(storageId)` and served whatever came back, so the
 * first feature that put anything else in storage would have published it to
 * the open internet without a line of code changing.
 *
 * So the route asks here first, and the answer is only yes for a file that a
 * live publish job is currently pointing at. Everything else — an unknown id,
 * a job whose files are already swept, a post that has gone out or been
 * canceled — is a 404, which is also what an unguessable-but-wrong id looks
 * like from outside.
 *
 * Deliberately its own module rather than a query added to
 * `convex/instagramPublishStore.ts`: that file is the publishing lifecycle and
 * this is an access check on the public edge. They change for different reasons.
 *
 * R1/5a: this used to WALK the 512 newest jobs across every workspace, because
 * `storageIds` is an array Convex cannot index. Scheduling posts 90 days ahead
 * pushed real jobs out of that window — six a day for three months is 540 —
 * so the file for a post booked for next month fell out of the 512, Instagram
 * fetched it, got a 404, and the scheduled post failed. That is the exact P1
 * bug, back through P2's scan. `igPublishFiles` is the reverse map: one row per
 * (job, file), so a storage id is looked up directly, no scan, no window.
 * ============================================================================
 */

/**
 * Statuses in which the file is of no further use to anyone. Instagram has
 * either taken the bytes already or is never going to.
 *
 * `failed` is NOT one of them: a failed job can be retried from the composer,
 * and a retry needs its file to still be reachable. A `canceled` job keeps its
 * bytes until the 24h sweep but must not serve them, so its file row lingers —
 * this status check is what refuses it.
 */
const TERMINAL_STATUSES = new Set(["published", "canceled"]);

/**
 * May this storage id be served, and as what?
 *
 * `null` is the only failure answer on purpose. "No such file", "not yours",
 * and "already published" are one 404 from outside, because telling them apart
 * would be telling an anonymous caller which storage ids exist.
 */
export const authorizeUpload = internalQuery({
  args: { storageId: v.id("_storage") },
  returns: v.union(
    v.null(),
    v.object({ contentType: v.union(v.string(), v.null()) }),
  ),
  handler: async (ctx, { storageId }) => {
    // Direct lookup (R1/5a): a file→job row exists exactly while a job still
    // points at this file. The row is written by `createJob` and removed the
    // moment the bytes are deleted (publish, sweep, purge).
    const fileRow = await ctx.db
      .query("igPublishFiles")
      .withIndex("by_storage", (q) => q.eq("storageId", storageId))
      .first();
    if (fileRow === null) return null;

    const job = await ctx.db.get(fileRow.jobId);
    if (job === null || job.filesDeletedAt !== undefined) return null;
    if (TERMINAL_STATUSES.has(job.status)) return null;

    const meta: StorageMetadata | null = await ctx.db.system.get(
      "_storage",
      storageId,
    );
    return { contentType: meta?.contentType ?? null };
  },
});
