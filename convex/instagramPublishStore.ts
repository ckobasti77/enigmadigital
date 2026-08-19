import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v, ConvexError } from "convex/values";
import type { DocumentByName, SystemDataModel } from "convex/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireMembership } from "./lib/auth";
import {
  PROCESSING_DEADLINE_MS,
  UPLOAD_TTL_MS,
  acceptsCaption,
  acceptsShareToFeed,
  checkCaption,
  checkFile,
  checkItemCount,
  checkScheduledFor,
  retryDelayMs,
  type PublishKind,
} from "./lib/igPublish";

/** The `_storage` system table's row — size and content type, as stored. */
type StorageMetadata = DocumentByName<SystemDataModel, "_storage">;

/**
 * ============================================================================
 * INSTAGRAM PUBLISHING — PERSISTENCE & QUEUE (V8 Runtime)
 * ============================================================================
 *
 * Everything about an Instagram post that is NOT an HTTP call to Meta lives
 * here: creating the job, claiming it, moving it through its states, listing
 * it for the screen, and the two crons that keep the table honest.
 *
 * The split from `instagramPublish.ts` is the same one the rest of this
 * codebase uses — a transaction layer and an action layer — and it earns its
 * keep here in particular: the state transitions have to be atomic (two cron
 * ticks must not publish the same post twice), and only a mutation can promise
 * that.
 * ============================================================================
 */

const kindValidator = v.union(
  v.literal("IMAGE"),
  v.literal("REEL"),
  v.literal("STORY"),
  v.literal("CAROUSEL"),
);

const statusValidator = v.union(
  v.literal("draft"),
  v.literal("queued"),
  v.literal("uploading"),
  v.literal("processing"),
  v.literal("published"),
  v.literal("failed"),
  v.literal("canceled"),
);

function invalid(message: string): never {
  throw new ConvexError({ code: "invalid", message });
}

/**
 * The host Instagram will fetch the file from.
 *
 * `CONVEX_SITE_URL` is the deployment's own HTTP endpoint, where the public
 * `/ig-upload/` route lives. It is read once at creation and frozen onto the
 * job, so a deployment moving hosts cannot leave a half-published post
 * pointing at an address that no longer answers.
 */
function uploadBaseUrl(): string {
  const site = process.env.CONVEX_SITE_URL?.trim().replace(/\/+$/, "");
  if (!site) {
    invalid(
      "Adresa Convex HTTP servera nije poznata, pa Instagram nema odakle da preuzme fajl.",
    );
  }
  return site;
}

export function uploadUrlFor(storageId: Id<"_storage">): string {
  return `${uploadBaseUrl()}/ig-upload/${encodeURIComponent(storageId)}`;
}

// ── getting the file into the backend ────────────────────────────────────────

/**
 * A one-shot URL the browser POSTs the file to.
 *
 * The bytes go straight from the machine that has them into Convex storage,
 * never through an action: a Reel is up to a gigabyte, and an action has
 * neither the memory nor the time for that. What comes back is a storage id,
 * and that id is the whole of the job's input.
 */
