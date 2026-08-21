import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v, ConvexError } from "convex/values";
import type { DocumentByName, SystemDataModel } from "convex/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireMembership } from "./lib/auth";
import { connectionStatusValidator } from "./lib/providers";
import {
  ABANDONED_AFTER_DUE_MS,
  MAX_ATTEMPTS,
  STALE_PROCESSING_MS,
  STALE_PUBLISHING_MS,
  STALE_UPLOADING_MS,
  UPLOAD_TTL_MS,
  acceptsCaption,
  acceptsShareToFeed,
  checkAltText,
  checkAudioName,
  checkCaption,
  checkFile,
  checkItemCount,
  checkScheduledFor,
  checkTrialGraduationStrategy,
  checkUserTags,
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
  v.literal("publishing"),
  v.literal("published"),
  v.literal("failed"),
  v.literal("canceled"),
);

/**
 * The statuses that mean "a run owns this right now".
 *
 * Every one of them is a claim made by an action that may not be alive any
 * more, which is why each has a staleness threshold rather than being trusted.
 */
const RUNNING_STATUSES = ["uploading", "processing", "publishing"] as const;

const STALE_AFTER_MS: Record<(typeof RUNNING_STATUSES)[number], number> = {
  uploading: STALE_UPLOADING_MS,
  processing: STALE_PROCESSING_MS,
  publishing: STALE_PUBLISHING_MS,
};

/** Statuses a job can still leave under its own power. */
const LIVE_STATUSES = [
  "draft",
  "queued",
  "uploading",
  "processing",
  "publishing",
] as const;

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

/**
 * Write down that a file arrived, before anything owns it.
 *
 * The browser learns a storage id only by finishing the upload, so between
 * that moment and `createJob` the bytes are referenced by nothing at all. If
 * `createJob` then refuses the post — the scheduled time slipped into the past
 * while a gigabyte was moving, the caption grew too long — or the tab is
 * simply closed, that file stays on the disk forever: the sweep walks
 * `igPublishJobs`, and no job names it.
 *
 * This is the receipt that closes that gap. `createJob` tears it up when the
 * job takes the file over, so a row surviving past the TTL means exactly one
 * thing, and the sweep can act on it without checking anything else.
 */
export const registerUpload = mutation({
  args: { storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, { storageId }) => {
    const { workspaceId } = await requireMembership(ctx);

    const meta: StorageMetadata | null = await ctx.db.system.get(
      "_storage",
      storageId,
    );
    if (meta === null) invalid("Fajl nije stigao. Dodaj ga ponovo i pošalji.");

    // The same upload registered twice is one file, not two receipts.
    const existing = await ctx.db
      .query("igPublishUploads")
      .withIndex("by_storage", (q) => q.eq("storageId", storageId))
      .first();
    if (existing !== null) return null;

    await ctx.db.insert("igPublishUploads", {
      workspaceId,
      storageId,
      createdAt: Date.now(),
    });
    return null;
  },
});

/**
 * Hand the files over from the upload receipts to the job that will send them.
 *
 * Deleting the receipt IS the handover: from here on the job row is what names
 * these bytes, and the job row is what the sweep reads.
 */
