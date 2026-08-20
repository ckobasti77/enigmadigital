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
 * ============================================================================
 */

/**
 * How many live jobs one lookup will walk.
 *
 * The index is already filtered to jobs that still HOLD BYTES — a published
 * post deletes its files immediately and the hourly sweep takes the rest — so
 * in practice this reads the handful of posts in flight plus any drafts. The
 * cap is a backstop against a pathological workspace, not a working limit, and
 * newest-first is the order that matters: Instagram fetches a file within
 * seconds of being handed the container.
 *
 * `storageIds` is an ARRAY, and Convex cannot index array membership — the
 * walk is the price of the URL shape that publishing already committed to.
 */
const LIVE_JOB_SCAN_LIMIT = 512;

/**
 * Statuses in which the file is of no further use to anyone. Instagram has
 * either taken the bytes already or is never going to.
 *
 * `failed` is NOT one of them: a failed job can be retried from the composer,
 * and a retry needs its file to still be reachable.
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
    // `filesDeletedAt: undefined` is the "still holds bytes" half of the
    // check, done by the index rather than after the read.
    const live = await ctx.db
      .query("igPublishJobs")
      .withIndex("by_pending_files_created", (q) =>
        q.eq("filesDeletedAt", undefined),
      )
      .order("desc")
      .take(LIVE_JOB_SCAN_LIMIT);

    const owner = live.find((job) => job.storageIds.includes(storageId));
    if (owner === undefined) return null;
    if (TERMINAL_STATUSES.has(owner.status)) return null;

    const meta: StorageMetadata | null = await ctx.db.system.get(
      "_storage",
      storageId,
    );
    return { contentType: meta?.contentType ?? null };
  },
});