export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireMembership(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

// ── creating a job ───────────────────────────────────────────────────────────

/**
 * Queue a post — now, or at a chosen moment.
 *
 * Every rule the composer applied is applied again here, from the file's own
 * stored metadata rather than from what the browser claimed about it. The
 * composer is not the only thing that can call this, and a size or a content
 * type asserted by a client is not evidence.
 *
 * What cannot be re-checked in a mutation is what needs the bytes: an image's
 * aspect ratio and a video's duration. Those are checked in the browser, and
 * again in the publish action for images (which can read the file), and
 * Instagram's own container `ERROR` status is the last line for video.
 */
export const createJob = mutation({
  args: {
    kind: kindValidator,
    caption: v.optional(v.string()),
    shareToFeed: v.optional(v.boolean()),
    storageIds: v.array(v.id("_storage")),
    scheduledFor: v.optional(v.number()),
  },
  returns: v.id("igPublishJobs"),
  handler: async (
    ctx,
    { kind, caption, shareToFeed, storageIds, scheduledFor },
  ) => {
    const { workspaceId, userId } = await requireMembership(ctx);
    const now = Date.now();

    const countProblem = checkItemCount(kind, storageIds.length);
    if (countProblem !== null) invalid(countProblem);

    // The same file twice is a carousel with a duplicate slide, and far more
    // likely a double-add than an intention.
    if (new Set(storageIds).size !== storageIds.length) {
      invalid("Isti fajl je dodat više puta.");
    }

    const trimmedCaption = acceptsCaption(kind) ? (caption ?? "").trim() : "";
    const captionProblem = checkCaption({ kind, caption: trimmedCaption });
    if (captionProblem !== null) invalid(captionProblem);

    const contentTypes: string[] = [];
    for (const storageId of storageIds) {
      const meta: StorageMetadata | null = await ctx.db.system.get(
        "_storage",
        storageId,
      );
      if (meta === null) {
        invalid("Fajl više nije dostupan. Dodaj ga ponovo i pošalji.");
      }
      const contentType = meta.contentType ?? "";
      const fileProblem = checkFile({
        kind,
        size: meta.size,
        type: contentType,
      });
      if (fileProblem !== null) invalid(fileProblem);
      contentTypes.push(contentType);
    }

    if (scheduledFor !== undefined) {
      const scheduleProblem = checkScheduledFor(scheduledFor, now);
      if (scheduleProblem !== null) invalid(scheduleProblem);
    }

    // An immediate post also carries a `scheduledFor` — of "now". That single
    // field is what lets the 1-minute cron be a safety net rather than a
    // separate mechanism: anything still `queued` and due gets picked up, no
    // matter why its direct run never happened.
    const dueAt = scheduledFor ?? now;

    const jobId = await ctx.db.insert("igPublishJobs", {
      workspaceId,
      kind,
      ...(trimmedCaption.length > 0 ? { caption: trimmedCaption } : {}),
      ...(acceptsShareToFeed(kind)
        ? { shareToFeed: shareToFeed ?? true }
        : {}),
      storageIds,
      mediaUrls: storageIds.map(uploadUrlFor),
      contentTypes,
      scheduledFor: dueAt,
      status: "queued",
      attempts: 0,
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
    });

    if (scheduledFor === undefined) {
      await ctx.scheduler.runAfter(0, internal.instagramPublish.runPublishJob, {
        jobId,
      });
    }

    return jobId;
  },
});

/**
 * Call off a post that has not started yet.
 *
 * Deliberately only from `queued`: once a container exists Instagram holds a
 * copy of the file, and a "cancel" that leaves that copy publishable would be
 * a lie. The files stay put until the 24h sweep — a cancel is often a change
 * of mind, and the row is already the record of what happened.
 */
export const cancelJob = mutation({
  args: { jobId: v.id("igPublishJobs") },
  returns: v.null(),
  handler: async (ctx, { jobId }) => {
    const { workspaceId } = await requireMembership(ctx);
    const job = await ctx.db.get(jobId);
    if (job === null || job.workspaceId !== workspaceId) {
      invalid("Objava nije pronađena.");
    }
    if (job.status !== "queued") {
      invalid(
        job.status === "published"
          ? "Objava je već otišla na Instagram i ne može se povući odavde."
          : "Objava je već krenula i ne može se otkazati.",
      );
    }
    await ctx.db.patch(jobId, { status: "canceled", updatedAt: Date.now() });
    return null;
  },
});

/**
 * Send a failed post again.
 *
 * `attempts` goes back to zero: this is a person deciding to try, not the
 * automatic retry chain continuing, and the automatic chain has already given
 * up. The container id is deliberately KEPT — if the last run died between
 * creating a container and publishing it, the retry publishes that same
 * container instead of building a second copy of the same post.
 */
export const retryJob = mutation({
  args: { jobId: v.id("igPublishJobs") },
  returns: v.null(),
  handler: async (ctx, { jobId }) => {
    const { workspaceId } = await requireMembership(ctx);
    const job = await ctx.db.get(jobId);
    if (job === null || job.workspaceId !== workspaceId) {
      invalid("Objava nije pronađena.");
    }
    if (job.status !== "failed") {
      invalid("Ponovo se šalju samo objave koje nisu uspele.");
    }
    if (job.filesDeletedAt !== undefined) {
      invalid(
        "Fajlovi ove objave su obrisani posle 24 h. Napravi novu objavu i dodaj ih ponovo.",
      );
    }

    const now = Date.now();
    await ctx.db.patch(jobId, {
      status: "queued",
      attempts: 0,
      error: undefined,
      scheduledFor: now,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.instagramPublish.runPublishJob, {
      jobId,
    });
    return null;
  },
});

// ── what the screen reads ────────────────────────────────────────────────────

const jobViewValidator = v.object({
  _id: v.id("igPublishJobs"),
  kind: kindValidator,
  caption: v.optional(v.string()),
  shareToFeed: v.optional(v.boolean()),
  itemCount: v.number(),
  status: statusValidator,
  scheduledFor: v.optional(v.number()),
  attempts: v.number(),
  error: v.optional(v.string()),
  publishedMediaId: v.optional(v.string()),
  publishedAt: v.optional(v.number()),
  filesDeleted: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

/** How many rows of each status the panel ever needs to show. */
const LIVE_TAKE = 25;
const CLOSED_TAKE = 8;

/**
 * Recent publishing jobs, newest first.
 *
 * Read per status rather than by time, because that is what the panel is: the
 * ones still going, the ones that failed, and a short tail of the ones that
 * ended. Storage ids and the public file URLs are NOT returned — the screen
 * has the local file it just picked, and a public address to somebody's
 * unpublished video has no business travelling any further than it must.
 */
export const listJobs = query({
  args: {},
  returns: v.array(jobViewValidator),
  handler: async (ctx) => {
    const { workspaceId } = await requireMembership(ctx);

    const groups: Array<[Doc<"igPublishJobs">["status"], number]> = [
      ["queued", LIVE_TAKE],
      ["uploading", LIVE_TAKE],
      ["processing", LIVE_TAKE],
      ["failed", LIVE_TAKE],
      ["published", CLOSED_TAKE],
      ["canceled", CLOSED_TAKE],
    ];

    const rows: Doc<"igPublishJobs">[] = [];
    for (const [status, take] of groups) {
      const batch = await ctx.db
        .query("igPublishJobs")
        .withIndex("by_workspace_status", (q) =>
          q.eq("workspaceId", workspaceId).eq("status", status),
        )
        .order("desc")
        .take(take);
      rows.push(...batch);
    }

    return rows
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((row) => ({
        _id: row._id,
        kind: row.kind,
        ...(row.caption !== undefined ? { caption: row.caption } : {}),
        ...(row.shareToFeed !== undefined
          ? { shareToFeed: row.shareToFeed }
          : {}),
        itemCount: row.storageIds.length,
        status: row.status,
        ...(row.scheduledFor !== undefined
          ? { scheduledFor: row.scheduledFor }
          : {}),
        attempts: row.attempts,
        ...(row.error !== undefined ? { error: row.error } : {}),
        ...(row.publishedMediaId !== undefined
          ? { publishedMediaId: row.publishedMediaId }
          : {}),
        ...(row.publishedAt !== undefined
          ? { publishedAt: row.publishedAt }
          : {}),
        filesDeleted: row.filesDeletedAt !== undefined,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }));
  },
});

// ── the run: claiming, advancing, finishing ──────────────────────────────────

const claimValidator = v.object({
  workspaceId: v.id("workspaces"),
  connectionId: v.id("connections"),
  igUserId: v.string(),
  encryptedCredentials: v.string(),
  kind: kindValidator,
  caption: v.optional(v.string()),
  shareToFeed: v.optional(v.boolean()),
  mediaUrls: v.array(v.string()),
  contentTypes: v.array(v.string()),
  storageIds: v.array(v.id("_storage")),
  containerId: v.optional(v.string()),
  childContainerIds: v.optional(v.array(v.string())),
  processingSince: v.optional(v.number()),
  attempts: v.number(),
  /** `true` when this run created the claim, `false` for a polling round. */
  fresh: v.boolean(),
});

/**
 * Take ownership of a job, or refuse.
 *
 * This is the ONE place that decides a run may proceed, and it has to be a
 * mutation to mean anything: the cron and a direct `runAfter(0)` can both aim
 * at the same job in the same second, and only a transaction can let exactly
 * one of them win. The loser reads back `null` and stops.
 *
 * A job already `processing` is claimed WITHOUT a state change — that is a
 * polling round continuing, not a new attempt, and it must not spend one.
 */
export const claimJob = internalMutation({
  args: { jobId: v.id("igPublishJobs") },
  returns: v.union(v.null(), claimValidator),
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get(jobId);
    if (job === null) return null;
    if (job.status !== "queued" && job.status !== "processing") return null;

    const connection = await ctx.db
      .query("connections")
      .withIndex("by_workspace_provider", (q) =>
        q.eq("workspaceId", job.workspaceId).eq("provider", "meta_ig"),
      )
      .unique();

    const now = Date.now();
    if (connection === null || !connection.externalId) {
      await ctx.db.patch(jobId, {
        status: "failed",
        error:
          "Instagram nije povezan. Poveži nalog u Podešavanjima pa napravi objavu ponovo.",
        updatedAt: now,
      });
      return null;
    }

    const fresh = job.status === "queued";
    if (fresh) {
      await ctx.db.patch(jobId, {
        status: "uploading",
        attempts: job.attempts + 1,
        error: undefined,
        updatedAt: now,
      });
    }

    return {
      workspaceId: job.workspaceId,
      connectionId: connection._id,
      igUserId: connection.externalId,
      encryptedCredentials: connection.encryptedCredentials,
      kind: job.kind,
      ...(job.caption !== undefined ? { caption: job.caption } : {}),
      ...(job.shareToFeed !== undefined
        ? { shareToFeed: job.shareToFeed }
        : {}),
      mediaUrls: job.mediaUrls,
      contentTypes: job.contentTypes,
      storageIds: job.storageIds,
      ...(job.containerId !== undefined
        ? { containerId: job.containerId }
        : {}),
      ...(job.childContainerIds !== undefined
        ? { childContainerIds: job.childContainerIds }
        : {}),
      ...(job.processingSince !== undefined
        ? { processingSince: job.processingSince }
        : {}),
      attempts: fresh ? job.attempts + 1 : job.attempts,
      fresh,
    };
  },
});

/**
 * Record carousel slides as they are created.
 *
 * Written one by one rather than all at the end so that a run which dies half
 * way through a ten-slide carousel does not make the retry build ten more
 * containers — it picks up from the slide it stopped on.
 */
export const saveChildContainers = internalMutation({
  args: {
    jobId: v.id("igPublishJobs"),
    childContainerIds: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { jobId, childContainerIds }) => {
    const job = await ctx.db.get(jobId);
    if (job === null) return null;
    await ctx.db.patch(jobId, { childContainerIds, updatedAt: Date.now() });
    return null;
  },
});

/**
 * The container exists — Instagram now has the file and is chewing on it.
 * `processingSince` is stamped here, so the deadline is measured from the
 * moment the wait actually began rather than from when the job was made.
 */
export const markProcessing = internalMutation({
  args: {
    jobId: v.id("igPublishJobs"),
    containerId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { jobId, containerId }) => {
    const job = await ctx.db.get(jobId);
    if (job === null) return null;
    const now = Date.now();
    await ctx.db.patch(jobId, {
      status: "processing",
      containerId,
      processingSince: now,
      updatedAt: now,
    });
    return null;
  },
});

/**
 * It is on the profile.
 *
 * The files go now, in the same transaction — Instagram has its own copy, and
 * keeping somebody's video on our disk past the moment it stops being needed
 * is a decision nobody made. The insights sync is nudged too, so the post
 * appears on the panel within seconds instead of at the next six-hour run.
 */
export const markPublished = internalMutation({
  args: {
    jobId: v.id("igPublishJobs"),
    /**
     * Absent in exactly one case: the container came back already `PUBLISHED`,
     * meaning an earlier run got the post out but died before writing the id
     * down. The post exists either way, and inventing an id for it would be
     * worse than a card with no link on it.
     */
    publishedMediaId: v.optional(v.string()),
    connectionId: v.id("connections"),
  },
  returns: v.null(),
  handler: async (ctx, { jobId, publishedMediaId, connectionId }) => {
    const job = await ctx.db.get(jobId);
    if (job === null) return null;

    const now = Date.now();
    for (const storageId of job.storageIds) {
      try {
        await ctx.storage.delete(storageId);
      } catch {
        // Already gone is the outcome we wanted anyway.
      }
    }

    await ctx.db.patch(jobId, {
      status: "published",
      ...(publishedMediaId !== undefined ? { publishedMediaId } : {}),
      publishedAt: now,
      error: undefined,
      filesDeletedAt: now,
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(0, internal.instagram.syncIgInsights, {
      connectionId,
    });
    return null;
  },
});

/**
 * The run did not get there.
 *
 * Whether that is the end depends only on how many attempts this job has
 * already spent: under the ceiling it goes back to `queued` with a due time,
 * and the ordinary 1-minute cron picks it up — the retry needs no machinery of
 * its own. At the ceiling it stops, with the reason left where the operator
 * will look for it.
 */
export const markFailure = internalMutation({
  args: {
    jobId: v.id("igPublishJobs"),
    message: v.string(),
    /** Skip the retry chain: nothing about this failure will change on its own. */
    terminal: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, { jobId, message, terminal = false }) => {
    const job = await ctx.db.get(jobId);
    if (job === null) return null;
    if (job.status === "published" || job.status === "canceled") return null;

    const now = Date.now();
    const delay = terminal ? null : retryDelayMs(job.attempts);

    if (delay === null) {
      await ctx.db.patch(jobId, {
        status: "failed",
        error: message,
        updatedAt: now,
      });
      return null;
    }

    await ctx.db.patch(jobId, {
      status: "queued",
      error: message,
      scheduledFor: now + delay,
      updatedAt: now,
    });
    return null;
  },
});

// ── the public /ig-upload/ route's one question ──────────────────────────────

/**
 * The stored content type of an uploaded file.
 *
 * The route serves the blob's bytes but takes the header from here: Convex
 * records the type at upload time, and a `Content-Type` guessed from bytes is
 * exactly the kind of detail Instagram's fetcher refuses over.
 */
export const getUploadContentType = internalQuery({
  args: { storageId: v.id("_storage") },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, { storageId }) => {
    const meta: StorageMetadata | null = await ctx.db.system.get(
      "_storage",
      storageId,
    );
    if (meta === null) return null;
    return meta.contentType ?? "application/octet-stream";
  },
});

// ── crons ────────────────────────────────────────────────────────────────────

/** How many due jobs one cron tick starts. The rest wait a minute. */
const DUE_BATCH = 10;

/**
 * Every minute: start whatever is due.
 *
 * Reads `queued` jobs whose moment has arrived, across every workspace, and
 * hands each to the publish action. It never runs anything itself — the claim
 * inside `claimJob` decides who actually gets the job, so scheduling the same
 * job twice is harmless.
 */
export const enqueueDueJobs = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const due = await ctx.db
      .query("igPublishJobs")
      .withIndex("by_status_scheduled", (q) =>
        q.eq("status", "queued").lte("scheduledFor", now),
      )
      .take(DUE_BATCH);

    for (const job of due) {
      await ctx.scheduler.runAfter(
        0,
        internal.instagramPublish.runPublishJob,
        { jobId: job._id },
      );
    }
    return null;
  },
});

/** How many old jobs one sweep looks at. */
const SWEEP_BATCH = 50;

/**
 * Every hour: take back the disk.
 *
 * A published post deletes its own files the moment it succeeds. This is for
 * everything else — the failed, the cancelled, and the one that has been
 * "processing" since yesterday — where the file was deliberately kept so a
 * retry would have something to send. Twenty-four hours is also exactly how
 * long an Instagram container lives, so nothing that could still be published
 * loses its bytes.
 *
 * A job still moving is left alone no matter its age; only the state is
 * cleared, never the row.
 */
export const sweepExpiredUploads = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const cutoff = Date.now() - UPLOAD_TTL_MS;
    const old = await ctx.db
      .query("igPublishJobs")
      .withIndex("by_pending_files_created", (q) =>
        q.eq("filesDeletedAt", undefined).lt("createdAt", cutoff),
      )
      .take(SWEEP_BATCH);

    for (const job of old) {
      // Bytes are only taken from a job that is standing still. One mid-upload
      // is rare at this age and cheap to leave for the next hour.
      if (job.status === "uploading") continue;
      await deleteJobFiles(ctx, job);
    }
    return null;
  },
});