async function claimUploads(
  ctx: MutationCtx,
  storageIds: Id<"_storage">[],
): Promise<void> {
  for (const storageId of storageIds) {
    const receipt = await ctx.db
      .query("igPublishUploads")
      .withIndex("by_storage", (q) => q.eq("storageId", storageId))
      .first();
    // No receipt is not a problem: a caller that never registered still gets a
    // working job, it just never had a gap to close.
    if (receipt !== null) await ctx.db.delete(receipt._id);
  }
}

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
    userTags: v.optional(
      v.array(
        v.object({
          username: v.string(),
          x: v.optional(v.number()),
          y: v.optional(v.number()),
        }),
      ),
    ),
    locationId: v.optional(v.string()),
    altText: v.optional(v.string()),
    audioName: v.optional(v.string()),
    trialGraduationStrategy: v.optional(
      v.union(v.literal("MANUAL"), v.literal("SS_PERFORMANCE")),
    ),
  },
  returns: v.id("igPublishJobs"),
  handler: async (
    ctx,
    {
      kind,
      caption,
      shareToFeed,
      storageIds,
      scheduledFor,
      userTags,
      locationId,
      altText,
      audioName,
      trialGraduationStrategy,
    },
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

    const altTextProblem = checkAltText({ kind, altText });
    if (altTextProblem !== null) invalid(altTextProblem);

    const userTagsProblem = checkUserTags({ kind, userTags });
    if (userTagsProblem !== null) invalid(userTagsProblem);

    const audioNameProblem = checkAudioName({ kind, audioName });
    if (audioNameProblem !== null) invalid(audioNameProblem);

    const trialProblem = checkTrialGraduationStrategy({
      kind,
      strategy: trialGraduationStrategy,
    });
    if (trialProblem !== null) invalid(trialProblem);

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

    // The same files, already on their way out.
    //
    // A double-clicked button is caught in the browser; this catches the thing
    // the browser cannot — the same call arriving twice because the first one's
    // answer was lost on the way back. The client would retry believing nothing
    // happened, and two identical posts would go out.
    if (await hasLiveJobWithSameFiles(ctx, workspaceId, storageIds)) {
      invalid(
        "Ista objava je već poslata i još je u toku. Sačekaj da se završi ili je otkaži u listi.",
      );
    }

    // An immediate post also carries a `scheduledFor` — of "now". That single
    // field is what lets the 1-minute cron be a safety net rather than a
    // separate mechanism: anything still `queued` and due gets picked up, no
    // matter why its direct run never happened.
    const dueAt = scheduledFor ?? now;

    const trimmedLocationId = locationId?.trim();
    const trimmedAltText = altText?.trim();
    const trimmedAudioName = audioName?.trim();

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
      ...(userTags && userTags.length > 0 ? { userTags } : {}),
      ...(trimmedLocationId && trimmedLocationId.length > 0
        ? { locationId: trimmedLocationId }
        : {}),
      ...(kind === "IMAGE" && trimmedAltText && trimmedAltText.length > 0
        ? { altText: trimmedAltText }
        : {}),
      ...(kind === "REEL" && trimmedAudioName && trimmedAudioName.length > 0
        ? { audioName: trimmedAudioName }
        : {}),
      ...(kind === "REEL" && trialGraduationStrategy
        ? { trialGraduationStrategy }
        : {}),
      scheduledFor: dueAt,
      status: "queued",
      attempts: 0,
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
    });

    // The reverse map the public /ig-upload/ route reads (R1/5a): one row per
    // file, looked up by storage id with no scan. Removed when the files go.
    for (const storageId of storageIds) {
      await ctx.db.insert("igPublishFiles", { workspaceId, storageId, jobId });
    }

    await claimUploads(ctx, storageIds);

    if (scheduledFor === undefined) {
      await ctx.scheduler.runAfter(0, internal.instagramPublish.runPublishJob, {
        jobId,
      });
    }

    return jobId;
  },
});

/**
 * Is this exact set of files already on its way to Instagram?
 *
 * Compared as a SET, not as a list: the same pictures in a different carousel
 * order are the same upload being sent twice, and reordering slides is not a
 * reason to let a duplicate through.
 */
async function hasLiveJobWithSameFiles(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  storageIds: Id<"_storage">[],
): Promise<boolean> {
  const wanted = new Set<string>(storageIds);

  for (const status of LIVE_STATUSES) {
    const rows = await ctx.db
      .query("igPublishJobs")
      .withIndex("by_workspace_status", (q) =>
        q.eq("workspaceId", workspaceId).eq("status", status),
      )
      .order("desc")
      .take(LIVE_TAKE);

    for (const row of rows) {
      if (row.storageIds.length !== wanted.size) continue;
      if (row.storageIds.every((id) => wanted.has(id))) return true;
    }
  }
  return false;
}

/**
 * Has a run been holding this job past the point where a run could still exist?
 *
 * `claimedAt` is refreshed by every claim, including a polling round, so this
 * measures silence rather than duration: a fifteen-minute video that is being
 * actively waited on reports in every few minutes, and one whose action was
 * killed reports never again.
 *
 * A row written before `claimedAt` existed has none, and is stale by
 * definition — nothing is running that could have claimed it.
 */