async function deleteJobFiles(
  ctx: MutationCtx,
  job: Doc<"igPublishJobs">,
): Promise<void> {
  for (const storageId of job.storageIds) {
    try {
      await ctx.storage.delete(storageId);
    } catch {
      // Already gone is the outcome we wanted anyway.
    }
  }

  const now = Date.now();
  // A job that has been "processing" for a day is not processing. Instagram's
  // container is expired by now too, so saying so is not a guess.
  const stalled =
    job.status === "processing" &&
    now - (job.processingSince ?? job.createdAt) > PROCESSING_DEADLINE_MS;

  await ctx.db.patch(job._id, {
    filesDeletedAt: now,
    ...(stalled
      ? {
          status: "failed" as const,
          error:
            "Instagram nikada nije javio da je obrada gotova. Kontejner je istekao posle 24 h.",
        }
      : {}),
    updatedAt: now,
  });
}

// ── what the publishing-limit action needs ───────────────────────────────────

/**
 * The caller's Instagram connection, credentials included.
 *
 * Internal because of that last part: the encrypted token is read here and
 * decrypted inside the action, and neither half ever reaches a client.
 */
export const getConnectionForWorkspace = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  returns: v.union(
    v.null(),
    v.object({
      connectionId: v.id("connections"),
      igUserId: v.optional(v.string()),
      encryptedCredentials: v.string(),
      status: v.union(
        v.literal("active"),
        v.literal("error"),
        v.literal("expired"),
      ),
    }),
  ),
  handler: async (ctx, { workspaceId }) => {
    const connection = await ctx.db
      .query("connections")
      .withIndex("by_workspace_provider", (q) =>
        q.eq("workspaceId", workspaceId).eq("provider", "meta_ig"),
      )
      .unique();
    if (connection === null) return null;
    return {
      connectionId: connection._id,
      ...(connection.externalId !== undefined
        ? { igUserId: connection.externalId }
        : {}),
      encryptedCredentials: connection.encryptedCredentials,
      status: connection.status,
    };
  },
});

/** Membership for an action, which cannot reach `ctx.db` itself. */
export const membershipForAction = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(v.null(), v.object({ workspaceId: v.id("workspaces") })),
  handler: async (ctx, { userId }) => {
    const membership = await ctx.db
      .query("members")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (membership === null) return null;
    return { workspaceId: membership.workspaceId };
  },
});

/** Re-exported for the action, which validates the same `kind` values. */
export type { PublishKind };