function isStaleClaim(job: Doc<"igPublishJobs">, now: number): boolean {
  const threshold =
    STALE_AFTER_MS[job.status as (typeof RUNNING_STATUSES)[number]];
  if (threshold === undefined) return false;
  return now - (job.claimedAt ?? job.updatedAt) > threshold;
}

/**
 * Call off a post that is not going anywhere.
 *
 * `queued` is the ordinary case — nothing has been handed to Instagram yet.
 *
 * A job stuck in `uploading` or `processing` is the other one, and refusing it
 * was a trap: the run that claimed it is dead, the cron only ever looked at
 * `queued`, and the operator was left with a row that said "šalje se" forever
 * and offered neither cancel, nor retry, nor publish. Cancelling is allowed
 * there precisely because the run is provably gone.
 *
 * `publishing` is NEVER cancellable, stale or not. `media_publish` has been
 * sent and its answer is unknown, so the post may already be on the profile —
 * writing "otkazano" over that would be the interface stating something false.
 * That job gets reclaimed and asks Instagram what actually happened.
 *
 * The files stay put until the 24h sweep — a cancel is often a change of mind,
 * and the row is already the record of what happened.
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

    const now = Date.now();
    const cancellable =
      job.status === "queued" ||
      ((job.status === "uploading" || job.status === "processing") &&
        isStaleClaim(job, now));

    if (!cancellable) {
      invalid(
        job.status === "published"
          ? "Objava je već otišla na Instagram i ne može se povući odavde."
          : job.status === "publishing"
            ? "Objava je predata Instagramu i odgovor se još čeka — možda je već otišla. Sačekaj da se stanje razreši."
            : "Objava je već krenula i ne može se otkazati.",
      );
    }

    await ctx.db.patch(jobId, { status: "canceled", updatedAt: now });
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
  /** Published, but which post it is could not be established. */
  mediaIdUnconfirmed: v.optional(v.boolean()),
  publishedAt: v.optional(v.number()),
  filesDeleted: v.boolean(),
  /** The panel offers "Otkaži" over a stuck job, and has to know it is stuck. */
  cancellable: v.boolean(),
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
      ["publishing", LIVE_TAKE],
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

    const now = Date.now();
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
        ...(row.mediaIdUnconfirmed === true
          ? { mediaIdUnconfirmed: true }
          : {}),
        ...(row.publishedAt !== undefined
          ? { publishedAt: row.publishedAt }
          : {}),
        filesDeleted: row.filesDeletedAt !== undefined,
        cancellable:
          row.status === "queued" ||
          ((row.status === "uploading" || row.status === "processing") &&
            isStaleClaim(row, now)),
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
  userTags: v.optional(
    v.array(
      v.object({
        username: v.string(),
        x: v.optional(v.number()),
        y: v.optional(v.number()),
      }),
    ),
  ),
  locationId: v.optional(v.string()),
  altText: v.optional(v.string()),
  audioName: v.optional(v.string()),
  trialGraduationStrategy: v.optional(
    v.union(v.literal("MANUAL"), v.literal("SS_PERFORMANCE")),
  ),
  containerId: v.optional(v.string()),
  childContainerIds: v.optional(v.array(v.string())),
  processingSince: v.optional(v.number()),
  publishStartedAt: v.optional(v.number()),
  attempts: v.number(),
  /** `true` when this run created the claim, `false` for a polling round. */
  fresh: v.boolean(),
  /**
   * The fence token for this claim (R1/1). Minted fresh on every claim and
   * written to the row, so a second claim invalidates the first. Every state
   * transition below carries it back and is refused on a mismatch — the run
   * that no longer owns the job stops instead of publishing beside the one that
   * does.
   */
  runToken: v.string(),
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

    // An expired token answers every Graph call with the same OAuth refusal,
    // and three attempts spaced over twenty minutes arrive at it three times.
    // Nothing about it changes without a person, so the job says so at once.
    //
    // `error` is deliberately NOT treated the same way: it is written by any
    // failed sync pass (convex/sync.ts) and usually says nothing about the
    // token, so refusing to publish over it would block perfectly good posts.
    if (connection.status === "expired") {
      await ctx.db.patch(jobId, {
        status: "failed",
        error:
          "Pristupni token Instagram naloga je istekao. Poveži nalog ponovo u Podešavanjima, pa pošalji objavu iz liste.",
        updatedAt: now,
      });
      return null;
    }

    // Backfill the file→job rows for a job created before they existed (R1/5a).
    // The public `/ig-upload/` route now authorises by these rows, so a job
    // still holding bytes must have them before Instagram is handed the URL.
    // One indexed read per claim; the insert runs once and never again.
    if (job.filesDeletedAt === undefined && job.storageIds.length > 0) {
      const anyFileRow = await ctx.db
        .query("igPublishFiles")
        .withIndex("by_job", (q) => q.eq("jobId", jobId))
        .first();
      if (anyFileRow === null) {
        for (const storageId of job.storageIds) {
          await ctx.db.insert("igPublishFiles", {
            workspaceId: job.workspaceId,
            storageId,
            jobId,
          });
        }
      }
    }

    const fresh = job.status === "queued";
    // A fresh fence token per claim. Two schedulers can aim at the same
    // queued/processing job in the same second; both write a token, the second
    // overwrites the first, and every later transition the loser tries is
    // refused because the row no longer carries its token (R1/1).
    const runToken = crypto.randomUUID();
    await ctx.db.patch(jobId, {
      // Stamped on EVERY claim, polling rounds included: this is what makes
      // "uploading since 09:00" distinguishable from "a run that died at
      // 09:00 and left the word there". A live poll refreshes it every few
      // minutes; a dead run never does.
      claimedAt: now,
      runToken,
      ...(fresh
        ? {
            status: "uploading" as const,
            attempts: job.attempts + 1,
            error: undefined,
          }
        : {}),
      updatedAt: now,
    });

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
      ...(job.userTags !== undefined ? { userTags: job.userTags } : {}),
      ...(job.locationId !== undefined ? { locationId: job.locationId } : {}),
      ...(job.altText !== undefined ? { altText: job.altText } : {}),
      ...(job.audioName !== undefined ? { audioName: job.audioName } : {}),
      ...(job.trialGraduationStrategy !== undefined
        ? { trialGraduationStrategy: job.trialGraduationStrategy }
        : {}),
      ...(job.containerId !== undefined
        ? { containerId: job.containerId }
        : {}),
      ...(job.childContainerIds !== undefined
        ? { childContainerIds: job.childContainerIds }
        : {}),
      ...(job.processingSince !== undefined
        ? { processingSince: job.processingSince }
        : {}),
      ...(job.publishStartedAt !== undefined
        ? { publishStartedAt: job.publishStartedAt }
        : {}),
      attempts: fresh ? job.attempts + 1 : job.attempts,
      fresh,
      runToken,
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
    runToken: v.string(),
  },
  // `false` = this run no longer owns the job (R1/1); the caller must stop.
  returns: v.boolean(),
  handler: async (ctx, { jobId, childContainerIds, runToken }) => {
    const job = await ctx.db.get(jobId);
    if (job === null || job.runToken !== runToken) return false;
    await ctx.db.patch(jobId, { childContainerIds, updatedAt: Date.now() });
    return true;
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
    runToken: v.string(),
  },
  // `false` = the fence token no longer matches; the run lost the job (R1/1).
  returns: v.boolean(),
  handler: async (ctx, { jobId, containerId, runToken }) => {
    const job = await ctx.db.get(jobId);
    if (job === null || job.runToken !== runToken) return false;
    const now = Date.now();
    await ctx.db.patch(jobId, {
      status: "processing",
      containerId,
      processingSince: now,
      updatedAt: now,
    });
    return true;
  },
});

/**
 * `media_publish` is about to be sent.
 *
 * Written BEFORE the call rather than after it, and that ordering is the whole
 * point. A run can die between sending the request and reading the answer, and
 * from the next run's side that looks exactly like a request that was never
 * sent — same job, same container, same `FINISHED`. The difference is here.
 *
 * A run that finds `publishing` on a job does not send anything: it asks the
 * container, and a container that answers `PUBLISHED` ends the job. See
 * `convex/instagramPublish.ts`.
 */
export const markPublishing = internalMutation({
  args: { jobId: v.id("igPublishJobs"), runToken: v.string() },
  // `false` = the run lost the fence token and must NOT send `media_publish`
  // (R1/1). This is the last transition before the irreversible call, so it is
  // the one that matters most.
  returns: v.boolean(),
  handler: async (ctx, { jobId, runToken }) => {
    const job = await ctx.db.get(jobId);
    if (job === null || job.runToken !== runToken) return false;

    const now = Date.now();
    await ctx.db.patch(jobId, {
      status: "publishing",
      publishStartedAt: now,
      claimedAt: now,
      updatedAt: now,
    });
    return true;
  },
});

/**
 * It is on the profile.
 *
 * The files go now, in the same transaction — Instagram has its own copy, and
 * keeping somebody's video on our disk past the moment it stops being needed
 * is a decision nobody made.
 *
 * What is scheduled afterwards is ONE post being read, not a sync. A full
 * `syncIgInsights` used to be fired from here: about fifty Graph calls, and —
 * because F6 put its rate-limit gate on the cron fan-out rather than on the
 * sync itself — fifty calls straight through an active backoff. Eight posts
 * scheduled for the same minute meant four hundred calls in under a minute and
 * eight phantom rows in Sync Health. The targeted refresh goes through the
 * gate, debounces, and costs three calls for the one post that actually
 * changed. Without a confirmed media id there is nothing to target, and the
 * two-minute head check finds the post on its own for the price of one call.
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
    /** Set instead, when the id could not be established at all. */
    mediaIdUnconfirmed: v.optional(v.boolean()),
    connectionId: v.id("connections"),
    runToken: v.string(),
  },
  // `false` = the run lost the fence token (R1/1); the run that owns the job
  // will record the outcome instead.
  returns: v.boolean(),
  handler: async (
    ctx,
    { jobId, publishedMediaId, mediaIdUnconfirmed, connectionId, runToken },
  ) => {
    const job = await ctx.db.get(jobId);
    if (job === null || job.runToken !== runToken) return false;

    const now = Date.now();
    for (const storageId of job.storageIds) {
      try {
        await ctx.storage.delete(storageId);
      } catch {
        // Already gone is the outcome we wanted anyway.
      }
    }
    await deletePublishFileRows(ctx, jobId);

    await ctx.db.patch(jobId, {
      status: "published",
      ...(publishedMediaId !== undefined ? { publishedMediaId } : {}),
      ...(mediaIdUnconfirmed === true ? { mediaIdUnconfirmed: true } : {}),
      publishedAt: now,
      error: undefined,
      filesDeletedAt: now,
      updatedAt: now,
    });

    if (publishedMediaId !== undefined) {
      const connection = await ctx.db.get(connectionId);
      if (connection?.externalId) {
        await ctx.scheduler.runAfter(0, internal.metaSync.refreshFromWebhook, {
          provider: "meta_ig",
          accountId: connection.externalId,
          mediaId: publishedMediaId,
        });
      }
    }
    return true;
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
    runToken: v.string(),
  },
  // `false` = the run lost the fence token (R1/1); the owner reports the outcome.
  returns: v.boolean(),
  handler: async (ctx, { jobId, message, terminal = false, runToken }) => {
    const job = await ctx.db.get(jobId);
    if (job === null || job.runToken !== runToken) return false;
    if (job.status === "published" || job.status === "canceled") return true;

    const now = Date.now();
    const delay = terminal ? null : retryDelayMs(job.attempts);

    // A failure that interrupted `media_publish` without a verdict from Meta
    // leaves a genuinely unknown outcome, and the message has to say so — a
    // flat "nije uspelo" invites the operator to post it again by hand next to
    // one that may already be live. A `terminal` failure is different: it is
    // Meta's own refusal, so the post demonstrably did not go out.
    const text =
      job.status === "publishing" && !terminal
        ? `${message} Objava je već bila predata Instagramu — proveri profil pre nego što je pošalješ ponovo.`
        : message;

    if (delay === null) {
      await ctx.db.patch(jobId, {
        status: "failed",
        error: text,
        updatedAt: now,
      });
      return true;
    }

    await ctx.db.patch(jobId, {
      status: "queued",
      error: text,
      scheduledFor: now + delay,
      updatedAt: now,
    });
    return true;
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

/** How many stuck jobs one tick unsticks. */
const RECLAIM_BATCH = 10;

/**
 * Every minute: start whatever is due, and unstick whatever is not moving.
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

    await reclaimStuckJobs(ctx, now);

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

/**
 * Give back the jobs whose runs died holding them.
 *
 * `claimJob` writes `uploading` before the first Graph call, and from that
 * moment the row belongs to an action that may stop existing at any point — a
 * gigabyte of video can outlast an action's execution time, an isolate can be
 * killed, a deploy lands mid-run. None of those get to call `markFailure`, so
 * without this the row keeps its status forever: the due-jobs cron only reads
 * `queued`, the sweep left `uploading` alone, and the panel offered the
 * operator neither cancel, nor retry, nor publish.
 *
 * Back to `queued` and the ordinary path takes over. `attempts` is NOT
 * incremented here — `claimJob` already counts every run it hands out, so the
 * count is exactly "runs started" and would be double-counted if this added to
 * it. What this DOES enforce is the ceiling: a run that dies never reaches
 * `markFailure`, so nothing else would ever stop the reclaim → die → reclaim
 * loop.
 *
 * A job that already owns a container comes back with it, and the next pass
 * asks Instagram about that container before creating or publishing anything.
 * That is what keeps this safe for a job that died in `publishing`.
 */
async function reclaimStuckJobs(ctx: MutationCtx, now: number): Promise<void> {
  for (const status of RUNNING_STATUSES) {
    const stuck = await ctx.db
      .query("igPublishJobs")
      .withIndex("by_status_claimed", (q) =>
        q.eq("status", status).lt("claimedAt", now - STALE_AFTER_MS[status]),
      )
      .take(RECLAIM_BATCH);

    for (const job of stuck) {
      if (job.attempts >= MAX_ATTEMPTS) {
        await ctx.db.patch(job._id, {
          status: "failed",
          error:
            status === "publishing"
              ? "Objavljivanje je prekinuto i nije se razrešilo posle svih pokušaja. Objava je možda otišla — proveri profil pre nego što je pošalješ ponovo."
              : "Slanje se prekidalo više puta i nije se završilo. Proveri fajl i pokušaj ponovo.",
          updatedAt: now,
        });
        continue;
      }

      await ctx.db.patch(job._id, {
        status: "queued",
        scheduledFor: now,
        updatedAt: now,
      });
    }
  }
}

/** How many old jobs one sweep looks at. */
const SWEEP_BATCH = 50;

/**
 * Every hour: take back the disk.
 *
 * A published post deletes its own files the moment it succeeds. This is for
 * everything else, and it takes bytes from a job on ONE condition — that the
 * job is over. Anything still able to send those bytes keeps them, however old
 * the row is.
 *
 * The age of a row says nothing about that, which is what made the previous
 * version dangerous: scheduling runs up to 90 days ahead, so a post booked for
 * next Friday is 24 hours old by Saturday and was swept as stale. On Friday it
 * woke up, asked Instagram to fetch a file that no longer existed, failed —
 * and "Pokušaj ponovo" refuses a job whose files are gone, so the scheduled
 * post was simply lost. The `queued`-with-a-future-time rule below is the fix,
 * and everything else here is the rest of the same question asked properly.
 */
export const sweepExpiredUploads = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const cutoff = now - UPLOAD_TTL_MS;

    const old = await ctx.db
      .query("igPublishJobs")
      .withIndex("by_pending_files_created", (q) =>
        q.eq("filesDeletedAt", undefined).lt("createdAt", cutoff),
      )
      .take(SWEEP_BATCH);

    for (const job of old) {
      // 1. A post waiting for a time that has not come is untouchable. This is
      //    the only rule that was actually missing, and the only one that
      //    could destroy something the operator cannot get back.
      if (job.status === "queued" && (job.scheduledFor ?? 0) > now) continue;

      // 2. The other end of the same clock: a post whose moment passed a week
      //    ago and never went out is not waiting for anything. It is closed
      //    with a reason first, and only then loses its bytes — a row that
      //    silently lost its files and still says "na čekanju" is the state
      //    this sweep exists to prevent.
      const due = job.scheduledFor ?? job.createdAt;
      if (isUnfinished(job.status) && now - due > ABANDONED_AFTER_DUE_MS) {
        await ctx.db.patch(job._id, {
          status: "failed",
          error:
            job.status === "publishing"
              ? "Zakazano vreme je prošlo pre više od 7 dana i objavljivanje se nikada nije razrešilo. Objava je možda otišla — proveri profil."
              : "Zakazano vreme je prošlo pre više od 7 dana, a objava nikada nije otišla.",
          updatedAt: now,
        });
        await deleteJobFiles(ctx, job);
        continue;
      }

      // 3. Everything that is genuinely over. `failed` counts: the status is
      //    only ever written once the retry chain has stopped — at the attempt
      //    ceiling or on a refusal that will never change — so a `failed` row
      //    is never waiting on an automatic run. What it may still be waiting
      //    on is a person, and 24 h is how long that offer stands.
      //
      //    A `draft` this old was never submitted; its files are the upload
      //    that the composer started and did not finish.
      if (
        job.status === "failed" ||
        job.status === "canceled" ||
        job.status === "published" ||
        job.status === "draft"
      ) {
        await deleteJobFiles(ctx, job);
      }

      // Anything left — due-and-queued, uploading, processing, publishing —
      // is mid-flight and keeps its bytes. If it is not really moving, the
      // 1-minute reclaim puts it back in the queue long before this matters.
    }

    await sweepOrphanedUploads(ctx, cutoff);
    return null;
  },
});

/**
 * Statuses from which a post could still, in principle, reach the profile.
 *
 * `draft` is not one of them: it was never submitted, so it has no moment that
 * could have passed and nothing to report as abandoned. It is only disk.
 */
function isUnfinished(status: Doc<"igPublishJobs">["status"]): boolean {
  return (
    status === "queued" ||
    status === "uploading" ||
    status === "processing" ||
    status === "publishing"
  );
}

/**
 * The files nobody ever claimed.
 *
 * A receipt older than the TTL means the upload finished and `createJob` never
 * ran — it refused the post, or the tab was closed between the two. Those bytes
 * are referenced by nothing and would otherwise sit on the disk forever.
 */
async function sweepOrphanedUploads(
  ctx: MutationCtx,
  cutoff: number,
): Promise<void> {
  const orphans = await ctx.db
    .query("igPublishUploads")
    .withIndex("by_created", (q) => q.lt("createdAt", cutoff))
    .take(SWEEP_BATCH);

  for (const orphan of orphans) {
    try {
      await ctx.storage.delete(orphan.storageId);
    } catch {
      // Already gone is the outcome we wanted anyway.
    }
    await ctx.db.delete(orphan._id);
  }
}

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
  await deletePublishFileRows(ctx, job._id);

  const now = Date.now();
  await ctx.db.patch(job._id, { filesDeletedAt: now, updatedAt: now });
}

/**
 * Drop the file→job rows for a job whose bytes are gone (R1/5a).
 *
 * Called wherever `storageIds` are deleted — publish success, the 24h sweep,
 * the purge engine — so the /ig-upload/ lookup and the disk stay in step.
 */
export async function deletePublishFileRows(
  ctx: MutationCtx,
  jobId: Id<"igPublishJobs">,
): Promise<void> {
  const rows = await ctx.db
    .query("igPublishFiles")
    .withIndex("by_job", (q) => q.eq("jobId", jobId))
    .collect();
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
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
      // Shared union (P3): a row may now also be "disconnecting".
      status: connectionStatusValidator,
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
